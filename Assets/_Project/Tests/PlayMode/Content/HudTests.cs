using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Hud;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// The HUD on the player's path (Phase 9.2, ASTRA §10): the instrument shows the gearbox's own gear and the
    /// speed, shifts up under full throttle; the minimap shows 480 m in the car and 160 m on foot (on foot: no
    /// instrument); Sparks appear only for a moment after earning; notices wait while an event holds them.
    /// </summary>
    [FreshSave]
    public class HudTests
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

        [UnityTest, Timeout(90000)]
        public IEnumerator Instrument_ShowsTheGearboxGear_MinimapZoomsOnFoot_SparksShowBriefly()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var hud = Object.FindAnyObjectByType<GameplayHud>();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.NotNull(hud.Minimap, "minimap built");
            Assert.AreEqual(DisplayStyle.None, hud.Instrument.resolvedStyle.display, "on foot: no instrument");
            yield return new WaitForSeconds(1.5f);
            Assert.AreEqual(160f, hud.Minimap.Span, 8f, "on foot the minimap shows 160 m");
            Assert.AreEqual(DisplayStyle.None, hud.Sparks.resolvedStyle.display, "no permanent balance on the HUD");

            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);
            Press(Key.W);
            var car = player.Car;
            var top = 0;
            for (var t = 0f; t < 10f && top < 2; t += Time.deltaTime)
            {
                yield return null;
                Assert.AreEqual(Gearbox.Label(car.Gearbox.Gear), hud.Instrument.GearText, "the HUD shows the gearbox's own gear");
                top = Mathf.Max(top, car.Gearbox.Gear);
            }
            Assert.GreaterOrEqual(top, 2, "full throttle shifts up");
            Assert.AreEqual(GameOptions.Speed(car.Telemetry.speed), hud.Instrument.SpeedText);
            Assert.AreEqual(480f, hud.Minimap.Span, 30f, "in the car the minimap shows 480 m");
            Press();

            // Sparks earned: the balance appears for about two seconds.
            var wallet = Object.FindAnyObjectByType<JapanMap.Gameplay.Economy.SparksWallet>();
            // Other earnings (the region explored on the drive) restart the two seconds: wait from the last one.
            var lastEarn = Time.unscaledTime;
            void OnEarned(int a, string r) => lastEarn = Time.unscaledTime;
            wallet.Earned += OnEarned;
            wallet.Add(10, "test");
            yield return null;
            yield return null;
            Assert.AreEqual(DisplayStyle.Flex, hud.Sparks.resolvedStyle.display, "balance shows after earning");
            // …and the "Saved" tick, which keeps the balance up with it.
            for (var w = 0f; (Time.unscaledTime - lastEarn < 2.6f || hud.SavedText != "") && w < 20f; w += Time.unscaledDeltaTime) yield return null;
            yield return null;
            wallet.Earned -= OnEarned;
            Assert.AreEqual(DisplayStyle.None, hud.Sparks.resolvedStyle.display, "and goes again");

            // Held notices (an event runs) wait; released, they show.
            hud.HoldNotices = true;
            hud.ShowToast("Held notice");
            yield return new WaitForSeconds(0.3f);
            Assert.AreNotEqual("Held notice", hud.Toast.text, "a held notice waits");
            hud.HoldNotices = false;
            yield return new WaitForSeconds(3f);
            yield return null;
        }
    }
}
