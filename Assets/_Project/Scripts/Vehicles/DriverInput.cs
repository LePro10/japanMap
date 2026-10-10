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

        InputAction _throttle, _brake, _steer, _handbrake, _boost, _respawn, _camera, _lookBack, _look, _zoom;
        Vector2 _touchAxes;
        bool _touchHandbrake, _touchBoost;
        float _tapAt = float.NegativeInfinity;
        bool _stuntArmed, _stuntLived, _trickPulse;

        public event Action RespawnPressed;
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
        }

        void OnEnable()
        {
            actions.FindActionMap("Drive").Enable();
            _handbrake.started += OnHandbrakeDown;
            _respawn.performed += OnRespawn;
            _camera.performed += OnCamera;
        }

        void OnDisable()
        {
            _handbrake.started -= OnHandbrakeDown;
            _respawn.performed -= OnRespawn;
            _camera.performed -= OnCamera;
            actions.FindActionMap("Drive").Disable();
            ClearTouch();
        }

        // The window lost focus: otherwise the car keeps full throttle (legacy #onBlur).
        void OnApplicationFocus(bool focus)
        {
            if (!focus) ClearTouch();
        }

        void OnHandbrakeDown(InputAction.CallbackContext _) => NoteHandbrakeTap();
        void OnRespawn(InputAction.CallbackContext _) => RespawnPressed?.Invoke();
        void OnCamera(InputAction.CallbackContext _) => CameraPressed?.Invoke();

        /// <summary>Touch stick (x = steer, y = throttle/brake) and buttons, from the on-screen controls.</summary>
        public void SetTouch(Vector2 axes, bool handbrake, bool boost)
        {
            if (handbrake && !_touchHandbrake) NoteHandbrakeTap();
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
            };
            _trickPulse = false;
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
