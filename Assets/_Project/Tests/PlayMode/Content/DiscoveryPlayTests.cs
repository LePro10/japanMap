using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Economy;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Discoveries on the game's path (Phase 7.3): on foot beside a card, E inspects it (+100 Sparks,
    /// once); the Open Bay puzzle opens with the hinted order 2 → 1 → 3 after a wrong try; driving up
    /// to an approach card collects it from the car.
    /// </summary>
    public class DiscoveryPlayTests
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

        static int Index(DiscoverySet set, string id)
        {
            for (var i = 0; i < set.cards.Length; i++) if (set.cards[i].id == id) return i;
            return -1;
        }

        /// <summary>Test setup: stand the walker 1.2 m south of a spot (the press itself goes through the keyboard).</summary>
        static IEnumerator StandAt(PlayerModeController p, Vector3 spot)
        {
            var at = spot + Vector3.back * 1.2f;
            p.Walker.Place(new Vector3(at.x, spot.y + 2f, at.z), 0f);
            for (var f = 0; f < 5; f++) yield return null;
        }

        static Vector3 OnGround(Vector3 p) =>
            Physics.Raycast(p + Vector3.up * 30f, Vector3.down, out var hit, 60f, ~GameLayers.NotGround) ? hit.point : p;

        [UnityTest]
        public IEnumerator Inspect_Puzzle_AndApproach_PayOnce()
        {
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var system = Object.FindAnyObjectByType<DiscoverySystem>();
            var wallet = Object.FindAnyObjectByType<SparksWallet>();
            var set = system.Set;
            yield return null;

            // SC1: inspect on foot.
            var sc1 = set.cards[Index(set, "SC1")];
            yield return StandAt(player, OnGround(new Vector3(sc1.position.x, sc1.ground, sc1.position.y)));
            StringAssert.StartsWith("E  Inspect Founder", system.Prompt);
            var before = wallet.Balance;
            yield return Tap(Key.E);
            yield return null;
            CollectionAssert.Contains(system.Found, "SC1");
            Assert.AreEqual(before + 100, wallet.Balance);
            yield return Tap(Key.E);
            Assert.AreEqual(before + 100, wallet.Balance, "a card pays once");

            // SC2: read the board, a wrong press, then 2 → 1 → 3.
            var sc2 = set.cards[Index(set, "SC2")];
            yield return StandAt(player, OnGround(new Vector3(sc2.position.x, sc2.ground, sc2.position.y)));
            StringAssert.StartsWith("E  Read", system.Prompt);
            yield return Tap(Key.E);
            foreach (var b in new[] { 2, 1, 0, 2 })
            {
                yield return StandAt(player, OnGround(set.ButtonPosition(sc2, b) + Vector3.up * sc2.ground));
                Assert.AreEqual($"E  Press {sc2.buttons[b].label}", system.Prompt);
                yield return Tap(Key.E);
            }
            CollectionAssert.Contains(system.Found, "SC2", "solved after a wrong first press");

            // SC3: drive up to it. Call the car (H path), stand beside it, F in.
            player.PressCall();
            yield return new WaitForSeconds(0.5f);
            var side = player.Car.transform.position + player.Car.transform.right * 2.2f;
            player.Walker.Place(side + Vector3.up, 0f);
            for (var f = 0; f < 5; f++) yield return null;
            var walkFrom = player.Walker.transform.position;
            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current, $"boarding from {walkFrom}");
            var sc3 = set.cards[Index(set, "SC3")];
            var car = player.Car;
            var target = new Vector3(sc3.position.x, sc3.ground, sc3.position.y);
            var t = 0f;
            while (!System.Linq.Enumerable.Contains(system.Found, "SC3") && t < 25f)
            {
                // A simple driver towards the card (the test drives; the trigger is the real one).
                var to = target - car.transform.position;
                to.y = 0f;
                var steer = Vector3.SignedAngle(car.transform.forward, to, Vector3.up) / 30f;
                Press(steer > 0.2f ? new[] { Key.W, Key.D } : steer < -0.2f ? new[] { Key.W, Key.A } : new[] { Key.W });
                t += Time.deltaTime;
                yield return null;
            }
            Press();
            CollectionAssert.Contains(system.Found, "SC3", $"car at {car.transform.position}, card at {target}");
        }
    }
}
