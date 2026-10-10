using System;
using System.Collections;
using System.IO;
using System.Linq;
using JapanMap.Core;
using JapanMap.Vehicles;
using JapanMap.World;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// Phase 3 acceptance: the player's car (Hachi 86) does a lap of the ring and the mountain pass
    /// descent on the real map, driven along the centreline by <see cref="PathFollower"/> — no
    /// getting stuck, no respawn, staying on the road. Game time runs 10× fast.
    /// Writes Captures/acceptance-drive.txt.
    /// </summary>
    public class AcceptanceDriveTests
    {
        float _timeScale, _maxDelta;

        [SetUp]
        public void SetUp()
        {
            _timeScale = Time.timeScale;
            _maxDelta = Time.maximumDeltaTime;
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = _timeScale;
            Time.maximumDeltaTime = _maxDelta;
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        [UnityTest, Timeout(600000)]
        public IEnumerator RingLap_WithoutGettingStuck() => Drive("ring", downhill: false, maxKmh: 120f);

        [UnityTest, Timeout(600000)]
        public IEnumerator MountainPassDescent_WithoutGettingStuck() => Drive("toge", downhill: true, maxKmh: 90f);

        static IEnumerator Drive(string roadId, bool downhill, float maxKmh)
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

            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            var respawn = Object.FindAnyObjectByType<VehicleRespawn>();
            var network = (RoadNetwork)respawn.Locator;
            var road = network.roads.First(r => r.id == roadId);
            var points = road.points.ToArray();
            if (downhill && points[0].y < points[^1].y) Array.Reverse(points);
            var car = spawner.Current;
            Object.FindAnyObjectByType<DriverInput>().Vehicle = null; // the autopilot drives
            var respawns = 0;
            respawn.Respawned += () => respawns++;

            car.Place(points[0], Mathf.Atan2(points[1].x - points[0].x, points[1].z - points[0].z) * Mathf.Rad2Deg, fromAbove: 3f);
            var pilot = car.gameObject.AddComponent<PathFollower>();
            pilot.maxSpeedKmh = maxKmh;
            pilot.Begin(car, points, road.closed);

            Time.maximumDeltaTime = 1f;
            Time.timeScale = 10f;
            var t0 = Time.time;
            float maxOffset = 0f, stuckFor = 0f, worstStuck = 0f, minUp = 1f;
            var lastProgress = 0f;
            var worstAt = Vector3.zero;
            var lastLog = -1f;
            var trace = new System.Text.StringBuilder();
            var contacts = car.gameObject.AddComponent<BodyContactLog>();
            contacts.sb = trace;
            contacts.minImpulse = 2000f;
            contacts.time = () => Time.time - t0;
            while (Time.time - t0 < 900f)
            {
                yield return new WaitForFixedUpdate();
                if (pilot.Offset > maxOffset) worstAt = car.transform.position;
                maxOffset = Mathf.Max(maxOffset, pilot.Offset);
                minUp = Mathf.Min(minUp, car.transform.up.y);
                stuckFor = car.Telemetry.speed < 2f ? stuckFor + Time.fixedDeltaTime : 0f;
                worstStuck = Mathf.Max(worstStuck, stuckFor);
                if (pilot.Finished || (road.closed && pilot.Travelled >= pilot.Length)) break;
                if (stuckFor > 10f) break;
                lastProgress = pilot.Travelled;
                if (Time.time - lastLog >= 1f)
                {
                    lastLog = Time.time;
                    trace.AppendLine($"{Time.time - t0,5:F0}s {pilot.Travelled,6:F0}m {car.Telemetry.speed * 3.6f,4:F0}/{pilot.TargetSpeed * 3.6f,4:F0} km/h steer {car.Input.steer,5:F2} thr {car.Input.throttle:F2} brk {car.Input.brake:F2} off {pilot.Offset,4:F1} slip {car.Telemetry.slip * Mathf.Rad2Deg,5:F1}° at {car.transform.position:F0}");
                }
            }
            var seconds = Time.time - t0;
            Time.timeScale = 1f;
            var line = $"{roadId}: {pilot.Travelled:F0} / {pilot.Length:F0} m in {seconds:F0} s game time " +
                       $"(Ø {pilot.Travelled / Mathf.Max(seconds, 1f) * 3.6f:F0} km/h), max off centre {maxOffset:F1} m " +
                       $"(half width {road.width / 2:F1}), longest stop {worstStuck:F1} s, respawns {respawns}, min up {minUp:F2}" +
                       $" | end at {car.transform.position:F1} heading {car.transform.eulerAngles.y:F0} input thr {car.Input.throttle:F2} brk {car.Input.brake:F2} steer {car.Input.steer:F2}" +
                       $" wheels {car.Telemetry.groundedWheels} surface {car.Telemetry.surface} support {car.Telemetry.support:F2} kmh {car.Telemetry.speed * 3.6f:F1}" +
                       $" | worst offset at {worstAt:F0}";
            Debug.Log(line);
            Directory.CreateDirectory("Captures");
            File.AppendAllText("Captures/acceptance-drive.txt", $"{DateTime.Now:yyyy-MM-dd HH:mm} {line}\n");
            File.WriteAllText($"Captures/acceptance-trace-{roadId}.txt", trace.ToString());

            Assert.That(pilot.Travelled, Is.GreaterThanOrEqualTo(pilot.Length * 0.98f), "did not complete: " + line);
            Assert.AreEqual(0, respawns, "needed a respawn: " + line);
            Assert.That(worstStuck, Is.LessThan(3f), "got stuck: " + line);
            Assert.That(maxOffset, Is.LessThan(road.width / 2f + 1.5f), "left the road: " + line);
            Assert.That(minUp, Is.GreaterThan(0.7f), "tipped over: " + line);
        }
    }
}
