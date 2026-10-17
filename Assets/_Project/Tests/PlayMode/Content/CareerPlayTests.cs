using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Save;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Career;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Intro;
using JapanMap.Gameplay.Map;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// The career in the running game (D50): a new save boots into the first drive with the menus locked; leaving the
    /// first drive opens the Open Bay; the bay and a part bought tick their steps and pay; the waypoint points at the
    /// bay; a restart continues at the same step; a drift chain banked through the real chain ticks the drift goal;
    /// skipping opens everything; an older save counts as done; the title's SKIP TUTORIAL skips the intro too.
    /// </summary>
    [FreshSave]
    public class CareerPlayTests
    {
        [SetUp]
        public void SetUp() => TitleScreen.ResetSession();

        [TearDown]
        public void TearDown()
        {
            CareerSystem.RunInEditor = false;
            FirstDrive.RunInEditor = false;
            TitleScreen.RunInEditor = false;
            Time.timeScale = 1f;
            AudioListener.pause = false;
            if (GameMenu.Instance != null && GameMenu.Instance.IsOpen) GameMenu.Instance.Close();
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
            Unlocks.Query = null;
        }

        static IEnumerator Boot()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 20; f++) yield return null;
        }

        static IEnumerator Restart()
        {
            Object.Destroy(Bootstrapper.Instance.gameObject);
            yield return null;
            yield return Boot();
        }

        static IEnumerator Until(System.Func<bool> done, float seconds)
        {
            for (var w = 0f; !done() && w < seconds; w += Time.unscaledDeltaTime) yield return null;
        }

        static string StepId(CareerSystem c) => c.Chain.Current?.id ?? "(done)";

        [UnityTest, Timeout(180000)]
        public IEnumerator NewSave_FirstDrive_OpenBay_FirstPart_Restart_Continues()
        {
            CareerSystem.RunInEditor = true;
            FirstDrive.RunInEditor = true;
            yield return Boot();
            var career = CareerSystem.Instance;
            var intro = Object.FindAnyObjectByType<FirstDrive>();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            Assert.NotNull(career, "FirstDrive builds the career (IntroSettings.career)");
            Assert.IsTrue(career.Active, "a new save plays the career");
            Assert.Contains(CareerChain.On, progress.Data.claims);
            Assert.AreSame(career.Chain, Unlocks.Query, "the menus ask the career");
            Assert.AreNotEqual(FirstDrive.Beat.Off, intro.Current, "first the first drive");
            Assert.IsFalse(Unlocks.IsUnlocked(FeatureId.Garage));
            Assert.IsFalse(Unlocks.IsUnlocked(FeatureId.Map));
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Nitro), "nitro from minute one");
            Assert.AreEqual("Unlocks: Finish the first drive", Unlocks.Hint(FeatureId.Garage));

            // Hold Tab's path: the first drive ends, its step ticks, the bay opens and becomes the waypoint.
            intro.Skip();
            yield return Until(() => StepId(career) == "open-bay" && career.Overlay.Goal != "", 5f);
            Assert.AreEqual("open-bay", StepId(career));
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Garage));
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Tuning));
            Assert.IsFalse(Unlocks.IsUnlocked(FeatureId.Paint));
            Assert.AreEqual("Drive into the Open Bay", career.Overlay.Goal, "the card names the goal");
            var garage = Object.FindAnyObjectByType<GarageSystem>();
            var map = Object.FindAnyObjectByType<MapSystem>();
            Assert.IsTrue(map.Waypoint.HasValue, "the bay is the waypoint");
            Assert.Less(Vector2.Distance(map.Waypoint.Value, garage.Entry), 0.1f);
            yield return Until(() => career.Overlay.LastBanner.Contains("OPEN BAY"), 10f);
            StringAssert.Contains("UNLOCKED", career.Overlay.LastBanner, "the unlock is announced");

            // The bay (E at the door opens it the same way), a part from the Tune page, paid from the first drive's
            // Sparks — or the starter fund, since Tab skipped the intro's rewards.
            garage.Open();
            yield return Until(() => career.Overlay.Goal == "Buy your first upgrade", 5f); // after the tick has played
            Assert.AreEqual("first-upgrade", StepId(career));
            Assert.GreaterOrEqual(progress.Wallet.Balance, progress.Tuning.Price(TuneCategory.Brakes, 1), "the buy step funded itself");
            var before = progress.Wallet.Balance;
            Assert.IsTrue(garage.Fit(TuneCategory.Brakes, 1));
            yield return Until(() => career.Overlay.Goal == "Give it a new colour", 5f);
            Assert.AreEqual("first-paint", StepId(career));
            Assert.AreEqual(before - progress.Tuning.Price(TuneCategory.Brakes, 1) + 300, progress.Wallet.Balance, "the step paid its 300");
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Paint));
            StringAssert.Contains("Buy your first upgrade", GameMenu.Instance.NoticeText, "the menu says it while in the bay");
            garage.Close();
            yield return null;

            // Restart on the same store: same step, still open, no intro again.
            yield return Restart();
            career = CareerSystem.Instance;
            Assert.IsTrue(career.Active);
            yield return Until(() => career.Chain.Index > 0, 3f);
            Assert.AreEqual("first-paint", StepId(career), "a restart continues at the step");
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Paint));
            Assert.IsFalse(Unlocks.IsUnlocked(FeatureId.Map));
            Assert.AreEqual(FirstDrive.Beat.Off, Object.FindAnyObjectByType<FirstDrive>().Current, "the first drive is seen");
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator DriftGoal_TicksOnABankedChain_ThenSkipOpensAll()
        {
            var a = CareerSettingsAsset();
            var saved = new ProgressData { claims = { CareerChain.On, FirstDrive.Claim } };
            foreach (var s in a.steps.TakeWhile(s => s.goal != CareerGoal.DriftChain)) saved.claims.Add(CareerChain.Claim(s));
            ProgressStore.Save(FreshSaveAttribute.Store, saved);
            CareerSystem.RunInEditor = true;
            yield return Boot();
            var career = CareerSystem.Instance;
            yield return Until(() => career.Overlay.Goal != "", 5f);
            Assert.AreEqual("drift-chain", StepId(career));
            StringAssert.Contains("2,000 point drift", career.Overlay.Goal);

            // Below the goal first (no tick), then a real chain through DriftScorer's own chain, banked.
            var drift = Object.FindAnyObjectByType<DriftScorer>();
            Drive(drift.Chain, 2f);
            drift.Chain.Bank();
            yield return new WaitForSecondsRealtime(0.3f);
            Assert.AreEqual("drift-chain", StepId(career), "a short chain is not enough");
            Drive(drift.Chain, 30f);
            Assert.Greater(drift.Chain.Pending, 2000f, "the test drift is long enough");
            drift.Chain.Bank();
            yield return Until(() => StepId(career) == "stunt", 5f);
            Assert.AreEqual("stunt", StepId(career), "a banked 2,000 chain ticks the drift goal");

            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var balance = progress.Wallet.Balance;
            career.Skip();
            Assert.IsFalse(career.Active);
            Assert.Contains(CareerChain.Done, progress.Data.claims);
            Assert.AreEqual(balance + a.skipSparks, progress.Wallet.Balance, "the start fund");
            foreach (FeatureId f in System.Enum.GetValues(typeof(FeatureId))) Assert.IsTrue(Unlocks.IsUnlocked(f), f.ToString());
            yield return Restart();
            Assert.IsFalse(CareerSystem.Instance.Active, "skipped for good");
        }

        [UnityTest, Timeout(60000)]
        public IEnumerator OlderSave_CountsAsDone()
        {
            ProgressStore.Save(FreshSaveAttribute.Store, new ProgressData { claims = { FirstDrive.Claim }, playSeconds = 900f, sparks = 5000 });
            CareerSystem.RunInEditor = true;
            yield return Boot();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            Assert.IsFalse(CareerSystem.Instance.Active);
            Assert.Contains(CareerChain.Done, progress.Data.claims, "remembered: it never starts later");
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Map));
            Assert.AreEqual(5000, progress.Wallet.Balance, "nothing paid for it");
        }

        [UnityTest, Timeout(90000)]
        public IEnumerator Title_SkipTutorial_AsksOnce_ThenStartsLikeAReturningPlayer()
        {
            CareerSystem.RunInEditor = true;
            FirstDrive.RunInEditor = true;
            TitleScreen.RunInEditor = true;
            yield return Boot();
            yield return Until(() => TitleScreen.Instance != null && TitleScreen.Instance.Current == TitleScreen.State.Shown, 20f);
            var title = TitleScreen.Instance;
            var skip = title.Root.Q<UnityEngine.UIElements.Button>("title-skip");
            Assert.NotNull(skip, "a new player sees SKIP TUTORIAL");
            title.SkipTutorial();
            Assert.IsTrue(CareerSystem.Instance.Active, "the first press only asks");
            StringAssert.Contains("SKIP TUTORIAL?", skip.Q<UnityEngine.UIElements.Label>(className: "jm-title__btn-label").text);
            title.SkipTutorial();
            Assert.IsFalse(CareerSystem.Instance.Active);
            yield return Until(() => title.Current == TitleScreen.State.Done, 10f);
            Assert.AreEqual(FirstDrive.Beat.Off, Object.FindAnyObjectByType<FirstDrive>().Current, "no first drive after a skip");
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.CarShop));
        }

        static CareerSettings CareerSettingsAsset() =>
            Object.FindAnyObjectByType<FirstDrive>() is { } d && d.Settings != null ? d.Settings.career
                : Resources.FindObjectsOfTypeAll<CareerSettings>().FirstOrDefault() ?? LoadInEditor();

        static CareerSettings LoadInEditor()
        {
#if UNITY_EDITOR
            return UnityEditor.AssetDatabase.LoadAssetAtPath<CareerSettings>("Assets/_Project/Data/Gameplay/Career.asset");
#else
            return null;
#endif
        }

        /// <summary>A steady drift at 60 km/h and 30° for <paramref name="seconds"/>, stepped at the physics rate.</summary>
        static void Drive(DriftChain chain, float seconds)
        {
            var v = 60f / 3.6f;
            for (var t = 0f; t < seconds; t += 0.02f)
                chain.Step(0.02f, new DriftSample { speed = v, forwardSpeed = v, slip = 30f * Mathf.Deg2Rad });
        }
    }
}
