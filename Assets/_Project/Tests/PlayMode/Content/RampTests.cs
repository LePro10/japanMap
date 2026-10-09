using System.Collections;
using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Stunts;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Ramps (Phase 7.4): every ramp, met at its recommended speed (middle of the hint), launches at the
    /// lip — the car takes off at the lip, lands, and the stunt judge scores a jump from that ramp.
    /// </summary>
    [FreshSave]
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
                // Recommended speed from the hint ("55–75 km/h"): the middle of it.
                var parts = r.speedHint.Replace(" km/h", "").Split('–');
                var kmh = (float.Parse(parts[0]) + float.Parse(parts[1])) * 0.5f;
                // Test setup like the smash tests: 40 m before the kicker at that speed, the AI driver
                // holds the line and the speed — the ramp's geometry is under test, not the run-up.
                car.Place(foot - r.Forward * 40f, r.yaw, fromAbove: 300f);
                yield return new WaitForFixedUpdate();
                car.Body.linearVelocity = car.transform.forward * kmh / 3.6f;
                var pilot = car.gameObject.AddComponent<PathFollower>();
                // Above the target: on grass a driver holding a speed coasts and drops 20 km/h; players floor it.
                pilot.maxSpeedKmh = kmh + 10f;
                var line = new Vector3[40];
                for (var k = 0; k < line.Length; k++) line[k] = foot + r.Forward * (-40f + k * (r.Length + 80f) / (line.Length - 1));
                pilot.Begin(car, line, false);
                var before = stunts.Count;
                var lipKmh = 0f;
                var landings = new List<string>();
                // Bumps on the natural run-up may score their own little jump first: wait for this ramp's.
                StuntResult? mine = null;
                void OnScored(StuntResult x) { if (x.ramp == i) mine = x; }
                stunts.Scored += OnScored;
                for (var t = 0f; t < 10f && mine == null; t += Time.deltaTime)
                {
                    var l = stunts.Judge.LastLanding;
                    if (l != "" && (landings.Count == 0 || landings[^1] != l)) landings.Add(l);
                    if (Vector3.Dot(car.transform.position - foot, r.Forward) < r.riseLength) lipKmh = car.Telemetry.speed * 3.6f;
                    yield return null;
                }
                stunts.Scored -= OnScored;
                Object.Destroy(pilot);
                var got = mine ?? default;
                var entry = $"{r.id}: lip {lipKmh:0} km/h → {(mine != null ? got.title : "no jump from this ramp")} (ramp {got.ramp}, air {got.airtime:0.00} s) · {stunts.Judge.LastLanding} · along {Vector3.Dot(car.transform.position - foot, r.Forward):0} m · all: {string.Join(" / ", landings)}";
                report.Add(entry);
                if (mine == null || got.distance < 5f) failed.Add(entry);
                yield return new WaitForSeconds(0.3f);
            }
            Debug.Log("[RampTest]\n" + string.Join("\n", report));
            Assert.IsEmpty(failed, string.Join("\n", failed));
        }
    }
}
