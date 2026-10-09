using System;
using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    public enum MilestoneKind { TopSpeedKmh, AirtimeSeconds, JumpMetres, BankedChain, DistanceKm }

    /// <summary>
    /// Sparks payouts and the economy's target. Values from legacy ASTRA_PLAN.md §9 "One currency: Sparks"
    /// (pricing unit 3 000 Sparks per ten-minute session). Car prices sit on each VehicleDefinition, tuning
    /// prices in Data/Vehicles/Tuning.asset; docs/ECONOMY.md is the simulated table of all of them.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Economy Settings")]
    public sealed class EconomySettings : ScriptableObject
    {
        [Serializable]
        public struct Milestone
        {
            public MilestoneKind kind;
            public float threshold;
            public int reward;
        }

        [Header("Drift and stunt bank")]
        [Tooltip("Banked score per Spark; the remainder carries to the next bank (ASTRA: 100; 50 since D29 — simulated, " +
                 "at 100 a casual drifter earned 800 per ten minutes).")]
        public float scorePerSpark = 50f;
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

        [Header("Events and records")]
        [Tooltip("First bronze-or-better in each event, once (ASTRA: 150).")]
        public int firstMedalReward = 150;
        [Tooltip("Personal milestones, each once per save (ASTRA §9: 15 × 100 = 1 500).")]
        public Milestone[] milestones =
        {
            new() { kind = MilestoneKind.TopSpeedKmh, threshold = 160, reward = 100 },
            new() { kind = MilestoneKind.TopSpeedKmh, threshold = 220, reward = 100 },
            new() { kind = MilestoneKind.TopSpeedKmh, threshold = 280, reward = 100 },
            new() { kind = MilestoneKind.AirtimeSeconds, threshold = 1, reward = 100 },
            new() { kind = MilestoneKind.AirtimeSeconds, threshold = 2, reward = 100 },
            new() { kind = MilestoneKind.AirtimeSeconds, threshold = 3, reward = 100 },
            new() { kind = MilestoneKind.JumpMetres, threshold = 15, reward = 100 },
            new() { kind = MilestoneKind.JumpMetres, threshold = 35, reward = 100 },
            new() { kind = MilestoneKind.JumpMetres, threshold = 60, reward = 100 },
            new() { kind = MilestoneKind.BankedChain, threshold = 5000, reward = 100 },
            new() { kind = MilestoneKind.BankedChain, threshold = 20000, reward = 100 },
            new() { kind = MilestoneKind.BankedChain, threshold = 60000, reward = 100 },
            new() { kind = MilestoneKind.DistanceKm, threshold = 10, reward = 100 },
            new() { kind = MilestoneKind.DistanceKm, threshold = 30, reward = 100 },
            new() { kind = MilestoneKind.DistanceKm, threshold = 100, reward = 100 },
        };
        [Tooltip("A road speed milestone needs this long above the threshold, s (ASTRA: 0.5).")]
        public float speedHoldSeconds = 0.5f;

        [Header("Event payouts")]
        [Tooltip("Sparks per second of an event cycle (drive there, card, race, result) at an ordinary result. " +
                 "Event payouts are seeded from it, so long and short events pay the same per minute (D29).")]
        public float eventSparksPerSecond = 5.5f;
        [Tooltip("Share of the ordinary payout that is the completion base; the rest comes from the placement/medal bonus.")]
        [Range(0.5f, 0.95f)] public float completionShare = 0.75f;

        [Header("Target (ASTRA §9)")]
        [Tooltip("Ordinary ten-minute session, without one-time bonuses and ads: lower and upper end.")]
        public Vector2Int sessionBand = new(2400, 3600);
        [Tooltip("Pricing unit: Sparks of one ordinary session.")]
        public int sessionUnit = 3000;
        [Tooltip("An activity paying more than this × the median Sparks per minute is rebalanced (ASTRA §11).")]
        public float outlierFactor = 1.5f;
        [Tooltip("Upper bound of a plausible balance — protects against broken saves.")]
        public int maxBalance = 9_999_999;
    }
}
