using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Hud;
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
    /// The cockpit in the running game (D51): every car taken by the garage's test drive, the view switched with the
    /// camera key — the road 15 m ahead is on screen, above the HUD's bottom row, and nothing of the car, its built wheel,
    /// the arms or the instrument screens hides it. Driving: a drift turns the head towards the travel and buzzes the
    /// pad; "Camera shake" off leaves the head without a tremble.
    /// </summary>
    [FreshSave]
    public class CockpitPlayTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;
        int _shake;
        bool _vibration;

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _kb = InputSystem.AddDevice<Keyboard>("CockpitTestKeyboard");
            _shake = GameOptions.CameraShake;
            _vibration = GameOptions.Vibration;
        }

        [TearDown]
        public void TearDown()
        {
            GameOptions.CameraShake = _shake;
            GameOptions.Vibration = _vibration;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator BootGame()
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
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            if (mode.Current == PlayerModeController.Mode.Walking) mode.PressVehicle();
            yield return null;
        }

        void Keys(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_kb, new KeyboardState(keys));
            InputSystem.Update();
        }

        IEnumerator Press(Key key)
        {
            Keys(key);
            yield return null;
            Keys();
            yield return null;
        }

        /// <summary>The camera key until the rig is in the cockpit (the key toggles).</summary>
        IEnumerator IntoCockpit(CarCameraRig rig)
        {
            if (rig.Current != CarCameraRig.Mode.Cockpit) yield return Press(Key.C);
            Assert.AreEqual(CarCameraRig.Mode.Cockpit, rig.Current, "the camera key switches to the cockpit");
            for (var f = 0; f < 4; f++) yield return null;
        }

        [UnityTest]
        public IEnumerator EveryCar_TheRoadAheadIsInSight_NothingOfTheCabinCoversIt()
        {
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var garage = Object.FindAnyObjectByType<GarageSystem>();
            var rig = Object.FindAnyObjectByType<CarCameraRig>();
            var display = Object.FindAnyObjectByType<CockpitDisplay>();
            var fleet = Object.FindAnyObjectByType<Gameplay.Progress.PlayerProgress>().Fleet;
            var report = new System.Text.StringBuilder();
            foreach (var def in fleet.vehicles)
            {
                if (garage.TestDriving) garage.EndTestDrive();
                yield return null;
                Assert.IsTrue(garage.TestDrive(def.id), $"test drive {def.id}");
                var until = Time.realtimeSinceStartup + 10f;
                while ((player.Car == null || player.Car.Definition != def || VehicleVisuals.FindPrefix(player.Car.transform, "eye") == null) && Time.realtimeSinceStartup < until) yield return null;
                yield return IntoCockpit(rig);
                var car = player.Car;
                Assert.AreEqual(def.id, rig.Spec.carId, $"{def.id}: the seat of this car");
                Assert.IsTrue(display.Active, $"{def.id}: the cockpit display is on");
                var cam = Camera.main;
                var eye = cam.transform.position;
                var sides = rig.Spec.wheel == CockpitWheel.Formula ? new[] { -1.2f, 1.2f } : new[] { 0f };
                // Everything drawn of the car now: body, built wheel, gloves and sleeves, instrument screens.
                var view = new CockpitView(car.transform, VehicleVisuals.FindPrefix(car.transform, "driver"));
                foreach (var x in sides)
                {
                    var ahead = eye + Vector3.ProjectOnPlane(car.transform.forward, Vector3.up).normalized * 15f + car.transform.right * x;
                    ahead.y = car.transform.position.y;
                    var vp = cam.WorldToViewportPoint(ahead);
                    report.Append($" {def.id} ({vp.x:0.00}, {vp.y:0.00});");
                    Assert.That(vp.z, Is.GreaterThan(0f), $"{def.id}: ahead is in front");
                    Assert.That(vp.x, Is.InRange(0.08f, 0.92f), $"{def.id}: 15 m ahead is on screen sideways");
                    Assert.That(vp.y, Is.InRange(0.18f, 0.8f), $"{def.id}: 15 m ahead is above the HUD's bottom row and below the top");
                    Assert.IsFalse(view.Hidden(eye, ahead), $"{def.id}: the road 15 m ahead ({x:0.0}) is hidden from the seat");
                    if (display.HeadUp != null)
                    {
                        var r = display.HeadUp.GetComponent<Renderer>().bounds;
                        var a = cam.WorldToViewportPoint(r.min);
                        var b = cam.WorldToViewportPoint(r.max);
                        Assert.IsFalse(vp.y > Mathf.Min(a.y, b.y) && vp.y < Mathf.Max(a.y, b.y) && vp.x > Mathf.Min(a.x, b.x) && vp.x < Mathf.Max(a.x, b.x),
                            $"{def.id}: the head-up covers the road");
                    }
                }
            }
            Debug.Log("[Cockpit] 15 m ahead on screen:" + report);
        }

        [UnityTest]
        public IEnumerator Drift_HeadLooksWhereTheCarGoes_PadBuzzes_ShakeOffMeansStill()
        {
            yield return BootGame();
            GameOptions.Vibration = true;
            GameOptions.CameraShake = 0;
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var rig = Object.FindAnyObjectByType<CarCameraRig>();
            yield return IntoCockpit(rig);
            var car = player.Car;
            // A wide straight in Neo Tokyo (as play.mjs "drive 400 -100 180").
            car.Place(new Vector3(400f, 0f, -100f), 180f, fromAbove: 300f);
            yield return new WaitForSeconds(0.3f);
            Keys(Key.W);
            var shakeOff = 0f;
            var t = 0f;
            while ((t < 2f || car.Telemetry.speed < 14f) && t < 8f)
            {
                t += Time.deltaTime;
                shakeOff = Mathf.Max(shakeOff, rig.Head.Shake.magnitude);
                yield return null;
            }
            Assert.Greater(car.Telemetry.speed, 13f, "up to speed");
            Assert.AreEqual(0f, shakeOff, "Camera shake Off: the head never trembles");
            GameOptions.CameraShake = 1;
            Keys(Key.W, Key.D, Key.Space);
            var lookedIn = 0;
            var buzz = 0f;
            var shakeOn = 0f;
            t = 0f;
            while (t < 1.4f)
            {
                t += Time.deltaTime;
                var tel = car.Telemetry;
                var slide = Mathf.Atan2(tel.lateralSpeed, Mathf.Max(1f, Mathf.Abs(tel.forwardSpeed))) * Mathf.Rad2Deg;
                if (Mathf.Abs(slide) > 12f && Mathf.Abs(rig.Head.Euler.y) > 6f && Mathf.Sign(rig.Head.Euler.y) == Mathf.Sign(slide)) lookedIn++;
                buzz = Mathf.Max(buzz, rig.Rumble.y);
                shakeOn = Mathf.Max(shakeOn, rig.Head.Shake.magnitude);
                yield return null;
            }
            Keys();
            Assert.Greater(lookedIn, 10, "in the slide the head turns towards the travel");
            Assert.Greater(buzz, 0.05f, "the pad buzzes in the drift");
            Assert.Greater(shakeOn, 0.02f, "Camera shake Low: the tyres shudder through the head");
        }
    }
}
