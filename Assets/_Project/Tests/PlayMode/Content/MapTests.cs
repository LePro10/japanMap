using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Map;
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
    /// World map, travel and photo result on the player's path (Phase 9.3, ASTRA §10/§11): M opens the map with
    /// travel points, events and no clues before a region is explored; a click on a travel pin opens its card, its
    /// Travel button moves the car there; a locked point cannot be travelled to; a clue's 80 m circle holds its card;
    /// in photo mode Enter shows the result, Escape goes back one level, then leaves.
    /// </summary>
    [FreshSave]
    public class MapTests
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

        /// <summary>A click where <paramref name="panelPoint"/> says, asked only after the element stopped moving.</summary>
        IEnumerator ClickAt(VisualElement anyInPanel, System.Func<Vector2> panelPoint)
        {
            yield return UiSettle.Wait(anyInPanel);
            var root = anyInPanel.panel.visualTree.worldBound;
            var px = 1f / UiPanel.Scale;
            var p = panelPoint();
            var at = new Vector2(p.x * px, (root.height - p.y) * px);
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

        IEnumerator Click(VisualElement e) => ClickAt(e, () => e.worldBound.center);

        [UnityTest, Timeout(90000)]
        public IEnumerator PhotoMode_LeftDragLooks_WheelZooms()
        {
            // The owner's trackpad has no comfortable right-drag: a plain left drag must turn the camera (P11 polish).
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var photo = Object.FindAnyObjectByType<PhotoMode>();
            yield return Tap(Key.P);
            Assert.IsTrue(photo.IsOpen, "P opens photo mode");
            // The overlay lays out in the frames after opening (a hand is never faster than this).
            for (var f = 0; f < 5; f++) yield return null;
            var cam = Camera.main;
            var yaw0 = cam.transform.eulerAngles.y;
            var fov0 = cam.fieldOfView;
            // Left button down in the middle of the screen, then move 300 px to the right in steps.
            _mouse.MakeCurrent();
            var at = new Vector2(Screen.width * 0.5f, Screen.height * 0.5f);
            InputSystem.QueueStateEvent(_mouse, new MouseState { position = at });
            InputSystem.Update();
            yield return null;
            for (var i = 0; i <= 10; i++)
            {
                var p = at + new Vector2(30f * i, 0f);
                InputSystem.QueueStateEvent(_mouse, new MouseState { position = p, delta = new Vector2(i == 0 ? 0f : 30f, 0f) }.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left));
                InputSystem.Update();
                yield return null;
            }
            InputSystem.QueueStateEvent(_mouse, new MouseState { position = at + new Vector2(300f, 0f) });
            InputSystem.Update();
            yield return null;
            var turned = Mathf.Abs(Mathf.DeltaAngle(yaw0, cam.transform.eulerAngles.y));
            Assert.Greater(turned, 10f, $"a left drag turns the photo camera (turned {turned:0.0}°)");
            // Wheel up: closer (narrower field of view).
            for (var i = 0; i < 3; i++)
            {
                InputSystem.QueueStateEvent(_mouse, new MouseState { position = at, scroll = new Vector2(0f, 120f) });
                InputSystem.Update();
                yield return null;
                InputSystem.QueueStateEvent(_mouse, new MouseState { position = at });
                InputSystem.Update();
                yield return null;
            }
            Assert.Less(cam.fieldOfView, fov0 - 2f, $"wheel up zooms in ({fov0:0} → {cam.fieldOfView:0})");
            yield return Tap(Key.P);
            Assert.IsFalse(photo.IsOpen);
        }

        [UnityTest, Timeout(90000)]
        public IEnumerator Map_TravelByClick_LockedStaysLocked_ClueCircleHoldsTheCard()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var menu = Object.FindAnyObjectByType<GameMenu>();
            var map = Object.FindAnyObjectByType<MapSystem>();
            var travel = Object.FindAnyObjectByType<Travel>();

            yield return Tap(Key.M);
            Assert.IsTrue(menu.IsOpen && menu.Current is MapScreen, "M opens the map");
            var screen = (MapScreen)menu.Current;
            for (var f = 0; f < 5; f++) yield return null;
            var pins = screen.View.Pins;
            Assert.AreEqual(travel.Points.points.Length, pins.Count(p => p.id != null && p.id.StartsWith("travel:")), "every travel point on the map");
            Assert.Greater(pins.Count(p => p.id != null && p.id.StartsWith("event:")), 0, "event pins");
            Assert.AreEqual(0, pins.Count(p => p.id != null && p.id.StartsWith("clue:")), "no clue before a region is explored");

            // A locked point: Needle pits before the Needle Works are explored.
            var needle = travel.Points.points.First(p => p.id == "needle");
            Assert.IsFalse(travel.Unlocked(needle), "Needle pits locked on a fresh save");
            Assert.IsFalse(travel.To("needle"), "a locked point cannot be travelled to");

            // Click the Commons travel pin (zoomed in so it is the nearest one), then Travel.
            screen.Select("");
            var commons = travel.Points.points.First(p => p.id == "commons");
            yield return ClickAt(screen.View, () => screen.View.worldBound.position + screen.View.ToLocal(commons.at));
            StringAssert.StartsWith("travel:commons", screen.Selected, $"a click on the Commons pin selects it ({screen.Text})");
            var button = menu.Root.Query<Button>().ToList().First(b => b.text == "Travel");
            yield return Click(button);
            Assert.IsFalse(menu.IsOpen, $"travel closes the menu (page {menu.Current?.Title}: {menu.Text.Replace("\n", " | ")}; travel button {button.worldBound}, enabled {button.enabledInHierarchy})");
            yield return new WaitForSeconds(0.5f);
            var at = player.Car.transform.position;
            Assert.Less(Vector2.Distance(new Vector2(at.x, at.z), commons.at), 30f, $"the car is at Sakura Commons ({at})");
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);

            // Every clue circle holds its card (the clue narrows, never misleads).
            foreach (var c in map.Discoveries.Set.cards)
                Assert.LessOrEqual(Vector2.Distance(map.ClueCentre(c), c.position), map.ClueRadius, c.id);
            var card = map.Discoveries.Set.cards[0];
            var postcard = Postcard.Render(card.position, card.ground, card.yaw);
            Assert.NotNull(postcard, "a postcard renders");
            Assert.AreEqual(384, postcard.width);
            Object.Destroy(postcard);

            // Photo: Enter shows the result, Escape goes back one level, Escape again leaves.
            var photo = Object.FindAnyObjectByType<PhotoMode>();
            yield return Tap(Key.P);
            Assert.IsTrue(photo.IsOpen);
            yield return Tap(Key.Enter);
            Assert.IsTrue(photo.ShowingResult, "a capture shows the result");
            yield return Tap(Key.Escape);
            Assert.IsTrue(photo.IsOpen && !photo.ShowingResult, "Escape: back to framing");
            yield return Tap(Key.Escape);
            Assert.IsFalse(photo.IsOpen, "Escape again: back to the game");
            Assert.IsFalse(menu.IsOpen, "and no menu on top");
            Assert.AreEqual(1f, Time.timeScale);
            if (System.IO.File.Exists(photo.LastPhoto)) System.IO.File.Delete(photo.LastPhoto);
        }
    }
}
