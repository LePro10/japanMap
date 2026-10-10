using System.Collections;
using System.Text;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// Phase 10: on the ring at (541, −710) a 46 m dip pulled 2.6 g at speed and the body hit the asphalt (STATUS since
    /// Phase 8). The road profile is evened out on import (RoadProfile); this drives the spot at 115 km/h on the real
    /// map and wants no hit of the body on a road surface.
    /// </summary>
    [FreshSave]
    public class RingDipTests
    {
        [TearDown]
        public void TearDown()
        {
            if (JapanMap.Core.Bootstrapper.Instance != null) Object.Destroy(JapanMap.Core.Bootstrapper.Instance.gameObject);
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator Ring_ThroughTheOldDip_At115_BodyNeverTouchesTheRoad()
        {
            UnityEngine.SceneManagement.SceneManager.LoadScene(JapanMap.Core.Bootstrapper.BootSceneName);
            for (var f = 0; f < 120 && UnityEngine.SceneManagement.SceneManager.GetActiveScene().name != "Game"; f++) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var respawn = Object.FindAnyObjectByType<JapanMap.Vehicles.VehicleRespawn>();
            var road = ((JapanMap.World.RoadNetwork)respawn.Locator).roads.Find(r => r.id == "ring");
            var car = Object.FindAnyObjectByType<JapanMap.Vehicles.PlayerCarSpawner>().Current;
            Object.FindAnyObjectByType<JapanMap.Vehicles.DriverInput>().Vehicle = null;
            var p = road.points;
            // 250 m before the dip, driving towards it (either direction of the loop — pick the one that reaches it).
            var dip = new Vector3(541f, 0f, -710f);
            var at = 0;
            for (var i = 0; i < p.Length; i++)
                if (Flat(p[i] - dip) < Flat(p[at] - dip)) at = i;
            var start = (at - 125 + p.Length) % p.Length; // stations ~2 m apart
            var next = (start + 1) % p.Length;
            car.Place(p[start], Mathf.Atan2(p[next].x - p[start].x, p[next].z - p[start].z) * Mathf.Rad2Deg, fromAbove: 2f);
            car.Body.linearVelocity = (p[next] - p[start]).normalized * (115f / 3.6f);
            var pilot = car.gameObject.AddComponent<JapanMap.Vehicles.PathFollower>();
            pilot.maxSpeedKmh = 118f;
            pilot.Begin(car, p, true, start);
            var hits = new StringBuilder();
            var log = car.gameObject.AddComponent<BodyContactLog>();
            log.sb = hits;
            log.time = () => Time.time;
            log.minImpulse = 50f;
            var minKmh = float.MaxValue;
            var passed = false;
            for (var i = 0; i < 1000 && !passed; i++)
            {
                yield return new WaitForFixedUpdate();
                if (Flat(car.transform.position - dip) < 60f) minKmh = Mathf.Min(minKmh, car.Telemetry.speed * 3.6f);
                passed = Flat(car.transform.position - p[(at + 60) % p.Length]) < 10f;
            }
            Assert.IsTrue(passed, $"the car did not get 120 m past the dip (at {car.transform.position})");
            var roadHits = new StringBuilder();
            foreach (var line in hits.ToString().Split('\n'))
                if (line.Contains("Road") && !line.Contains("Rail")) roadHits.AppendLine(line);
            Assert.IsEmpty(roadHits.ToString().Trim(), $"the body hit the road (slowest {minKmh:0} km/h):\n" + roadHits);
            // The pilot brakes for the bend at the dip (86 km/h measured); below 80 the test would mean little.
            Assert.Greater(minKmh, 80f, "through the dip at speed");
        }

        static float Flat(Vector3 v) => new Vector2(v.x, v.z).magnitude;
    }
}
