using System;
using JapanMap.Core;
using JapanMap.OnFoot;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Gameplay
{
    /// <summary>
    /// The player is either on foot or in the car. This switches input, camera and touch controls
    /// between the two: F gets out (only below 5 km/h) and in (standing car, within 4.2 m), H calls
    /// the car to the nearest clear road spot. The session starts on foot in Sakura Commons with the
    /// car 4 m north (legacy DriveSystem.startOnFoot / WP2). Builds the walker at runtime, like the
    /// spawner builds the car.
    /// </summary>
    [DefaultExecutionOrder(50)]
    public sealed class PlayerModeController : MonoBehaviour
    {
        public enum Mode { Walking, Driving }

        [Header("Car side")]
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] DriverInput driver;
        [SerializeField] CarCameraRig carCamera;
        [SerializeField] DriveTouchControls driveTouch;
        [Tooltip("Asset implementing IRoadLocator (World/RoadNetwork).")]
        [SerializeField] ScriptableObject roadLocator;

        [Header("On foot")]
        [SerializeField] WalkerSettings walkerSettings;
        [SerializeField] WalkerInput walkInput;
        [SerializeField] WalkCameraRig walkCamera;
        [SerializeField] WalkTouchControls walkTouch;
        [Tooltip("Stand-in materials until the asset session delivers a player model.")]
        [SerializeField] Material skin, top, bottom;

        [Header("Start")]
        [SerializeField] InputActionAsset actions;
        [SerializeField] bool startOnFoot = true;
        [Tooltip("Where the walker starts, Unity coordinates (legacy sakura-bowl centre 550 | 510).")]
        [SerializeField] Vector3 walkSpawn = new(550f, 27.2f, -510f);
        [SerializeField] float walkSpawnYaw;

        InputAction _vehicle, _call;
        WalkerMotor _walker;
        StandInFigure _figure;
        bool _promptShown;

        public Mode Current { get; private set; } = Mode.Driving;
        public InputActionAsset Actions => actions;
        public WalkerMotor Walker => _walker;
        public VehicleController Car => spawner != null ? spawner.Current : null;
        /// <summary>The prompt the HUD shows now ("" = none).</summary>
        public string Prompt { get; private set; } = "";
        /// <summary>Last message from a call (shown for a few seconds).</summary>
        public string Message { get; private set; } = "";
        public float MessageAt { get; private set; } = float.NegativeInfinity;

        public event Action<Mode> ModeChanged;

        IRoadLocator Roads => roadLocator as IRoadLocator;

        void Awake()
        {
            var map = actions.FindActionMap("Player", throwIfNotFound: true);
            _vehicle = map.FindAction("Vehicle", true);
            _call = map.FindAction("CallCar", true);
            BuildWalker();
        }

        void OnEnable()
        {
            actions.FindActionMap("Player").Enable();
            _vehicle.performed += OnVehicle;
            _call.performed += OnCall;
        }

        void OnDisable()
        {
            _vehicle.performed -= OnVehicle;
            _call.performed -= OnCall;
            actions.FindActionMap("Player").Disable();
        }

        void OnVehicle(InputAction.CallbackContext _) => PressVehicle();
        void OnCall(InputAction.CallbackContext _) => PressCall();

        void Start()
        {
            if (startOnFoot && Car != null)
            {
                SetWalking(Ground(walkSpawn, walkSpawn.y + 40f), walkSpawnYaw);
            }
            else SetDriving();
        }

        void BuildWalker()
        {
            var go = new GameObject("Walker");
            go.transform.SetParent(transform, false);
            go.AddComponent<CharacterController>();
            _walker = go.AddComponent<WalkerMotor>();
            _walker.Configure(walkerSettings);
            _figure = StandInFigure.Build(go.transform, walkerSettings.height, skin, top, bottom);
            if (walkInput != null) walkInput.Motor = _walker;
            if (walkCamera != null) walkCamera.Bind(_walker, walkInput);
            if (walkTouch != null) walkTouch.Input = walkInput;
            go.SetActive(false);
        }

        /// <summary>F / B button / touch CAR: get out when slow enough, get in when close enough.</summary>
        public void PressVehicle()
        {
            if (Suspended) return;
            if (Current == Mode.Driving) TryAlight();
            else TryBoard();
        }

        /// <summary>
        /// Hands the player to a menu scene (garage): no driving or walking input, no player camera. Off again
        /// resumes in the car (<see cref="Seat"/> first when the menu put the player into it).
        /// </summary>
        public void SetSuspended(bool on)
        {
            if (on == Suspended) return;
            Suspended = on;
            if (on)
            {
                _resumeWalking = Current == Mode.Walking;
                if (_walker != null) { _resumeAt = _walker.transform.position; _resumeYaw = _walker.transform.eulerAngles.y; }
                if (driver != null) driver.enabled = false;
                if (Car != null) Car.Input = new DriveInput { handbrake = true }; // a held W must not drive on under a menu
                if (driveTouch != null) driveTouch.Suppressed = true;
                if (carCamera != null) carCamera.SetLive(false);
                if (walkInput != null) walkInput.enabled = false;
                if (walkTouch != null) walkTouch.Suppressed = true;
                if (walkCamera != null) walkCamera.SetLive(false);
                if (_walker != null) _walker.gameObject.SetActive(false);
                return;
            }
            // Back to the mode the menu interrupted (the garage seats the player first, so it resumes driving).
            if (_resumeWalking && Current == Mode.Walking) SetWalking(_resumeAt, _resumeYaw);
            else SetDriving();
        }

        bool _resumeWalking;
        Vector3 _resumeAt;
        float _resumeYaw;

        public bool Suspended { get; private set; }

        /// <summary>Into the car wherever it is (a menu moved it), without the boarding distance check.</summary>
        public void Seat()
        {
            if (Current == Mode.Walking) SetDriving();
        }

        /// <summary>H / d-pad down / touch CALL.</summary>
        public void PressCall()
        {
            if (!Suspended) Say(CallCar());
        }

        public bool CanAlight => Current == Mode.Driving && Car != null && Car.Body.linearVelocity.magnitude * 3.6f <= walkerSettings.alightMaxKmh;

        public float CarDistance => Car == null || _walker == null ? float.PositiveInfinity
            : Vector2.Distance(new Vector2(_walker.transform.position.x, _walker.transform.position.z),
                new Vector2(Car.transform.position.x, Car.transform.position.z));

        public bool CanBoard => Current == Mode.Walking && Car != null
            && CarDistance <= walkerSettings.boardRange + (_promptShown ? walkerSettings.promptSlack : 0f)
            && Car.Body.linearVelocity.magnitude * 3.6f <= walkerSettings.boardMaxKmh;

        public bool TryAlight()
        {
            if (!CanAlight) return false;
            var car = Car.transform;
            // Driver's door is on the right (Japanese right-hand drive); then left, then behind.
            var right = Vector3.ProjectOnPlane(car.right, Vector3.up).normalized;
            var back = -Vector3.ProjectOnPlane(car.forward, Vector3.up).normalized;
            var s = walkerSettings;
            foreach (var offset in new[] { right * s.alightGap, -right * s.alightGap, back * 3.2f, right * (s.alightGap + 1.2f), -right * (s.alightGap + 1.2f) })
            {
                var feet = Ground(car.position + offset, car.position.y + 2f);
                if (!Free(feet)) continue;
                SetWalking(feet, car.eulerAngles.y);
                return true;
            }
            Say("No room to get out here.");
            return false;
        }

        public bool TryBoard()
        {
            if (!CanBoard) return false;
            SetDriving();
            return true;
        }

        /// <summary>Move the car to a clear road spot near the walker. Returns the message for the HUD.</summary>
        public string CallCar()
        {
            if (Current != Mode.Walking) return "Step out of the car before calling it.";
            if (Car == null) return "";
            if (CarDistance <= walkerSettings.callAlreadyHere) return "Your car is already beside you.";
            var cols = Car.GetComponentsInChildren<Collider>();
            var size = Car.Definition.bodySize; // length, width, height
            var half = new Vector3(size.y * 0.5f, 0f, size.x * 0.5f);
            if (!CarCall.TryFind(_walker.transform.position, Roads, walkerSettings, half, cols, out var spot))
                return "No clear parking space nearby. Move to open ground and call again.";
            Car.Place(spot.position, spot.heading, fromAbove: 3f);
            Car.Input = new DriveInput { handbrake = true };
            return $"Your car is parked {Mathf.RoundToInt(spot.distance)} m away{(spot.onRoad ? " on the road" : "")}.";
        }

        void Say(string message)
        {
            if (string.IsNullOrEmpty(message)) return;
            Message = message;
            MessageAt = Time.unscaledTime;
        }

        void SetWalking(Vector3 feet, float yaw)
        {
            Current = Mode.Walking;
            var car = Car;
            if (driver != null) driver.enabled = false;
            if (car != null) car.Input = new DriveInput { handbrake = true }; // parked, not rolling away
            if (carCamera != null) carCamera.SetLive(false);
            if (driveTouch != null) driveTouch.Suppressed = true;

            _walker.gameObject.SetActive(true);
            _walker.Place(feet, yaw);
            if (walkInput != null) walkInput.enabled = true;
            if (walkTouch != null) walkTouch.Suppressed = false;
            if (walkCamera != null) walkCamera.SetLive(true);
            ModeChanged?.Invoke(Current);
        }

        void SetDriving()
        {
            Current = Mode.Driving;
            if (walkCamera != null) walkCamera.SetLive(false);
            if (walkInput != null) walkInput.enabled = false;
            if (walkTouch != null) walkTouch.Suppressed = true;
            if (_walker != null) _walker.gameObject.SetActive(false);
            if (Cursor.lockState == CursorLockMode.Locked) Cursor.lockState = CursorLockMode.None;

            if (driver != null) driver.enabled = true;
            if (Car != null) Car.Input = default;
            if (carCamera != null) carCamera.SetLive(true);
            if (driveTouch != null) driveTouch.Suppressed = false;
            ModeChanged?.Invoke(Current);
        }

        void Update()
        {
            if (Current == Mode.Walking && _walker != null)
            {
                _figure.Pose(_walker.Cycle, Mathf.Clamp01(_walker.Speed / walkerSettings.runSpeed), _walker.Lean, _walker.SlideAmount, !_walker.Grounded);
                _promptShown = CanBoard;
                Prompt = _promptShown ? "F  Get in" : "";
            }
            else
            {
                _promptShown = false;
                Prompt = CanAlight && Car.Telemetry.speed < 0.5f ? "F  Get out" : "";
            }
        }

        /// <summary>Ground point below <paramref name="at"/>, probing down from height <paramref name="from"/>.</summary>
        static Vector3 Ground(Vector3 at, float from)
        {
            var top = from;
            return Physics.Raycast(new Vector3(at.x, top, at.z), Vector3.down, out var hit, top + 200f, ~GameLayers.NotGround, QueryTriggerInteraction.Ignore)
                ? hit.point
                : at;
        }

        bool Free(Vector3 feet)
        {
            var r = walkerSettings.radius;
            var a = feet + Vector3.up * (r + 0.1f);
            var b = feet + Vector3.up * (walkerSettings.height - r);
            return !Physics.CheckCapsule(a, b, r, ~(GameLayers.NotGround & ~LayerMask.GetMask(GameLayers.Vehicle)), QueryTriggerInteraction.Ignore);
        }
    }
}
