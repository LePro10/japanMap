using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Smash;
using JapanMap.Vehicles;
using NUnit.Framework;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// Breakables (Phase 6.4): a street lamp in Tokyo falls to pieces at 40 km/h and the car drives
    /// on; at walking pace it stands. Each kind is found in the world. Cost of a break and of the
    /// debris physics measured against the budget (≤ 2 ms each).
    /// </summary>
    [FreshSave]
    public class SmashTests
    {
        static float _later;

        [TearDown]
        public void TearDown()
        {
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

        static Breakable Lamp(SmashSystem smash, Vector3 near) =>
            smash.Breakables.Where(b => b.Kind.name == "post" && b.name.StartsWith("streetLamp"))
                .OrderBy(b => (b.transform.position - near).sqrMagnitude).First();

        /// <summary>The car, placed 14 m before the target on its far side from the road, aimed at it, at <paramref name="kmh"/>.</summary>
        static IEnumerator RamAt(VehicleController car, Breakable target, float kmh, System.Action<float, float> result)
        {
            var c = target.transform.position;
            // Come from the road beside it, at an angle (behind a lamp there are houses).
            var roads = (JapanMap.World.RoadNetwork)Object.FindAnyObjectByType<VehicleRespawn>().Locator;
            roads.TryNearest(c, Vector3.forward, 30f, out var road, out var dir);
            var from = road - dir * 12f;
            car.Place(from, 0f, fromAbove: 3f);
            yield return new WaitForFixedUpdate();
            var aim = c - car.transform.position;
            aim.y = 0f;
            car.Place(car.transform.position, Mathf.Atan2(aim.x, aim.z) * Mathf.Rad2Deg, fromAbove: 1f);
            car.Body.linearVelocity = aim.normalized * (kmh / 3.6f);
            var before = kmh / 3.6f;
            var after = 0f;
            var brokeAt = -1;
            _later = 0f;
            for (var i = 0; i < 120; i++)
            {
                car.Input = new DriveInput { throttle = 0.35f };
                yield return new WaitForFixedUpdate();
                if (target.Broken && after == 0f) { after = car.Body.linearVelocity.magnitude; brokeAt = i; }
                if (brokeAt >= 0 && i == brokeAt + 15) _later = car.Body.linearVelocity.magnitude;
                if (Vector3.Distance(car.transform.position, c) < 1f && after == 0f) after = car.Body.linearVelocity.magnitude;
            }
            Debug.Log($"[SmashTest] {target.name} at {c:F1}: car from {from:F1} placed {car.transform.position:F1}, broken {target.Broken}, after {after * 3.6f:F0} km/h, end {car.transform.position:F1}");
            result(before, after);
        }

        [UnityTest]
        public IEnumerator Every_Kind_IsFoundInTheWorld()
        {
            yield return BootGame();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            Assert.NotNull(smash, "no SmashSystem in Game.unity");
            var counts = smash.Breakables.GroupBy(b => b.Kind.name).ToDictionary(g => g.Key, g => g.Count());
            var line = string.Join(", ", counts.Select(kv => $"{kv.Key} {kv.Value}"));
            Debug.Log("[Smash] " + line);
            foreach (var k in new[] { "post", "vending", "fence", "hut" })
                Assert.That(counts.TryGetValue(k, out var n) ? n : 0, Is.GreaterThan(3), $"{k}: {line}");
        }

        [UnityTest]
        public IEnumerator Lamp_BreaksAt40_CarDrivesOn_StandsAtWalkingPace()
        {
            yield return BootGame();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            mode.PressVehicle(); // into the car (it stands beside the walker at the start)
            var car = mode.Car;
            var slowLamp = Lamp(smash, new Vector3(653f, 30f, -300f));
            float b0 = 0, a0 = 0;
            yield return RamAt(car, slowLamp, 8f, (b, a) => { b0 = b; a0 = a; });
            Assert.IsFalse(slowLamp.Broken, "a lamp must survive a push at walking pace");

            var lamp = Lamp(smash, new Vector3(700f, 30f, -200f));
            yield return RamAt(car, lamp, 40f, (b, a) => { b0 = b; a0 = a; });
            Assert.IsTrue(lamp.Broken, "40 km/h into a lamp must break it");
            Assert.That(a0 / b0, Is.GreaterThan(0.8f), $"car drives on ({b0 * 3.6f:F0} → {a0 * 3.6f:F0} km/h)");
            Assert.That(_later * 3.6f, Is.GreaterThan(25f), "…and is not stopped by its own debris 0.3 s later");
            Assert.That(smash.LivePieces, Is.GreaterThan(0), "debris flies");
            Assert.IsFalse(lamp.GetComponent<Collider>().enabled, "no collider left to hit");
        }

        [UnityTest]
        public IEnumerator Tree_FallsAt50_StandsAt15()
        {
            yield return BootGame();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            mode.PressVehicle();
            var car = mode.Car;
            var veg = Object.FindObjectsByType<JapanMap.World.InstanceRenderer>().First(r => r.data is JapanMap.World.VegetationData);
            // A ring cherry of Sakura Commons with a trunk collider, on open ground.
            var ring = new Vector3(550f, 0f, -510f);
            var index = Enumerable.Range(0, veg.data.Count)
                .Where(i => Mathf.Abs(new Vector2(veg.data.positions[i].x - ring.x, veg.data.positions[i].z - ring.z).magnitude - 62f) < 5f)
                .OrderBy(i => veg.data.positions[i].x).First();
            var tree = veg.data.positions[index];
            var outward = new Vector3(tree.x - ring.x, 0f, tree.z - ring.z).normalized;

            IEnumerator Ram(float kmh)
            {
                // From inside the ring, straight out at the trunk.
                car.Place(tree - outward * 14f, Mathf.Atan2(outward.x, outward.z) * Mathf.Rad2Deg, fromAbove: 3f);
                for (var i = 0; i < 5; i++) yield return new WaitForFixedUpdate();
                car.Body.linearVelocity = outward * (kmh / 3.6f);
                for (var i = 0; i < 90; i++)
                {
                    car.Input = new DriveInput { throttle = 0.3f };
                    yield return new WaitForFixedUpdate();
                }
            }

            yield return Ram(15f);
            Assert.IsFalse(veg.IsHidden(index), "a tree stands a 15 km/h knock (legacy: trees only from ~40 km/h)");
            Assert.That(car.Telemetry.speed * 3.6f, Is.LessThan(8f), "…and stops the car");
            yield return Ram(50f);
            Assert.IsTrue(veg.IsHidden(index), "50 km/h fells the tree");
            Assert.That(smash.TreesBroken, Is.EqualTo(1));
            Assert.That(smash.LivePieces, Is.GreaterThan(3), "trunk and crown pieces fly");
            // D47: the trunk snapped where the bumper met it — a splintered stump stays, the top falls.
            Assert.That(smash.LiveStumps, Is.EqualTo(1), "a stump stays");
            Assert.That(smash.LiveChunks, Is.GreaterThanOrEqualTo(1), "the top falls as its own body");
        }

        /// <summary>
        /// D47, how things give way: a street lamp at 40 km/h kinks — its stub stands, the rest folds over on a hinge and
        /// hangs, the car drives on; a bench bursts into planks; a plastic delineator bends flat under the car and stands
        /// up again (never broken, its collider back once the car has gone).
        /// </summary>
        [UnityTest]
        public IEnumerator Lamp_Kinks_Bench_Splinters_Delineator_SpringsBack()
        {
            yield return BootGame();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            mode.PressVehicle();
            var car = mode.Car;

            var lamp = Lamp(smash, new Vector3(700f, 30f, -200f));
            var chunks0 = smash.LiveChunks;
            yield return RamAt(car, lamp, 40f, (_, _) => { });
            Assert.IsTrue(lamp.Broken, "the lamp gave way");
            Assert.That(smash.LiveStumps, Is.GreaterThanOrEqualTo(1), "its stub stands");
            Assert.That(smash.Hinged, Is.GreaterThanOrEqualTo(1), "the top hangs on at the kink");
            var top = smash.HingedTops.First();
            var lean = Vector3.ProjectOnPlane(top.up, Vector3.up);
            var way = Vector3.ProjectOnPlane(car.transform.forward, Vector3.up).normalized;
            Debug.Log($"[SmashTest] kinked top leans {Vector3.Angle(top.up, Vector3.up):F0}°, along the car {Vector3.Dot(lean.normalized, way):F2}");
            // In a street it folds until a facade stops it (~20°); in the open to the hinge's limit.
            Assert.That(Vector3.Angle(top.up, Vector3.up), Is.GreaterThan(10f), "…and has folded over");
            Assert.That(Vector3.Dot(lean.normalized, way), Is.GreaterThan(0.3f), "the way the car pushed it");

            var bench = smash.Breakables.Where(b => b.Kind.name == "fence" && b.name.StartsWith("bench") && !b.Broken)
                .OrderBy(b => (b.transform.position - car.transform.position).sqrMagnitude).First();
            var before = smash.LiveChunks;
            yield return RamAt(car, bench, 35f, (_, _) => { });
            Assert.IsTrue(bench.Broken, "the bench broke");
            Assert.That(smash.PlanksThrown, Is.GreaterThanOrEqualTo(2), "into planks, each flying on its own");

            var post = smash.Breakables.Where(b => b.Kind.name == "light" && b.GetComponentInChildren<Renderer>() != null)
                .OrderBy(b => (b.transform.position - car.transform.position).sqrMagnitude).First();
            var upright = post.transform.rotation;
            yield return RamAt(car, post, 45f, (_, _) => { });
            Assert.That(post.Flexed, Is.GreaterThan(0), "the delineator bent");
            Assert.IsFalse(post.Broken, "…and did not break");
            car.Place(car.transform.position + car.transform.forward * 30f, car.transform.eulerAngles.y, fromAbove: 3f); // off it
            var waited = 0f;
            while (post.Flexing && waited < 4f) { waited += Time.deltaTime; yield return null; }
            Assert.IsFalse(post.Flexing, "it stands up again");
            Assert.That(Quaternion.Angle(post.transform.rotation, upright), Is.LessThan(0.5f), "upright as before");
            Assert.IsTrue(post.GetComponentInChildren<Collider>().enabled, "with its collider back");
        }

        [UnityTest]
        public IEnumerator Cost_OfBreaks_AndDebris_WithinBudget()
        {
            yield return BootGame();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            mode.PressVehicle();
            var car = mode.Car;
            // The garbage of the tests before (a full run: 200 boots) is not this break's work: collect it before measuring.
            System.GC.Collect();
            yield return null;
            // Six lamps in a row: the debris pool fills up (6 × 3 pieces), then the physics is measured.
            var lamps = smash.Breakables.Where(b => b.name.StartsWith("streetLamp")).OrderBy(b => (b.transform.position - new Vector3(653f, 30f, -300f)).sqrMagnitude).Take(6).ToList();
            foreach (var l in lamps) yield return RamAt(car, l, 45f, (_, _) => { });
            Assert.That(lamps.Count(l => l.Broken), Is.GreaterThanOrEqualTo(5), "most lamps broke");
            // Worst case for the physics: a full debris pool. Four huts at once (18 pieces each) through
            // the same Break the collision calls — the hit itself is covered by the lamp test above.
            // At most two breaks per step (legacy MAX_BREAKS_PER_STEP), so one hut per frame.
            foreach (var hut in smash.Breakables.Where(b => b.Kind.name == "hut").Take(4).ToList())
            {
                smash.Break(hut, car.Body, car.transform.forward * 12f);
                yield return null;
            }
            yield return new WaitForFixedUpdate();
            var pieces = smash.LivePieces + smash.LiveChunks;
            using var physics = ProfilerRecorder.StartNew(ProfilerCategory.Physics, "Physics.Simulate", 64);
            for (var i = 0; i < 60; i++) yield return new WaitForFixedUpdate();
            var simMs = 0.0;
            var n = physics.Count;
            for (var i = 0; i < n; i++) simMs = System.Math.Max(simMs, physics.GetSample(i).Value / 1e6);
            var line = $"smash cost: worst break {smash.WorstBreakMs:F2} ms ({smash.WorstDetail}), worst physics step {simMs:F2} ms with {pieces} pieces ({n} samples)";
            Debug.Log(line);
            System.IO.File.WriteAllText("Captures/smash-cost.txt", line + "\n");
            Assert.That(smash.WorstBreakMs, Is.LessThan(2f), line);
            // Chips and whole objects: the broken things fly as themselves now, a hut is one body, not 18 boxes.
            Assert.That(pieces, Is.GreaterThanOrEqualTo(45), "many bodies in flight for the worst case");
            Assert.That(simMs, Is.LessThan(2f), line);
        }
    }
}
