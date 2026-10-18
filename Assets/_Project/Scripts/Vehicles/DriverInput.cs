using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Player intent → <see cref="DriveInput"/> each physics step. Keyboard and gamepad come through the
    /// Drive action map; touch controls call <see cref="SetTouch"/>. Sources are added, never swapped
    /// (a tablet with a keyboard must not swallow either one — legacy DriveSystem rule).
    /// Stunt mode: a handbrake double tap arms it and fires one trick pulse; driving straight after a
    /// lived stunt drift disarms it (legacy DriveSystem.#noteStuntTap / #armStunt).
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class DriverInput : MonoBehaviour
    {
        [SerializeField] InputActionAsset actions;
        [SerializeField] VehicleController vehicle;

        InputAction _throttle, _brake, _steer, _handbrake, _boost, _respawn, _camera, _lookBack, _look, _zoom, _repair, _autoDrive;
        Vector2 _touchAxes;
        bool _touchHandbrake, _touchBoost;
        float _tapAt = float.NegativeInfinity, _boostTapAt = float.NegativeInfinity;
        bool _stuntArmed, _stuntLived, _trickPulse, _burstPulse;

        public event Action RespawnPressed;
        /// <summary>Rewrites the player's input before the car gets it (the intro's run-up assist); null = none.</summary>
        public Func<DriveInput, DriveInput> Assist;
        public event Action CameraPressed;

        public bool StuntArmed => _stuntArmed;
        public bool LookBackHeld => _lookBack != null && _lookBack.IsPressed();
        public Vector2 Look => _look?.ReadValue<Vector2>() ?? Vector2.zero;
        public float Zoom => _zoom?.ReadValue<float>() ?? 0f;

        public VehicleController Vehicle
        {
            get => vehicle;
            set => vehicle = value;
        }

        void Awake()
        {
            var map = actions.FindActionMap("Drive", throwIfNotFound: true);
            _throttle = map.FindAction("Throttle", true);
            _brake = map.FindAction("Brake", true);
            _steer = map.FindAction("Steer", true);
            _handbrake = map.FindAction("Handbrake", true);
            _boost = map.FindAction("Boost", true);
            _respawn = map.FindAction("Respawn", true);
            _camera = map.FindAction("Camera", true);
            _lookBack = map.FindAction("LookBack", true);
            _look = map.FindAction("Look", true);
            _zoom = map.FindAction("Zoom", true);
            _repair = map.FindAction("Repair", false); // T / d-pad left: fix the car where it stands (D47)
            _autoDrive = map.FindAction("AutoDrive", false); // hold G / d-pad right: drive to the waypoint (D49)
        }

        void OnEnable()
        {
            actions.FindActionMap("Drive").Enable();
            _handbrake.started += OnHandbrakeDown;
            _boost.started += OnBoostDown;
            _respawn.performed += OnRespawn;
            _camera.performed += OnCamera;
            if (_repair != null) _repair.performed += OnRepair;
            if (_autoDrive != null)
            {
                _autoDrive.performed += OnAutoDrive;
                _autoDrive.started += OnAutoDriveDown;
            }
        }

        void OnDisable()
        {
            _handbrake.started -= OnHandbrakeDown;
            _boost.started -= OnBoostDown;
            _respawn.performed -= OnRespawn;
            _camera.performed -= OnCamera;
            if (_repair != null) _repair.performed -= OnRepair;
            if (_autoDrive != null)
            {
                _autoDrive.performed -= OnAutoDrive;
                _autoDrive.started -= OnAutoDriveDown;
            }
            actions.FindActionMap("Drive").Disable();
            ClearTouch();
        }

        // The window lost focus: otherwise the car keeps full throttle (legacy #onBlur).
        void OnApplicationFocus(bool focus)
        {
            if (!focus) ClearTouch();
        }

        void OnHandbrakeDown(InputAction.CallbackContext _) => NoteHandbrakeTap();
        void OnBoostDown(InputAction.CallbackContext _) => NoteBoostTap();

        /// <summary>Boost double tap → one burst pulse (the whole tank at once).</summary>
        void NoteBoostTap()
        {
            var now = Time.unscaledTime;
            if (vehicle != null && vehicle.Tuning.IsBurstDoubleTap(_boostTapAt, now))
            {
                _burstPulse = true;
                _boostTapAt = float.NegativeInfinity;
                return;
            }
            _boostTapAt = now;
        }

        /// <summary>The touch BURST action (a double tap on BOOST does the same).</summary>
        public void PressBurst() => _burstPulse = true;
        void OnRespawn(InputAction.CallbackContext _) => RespawnPressed?.Invoke();
        void OnCamera(InputAction.CallbackContext _) => CameraPressed?.Invoke();

        /// <summary>Touch stick (x = steer, y = throttle/brake) and buttons, from the on-screen controls.</summary>
        public void SetTouch(Vector2 axes, bool handbrake, bool boost)
        {
            if (handbrake && !_touchHandbrake) NoteHandbrakeTap();
            if (boost && !_touchBoost) NoteBoostTap();
            _touchAxes = axes;
            _touchThrottle = Mathf.Max(0f, axes.y);
            _touchBrake = Mathf.Max(0f, -axes.y);
            _touchHandbrake = handbrake;
            _touchBoost = boost;
        }

        /// <summary>Touch layout of ASTRA §10: steer from the pad, throttle (auto or pedal) and brake separately.</summary>
        public void SetTouch(float steer, float throttle, float brake, bool handbrake, bool boost)
        {
            if (handbrake && !_touchHandbrake) NoteHandbrakeTap();
            if (boost && !_touchBoost) NoteBoostTap();
            _touchAxes = new Vector2(steer, 0f);
            _touchThrottle = Mathf.Clamp01(throttle);
            _touchBrake = Mathf.Clamp01(brake);
            _touchHandbrake = handbrake;
            _touchBoost = boost;
        }

        /// <summary>The touch STUNT toggle (keyboard: a handbrake double tap).</summary>
        public void ToggleStunt()
        {
            _stuntArmed = !_stuntArmed;
            _stuntLived = false;
            if (_stuntArmed) _trickPulse = true;
        }

        float _touchThrottle, _touchBrake;

        public void PressRespawn() => RespawnPressed?.Invoke();

        /// <summary>Repair in place, free and at once (key T, d-pad left, the HUD's REPAIR button).</summary>
        public void PressRepair()
        {
            if (vehicle != null && vehicle.TryGetComponent<VehicleDamage>(out var damage) && damage.NeedsRepair)
            {
                damage.Repair();
                RepairPressed?.Invoke();
            }
        }

        public event Action RepairPressed;

        /// <summary>The auto-drive key was held (G / d-pad right, 0.45 s): start driving to the waypoint.</summary>
        public event Action AutoDriveHeld;
        /// <summary>The auto-drive key went down (a tap while the car drives itself hands control back at once).</summary>
        public event Action AutoDriveDown;
        void OnAutoDrive(InputAction.CallbackContext _) => AutoDriveHeld?.Invoke();
        void OnAutoDriveDown(InputAction.CallbackContext _) => AutoDriveDown?.Invoke();

        /// <summary>What the player asked for in the last physics step, before any assist (auto-drive takeover).</summary>
        public DriveInput Raw { get; private set; }
        void OnRepair(InputAction.CallbackContext _) => PressRepair();
        public void PressCamera() => CameraPressed?.Invoke();

        void ClearTouch()
        {
            _touchAxes = Vector2.zero;
            _touchThrottle = _touchBrake = 0f;
            _touchHandbrake = _touchBoost = false;
        }

        void NoteHandbrakeTap()
        {
            var now = Time.unscaledTime;
            if (vehicle != null && vehicle.Tuning.IsStuntDoubleTap(_tapAt, now))
            {
                _stuntArmed = true;
                _stuntLived = false;
                _trickPulse = true;
                _tapAt = float.NegativeInfinity;
                return;
            }
            _tapAt = now;
        }

        void FixedUpdate()
        {
            if (vehicle == null) return;
            var input = new DriveInput
            {
                throttle = Mathf.Clamp01(_throttle.ReadValue<float>() + _touchThrottle),
                brake = Mathf.Clamp01(_brake.ReadValue<float>() + _touchBrake),
                steer = Mathf.Clamp((_steer.ReadValue<float>() + _touchAxes.x) * Core.GameOptions.Steering, -1f, 1f), // Settings: 50–150 %
                handbrake = _handbrake.IsPressed() || _touchHandbrake,
                boost = _boost.IsPressed() || _touchBoost,
                stunt = _stuntArmed,
                trick = _trickPulse,
                burst = _burstPulse,
            };
            _trickPulse = _burstPulse = false;
            Raw = input;
            if (Assist != null) input = Assist(input);
            vehicle.Input = input;
        }

        /// <summary>After the physics step: a lived stunt ends when the player drives straight again.</summary>
        void Update()
        {
            if (vehicle == null || !_stuntArmed) return;
            var t = vehicle.Telemetry;
            if (t.stunt > 0.2f) _stuntLived = true;
            if (_stuntLived && Mathf.Abs(vehicle.Input.steer) < vehicle.Tuning.driftEnterSteer && !t.airborne && t.trick < 0.08f)
            {
                _stuntArmed = false;
                _stuntLived = false;
            }
        }
    }
}
