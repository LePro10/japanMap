using System;
using JapanMap.Core.Platform;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// The two rewarded offers of ASTRA §12, never on the driving HUD: the result bonus ("Watch ad · +300 Sparks" next
    /// to the result's own buttons, after an event of 45 s or more) and the long loan on an unowned car's page after
    /// its free test drive ("Watch ad · borrow for 10 minutes" or "Borrow · 600 Sparks"). Pacing by <see cref="AdPolicy"/>
    /// on active play time. No ad → "No ad available" once, the same screen, nothing granted or taken. With ads off
    /// for the environment the ad actions are hidden; the Sparks loan and the free test drive stay.
    /// </summary>
    public sealed class RewardedOffers : MonoBehaviour
    {
        public const string NoAd = "No ad available";
        /// <summary>Shown where an ad option would be (CrazyGames: a notice, not a popup, and no dead ad button).</summary>
        public const string AdBlockedNote = "Ad options are off while an ad blocker is active.";

        [SerializeField] AdSettings settings;
        [SerializeField] SparksWallet wallet;
        [SerializeField] PlayerProgress progress;
        [SerializeField] GameplayHud hud;
        [SerializeField] RaceDirector races;
        [SerializeField] GarageSystem garage;

        AdPolicy _policy;

        public static RewardedOffers Instance { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = null;

        public AdSettings Settings => settings;
        public AdPolicy Policy => _policy;
        /// <summary>The result sheet carries the ad offer now (tests, play scripts).</summary>
        public bool ResultOffered { get; private set; }
        public string ResultLabel => $"Watch ad · +{settings.resultBonus} Sparks";
        public string LoanAdLabel => $"Watch ad · borrow for {settings.loanSeconds / 60f:0} minutes";
        public string LoanBuyLabel => $"Borrow · {settings.loanPrice:N0} Sparks";

        float TotalPlay => progress != null && progress.Data != null ? progress.Data.playSeconds : 0f;

        void Awake()
        {
            Instance = this;
            _policy = new AdPolicy(settings);
            if (garage != null)
            {
                garage.LoanWarnSeconds = settings.loanWarnSeconds;
                garage.LoanStopSeconds = settings.loanStopSeconds;
            }
        }

        void OnEnable()
        {
            if (races != null) { races.Finished += OnFinished; races.Beginning += OnBeginning; }
        }

        void OnDisable()
        {
            if (races != null) { races.Finished -= OnFinished; races.Beginning -= OnBeginning; }
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        // Active play only: menus, photo mode, the garage and ads stop the clock (GamePlatform.Playing).
        void Update()
        {
            if (GamePlatform.Playing) _policy.Active += Time.unscaledDeltaTime;
        }

        // Timed events use the own car: a test drive or loan ends where it stands (ASTRA §12).
        void OnBeginning(string id)
        {
            if (garage != null && garage.TestDriving) garage.EndTestDrive(here: true);
        }

        void OnFinished(RaceDirector.Result result)
        {
            ResultOffered = false;
            if (!result.completed || !GamePlatform.Current.AdsEnabled) return;
            if (!_policy.CanOfferResultBonus(result.seconds, TotalPlay)) return;
            ResultOffered = true;
            races.HoldResult = true;
            hud.AddSheetButton(ResultLabel, WatchResultAd);
        }

        /// <summary>The result-bonus button.</summary>
        public void WatchResultAd()
        {
            if (!ResultOffered) return;
            ResultOffered = false;
            GamePlatform.ShowRewarded(outcome =>
            {
                races.HoldResult = false;
                var body = hud.SheetBody;
                if (outcome == AdOutcome.Rewarded)
                {
                    _policy.ResultWatched();
                    wallet.Add(settings.resultBonus, "Ad bonus");
                    progress?.Flush();
                    hud.ReviseSheet($"{body}\n+{settings.resultBonus} Sparks · thanks for watching", ResultLabel);
                    GamePlatform.Current.HappyTime();
                }
                else hud.ReviseSheet($"{body}\n{NoAd}", ResultLabel);
            });
        }

        /// <summary>The loan offers for a car page: (ad allowed, Sparks loan allowed). Both false = no loan here.</summary>
        public (bool ad, bool buy) LoanOffers(string carId)
        {
            if (garage == null || progress == null || progress.Owns(carId) || !garage.WasTested(carId) || garage.TestDriving)
                return (false, false);
            var ad = GamePlatform.Current.AdsEnabled && _policy.CanOfferLoanAd(TotalPlay);
            return (ad, true);
        }

        /// <summary>
        /// Loan by ad. <paramref name="answered"/> comes first (true = watched; the caller closes its page), then the
        /// loan starts; false = "No ad available", nothing changes.
        /// </summary>
        public void BorrowByAd(string carId, Action<bool> answered)
        {
            GamePlatform.ShowRewarded(outcome =>
            {
                var ok = outcome == AdOutcome.Rewarded;
                answered?.Invoke(ok);
                if (!ok) return;
                _policy.LoanWatched();
                garage.Borrow(carId, settings.loanSeconds);
            });
        }

        /// <summary>Loan for Sparks (the earned-currency alternative). False when the balance does not reach.</summary>
        public bool BorrowForSparks(string carId)
        {
            if (wallet == null || !wallet.Spend(settings.loanPrice)) return false;
            progress?.MarkDirty();
            if (garage.Borrow(carId, settings.loanSeconds)) return true;
            wallet.Add(settings.loanPrice, "Refund"); // could not start (no car to return to): nothing taken
            return false;
        }
    }
}
