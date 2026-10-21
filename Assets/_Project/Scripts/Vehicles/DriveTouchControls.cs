using JapanMap.Core;
using JapanMap.Core.Ui;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// On-screen driving controls for phones and tablets, ASTRA §10: a steering pad lower left (128 × 112 px); the
    /// right thumb has three 56 px targets in a triangle — Drift lowest/inboard, Brake lowest/outboard, Boost above —
    /// and a 48 px Stunt toggle above/inboard; a finger slides from one to the next (Boost → Drift releases Boost).
    /// <b>Auto-throttle</b> (default): the first touch of the pad engages it, Brake overrides it, braking to a stop
    /// disengages it; reverse needs Brake held at rest for 0.4 s. Manual mode adds an 80 × 64 throttle zone inboard
    /// of Brake. Recover and Camera are small at the top. Left-handed mode mirrors; buttons scale 100–140 %.
    /// Shown on mobile and after the first touch; feeds <see cref="DriverInput.SetTouch(float,float,float,bool,bool)"/>.
    /// </summary>
    public sealed class DriveTouchControls : MonoBehaviour
    {
        [SerializeField] DriverInput driver;
        [Tooltip("Shared panel settings (Data/UI/HudPanel.asset).")]
        [SerializeField] PanelSettings panelSettings;
        [Tooltip("Stick travel below which nothing happens (share of radius).")]
        [SerializeField] float deadZone = 0.12f;
        [Tooltip("Brake held at rest this long before the car reverses, s (ASTRA: 0.4).")]
        [SerializeField] float reverseHold = 0.4f;
        [SerializeField] bool forceVisible;

        UIDocument _doc;
        VisualElement _root, _stunt, _auto, _lights;
        TouchKit.Stick _stick;
        TouchKit.Group _group;
        bool _handbrake, _boost, _brake, _pedal, _revealed, _suppressed, _engaged;
        float _brakeAtRest;

        internal VisualElement Stick => _stick?.Base;
        internal VisualElement DriftButton { get; private set; }
        internal VisualElement BrakeButton { get; private set; }
        internal VisualElement BoostButton { get; private set; }
        /// <summary>AUTO: drive to the waypoint by itself (D49); shown while a waypoint is set.</summary>
        internal VisualElement AutoButton => _auto;
        internal VisualElement LightsButton => _lights;
        internal Vector2 Axes => _stick != null ? _stick.Axes : Vector2.zero;
        /// <summary>Auto-throttle running (the pad was touched since boarding / the last stop).</summary>
        public bool Engaged => _engaged;

        public bool Visible => _root != null && _root.style.display == DisplayStyle.Flex;

        /// <summary>Hidden while the player is on foot, without forgetting that this is a touch device.</summary>
        public bool Suppressed
        {
            get => _suppressed;
            set
            {
                _suppressed = value;
                if (value)
                {
                    _engaged = false; // boarding never drives off by itself
                    _stick?.ReleaseAll();
                    _group?.ReleaseAll();
                    if (driver != null) driver.SetTouch(0f, 0f, 0f, false, false);
                }
                Refresh();
            }
        }

        void Awake()
        {
            // Own child: a GameObject holds only one UIDocument, and the Player carries several panels.
            var host = new GameObject("DriveTouchUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panelSettings);
        }

        void OnEnable()
        {
            Build();
            UiPanel.Changed += Build;
            GameOptions.Changed += Build;
            SetVisible(_revealed || forceVisible || Application.isMobilePlatform);
        }

        void OnDisable()
        {
            UiPanel.Changed -= Build;
            GameOptions.Changed -= Build;
            if (driver != null) driver.SetTouch(0f, 0f, 0f, false, false);
        }

        void Update()
        {
            // A touch anywhere reveals the controls (touch laptops, tablets in a desktop browser).
            if (!_revealed && Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed) SetVisible(true);
            if (!Visible || driver == null) return;
            var car = driver.Vehicle;
            var speed = car != null ? car.Telemetry.forwardSpeed : 0f;
            var auto = GameOptions.AutoThrottle;
            if (_stick.Held) _engaged = true;
            // Driving itself: the auto-throttle must not hand control back by itself — only a real touch of pad or brake does.
            var autoDrive = AutoDrive.IsActive;
            if (autoDrive && !_stick.Held) _engaged = false;
            _root.style.opacity = autoDrive ? 0.4f : 1f;
            var offer = AutoDrive.Current != null && (autoDrive || AutoDrive.Current.HasDestination) && Unlocks.IsUnlocked(FeatureId.AutoDrive);
            _auto.style.display = offer ? DisplayStyle.Flex : DisplayStyle.None;
            _auto.EnableInClassList("jm-touch--on", autoDrive);
            float throttle, brake = 0f;
            if (_brake)
            {
                // Brake overrides the auto-throttle; at rest it waits 0.4 s before reversing.
                if (Mathf.Abs(speed) < 0.6f)
                {
                    _brakeAtRest += Time.deltaTime;
                    if (auto) _engaged = false;
                    brake = _brakeAtRest >= reverseHold ? 1f : 0f;
                }
                else brake = 1f;
                throttle = 0f;
            }
            else
            {
                _brakeAtRest = 0f;
                throttle = auto ? (_engaged ? 1f : 0f) : (_pedal ? 1f : 0f);
            }
            driver.SetTouch(_stick.Axes.x, throttle, brake, _handbrake, _boost);
            _stunt.EnableInClassList("jm-touch--on", driver.StuntArmed);
            _lights.EnableInClassList("jm-touch--on", HeadlightSwitch.On);
        }

        public void SetVisible(bool on)
        {
            _revealed = on;
            Refresh();
        }

        void Refresh()
        {
            if (_root != null) _root.style.display = _revealed && !_suppressed ? DisplayStyle.Flex : DisplayStyle.None;
        }

        void Build()
        {
            var doc = _doc.rootVisualElement;
            doc.Clear();
            // The document root has no height of its own; without this, bottom-anchored controls sit off screen.
            doc.style.position = Position.Absolute;
            doc.style.left = doc.style.right = doc.style.top = doc.style.bottom = 0;
            doc.pickingMode = PickingMode.Ignore;
            _root = new VisualElement { name = "drive-touch", pickingMode = PickingMode.Ignore };
            _root.style.position = Position.Absolute;
            _root.style.left = _root.style.right = _root.style.top = _root.style.bottom = 0;
            doc.Add(_root);

            var k = GameOptions.ButtonScale;
            var mirror = GameOptions.LeftHanded;
            var safe = UiPanel.Safe;
            var outerL = (mirror ? safe.z : safe.x) + 16f;
            var outerR = (mirror ? safe.x : safe.z) + 16f;
            var bottom = safe.w + (UiPanel.IsPortrait ? 28f : 20f);
            var big = 56f * k;
            var gap = 8f * k; // ASTRA: 8 px between targets

            // Steering pad, lower left (right when mirrored).
            _stick = new TouchKit.Stick(_root, new Vector2(128f, 112f) * k, deadZone);
            TouchKit.Place(_stick.Base, outerL, bottom, rightSide: false, mirror);

            // Right thumb: Brake lowest/outboard, Drift lowest/inboard, Boost above — one sliding group.
            _group = new TouchKit.Group();
            BrakeButton = _group.Add(_root, big, "BRAKE", on => _brake = on, "jm-touch--brake");
            TouchKit.Place(BrakeButton, outerR, bottom, rightSide: true, mirror);
            DriftButton = _group.Add(_root, big, "DRIFT", on => _handbrake = on, "jm-touch--drift");
            TouchKit.Place(DriftButton, outerR + big + gap, bottom, rightSide: true, mirror);
            BoostButton = _group.Add(_root, big, "BOOST", on => _boost = on, "jm-touch--boost");
            TouchKit.Place(BoostButton, outerR + (big + gap) * 0.5f, bottom + big + gap, rightSide: true, mirror);
            _stunt = TouchKit.Tap(_root, 48f * k, "STUNT", () => driver?.ToggleStunt());
            // Above and inboard of the group, clear of the instrument (landscape: 144 px wide, 138 px above the bottom).
            TouchKit.Place(_stunt, outerR + (big + gap) * 2.3f, bottom + big + gap, rightSide: true, mirror);
            if (!GameOptions.AutoThrottle)
            {
                // Manual throttle: an 80 × 64 hold zone inboard of the group.
                var pedal = TouchKit.Hold(_root, 64f * k, "GAS", on => _pedal = on);
                pedal.style.width = 80f * k;
                pedal.style.borderTopLeftRadius = pedal.style.borderTopRightRadius = pedal.style.borderBottomLeftRadius = pedal.style.borderBottomRightRadius = 14f;
                TouchKit.Place(pedal, outerR + (big + gap) * 2f, bottom, rightSide: true, mirror);
            }

            // Recover and camera: small, at the top edge (the menu button sits in the corner).
            // One row with MENU (PlayerModeUi): the top corner, in portrait under the instrument.
            var top = safe.y + (UiPanel.IsPortrait ? UiPanel.PortraitButtonRow : 12f);
            var reset = TouchKit.Tap(_root, 48f, "RESET", () => driver?.PressRespawn());
            var cam = TouchKit.Tap(_root, 48f, "CAM", () => driver?.PressCamera());
            _auto = TouchKit.Tap(_root, 48f, "AUTO", () => AutoDrive.Current?.SetActive(!AutoDrive.IsActive));
            _auto.name = "touch-auto";
            // Headlights (D52): a tap toggles, a double tap is the high beam — as the L key.
            _lights = TouchKit.Tap(_root, 48f, "LIGHT", HeadlightSwitch.Press);
            _lights.name = "touch-lights";
            var outerRow = (mirror ? safe.x : safe.z) + 12f;
            foreach (var (b, i) in new[] { (reset, 1), (cam, 2), (_lights, 3), (_auto, 4) })
            {
                b.style.position = Position.Absolute;
                b.style.top = top;
                b.style.right = mirror ? StyleKeyword.Auto : outerRow + 56f * i;
                b.style.left = mirror ? outerRow + 56f * i : StyleKeyword.Auto;
            }
            Refresh();
        }
    }
}
