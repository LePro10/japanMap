using System;
using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Races;
using JapanMap.UI;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Map
{
    /// <summary>
    /// Auto-drive to the waypoint (D49, as in Forza Horizon 6): the car follows the navigation route on its own — through the
    /// real car physics, the same <see cref="DriveInput"/> a player gives (<see cref="PathFollower"/>), in the left lane,
    /// braking for bends and for anything ahead, pulling out past a car that will not move — while the
    /// <see cref="CinematicCamera"/> cuts between shots behind letterbox bars with the HUD gone. Steering, throttle or brake
    /// hands control back at once. Hold G / d-pad right, the touch AUTO button, or "Auto-drive" on the map; never in a race.
    /// Stuck: reverses out (PathFollower), then sets the car back onto the route; off the route: plans again.
    /// </summary>
    [DefaultExecutionOrder(-140)] // after DriverInput and PathFollower wrote the input, before the car simulates
    public sealed class AutoDriver : MonoBehaviour, IAutoDrive
    {
        AutoDriveSettings _s;
        PlayerModeController _player;
        MapSystem _map;
        GameplayHud _hud;
        CarCameraRig _rig;
        VehicleController _car;
        PathFollower _pilot;
        readonly List<Vector3> _raw = new();
        readonly List<float> _widths = new();
        readonly List<Crossing> _crossings = new();
        readonly List<float> _limits = new();
        readonly List<Vector3> _path = new();
        float _offFor, _progressAt, _progressTime, _arrivedFor, _waitFor, _passFor, _laneOffset, _bars;
        bool _armed, _hidHud;
        Vector2 _goal;
        static readonly RaycastHit[] Hits = new RaycastHit[8];
        int _mask;

        UIDocument _doc;
        VisualElement _top, _bottom, _info, _prompt;
        Label _tag, _distance, _help, _promptKey;

        public bool IsActive { get; private set; }
        public bool HasDestination => _map != null && _map.Waypoint.HasValue;
        public event Action<bool> ActiveChanged;
        public event Action Arrived;

        /// <summary>The car under auto-drive's pilot (tests: route length, offset).</summary>
        public PathFollower Pilot => _pilot;
        /// <summary>The planned route with lane offset, start to waypoint.</summary>
        public IReadOnlyList<Vector3> Route => _path;
        /// <summary>Times the route was planned again since the start (off the route, stuck).</summary>
        public int Replans { get; private set; }
        /// <summary>Times the car was set back onto the route.</summary>
        public int Recoveries { get; private set; }
        /// <summary>Why the last start was refused ("" = it started).</summary>
        public string Refusal { get; private set; } = "";
        /// <summary>Why it last handed control back (tests, diagnostics).</summary>
        public string LastStop { get; private set; } = "";
        public static AutoDriver Instance { get; private set; }
        /// <summary>Driving itself with the cinematic picture on screen (the route tape and the HUD stay out of it).</summary>
        public bool Cinematic => IsActive && _rig != null && _rig.Cinematic != null && _rig.Cinematic.Showing;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = null;

        public void Bind(AutoDriveSettings settings, PlayerModeController player, MapSystem map, GameplayHud hud, PanelSettings panel)
        {
            _s = settings;
            _player = player;
            _map = map;
            _hud = hud;
            _mask = LayerMask.GetMask(GameLayers.Vehicle, GameLayers.Walker, GameLayers.Pedestrian);
            Instance = this;
            AutoDrive.Current = this;
            var host = new GameObject("AutoDriveUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panel);
            _doc.sortingOrder = -1; // under the touch controls: the take-over pad stays on top of the bars
            Build();
            UiPanel.Changed += Build;
            if (_player != null && _player.Driver != null)
            {
                _player.Driver.AutoDriveHeld += OnHeld;
                _player.Driver.AutoDriveDown += OnDown;
            }
            if (_player != null) _player.ModeChanged += OnMode;
        }

        void OnDestroy()
        {
            UiPanel.Changed -= Build;
            if (_player != null && _player.Driver != null)
            {
                _player.Driver.AutoDriveHeld -= OnHeld;
                _player.Driver.AutoDriveDown -= OnDown;
            }
            if (_player != null) _player.ModeChanged -= OnMode;
            if (ReferenceEquals(AutoDrive.Current, this)) AutoDrive.Current = null;
            if (Instance == this) Instance = null;
        }

        void OnHeld()
        {
            if (!IsActive) SetActive(true);
        }

        // A tap of the key while driving itself: control back at once (no hold needed to stop).
        void OnDown()
        {
            if (IsActive) Stop("You have control");
        }

        void OnMode(PlayerModeController.Mode m)
        {
            if (m != PlayerModeController.Mode.Driving && IsActive) Stop("");
        }

        public void SetActive(bool on)
        {
            if (on == IsActive) return;
            if (!on) { Stop("You have control"); return; }
            if (!CanStart(out var why))
            {
                Refusal = why;
                if (_hud != null && why != "") _hud.ShowToast(why);
                return;
            }
            Refusal = "";
            Begin();
        }

        bool Racing()
        {
            var races = _map != null ? _map.Races : null;
            return races != null && races.Current is RaceDirector.State.Card or RaceDirector.State.Countdown or RaceDirector.State.Running;
        }

        bool CanStart(out string why)
        {
            why = "";
            if (!Unlocks.IsUnlocked(FeatureId.AutoDrive)) { why = Unlocks.Hint(FeatureId.AutoDrive); return false; }
            if (_player == null || _player.Current != PlayerModeController.Mode.Driving || _player.Car == null) { why = "Get in your car first"; return false; }
            if (StartFlow.Holding) return false;
            if (Racing()) { why = "Not during an event"; return false; }
            if (!HasDestination) { why = "Set a waypoint on the map first"; return false; }
            return true;
        }

        void Begin()
        {
            _car = _player.Car;
            _goal = _map.Waypoint.Value;
            if (!Plan()) { Refusal = "No road leads there"; if (_hud != null) _hud.ShowToast(Refusal); return; }
            IsActive = true;
            _armed = false;
            _arrivedFor = _waitFor = _passFor = _offFor = 0f;
            Replans = Recoveries = 0;
            if (_rig == null) _rig = FindAnyObjectByType<CarCameraRig>();
            if (_rig != null && _rig.Cinematic != null) _rig.Cinematic.Begin(_car, d => _pilot != null ? _pilot.Ahead(d) : _car.transform.position);
            ActiveChanged?.Invoke(true);
        }

        void Stop(string message)
        {
            if (!IsActive) return;
            IsActive = false;
            LastStop = message == "" ? "(silent)" : message;
            if (_pilot != null)
            {
                _pilot.enabled = false;
                _pilot.speedCap = float.PositiveInfinity;
            }
            if (_rig != null && _rig.Cinematic != null) _rig.Cinematic.End();
            if (_hidHud && _hud != null && (GameMenu.Instance == null || !GameMenu.Instance.IsOpen)) _hud.Hidden = false;
            _hidHud = false;
            if (_hud != null && message != "") _hud.ShowToast(message);
            ActiveChanged?.Invoke(false);
        }

        /// <summary>Plans the route from the car to the waypoint: road graph, re-laid evenly, smoothed, shifted into the left lane.</summary>
        bool Plan()
        {
            var guide = RouteGuide.Instance;
            var graph = guide != null ? guide.Graph : new RouteGraph(_map.Roads);
            var from = _car.transform.position;
            var to = new Vector3(_goal.x, from.y, _goal.y);
            if (graph == null || !graph.Find(from, to, _raw, _widths, _crossings)) return false;
            Relay();
            if (_path.Count < 2) return false;
            if (_pilot == null || _pilot.car != _car)
            {
                if (_pilot != null) Destroy(_pilot);
                if (!_car.TryGetComponent(out _pilot)) _pilot = _car.gameObject.AddComponent<PathFollower>();
            }
            _pilot.maxSpeedKmh = _s.maxSpeedKmh;
            _pilot.gripShare = _s.gripShare;
            _pilot.braking = _s.braking;
            _pilot.lookAheadMin = _s.lookAheadMin;
            _pilot.lookAheadSeconds = _s.lookAheadSeconds;
            _pilot.stopAtEnd = true;
            _pilot.slowForHeading = true;
            _pilot.lateral = 0f;
            _pilot.speedCap = float.PositiveInfinity;
            _pilot.Begin(_car, _path.ToArray(), false);
            _pilot.pointLimit = _limits.ToArray();
            _pilot.enabled = true;
            _progressAt = 0f;
            _progressTime = Time.time;
            return true;
        }

        void Relay()
        {
            _path.Clear();
            var lanes = new List<float>();
            var cross = new List<Crossing>();
            // Even spacing: the graph's nodes jump at crossings; even points smooth evenly.
            var carry = 0f;
            _path.Add(_raw[0]);
            lanes.Add(Lane(_widths[0]));
            cross.Add(_crossings[0]);
            for (var i = 1; i < _raw.Count; i++)
            {
                var a = _raw[i - 1];
                var b = _raw[i];
                var len = Vector3.Distance(a, b);
                var t = _s.spacing - carry;
                var first = true;
                while (t <= len)
                {
                    _path.Add(Vector3.Lerp(a, b, t / len));
                    lanes.Add(Lane(_widths[i]));
                    // The crossing node itself lands between two even points: mark the first one after it.
                    var k = Crossing.None;
                    if (first) k = _crossings[i - 1];
                    if (t + _s.spacing > len && _crossings[i] > k) k = _crossings[i];
                    cross.Add(k);
                    first = false;
                    t += _s.spacing;
                }
                carry = len - (t - _s.spacing);
            }
            if (Vector3.Distance(_path[^1], _raw[^1]) > 0.5f) { _path.Add(_raw[^1]); lanes.Add(0f); cross.Add(Crossing.None); }
            // Distance to the nearest crossing along the route, both ways (m): any crossing for the lane, a stepped one for the pace.
            // Only stepped crossings take the car to the middle: easing out of the lane at every side street made S-bends
            // the planner slowed to 70 km/h for, on a straight.
            var step = Near(cross, Crossing.Step);
            var near = step;
            _limits.Clear();
            for (var i = 0; i < _path.Count; i++) _limits.Add(step[i] <= _s.crossingReach * 0.5f ? _s.crossingKmh / 3.6f : float.PositiveInfinity);
            // One pass of a [¼ ½ ¼] filter takes the kink out of crossings without cutting the corner (more passes
            // pulled the line inside, onto the kerb and into the corner building).
            for (var pass = 0; pass < 1; pass++)
                for (var i = 1; i < _path.Count - 1; i++)
                    _path[i] = _path[i - 1] * 0.25f + _path[i] * 0.5f + _path[i + 1] * 0.25f;
            // Into the left lane, not across the last metres (the waypoint is where it is), and back towards the middle in
            // tight corners: a left turn in the left lane is the inside line, and the steering cuts it by another 2–3 m —
            // together off the tarmac (the first corner out of the Commons, onto the grass and into the sign).
            var shifted = new Vector3[_path.Count];
            for (var i = 0; i < _path.Count; i++)
            {
                var d = _path[Mathf.Min(i + 1, _path.Count - 1)] - _path[Mathf.Max(i - 1, 0)];
                d.y = 0f;
                var left = d.sqrMagnitude > 1e-4f ? new Vector3(-d.z, 0f, d.x).normalized : Vector3.zero;
                var fade = Mathf.Clamp01(Mathf.Min(i, _path.Count - 1 - i) / 4f);
                // Into the middle at crossings: the other road's kerb or embankment stands in the lane there (hill-steps-west
                // lies 1–2 m above west-works-03-2 beside the junction — the left lane ran into it at 90 km/h).
                fade *= Mathf.Clamp01((near[i] - 3f) / Mathf.Max(1f, _s.crossingReach));
                var turn = Turn(i, 4);
                fade *= Mathf.Clamp01(1f - (turn - _s.cornerStart) / Mathf.Max(1f, _s.cornerFull - _s.cornerStart));
                shifted[i] = _path[i] + left * (lanes[i] * fade);
            }
            _path.Clear();
            _path.AddRange(shifted);
        }

        /// <summary>Metres along the route from each point to the nearest point of at least <paramref name="kind"/>.</summary>
        float[] Near(List<Crossing> cross, Crossing kind)
        {
            var near = new float[cross.Count];
            var last = float.PositiveInfinity;
            for (var i = 0; i < cross.Count; i++) { last = cross[i] >= kind ? 0f : last + _s.spacing; near[i] = last; }
            last = float.PositiveInfinity;
            for (var i = cross.Count - 1; i >= 0; i--) { last = cross[i] >= kind ? 0f : last + _s.spacing; near[i] = Mathf.Min(near[i], last); }
            return near;
        }

        /// <summary>How much the route turns (degrees, either way) within <paramref name="reach"/> points around point <paramref name="i"/>.</summary>
        float Turn(int i, int reach)
        {
            var max = 0f;
            var a = _path[Mathf.Max(0, i - reach)];
            var b = _path[i];
            var c = _path[Mathf.Min(_path.Count - 1, i + reach)];
            var u = new Vector2(b.x - a.x, b.z - a.z);
            var v = new Vector2(c.x - b.x, c.z - b.z);
            if (u.sqrMagnitude > 0.01f && v.sqrMagnitude > 0.01f) max = Mathf.Abs(Vector2.SignedAngle(u, v));
            return max;
        }

        float Lane(float width) => width >= _s.minLaneWidth ? Mathf.Min(width * _s.laneShare, 2.2f) : 0f;

        void FixedUpdate()
        {
            if (!IsActive) return;
            if (_car == null || _player.Car != _car || _pilot == null) { Stop(""); return; }
            if (Racing()) { Stop("Auto-drive off: event"); return; }

            // Take over: the player's own steering or pedals — once they were let go after the start.
            var raw = _player.Driver != null ? _player.Driver.Raw : default;
            var neutral = Mathf.Abs(raw.steer) < 0.05f && raw.throttle < 0.05f && raw.brake < 0.05f && !raw.handbrake;
            if (neutral) _armed = true;
            else if (_armed && (Mathf.Abs(raw.steer) > _s.takeoverSteer || raw.throttle > _s.takeoverPedal || raw.brake > _s.takeoverPedal || raw.handbrake))
            {
                Stop("You have control");
                _car.Input = raw; // this step already the player's
                return;
            }

            Traffic();
            Watch();
        }

        /// <summary>Brake for anything ahead (cars, the walker, pedestrians); waiting long behind one, pull out to the right.</summary>
        void Traffic()
        {
            var speed = _car.Telemetry.speed;
            var fwd = _car.transform.forward;
            var gap = _s.gapBase + speed * _s.gapSeconds;
            var half = _car.Definition.bodySize.x * 0.5f;
            var from = _car.transform.position + Vector3.up * 0.8f + fwd * (half - 0.5f);
            var n = Physics.SphereCastNonAlloc(from, 0.9f, fwd, Hits, gap + 10f, _mask, QueryTriggerInteraction.Collide);
            var cap = float.PositiveInfinity;
            for (var i = 0; i < n; i++)
            {
                var body = Hits[i].collider.attachedRigidbody;
                if (body == _car.Body) continue;
                // Follow it: its speed along ours, plus what the gap allows.
                var theirs = body != null ? Mathf.Max(0f, Vector3.Dot(body.linearVelocity, fwd)) : 0f;
                var want = _s.gapBase + theirs * _s.gapSeconds;
                cap = Mathf.Min(cap, Mathf.Max(0f, theirs + (Hits[i].distance - want) * 0.6f));
            }
            _pilot.speedCap = cap;
            var blocked = cap < 2f && speed < 2f;
            _waitFor = blocked ? _waitFor + Time.fixedDeltaTime : 0f;
            if (_waitFor > _s.passAfter && _passFor <= 0f)
            {
                _passFor = 6f; // pull out into the other lane for a while
                _waitFor = 0f;
            }
            if (_passFor > 0f)
            {
                _passFor -= Time.fixedDeltaTime;
                _pilot.lateral = Mathf.MoveTowards(_pilot.lateral, -3.2f, 2f * Time.fixedDeltaTime);
                _pilot.speedCap = Mathf.Max(_pilot.speedCap, 8f);
            }
            else _pilot.lateral = Mathf.MoveTowards(_pilot.lateral, 0f, 1.5f * Time.fixedDeltaTime);
        }

        /// <summary>Arrival, off the route, no progress.</summary>
        void Watch()
        {
            var dt = Time.fixedDeltaTime;
            // The player moved or cleared the waypoint on the map meanwhile.
            if (!_map.Waypoint.HasValue) { Stop("Waypoint cleared"); return; }
            if ((_map.Waypoint.Value - _goal).sqrMagnitude > 1f)
            {
                _goal = _map.Waypoint.Value;
                Replans++;
                if (!Plan()) Stop("No road leads there");
                return;
            }
            var left = _pilot.Length - _pilot.Position;
            var speed = _car.Telemetry.speed;
            if (_pilot.Finished || left < _s.arriveRadius)
            {
                if (speed < 1f) _arrivedFor += dt;
                if (_arrivedFor > _s.arriveHold)
                {
                    _map.Waypoint = null;
                    Stop("You have arrived");
                    Arrived?.Invoke();
                }
                return;
            }
            _offFor = _pilot.Offset > _s.offRoute ? _offFor + dt : 0f;
            if (_offFor > _s.replanSeconds)
            {
                _offFor = 0f;
                Debug.Log($"[AutoDrive] off the route at {_car.transform.position} ({_pilot.Offset:0.0} m) — planning again");
                Replans++;
                if (!Plan()) Stop("Auto-drive lost the road");
                return;
            }
            if (_pilot.Position > _progressAt + 3f || _waitFor > 0f)
            {
                _progressAt = _pilot.Position;
                _progressTime = Time.time;
            }
            else if (Time.time - _progressTime > _s.stuckSeconds) Recover();
        }

        /// <summary>Stuck for good: the car goes back onto the route a little ahead, facing along it.</summary>
        void Recover()
        {
            Recoveries++;
            Debug.Log($"[AutoDrive] stuck at {_car.transform.position} ({_pilot.Position:0}/{_pilot.Length:0} m, {_car.Telemetry.speed * 3.6f:0} km/h, waiting {_waitFor:0.0} s, unsticks {_pilot.Unsticks}) — back onto the route");
            var at = _pilot.Ahead(8f);
            var dir = _pilot.Ahead(14f) - at;
            _car.Place(at, Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg, fromAbove: 3f);
            Replans++;
            Plan();
        }

        // ── look: letterbox, HUD away, a quiet line about the destination ───────

        void Update()
        {
            var cine = _rig != null && _rig.Cinematic != null && _rig.Cinematic.Showing;
            var menu = GameMenu.Instance != null && GameMenu.Instance.IsOpen;
            var target = IsActive && cine && !menu ? 1f : 0f;
            _bars = Mathf.MoveTowards(_bars, target, Time.unscaledDeltaTime / Mathf.Max(0.05f, _s != null ? _s.letterboxSeconds : 0.6f));
            if (IsActive && cine && !menu && _hud != null)
            {
                if (!_hud.Hidden) { _hud.Hidden = true; _hidHud = true; }
            }
            else if (_hidHud && _hud != null && !menu && !cine)
            {
                _hud.Hidden = false;
                _hidHud = false;
            }
            Layout();
        }

        void Build()
        {
            if (_doc == null) return;
            var root = _doc.rootVisualElement;
            root.Clear();
            root.pickingMode = PickingMode.Ignore;
            root.style.position = Position.Absolute;
            root.style.left = root.style.right = root.style.top = root.style.bottom = 0;
            _top = Bar(root, true);
            _bottom = Bar(root, false);

            _info = new VisualElement { name = "autodrive-info", pickingMode = PickingMode.Ignore };
            var s = _info.style;
            s.position = Position.Absolute;
            s.left = 0; s.right = 0;
            s.flexDirection = FlexDirection.Row;
            s.justifyContent = Justify.Center;
            s.alignItems = Align.Center;
            root.Add(_info);
            _tag = Text(_info, "AUTO-DRIVE", 15f, MapSystem.Nitro, true);
            _tag.style.letterSpacing = 2f;
            _distance = Text(_info, "", 15f, new Color(1f, 1f, 1f, 0.9f), false);
            _distance.style.marginLeft = 14f;
            _help = Text(_info, "", 13f, new Color(1f, 1f, 1f, 0.55f), false);
            _help.style.marginLeft = 22f;

            // The offer: a waypoint is set, the car drives — "AUTO-DRIVE · hold G" (a click starts it too).
            var pill = new Button(() => SetActive(true)) { name = "autodrive-offer", text = "" };
            _prompt = pill;
            var p = pill.style;
            p.position = Position.Absolute;
            p.marginLeft = p.marginRight = p.marginTop = p.marginBottom = 0f;
            p.left = Length.Percent(50);
            p.translate = new Translate(Length.Percent(-50), 0);
            p.flexDirection = FlexDirection.Row;
            p.alignItems = Align.Center;
            p.height = 34f;
            p.paddingLeft = p.paddingRight = 14f;
            p.borderTopLeftRadius = p.borderTopRightRadius = p.borderBottomLeftRadius = p.borderBottomRightRadius = 17f;
            p.backgroundColor = new Color(0.06f, 0.07f, 0.1f, 0.6f);
            p.borderLeftWidth = p.borderRightWidth = p.borderTopWidth = p.borderBottomWidth = 1.2f;
            var c = new Color(MapSystem.Nitro.r, MapSystem.Nitro.g, MapSystem.Nitro.b, 0.85f);
            p.borderLeftColor = p.borderRightColor = p.borderTopColor = p.borderBottomColor = c;
            var t = Text(pill, "AUTO-DRIVE", 14f, c, true);
            t.style.letterSpacing = 1.5f;
            _promptKey = Text(pill, "hold G", 12f, new Color(1f, 1f, 1f, 0.7f), false);
            _promptKey.style.marginLeft = 10f;
            root.Add(pill);
            Layout();
        }

        static VisualElement Bar(VisualElement root, bool top)
        {
            var b = new VisualElement { name = top ? "letterbox-top" : "letterbox-bottom", pickingMode = PickingMode.Ignore };
            b.style.position = Position.Absolute;
            b.style.left = 0; b.style.right = 0;
            if (top) b.style.top = 0; else b.style.bottom = 0;
            b.style.backgroundColor = Color.black;
            root.Add(b);
            return b;
        }

        static Label Text(VisualElement parent, string text, float size, Color color, bool bold)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.style.fontSize = size;
            l.style.color = color;
            if (bold) l.style.unityFontStyleAndWeight = FontStyle.Bold;
            l.style.marginLeft = l.style.marginRight = l.style.marginTop = l.style.marginBottom = 0f;
            l.style.paddingLeft = l.style.paddingRight = l.style.paddingTop = l.style.paddingBottom = 0f;
            parent.Add(l);
            return l;
        }

        /// <summary>Letterbox height and the lines, every frame (cheap: a few style values).</summary>
        void Layout()
        {
            if (_top == null || _s == null) return;
            var k = _bars * _bars * (3f - 2f * _bars);
            var h = UiPanel.Size.y * _s.letterbox * k;
            _top.style.height = h;
            _bottom.style.height = h;
            var show = k > 0.01f;
            _top.style.display = _bottom.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
            _info.style.display = IsActive && k > 0.6f ? DisplayStyle.Flex : DisplayStyle.None;
            _info.style.opacity = Mathf.Clamp01((k - 0.6f) / 0.4f);
            // Phone upright: in the top bar — the bottom one holds the pad and the pedals.
            var top = UiPanel.IsPortrait;
            _info.style.top = top ? Mathf.Max(8f, (h - 20f) * 0.5f) + UiPanel.Safe.y * 0.5f : StyleKeyword.Auto;
            _info.style.bottom = top ? StyleKeyword.Auto : Mathf.Max(8f, (h - 20f) * 0.5f) + UiPanel.Safe.w * 0.5f;
            if (IsActive && _pilot != null)
            {
                var left = Mathf.Max(0f, _pilot.Length - _pilot.Position);
                _distance.text = left >= 1000f ? $"{left / 1000f:0.0} km to waypoint" : $"{Mathf.Round(left / 10f) * 10f:0} m to waypoint";
                var touch = UiPanel.IsPhone || Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed;
                _help.text = touch ? "Steer or brake to take control" : "Steer, brake or press G to take control  ·  C camera";
                Ui.Show(_help, !UiPanel.IsPortrait);
            }
            // The offer: only where it can start, never over a menu or the intro.
            var menu = GameMenu.Instance != null && GameMenu.Instance.IsOpen;
            var offer = !IsActive && !menu && HasDestination && Unlocks.IsUnlocked(FeatureId.AutoDrive) && !StartFlow.Holding && !Racing()
                && _player != null && _player.Current == PlayerModeController.Mode.Driving && !UiPanel.IsPhone;
            _prompt.style.display = offer ? DisplayStyle.Flex : DisplayStyle.None;
            _prompt.style.bottom = 150f + UiPanel.Safe.w;
        }
    }
}
