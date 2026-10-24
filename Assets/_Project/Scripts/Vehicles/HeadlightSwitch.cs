using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Vehicles
{
    public enum HeadlightMode { Off, Low, High }

    /// <summary>
    /// The player's headlight switch (D52), kept per device in PlayerPrefs like the other options. On by default — the
    /// world is blue hour. One press toggles on/off; a second press within <see cref="DoubleTap"/> s switches the high
    /// beam instead (from the state before the first press). Key L, gamepad LB, the touch LIGHT button.
    /// </summary>
    public static class HeadlightSwitch
    {
        public const string PrefsKey = "jm.opt.lights";
        public const float DoubleTap = 0.35f;

        static HeadlightMode? _mode;
        static InputAction _action;
        static HeadlightMode _beforePress;
        static float _pressAt = float.NegativeInfinity;

        public static event Action<HeadlightMode> Changed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _mode = null;
            _pressAt = float.NegativeInfinity;
            Changed = null;
            // Without a domain reload the action asset outlives the play session: drop the old listener, or one key
            // press counts twice (a "double tap") in the next session.
            if (_action != null) _action.performed -= OnAction;
            _action = null;
        }

        /// <summary>Listens to Drive/Headlights of the game's actions (once, whichever car asks first).</summary>
        public static void Bind(InputActionAsset actions)
        {
            var a = actions != null ? actions.FindAction("Drive/Headlights") : null;
            if (a == null || a == _action) return;
            if (_action != null) _action.performed -= OnAction;
            _action = a;
            _action.performed += OnAction;
        }

        static void OnAction(InputAction.CallbackContext _) => Press();

        public static HeadlightMode Mode
        {
            get => _mode ??= (HeadlightMode)Mathf.Clamp(PlayerPrefs.GetInt(PrefsKey, (int)HeadlightMode.Low), 0, 2);
            set
            {
                if (_mode == value) return;
                _mode = value;
                PlayerPrefs.SetInt(PrefsKey, (int)value);
                PlayerPrefs.Save();
                Changed?.Invoke(value);
            }
        }

        public static bool On => Mode != HeadlightMode.Off;

        /// <summary>Forget the cached state (a test that rewrote the saved value, a fresh boot).</summary>
        public static void Reload() => _mode = null;

        public static void Press() => Press(Time.unscaledTime);

        public static void Press(float now)
        {
            if (now - _pressAt <= DoubleTap)
            {
                Mode = _beforePress == HeadlightMode.High ? HeadlightMode.Low : HeadlightMode.High;
                _pressAt = float.NegativeInfinity;
                return;
            }
            _beforePress = Mode;
            _pressAt = now;
            Mode = Mode == HeadlightMode.Off ? HeadlightMode.Low : HeadlightMode.Off;
        }
    }
}
