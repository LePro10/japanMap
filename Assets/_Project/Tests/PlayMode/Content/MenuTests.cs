using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Records;
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
    /// The menu on the player's path (Phase 9.1, ASTRA §10): Escape pauses everything — time, physics, sound — and
    /// opens Play; a mouse click on a tab shows that page; the six destinations are there in order; Escape again
    /// resumes exactly where the game was; Tab and M open Records and Map.
    /// </summary>
    [FreshSave]
    public class MenuTests
    {
        Keyboard _kb;
        Mouse _mouse;
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
            _mouse = InputSystem.AddDevice<Mouse>("TestMouse");
            InputSystem.EnableDevice(_kb);
            InputSystem.EnableDevice(_mouse);
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            AudioListener.pause = false;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (_mouse != null) InputSystem.RemoveDevice(_mouse);
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

        /// <summary>A left click at an element, through the mouse device (UI Toolkit's own input path).</summary>
        IEnumerator Click(VisualElement e)
        {
            var root = e.panel.visualTree.worldBound;
            var px = 1f / UiPanel.Scale;
            var c = e.worldBound.center;
            var at = new Vector2(c.x * px, (root.height - c.y) * px);
            // A few frames per state: UI Toolkit reads the pointer in its own update (the play scripts wait 0.25 s).
            _mouse.MakeCurrent();
            foreach (var down in new[] { false, true, false })
            {
                var state = new MouseState { position = at };
                if (down) state = state.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left);
                InputSystem.QueueStateEvent(_mouse, state);
                InputSystem.Update();
                for (var f = 0; f < 3; f++) yield return null;
            }
        }

        static IEnumerator BootInCar(MenuTests t)
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
            yield return t.Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
        }

        [UnityTest, Timeout(90000)]
        public IEnumerator Escape_PausesEverything_TabsByClick_EscapeResumesWhereItWas()
        {
            yield return BootInCar(this);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var menu = Object.FindAnyObjectByType<GameMenu>();
            Assert.NotNull(menu, "no menu in the Game scene");
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);
            CollectionAssert.AreEqual(new[] { "Play", "Cars", "Map", "Records", "Photo", "Settings" }, menu.Screens.Select(s => s.Title).ToArray(), "ASTRA's six destinations");

            // Drive off, then Escape at speed.
            InputSystem.QueueStateEvent(_kb, new KeyboardState(Key.W));
            InputSystem.Update();
            yield return new WaitForSeconds(1.5f);
            var car = player.Car;
            Assert.Greater(car.Telemetry.speed, 3f, "the car drives before the menu");
            yield return Tap(Key.Escape);
            InputSystem.QueueStateEvent(_kb, new KeyboardState(Key.W)); // W still held under the menu
            InputSystem.Update();
            Assert.IsTrue(menu.IsOpen, "Escape opens the menu");
            Assert.AreEqual("Play", menu.Current.Title, "the menu opens on Play");
            Assert.AreEqual(0f, Time.timeScale, "Escape pauses time");
            Assert.IsTrue(AudioListener.pause, "Escape pauses the sound");
            var at = car.transform.position;
            for (var f = 0; f < 30; f++) yield return null;
            Assert.Less(Vector3.Distance(at, car.transform.position), 0.01f, "nothing moves under the menu");

            // Tabs by a real mouse click.
            for (var f = 0; f < 5; f++) yield return null; // layout
            var cars = menu.Root.Q<Button>("tab-cars");
            Assert.NotNull(cars, "Cars tab");
            yield return Click(cars);
            Assert.AreEqual("Cars", menu.Current.Title, "a click on Cars shows Cars");
            StringAssert.Contains("Hachi 86", menu.Text);
            yield return Click(menu.Root.Q<Button>("tab-settings"));
            Assert.AreEqual("Settings", menu.Current.Title);
            StringAssert.Contains("Steering 100 %", menu.Text);

            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            var atClose = Vector3.zero;
            void OnOpen(bool open) { if (!open) atClose = car.transform.position; }
            menu.OpenChanged += OnOpen;
            yield return Tap(Key.Escape);
            menu.OpenChanged -= OnOpen;
            Assert.IsFalse(menu.IsOpen, "Escape closes the menu");
            Assert.AreEqual(1f, Time.timeScale, "time runs again");
            Assert.IsFalse(AudioListener.pause);
            Assert.IsFalse(player.Suspended);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current, "back in the car, where it was");
            Assert.Less(Vector3.Distance(at, atClose), 0.01f, "the menu never moves the player");

            yield return Tap(Key.Tab);
            Assert.IsTrue(menu.IsOpen && menu.Current is RecordsScreen, "Tab opens Records");
            yield return Tap(Key.Tab);
            Assert.IsFalse(menu.IsOpen, "Tab again closes it");
            yield return Tap(Key.M);
            Assert.IsTrue(menu.IsOpen && menu.Current is MapScreen, "M opens the map");
            yield return Tap(Key.Escape);
            Assert.IsFalse(menu.IsOpen);
        }
            /// <summary>
        /// Escape is not enough on the web (CrazyGames: in fullscreen it leaves fullscreen; with the mouse captured it only frees
        /// the mouse, and the key never reaches the game). A click on the desktop MENU button opens the menu, and the browser
        /// freeing the captured mouse while walking opens it too.
        /// </summary>
        [UnityTest, Timeout(90000)]
        public IEnumerator DesktopMenuButton_AndFreedMouse_OpenTheMenu()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var menu = Object.FindAnyObjectByType<GameMenu>();
            var ui = Object.FindAnyObjectByType<JapanMap.Gameplay.PlayerModeUi>();
            var button = ui.GetComponentInChildren<UIDocument>().rootVisualElement.Q("desk-menu");
            Assert.NotNull(button, "a MENU button on the desktop HUD");
            Assert.AreEqual(DisplayStyle.Flex, button.resolvedStyle.display, "shown without touch");
            yield return Click(button);
            Assert.IsTrue(menu.IsOpen, "a click on MENU opens the menu");
            menu.Close();
            for (var f = 0; f < 5; f++) yield return null;
            Assert.IsFalse(menu.IsOpen);

            // The browser frees the captured mouse (Escape while walking): the menu opens.
            UnityEngine.Cursor.lockState = CursorLockMode.Locked;
            yield return new WaitForSecondsRealtime(0.4f); // held, not a refused request
            Assume.That(UnityEngine.Cursor.lockState, Is.EqualTo(CursorLockMode.Locked), "the editor refused the mouse capture");
            UnityEngine.Cursor.lockState = CursorLockMode.None;
            for (var f = 0; f < 3; f++) yield return null;
            Assert.IsTrue(menu.IsOpen, "losing the mouse capture pauses like Escape");
            menu.Close();
        }
    }
}
