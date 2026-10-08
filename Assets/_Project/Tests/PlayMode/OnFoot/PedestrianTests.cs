using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Life;
using JapanMap.Vehicles;
using JapanMap.World;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// Phase 6 acceptance: pedestrians spawned by the crowd itself walk 10 simulated minutes in
    /// Tokyo and the villages, and none of them ever stands on a carriageway (road network: centre
    /// line ± half width). The player is moved between places so the crowd respawns everywhere.
    /// And a car at speed throws a pedestrian, loses only a little speed, and the person gets up
    /// again on the pavement.
    /// </summary>
    public class PedestrianTests
    {
        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
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

        // Tokyo pavements, Koedo kura street, Kiso post town, Funaura quay, Sakura court (Unity x, z).
        static readonly Vector2[] Stops = { new(640f, -262f), new(560f, -120f), new(-218f, -131f), new(-1358f, 1071f), new(-1233f, -1055f), new(550f, -510f) };

        [UnityTest, Timeout(900000)]
        public IEnumerator TenMinutes_NoPedestrianOnACarriageway()
        {
            yield return BootGame();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            var crowd = Object.FindAnyObjectByType<PedestrianCrowd>();
            var roads = (RoadNetwork)Object.FindAnyObjectByType<VehicleRespawn>().Locator;
            Assert.NotNull(crowd, "no pedestrian crowd in Game.unity");
            Time.maximumDeltaTime = 0.1f;
            Time.timeScale = 8f;
            var t0 = Time.time;
            int samples = 0, violations = 0, stop = -1;
            float nextCheck = 0f, activeSum = 0f, checks = 0f;
            var worst = "";
            while (Time.time - t0 < 600f)
            {
                var t = Time.time - t0;
                var want = Mathf.Min(Stops.Length - 1, (int)(t / (600f / Stops.Length)));
                if (want != stop)
                {
                    stop = want;
                    var p = new Vector3(Stops[stop].x, 400f, Stops[stop].y);
                    if (NavMesh.SamplePosition(new Vector3(p.x, Ground(p), p.z), out var hit, 40f, NavMesh.AllAreas)) p = hit.position;
                    else p.y = Ground(p);
                    mode.Walker.Place(p, 0f); // test setup: where the player stands, not how the crowd behaves
                }
                if (t >= nextCheck)
                {
                    nextCheck = t + 0.5f;
                    var active = 0;
                    foreach (var ped in crowd.People)
                    {
                        if (!ped.gameObject.activeSelf || ped.Knocked) continue;
                        active++;
                        samples++;
                        var on = roads.CarriagewayAt(ped.transform.position);
                        if (on == null) continue;
                        violations++;
                        if (worst == "") worst = $"{on} at {ped.transform.position:F1}, t={t:F0}s";
                    }
                    activeSum += active;
                    checks++;
                }
                yield return null;
            }
            Time.timeScale = 1f;
            var line = $"pedestrians: {samples} samples over 600 s at {Stops.Length} places, Ø {activeSum / checks:F1} active, {violations} on a carriageway {worst}";
            Debug.Log(line);
            System.IO.File.WriteAllText("Captures/pedestrian-10min.txt", line + "\n");
            Assert.That(activeSum / checks, Is.GreaterThan(crowd.People.Count * 0.5f), "the crowd must actually be out there");
            Assert.AreEqual(0, violations, line);
        }

        [UnityTest]
        public IEnumerator Car_ThrowsAPedestrian_LosesLittleSpeed_PersonGetsUpOnThePavement()
        {
            yield return BootGame();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            var crowd = Object.FindAnyObjectByType<PedestrianCrowd>();
            var roads = (RoadNetwork)Object.FindAnyObjectByType<VehicleRespawn>().Locator;
            var tokyo = new Vector3(640f, 0f, -262f);
            tokyo.y = Ground(tokyo);
            NavMesh.SamplePosition(tokyo, out var stand, 40f, NavMesh.AllAreas);
            mode.Walker.Place(stand.position, 0f);
            yield return new WaitForSeconds(3f);
            var ped = crowd.People.Where(p => p.gameObject.activeSelf).OrderBy(p => Vector3.Distance(p.transform.position, stand.position)).First();
            ped.Agent.isStopped = true; // a still target, so the shot is deterministic

            var car = mode.Car;
            var target = ped.transform.position;
            var from = target - Vector3.right * 14f;
            car.Place(from, 90f, fromAbove: 3f);
            yield return new WaitForFixedUpdate();
            var aim = target - car.transform.position;
            aim.y = 0f;
            car.Place(car.transform.position, Mathf.Atan2(aim.x, aim.z) * Mathf.Rad2Deg, fromAbove: 1f);
            car.Body.linearVelocity = aim.normalized * 14f; // ~50 km/h
            var body = ped.GetComponent<Rigidbody>();
            var rest = body.worldCenterOfMass.y;
            float before = 0f, peak = rest;
            var hit = false;
            for (var i = 0; i < 200 && !hit; i++)
            {
                before = car.Body.linearVelocity.magnitude;
                yield return new WaitForFixedUpdate();
                hit = ped.Knocked;
            }
            Assert.IsTrue(hit, "the car must hit the pedestrian");
            var after = car.Body.linearVelocity.magnitude;
            for (var i = 0; i < 60; i++)
            {
                yield return new WaitForFixedUpdate();
                peak = Mathf.Max(peak, body.worldCenterOfMass.y);
            }
            Assert.That(peak - rest, Is.GreaterThan(0.4f), "thrown up, not pushed flat (centre of mass)");
            Assert.That(after / before, Is.InRange(0.85f, 1.0f), $"car keeps most of its speed ({before * 3.6f:F0} → {after * 3.6f:F0} km/h)");
            var t = 0f;
            while (ped.Knocked && t < 15f)
            {
                t += Time.deltaTime;
                yield return null;
            }
            Assert.IsFalse(ped.Knocked, "gets up again");
            Assert.IsTrue(ped.Agent.isOnNavMesh, "back on the pavement NavMesh");
            Assert.IsNull(roads.CarriagewayAt(ped.transform.position), "not standing on the road");
        }

        static float Ground(Vector3 at) =>
            Physics.Raycast(new Vector3(at.x, 600f, at.z), Vector3.down, out var h, 1200f, ~GameLayers.NotGround) ? h.point.y : 0f;
    }
}
