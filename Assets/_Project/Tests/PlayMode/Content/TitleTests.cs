using System;
using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Platform;
using JapanMap.Core.Ui;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Intro;
using JapanMap.Gameplay.Menu;
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
    /// The title and the redone menu on the player's path (D48): the page's loading screen goes when the title stands,
    /// no gameplayStart while it shows, START by a real mouse click flies into play (car drivable, gameplayStart),
    /// Enter into the first drive wipes into the intro, Settings opens over the title and Escape returns to it; in the
    /// menu a locked tab refuses with its reason, the arrow keys move between tiles and Enter opens one.
    /// </summary>
    [FreshSave]
    public class TitleTests
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
            TitleScreen.ResetSession();
        }

        [TearDown]
        public void TearDown()
        {
            TitleScreen.RunInEditor = false;
            FirstDrive.RunInEditor = false;
            Unlocks.Query = null;
            Time.timeScale = 1f;
            AudioListener.pause = false;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (Bootstrapper.Instance != null) UnityEngine.Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator Boot()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
        }

        static IEnumerator UntilTitle()
        {
            for (var w = 0f; (TitleScreen.Instance == null || TitleScreen.Instance.Current != TitleScreen.State.Shown) && w < 20f; w += Time.unscaledDeltaTime) yield return null;
            Assert.NotNull(TitleScreen.Instance, "the menu builds the title");
            Assert.AreEqual(TitleScreen.State.Shown, TitleScreen.Instance.Current, "the title shows once the world is ready");
            for (var f = 0; f < 5; f++) yield return null; // layout
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

        /// <summary>
        /// A left click at an element's centre as the panel receives it (pointer down, up), hit-tested by position — so
        /// a covered or unpickable button fails. Not through the mouse device: batchmode in a project copy delivers no
        /// pointer to UI Toolkit (MenuTests' device clicks fail there before and after D48).
        /// </summary>
        static IEnumerator Click(VisualElement e)
        {
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

        [UnityTest, Timeout(120000)]
        public IEnumerator Title_HoldsGameplay_StartByMouse_FliesIntoPlay()
        {
            TitleScreen.RunInEditor = true;
            var starts = GamePlatform.GameplayStarts;
            yield return Boot();
            yield return UntilTitle();
            var title = TitleScreen.Instance;
            var player = UnityEngine.Object.FindAnyObjectByType<PlayerModeController>();
            Assert.AreEqual(StartFlow.Phase.Title, StartFlow.Current);
            Assert.IsTrue(PageBridge.Loaded, "the page's loading screen goes when the title stands");
            yield return new WaitForSecondsRealtime(1.2f);
            Assert.AreEqual(starts, GamePlatform.GameplayStarts, "no gameplayStart while the title shows (CrazyGames: menus are no play)");
            Assert.IsTrue(player.Suspended, "the car waits under the title");
            Assert.IsTrue(GameMenu.Instance.Hud.Hidden, "no HUD over the title");
            Assert.IsFalse(title.Continue, "a fresh save says START GAME");
            StringAssert.Contains("START GAME", string.Join(" ", title.StartButton.Query<Label>().ToList().Select(l => l.text)));
            var brain = Camera.main.GetComponent("CinemachineBrain") as Behaviour;
            Assert.IsFalse(brain != null && brain.enabled, "the title drives the camera");
            var camAt = Camera.main.transform.position;
            yield return new WaitForSecondsRealtime(1f);
            Assert.Greater(Vector3.Distance(camAt, Camera.main.transform.position), 0.02f, "the title shot drifts (a living backdrop)");

            yield return Click(title.StartButton);
            Assert.AreNotEqual(TitleScreen.State.Shown, title.Current, "a click on START starts");
            Assert.IsFalse(player.Suspended, "the car is the player's at once (no waiting for the fly-in)");
            for (var w = 0f; title.Current != TitleScreen.State.Done && w < 5f; w += Time.unscaledDeltaTime) yield return null;
            Assert.AreEqual(TitleScreen.State.Done, title.Current, "the fly-in ends");
            Assert.AreEqual(StartFlow.Phase.Playing, StartFlow.Current);
            for (var w = 0f; GamePlatform.GameplayStarts == starts && w < 2f; w += Time.unscaledDeltaTime) yield return null;
            Assert.Greater(GamePlatform.GameplayStarts, starts, "gameplayStart once the title has gone");
            Assert.IsTrue(brain == null || brain.enabled, "the chase camera is back");
            Assert.IsFalse(GameMenu.Instance.Hud.Hidden, "HUD back");
            Assert.AreEqual(0, UiStack.Count, "nothing left on the stack");

            // The title comes once per session: Escape now opens the menu as always.
            yield return Tap(Key.Escape);
            Assert.IsTrue(GameMenu.Instance.IsOpen, "Escape opens the menu after the title");
            GameMenu.Instance.Close();
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator Title_NewPlayer_EnterWipesIntoTheFirstDrive()
        {
            TitleScreen.RunInEditor = true;
            FirstDrive.RunInEditor = true;
            yield return Boot();
            yield return UntilTitle();
            var title = TitleScreen.Instance;
            var intro = UnityEngine.Object.FindAnyObjectByType<FirstDrive>();
            Assert.AreEqual(FirstDrive.Beat.Off, intro.Current, "the intro waits for the title");
            yield return new WaitForSecondsRealtime(0.5f);
            Assert.AreEqual(FirstDrive.Beat.Off, intro.Current, "still waiting");
            // ↓ to Settings, ↑ back to START, Enter: the keyboard path.
            yield return Tap(Key.DownArrow);
            Assert.AreSame(title.SettingsButton, title.Root.panel.focusController.focusedElement, "↓ moves to Settings");
            yield return Tap(Key.UpArrow);
            Assert.AreSame(title.StartButton, title.Root.panel.focusController.focusedElement, "↑ back to START");
            yield return Tap(Key.Enter);
            Assert.AreEqual(TitleScreen.State.Starting, title.Current);
            for (var w = 0f; intro.Current == FirstDrive.Beat.Off && w < 3f; w += Time.unscaledDeltaTime) yield return null;
            Assert.AreNotEqual(FirstDrive.Beat.Off, intro.Current, "under the wipe the first drive begins");
            for (var w = 0f; title.Current != TitleScreen.State.Done && w < 3f; w += Time.unscaledDeltaTime) yield return null;
            Assert.AreEqual(TitleScreen.State.Done, title.Current, "the wipe reveals the intro and goes");
            intro.Skip();
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator Title_Settings_OverTheTitle_EscapeReturns()
        {
            TitleScreen.RunInEditor = true;
            yield return Boot();
            yield return UntilTitle();
            var title = TitleScreen.Instance;
            var menu = GameMenu.Instance;
            yield return Click(title.SettingsButton);
            Assert.IsTrue(menu.IsOpen && menu.FromTitle, "Settings opens over the title");
            Assert.AreEqual("Settings", menu.Current.Title);
            Assert.AreEqual(DisplayStyle.None, menu.Root.Q(className: "jm-tabs").resolvedStyle.display, "no tabs over the title");
            StringAssert.Contains("Steering", menu.Text);
            yield return Tap(Key.Escape);
            Assert.IsFalse(menu.IsOpen, "Escape closes Settings");
            Assert.AreEqual(TitleScreen.State.Shown, title.Current, "back on the title");
            for (var f = 0; f < 3; f++) yield return null;
            Assert.IsTrue(menu.Hud.Hidden, "the HUD stays away under the title");
            yield return Tap(Key.Escape);
            Assert.AreEqual(TitleScreen.State.Shown, title.Current, "Escape on the title does nothing");
            Assert.IsFalse(menu.IsOpen);
            title.Begin();
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator Menu_LockedTab_Refuses_ArrowsMoveBetweenTiles_EnterOpens()
        {
            Unlocks.Query = new LockMap();
            yield return Boot();
            for (var f = 0; f < 20; f++) yield return null;
            var menu = GameMenu.Instance;
            yield return Tap(Key.Escape);
            for (var f = 0; f < 5; f++) yield return null;
            Assert.IsTrue(menu.IsOpen);
            var map = menu.Root.Q<Button>("tab-map");
            Assert.IsTrue(map.ClassListContains("jm-tab--locked"), "the locked tab shows it");
            yield return Click(map);
            Assert.AreEqual("Play", menu.Current.Title, "a locked tab does not open");
            StringAssert.Contains("Unlocks: Finish the first drive", menu.NoticeText, "it says why");
            yield return Tap(Key.M);
            Assert.AreEqual("Play", menu.Current.Title, "M does not open a locked map either");

            // Arrows: from the hero tile down into the grid, right to the neighbour; Enter opens the focused tile.
            var tiles = menu.Root.Query<Button>(className: "jm-card").ToList();
            Assert.GreaterOrEqual(tiles.Count, 3, "Play is a page of tiles");
            tiles[0].Focus();
            yield return Tap(Key.DownArrow);
            var focused = menu.Root.panel.focusController.focusedElement as VisualElement;
            Assert.AreNotSame(tiles[0], focused, "↓ moves the focus");
            Assert.Greater(focused.worldBound.center.y, tiles[0].worldBound.center.y, "↓ goes down");
            var tune = menu.Root.Q<Button>("tile-tune");
            Assert.NotNull(tune);
            tune.Focus();
            yield return Tap(Key.Enter);
            for (var f = 0; f < 3; f++) yield return null;
            Assert.AreEqual("Cars", menu.Current.Title, "Enter on Tune opens the tuning page");
            menu.Close();
        }

        sealed class LockMap : IUnlockQuery
        {
            public bool IsUnlocked(FeatureId id) => id != FeatureId.Map;
            public string Requirement(FeatureId id) => "Finish the first drive";
            public event Action Changed { add { } remove { } }
        }
    }
}
