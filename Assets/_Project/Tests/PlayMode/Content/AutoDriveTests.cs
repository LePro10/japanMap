using System.Collections;
using System.Collections.Generic;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Map;
using JapanMap.Gameplay.Menu;
using JapanMap.Vehicles;
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
    /// Auto-drive to the waypoint (D49) on the player's path: a waypoint set on the map, "Auto-drive" clicked — the car
    /// drives there by itself through the car physics and stops; a second waypoint by holding G; steering hands control
    /// back at once; no waypoint, a locked feature: refused. The cinematic camera is watched all along: never inside the
    /// world, the car in sight, many different shots.
    /// </summary>
    [FreshSave]
    public class AutoDriveTests
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
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            AudioListener.pause = false;
            Unlocks.Query = null;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (_mouse != null) InputSystem.RemoveDevice(_mouse);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        IEnumerator Key(Key key, float hold = 0f)
        {
            InputSystem.QueueStateEvent(_kb, new KeyboardState(key));
            InputSystem.Update();
            // Real time: a hold interaction counts input time, and the test runner's game time runs ahead of it.
            if (hold > 0f) yield return new WaitForSecondsRealtime(hold);
            else yield return null;
            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            yield return null;
        }

        IEnumerator Click(VisualElement e)
        {
            yield return UiSettle.Wait(e);
            var root = e.panel.visualTree.worldBound;
            var px = 1f / Core.Ui.UiPanel.Scale;
            var c = e.worldBound.center;
            var at = new Vector2(c.x * px, (root.height - c.y) * px);
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

        IEnumerator BootInCar()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            yield return Key(UnityEngine.InputSystem.Key.F);
            yield return new WaitForSeconds(0.5f);
        }

        /// <summary>A road point whose drive from <paramref name="from"/> is between <paramref name="min"/> and <paramref name="max"/> m, away from <paramref name="avoid"/>.</summary>
        static Vector3 RoadGoal(MapSystem map, Vector3 from, float min, float max, Vector3? avoid = null)
        {
            var graph = RouteGuide.Instance.Graph;
            var path = new List<Vector3>();
            var best = Vector3.zero;
            var bestScore = float.MinValue;
            foreach (var road in map.Roads.roads)
            {
                if (road.type == "pfad" || road.width < 7f || road.points == null) continue;
                for (var i = 0; i < road.points.Length; i += 6)
                {
                    var p = road.points[i];
                    var flat = new Vector2(p.x - from.x, p.z - from.z).magnitude;
                    if (flat < min * 0.5f || flat > max) continue;
                    if (!graph.Find(from, p, path)) continue;
                    var len = 0f;
                    for (var k = 1; k < path.Count; k++) len += Vector3.Distance(path[k - 1], path[k]);
                    if (len < min || len > max) continue;
                    // Prefer far from the last start (a different direction) and a wide road.
                    var score = (avoid.HasValue ? Vector3.Distance(p, avoid.Value) : 0f) + road.width * 5f;
                    if (score > bestScore) { bestScore = score; best = p; }
                }
            }
            Assert.Greater(bestScore, float.MinValue, $"a road goal {min}–{max} m from {from}");
            return best;
        }

        [UnityTest, Timeout(420000)]
        public IEnumerator DrivesToWaypoints_ByMapAndByKey_CameraStaysClear()
        {
            yield return BootInCar();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var map = Object.FindAnyObjectByType<MapSystem>();
            var menu = Object.FindAnyObjectByType<GameMenu>();
            var auto = AutoDriver.Instance;
            var rig = Object.FindAnyObjectByType<CarCameraRig>();
            Assert.NotNull(auto, "auto-drive registered");
            Assert.AreSame(auto, AutoDrive.Current, "AutoDrive.Current is the auto driver");
            Assert.NotNull(rig.Cinematic, "cinematic camera on the car camera rig");
            var car = player.Car;
            var start = car.transform.position;

            // 1) The map: a waypoint on a road, "Auto-drive" on its card.
            var goal1 = RoadGoal(map, start, 350f, 650f);
            yield return Key(UnityEngine.InputSystem.Key.M);
            Assert.IsTrue(menu.IsOpen && menu.Current is MapScreen, "M opens the map");
            var screen = (MapScreen)menu.Current;
            screen.Select($"land:{goal1.x:0}:{goal1.z:0}");
            yield return null;
            var button = menu.Root.Q<Button>("map-autodrive");
            Assert.NotNull(button, $"the map card offers Auto-drive ({screen.Text})");
            yield return Click(button);
            Assert.IsFalse(menu.IsOpen, "Auto-drive closes the map");
            Assert.IsTrue(auto.IsActive, $"auto-drive runs ({auto.Refusal})");
            yield return Watch(auto, rig, car, "map", 150f);

            // 2) Hold G: the next waypoint, somewhere else.
            var here = car.transform.position;
            var goal2 = RoadGoal(map, here, 350f, 700f, start);
            map.Waypoint = new Vector2(goal2.x, goal2.z);
            yield return Key(UnityEngine.InputSystem.Key.G, 0.7f);
            Assert.IsTrue(auto.IsActive, $"holding G starts auto-drive ({auto.Refusal})");
            yield return Watch(auto, rig, car, "key", 150f);
        }

        /// <summary>Drives until arrival; measures time, distance to the planned line and the camera every frame.</summary>
        IEnumerator Watch(AutoDriver auto, CarCameraRig rig, VehicleController car, string label, float timeout)
        {
            var arrived = false;
            void OnArrived() => arrived = true;
            auto.Arrived += OnArrived;
            var route = auto.Route.ToArray();
            var length = auto.Pilot.Length;
            var t0 = Time.time;
            int frames = 0, inside = 0, hidden = 0;
            float maxOff = 0f, sumOff = 0f, maxKmh = 0f, maxAtS = 0f;
            var maxAt = Vector3.zero;
            var shots = new HashSet<CineShot>();
            var cuts0 = rig.Cinematic.Cuts;
            while (!arrived && Time.time - t0 < timeout)
            {
                yield return null;
                if (!auto.IsActive) break;
                frames++;
                var off = DistanceTo(route, car.transform.position);
                if (off > maxOff) { maxOff = off; maxAt = car.transform.position; maxAtS = auto.Pilot.Position; }
                sumOff += off;
                maxKmh = Mathf.Max(maxKmh, car.Telemetry.speed * 3.6f);
                if (rig.Cinematic.Showing)
                {
                    shots.Add(rig.Cinematic.Current);
                    if (!rig.Cinematic.PoseIsClear(out var sees)) inside++;
                    if (!sees) hidden++;
                }
            }
            auto.Arrived -= OnArrived;
            var seconds = Time.time - t0;
            var goal = route[route.Length - 1];
            var line = $"auto-drive {label} → ({goal.x:0}, {goal.z:0}): {length:0} m in {seconds:0.0} s (avg {length / Mathf.Max(seconds, 0.1f) * 3.6f:0} km/h, max {maxKmh:0}), " +
                       $"stop '{auto.LastStop}', off the line max {maxOff:0.0} m (at ({maxAt.x:0}, {maxAt.z:0}), {maxAtS:0} m along) / mean {sumOff / Mathf.Max(frames, 1):0.00} m, replans {auto.Replans}, recoveries {auto.Recoveries}, " +
                       $"camera: {rig.Cinematic.Cuts - cuts0} cuts, shots {string.Join(",", shots)}, inside {inside}/{frames}, car hidden {hidden}/{frames}";
            Debug.Log(line);
            System.IO.File.AppendAllText("Captures/autodrive.txt", line + "\n");
            Assert.IsTrue(arrived, "arrived at the waypoint · " + line);
            Assert.IsFalse(auto.IsActive, "auto-drive ends on arrival");
            Assert.IsNull(Object.FindAnyObjectByType<MapSystem>().Waypoint, "the waypoint is cleared on arrival");
            Assert.Less(car.Telemetry.speed, 1.5f, "stopped at the waypoint · " + line);
            Assert.Greater(length / seconds * 3.6f, 25f, "brisk, not crawling · " + line);
            Assert.Less(maxOff, 6f, "stays on the planned line · " + line);
            Assert.LessOrEqual(auto.Recoveries, 1, "hardly ever stuck · " + line);
            Assert.AreEqual(0, inside, "the camera is never inside the world · " + line);
            Assert.Less(hidden, frames * 0.03f, "the car is in sight (a post may cross the lens) · " + line);
            Assert.GreaterOrEqual(shots.Count, 4, "many different shots · " + line);
        }

        static float DistanceTo(Vector3[] line, Vector3 p)
        {
            var best = float.MaxValue;
            for (var i = 0; i + 1 < line.Length; i++)
            {
                var a = new Vector2(line[i].x, line[i].z);
                var b = new Vector2(line[i + 1].x, line[i + 1].z);
                var q = new Vector2(p.x, p.z);
                var ab = b - a;
                var t = ab.sqrMagnitude < 1e-4f ? 0f : Mathf.Clamp01(Vector2.Dot(q - a, ab) / ab.sqrMagnitude);
                best = Mathf.Min(best, (a + ab * t - q).magnitude);
            }
            return best;
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator Steering_TakesOverAtOnce_AndRefusedWithoutWaypointOrUnlock()
        {
            yield return BootInCar();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var map = Object.FindAnyObjectByType<MapSystem>();
            var auto = AutoDriver.Instance;
            var rig = Object.FindAnyObjectByType<CarCameraRig>();
            var car = player.Car;

            // No waypoint: refused, with the reason.
            map.Waypoint = null;
            auto.SetActive(true);
            Assert.IsFalse(auto.IsActive);
            StringAssert.Contains("waypoint", auto.Refusal);

            // Locked by the career: refused with the unlock hint.
            var goal = RoadGoal(map, car.transform.position, 300f, 800f);
            map.Waypoint = new Vector2(goal.x, goal.z);
            Unlocks.Query = new Locked();
            auto.SetActive(true);
            Assert.IsFalse(auto.IsActive, "locked feature");
            StringAssert.Contains("Unlocks", auto.Refusal);
            Unlocks.Query = null;

            // Running: the car speeds up by itself, the HUD goes, bars come.
            var changes = new List<bool>();
            void OnChanged(bool on) => changes.Add(on);
            auto.ActiveChanged += OnChanged;
            var action = player.Actions.FindAction("Drive/AutoDrive");
            var log = new System.Text.StringBuilder();
            void OnAny(InputAction.CallbackContext c) => log.Append($"{c.phase}@{c.time:0.00}/{Time.realtimeSinceStartupAsDouble:0.00} ");
            action.started += OnAny; action.performed += OnAny; action.canceled += OnAny;
            yield return Key(UnityEngine.InputSystem.Key.G, 0.7f);
            action.started -= OnAny; action.performed -= OnAny; action.canceled -= OnAny;
            Assert.IsTrue(auto.IsActive, $"hold G starts: refusal '{auto.Refusal}', changes {string.Join(",", changes)}, stop '{auto.LastStop}', action {action?.phase} {action?.enabled} log {log}");
            // It may turn round first (a three-point turn when the way on is behind).
            for (var w = 0f; w < 12f && car.Telemetry.speed < 5f; w += Time.deltaTime) yield return null;
            Assert.Greater(car.Telemetry.speed, 5f, "drives by itself");
            Assert.IsTrue(rig.Cinematic.Showing, "cinematic camera");
            Assert.IsTrue(Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.GameplayHud>().Hidden, "HUD away while cinematic");

            // C: the player's camera while it keeps driving; C again: cinematic.
            yield return Key(UnityEngine.InputSystem.Key.C);
            Assert.IsTrue(auto.IsActive && !rig.Cinematic.Showing, "C shows the player's camera, still driving itself");
            yield return Key(UnityEngine.InputSystem.Key.C);
            Assert.IsTrue(rig.Cinematic.Showing, "C again: cinematic");

            // Steer: control back in the same physics step, the steering is the player's.
            InputSystem.QueueStateEvent(_kb, new KeyboardState(UnityEngine.InputSystem.Key.D));
            InputSystem.Update();
            yield return new WaitForFixedUpdate();
            yield return new WaitForFixedUpdate();
            Assert.IsFalse(auto.IsActive, "steering takes over at once");
            Assert.Greater(car.Input.steer, 0.5f, "the car steers as the player does");
            Assert.IsFalse(rig.Cinematic.Running, "the camera is the player's again");
            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            yield return null;
            Assert.IsFalse(Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.GameplayHud>().Hidden, "HUD back");
            CollectionAssert.AreEqual(new[] { true, false }, changes, "ActiveChanged on start and on takeover");
            auto.ActiveChanged -= OnChanged;
        }

        sealed class Locked : IUnlockQuery
        {
            public bool IsUnlocked(FeatureId id) => id != FeatureId.AutoDrive;
            public string Requirement(FeatureId id) => "Finish the first drive";
            public event System.Action Changed { add { } remove { } }
        }
    }
}
