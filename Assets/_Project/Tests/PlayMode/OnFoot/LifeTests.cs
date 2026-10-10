using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Life;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// Phase 6.5: the place actors (workers, fishers, visitors, animals) stand on the ground at their
    /// spots, the two walk-in shops exist, and the walker walks into the corner mart with W.
    /// </summary>
    [FreshSave]
    public class LifeTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
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

        [UnityTest]
        public IEnumerator Actors_StandOnTheGround_AtTheirPlaces()
        {
            yield return BootGame();
            var actors = Object.FindAnyObjectByType<PlaceActors>();
            Assert.NotNull(actors, "no PlaceActors in Game.unity");
            Assert.That(actors.Count, Is.EqualTo(37), "6 Sakura + 17 Funaura + 14 Stillwater");
            var data = actors.Data.actors;
            foreach (var kind in new[] { "worker", "fisher", "visitor", "seated", "cat", "goat", "chicken" })
                Assert.That(data.Count(a => a.kind == kind), Is.GreaterThan(0), kind);
            foreach (var a in data)
            {
                Assert.IsTrue(Physics.Raycast(a.position + Vector3.up * 3f, Vector3.down, out var hit, 10f, ~GameLayers.NotGround), $"{a.place} {a.kind}: no ground under {a.position}");
                Assert.That(Mathf.Abs(hit.point.y - a.position.y), Is.LessThan(1f), $"{a.place} {a.kind} floats or sinks at {a.position}");
            }
        }

        [UnityTest]
        public IEnumerator Walker_WalksIntoTheCornerMart()
        {
            yield return BootGame();
            var shops = Object.FindAnyObjectByType<ShopInteriors>();
            Assert.That(shops.Built, Is.EqualTo(2), "diner and corner mart");
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            // Setup: stand on the pavement 8 m in front of the mart's open south front, facing it.
            var front = new Vector3(578f, 600f, -50f);
            Physics.Raycast(front, Vector3.down, out var g, 1200f, ~GameLayers.NotGround);
            mode.Walker.Place(g.point, 0f);
            yield return new WaitForSeconds(0.5f);
            InputSystem.QueueStateEvent(_kb, new KeyboardState(Key.W));
            InputSystem.Update();
            yield return new WaitForSeconds(2.2f);
            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            var p = mode.Walker.transform.position;
            Assert.That(p.z, Is.GreaterThan(-43f), $"walker went through the front into the shop, is at {p}");
            Assert.That(p.z, Is.LessThan(-34f), "and stopped at the back wall");
        }
    }
}
