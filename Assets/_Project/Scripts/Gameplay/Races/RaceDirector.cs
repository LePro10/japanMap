using System;
using System.Collections.Generic;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Stunts;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Gameplay.Races
{
    /// <summary>
    /// Runs the events (legacy game/RaceDirector.ts as a state machine): join at a marker, card, a
    /// straight grid, a countdown that holds every car, progress by arc length with checkpoints in
    /// order, rivals on their own lines (<see cref="PathFollower"/>, the driver of the Phase 3
    /// acceptance drives), rescue of a stuck rival, result and Sparks. Rivals are physical cars:
    /// ramming is allowed. PROVISIONAL look: beacon and gate pillars are stand-ins.
    /// </summary>
    [DefaultExecutionOrder(-140)]
    public sealed class RaceDirector : MonoBehaviour
    {
        public enum State { Idle, Card, Countdown, Running, Finished }

        [SerializeField] RaceEventSet set;
        [SerializeField] RoadNetwork roads;
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] DriverInput driver;
        [SerializeField] VehicleRespawn respawn;
        [SerializeField] VehicleFleet fleet;
        [SerializeField] SparksWallet wallet;
        [Tooltip("Saved progress: finishes, medals and personal bests per car and parts.")]
        [SerializeField] PlayerProgress progress;
        [SerializeField] GameplayHud hud;
        [SerializeField] DriftScorer drift;
        [SerializeField] StuntScorer stunts;
        [SerializeField] InputActionAsset actions;
        [Tooltip("Lit material the stand-in beacons and gates are tinted from.")]
        [SerializeField] Material template;
        [Tooltip("Seconds the result sheet stays.")]
        [SerializeField] float resultSeconds = 6f;

        public sealed class Entrant
        {
            public string name;
            public VehicleController car;
            public PathFollower pilot;
            public RaceProgress progress;
            public bool isPlayer;
            public int rescues;
            public float markProgress, markTime;
            /// <summary>Last seconds of driving, for the rescue log (diagnostics).</summary>
            public readonly Queue<string> trace = new();
        }

        public struct Result
        {
            public string eventId;
            public int place;
            public float seconds;
            public float score;
            public int sparks;
            public string medal;
            public bool completed;
            /// <summary>Car the result was driven in (time-trial benchmark, records by car).</summary>
            public string car;
        }

        readonly List<Entrant> _entrants = new();
        readonly List<(Vector3 at, int index)> _markers = new();
        readonly List<GameObject> _beacons = new();
        GameObject _gateA, _gateB;
        RaceEventSet.Event _event;
        RaceTrack _track;
        float _startArc, _timer, _penalty, _offTrack, _driftAtStart;
        int _cardEvent = -1;
        InputAction _use;
        GameObject _traffic;
        VehicleDefinition _ownCar;

        public State Current { get; private set; } = State.Idle;
        /// <summary>Join markers (position, event index) — map pins, travel.</summary>
        public IReadOnlyList<(Vector3 at, int index)> Markers => _markers;
        public RaceEventSet Set => set;
        public RaceEventSet.Event Event => _event;
        public RaceTrack Track => _track;
        public IReadOnlyList<Entrant> Entrants => _entrants;
        public float Elapsed { get; private set; }
        public Result Last { get; private set; }
        /// <summary>Tests and the acceptance drive: the player's car is driven by the AI as well.</summary>
        public bool Autopilot { get; set; }
        public event Action<Result> Finished;
        /// <summary>The result sheet stays until a button is pressed (a rewarded offer is on it).</summary>
        public bool HoldResult { get; set; }
        /// <summary>An event is about to start (id): a test drive or loan ends first (ASTRA §12, events use the own car).</summary>
        public event Action<string> Beginning;

        /// <summary>Nearest event without a medal yet, else the nearest one (Play page, first-goal guide); -1 = none.</summary>
        public int Recommend(Vector3 at, ProgressData data)
        {
            var best = -1;
            var bestD = float.MaxValue;
            foreach (var (pos, index) in _markers)
            {
                var rec = data?.events.Find(x => x.id == set.events[index].id);
                var d = Vector3.Distance(pos, at) + (rec != null && rec.bestTier > 0 ? 5000f : 0f);
                if (d < bestD) { bestD = d; best = index; }
            }
            return best;
        }

        public int Rescues
        {
            get { var n = 0; foreach (var e in _entrants) n += e.rescues; return n; }
        }

        void Awake()
        {
            _use = actions.FindActionMap("Player", true).FindAction("Use", true);
            BuildMarkers();
        }

        void Start()
        {
            // Labels over the beacons (the pins live in the HUD, which may wake after us).
            if (WorldPins.Instance == null) return;
            foreach (var (at, i) in _markers)
            {
                var e = set.events[i];
                var color = e.kind == RaceKind.Drift ? new Color(1f, 0.45f, 0.7f) : e.kind == RaceKind.TimeTrial ? new Color(1f, 0.8f, 0.3f) : new Color(0.3f, 0.85f, 1f);
                _pins.Add(WorldPins.Instance.Add(this, at + Vector3.up * 4f, e.title.ToUpperInvariant(), KindName(e.kind), color));
            }
        }

        void OnEnable()
        {
            _use.Enable();
            _use.performed += OnUse;
            if (hud != null) hud.UsePressed += Use;
            if (respawn != null) respawn.Respawned += OnRespawned;
        }

        void OnDisable()
        {
            _use.performed -= OnUse;
            if (hud != null) hud.UsePressed -= Use;
            if (respawn != null) respawn.Respawned -= OnRespawned;
            if (Current != State.Idle) Cleanup();
        }

        void OnUse(InputAction.CallbackContext _) => Use();

        // ── Track and markers ────────────────────────────────────────────────

        /// <summary>The route of an event: its road, reversed if the event says so.</summary>
        public RaceTrack TrackOf(in RaceEventSet.Event e, out float startArc)
        {
            startArc = 0f;
            foreach (var r in roads.roads)
            {
                if (r.id != e.road) continue;
                var pts = (Vector3[])r.points.Clone();
                if (e.reverse) Array.Reverse(pts);
                var t = new RaceTrack(pts, r.closed, r.width);
                startArc = r.closed ? t.Wrap(e.startOffset) : set.sprintStart + e.startOffset;
                return t;
            }
            return null;
        }

        void BuildMarkers()
        {
            for (var i = 0; i < set.events.Length; i++)
            {
                var t = TrackOf(set.events[i], out var s0);
                if (t == null) continue;
                var p = t.PointAt(s0);
                var right = Right(t.TangentAt(s0));
                var at = p + right * (t.HalfWidth + 3f);
                _markers.Add((at, i));
                var kind = set.events[i].kind;
                var color = kind == RaceKind.Drift ? new Color(1f, 0.45f, 0.7f) : kind == RaceKind.TimeTrial ? new Color(1f, 0.8f, 0.3f) : new Color(0.3f, 0.85f, 1f);
                var b = Pillar($"EventBeacon_{set.events[i].id}", at, 8f, 0.35f, color);
                _beacons.Add(b);
            }
            _gateA = Pillar("Gate_A", Vector3.zero, 6f, 0.4f, new Color(0.35f, 0.9f, 1f));
            _gateB = Pillar("Gate_B", Vector3.zero, 6f, 0.4f, new Color(0.35f, 0.9f, 1f));
            _gateA.SetActive(false);
            _gateB.SetActive(false);
        }

        GameObject Pillar(string name, Vector3 at, float height, float radius, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name;
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(transform, false);
            go.transform.position = at + Vector3.up * height * 0.5f;
            go.transform.localScale = new Vector3(radius * 2f, height * 0.5f, radius * 2f);
            var m = new Material(template) { name = "StandIn_RaceBeacon" };
            m.SetColor("_BaseColor", color);
            m.EnableKeyword("_EMISSION");
            m.SetColor("_EmissionColor", color * 0.8f);
            var mr = go.GetComponent<MeshRenderer>();
            mr.sharedMaterial = m;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        readonly List<object> _pins = new();

        static string KindName(RaceKind k) => k == RaceKind.Drift ? "Drift event" : k == RaceKind.TimeTrial ? "Time trial" : "Race";

        static Vector3 Right(Vector3 tangent) => new(tangent.z, 0f, -tangent.x);

        // ── Join and card ───────────────────────────────────────────────────

        void Update()
        {
            ShowNearBeacons();
            if (hud == null) return;
            switch (Current)
            {
                case State.Idle:
                {
                    var near = NearMarker();
                    hud.SetPrompt(this, near >= 0 ? $"E  Join {set.events[near].title}" : "");
                    _cardEvent = near;
                    break;
                }
                case State.Card:
                    if (NearMarker() != _cardEvent)
                    {
                        hud.HideSheet();
                        Current = State.Idle;
                    }
                    break;
            }
        }

        /// <summary>Beacons are drawn within beaconDistance only (they cost a draw call each from anywhere).</summary>
        void ShowNearBeacons()
        {
            var cam = Camera.main;
            if (cam == null) return;
            var p = cam.transform.position;
            var max = set.beaconDistance * set.beaconDistance;
            for (var i = 0; i < _beacons.Count; i++)
            {
                var at = _markers[i].at;
                var on = Current != State.Countdown && Current != State.Running && (new Vector2(at.x - p.x, at.z - p.z)).sqrMagnitude < max;
                if (_beacons[i].activeSelf != on) _beacons[i].SetActive(on);
                if (i < _pins.Count) WorldPins.Instance?.SetVisible(_pins[i], on);
            }
        }

        int NearMarker()
        {
            var car = player != null && player.Current == PlayerModeController.Mode.Driving ? player.Car : null;
            if (car == null || car.Telemetry.speed * 3.6f > set.joinKmh) return -1;
            var p = car.transform.position;
            var best = -1;
            var bestD = set.joinRadius;
            foreach (var (at, index) in _markers)
            {
                var d = new Vector2(at.x - p.x, at.z - p.z).magnitude;
                if (d < bestD) { bestD = d; best = index; }
            }
            return best;
        }

        /// <summary>Use (E): join shows the card, a second press starts.</summary>
        public void Use()
        {
            if (player != null && player.Suspended) return; // a menu (garage, records, photo) owns E now
            if (hud != null && hud.PromptOwner != (object)this) return;
            if (Current == State.Idle && _cardEvent >= 0) ShowCard(_cardEvent);
            else if (Current == State.Card) StartCard();
        }

        /// <summary>The event card (ASTRA §10): route, length, mode, car, rewards; Start / Back.</summary>
        void ShowCard(int index)
        {
            var e = set.events[index];
            _cardEvent = index;
            CardText(e, out var title, out var body);
            hud.ShowSheet(title, body, ("Start  (E)", StartCard), ("Back", CloseCard));
            hud.SetPrompt(this, "E  Start  ·  drive away to cancel");
            Current = State.Card;
        }

        void StartCard()
        {
            if (Current != State.Card || _cardEvent < 0) return;
            hud.HideSheet();
            Begin(set.events[_cardEvent].id);
        }

        void CloseCard()
        {
            if (Current != State.Card) return;
            hud.HideSheet();
            hud.SetPrompt(this, "");
            Current = State.Idle;
        }

        /// <summary>The car the player would drive this event in: its loan, or the own car.</summary>
        string CardCar(in RaceEventSet.Event e) => !string.IsNullOrEmpty(e.loanCar) ? e.loanCar : player != null && player.Car != null ? player.Car.Definition.id : "";

        string CardCarName(in RaceEventSet.Event e)
        {
            var def = fleet != null ? fleet.Get(CardCar(e)) : null;
            return def != null ? def.displayName : "car";
        }

        void CardText(in RaceEventSet.Event e, out string title, out string body)
        {
            var text = Card(e);
            var nl = text.IndexOf('\n');
            title = e.title;
            body = nl > 0 ? text.Substring(nl + 1) : "";
        }

        string Card(in RaceEventSet.Event e)
        {
            var t = TrackOf(e, out _);
            var km = (t.Closed ? t.Length * Mathf.Max(1, e.laps) : t.Length - set.sprintStart) / 1000f;
            var format = e.kind == RaceKind.Drift ? $"Drift score · {e.medals.x:N0} / {e.medals.y:N0} / {e.medals.z:N0} for bronze, silver, gold · {e.timeLimit:0} s"
                : e.kind == RaceKind.TimeTrial ? $"Time trial · beat {RaceEventSet.Benchmark(e, CardCar(e)):0} s in the {CardCarName(e)}"
                : $"Race · {e.rivals} rivals";
            var laps = t.Closed ? $" · {e.laps} lap{(e.laps > 1 ? "s" : "")}" : "";
            var car = string.IsNullOrEmpty(e.loanCar) ? "" : $"\nLoan car: {fleet.Get(e.loanCar)?.displayName}";
            return $"<b>{e.title}</b>\n{e.blurb}\n{format} · {km:0.0} km{laps}{car}\nFinish: {e.completion} Sparks · up to +{e.bonus}";
        }

        // ── Start ────────────────────────────────────────────────────────────

        /// <summary>Starts event <paramref name="id"/> with the player in their car. False if it cannot start.</summary>
        public bool Begin(string id)
        {
            var found = set.Find(id);
            if (found == null || player == null || player.Current != PlayerModeController.Mode.Driving || player.Car == null) return false;
            Beginning?.Invoke(id);
            if (Current == State.Countdown || Current == State.Running) Cleanup();
            _event = found.Value;
            _track = TrackOf(_event, out _startArc);
            if (_track == null) return false;

            if (!string.IsNullOrEmpty(_event.loanCar) && spawner != null && fleet.Get(_event.loanCar) != null)
            {
                _ownCar = player.Car.Definition;
                spawner.Spawn(fleet.Get(_event.loanCar));
            }

            drift?.Chain.Bank();
            if (drift != null) { drift.PaysSparks = false; _driftAtStart = drift.Chain.Banked; }
            if (stunts != null) stunts.PaysSparks = false;
            var traffic = FindAnyObjectByType<Traffic.TrafficSystem>();
            if (traffic != null) { _traffic = traffic.gameObject; _traffic.SetActive(false); }

            _entrants.Clear();
            var reach = _track.HalfWidth + set.checkpointSlack;
            var rivals = Mathf.Min(_event.kind == RaceKind.Race ? _event.rivals : 0, set.rivals.Length);
            for (var k = 0; k <= rivals; k++)
            {
                var isPlayer = k == rivals; // the player starts at the back of the grid
                var car = isPlayer ? player.Car : SpawnRival(k);
                var e = new Entrant
                {
                    name = isPlayer ? "YOU" : set.rivals[k].name,
                    car = car,
                    isPlayer = isPlayer,
                    progress = new RaceProgress(_track, _startArc, _event.laps, _event.checkpointsPerLap, reach),
                };
                PlaceOnGrid(car, k);
                if (!isPlayer || Autopilot)
                {
                    var r = isPlayer ? new RaceEventSet.Rival { gripShare = 0.55f, maxKmh = 170f, lookAheadSeconds = 0.5f } : set.rivals[k];
                    e.pilot = car.gameObject.AddComponent<PathFollower>();
                    e.pilot.gripShare = r.gripShare;
                    e.pilot.maxSpeedKmh = r.maxKmh;
                    e.pilot.lookAheadSeconds = r.lookAheadSeconds;
                    // A narrow pass leaves no room for lanes: the offset is a share of the width beyond one car.
                    var line = _track.Line(r.lane * Mathf.Max(0f, _track.HalfWidth - 2.4f) * 2f);
                    e.pilot.Begin(car, line, _track.Closed, NearestIndex(line, car.transform.position));
                    if (isPlayer && driver != null) driver.Vehicle = null;
                }
                car.HoldStill = true;
                _entrants.Add(e);
            }
            _penalty = _offTrack = 0f;
            _lastPassed = -1;
            Elapsed = 0f;
            _timer = set.countdown;
            Current = State.Countdown;
            if (progress != null && progress.Data != null) { progress.Data.Event(id).runs++; progress.MarkDirty(); }
            ShowGates();
            Audio.Sfx.Play("Countdown_Tick");
            hud?.SetPrompt(this, "");
            if (hud != null) hud.HoldNotices = true; // region/discovery notices wait for the result (ASTRA §10)
            return true;
        }

        VehicleController SpawnRival(int k)
        {
            var def = fleet.Get(_event.rivalCar) ?? fleet.Default;
            var car = PlayerCarSpawner.Build(def, fleet.tuning, fleet.effects);
            car.name = $"Rival_{set.rivals[k].name}";
            Tint(car.gameObject, set.rivals[k].paint);
            return car;
        }

        /// <summary>Paint the rival's body (the car-lab "*_paint" material) so they read apart at 150 m.</summary>
        static void Tint(GameObject car, Color paint)
        {
            var block = new MaterialPropertyBlock();
            foreach (var r in car.GetComponentsInChildren<MeshRenderer>())
            {
                var mats = r.sharedMaterials;
                for (var i = 0; i < mats.Length; i++)
                {
                    if (mats[i] == null || !mats[i].name.EndsWith("_paint")) continue;
                    r.GetPropertyBlock(block, i);
                    block.SetColor("baseColorFactor", paint); // glTF shader graphs
                    block.SetColor("_BaseColor", paint);
                    r.SetPropertyBlock(block, i);
                }
            }
        }

        void PlaceOnGrid(VehicleController car, int slot)
        {
            var row = slot / 2;
            var col = slot % 2;
            var arc = _startArc - set.gridFirst - row * set.gridRow;
            var t = _track.TangentAt(arc);
            var lateral = (col == 0 ? -1f : 1f) * Mathf.Min(2.4f, _track.HalfWidth * 0.5f);
            var p = _track.PointAt(arc) + Right(t) * lateral;
            // Straight on the grid: every car faces the track direction at its slot.
            car.Place(p, Mathf.Atan2(t.x, t.z) * Mathf.Rad2Deg, fromAbove: 3f);
        }

        static int NearestIndex(Vector3[] line, Vector3 p)
        {
            var best = 0;
            var bestD = float.PositiveInfinity;
            for (var i = 0; i < line.Length; i++)
            {
                var d = (line[i] - p).sqrMagnitude;
                if (d < bestD) { bestD = d; best = i; }
            }
            // The segment that starts behind the car.
            return Mathf.Max(0, best - 1);
        }

        // ── Running ──────────────────────────────────────────────────────────

        void FixedUpdate()
        {
            if (Current == State.Countdown)
            {
                var before = Mathf.CeilToInt(_timer);
                _timer -= Time.fixedDeltaTime;
                var now = Mathf.CeilToInt(_timer);
                if (now != before) Audio.Sfx.Play(now > 0 ? "Countdown_Tick" : "Countdown_Go");
                hud?.SetCountdown(_timer > 0f ? now.ToString() : "GO");
                foreach (var e in _entrants) e.progress.Update(e.car.transform.position, 0f);
                if (_timer <= 0f)
                {
                    foreach (var e in _entrants) e.car.HoldStill = false;
                    Current = State.Running;
                    _timer = 0.8f; // GO stays a moment
                }
                UpdateInfo();
                return;
            }
            if (Current == State.Finished)
            {
                if (HoldResult) return; // an offer on the sheet waits for the player's choice
                _timer -= Time.fixedDeltaTime;
                if (_timer <= 0f) Cleanup();
                return;
            }
            if (Current != State.Running) return;

            if (_timer > 0f) { _timer -= Time.fixedDeltaTime; if (_timer <= 0f) hud?.SetCountdown(""); }
            Elapsed += Time.fixedDeltaTime;
            Entrant me = null;
            foreach (var e in _entrants)
            {
                if (e.car == null) continue;
                var time = Elapsed + (e.isPlayer ? _penalty : 0f);
                var was = e.progress.Finished;
                e.progress.Update(e.car.transform.position, time);
                if (e.isPlayer) me = e;
                if (!was && e.progress.Finished && e.pilot != null && !e.isPlayer) e.pilot.maxSpeedKmh = 60f; // cruise after the line
                if (e.pilot != null && !e.progress.Finished)
                {
                    if (Mathf.Repeat(Elapsed, 0.5f) < Time.fixedDeltaTime)
                    {
                        var c = e.car;
                        e.trace.Enqueue($"t{Elapsed:0.0} s{e.progress.Progress:0} v{c.Telemetry.speed * 3.6f:0}/{e.pilot.TargetSpeed * 3.6f:0} off{e.pilot.Offset:0.0} in(t{c.Input.throttle:0.0} b{c.Input.brake:0.0} s{c.Input.steer:0.0}) slope{c.transform.forward.y:0.00} air{c.Telemetry.airborne}");
                        while (e.trace.Count > 16) e.trace.Dequeue();
                    }
                    Watch(e);
                    KeepGap(e);
                }
            }

            if (me == null || player.Car != me.car || player.Current != PlayerModeController.Mode.Driving)
            {
                Abort("left the car");
                return;
            }
            var arcPoint = _track.PointAt(me.progress.Arc);
            _offTrack = new Vector2(arcPoint.x - me.car.transform.position.x, arcPoint.z - me.car.transform.position.z).magnitude > set.abortDistance
                ? _offTrack + Time.fixedDeltaTime : 0f;
            if (_offTrack > set.abortSeconds)
            {
                Abort("left the route");
                return;
            }
            if (_event.kind == RaceKind.Drift && _event.timeLimit > 0f && Elapsed + _penalty > _event.timeLimit)
            {
                Finish(me, timedOut: true);
                return;
            }
            if (me.progress.Finished) Finish(me, timedOut: false);
            UpdateInfo();
            ShowGates();
        }

        /// <summary>Rescue an AI car that made less than rescueMetres of way in rescueSeconds (legacy RivalField RESCUE).</summary>
        void Watch(Entrant e)
        {
            if (Elapsed - e.markTime < set.rescueSeconds) return;
            if (e.progress.Progress - e.markProgress < set.rescueMetres)
            {
                var arc = e.progress.Arc;
                var t = _track.TangentAt(arc);
                Debug.Log($"[Race] stuck {e.name}: " + string.Join(" | ", e.trace));
                e.car.Place(_track.PointAt(arc) + Vector3.up * 0.5f, Mathf.Atan2(t.x, t.z) * Mathf.Rad2Deg, fromAbove: 3f);
                e.pilot.Begin(e.car, e.pilot.path, _track.Closed, NearestIndex(e.pilot.path, e.car.transform.position));
                e.rescues++;
                Debug.Log($"[Race] rescued {e.name} at {arc:0} m of {_track.Length:0} ({e.car.transform.position:F0})\n    " + string.Join("\n    ", e.trace));
            }
            e.markProgress = e.progress.Progress;
            e.markTime = Elapsed;
        }

        /// <summary>
        /// An AI car closing on another car just ahead in its lane takes that car's speed instead of
        /// driving into it (the pass start had four cars in one hairpin). Overtaking happens where there is
        /// room: a car beside it does not count.
        /// </summary>
        void KeepGap(Entrant e)
        {
            var cap = e.isPlayer ? 170f : RivalOf(e).maxKmh;
            var fwd = e.car.transform.forward;
            var p = e.car.transform.position;
            foreach (var o in _entrants)
            {
                if (o == e || o.car == null) continue;
                var d = o.car.transform.position - p;
                var along = Vector3.Dot(d, fwd);
                var across = Mathf.Abs(Vector3.Dot(d, e.car.transform.right));
                if (along < 2f || along > set.followGap || across > 2.2f) continue;
                // Close in gently: the leader's speed plus a little, less when very close.
                var lead = o.car.Telemetry.speed * 3.6f + 6f * (along - 6f) / (set.followGap - 6f);
                cap = Mathf.Min(cap, Mathf.Max(15f, lead));
            }
            e.pilot.maxSpeedKmh = cap;
        }

        RaceEventSet.Rival RivalOf(Entrant e)
        {
            foreach (var r in set.rivals) if (r.name == e.name) return r;
            return set.rivals[0];
        }

        /// <summary>R in an event: back onto the route behind the car, +3 s (ASTRA §5).</summary>
        void OnRespawned()
        {
            if (Current != State.Running || player.Car == null) return;
            var me = _entrants.Find(e => e.isPlayer);
            if (me == null) return;
            var arc = me.progress.Arc - 5f;
            var t = _track.TangentAt(arc);
            player.Car.Place(_track.PointAt(arc), Mathf.Atan2(t.x, t.z) * Mathf.Rad2Deg, fromAbove: 3f);
            _penalty += set.recoverPenalty;
            hud?.Flash($"Recovered · +{set.recoverPenalty:0} s");
        }

        void ShowGates()
        {
            var me = _entrants.Find(e => e.isPlayer);
            if (me == null || me.progress.Passed >= me.progress.TotalCheckpoints || Current == State.Finished)
            {
                _gateA.SetActive(false);
                _gateB.SetActive(false);
                return;
            }
            var k = me.progress.Passed;
            var p = me.progress.CheckpointPoint(k);
            var t = _track.TangentAt(me.progress.CheckpointProgress(k) + _startArc);
            var side = Right(t) * (_track.HalfWidth + 1f);
            _gateA.SetActive(true);
            _gateB.SetActive(true);
            _gateA.transform.position = p + side + Vector3.up * 3f;
            _gateB.transform.position = p - side + Vector3.up * 3f;
        }

        public int PlaceOf(Entrant who)
        {
            var place = 1;
            foreach (var e in _entrants) if (e != who && e.progress.IsAheadOf(who.progress)) place++;
            return place;
        }

        void UpdateInfo()
        {
            var me = _entrants.Find(e => e.isPlayer);
            if (me == null || hud == null) return;
            var lines = new List<string>();
            if (_event.kind == RaceKind.Race) lines.Add($"POS {PlaceOf(me)}/{_entrants.Count}");
            if (_track.Closed) lines.Add($"LAP {Mathf.Min(me.progress.Laps + 1, _event.laps)}/{_event.laps}");
            lines.Add(Clock(Elapsed + _penalty));
            if (_event.kind == RaceKind.Drift && drift != null)
                lines.Add($"SCORE {drift.Chain.Banked - _driftAtStart + drift.Chain.Pending:N0}");
            var k = me.progress.Passed;
            if (k < me.progress.TotalCheckpoints)
            {
                var p = me.progress.CheckpointPoint(k);
                var d = new Vector2(p.x - me.car.transform.position.x, p.z - me.car.transform.position.z).magnitude;
                lines.Add($"CHECKPOINT {d:0} m");
                hud.SetTarget(p);
                if (k != _lastPassed) { if (_lastPassed >= 0 && Current == State.Running) Audio.Sfx.Play("Bell_Checkpoint"); _lastPassed = k; }
            }
            hud.SetRaceInfo(string.Join("\n", lines));
        }

        int _lastPassed = -1;

        static string Clock(float s) => $"{Mathf.FloorToInt(s / 60f)}:{s % 60f:00.0}";

        // ── Finish ───────────────────────────────────────────────────────────

        void Finish(Entrant me, bool timedOut)
        {
            var result = new Result { eventId = _event.id, seconds = me.progress.Finished ? me.progress.FinishTime : Elapsed + _penalty, completed = !timedOut, car = me.car.Definition.id };
            if (drift != null) drift.Chain.Bank();
            var sparks = 0;
            var medal = "";
            switch (_event.kind)
            {
                case RaceKind.Race:
                {
                    result.place = PlaceOf(me);
                    // ASTRA §8: 100 / 65 / 35 / 0 % of the bonus for first to fourth.
                    var share = result.place == 1 ? 1f : result.place == 2 ? 0.65f : result.place == 3 ? 0.35f : 0f;
                    sparks = _event.completion + Mathf.RoundToInt(_event.bonus * share);
                    medal = result.place switch { 1 => "1st", 2 => "2nd", 3 => "3rd", _ => $"{result.place}th" };
                    break;
                }
                case RaceKind.TimeTrial:
                {
                    result.place = 1;
                    var bench = RaceEventSet.Benchmark(_event, me.car.Definition.id);
                    var bonus = result.seconds <= bench ? _event.bonus : result.seconds <= bench * 1.1f ? _event.bonus / 2 : 0;
                    sparks = _event.completion + bonus;
                    medal = bonus == _event.bonus ? "Benchmark beaten" : bonus > 0 ? "Within 10 %" : "Finished";
                    break;
                }
                case RaceKind.Drift:
                {
                    result.place = 1;
                    result.score = drift != null ? drift.Chain.Banked - _driftAtStart : 0f;
                    var tier = result.score >= _event.medals.z ? 3 : result.score >= _event.medals.y ? 2 : result.score >= _event.medals.x ? 1 : 0;
                    medal = timedOut ? "Out of time" : tier switch { 3 => "Gold", 2 => "Silver", 1 => "Bronze", _ => "No medal" };
                    sparks = timedOut ? 0 : _event.completion + _event.bonus * tier / 3;
                    break;
                }
            }
            result.sparks = sparks;
            result.medal = medal;
            // CrazyGames' "happy time" (confetti around the frame) for a real achievement only, used sparingly.
            var won = !timedOut && (_event.kind == RaceKind.Race ? result.place == 1 : medal == "Benchmark beaten" || medal == "Gold");
            if (won) Core.Platform.GamePlatform.Current?.HappyTime();
            Last = result;
            if (wallet != null && sparks > 0) wallet.Add(sparks, _event.title);
            var best = Record(me, result, timedOut);
            var score = _event.kind == RaceKind.Drift ? $" · {result.score:N0} points" : "";
            var id = _event.id;
            var medalTier = _event.kind == RaceKind.Race ? (result.place == 1 ? 3 : result.place == 2 ? 2 : result.place == 3 ? 1 : 0)
                : _event.kind == RaceKind.Drift ? (medal == "Gold" ? 3 : medal == "Silver" ? 2 : medal == "Bronze" ? 1 : 0)
                : medal == "Benchmark beaten" ? 3 : medal == "Within 10 %" ? 2 : timedOut ? 0 : 1;
            var main = _event.kind == RaceKind.Drift ? $"{result.score:N0} pts" : Clock(result.seconds);
            hud?.ShowResult(_event.title, medal, medalTier, main, sparks, $"{medal} · {Clock(result.seconds)}{score}{best}\n+{sparks} Sparks",
                // Leaving the result is a real break: a midgame ad may come first (D42), never during the run.
                ("Free drive", () => { _timer = 0f; Cleanup(); Economy.RewardedOffers.Break(null); }),
                ("Retry", () => { Cleanup(); Economy.RewardedOffers.Break(() => Begin(id)); }));
            hud?.SetRaceInfo("");
            hud?.SetTarget(null);
            Audio.Sfx.Play(result.place == 1 && _event.kind == RaceKind.Race ? "Bell_Win" : "Bell_Finish");
            Current = State.Finished;
            _timer = resultSeconds;
            if (me.pilot == null) me.car.Input = new DriveInput { brake = 0.4f };
            Debug.Log($"[Race] {_event.id} finished: {medal}, {result.seconds:0.0} s, {sparks} Sparks, rescues {Rescues}");
            Finished?.Invoke(result);
            ShowGates();
        }

        /// <summary>Medal tier of a result: race 1st/2nd/3rd = 3/2/1; time trial beaten = 3, within 10 % = 1; drift as scored.</summary>
        public static int Tier(RaceEventSet.Event e, Result r, bool timedOut)
        {
            if (!r.completed || timedOut) return 0;
            return e.kind switch
            {
                RaceKind.Race => r.place >= 1 && r.place <= 3 ? 4 - r.place : 0,
                RaceKind.TimeTrial => r.seconds <= RaceEventSet.Benchmark(e, r.car) ? 3 : r.seconds <= RaceEventSet.Benchmark(e, r.car) * 1.1f ? 1 : 0,
                _ => r.score >= e.medals.z ? 3 : r.score >= e.medals.y ? 2 : r.score >= e.medals.x ? 1 : 0,
            };
        }

        /// <summary>
        /// Saves the event result (ASTRA §9): finishes, best medal, personal best per car and fitted parts, and pays
        /// the first bronze-or-better once (claim medal:id). Returns the " · New best" line for the result sheet.
        /// </summary>
        string Record(Entrant me, Result result, bool timedOut)
        {
            if (progress == null || progress.Data == null || !result.completed) return "";
            var rec = progress.Data.Event(_event.id);
            rec.finishes++;
            var tier = Tier(_event, result, timedOut);
            rec.bestTier = Mathf.Max(rec.bestTier, tier);
            var carId = me.car.Definition.id;
            var tune = progress.Owns(carId) ? progress.Car(carId).tune.Code : "loan";
            BestEntry entry = null;
            foreach (var b in rec.bests) if (b.car == carId && b.tune == tune && b.balance == ProgressData.CurrentBalance) entry = b;
            var isDrift = _event.kind == RaceKind.Drift;
            var better = entry == null || (isDrift ? result.score > entry.score : result.seconds < entry.seconds);
            if (entry == null)
            {
                entry = new BestEntry { car = carId, tune = tune, balance = ProgressData.CurrentBalance };
                rec.bests.Add(entry);
            }
            if (better)
            {
                entry.seconds = result.seconds;
                entry.score = result.score;
            }
            var records = progress.Data.records;
            records.races++;
            if (_event.kind == RaceKind.Race && result.place == 1) records.wins++;
            progress.MarkDirty();
            if (tier > 0 && wallet != null) progress.Grant($"medal:{_event.id}", wallet.Settings.firstMedalReward, $"{_event.title} · first medal");
            progress.Flush();
            return better ? " · New best" : "";
        }

        public void Abort(string why)
        {
            if (Current == State.Idle) return;
            Last = new Result { eventId = _event.id, completed = false };
            hud?.Flash($"{_event.title} abandoned · {why}");
            Debug.Log($"[Race] {_event.id} aborted: {why}");
            Cleanup();
        }

        void Cleanup()
        {
            foreach (var e in _entrants)
            {
                if (e.car == null) continue;
                e.car.HoldStill = false;
                if (e.pilot != null) Destroy(e.pilot);
                if (!e.isPlayer) Destroy(e.car.gameObject);
            }
            _entrants.Clear();
            if (driver != null && player != null && player.Car != null) driver.Vehicle = player.Car;
            if (_ownCar != null && spawner != null)
            {
                var at = player.Car.transform;
                var pos = at.position;
                var yaw = at.eulerAngles.y;
                spawner.Spawn(_ownCar);
                player.Car.Place(pos, yaw, fromAbove: 3f);
                _ownCar = null;
            }
            if (_traffic != null) _traffic.SetActive(true);
            _traffic = null;
            if (drift != null) drift.PaysSparks = true;
            if (stunts != null) stunts.PaysSparks = true;
            hud?.SetRaceInfo("");
            hud?.SetCountdown("");
            hud?.HideSheet();
            hud?.SetTarget(null);
            if (hud != null) hud.HoldNotices = false;
            _gateA.SetActive(false);
            _gateB.SetActive(false);
            HoldResult = false;
            Current = State.Idle;
        }
    }
}
