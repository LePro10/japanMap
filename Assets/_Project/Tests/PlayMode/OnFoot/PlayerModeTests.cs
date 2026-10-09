using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// The game's own path on foot: Boot → Game starts on foot in Sakura Commons with the car 4 m
    /// north (WP2); F gets in; F does not get out while driving faster than 5 km/h; F gets out
    /// beside the stopped car; H brings the car back from far away. All through the keyboard.
    /// </summary>
    [FreshSave]
    public class PlayerModeTests
    {
        Keyboard _kb;

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

        static float Flat(Vector3 a, Vector3 b) => new Vector2(a.x - b.x, a.z - b.z).magnitude;

        [UnityTest]
        public IEnumerator StartsOnFoot_InSakuraCommons_WithTheCarFourMetresNorth()
        {
            yield return BootGame();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.NotNull(mode, "Game scene has no PlayerModeController");
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(PlayerModeController.Mode.Walking, mode.Current);
            var w = mode.Walker.transform.position;
            var c = mode.Car.transform.position;
            Assert.That(Flat(w, new Vector3(550f, 0f, -510f)), Is.LessThan(0.5f), $"walker starts at the commons centre, is at {w}");
            Assert.That(c.z - w.z, Is.EqualTo(4f).Within(0.4f), "car 4 m north");
            Assert.That(Mathf.Abs(c.x - w.x), Is.LessThan(0.4f));
            Assert.IsTrue(mode.Walker.Grounded, "walker stands on the ground");
            Assert.That(mode.Car.Telemetry.speed, Is.LessThan(0.3f), "parked car stays");
            Assert.AreEqual("F  Get in", mode.Prompt);
        }

        [UnityTest]
        public IEnumerator F_GetsIn_NotOutAboveFiveKmh_OutBesideTheStoppedCar()
        {
            yield return BootGame();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            yield return Tap(Key.F);
            Assert.AreEqual(PlayerModeController.Mode.Driving, mode.Current, "F beside the car gets in");
            Assert.IsFalse(mode.Walker.gameObject.activeSelf, "walker hidden in the car");

            Press(Key.W);
            yield return new WaitForSeconds(2f);
            Press();
            Assert.That(mode.Car.Telemetry.speed * 3.6f, Is.GreaterThan(10f));
            yield return Tap(Key.F);
            Assert.AreEqual(PlayerModeController.Mode.Driving, mode.Current, "no getting out while moving");

            Press(Key.S, Key.Space);
            var t = 0f;
            while (mode.Car.Body.linearVelocity.magnitude * 3.6f > 1f && t < 8f)
            {
                t += Time.deltaTime;
                yield return null;
            }
            Press();
            yield return Tap(Key.F);
            Assert.AreEqual(PlayerModeController.Mode.Walking, mode.Current, "F at standstill gets out");
            var car = mode.Car.transform;
            var side = Vector3.Dot(mode.Walker.transform.position - car.position, car.right);
            Assert.That(Mathf.Abs(side), Is.InRange(1.3f, 3f), "walker stands beside the car");
            Assert.That(side, Is.GreaterThan(0f), "driver's door on the right (right-hand drive)");
            yield return new WaitForSeconds(0.3f);
            Assert.IsTrue(mode.Walker.Grounded, "walker on the ground after getting out");
        }

        [UnityTest]
        public IEnumerator H_CallsTheCar_ToAClearSpotNearby()
        {
            yield return BootGame();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            // Walk south-east away from the car, the real way (W/D, camera heading 0 at the start).
            Press(Key.S, Key.LeftShift);
            yield return new WaitForSeconds(6f);
            Press();
            yield return new WaitForSeconds(0.3f);
            Assert.That(mode.CarDistance, Is.GreaterThan(30f), "walked away from the car");
            yield return Tap(Key.H);
            Assert.That(mode.CarDistance, Is.LessThan(46f), $"called car is near: {mode.Message}");
            StringAssert.StartsWith("Your car is parked", mode.Message);
            yield return new WaitForSeconds(1f);
            Assert.That(mode.Car.Telemetry.groundedWheels, Is.EqualTo(4), "on four wheels");
            Assert.That(mode.Car.Telemetry.speed, Is.LessThan(0.5f), "parked");
        }
    }
}
