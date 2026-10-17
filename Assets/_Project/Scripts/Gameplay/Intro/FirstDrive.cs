using JapanMap.Core.Platform;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Map;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Stunts;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Gameplay.Intro
{
    /// <summary>
    /// "First Drive" — the prototype's intro (FirstDrive.ts), lost in the port and missed by the human (2026-10-11:
    /// "Wo ist unser Intro mit den Jumps hin?"). A new player sits in a car rolling at 95 km/h towards the coast kicker:
    ///
    /// | beat | picture | on when |
    /// |---|---|---|
    /// | Title | letterbox, title card, car rolls | 2.6 s |
    /// | Gas | "W · Hold to accelerate" | gas held, 3.2 s, or close to the ramp |
    /// | Nitro | "Shift · Nitro" | airborne past the lip (nitro fires itself 40 m before) |
    /// | Air | **slow motion**, "Space Space · Barrel roll" | landing |
    /// | Landed | "Clean landing +500" | 1.6 s |
    /// | Drift | "Hold Space and steer" | 0.7 s drifting or 14 s |
    /// | Home | goal under the arrow: Sakura Commons | within 35 m of it |
    ///
    /// Beats hang on the physics (airborne, trick, drift), deadlines on real time; every beat moves on without the
    /// player — an intro that waits is a wall. Only once (a claim in the save); hold Tab / tap SKIP to leave it.
    /// </summary>
    public sealed class FirstDrive : MonoBehaviour
    {
        public const string Claim = "intro:first-drive";
        public enum Beat { Off, Title, Gas, Nitro, Air, Landed, Drift, Home }

        [SerializeField] IntroSettings settings;
        [SerializeField] RampSet ramps;
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerProgress progress;
        [SerializeField] SparksWallet wallet;
        [SerializeField] GameplayHud hud;
        [SerializeField] MapSystem map;
        [SerializeField] Travel travel;
        [SerializeField] Traffic.TrafficSystem traffic;
        [Tooltip("Traffic keeps this far from the run-up and landing line, m.")]
        [SerializeField] float trafficClear = 30f;

        /// <summary>The editor and its tests start like a returning player unless a test asks for the intro.</summary>
        public static bool RunInEditor;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => RunInEditor = false;

        public Beat Current { get; private set; } = Beat.Off;
        public IntroSettings Settings => settings;
        /// <summary>A new player gets the intro once the title has gone (the title says START GAME, not CONTINUE).</summary>
        public bool WillRun => !_began && Wanted();
        /// <summary>Sparks paid by the intro this run (tests).</summary>
        public int Earned { get; private set; }
        public bool Rolled { get; private set; }
        public bool Skipped { get; private set; }

        IntroOverlay _ui;
        Vector3 _lip, _dir;
        float _yaw, _t, _slowTarget = 1f, _pressedFor, _driftFor, _tabHeld, _baseFixed;
        bool _boosted, _nitroAck, _began;
        float _playerThrottle;
        Vector2 _home;

        void Start() => _baseFixed = Time.fixedDeltaTime;

        bool Wanted()
        {
            if (settings == null || ramps == null || player == null || progress == null || progress.Data == null) return false;
            var url = Application.absoluteURL ?? "";
            if (url.Contains("intro=off")) return false;
            if (Application.isEditor && !RunInEditor) return false;
            if (progress.Resumed || progress.Data.claims.Contains(Claim)) return false;
            return url.Contains("intro=on") || progress.Data.playSeconds < 60f;
        }

        void Update()
        {
            // The first frame the world is ready and the title has gone (StartFlow): the title is the first picture.
            if (!_began && GamePlatform.WorldReady && !StartFlow.Holding)
            {
                _began = true;
                if (Wanted()) Begin();
            }
            if (Current == Beat.Off) return;
            var real = Mathf.Min(0.1f, Time.unscaledDeltaTime);
            // Menu, garage or ad open: no deadline runs, and the slow motion must not outlive the menu.
            if (UiStack.Count > 0 || GamePlatform.AdRunning || player.Suspended) return;
            _t += real;
            TickSkip(real);
            var k = 1f - Mathf.Exp(-settings.slowRate * real);
            Time.timeScale = Mathf.Lerp(Time.timeScale, _slowTarget, k);
            Time.fixedDeltaTime = _baseFixed * Mathf.Clamp(Time.timeScale, 0.05f, 1f); // smooth physics in slow motion

            var car = player.Car;
            if (car == null || player.Current != PlayerModeController.Mode.Driving) { Finish(skipped: true); return; }
            var tel = car.Telemetry;
            var along = Vector3.Dot(car.transform.position - _lip, _dir);
            if (tel.boosting) _boosted = true;

            switch (Current)
            {
                case Beat.Title:
                    if (_t > settings.titleSeconds)
                    {
                        _ui.Title(false);
                        Go(Beat.Gas);
                        _ui.Prompt(IntroOverlay.Gas, "Hold to accelerate", _ui.Touch ? "Touch the pad · steer with it" : "A / D steer");
                    }
                    break;
                case Beat.Gas:
                    _pressedFor = _playerThrottle > 0.5f ? _pressedFor + real : 0f;
                    if (_pressedFor > 0.35f) _ui.Hit();
                    if (_pressedFor > 0.35f || _t > 3.2f || along > -settings.nitroAt)
                    {
                        _ui.Step(1);
                        Go(Beat.Nitro);
                        _ui.Prompt(IntroOverlay.Nitro, "Nitro", "Hit the ramp fast");
                    }
                    break;
                case Beat.Nitro:
                    if (_boosted && !_nitroAck) { _nitroAck = true; _ui.Hit(); }
                    if (tel.airborne && along > -3f)
                    {
                        _ui.Step(2);
                        Go(Beat.Air);
                        _slowTarget = settings.airSlow;
                        _ui.Slow(true);
                        _ui.Prompt(IntroOverlay.Roll, _ui.Touch ? "Tap to roll" : "Double-tap to roll", _ui.Touch ? "STUNT, while you fly" : "Space twice · A/D roll · S flip", big: true);
                    }
                    else if ((along > 30f || _t > settings.nitroStall) && !tel.airborne)
                    {
                        // Missed the ramp: on without slow motion instead of a reset.
                        _ui.Cinema(false);
                        _ui.Step(3);
                        BeginDrift();
                    }
                    break;
                case Beat.Air:
                    if (!Rolled && tel.trick > 0.02f)
                    {
                        Rolled = true;
                        _ui.Hit();
                        _slowTarget = settings.rollSlow;
                        var trickName = tel.airTrick switch
                        {
                            Vehicles.AirTrick.Backflip => "Backflip!",
                            Vehicles.AirTrick.Frontflip => "Frontflip!",
                            Vehicles.AirTrick.Helicopter => "Helicopter!",
                            Vehicles.AirTrick.Corkscrew => "Corkscrew!",
                            _ => "Barrel roll!",
                        };
                        _ui.Toast(trickName, gold: false);
                        Pay(settings.rewardRoll, "Barrel roll");
                    }
                    if (!Rolled && _t > settings.airWait) { _slowTarget = 1f; _ui.Prompt(null, null, null); }
                    if (Rolled && tel.trick <= 0.02f) _slowTarget = 1f;
                    if (!tel.airborne && _t > 0.3f)
                    {
                        _slowTarget = 1f;
                        _ui.Slow(false);
                        _ui.Cinema(false);
                        _ui.Prompt(null, null, null);
                        Pay(settings.rewardLanding, "Landing");
                        _ui.Toast(Rolled ? $"Stuck the landing  +{settings.rewardLanding + settings.rewardRoll}" : $"Clean landing  +{settings.rewardLanding}", gold: true);
                        Go(Beat.Landed);
                    }
                    break;
                case Beat.Landed:
                    if (_t > 1.6f) { _ui.Step(3); BeginDrift(); }
                    break;
                case Beat.Drift:
                    _driftFor = tel.drift > 0.5f ? _driftFor + real : 0f;
                    if (_driftFor > settings.driftHold)
                    {
                        _ui.Hit();
                        Pay(settings.rewardDrift, "Drift");
                        _ui.Toast($"That's a drift  +{settings.rewardDrift}", gold: true);
                        BeginHome();
                    }
                    else if (_t > settings.driftTimeout) BeginHome();
                    break;
                case Beat.Home:
                    if (_t > 1.4f) _ui.Prompt(null, null, null);
                    var p = car.transform.position;
                    if (Vector2.Distance(new Vector2(p.x, p.z), _home) < settings.homeRadius)
                    {
                        Pay(settings.rewardHome, "Welcome home");
                        _ui.Toast($"Welcome to Sakura Commons  +{settings.rewardHome}", gold: true);
                        Finish(skipped: false);
                        if (_garage != null) hud.Flash("Spend your Sparks: the Open Bay tunes your car  ·  E");
                    }
                    break;
            }
        }

        Garage.GarageSystem _garage;

        /// <summary>From the start: the first visit (or a test).</summary>
        public void Begin()
        {
            var r = FindRamp();
            if (!r.HasValue || player.Car == null) return;
            var ramp = r.Value;
            _dir = ramp.Forward;
            _lip = ramp.Lip;
            _yaw = ramp.yaw;
            var start = _lip - _dir * settings.runUp;
            player.Seat();
            var car = player.Car;
            car.Place(start, _yaw, fromAbove: 4f);
            car.Body.linearVelocity = _dir * settings.startSpeed;
            if (player.Driver != null) player.Driver.Assist = Assist;
            if (traffic != null) traffic.KeepOut = OnLine;
            if (map != null) map.Waypoint = null;
            _home = travel != null && travel.Points != null && travel.Points.points.Length > 0 ? travel.Points.points[0].at : new Vector2(546.7f, -502.3f);
            // Home is the Open Bay inside the Commons: the first Sparks are meant to be spent there (legacy coached
            // the bay after the intro; players never found tuning without it).
            _garage = Object.FindAnyObjectByType<Garage.GarageSystem>();
            if (_garage != null) _home = _garage.Entry;
            Earned = 0;
            Rolled = Skipped = _boosted = _nitroAck = false;
            _tabHeld = 0f;
            _ui ??= new IntroOverlay(hud.Root, Skip);
            // The game's own notices (records, regions, milestones) wait: one voice at a time (they show after).
            hud.HoldNotices = true;
            _ui.Show();
            _ui.Cinema(true);
            _ui.Title(true);
            _ui.Step(0);
            Go(Beat.Title);
            Debug.Log("[Intro] first drive");
        }

        /// <summary>Hold Tab / tap SKIP / the menu: home in the car at Sakura Commons, nothing more to learn.</summary>
        public void Skip()
        {
            if (Current == Beat.Off) return;
            Finish(skipped: true);
            if (travel != null) travel.ToCommons();
        }

        void Finish(bool skipped)
        {
            Skipped = skipped;
            Current = Beat.Off;
            _slowTarget = 1f;
            Time.timeScale = 1f;
            Time.fixedDeltaTime = _baseFixed;
            if (player.Driver != null && player.Driver.Assist == Assist) player.Driver.Assist = null;
            if (traffic != null && traffic.KeepOut == OnLine) traffic.KeepOut = null;
            if (!progress.Data.claims.Contains(Claim)) progress.Data.claims.Add(Claim);
            progress.MarkDirty();
            _ui?.Hide(delay: skipped ? 0f : 2.5f);
            if (hud != null) hud.HoldNotices = false;
            if (hud != null) hud.SetGoal("", Vector2.zero);
            Debug.Log($"[Intro] {(skipped ? "skipped" : "done")} · {Earned} Sparks · roll {Rolled}");
        }

        void Go(Beat beat)
        {
            var c = player != null ? player.Car : null;
            if (c != null) Debug.Log($"[Intro] {beat} · {c.Telemetry.speed * 3.6f:0} km/h · air {c.Telemetry.airborne} · trick {c.Telemetry.trick:0.00} · roll {Rolled}");
            Current = beat;
            _t = 0f;
            _pressedFor = _driftFor = 0f;
        }

        // The drift is the turn: home lies behind the car after the landing (the ramp points at the sea).
        void BeginDrift()
        {
            Go(Beat.Drift);
            if (player.Driver != null && player.Driver.Assist == Assist) player.Driver.Assist = null;
            if (map != null) map.Waypoint = _home;
            if (hud != null) hud.SetGoal("Sakura Commons", _home);
            _ui.Prompt(IntroOverlay.Drift, "Hold and steer — drift it around",
                _ui.Touch ? "Hold DRIFT and steer · home is behind you" : "Hold Space, steer with A / D · home is behind you");
        }

        void BeginHome()
        {
            _ui.Step(4);
            Go(Beat.Home);
        }

        void Pay(int sparks, string why)
        {
            Earned += sparks;
            if (wallet != null) wallet.Add(sparks, why);
        }

        void TickSkip(float real)
        {
            var kb = Keyboard.current;
            var held = kb != null && kb.tabKey.isPressed;
            _tabHeld = held ? _tabHeld + real : 0f;
            _ui.SkipProgress(Mathf.Clamp01(_tabHeld / settings.skipHold));
            if (_tabHeld >= settings.skipHold) Skip();
        }

        // From behind the start to past the landing.
        bool OnLine(Vector3 p)
        {
            var along = Vector3.Dot(p - _lip, _dir);
            if (along < -settings.runUp - 40f || along > 140f) return false;
            var off = p - _lip - _dir * along;
            off.y = 0f;
            return off.magnitude < trafficClear;
        }

        RampSet.Ramp? FindRamp()
        {
            foreach (var r in ramps.ramps) if (r.id == settings.rampId) return r;
            Debug.LogError($"[Intro] ramp {settings.rampId} missing in {ramps.name}");
            return null;
        }

        /// <summary>
        /// On the run-up the assist holds the gas and pulls the car onto the line; the player keeps a third of the
        /// steering. After the landing an idle player is braked to drift speed (the car rolled on towards the sea).
        /// </summary>
        DriveInput Assist(DriveInput input)
        {
            _playerThrottle = input.throttle;
            var car = player.Car;
            if (car == null) return input;
            var tel = car.Telemetry;
            if (Current == Beat.Landed || (Current == Beat.Air && !tel.airborne))
            {
                if (input.throttle == 0f && input.brake == 0f && tel.speed > settings.turnSpeed) input.brake = 0.55f;
                return input;
            }
            if (Current != Beat.Title && Current != Beat.Gas && Current != Beat.Nitro) return input;
            var p = car.transform.position;
            var along = Vector3.Dot(p - _lip, _dir);
            var right = Quaternion.Euler(0f, _yaw, 0f) * Vector3.right;
            var cross = Vector3.Dot(p - _lip, right); // + = right of the line → steer left
            var err = Mathf.DeltaAngle(car.transform.eulerAngles.y, _yaw) * Mathf.Deg2Rad; // + = line is to the right
            var assist = Mathf.Clamp(-settings.assistCross * cross + settings.assistHeading * err, -settings.assistMax, settings.assistMax);
            input.steer = Mathf.Clamp(input.steer * settings.playerSteer + assist, -1f, 1f);
            input.throttle = 1f;
            input.brake = 0f;
            input.handbrake = false;
            if (!tel.airborne) { input.trick = false; input.stunt = false; } // a double tap on the ground would spin the run-up
            if (Current == Beat.Title) input.boost = false;
            if (along > -settings.autoNitroAt && along < 0f) input.boost = true;
            return input;
        }

        void OnDisable()
        {
            if (Current != Beat.Off) { Time.timeScale = 1f; Time.fixedDeltaTime = _baseFixed > 0f ? _baseFixed : Time.fixedDeltaTime; }
        }
    }
}
