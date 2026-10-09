using System.Collections;
using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Stunts;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Ramps (Phase 7.4): every ramp is jumpable from its 40 m run-up with throttle and nitro through the
    /// keyboard — the car takes off at the lip, lands, and the stunt judge scores a jump from that ramp.
    /// </summary>
    public class RampTests
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
        public IEnumerator EveryRamp_IsJumpable_FromItsRunUp()
        {
            yield return BootGame();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var stunts = Object.FindAnyObjectByType<StuntScorer>();
            var set = stunts.Ramps;
            // Board the car the game's way (F beside it).
            Press(Key.F);
            yield return null;
            Press();
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);

            var report = new List<string>();
            var failed = new List<string>();
            for (var i = 0; i < set.ramps.Length; i++)
            {
                var r = set.ramps[i];
                var car = player.Car;
                var foot = new Vector3(r.start.x, 0f, r.start.y);
                // Test setup like a fast travel: on the run-up, 40 m before the kicker.
                car.Place(foot - r.Forward * 40f, r.yaw, fromAbove: 300f);
                yield return new WaitForFixedUpdate();
                var before = stunts.Count;
                var target = foot + r.Forward * (r.Length + 40f);
                var lipKmh = 0f;
                for (var t = 0f; t < 9f && stunts.Count == before; t += Time.deltaTime)
                {
                    var to = target - car.transform.position;
                    to.y = 0f;
                    var err = Vector3.SignedAngle(car.transform.forward, to, Vector3.up);
                    var past = Vector3.Dot(car.transform.position - foot, r.Forward);
                    var keys = new List<Key> { Key.W };
                    if (past < r.riseLength) keys.Add(Key.LeftShift);
                    if (!car.Telemetry.airborne && err > 2f) keys.Add(Key.D);
                    else if (!car.Telemetry.airborne && err < -2f) keys.Add(Key.A);
                    Press(keys.ToArray());
                    if (past < r.riseLength) lipKmh = car.Telemetry.speed * 3.6f;
                    yield return null;
                }
                Press();
                var got = stunts.Count > before ? stunts.Last : default;
                var line = $"{r.id}: lip {lipKmh:0} km/h → {(stunts.Count > before ? got.title : "no jump")} (ramp {got.ramp}, air {got.airtime:0.00} s) · {stunts.Judge.LastLanding}";
                report.Add(line);
                if (stunts.Count == before || got.ramp != i || got.distance < 5f) failed.Add(line);
                yield return new WaitForSeconds(0.3f);
            }
            Debug.Log("[RampTest]\n" + string.Join("\n", report));
            Assert.IsEmpty(failed, string.Join("\n", failed));
        }
    }
}
