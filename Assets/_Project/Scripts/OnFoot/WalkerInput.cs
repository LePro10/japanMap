using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// Player intent on foot → <see cref="WalkerMotor.Input"/> each frame, through the Walk action map
    /// (keyboard, mouse, gamepad); touch controls add theirs via <see cref="SetTouch"/>. Sources are
    /// added, never swapped (same rule as DriverInput). Mouse look only while the pointer is captured
    /// (a click captures it, Esc frees it) or the right button is held — otherwise moving the mouse
    /// to a browser tab would spin the camera.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class WalkerInput : MonoBehaviour
    {
        [SerializeField] InputActionAsset actions;
        [SerializeField] WalkerMotor motor;
        [Tooltip("Touch stick travel from which the walker runs (share of the stick radius).")]
        [SerializeField] float touchRunFrom = 0.92f;

        InputAction _move, _look, _lookStick, _jump, _sprint, _slide, _zoom;
        Vector2 _touchMove, _touchLook;
        bool _touchJump, _touchSlide;

        public WalkerMotor Motor
        {
            get => motor;
            set => motor = value;
        }

        /// <summary>Mouse movement this frame, pixels (zero unless the pointer is captured or RMB held).</summary>
        public Vector2 MouseLook { get; private set; }
        /// <summary>Right stick, −1…1.</summary>
        public Vector2 StickLook => _lookStick?.ReadValue<Vector2>() ?? Vector2.zero;
        /// <summary>Touch drag this frame, reference pixels.</summary>
        public Vector2 TouchLook { get; private set; }
        public float Zoom => _zoom?.ReadValue<float>() ?? 0f;

        void Awake()
        {
            var map = actions.FindActionMap("Walk", throwIfNotFound: true);
            _move = map.FindAction("Move", true);
            _look = map.FindAction("Look", true);
            _lookStick = map.FindAction("LookStick", true);
            _jump = map.FindAction("Jump", true);
            _sprint = map.FindAction("Sprint", true);
            _slide = map.FindAction("Slide", true);
            _zoom = map.FindAction("Zoom", true);
        }

        void OnEnable()
        {
            actions.FindActionMap("Walk").Enable();
            _jump.started += OnJump;
        }

        void OnDisable()
        {
            _jump.started -= OnJump;
            actions.FindActionMap("Walk").Disable();
            ClearTouch();
            if (motor != null) motor.Input = default;
            MouseLook = TouchLook = Vector2.zero;
        }

        void OnApplicationFocus(bool focus)
        {
            if (!focus) ClearTouch();
        }

        void OnJump(InputAction.CallbackContext _)
        {
            if (motor != null) motor.Input.jump = true;
        }

        /// <summary>Touch stick (x = right, y = forward), look drag (pixels this frame), buttons.</summary>
        public void SetTouch(Vector2 move, Vector2 lookDelta, bool jump, bool slide)
        {
            if (jump && !_touchJump && motor != null) motor.Input.jump = true;
            _touchMove = move;
            _touchLook += lookDelta;
            _touchJump = jump;
            _touchSlide = slide;
        }

        void ClearTouch()
        {
            _touchMove = _touchLook = Vector2.zero;
            _touchJump = _touchSlide = false;
        }

        void Update()
        {
            var mouse = Mouse.current;
            var captured = Cursor.lockState == CursorLockMode.Locked;
            if (mouse != null && !captured && mouse.leftButton.wasPressedThisFrame && !Application.isMobilePlatform && Application.isFocused)
                Cursor.lockState = CursorLockMode.Locked;
            var rightHeld = mouse != null && mouse.rightButton.isPressed;
            MouseLook = captured || rightHeld ? _look.ReadValue<Vector2>() : Vector2.zero;
            TouchLook = _touchLook;
            _touchLook = Vector2.zero;

            if (motor == null) return;
            var move = Vector2.ClampMagnitude(_move.ReadValue<Vector2>() + _touchMove, 1f);
            motor.Input.move = move;
            motor.Input.sprint = _sprint.IsPressed() || _touchMove.magnitude >= touchRunFrom;
            motor.Input.slide = _slide.IsPressed() || _touchSlide;
        }
    }
}
