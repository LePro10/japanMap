using System.Collections.Generic;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// When a rewarded offer may be shown (ASTRA §12), on an active-play clock: the caller advances
    /// <see cref="Active"/> only while the game is really played (not in menus, photos or ads).
    /// Pure logic for tests; <see cref="RewardedOffers"/> feeds it.
    /// </summary>
    public sealed class AdPolicy
    {
        readonly AdSettings _s;
        readonly List<float> _results = new();
        float _lastRewarded = float.NegativeInfinity, _lastLoanAd = float.NegativeInfinity;

        public AdPolicy(AdSettings settings) => _s = settings;

        /// <summary>Active play seconds this session.</summary>
        public float Active { get; set; }

        bool GapOk => Active - _lastRewarded >= _s.rewardedGapMinutes * 60f;

        /// <param name="totalPlaySeconds">All play so far (saved), for the first-visit wait.</param>
        public bool CanOfferResultBonus(float eventSeconds, float totalPlaySeconds)
        {
            if (eventSeconds < _s.minEventSeconds) return false;
            if (totalPlaySeconds < _s.firstVisitMinutes * 60f) return false;
            if (!GapOk) return false;
            var window = _s.resultWindowMinutes * 60f;
            var recent = 0;
            foreach (var t in _results) if (Active - t < window) recent++;
            return recent < _s.resultPerWindow;
        }

        public bool CanOfferLoanAd(float totalPlaySeconds) =>
            totalPlaySeconds >= _s.firstVisitMinutes * 60f && GapOk && Active - _lastLoanAd >= _s.loanAdGapMinutes * 60f;

        /// <summary>A result-bonus ad was watched.</summary>
        public void ResultWatched()
        {
            _lastRewarded = Active;
            _results.Add(Active);
        }

        /// <summary>A loan ad was watched.</summary>
        public void LoanWatched()
        {
            _lastRewarded = Active;
            _lastLoanAd = Active;
        }
    }
}
