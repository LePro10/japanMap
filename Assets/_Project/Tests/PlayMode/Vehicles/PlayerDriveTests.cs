using System.Collections;
using JapanMap.Core;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

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

        /// <summary>
        /// Touch on the real input path (ASTRA §10): boarding does not drive off; the first touch of the pad engages
        /// the auto-throttle; a second finger on Drift pulls the handbrake while the throttle stays; a finger sliding
        /// from Boost onto Drift releases Boost and applies Drift; Brake overrides the throttle, braking to a stop
        /// disengages it, and only Brake held at rest for 0.4 s reverses.
        /// </summary>
        [UnityTest]
        public IEnumerator Touch_AutoThrottle_TwoFingers_SlideBoostToDrift_BrakeStopsThenReverses()
        {
            yield return BootAndBoard();
            var touch = InputSystem.AddDevice<Touchscreen>("TestTouch");
            // Like the keyboard in SetUp: added while Unity is in the background, a device comes up disabled.
            InputSystem.EnableDevice(touch);
            try
            {
                var controls = Object.FindAnyObjectByType<DriveTouchControls>();
                Assert.NotNull(controls, "no touch controls in the Game scene");
                controls.SetVisible(true);
                // The HUD moves its minimap off the pad once touch is seen; here before the first finger (like a phone).
                Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.GameplayHud>().ShowTouch();
                for (var f = 0; f < 60 && !(controls.Stick.worldBound.width > 1f && controls.Stick.panel.visualTree.worldBound.height > 1f); f++)
                    yield return null;
                Assert.Greater(controls.Stick.worldBound.width, 1f, "touch stick never laid out");
                var car = Object.FindAnyObjectByType<PlayerCarSpawner>().Current;
                var root = controls.Stick.panel.visualTree.worldBound;
                var px = 1f / JapanMap.Core.Ui.UiPanel.Scale;
                Vector2 ToScreen(Vector2 p) => new(p.x * px, (root.height - p.y) * px);
                // Which element would take a finger here — the full runs once failed with "throttle 0", and the
                // message must say whether another panel covered the control.
                string Under(VisualElement e)
                {
                    var hit = controls.Stick.panel.Pick(e.worldBound.center);
                    var path = "";
                    for (var v = hit; v != null && path.Length < 300; v = v.parent) path += $"/{v.GetType().Name}#{v.name}.{string.Join(".", v.GetClasses())}";
                    return $"{e.name} at {e.worldBound.center} of {e.panel?.visualTree.worldBound.size} (button in panel: {e.panel != null}), " +
                        $"screen {UnityEngine.Screen.width}x{UnityEngine.Screen.height}, UiPanel {JapanMap.Core.Ui.UiPanel.Size} x{JapanMap.Core.Ui.UiPanel.Scale}, picked {path}";
                }
                void Finger(int id, UnityEngine.InputSystem.TouchPhase phase, Vector2 at)
                {
                    InputSystem.QueueStateEvent(touch, new TouchState { touchId = id, phase = phase, position = at });
                    InputSystem.Update();
                }

                // UI Toolkit dispatches a queued touch in its next panel update (once per frame), the car reads it in
                // FixedUpdate: on a slow frame (4K Game view) two fixed steps ran before the touch arrived — wait for
                // two frame boundaries, then a fixed step.
                IEnumerator Settle()
                {
                    yield return null;
                    yield return null;
                    yield return new WaitForFixedUpdate();
                }

                yield return new WaitForSeconds(0.5f);
                Assert.Less(car.Telemetry.speed, 1f, "boarding on touch does not drive off");
                Assert.AreEqual(0f, car.Input.throttle, "no throttle before the pad is touched");

                var stick = ToScreen(controls.Stick.worldBound.center);
                Finger(1, UnityEngine.InputSystem.TouchPhase.Began, stick);
                yield return new WaitForSeconds(1.5f);
                Assert.That(car.Input.throttle, Is.GreaterThan(0.9f), $"the pad engages the auto-throttle ({Under(controls.Stick)})");
                Assert.Greater(car.Telemetry.speed * 3.6f, 10f, "and the car moves");

                var drift = ToScreen(controls.DriftButton.worldBound.center);
                Finger(2, UnityEngine.InputSystem.TouchPhase.Began, drift);
                yield return Settle();
                Assert.IsTrue(car.Input.handbrake, $"a second finger on Drift pulls the handbrake ({Under(controls.DriftButton)})");
                Assert.That(car.Input.throttle, Is.GreaterThan(0.9f), "the throttle stays");
                Finger(2, UnityEngine.InputSystem.TouchPhase.Ended, drift);
                yield return Settle();
                Assert.IsFalse(car.Input.handbrake);

                // Slide from Boost onto Drift with one finger.
                var boost = ToScreen(controls.BoostButton.worldBound.center);
                Finger(3, UnityEngine.InputSystem.TouchPhase.Began, boost);
                yield return Settle();
                Assert.IsTrue(car.Input.boost, $"Boost ({Under(controls.BoostButton)})");
                Finger(3, UnityEngine.InputSystem.TouchPhase.Moved, (boost + drift) * 0.5f);
                Finger(3, UnityEngine.InputSystem.TouchPhase.Moved, drift);
                yield return Settle();
                Assert.IsFalse(car.Input.boost, "sliding off Boost releases it");
                Assert.IsTrue(car.Input.handbrake, "sliding onto Drift applies it");
                Finger(3, UnityEngine.InputSystem.TouchPhase.Ended, drift);
                Finger(1, UnityEngine.InputSystem.TouchPhase.Ended, stick);
                yield return Settle();
                Assert.That(car.Input.throttle, Is.GreaterThan(0.9f), "auto-throttle keeps going without a finger");

                // Brake: overrides, stops, disengages; held on at rest it reverses only after 0.4 s.
                var brake = ToScreen(controls.BrakeButton.worldBound.center);
                Finger(4, UnityEngine.InputSystem.TouchPhase.Began, brake);
                yield return Settle();
                Assert.AreEqual(0f, car.Input.throttle, $"Brake overrides the auto-throttle ({Under(controls.BrakeButton)})");
                Assert.AreEqual(1f, car.Input.brake);
                for (var t = 0f; t < 8f && Mathf.Abs(car.Telemetry.forwardSpeed) > 0.5f; t += Time.deltaTime) yield return null;
                Assert.Less(Mathf.Abs(car.Telemetry.forwardSpeed), 0.6f, "braked to a stop");
                yield return new WaitForFixedUpdate();
                Assert.AreEqual(0f, car.Input.brake, "at rest the brake waits before reversing");
                Assert.IsFalse(controls.Engaged, "stopping with Brake disengages the auto-throttle");
                yield return new WaitForSeconds(0.6f);
                Assert.AreEqual(1f, car.Input.brake, "held 0.4 s at rest: reverse");
                Finger(4, UnityEngine.InputSystem.TouchPhase.Ended, brake);
                yield return Settle();
                Assert.AreEqual(0f, car.Input.throttle, "after the stop the car waits for the pad again");
            }
            finally
            {
                InputSystem.RemoveDevice(touch);
            }
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

        /// <summary>The game starts on foot beside the car (Phase 6): F gets in, the real way.</summary>
        /// <summary>
        /// CrazyGames: physics must behave the same on 60, 144 and 165 Hz screens. The real path at 30 and 144 frames per
        /// second: boot, get in with F, hold W for 3 s of game time — speed and distance must match.
        /// </summary>
        [UnityTest]
        public IEnumerator SameDrive_At30And144Fps()
        {
            var results = new System.Collections.Generic.List<(float kmh, float metres, int frames)>();
            var vsync = QualitySettings.vSyncCount;
            var target = Application.targetFrameRate;
            try
            {
                foreach (var fps in new[] { 30, 144 })
                {
                    QualitySettings.vSyncCount = 0;
                    Application.targetFrameRate = fps;
                    yield return BootAndBoard();
                    var car = Object.FindAnyObjectByType<PlayerCarSpawner>().Current;
                    yield return new WaitForSeconds(0.5f);
                    var start = car.transform.position;
                    var t0 = Time.time;
                    var frames = 0;
                    Press(Key.W);
                    while (Time.time - t0 < 3f) { frames++; yield return null; }
                    // Read at an exact fixed step: frames end at different points between two physics steps.
                    yield return new WaitForFixedUpdate();
                    var kmh = car.Telemetry.speed * 3.6f;
                    var metres = Vector3.Distance(start, car.transform.position);
                    var elapsed = Time.time - t0;
                    Press();
                    results.Add((kmh / elapsed * 3f, metres / (elapsed * elapsed) * 9f, frames));
                    if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
                    yield return null;
                }
            }
            finally
            {
                QualitySettings.vSyncCount = vsync;
                Application.targetFrameRate = target;
            }
            var (slow, fast) = (results[0], results[1]);
            var line = $"30 fps: {slow.kmh:F1} km/h, {slow.metres:F1} m ({slow.frames} frames) · 144 fps: {fast.kmh:F1} km/h, {fast.metres:F1} m ({fast.frames} frames)";
            Debug.Log("[Hz] " + line);
            Assert.That(fast.frames, Is.GreaterThan(slow.frames * 2), "the frame rates really differed: " + line);
            Assert.That(fast.kmh, Is.EqualTo(slow.kmh).Within(4).Percent, line);
            Assert.That(fast.metres, Is.EqualTo(slow.metres).Within(6).Percent, line);
        }

#if UNITY_EDITOR
        /// <summary>
        /// On a slow line the road tiles arrive after the start. R (respawn) before the tile is there puts the car on the
        /// terrain 1 m below the road; when the tile arrives the one-sided road held the car underneath (only its roof
        /// showed, Phase 11). Now the arriving tile lifts it onto the road, and it drives.
        /// </summary>
        [UnityTest]
        public IEnumerator RoadTileArrivingOverTheCar_LiftsItOntoTheRoad()
        {
            yield return BootAndBoard();
            var car = Object.FindAnyObjectByType<PlayerCarSpawner>().Current;
            string[] tiles = { "Assets/_Project/Scenes/World/Roads_CitySlab.unity", "Assets/_Project/Scenes/World/Roads_Road_2_0.unity" };
            car.Place(new Vector3(1123f, 30f, 137f), 180f, fromAbove: 3f); // setup: a Tokyo street of that tile
            yield return new WaitForSeconds(0.5f);
            Assert.That(car.transform.position.y, Is.GreaterThan(29.9f), "on the road while its tiles are loaded");
            // The tiles are not there yet (slow line): unload them, then respawn the real way.
            foreach (var tile in tiles)
            {
                var scene = SceneManager.GetSceneByPath(tile);
                Assert.IsTrue(scene.IsValid() && scene.isLoaded, $"{tile} is a streamed scene");
                yield return SceneManager.UnloadSceneAsync(scene);
            }
            Physics.SyncTransforms();
            Press(Key.R);
            yield return null;
            Press();
            yield return new WaitForSeconds(0.5f);
            Assert.That(car.transform.position.y, Is.LessThan(29.5f), "without the tiles the respawn lands on the terrain below the road");
            // The tiles arrive through the streamer's arrival path.
            foreach (var tile in tiles)
            {
                var load = UnityEditor.SceneManagement.EditorSceneManager.LoadSceneAsyncInPlayMode(tile, new LoadSceneParameters(LoadSceneMode.Additive));
                while (!load.isDone) yield return null;
                JapanMap.Gameplay.Content.ContentStreamer.Instance.Arrive("world/" + System.IO.Path.GetFileNameWithoutExtension(tile), SceneManager.GetSceneByPath(tile));
            }
            yield return new WaitForFixedUpdate();
            Assert.That(car.transform.position.y, Is.GreaterThan(29.9f), "lifted onto the arriving road");
            Press(Key.W);
            yield return new WaitForSeconds(2f);
            Press();
            Assert.That(car.Telemetry.speed * 3.6f, Is.GreaterThan(15f), "and it drives");
            Assert.That(car.transform.position.y, Is.GreaterThan(29.8f), "on the road, not under it");
        }
#endif

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
