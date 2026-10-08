using System;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// Picks the quality tier at start (saved choice, else a default by device class).
    /// Tiers are the URP quality levels "High", "Medium", "Low" in ProjectSettings.
    /// </summary>
    public sealed class QualitySystem : GameSystem
    {
        public const string PrefsKey = "jm.quality";
        public static readonly string[] Tiers = { "High", "Medium", "Low" };

        /// <summary>Raised after a tier is applied (name). Systems with per-tier settings that Unity's quality level does not cover listen here.</summary>
        public static event Action<string> TierChanged;

        protected override void OnInitialize()
        {
            var names = QualitySettings.names;
            var saved = PlayerPrefs.GetString(PrefsKey, "");
            var chosen = Array.IndexOf(names, saved) >= 0 ? saved : ChooseDefault(Application.isMobilePlatform, names);
            SetTier(chosen, save: false);
        }

        public static void SetTier(string tier, bool save = true)
        {
            var index = Array.IndexOf(QualitySettings.names, tier);
            if (index < 0)
            {
                Debug.LogWarning($"[Quality] unknown tier '{tier}'");
                return;
            }
            QualitySettings.SetQualityLevel(index, applyExpensiveChanges: true);
            if (save) PlayerPrefs.SetString(PrefsKey, tier);
            TierChanged?.Invoke(tier);
        }

        /// <summary>Phones get Low; everything else starts on High (auto-detection comes in Phase 10).</summary>
        public static string ChooseDefault(bool isMobile, string[] available)
        {
            var wanted = isMobile ? "Low" : "High";
            if (Array.IndexOf(available, wanted) >= 0) return wanted;
            return available.Length > 0 ? available[0] : wanted;
        }
    }
}
