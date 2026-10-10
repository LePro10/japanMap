using System.Collections;
using JapanMap.Core;
using JapanMap.Core.Save;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// The garage on the game's path (Phase 8.2): a save with Sparks loads, E at the Open Bay opens the sheet, a
    /// purchase and a part change the player's real car and the save, E drives out in the bought car.
    /// </summary>
    [FreshSave]
    public class GarageTests
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

        static IEnumerator BootGame()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;
        }

        /// <summary>A returning player's save: some Sparks, nothing else.</summary>
        static void SaveWith(int sparks) =>
            ProgressStore.Save(FreshSaveAttribute.Store, new ProgressData { sparks = sparks });

        /// <summary>Test setup: the player on foot in front of the bay door.</summary>
        static IEnumerator WalkToDoor(PlayerModeController p, GarageSystem g)
        {
            var door = new Vector3(572f, 40f, -490f);
            if (Physics.Raycast(door, Vector3.down, out var hit, 60f, ~GameLayers.NotGround)) door = hit.point;
            if (p.Current == PlayerModeController.Mode.Driving) p.TryAlight();
            p.Walker.Place(door + Vector3.up, 0f);
            for (var f = 0; f < 5; f++) yield return null;
        }

        [UnityTest]
        public IEnumerator Buy_Fit_DriveOut_ChangesTheRealCar_AndTheSave()
        {
            SaveWith(10000);
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var garage = Object.FindAnyObjectByType<GarageSystem>();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var hud = Object.FindAnyObjectByType<GameplayHud>();
            Assert.IsNotNull(garage, "World/Content/Garage missing — run Content/Setup");
            Assert.AreEqual(ProgressStore.Source.Saved, progress.LoadedFrom);
            Assert.AreEqual(10000, progress.Wallet.Balance, "balance from the save");

            yield return WalkToDoor(player, garage);
            yield return Tap(Key.E);
            Assert.IsTrue(garage.IsOpen, "E at the door opens the garage");
            Assert.IsTrue(player.Suspended);
            Assert.IsTrue(hud.Hidden, "driving HUD hidden in the garage");
            Assert.AreEqual("hachi", player.Car.Definition.id);

            garage.Pick("mame");
            Assert.AreEqual("mame", player.Car.Definition.id, "the car on display is the player's car");
            Assert.IsTrue(garage.Buy());
            Assert.AreEqual(10000 - 2400, progress.Wallet.Balance);
            var brakeStock = player.Car.Definition.arcade.brakeG;
            Assert.IsTrue(garage.Fit(TuneCategory.Brakes, 1));
            Assert.AreEqual(brakeStock / progress.Tuning.brakeDistance.y, player.Car.Spec.brakeG, 1e-4f, "Street brakes on the real car");
            Assert.AreEqual(10000 - 2400 - 600, progress.Wallet.Balance);

            yield return new WaitForSeconds(0.4f);
            yield return Tap(Key.E);
            Assert.IsFalse(garage.IsOpen, "E drives out");
            Assert.IsFalse(player.Suspended);
            Assert.IsFalse(hud.Hidden);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);
            Assert.AreEqual("mame", player.Car.Definition.id, "drives out in the bought car");
            Assert.Less(Vector3.Distance(player.Car.transform.position, new Vector3(572f, player.Car.transform.position.y, -492f)), 2f);

            Assert.IsTrue(FreshSaveAttribute.Store.TryRead(ProgressStore.Key, out var json));
            var saved = JsonUtility.FromJson<ProgressData>(json);
            Assert.AreEqual("mame", saved.selectedCar);
            Assert.AreEqual(1, saved.Car("mame").tune.brakes);
            Assert.AreEqual(7000, saved.sparks);
        }

        [UnityTest]
        public IEnumerator NotEnoughSparks_BuysNothing_StarterDrivesOut()
        {
            SaveWith(1000);
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var garage = Object.FindAnyObjectByType<GarageSystem>();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            yield return WalkToDoor(player, garage);
            yield return Tap(Key.E);
            Assert.IsTrue(garage.IsOpen);
            garage.Pick("kaze");
            Assert.IsFalse(garage.Buy());
            Assert.AreEqual(1000, progress.Wallet.Balance);
            Assert.IsFalse(progress.Owns("kaze"));
            Assert.IsFalse(garage.Fit(TuneCategory.Engine, 1), "no parts on a car not owned");
            garage.Close();
            Assert.AreEqual("hachi", player.Car.Definition.id, "the display car goes back; the owned starter drives out");
        }
    }
}
