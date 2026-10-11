using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>Rewarded ad offers and their pacing (ASTRA §12). Minutes are active play minutes.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Ad Settings", fileName = "AdSettings")]
    public sealed class AdSettings : ScriptableObject
    {
        [Header("Result bonus")]
        [Tooltip("Fixed Sparks added by a watched result-bonus ad (ASTRA: +300; never a multiplier).")]
        public int resultBonus = 300;
        [Tooltip("An event must have lasted this long to offer the bonus, s (ASTRA: 45).")]
        public float minEventSeconds = 45f;
        [Tooltip("No offer before this much play in total, min (ASTRA: five minutes of the first visit).")]
        public float firstVisitMinutes = 5f;
        [Tooltip("Result bonuses at most this many times per rolling window (ASTRA: 3 per 30 min).")]
        public int resultPerWindow = 3;
        public float resultWindowMinutes = 30f;

        [Header("Long loan")]
        [Tooltip("Loan length, active s (ASTRA: 10 min).")]
        public float loanSeconds = 600f;
        [Tooltip("The earned-currency alternative for the same loan (ASTRA: 600 Sparks).")]
        public int loanPrice = 600;
        [Tooltip("Warning before the loan ends, s (ASTRA: 30).")]
        public float loanWarnSeconds = 30f;
        [Tooltip("Time to stop safely after the loan ends before it eases to a stop, s (ASTRA: 20).")]
        public float loanStopSeconds = 20f;
        [Tooltip("At most one loan by ad per this many minutes (ASTRA: 20).")]
        public float loanAdGapMinutes = 20f;

        [Header("Midgame ads (only at breaks: result left, travel)")]
        [Tooltip("Off = never (D35 until 2026-10-11). The human chose them for revenue (D42).")]
        public bool midgame = true;
        [Tooltip("No midgame before this much active play this session, min — the first minutes decide whether a player stays.")]
        public float midgameFirstMinutes = 3f;
        [Tooltip("At most one midgame per this many active minutes; also counts from the last rewarded ad (CrazyGames: ≥ 3).")]
        public float midgameGapMinutes = 3f;

        [Header("All rewarded ads")]
        [Tooltip("At most one rewarded ad per this many minutes (ASTRA: 5).")]
        public float rewardedGapMinutes = 5f;
    }
}
