using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Intro;
using JapanMap.Gameplay.Map;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Records;
using JapanMap.Gameplay.Stunts;
using JapanMap.UI;
using UnityEngine;

namespace JapanMap.Gameplay.Career
{
    /// <summary>
    /// Runs the career (D50, docs/CAREER.md) after the first drive: one goal at a time on the HUD, ticked off by the
    /// game's own events and saved facts (drift banked, stunt scored, purchase, event finished …), each step paying its
    /// Sparks and opening features through <see cref="Unlocks"/> (the menus show what is still locked). It sets the
    /// waypoint when a goal lies somewhere, tops up the balance once when a buy step would otherwise stall, and can be
    /// skipped (title, Play page). Every step is a claim in the save, written at once: a reload continues at the step.
    /// Built at runtime by <see cref="FirstDrive"/> (no scene change); a new save starts it, an old save counts as done.
    /// </summary>
    [DefaultExecutionOrder(50)]
    public sealed class CareerSystem : MonoBehaviour
    {
        /// <summary>The editor and its tests start with everything open unless a test asks for the career (like the intro).</summary>
        public static bool RunInEditor;
        public static CareerSystem Instance { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            RunInEditor = false;
            Instance = null;
        }

        CareerSettings _s;
        PlayerProgress _progress;
        PlayerModeController _player;
        GameplayHud _hud;
        MapSystem _map;
        Travel _travel;
        FirstDrive _intro;
        DriftScorer _drift;
        StuntScorer _stunts;
        RaceDirector _races;
        GarageSystem _garage;
        PhotoMode _photo;
        NextGoalGuide _guide;
        CareerChain _chain;
        CareerOverlay _ui;

        int _shown = -1, _stuntsAt, _finishedAt;
        float _stepT, _doneT = -1f, _speedFor, _best;
        bool _travelled, _driftMet, _arrived, _guideWasOn;
        string _photoAt = "";
        Vector2? _ourWaypoint;

        public bool Active { get; private set; }
        public CareerChain Chain => _chain;
        public CareerSettings Settings => _s;
        public CareerOverlay Overlay => _ui;
        /// <summary>Index of the step on screen (tests).</summary>
        public int Step => _chain != null ? _chain.Index : 0;

        public void Bind(CareerSettings s, PlayerProgress progress, PlayerModeController player, GameplayHud hud, MapSystem map, Travel travel, FirstDrive intro)
        {
            _s = s;
            _progress = progress;
            _player = player;
            _hud = hud;
            _map = map;
            _travel = travel;
            _intro = intro;
        }

        void Awake() => Instance = this;

        void Start()
        {
            if (_s == null || _progress == null || _progress.Data == null) { enabled = false; return; }
            _chain = new CareerChain(_s, _progress.Claimed);
            _drift = FindAnyObjectByType<DriftScorer>();
            _stunts = FindAnyObjectByType<StuntScorer>();
            _races = FindAnyObjectByType<RaceDirector>();
            _garage = FindAnyObjectByType<GarageSystem>();
            _photo = FindAnyObjectByType<PhotoMode>();
            _guide = FindAnyObjectByType<NextGoalGuide>();
            if (_drift != null) _drift.ChainEnded += OnChain;
            if (_travel != null) _travel.Travelled += OnTravel;
            if (Decide()) Begin();
        }

        void OnDestroy()
        {
            if (_drift != null) _drift.ChainEnded -= OnChain;
            if (_travel != null) _travel.Travelled -= OnTravel;
            if (_autoHooked != null) _autoHooked.Arrived -= OnArrived;
            if (Active) Unlocks.Query = null;
            if (Instance == this) Instance = null;
        }

        /// <summary>
        /// Does this save play the career? A new save does (career:on), an old one without the claim counts as done (there
        /// are no real players yet — D50). URL career=off/on for tests by hand; unlock=all and the sandbox are done.
        /// </summary>
        bool Decide()
        {
            var d = _progress.Data;
            var url = Application.absoluteURL ?? "";
            if (d.claims.Contains(CareerChain.Done) || d.sandbox || url.Contains("career=off") || PlayerProgress.UnlockAllFromUrl(url)) return false;
            var forced = url.Contains("career=on");
            if (Application.isEditor && !RunInEditor && !forced) return false; // nothing written: the editor's saves stay as they are
            if (d.claims.Contains(CareerChain.On)) return !_chain.Complete;
            var fresh = !d.claims.Contains(FirstDrive.Claim) && d.playSeconds < 60f;
            d.claims.Add(fresh || forced ? CareerChain.On : CareerChain.Done);
            _progress.MarkDirty();
            if (!fresh && !forced) Debug.Log("[Career] an older save: counted as done");
            return fresh || forced;
        }

