using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Traffic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// City traffic (Phase 6.3): the cars spawned by the traffic system drive their lanes without
    /// getting stuck, the player's car can shove one away, and a car stops for a person on the road.
    /// </summary>
    [FreshSave]
    public class TrafficTests
    {
        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator BootInTokyo()
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
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            var at = new Vector3(653f, 600f, -300f);
            Physics.Raycast(at, Vector3.down, out var g, 1200f, ~GameLayers.NotGround);
            mode.Walker.Place(g.point, 0f); // setup: the player stands in Tokyo
        }

        [UnityTest, Timeout(300000)]
        public IEnumerator Traffic_DrivesItsLanes_ForAMinute()
        {
            yield return BootInTokyo();
            var traffic = Object.FindAnyObjectByType<TrafficSystem>();
            Assert.NotNull(traffic, "no traffic system in Game.unity");
            Time.timeScale = 4f;
            var t0 = Time.time;
            int samples = 0, onRoad = 0, moving = 0, active = 0;
            var off = new System.Text.StringBuilder();
            while (Time.time - t0 < 60f)
            {
                yield return new WaitForSeconds(0.5f);
                foreach (var c in traffic.Cars)
                {
                    if (!c.gameObject.activeSelf) continue;
                    active++;
                    if (Time.time - t0 < 5f) continue; // first placements settle
                    samples++;
                    if (traffic.Roads.CarriagewayAt(c.transform.position, 0f, 3f) != null) onRoad++;
                    else if (off.Length < 1500) off.Append($"\n  off at {c.transform.position:F0} road {(c.RoadIndex >= 0 ? traffic.Roads.roads[c.RoadIndex].id : "-")} pilotOff {c.Pilot.Offset:F1} seg-travel {c.Pilot.Travelled:F0}/{c.Pilot.Length:F0} kmh {c.Car.Telemetry.speed * 3.6f:F0}");
                    if (c.Car.Telemetry.speed * 3.6f > 10f) moving++;
                }
            }
            Time.timeScale = 1f;
            var line = $"traffic: {samples} samples, {100f * onRoad / samples:F0} % on a carriageway, {100f * moving / samples:F0} % above 10 km/h";
            Debug.Log(line);
            System.IO.File.WriteAllText("Captures/traffic-1min.txt", line + off + "\n");
            Assert.That(samples, Is.GreaterThan(traffic.Cars.Count * 80), "cars must be out there: " + line);
            Assert.That(onRoad, Is.GreaterThan(samples * 0.95f), line);
            Assert.That(moving, Is.GreaterThan(samples * 0.6f), "traffic must flow: " + line);
        }

        [UnityTest]
        public IEnumerator PlayersCar_ShovesATrafficCarAway()
        {
            yield return BootInTokyo();
            var traffic = Object.FindAnyObjectByType<TrafficSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            yield return new WaitForSeconds(1f);
            var npc = traffic.Cars.First(c => c.gameObject.activeSelf);
            npc.Pilot.enabled = false; // a parked target, so the shove is measurable
            npc.Car.Input = new JapanMap.Vehicles.DriveInput();
            yield return new WaitForSeconds(2f);
            var start = npc.transform.position;
            var car = mode.Car;
            var back = -npc.transform.forward;
            car.Place(start + back * 12f + Vector3.up * 0.5f, npc.transform.eulerAngles.y, fromAbove: 3f);
            yield return new WaitForFixedUpdate();
            car.Body.linearVelocity = npc.transform.forward * (35f / 3.6f);
            for (var i = 0; i < 150; i++)
            {
                car.Input = new JapanMap.Vehicles.DriveInput { throttle = 0.6f };
                yield return new WaitForFixedUpdate();
            }
            var moved = Vector3.Distance(npc.transform.position, start);
            Assert.That(moved, Is.GreaterThan(2f), $"the traffic car must give way (moved {moved:F1} m)");
        }

        [UnityTest]
        public IEnumerator TrafficCar_StopsForAPersonOnTheRoad()
        {
            yield return BootInTokyo();
            var traffic = Object.FindAnyObjectByType<TrafficSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            TrafficCar npc = null;
            for (var t = 0f; t < 20f && npc == null; t += 0.5f)
            {
                yield return new WaitForSeconds(0.5f);
                npc = traffic.Cars.FirstOrDefault(c => c.gameObject.activeSelf && c.Car.Telemetry.speed * 3.6f > 25f);
            }
            Assert.NotNull(npc, "no traffic car at speed");
            var ahead = npc.transform.position + npc.transform.forward * 30f + Vector3.up * 20f;
            Physics.Raycast(ahead, Vector3.down, out var g, 60f, ~GameLayers.NotGround);
            mode.Walker.Place(g.point, npc.transform.eulerAngles.y + 180f);
            var person = mode.Walker.transform;
            var closest = float.PositiveInfinity;
            for (var i = 0; i < 300; i++)
            {
                yield return new WaitForFixedUpdate();
                var d = Vector3.Distance(npc.transform.position, person.position);
                closest = Mathf.Min(closest, d);
            }
            Assert.That(npc.Car.Telemetry.speed * 3.6f, Is.LessThan(3f), "stopped");
            Assert.That(closest, Is.GreaterThan(npc.Car.Definition.bodySize.x * 0.5f + 1f), $"stopped short of the person (closest {closest:F1} m)");
        }
    }
}
