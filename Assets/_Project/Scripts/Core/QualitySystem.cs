using System;
using JapanMap.Core.Platform;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// The quality tier ("High", "Medium", "Low" — the URP quality levels in ProjectSettings). Default is Auto (D38): a first
    /// guess by device (phones and weak GPUs low, integrated graphics medium), then a measurement in real play steps down
    /// while the median frame rate stays below the threshold. A tier picked by hand in Settings switches Auto off;
    /// "Recalibrate" starts it again. <c>?quality=Low</c> in the page URL wins (tests, support).
    /// </summary>
    public sealed class QualitySystem : GameSystem
    {
        public const string PrefsKey = "jm.quality";
        public const string AutoKey = "jm.quality.auto";
        public const string Auto = "Auto";
        public static readonly string[] Tiers = { "High", "Medium", "Low" };

        [SerializeField] QualityCalibration calibration;

        /// <summary>Raised after a tier is applied (name). Systems with per-tier settings that Unity's quality level does not cover listen here.</summary>
        public static event Action<string> TierChanged;

        /// <summary>No measuring while this is set (the world is still streaming in: frames are not representative).</summary>
        public static bool Hold { get; set; }
        /// <summary>The player left the choice to the game.</summary>
        public static bool IsAuto { get; private set; } = true;
        /// <summary>Auto has measured and settled (this session or an earlier one).</summary>
        public static bool Settled { get; private set; }
        /// <summary>Median frame rate of the last measurement (0: none yet).</summary>
        public static float MeasuredFps { get; private set; }
        public static string Current => QualitySettings.names[QualitySettings.GetQualityLevel()];

        static QualitySystem _instance;
        QualityCalibrator _calibrator;
        bool _fromUrl;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Hold = false;
            IsAuto = true;
            Settled = false;
            MeasuredFps = 0f;
            _instance = null;
        }

        protected override void OnInitialize()
        {
            _instance = this;
            _calibrator = new QualityCalibrator(calibration != null ? calibration : ScriptableObject.CreateInstance<QualityCalibration>());
            var names = QualitySettings.names;
            var saved = PlayerPrefs.GetString(PrefsKey, Auto);
            string chosen;
            if (Array.IndexOf(names, saved) >= 0)
            {
                IsAuto = false;
                chosen = saved;
            }
            else
            {
                IsAuto = true;
                var auto = PlayerPrefs.GetString(AutoKey, "");
                Settled = Array.IndexOf(names, auto) >= 0;
                chosen = Settled ? auto : QualityCalibrator.Guess(calibration, Application.isMobilePlatform, SystemInfo.graphicsDeviceName, names);
            }
            var fromUrl = FromUrl(Application.absoluteURL);
            if (Array.IndexOf(names, fromUrl) >= 0)
            {
                chosen = fromUrl;
                _fromUrl = true; // a test asks for exactly this tier: no measuring, nothing saved
            }
            Debug.Log($"[Quality] {chosen} ({(_fromUrl ? "url" : IsAuto ? (Settled ? "auto, measured before" : $"auto, guess for {SystemInfo.graphicsDeviceName}") : "chosen")})");
            Apply(chosen);
        }

        void Update()
        {
            // The editor's frame rate says nothing about the browser; tests and URL tiers stay as asked.
            if (!IsAuto || Settled || _fromUrl || Application.isEditor) return;
            if (!GamePlatform.Playing || Hold) return;
            var index = Array.IndexOf(Tiers, Current);
            var verdict = _calibrator.Add(Time.unscaledDeltaTime, index >= 0 && index < Tiers.Length - 1);
            if (verdict == QualityCalibrator.Verdict.Measuring) return;
            MeasuredFps = _calibrator.LastFps;
            if (verdict == QualityCalibrator.Verdict.StepDown)
            {
                Debug.Log($"[Quality] {Current}: {MeasuredFps:0} fps — one step down");
                Apply(Tiers[index + 1]);
                return; // measure the new tier too
            }
            Settled = true;
            PlayerPrefs.SetString(AutoKey, Current);
            PlayerPrefs.Save(); // once per session: Update returns early after this
            Debug.Log($"[Quality] auto settled on {Current} ({MeasuredFps:0} fps)");
        }

        /// <summary>A tier chosen by hand (Settings): Auto off, the choice saved.</summary>
        public static void SetTier(string tier, bool save = true)
        {
            if (save)
            {
                IsAuto = false;
                PlayerPrefs.SetString(PrefsKey, tier);
                PlayerPrefs.Save();
            }
            Apply(tier);
        }

        /// <summary>Back to Auto and measure again from the device's first guess ("Recalibrate").</summary>
        public static void Recalibrate()
        {
            IsAuto = true;
            Settled = false;
            MeasuredFps = 0f;
            PlayerPrefs.SetString(PrefsKey, Auto);
            PlayerPrefs.DeleteKey(AutoKey);
            PlayerPrefs.Save();
            if (_instance != null)
            {
                _instance._calibrator.Restart();
                _instance._fromUrl = false;
            }
            Apply(QualityCalibrator.Guess(_instance != null ? _instance.calibration : null, Application.isMobilePlatform, SystemInfo.graphicsDeviceName, QualitySettings.names));
        }

        static void Apply(string tier)
        {
            var index = Array.IndexOf(QualitySettings.names, tier);
            if (index < 0)
            {
                Debug.LogWarning($"[Quality] unknown tier '{tier}'");
                return;
            }
            QualitySettings.SetQualityLevel(index, applyExpensiveChanges: true);
            // ?lodbias=1.5: measurement knob for one browser build (A/B, Phase 10), not a setting.
            if (float.TryParse(UrlParam(Application.absoluteURL, "lodbias"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var bias))
                QualitySettings.lodBias = bias;
            TierChanged?.Invoke(tier);
        }

        public static string FromUrl(string url) => UrlParam(url, "quality");

        /// <summary>A query parameter of the page URL (null when absent).</summary>
        public static string UrlParam(string url, string name)
        {
            if (string.IsNullOrEmpty(url)) return null;
            var q = url.IndexOf('?');
            if (q < 0) return null;
            foreach (var part in url.Substring(q + 1).Split('&', '#'))
                if (part.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase)) return part.Substring(name.Length + 1);
            return null;
        }

        /// <summary>Phones get Low; everything else starts on High (without a GPU name).</summary>
        public static string ChooseDefault(bool isMobile, string[] available) => QualityCalibrator.Guess(null, isMobile, "", available);
    }
}
