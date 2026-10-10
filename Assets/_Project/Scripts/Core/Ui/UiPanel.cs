using System;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Core.Ui
{
    public enum FormFactor { Desktop, PhoneLandscape, PhonePortrait }

    /// <summary>
    /// One shared runtime panel for every UI document, measured in CSS pixels (ASTRA §10 gives every size in
    /// CSS px: 48 px targets, 16 px body text, 112 px phone minimap). The asset under Data/UI is only the
    /// template — a runtime copy is scaled each frame to device-pixel-ratio × desktop fit × the player's UI
    /// scale, so the asset never changes in play mode. Also reports the form factor (desktop, phone
    /// landscape/portrait) and the safe-area insets for layouts.
    /// </summary>
    public static class UiPanel
    {
        /// <summary>Short side below this (CSS px) is a phone layout (ASTRA references 390 and 844 px).</summary>
        public const float PhoneShortSide = 600f;
        /// <summary>The player's UI scale steps (ASTRA §10: 90 / 100 / 115 / 130 %).</summary>
        public static readonly float[] Scales = { 0.9f, 1f, 1.15f, 1.3f };

        static PanelSettings _runtime;
        static float _userScale = 1f;
        static Vector2Int _lastScreen;
        static float _lastScale;

        public static FormFactor Form { get; private set; } = FormFactor.Desktop;
        public static bool IsPhone => Form != FormFactor.Desktop;
        public static bool IsPortrait => Form == FormFactor.PhonePortrait;
        /// <summary>Screen size in panel units.</summary>
        public static Vector2 Size { get; private set; } = new(1920f, 1080f);
        /// <summary>Safe-area insets in panel units: left, top, right, bottom.</summary>
        public static Vector4 Safe { get; private set; }
        /// <summary>Panel units per device pixel (1 / scale).</summary>
        public static float Scale { get; private set; } = 1f;
        /// <summary>Forces a form factor (tests, screenshots of the phone layouts in the editor); null = measure.</summary>
        public static FormFactor? ForcedForm
        {
            get => _forced;
            set
            {
                _forced = value;
                Refresh(force: true);
            }
        }

        static FormFactor? _forced;

        /// <summary>Raised when size, form factor or UI scale changed.</summary>
        public static event Action Changed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _runtime = null;
            _userScale = 1f;
            _lastScreen = default;
            _forced = null;
            Changed = null;
        }

        public static float UserScale
        {
            get => _userScale;
            set
            {
                _userScale = Mathf.Clamp(value, 0.8f, 1.5f);
                Refresh(force: true);
            }
        }

        /// <summary>The runtime panel for a document (all documents share one, so they scale together).</summary>
        public static PanelSettings Get(PanelSettings template)
        {
            if (_runtime == null && template != null)
            {
                _runtime = UnityEngine.Object.Instantiate(template);
                _runtime.name = template.name + " (runtime)";
                _runtime.scaleMode = PanelScaleMode.ConstantPixelSize;
                var go = new GameObject("UiPanelDriver") { hideFlags = HideFlags.HideAndDontSave };
                go.AddComponent<UiPanelDriver>();
                UnityEngine.Object.DontDestroyOnLoad(go);
                Refresh(force: true);
            }
            return _runtime != null ? _runtime : template;
        }

        public static void Refresh(bool force = false)
        {
            var screen = new Vector2Int(Screen.width, Screen.height);
            if (!force && screen == _lastScreen) return;
            _lastScreen = screen;
            var dpr = DevicePixelRatio();
            var css = new Vector2(screen.x, screen.y) / dpr;
            var shortSide = Mathf.Min(css.x, css.y);
            var form = _forced ?? (shortSide < PhoneShortSide ? (css.y > css.x ? FormFactor.PhonePortrait : FormFactor.PhoneLandscape) : FormFactor.Desktop);
            // Desktop sizes in ASTRA are for 1920 × 1080; a smaller window shrinks them a little, never below 80 %.
            var fit = form == FormFactor.Desktop ? Mathf.Clamp(css.y / 1080f, 0.8f, 1.5f) : 1f;
            var scale = dpr * fit * _userScale;
            if (!force && Mathf.Approximately(scale, _lastScale) && form == Form) return;
            _lastScale = scale;
            Form = form;
            if (_runtime != null) _runtime.scale = scale;
            Scale = 1f / scale;
            Size = new Vector2(screen.x, screen.y) / scale;
            var s = SafeInsetsPixels();
            Safe = s / scale;
            Changed?.Invoke();
        }

        /// <summary>Device pixels per CSS pixel. Editor and desktop players: 1 (the Game view is in pixels).</summary>
        public static float DevicePixelRatio()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            var r = JapanMapDevicePixelRatio();
            return r > 0.5f ? r : 1f;
#else
            return 1f;
#endif
        }

        static Vector4 SafeInsetsPixels()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            var dpr = DevicePixelRatio();
            return new Vector4(JapanMapSafeInset(0), JapanMapSafeInset(1), JapanMapSafeInset(2), JapanMapSafeInset(3)) * dpr;
#else
            var a = Screen.safeArea;
            return new Vector4(a.xMin, Screen.height - a.yMax, Screen.width - a.xMax, a.yMin);
#endif
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern float JapanMapDevicePixelRatio();
        [DllImport("__Internal")] static extern float JapanMapSafeInset(int side);
#endif
    }
}
