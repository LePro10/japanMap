using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Drift;
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
    /// Drift score on the game's own path (Phase 7.1): boot on foot in Sakura Commons, F into the car,
    /// throttle + steer + handbrake through the keyboard inside Sakura Bowl → a chain with spot bonus;
    /// a wall hit at speed cuts it to half and pays the rest into the wallet.
    /// </summary>
    public class DriftScoreTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;
        GameObject _wall;

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
            if (_wall != null) Object.Destroy(_wall);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_kb, new KeyboardState(keys));
            InputSystem.Update();
        }

        static IEnumerator Seconds(float s)
        {
            var end = Time.time + s;
            while (Time.time < end) yield return new WaitForFixedUpdate();
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

        [UnityTest]
        public IEnumerator HandbrakeDrift_InSakuraBowl_Scores_AndACrashBanksHalf()
        {
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var drift = Object.FindAnyObjectByType<DriftScorer>();
            var wallet = Object.FindAnyObjectByType<SparksWallet>();
            Assert.IsNotNull(drift, "World/Content/Drift missing — run Content/Setup");
            yield return Seconds(1.5f);
            Press(Key.F);
            yield return null;
            Press();
            yield return Seconds(1f);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);

            Press(Key.W);
            yield return Seconds(2.5f);
            Press(Key.W, Key.A, Key.Space);
            yield return Seconds(0.15f);
            Press(Key.W, Key.A);
            yield return Seconds(2f);
            var chain = drift.Chain;
            Debug.Log($"[DriftTest] pending {chain.Pending:0} active {chain.Active} zone {drift.Zone} at {player.Car.transform.position:F1}");
            Assert.IsTrue(chain.Active, "a handbrake drift starts a chain");
            Assert.Greater(chain.Pending, 200f);
            Assert.AreEqual(0, drift.Zone, "the drift is inside Sakura Bowl");

            // Straight on into a wall: the chain is cut, half of it banked.
            ChainEnd end = ChainEnd.None;
            float credit = 0f, before = 0f;
            drift.ChainEnded += (r, c, all) => { end = r; credit = c; before = all; };
            var car = player.Car;
            var v = car.Body.linearVelocity;
            v.y = 0f;
            var dir = v.normalized;
            _wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _wall.transform.localScale = new Vector3(12f, 4f, 1f);
            _wall.transform.SetPositionAndRotation(car.transform.position + dir * Mathf.Max(5f, v.magnitude * 0.35f) + Vector3.up, Quaternion.LookRotation(dir));
            Press(Key.W);
            var t = 0f;
            while (end == ChainEnd.None && t < 3f)
            {
                t += Time.fixedDeltaTime;
                yield return new WaitForFixedUpdate();
            }
            Debug.Log($"[DriftTest] end {end} credit {credit:0} of {before:0}, contact {drift.LastContactKmh:0.0} km/h, sparks {wallet.Balance}");
            Assert.AreEqual(ChainEnd.Crash, end, $"wall hit {drift.LastContactKmh:0.0} km/h");
            Assert.AreEqual(before * 0.5f, credit, 1f);
            Assert.AreEqual(Mathf.FloorToInt(credit / 100f), wallet.Balance, "banked score paid at 100 per Spark");
            Press();
        }
    }
}
