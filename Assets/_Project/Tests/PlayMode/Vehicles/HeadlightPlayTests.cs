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
    /// Headlights on the game's own path (D52): Boot → Game, F into the spawned car — lit by default; L switches off and
    /// that stays through a car change and a restart; a double tap is the high beam; S lights the brake lights; tiers set
    /// the real lights (Low none, but the pattern on the road); a rival-style car (built, not the player's) glows only.
    /// </summary>
    [FreshSave]
    public class HeadlightPlayTests
    {
        Keyboard _keyboard;
        int _prefs;
        string _tier;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            // The human's own setting in the editor's PlayerPrefs stays untouched.
            _prefs = PlayerPrefs.GetInt(HeadlightSwitch.PrefsKey, -1);
            PlayerPrefs.DeleteKey(HeadlightSwitch.PrefsKey);
            HeadlightSwitch.Reload();
            _tier = QualitySystem.Current;
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _keyboard = InputSystem.AddDevice<Keyboard>("LightsKeyboard");
            InputSystem.EnableDevice(_keyboard);
        }

        [TearDown]
        public void TearDown()
        {
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_keyboard != null) InputSystem.RemoveDevice(_keyboard);
            if (_prefs < 0) PlayerPrefs.DeleteKey(HeadlightSwitch.PrefsKey);
            else PlayerPrefs.SetInt(HeadlightSwitch.PrefsKey, _prefs);
            HeadlightSwitch.Reload();
            QualitySystem.SetTier(_tier, save: false);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(keys));
            InputSystem.Update();
        }

        IEnumerator Tap(Key key)
        {
            Press(key);
            yield return null;
            Press();
            yield return null;
        }

        static IEnumerator Boot()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
        }

        IEnumerator BootAndBoard()
        {
            yield return Boot();
            yield return Tap(Key.F);
            var mode = Object.FindAnyObjectByType<JapanMap.Gameplay.PlayerModeController>();
            Assert.AreEqual(JapanMap.Gameplay.PlayerModeController.Mode.Driving, mode.Current, "F beside the car gets in");
        }

        static Headlights Lights(out VehicleController car)
        {
            car = Object.FindAnyObjectByType<PlayerCarSpawner>().Current;
            Assert.NotNull(car, "no car spawned");
            var l = car.GetComponent<Headlights>();
            Assert.NotNull(l, $"{car.name} has no Headlights");
            return l;
        }

        static HeadlightSettings Settings(Headlights l) => Object.FindAnyObjectByType<PlayerCarSpawner>().Fleet.effects.headlights;

        [UnityTest]
        public IEnumerator OnAfterSpawn_LSwitches_SurvivesCarChangeAndRestart_DoubleTapHighBeam()
        {
            yield return BootAndBoard();
            QualitySystem.SetTier("High", save: false);
            yield return new WaitForSeconds(0.5f);
            var lights = Lights(out var car);
            var s = Settings(lights);
            Assert.IsTrue(lights.IsPlayer, "the spawned car is the player's");
            Assert.IsTrue(lights.LightsOn, "lights are on by default");
            Assert.That(lights.HeadLevel, Is.EqualTo(s.headOn).Within(0.05f), "head lamp glass glows");
            Assert.AreEqual(s.spots.x, lights.ActiveSpots, "High: two spot lights");
            Assert.IsTrue(lights.PoolVisible, "the beam pattern lies on the road");
            Assert.Greater(lights.LampMaterialCount, 0, "lamp glass found in the model");

            yield return Tap(Key.L);
            yield return new WaitForSeconds(0.6f);
            Assert.IsFalse(lights.LightsOn, "L switches off");
            Assert.AreEqual(0, lights.ActiveSpots, "no light when off");
            Assert.IsFalse(lights.PoolVisible);
            Assert.That(lights.HeadLevel, Is.LessThan(0.2f));
            Assert.AreEqual((int)HeadlightMode.Off, PlayerPrefs.GetInt(HeadlightSwitch.PrefsKey, -1), "saved");

            // Another car, as the garage does it: still off.
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            spawner.Spawn(spawner.Fleet.Get("kaze") ?? spawner.Fleet.Default);
            yield return new WaitForSeconds(0.5f);
            lights = Lights(out car);
            Assert.IsTrue(lights.IsPlayer);
            Assert.IsFalse(lights.LightsOn, "a new car keeps the switch");
            Assert.AreEqual(0, lights.ActiveSpots);

            // Restart the game: still off.
            Object.Destroy(Bootstrapper.Instance.gameObject);
            yield return null;
            HeadlightSwitch.Reload(); // a fresh page load reads the saved value
            yield return BootAndBoard();
            lights = Lights(out car);
            Assert.IsFalse(lights.LightsOn, "off after a restart");

            yield return Tap(Key.L);
            yield return new WaitForSeconds(0.6f);
            Assert.IsTrue(lights.LightsOn, "L switches on again");
            Assert.AreEqual(HeadlightMode.Low, HeadlightSwitch.Mode);
            yield return new WaitForSeconds(0.5f); // clear of the double-tap window
            yield return Tap(Key.L);
            yield return Tap(Key.L);
            yield return new WaitForSeconds(0.6f);
            Assert.AreEqual(HeadlightMode.High, HeadlightSwitch.Mode, "L twice quickly = high beam");
            Assert.That(lights.HeadLevel, Is.EqualTo(s.headHigh).Within(0.1f));
        }

        /// <summary>The touch LIGHT button in the top row, tapped through the panel (as TitleTests.Click: batchmode delivers no device pointer to UI Toolkit).</summary>
        [UnityTest]
        public IEnumerator TouchLightButton_Toggles()
        {
            yield return BootAndBoard();
            var controls = Object.FindAnyObjectByType<DriveTouchControls>();
            controls.SetVisible(true);
            var button = controls.LightsButton;
            Assert.NotNull(button, "LIGHT button in the touch controls");
            yield return UiSettle.Wait(button);
            Assert.Greater(button.worldBound.width, 10f, "laid out");
            Assert.IsTrue(button.ClassListContains("jm-touch--on"), "shows the lights are on");
            var picked = button.panel.Pick(button.worldBound.center);
            Assert.IsTrue(picked == button || button.Contains(picked), $"nothing covers the button (picked {picked?.name})");
            foreach (var type in new[] { EventType.MouseDown, EventType.MouseUp })
            {
                var sys = new Event { type = type, mousePosition = button.worldBound.center, button = 0, clickCount = 1 };
                using (EventBase evt = type == EventType.MouseDown ? PointerDownEvent.GetPooled(sys) : PointerUpEvent.GetPooled(sys)) button.panel.visualTree.SendEvent(evt);
                yield return null;
            }
            yield return null;
            Assert.IsFalse(HeadlightSwitch.On, "a tap switches off");
            Assert.IsFalse(button.ClassListContains("jm-touch--on"));
        }

        [UnityTest]
        public IEnumerator BrakeLights_FollowTheBrake_ReverseLightWhenReversing()
        {
            yield return BootAndBoard();
            var lights = Lights(out var car);
            var s = Settings(lights);
            yield return new WaitForSeconds(0.5f);
            Assert.That(lights.TailLevel, Is.EqualTo(s.tailOn).Within(0.1f), "tail lights on with the headlights");
            Press(Key.W);
            yield return new WaitForSeconds(2f);
            Assert.That(lights.TailLevel, Is.EqualTo(s.tailOn).Within(0.1f), "no brake light under throttle");
            Press(Key.S);
            yield return new WaitForSeconds(0.3f);
            Assert.That(car.Telemetry.forwardSpeed, Is.GreaterThan(1f), "still rolling forward");
            Assert.That(lights.TailLevel, Is.GreaterThan(s.tailOn * 2.5f), "S lights the brake lights");
            Press();
            yield return new WaitForSeconds(0.5f);
            Assert.That(lights.TailLevel, Is.LessThan(s.tailOn * 1.3f), "released: back to tail light");
            // Stop, then S held at rest reverses: the white reversing light.
            Press(Key.S);
            for (var w = 0f; car.Telemetry.forwardSpeed > -1f && w < 8f; w += Time.deltaTime) yield return null;
            Assert.That(car.Telemetry.forwardSpeed, Is.LessThan(-0.5f), "S at rest reverses");
            yield return new WaitForSeconds(0.3f);
            Assert.That(lights.ReverseLevel, Is.GreaterThan(0.8f), "reversing light on");
            Press();
        }

        [UnityTest]
        public IEnumerator Tiers_SetTheRealLights_RivalsOnlyGlow()
        {
            yield return BootAndBoard();
            var lights = Lights(out var car);
            var s = Settings(lights);
            foreach (var (tier, spots, cones) in new[] { ("Low", s.spots.z, 0), ("Medium", s.spots.y, s.cones.y * 2), ("High", s.spots.x, s.cones.x * 2) })
            {
                QualitySystem.SetTier(tier, save: false);
                yield return new WaitForSeconds(0.3f);
                Assert.AreEqual(spots, lights.ActiveSpots, $"{tier}: spot lights");
                Assert.IsTrue(lights.PoolVisible, $"{tier}: beam pattern");
                Assert.AreEqual(cones, lights.ActiveCones, $"{tier}: light cones (chase camera is outside the car)");
            }

            // Built like a race rival (not under the player's spawner): lamps glow, no real light.
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            var rival = PlayerCarSpawner.Build(spawner.Fleet.Get("suprema"), spawner.Fleet.tuning, spawner.Fleet.effects);
            rival.Place(car.transform.position + car.transform.right * 6f, car.transform.eulerAngles.y, fromAbove: 2f);
            yield return new WaitForSeconds(0.5f);
            var rl = rival.GetComponent<Headlights>();
            Assert.NotNull(rl, "rivals get lamps too");
            Assert.IsFalse(rl.IsPlayer);
            Assert.IsTrue(rl.LightsOn, "rivals always drive lit");
            Assert.AreEqual(0, rl.ActiveSpots, "no real-time light on rivals");
            Assert.IsFalse(rl.PoolVisible);
            Assert.That(rl.HeadLevel, Is.EqualTo(s.headOn).Within(0.1f));
            Object.Destroy(rival.gameObject);
        }
    }
}
