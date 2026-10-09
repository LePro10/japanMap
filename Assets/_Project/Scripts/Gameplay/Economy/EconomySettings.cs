using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// Sparks payouts for free roam. Values from legacy ASTRA_PLAN.md §9 "One currency: Sparks"
    /// (pricing unit 3 000 Sparks per ten-minute session). Prices and saving are Phase 8.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Economy Settings")]
    public sealed class EconomySettings : ScriptableObject
    {
        [Header("Drift and stunt bank")]
        [Tooltip("Banked score per Spark; the remainder carries to the next bank (ASTRA: 100).")]
        public float scorePerSpark = 100f;
        [Tooltip("At most this many score Sparks within the rolling window (ASTRA: 400 per 90 s).")]
        public int scoreSparkCap = 400;
        public float scoreCapWindow = 90f;

        [Header("Exploration")]
        [Tooltip("First visit of a region (ASTRA: 200).")]
        public int regionReward = 200;
        [Tooltip("Extra for all eight regions (ASTRA: 800).")]
        public int allRegionsReward = 800;
        [Tooltip("Each discovery card (ASTRA: 100).")]
        public int discoveryReward = 100;
    }
}
