using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Save → restart → everything is back (Phase 8.3), earned on the game's own paths: a region by walking, a
    /// discovery with E, an event with the autopilot, a car bought, the car parked. Then the game restarts on the
    /// same store. A broken store must not break the game.
    /// </summary>
    [FreshSave]
    public class SaveRestartTests
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
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_kb, new KeyboardState(keys));
            InputSystem.Update();
        }

        IEnumerator Tap(Key key)
        {
            Press(key);
            yield return null;
            Press();
            yield return null;
        }

        static IEnumerator BootGame()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;
        }

        /// <summary>A restart: the running game goes away completely, Boot loads again on the same store.</summary>
        static IEnumerator Restart()
        {
            Object.Destroy(Bootstrapper.Instance.gameObject);
            yield return null;
            yield return BootGame();
        }

        static Vector3 OnGround(Vector3 p) =>
            Physics.Raycast(p + Vector3.up * 30f, Vector3.down, out var hit, 60f, ~GameLayers.NotGround) ? hit.point : p;

        [UnityTest, Timeout(300000)]
        public IEnumerator EarnedOnRealPaths_SurvivesARestart()
        {
            // A returning player with some Sparks, so the purchase below is affordable; the rest is earned now.
            ProgressStore.Save(FreshSaveAttribute.Store, new ProgressData { sparks = 2000 });
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var regions = Object.FindAnyObjectByType<RegionWatch>();
            var cards = Object.FindAnyObjectByType<DiscoverySystem>();
            Assert.AreEqual(ProgressStore.Source.Saved, progress.LoadedFrom);
            Assert.AreEqual(2000, progress.Wallet.Balance);

            // Region: walk a few metres in Sakura Commons.
            Press(Key.D);
            yield return new WaitForSeconds(3f);
            Press();
            CollectionAssert.Contains(regions.Explored, "commons");

            // Discovery SC1 with E.
            var sc1 = cards.Set.cards.First(c => c.id == "SC1");
            var at = OnGround(new Vector3(sc1.position.x, sc1.ground, sc1.position.y));
            player.Walker.Place(at + Vector3.back * 1.2f + Vector3.up * 2f, 0f);
            for (var f = 0; f < 5; f++) yield return null;
            yield return Tap(Key.E);
            CollectionAssert.Contains(cards.Found, "SC1");

            // An event, driven by the autopilot (Open Seat: 62 s, sped up). Call the car (H path), F in.
            player.PressCall();
            yield return new WaitForSeconds(0.5f);
            player.Walker.Place(player.Car.transform.position + player.Car.transform.right * 2.2f + Vector3.up, 0f);
            for (var f = 0; f < 5; f++) yield return null;
            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);
            var race = Object.FindAnyObjectByType<RaceDirector>();
            race.Autopilot = true;
            var finished = false;
            race.Finished += _ => finished = true;
            Assert.IsTrue(race.Begin("open-seat"));
            Time.timeScale = 4f;
            var t0 = Time.time;
            while (!finished && Time.time - t0 < 200f) yield return null;
            Time.timeScale = 1f;
            Assert.IsTrue(finished, "Open Seat did not finish");
            var tier = progress.Data.Event("open-seat").bestTier;
            var best = progress.Data.Event("open-seat").bests.Single();

            // A car bought (the garage button's action), then parked still for the safe-position save.
            var bought = progress.BuyCar(progress.Fleet.Get("mame"));
            Assert.IsTrue(bought, $"balance {progress.Wallet.Balance} after region, card and event buys the Mame K");
            while (race.Current != RaceDirector.State.Idle && Time.time - t0 < 260f) yield return null;
            Press(Key.Space); // park: handbrake on, as a player would on a slope
            yield return new WaitForSeconds(4f);
            Press();
            progress.Flush();
            var balance = progress.Wallet.Balance;
            var parked = player.Car.transform.position;
            Assert.IsTrue(progress.Data.hasLastPosition, "parked 3 s: the safe spot is saved");
            Assert.Less(Vector3.Distance(parked, progress.Data.lastPosition), 1.5f,
                $"saved spot {progress.Data.lastPosition} vs car {parked} ({player.Car.Definition.id}, {player.Car.Telemetry.speed * 3.6f:0.0} km/h)");

            yield return Restart();

            progress = Object.FindAnyObjectByType<PlayerProgress>();
            regions = Object.FindAnyObjectByType<RegionWatch>();
            cards = Object.FindAnyObjectByType<DiscoverySystem>();
            player = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.AreEqual(ProgressStore.Source.Saved, progress.LoadedFrom);
            Assert.AreEqual(balance, progress.Wallet.Balance, "Sparks");
            CollectionAssert.Contains(regions.Explored, "commons", "region remembered");
            CollectionAssert.Contains(cards.Found, "SC1", "discovery remembered");
            var rec = progress.Data.Event("open-seat");
            Assert.AreEqual(1, rec.finishes);
            Assert.AreEqual(tier, rec.bestTier, "medal");
            Assert.AreEqual(best.seconds, rec.bests.Single().seconds, 1e-3f, "best time");
            Assert.AreEqual("hanami", rec.bests.Single().car, "best time by car (the Open Seat loan)");
            Assert.IsTrue(progress.Owns("mame"), "bought car");
            yield return new WaitForSeconds(0.5f);
            Assert.IsTrue(progress.Resumed, "continues at the parked spot");
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current, "in the car, not the first walking scene");
            Assert.Less(Vector2.Distance(new Vector2(parked.x, parked.z), new Vector2(player.Car.transform.position.x, player.Car.transform.position.z)), 1.5f);

            // Nothing pays twice: the explored region and the found card stay paid after the restart.
            yield return new WaitForSeconds(2f);
            Assert.AreEqual(balance, progress.Wallet.Balance, "no second payment after the restart");
        }

        [UnityTest]
        public IEnumerator BrokenSave_TheGameStillRuns_AndSavesAgain()
        {
            FreshSaveAttribute.Store.Write(ProgressStore.Key, "{\"version\":1,\"sparks\":12");
            LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("did not parse"));
            yield return BootGame();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.IsNotNull(player.Car, "the car spawned");
            Assert.AreEqual(ProgressStore.Source.Fresh, progress.LoadedFrom);
            Assert.IsTrue(FreshSaveAttribute.Store.TryRead(ProgressStore.CorruptKey, out _), "broken save kept aside");
            Press(Key.D);
            yield return new WaitForSeconds(3f);
            Press();
            progress.Flush();
            Assert.IsTrue(FreshSaveAttribute.Store.TryRead(ProgressStore.Key, out var json));
            Assert.AreEqual(200, JsonUtility.FromJson<ProgressData>(json).sparks, "a fresh, valid save with the new region");
        }
    }
}
