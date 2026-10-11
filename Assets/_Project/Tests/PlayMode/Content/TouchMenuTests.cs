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
    /// Every screen by finger (Phase 9.5, ASTRA §10/§11): the touch MENU button pauses into the menu, a tab and a
    /// button work by tap, Continue resumes; photo mode's pad moves the camera, Capture shows the result, Return
    /// goes back to the game. All through a simulated touchscreen, the way a phone delivers it.
    /// </summary>
    [FreshSave]
    public class TouchMenuTests
    {
        Touchscreen _touch;
        int _id = 10;

        [SetUp]
        public void SetUp()
        {
            _touch = InputSystem.AddDevice<Touchscreen>("TestTouch");
            InputSystem.EnableDevice(_touch);
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            AudioListener.pause = false;
            if (_touch != null) InputSystem.RemoveDevice(_touch);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        Vector2 Screen(VisualElement e, Vector2? at = null)
        {
            var root = e.panel.visualTree.worldBound;
            var px = 1f / UiPanel.Scale;
            var p = at ?? e.worldBound.center;
            return new Vector2(p.x * px, (root.height - p.y) * px);
        }

        void Finger(int id, UnityEngine.InputSystem.TouchPhase phase, Vector2 at)
        {
            InputSystem.QueueStateEvent(_touch, new TouchState { touchId = id, phase = phase, position = at });
            InputSystem.Update();
        }

        IEnumerator TapAt(VisualElement e)
        {
            var id = ++_id;
            var at = Screen(e);
            Finger(id, UnityEngine.InputSystem.TouchPhase.Began, at);
            for (var f = 0; f < 3; f++) yield return null;
            Finger(id, UnityEngine.InputSystem.TouchPhase.Ended, at);
            for (var f = 0; f < 3; f++) yield return null;
        }

        [UnityTest, Timeout(90000)]
        public IEnumerator TouchMenu_TabsByTap_Continue_PhotoPadAndCapture()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var ui = Object.FindAnyObjectByType<PlayerModeUi>();
            var hud = Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.GameplayHud>();
            ui.ShowTouch();
            hud.ShowTouch();
            for (var f = 0; f < 10; f++) yield return null;
            var menu = Object.FindAnyObjectByType<GameMenu>();

            yield return TapAt(ui.MenuButton);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.IsTrue(menu.IsOpen, $"the touch MENU button opens the menu (stack {JapanMap.Core.Ui.UiStack.Count} top {JapanMap.Core.Ui.UiStack.Top}, " +
                $"suspended {player?.Suspended}, ad {JapanMap.Core.Platform.GamePlatform.AdRunning}, timeScale {Time.timeScale}, " +
                $"button {ui.MenuButton?.worldBound}, panel {JapanMap.Core.Ui.UiPanel.Size} x{JapanMap.Core.Ui.UiPanel.Scale}, screen {UnityEngine.Screen.width}x{UnityEngine.Screen.height})");
            Assert.AreEqual(0f, Time.timeScale, "and pauses");
            for (var f = 0; f < 5; f++) yield return null;
            yield return TapAt(menu.Root.Q<Button>("tab-records"));
            Assert.AreEqual("Records", menu.Current.Title, "a tap on a tab shows it");
            var events = menu.Root.Query<Button>().ToList().First(b => b.text == "Events");
            yield return TapAt(events);
            StringAssert.Contains("not finished", menu.Text, "a tap on a sub-tab works");
            var cont = menu.Root.Query<Button>().ToList().First(b => b.text == "Resume");
            yield return TapAt(cont);
            Assert.IsFalse(menu.IsOpen, "Continue resumes");
            Assert.AreEqual(1f, Time.timeScale);

            // Photo mode by finger: the Photo tab, the pad moves the camera, Capture, Return to game.
            yield return TapAt(ui.MenuButton);
            yield return TapAt(menu.Root.Q<Button>("tab-photo"));
            var photo = Object.FindAnyObjectByType<PhotoMode>();
            Assert.IsTrue(photo.IsOpen, "the Photo tab starts photo mode");
            for (var f = 0; f < 5; f++) yield return null;
            var pad = photo.GetComponent<UIDocument>().rootVisualElement.Q<VisualElement>("photo-pad");
            Assert.NotNull(pad);
            var cam = Camera.main.transform.position;
            var id = ++_id;
            var r = pad.worldBound;
            Finger(id, UnityEngine.InputSystem.TouchPhase.Began, Screen(pad));
            yield return null;
            Finger(id, UnityEngine.InputSystem.TouchPhase.Moved, Screen(pad, new Vector2(r.center.x, r.yMin + 4f))); // push up = forward
            for (var t = 0f; t < 0.6f; t += Time.unscaledDeltaTime) yield return null;
            Finger(id, UnityEngine.InputSystem.TouchPhase.Ended, Screen(pad, new Vector2(r.center.x, r.yMin + 4f)));
            Assert.Greater(Vector3.Distance(cam, Camera.main.transform.position), 0.5f, "the pad moves the photo camera");
            var capture = photo.GetComponent<UIDocument>().rootVisualElement.Query<Button>().ToList().First(b => b.text == "Capture");
            yield return TapAt(capture);
            Assert.IsTrue(photo.ShowingResult, "Capture by tap shows the result");
            var back = photo.GetComponent<UIDocument>().rootVisualElement.Query<Button>().ToList().First(b => b.text == "Return to game");
            yield return TapAt(back);
            Assert.IsFalse(photo.IsOpen, "Return to game");
            Assert.AreEqual(1f, Time.timeScale);
            if (System.IO.File.Exists(photo.LastPhoto)) System.IO.File.Delete(photo.LastPhoto);
        }
    }
}
