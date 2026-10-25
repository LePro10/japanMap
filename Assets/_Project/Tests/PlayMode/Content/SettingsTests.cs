using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
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
    /// Settings tidied (D55): three tabs (Controls · Display · Sound), no touch rows on a desktop without touch (they
    /// come with a touchscreen), "Change keys" opens the key list and Escape goes back to Controls, not out of the menu;
    /// the save line is on every tab. All through the mouse and keyboard, as the player goes.
    /// </summary>
    [FreshSave]
    public class SettingsTests
    {
        Keyboard _kb;
        Touchscreen _touch;
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
            UiPanel.ForcedForm = FormFactor.Desktop; // the batch screen (640 × 480) would measure as a phone
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            AudioListener.pause = false;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            UiPanel.ForcedForm = null;
            if (_touch != null) InputSystem.RemoveDevice(_touch);
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

        // Panel pointer events, not the mouse device: device clicks do not reach UI Toolkit in batchmode (LESSONS 2026-10-17).
        static IEnumerator Click(VisualElement e)
        {
            Assert.NotNull(e, "nothing to click");
            yield return UiSettle.Wait(e);
            var at = e.worldBound.center;
            var root = e.panel.visualTree;
            foreach (var type in new[] { EventType.MouseDown, EventType.MouseUp })
            {
                var sys = new Event { type = type, mousePosition = at, button = 0, clickCount = 1 };
                using (EventBase evt = type == EventType.MouseDown ? PointerDownEvent.GetPooled(sys) : PointerUpEvent.GetPooled(sys)) root.SendEvent(evt);
                yield return null;
            }
            yield return null;
        }

        static string[] Rows(GameMenu menu) =>
            menu.Root.Query(className: "jm-setting").ToList().Select(r => r.Q<Label>()?.text).Where(t => t != null).ToArray();

        [UnityTest, Timeout(90000)]
        public IEnumerator ThreeTabs_NoTouchRowsWithoutTouch_ChangeKeysAndBack()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            Assert.IsNull(Touchscreen.current, "precondition: no touchscreen left over from another test");

            var menu = GameMenu.Instance;
            yield return Tap(Key.Escape);
            for (var f = 0; f < 5; f++) yield return null;
            Assert.IsTrue(menu.IsOpen, "Escape opens the menu");
            // Q from Play wraps round to the last tab. (A click on the top-bar tab never arrives in batchmode — the
            // MenuTests cover that path in the editor.)
            yield return Tap(Key.Q);
            var settings = menu.Current as SettingsScreen;
            Assert.NotNull(settings, $"Q from Play opens Settings (page {menu.Current?.Title})");
            var tabs = SettingsScreen.Pages.Select(p => menu.Root.Q<Button>("settings-tab-" + p.ToLowerInvariant())).ToArray();
            CollectionAssert.AreEqual(new[] { "Controls", "Display", "Sound" }, SettingsScreen.Pages, "three tabs");
            Assert.IsTrue(tabs.All(b => b != null), "every tab has a button");
            Assert.AreEqual(3, menu.Root.Query(className: "nm-tab").ToList().Count, "no fourth or fifth tab");

            var rows = Rows(menu);
            CollectionAssert.IsSubsetOf(new[] { "Steering", "Camera", "Camera shake" }, rows);
            Assert.IsFalse(rows.Any(r => r.StartsWith("Touch")), $"no touch rows without touch: {string.Join(", ", rows)}");
            Assert.IsFalse(rows.Contains("Throttle"), "the key list is behind its own button");
            StringAssert.Contains("store ", menu.Text, "the save line under Controls");

            yield return Click(menu.Root.Q<Button>("settings-keys"));
            Assert.IsTrue(settings.KeysOpen, "Change keys opens the key list");
            CollectionAssert.IsSubsetOf(new[] { "Throttle", "Brake / reverse", "Boost" }, Rows(menu));
            yield return Tap(Key.Escape);
            Assert.IsTrue(menu.IsOpen, "Escape on the key list stays in the menu");
            Assert.IsFalse(settings.KeysOpen, "… and goes back to Controls");
            Assert.AreSame(settings, menu.Current);
            Assert.NotNull(menu.Root.Q<Button>("settings-keys"));

            yield return Click(menu.Root.Q<Button>("settings-keys"));
            yield return Click(menu.Root.Q<Button>("settings-keys-back"));
            Assert.IsFalse(settings.KeysOpen, "the Back button goes back too");

            yield return Click(menu.Root.Q<Button>("settings-tab-display"));
            Assert.AreEqual(1, settings.Page);
            CollectionAssert.IsSubsetOf(new[] { "Quality", "UI scale", "Speed unit", "Reduced motion" }, Rows(menu));
            Assert.AreEqual("Quality", Rows(menu)[0], "quality comes first");
            Assert.IsFalse(menu.Root.Query<Button>().ToList().Any(b => b.text == "Recalibrate"), "Auto measures anew, no extra button");
            StringAssert.Contains("store ", menu.Text, "the save line under Display");

            yield return Click(menu.Root.Q<Button>("settings-tab-sound"));
            Assert.AreEqual("All sound", Rows(menu)[0], "master first");
            Assert.AreEqual(6, Rows(menu).Length, "master and five groups");
            StringAssert.DoesNotContain("stand-ins", menu.Text);

            // A touchscreen arrives: the touch rows come with it.
            _touch = InputSystem.AddDevice<Touchscreen>("TestTouch");
            yield return Click(menu.Root.Q<Button>("settings-tab-controls"));
            CollectionAssert.IsSubsetOf(new[] { "Touch throttle", "Touch hand", "Touch buttons" }, Rows(menu));

            yield return Tap(Key.Escape);
            Assert.IsFalse(menu.IsOpen, "Escape on a tab closes the menu");
        }

        [Test]
        public void Camera_PicksTheNearestPreset()
        {
            Assert.AreEqual(0, SettingsScreen.NearestCamera(4f));
            Assert.AreEqual(1, SettingsScreen.NearestCamera(6f));
            Assert.AreEqual(1, SettingsScreen.NearestCamera(6.6f));
            Assert.AreEqual(2, SettingsScreen.NearestCamera(8f));
        }

        // The prototype's sandbox (og123): a click on the Settings title shows the code field; a wrong code says so, the
        // right one (any case) owns every car and makes every purchase free, and the save line says it.
        [UnityTest, Timeout(90000)]
        public IEnumerator SandboxCode_AtTheTitle_OpensEverythingForFree()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            Assert.NotNull(progress);
            var car = progress.Fleet.vehicles.FirstOrDefault(v => v != null && !progress.Owns(v.id) && v.price > progress.Wallet.Balance);
            Assert.NotNull(car, "precondition: a fresh save cannot afford some car");

            var menu = GameMenu.Instance;
            yield return Tap(Key.Escape);
            yield return Tap(Key.Q);
            Assert.IsInstanceOf<SettingsScreen>(menu.Current);
            Assert.IsNull(menu.Root.Q<TextField>("settings-code"), "the code field is hidden");
            yield return Click(menu.Root.Q<Label>("settings-title"));
            var field = menu.Root.Q<TextField>("settings-code");
            Assert.NotNull(field, "a click on the title shows the code field");

            field.value = "og12";
            yield return Click(menu.Root.Q<Button>("settings-code-enter"));
            Assert.IsFalse(progress.Sandbox, "a wrong code opens nothing");
            Assert.AreEqual("Code not recognised", menu.NoticeText);

            field = menu.Root.Q<TextField>("settings-code");
            field.value = " OG123 ";
            yield return Click(menu.Root.Q<Button>("settings-code-enter"));
            Assert.IsTrue(progress.Sandbox, "the code opens the sandbox");
            Assert.IsTrue(progress.Data.sandbox, "… on the save");
            Assert.IsTrue(progress.Fleet.vehicles.Where(v => v != null).All(v => progress.Owns(v.id)), "every car owned");
            var balance = progress.Wallet.Balance;
            Assert.IsTrue(progress.Wallet.CanAfford(balance + 1), "the shops see every price as affordable");
            Assert.IsTrue(progress.Wallet.Spend(balance + 1000), "a purchase over the balance goes through");
            Assert.AreEqual(balance, progress.Wallet.Balance, "… and costs nothing");
            Assert.IsTrue(System.Enum.GetValues(typeof(FeatureId)).Cast<FeatureId>().All(Unlocks.IsUnlocked), "every feature open");
            StringAssert.Contains("sandbox on", menu.Text, "the save line says so");
        }
    }
}