        void Begin()
        {
            Active = true;
            _ui = new CareerOverlay(_hud.Root, _s.bannerSeconds);
            Unlocks.Query = _chain;
            // One voice: the career points the way now; the old first-goal guide waits until the career is over.
            if (_guide != null) { _guideWasOn = _guide.enabled; _guide.enabled = false; }
            // Arrived is hooked in Update (auto-drive may register after us); hooking here too counted it twice.
            Debug.Log($"[Career] on · step {_chain.Index + 1}/{_chain.Count}");
        }

        void Update()
        {
            if (!Active) return;
            // Auto-drive registers at boot, perhaps after us.
            if (_autoHooked != AutoDrive.Current)
            {
                if (_autoHooked != null) _autoHooked.Arrived -= OnArrived;
                _autoHooked = AutoDrive.Current;
                if (_autoHooked != null) _autoHooked.Arrived += OnArrived;
            }
            _ui.Attach(_hud.Root);
            _ui.Quiet(UiPanel.IsPhone && _drift != null && _drift.Chain.Active);
            var introOn = _intro != null && _intro.Current != FirstDrive.Beat.Off;
            var inEvent = _races != null && _races.Current != RaceDirector.State.Idle;
            // Banners wait while the HUD is hidden (menu, garage): they are the moment, not a log.
            _ui.Visible(!introOn && !inEvent && !StartFlow.Holding && !_hud.Hidden && (_photo == null || !_photo.IsOpen));
            if (StartFlow.Holding) return;

            var real = Mathf.Min(0.1f, Time.unscaledDeltaTime);
            if (_doneT >= 0f)
            {
                // The tick plays out before the next goal comes.
                _doneT += real;
                if (_doneT < _s.doneHold) return;
                _doneT = -1f;
            }
            var step = _chain.Current;
            if (step == null) { Finish(); return; }
            var index = _chain.Index;
            if (index != _shown) Enter(index);
            _stepT += real;
            if (introOn && step.Value.goal != CareerGoal.IntroDone) return;
            if (Met(step.Value, real)) Complete(index);
        }

        IAutoDrive _autoHooked;

        // ── steps ───────────────────────────────────────────────────────────────────────────────────────

        void Enter(int index)
        {
            _shown = index;
            var s = _s.steps[index];
            _stepT = _speedFor = _best = 0f;
            _driftMet = _travelled = _arrived = false;
            _stuntsAt = _stunts != null ? _stunts.Count : 0;
            _photoAt = _photo != null ? _photo.LastPhoto : "";
            _finishedAt = Finished();
            _chain.Chapter(index, out var chapter, out var chapters, out var first, out var size);
            if (index == first && index > 0)
                _ui.Queue(new CareerOverlay.Banner { kicker = $"CHAPTER {chapter} OF {chapters}", title = s.chapter.ToUpperInvariant(), body = CareerChain.Title(s), icon = Icon.Flag, sound = "Whoosh_Up" });
            if (s.goal == CareerGoal.IntroDone)
            {
                _ui.Hide(); // the first drive has its own steps on screen
            }
            else
            {
                var hint = CareerOverlay.Touch ? s.touchHint : s.hint;
                _ui.Show($"CHAPTER {chapter} · {s.chapter.ToUpperInvariant()}", $"{index + 1} / {_chain.Count}", CareerChain.Title(s), hint, s.reward, index - first, size);
            }
            if (s.fund) Fund(s);
            Point(s);
            Debug.Log($"[Career] step {index + 1}/{_chain.Count} {s.id}: {CareerChain.Title(s)}");
        }

