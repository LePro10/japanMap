using System.Collections;
using JapanMap.Core;
using JapanMap.Core.Platform;
using JapanMap.Core.Save;
using JapanMap.Core.Ui;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Phase 10.1 on the game's path: gameplay start/stop follows every break (menu, photo mode), the portal's mute
    /// and an ad silence the game, the result bonus after a real event adds exactly +300 (or says "No ad available"),
    /// and the long loan runs after a test drive and returns the own car.
    /// </summary>
    [FreshSave]
    public class PlatformTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _kb = InputSystem.AddDevice<Keyboard>("TestKeyboard");
            InputSystem.EnableDevice(_kb);
            OfflinePlatform.Simulate = OfflinePlatform.AdSim.Fill;
            OfflinePlatform.SimSeconds = 0.5f;
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            AudioListener.pause = false;
            GamePlatform.PortalMuted = false;
            OfflinePlatform.Simulate = OfflinePlatform.AdSim.Fill;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        IEnumerator Tap(Key key)
        {
            InputSystem.QueueStateEvent(_kb, new KeyboardState(key));
            InputSystem.Update();
            yield return null;
            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            yield return null;
        }

        IEnumerator BootInCar()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;
            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
        }

        /// <summary>A returning player: ten minutes played (past the first-visit wait), some Sparks.</summary>
        static void SaveWith(int sparks, float playSeconds) =>
            ProgressStore.Save(FreshSaveAttribute.Store, new ProgressData { sparks = sparks, playSeconds = playSeconds });

        [UnityTest, Timeout(90000)]
        public IEnumerator GameplayStop_OnEveryBreak_MuteFollowsPortalAndAds()
        {
            yield return BootInCar();
            Assert.IsTrue(GamePlatform.WorldReady, "the game scene reports a drivable world");
            Assert.IsTrue(GamePlatform.Playing, "gameplay started in the car");
            var starts = GamePlatform.GameplayStarts;

            yield return Tap(Key.Escape);
            Assert.IsFalse(GamePlatform.Playing, "the menu is a break: gameplayStop");
            yield return Tap(Key.Escape);
            yield return new WaitForSecondsRealtime(1.2f);
            Assert.IsTrue(GamePlatform.Playing, "closing the menu starts gameplay again");
            Assert.AreEqual(starts + 1, GamePlatform.GameplayStarts);

            // Menu open and shut at once, twice: the second start keeps CrazyGames' one-second gap (no throttle error).
            yield return Tap(Key.Escape);
            yield return Tap(Key.Escape);
            var at = Time.realtimeSinceStartup;
            while (!GamePlatform.Playing && Time.realtimeSinceStartup - at < 3f) yield return null;
            Assert.IsTrue(GamePlatform.Playing);

            yield return Tap(Key.P);
            Assert.IsFalse(GamePlatform.Playing, "photo mode is a break");
            while (UiStack.Count > 0) yield return Tap(Key.Escape);
            yield return new WaitForSecondsRealtime(1.2f);
            Assert.IsTrue(GamePlatform.Playing);

            GamePlatform.PortalMuted = true;
            Assert.AreEqual(0f, AudioListener.volume, "CrazyGames muteAudio silences the game");
            GamePlatform.PortalMuted = false;
            Assert.AreEqual(1f, AudioListener.volume);

            var outcome = (AdOutcome?)null;
            GamePlatform.ShowRewarded(o => outcome = o);
            yield return null;
            Assert.IsTrue(GamePlatform.AdRunning);
            Assert.AreEqual(0f, AudioListener.volume, "silent during the ad");
            Assert.AreEqual(0f, Time.timeScale, "paused during the ad");
            Assert.IsFalse(GamePlatform.Playing, "an ad is a break");
            yield return new WaitForSecondsRealtime(0.8f);
            Assert.AreEqual(AdOutcome.Rewarded, outcome);
            Assert.AreEqual(1f, Time.timeScale, "time runs again after the ad");
            Assert.AreEqual(1f, AudioListener.volume);
            yield return new WaitForSecondsRealtime(1.2f);
            Assert.IsTrue(GamePlatform.Playing);
        }

        [UnityTest, Timeout(600000)]
        public IEnumerator ResultBonus_AfterARealEvent_AddsExactly300_ThenNoAdAvailable()
        {
            SaveWith(1000, 900f);
            yield return BootInCar();
            var race = Object.FindAnyObjectByType<RaceDirector>();
            var hud = Object.FindAnyObjectByType<GameplayHud>();
            var offers = RewardedOffers.Instance;
            var wallet = Object.FindAnyObjectByType<SparksWallet>();
            Assert.NotNull(offers, "World/Content/RewardedOffers missing — run Content/Setup");

            IEnumerator RunEvent()
            {
                race.Autopilot = true;
                Assert.IsTrue(race.Begin("needle-sprint"));
                Time.timeScale = 4f;
                var start = Time.time;
                while (race.Current != RaceDirector.State.Finished && race.Current != RaceDirector.State.Idle && Time.time - start < 600f)
                    yield return new WaitForFixedUpdate();
                Time.timeScale = 1f;
                Assert.AreEqual(RaceDirector.State.Finished, race.Current, "the event finished");
                yield return null;
            }

            yield return RunEvent();
            Assert.GreaterOrEqual(race.Last.seconds, offers.Settings.minEventSeconds, "needle-sprint lasts long enough for the offer");
            Assert.IsTrue(offers.ResultOffered, "the result offers the bonus");
            Assert.IsTrue(race.HoldResult, "the result waits for the choice");
            var before = wallet.Balance;
            offers.WatchResultAd();
            yield return new WaitForSecondsRealtime(0.8f);
            Assert.AreEqual(before + 300, wallet.Balance, "exactly +300, no multiplier");
            StringAssert.Contains("+300 Sparks", hud.SheetBody);
            Assert.IsFalse(offers.ResultOffered);

            // The next result within five active minutes: no offer at all.
            race.Abort("test");
            yield return RunEvent();
            Assert.IsFalse(offers.ResultOffered, "one rewarded ad per five active minutes");

            // Five active minutes later, no ad fills: "No ad available", nothing granted.
            race.Abort("test");
            offers.Policy.Active += 5 * 60f + 1f;
            OfflinePlatform.Simulate = OfflinePlatform.AdSim.Unfilled;
            yield return RunEvent();
            Assert.IsTrue(offers.ResultOffered);
            before = wallet.Balance;
            offers.WatchResultAd();
            yield return new WaitForSecondsRealtime(0.8f);
            Assert.AreEqual(before, wallet.Balance, "no ad, no bonus");
            StringAssert.Contains(RewardedOffers.NoAd, hud.SheetBody);
            Assert.IsFalse(race.HoldResult, "the result goes on as normal");
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator Loan_AfterTestDrive_ByAd_Warns_EndsSafely_BackInTheOwnCar()
        {
            SaveWith(1000, 900f);
            yield return BootInCar();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var garage = Object.FindAnyObjectByType<GarageSystem>();
            var offers = RewardedOffers.Instance;
            Assert.AreEqual((false, false), offers.LoanOffers("mame"), "no loan before the free test drive");
            Assert.IsTrue(garage.TestDrive("mame"));
            yield return new WaitForSeconds(0.3f);
            garage.EndTestDrive();
            yield return new WaitForSeconds(0.3f);
            Assert.AreEqual("hachi", player.Car.Definition.id);
            Assert.AreEqual((true, true), offers.LoanOffers("mame"), "after it: the ad and the Sparks loan");

            var answered = (bool?)null;
            offers.BorrowByAd("mame", ok => answered = ok);
            yield return new WaitForSecondsRealtime(0.8f);
            Assert.AreEqual(true, answered);
            Assert.IsTrue(garage.Lending);
            Assert.AreEqual("mame", player.Car.Definition.id, "driving the loan");
            Assert.AreEqual(offers.Settings.loanSeconds, garage.TestDriveLeft, 1f);
            Assert.IsFalse(offers.LoanOffers("kumo").ad, "no second loan offer during a loan");

            // Let the clock run out while driving: first a chance to stop, then the car stops itself.
            InputSystem.QueueStateEvent(_kb, new KeyboardState(Key.W));
            InputSystem.Update();
            yield return new WaitForSeconds(2f);
            var lendField = typeof(GarageSystem).GetField("_testLeft", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            lendField.SetValue(garage, 0.5f); // test shortcut: the last half second of ten minutes
            garage.LoanStopSeconds = 1f;
            yield return new WaitForSeconds(1f);
            Assert.IsTrue(garage.Lending, "never swapped at speed");
            var t0 = Time.time;
            while (garage.Lending && Time.time - t0 < 15f) yield return null;
            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            Assert.IsFalse(garage.Lending, "the loan ended after a controlled stop");
            yield return null;
            Assert.AreEqual("hachi", player.Car.Definition.id, "back in the own car");
            Assert.IsFalse(Object.FindAnyObjectByType<PlayerProgress>().Wallet.Frozen, "earning again");
        }
    }
}
