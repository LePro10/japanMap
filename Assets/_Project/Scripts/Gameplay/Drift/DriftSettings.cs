using UnityEngine;

namespace JapanMap.Gameplay.Drift
{
    /// <summary>
    /// Drift score rules. Values from legacy ASTRA_PLAN.md §5 "Drift score: make a chain readable, not
    /// disposable" — the designed successor of the prototype's DriftScore.ts (owner's TODO: keep the ×5
    /// cap, but from ×2 on each step takes far longer).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Drift Settings")]
    public sealed class DriftSettings : ScriptableObject
    {
        [Header("What counts as a drift")]
        [Tooltip("Slower than this does not score, km/h (ASTRA: ≥ 30 km/h).")]
        public float minKmh = 30f;
        [Tooltip("Slip angle below this is a fast corner, degrees (ASTRA: ≥ 12°).")]
        public float minAngle = 12f;
        [Tooltip("Above this the car is spinning, not drifting: no score, degrees (ASTRA: 70°).")]
        public float maxAngle = 70f;

        [Header("Score rate")]
        [Tooltip("Points per second at the reference speed and angle (ASTRA: 100 at 30 km/h and 20°).")]
        public float baseRate = 100f;
        public float refKmh = 30f;
        public float refAngle = 20f;
        [Tooltip("Speed factor grows linearly to this cap… (ASTRA: 2× at 100 km/h)")]
        public float speedCap = 2f;
        public float speedCapKmh = 100f;
        [Tooltip("…and the angle factor to this one (ASTRA: 1.5× at 50°).")]
        public float angleCap = 1.5f;
        public float angleCapDeg = 50f;

        [Header("Chain")]
        [Tooltip("Accumulated drift seconds that unlock ×2, ×3, ×4, ×5. The gaps double (ASTRA: 6/18/42/90 s).")]
        public float[] multiplierSteps = { 6f, 18f, 42f, 90f };
        [Tooltip("Seconds without a scoring drift before the chain banks itself (ASTRA: 3 s).")]
        public float linkGap = 3f;
        [Tooltip("Flat points for a clean change of drift direction, at most once per cooldown (ASTRA: 150 / 2 s).")]
        public float switchBonus = 150f;
        public float switchCooldown = 2f;

        [Header("Contacts")]
        [Tooltip("A hit that takes at least this much speed is a crash, km/h (ASTRA: 10).")]
        public float crashKmh = 10f;
        [Tooltip("Share of the open chain that a crash still banks (ASTRA: 50%).")]
        [Range(0f, 1f)] public float crashBankShare = 0.5f;
        [Tooltip("A brush (below crashKmh) cuts the remaining link time to this, s (ASTRA: 0.5).")]
        public float brushGrace = 0.5f;
        [Tooltip("Ignore contacts smaller than this, km/h — kerbs and spring kicks are not brushes.")]
        public float contactNoiseKmh = 2f;
        [Tooltip("Speed loss after a contact is read over this window, s (a hit spreads over a few physics steps).")]
        public float contactWindow = 0.1f;

        [Header("Spot bonus")]
        [Tooltip("Base-score factor inside a drift zone, separate from the chain multiplier (ASTRA: 2×).")]
        public float spotBonus = 2f;
    }
}
