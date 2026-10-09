using System.Collections;
using JapanMap.Core;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// The game's own path: Boot → Game, the spawner puts the car on a road, a keyboard drives it
    /// through the Drive actions, R puts it back on the road.
    /// </summary>
    [FreshSave]
    public class PlayerDriveTests
    {
        Keyboard _keyboard;

        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            // Otherwise the virtual keys only count while the Game view has focus — the tests went red
            // whenever the editor was in the background (and always in batch mode).
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            // …and a keyboard is reset and disabled while Unity is not the front app (touch kept working).
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            // Added after the settings, and switched on: added while Unity is in the background, a
            // device can come up disabled.
            _keyboard = InputSystem.AddDevice<Keyboard>("TestKeyboard");
            InputSystem.EnableDevice(_keyboard);
        }

        [TearDown]
        public void TearDown()
        {
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_keyboard != null) InputSystem.RemoveDevice(_keyboard);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(keys));
            InputSystem.Update();
        }

        [UnityTest]
        public IEnumerator TouchStick_Throttles_And_DriftButton_PullsTheHandbrake_WithTwoFingers()
        {
            yield return BootAndBoard();
            var touch = InputSystem.AddDevice<Touchscreen>("TestTouch");
            // Like the keyboard in SetUp: added while Unity is in the background, a device comes up disabled —
            // the cause of the "throttle 0 on the first run" flake (red in the Phase 7 and 8 full runs).
            InputSystem.EnableDevice(touch);
            try
            {
                var controls = Object.FindAnyObjectByType<DriveTouchControls>();
                Assert.NotNull(controls, "no touch controls in the Game scene");
                controls.SetVisible(true);
                // Wait for UI Toolkit's layout: one frame was not always enough under load (full runs, the first run
                // after a reload) — the finger then landed beside a stick still at (0, 0): "throttle 0".
                for (var f = 0; f < 60 && !(controls.Stick.worldBound.width > 1f && controls.Stick.panel.visualTree.worldBound.height > 1f); f++)
                    yield return null;
                Assert.Greater(controls.Stick.worldBound.width, 1f, "touch stick never laid out");
                var car = Object.FindAnyObjectByType<PlayerCarSpawner>().Current;
                var root = controls.Stick.panel.visualTree.worldBound;
                var scale = Screen.height / root.height;
                Vector2 ToScreen(Vector2 p) => new(p.x * scale, Screen.height - p.y * scale);
                var stick = ToScreen(controls.Stick.worldBound.center);

                void Finger(int id, UnityEngine.InputSystem.TouchPhase phase, Vector2 at)
                {
                    InputSystem.QueueStateEvent(touch, new TouchState { touchId = id, phase = phase, position = at });
                    InputSystem.Update();
                }
                Finger(1, UnityEngine.InputSystem.TouchPhase.Began, stick);
                yield return null;
                Finger(1, UnityEngine.InputSystem.TouchPhase.Moved, stick + new Vector2(0f, 90f * scale));
                yield return new WaitForSeconds(2f);
                Assert.That(car.Input.throttle, Is.GreaterThan(0.6f), "stick up must be throttle");
                Assert.That(car.Telemetry.speed * 3.6f, Is.GreaterThan(15f), "stick up must move the car");

                var drift = ToScreen(controls.DriftButton.worldBound.center);
                Finger(2, UnityEngine.InputSystem.TouchPhase.Began, drift);
                yield return new WaitForFixedUpdate();
                yield return new WaitForFixedUpdate();
                Assert.IsTrue(car.Input.handbrake, "drift button with a second finger must pull the handbrake");
                Assert.That(car.Input.throttle, Is.GreaterThan(0.6f), "the first finger must keep the throttle");
                Finger(2, UnityEngine.InputSystem.TouchPhase.Ended, drift);
                Finger(1, UnityEngine.InputSystem.TouchPhase.Ended, stick);
                yield return new WaitForFixedUpdate();
                yield return new WaitForFixedUpdate();
                Assert.That(car.Input.throttle, Is.EqualTo(0f));
                Assert.IsFalse(car.Input.handbrake);
            }
            finally
            {
                InputSystem.RemoveDevice(touch);
            }
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

        /// <summary>The game starts on foot beside the car (Phase 6): F gets in, the real way.</summary>
        IEnumerator BootAndBoard()
        {
            yield return BootGame();
            var mode = Object.FindAnyObjectByType<JapanMap.Gameplay.PlayerModeController>();
            Assert.NotNull(mode, "Game scene has no PlayerModeController");
            Press(Key.F);
            yield return null;
            Press();
            yield return null;
            Assert.AreEqual(JapanMap.Gameplay.PlayerModeController.Mode.Driving, mode.Current, "F beside the car must get in");
        }

        [UnityTest]
        public IEnumerator Keyboard_DrivesTheSpawnedCar_AndRespawnPutsItBackOnTheRoad()
        {
            yield return BootAndBoard();
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            Assert.NotNull(spawner, "Game scene has no PlayerCarSpawner");
            var car = spawner.Current;
            Assert.NotNull(car, "no car spawned");
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(4, car.Telemetry.groundedWheels, "car does not stand on four wheels");
            // The game starts on the Sakura Commons meadow (prototype WP2), not on a road.
            Assert.AreNotEqual(Surface.Water, car.Telemetry.surface);

            var start = car.transform.position;
            Press(Key.W);
            yield return new WaitForSeconds(3f);
            var kmh = car.Telemetry.speed * 3.6f;
            Assert.That(kmh, Is.GreaterThan(40f), "W does not accelerate the car");
            Assert.That(Vector3.Distance(start, car.transform.position), Is.GreaterThan(15f));

            // Throw the car off the road, then R.
            Press();
            car.Place(car.transform.position + car.transform.right * 40f, 90f, fromAbove: 50f);
            yield return new WaitForFixedUpdate();
            Press(Key.R);
            yield return null;
            Press();
            yield return new WaitForSeconds(0.5f);
            var network = Object.FindAnyObjectByType<VehicleRespawn>().Locator;
            Assert.NotNull(network, "respawn has no road locator");
            Assert.IsTrue(network.TryNearest(car.transform.position, car.transform.forward, 50f, out var road, out _));
            var off = new Vector2(road.x - car.transform.position.x, road.z - car.transform.position.z).magnitude;
            Assert.That(off, Is.LessThan(0.5f), $"after R the car is {off:F2} m from the road centre");
            Assert.That(car.Telemetry.speed, Is.LessThan(1f));
        }
    }
}