        bool Met(in CareerSettings.Step s, float dt)
        {
            var d = _progress.Data;
            var car = _player != null && _player.Current == PlayerModeController.Mode.Driving ? _player.Car : null;
            var menu = GameMenu.Instance;
            switch (s.goal)
            {
                case CareerGoal.IntroDone:
                    return d.claims.Contains(FirstDrive.Claim) && (_intro == null || _intro.Current == FirstDrive.Beat.Off);
                case CareerGoal.GarageOpen:
                    return _garage == null || _garage.IsOpen;
                case CareerGoal.BuyTune:
                    return d.purchases.Any(p => p.StartsWith("tune:"));
                case CareerGoal.BuyPaint:
                    return d.purchases.Any(p => p.StartsWith("paint:"));
                case CareerGoal.DriftChain:
                    if (_drift != null) _best = Mathf.Max(_best, _drift.Chain.Pending);
                    _ui.Meter(_best / Mathf.Max(1f, s.amount), $"{Mathf.Min(_best, s.amount):N0} / {s.amount:N0}");
                    return _driftMet || _drift == null;
                case CareerGoal.Stunt:
                    return _stunts == null || _stunts.Count > _stuntsAt;
                case CareerGoal.Burst:
                    return car != null && car.Telemetry.burst > 0.5f;
                case CareerGoal.Speed:
                    var kmh = car != null ? car.Telemetry.speed * 3.6f : 0f;
                    _best = Mathf.Max(_best, kmh);
                    _ui.Meter(_best / Mathf.Max(1f, s.amount), $"{Mathf.Min(_best, s.amount):0} / {s.amount:0} km/h");
                    _speedFor = kmh >= s.amount ? _speedFor + dt : 0f;
                    return _speedFor >= _s.speedHold;
                case CareerGoal.MapOpen:
                    return menu != null && menu.IsOpen && menu.Current is MapScreen;
                case CareerGoal.AutoDrive:
                    // No auto-drive in this build, or the player drove there themselves: on, never a wall.
                    if (AutoDrive.Current == null) return _stepT > _s.noAutoDrive;
                    return AutoDrive.IsActive || _arrived || AtEvent(30f);
                case CareerGoal.ReachEvent:
                    return _arrived || AtEvent(s.amount) || Finished() > _finishedAt;
                case CareerGoal.FinishEvents:
                    var n = Finished();
                    if (n != _finishedAt) { _finishedAt = n; Point(s); } // the next one, once one is done
                    if (s.amount > 1f) _ui.Meter(n / s.amount, $"{Mathf.Min(n, (int)s.amount)} / {s.amount:0}");
                    return n >= s.amount;
                case CareerGoal.MedalTier:
                    var tier = s.amount;
                    return d.events.Any(e => e.bestTier >= tier);
                case CareerGoal.MenuPlay:
                    return menu != null && menu.IsOpen && menu.Current is PlayScreen;
                case CareerGoal.MenuRecords:
                    return menu != null && menu.IsOpen && menu.Current is RecordsScreen;
                case CareerGoal.Photo:
                    return _photo == null || (!string.IsNullOrEmpty(_photo.LastPhoto) && _photo.LastPhoto != _photoAt);
                case CareerGoal.FastTravel:
                    return _travelled || _travel == null;
                case CareerGoal.TestDrive:
                    return _garage == null || _garage.TestDriving;
                case CareerGoal.OwnCars:
                    return d.cars.Count(c => c.owned) >= s.amount;
                default:
                    return false;
            }
        }

        /// <summary>Ticks step <paramref name="index"/> off: Sparks (saved at once), check on the card, banners for what opened.</summary>
        void Complete(int index)
        {
            var s = _s.steps[index];
            if (!_progress.Grant(CareerChain.Claim(s), s.reward, "Career")) return;
            ClearWaypoint();
            if (s.goal == CareerGoal.IntroDone) _ui.Wait(_s.afterIntro);
            else
            {
                _ui.Done();
                Audio.Sfx.Play("Bell_Sparks", 0.8f);
                _doneT = 0f;
            }
            if (s.unlocks != null)
                foreach (var f in s.unlocks)
                {
                    var info = _s.Info(f);
                    if (info == null) continue;
                    _ui.Queue(new CareerOverlay.Banner { kicker = "UNLOCKED", title = info.Value.name.ToUpperInvariant(), body = info.Value.blurb, icon = info.Value.icon, gold = true, sound = "Bell_Win" });
                }
            _chain.Raise(); // menus rebuild with the new tiles open
            // Ticked off inside a menu (a purchase in the Open Bay): the menu says it now, the banners follow outside.
            var menu = GameMenu.Instance;
            if (menu != null && menu.IsOpen)
            {
                var opened = s.unlocks != null && s.unlocks.Length > 0 && _s.Info(s.unlocks[0]) is { } first ? $"  ·  UNLOCKED: {first.name}" : "";
                menu.Notice($"Done · {CareerChain.Title(s)}{(s.reward > 0 ? $"  +{s.reward:N0} Sparks" : "")}{opened}");
            }
            Debug.Log($"[Career] done {s.id} +{s.reward}");
        }

        void Finish()
        {
            if (!Active) return;
            Active = false;
            _progress.Grant(CareerChain.Done, _s.completeReward, "Career complete");
            _ui.Hide();
            _ui.Queue(new CareerOverlay.Banner { kicker = "CAREER COMPLETE", title = "THE ISLAND IS YOURS", body = Next(), icon = Icon.Spark, gold = true, sound = "Bell_Win" });
            _ui.Visible(true);
            if (_guide != null) _guide.enabled = _guideWasOn;
            _chain.Raise();
            Debug.Log($"[Career] complete +{_s.completeReward}");
        }

        /// <summary>What to chase after the career: the next car, gold everywhere, own bests.</summary>
        string Next()
        {
            var car = _progress.Fleet != null ? _progress.Fleet.vehicles.Where(v => v != null && !_progress.Owns(v.id)).OrderBy(v => v.price).FirstOrDefault() : null;
            var gold = _progress.Data.events.Count(e => e.bestTier >= 3);
            var total = _races != null ? _races.Set.events.Length : 0;
            return $"+{_s.completeReward:N0} Sparks  ·  Next: {(car != null ? $"the {car.displayName} ({car.price:N0})" : "every car is yours")}  ·  gold {gold} / {total}  ·  beat your records";
        }

