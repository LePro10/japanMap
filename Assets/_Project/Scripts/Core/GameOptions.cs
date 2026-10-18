using System;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// Player options of the Settings screen (ASTRA §10), per device in PlayerPrefs — never in the progress JSON.
    /// Ranges and defaults from ASTRA: steering 50–150 % (100), chase distance 4–8 m (6), camera shake
    /// Off/Low/Full (Low), km/h or mph, UI scale 90/100/115/130 %, touch auto-throttle on, stick layout.
    /// </summary>
    public static class GameOptions
    {
        const string P = "jm.opt.";

        public static event Action Changed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Changed = null;

        static float F(string k, float d) => PlayerPrefs.GetFloat(P + k, d);
        static void SetF(string k, float v) { PlayerPrefs.SetFloat(P + k, v); Changed?.Invoke(); }
        static int I(string k, int d) => PlayerPrefs.GetInt(P + k, d);
        static void SetI(string k, int v) { PlayerPrefs.SetInt(P + k, v); Changed?.Invoke(); }

        /// <summary>Steering sensitivity, 0.5–1.5.</summary>
        public static float Steering { get => Mathf.Clamp(F("steer", 1f), 0.5f, 1.5f); set => SetF("steer", Mathf.Clamp(value, 0.5f, 1.5f)); }
        /// <summary>Chase camera distance, m (4–8).</summary>
        public static float ChaseDistance { get => Mathf.Clamp(F("chase", 6f), 4f, 8f); set => SetF("chase", Mathf.Clamp(value, 4f, 8f)); }
        /// <summary>0 off, 1 low, 2 full.</summary>
        public static int CameraShake { get => Mathf.Clamp(I("shake", 1), 0, 2); set => SetI("shake", Mathf.Clamp(value, 0, 2)); }
        public static bool Mph { get => I("mph", 0) == 1; set => SetI("mph", value ? 1 : 0); }
        /// <summary>Index into UiPanel.Scales (0 = 90 %, 1 = 100 %…).</summary>
        public static int UiScale { get => Mathf.Clamp(I("uiscale", 1), 0, 3); set => SetI("uiscale", Mathf.Clamp(value, 0, 3)); }
        public static bool AutoThrottle { get => I("autothrottle", 1) == 1; set => SetI("autothrottle", value ? 1 : 0); }
        /// <summary>Touch button scale, 1.0–1.4 (ASTRA: 100–140 %).</summary>
        public static float ButtonScale { get => Mathf.Clamp(F("btnscale", 1f), 1f, 1.4f); set => SetF("btnscale", Mathf.Clamp(value, 1f, 1.4f)); }
        public static bool LeftHanded { get => I("lefthand", 0) == 1; set => SetI("lefthand", value ? 1 : 0); }
        /// <summary>Gamepad rumble (D51).</summary>
        public static bool Vibration { get => I("vibration", 1) == 1; set => SetI("vibration", value ? 1 : 0); }
        public static bool ReducedMotion { get => I("reduced", 0) == 1; set => SetI("reduced", value ? 1 : 0); }
        /// <summary>Key overrides of the Input System (JSON from SaveBindingOverridesAsJson).</summary>
        public static string Bindings { get => PlayerPrefs.GetString(P + "bindings", ""); set { PlayerPrefs.SetString(P + "bindings", value ?? ""); Changed?.Invoke(); } }
        /// <summary>The "landscape gives a wider view" hint was dismissed once (ASTRA §10).</summary>
        public static bool LandscapeHintSeen { get => I("landhint", 0) == 1; set => SetI("landhint", value ? 1 : 0); }

        public static string Speed(float metresPerSecond) => Mph ? $"{metresPerSecond * 2.23694f:0}" : $"{metresPerSecond * 3.6f:0}";
        public static string SpeedUnit => Mph ? "mph" : "km/h";
        /// <summary>A distance in the player's unit: "420 m" / "1.2 km", or "0.3 mi".</summary>
        public static string Distance(float metres) => Mph ? $"{metres / 1609.34f:0.0} mi"
            : metres < 1000f ? $"{Mathf.Round(metres / 10f) * 10f:0} m" : $"{metres / 1000f:0.0} km";

        public static void ResetAll()
        {
            foreach (var k in new[] { "steer", "chase", "shake", "mph", "uiscale", "autothrottle", "lefthand", "reduced", "bindings", "btnscale", "vibration" }) PlayerPrefs.DeleteKey(P + k);
            Changed?.Invoke();
        }
    }
}