        /// <summary>Skip tutorial (title or Play page, after a confirmation): everything opens, the first drive too, with a start fund.</summary>
        public void Skip()
        {
            if (!Active || _progress == null) return;
            var d = _progress.Data;
            if (!d.claims.Contains(FirstDrive.Claim)) d.claims.Add(FirstDrive.Claim);
            foreach (var s in _s.steps) if (!d.claims.Contains(CareerChain.Claim(s))) d.claims.Add(CareerChain.Claim(s));
            Active = false;
            _progress.Grant(CareerChain.Done, _s.skipSparks, "Start fund");
            ClearWaypoint();
            _ui?.Hide();
            if (_guide != null) _guide.enabled = _guideWasOn;
            _chain.Raise();
            Debug.Log($"[Career] skipped · +{_s.skipSparks}");
        }

        // ── helpers ─────────────────────────────────────────────────────────────────────────────────────

        int Finished() => _progress.Data.events.Count(e => e.finishes > 0);

        void OnChain(ChainEnd reason, float credit, float chain)
        {
            var s = _chain?.Current;
            if (!Active || s == null || s.Value.goal != CareerGoal.DriftChain) return;
            if (reason == ChainEnd.Banked && chain >= s.Value.amount) _driftMet = true;
        }

        void OnTravel(string _) => _travelled = true;
        void OnArrived() => _arrived = true;

        bool AtEvent(float radius)
        {
            if (_races != null && _races.Current != RaceDirector.State.Idle) return true;
            if (!_ourWaypoint.HasValue || _player == null || _player.Car == null) return false;
            var p = _player.Car.transform.position;
            return Vector2.Distance(new Vector2(p.x, p.z), _ourWaypoint.Value) <= radius;
        }

        /// <summary>A buy step must never stall: once, the balance is topped up to the cheapest thing it asks for.</summary>
        void Fund(in CareerSettings.Step s)
        {
            var need = s.goal switch
            {
                CareerGoal.BuyTune => _progress.Tuning != null ? Vehicles.CarTune.All.Min(c => _progress.Tuning.Price(c, 1)) : 0,
                CareerGoal.BuyPaint => _progress.Tuning != null ? _progress.Tuning.paintPrice : 0,
                CareerGoal.OwnCars => _progress.Fleet != null ? _progress.Fleet.vehicles.Where(v => v != null && !_progress.Owns(v.id)).Select(v => v.price).DefaultIfEmpty(0).Min() : 0,
                _ => 0,
            };
            var missing = need - _progress.Wallet.Balance;
            if (missing <= 0) return;
            if (_progress.Grant($"career:fund:{s.id}", missing, "Starter fund"))
                _hud.Flash($"Starter fund  +{missing:N0} Sparks");
        }

        /// <summary>The waypoint for a step that leads somewhere (the HUD arrow and the line on the road follow it).</summary>
        void Point(in CareerSettings.Step s)
        {
            if (_map == null) return;
            Vector2? at = null;
            var label = "";
            switch (s.waypoint)
            {
                case CareerTarget.Garage when _garage != null:
                    at = _garage.Entry;
                    label = "Open Bay";
                    break;
                case CareerTarget.NextEvent when _races != null:
                    var from = _player != null && _player.Car != null ? _player.Car.transform.position : Vector3.zero;
                    var i = _races.Recommend(from, _progress.Data);
                    foreach (var (pos, index) in _races.Markers)
                        if (index == i) { at = new Vector2(pos.x, pos.z); label = _races.Set.events[i].title; }
                    break;
            }
            if (!at.HasValue) return;
            _ourWaypoint = at;
            _map.Waypoint = at;
            _hud.SetGoal(label, at.Value);
        }

        void ClearWaypoint()
        {
            var next = _chain.Index < _chain.Count ? _s.steps[_chain.Index].waypoint : CareerTarget.None;
            if (next != CareerTarget.None) return; // the next step points again (maybe somewhere else)
            if (_map != null && _ourWaypoint.HasValue && _map.Waypoint == _ourWaypoint) _map.Waypoint = null;
            if (_ourWaypoint.HasValue) _hud.SetGoal("", Vector2.zero);
            _ourWaypoint = null;
        }

        /// <summary>Kicker for the title's CONTINUE line and the Play page ("Career 5 / 20 · Street Skills").</summary>
        public string Summary()
        {
            var s = _chain?.Current;
            return Active && s != null ? $"Career {_chain.Index + 1} / {_chain.Count} · {s.Value.chapter}" : "";
        }
    }
}
