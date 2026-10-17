using System.Linq;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Car damage (D47) without the game: the crush field, the body deformer on a real car model, its repair, and that
    /// every car of the fleet has what damage needs (readable body, paint and glass, four wheels).
    /// </summary>
    public class VehicleDamageTests
    {
        const string SettingsPath = "Assets/_Project/Data/Vehicles/VehicleDamage.asset";
        GameObject _car;

        [TearDown]
        public void TearDown()
        {
            if (_car != null) Object.DestroyImmediate(_car);
        }

        static VehicleDamageSettings Settings => AssetDatabase.LoadAssetAtPath<VehicleDamageSettings>(SettingsPath);

        CarBodyDeformer Hachi()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Project/Art/Cars/hachi.glb");
            _car = Object.Instantiate(prefab);
            var body = VehicleVisuals.FindPrefix(_car.transform, "body_root");
            Assert.NotNull(body, "hachi has a body_root");
            var d = new CarBodyDeformer(body, t => t.name.StartsWith("steering_wheel"));
            while (d.PrepareNext()) { }
            return d;
        }

        [Test]
        public void Field_PushesFrontMost_FadesSidewaysAndBehind()
        {
            const float plane = 0.2f, knee = 0.05f, radius = 1f;
            // In front of the plane (the bumper) a vertex is pushed back onto it: push ≈ plane − d.
            Assert.That(CarBodyDeformer.Field(-0.1f, 0f, plane, knee, radius), Is.EqualTo(0.3f).Within(0.01f));
            // Far behind the plane nothing moves.
            Assert.That(CarBodyDeformer.Field(0.6f, 0f, plane, knee, radius), Is.LessThan(1e-3f));
            // Outside the radius nothing moves, inside the middle third it is full.
            Assert.That(CarBodyDeformer.Field(-0.1f, 1.01f, plane, knee, radius), Is.EqualTo(0f));
            Assert.That(CarBodyDeformer.Field(-0.1f, 0.3f, plane, knee, radius), Is.EqualTo(CarBodyDeformer.Field(-0.1f, 0f, plane, knee, radius)).Within(1e-5f));
            // Monotonic: deeper into the car never moves more.
            var last = float.MaxValue;
            for (var d = -0.3f; d < 0.8f; d += 0.05f)
            {
                var f = CarBodyDeformer.Field(d, 0.5f, plane, knee, radius);
                Assert.That(f, Is.LessThanOrEqualTo(last + 1e-6f), $"at d {d:F2}");
                last = f;
            }
        }

        [Test]
        public void Settings_DepthGrowsWithTheHit_AsTuned()
        {
            var s = Settings;
            Assert.NotNull(s, SettingsPath);
            Assert.That(s.Depth(s.dentFrom - 0.1f), Is.EqualTo(0f), "below dentFrom nothing dents");
            // Tree at 60 km/h felt as 0.55 × 16.7 m/s, a wall at 60 and at 110 km/h (measured Δv 14.5 and 28.5 m/s).
            Assert.That(s.Depth(9.2f), Is.InRange(0.07f, 0.16f), "tree at 60: a clear dent");
            Assert.That(s.Depth(14.5f), Is.InRange(0.17f, 0.32f), "wall at 60");
            Assert.That(s.Depth(28.5f), Is.InRange(0.55f, s.maxDepth), "wall at 110: the front is gone");
            Assert.That(s.Radius(9.2f, 0.3f), Is.LessThan(s.Radius(9.2f, 10f)), "a trunk leaves a narrower dent than a wall");
            Assert.NotNull(s.sparkMaterial);
            Assert.NotNull(s.debrisMaterial);
            Assert.NotNull(s.decalMaterial);
        }

        [Test]
        public void Dent_MovesTheFrontWhereHit_AndRestoreGivesTheModelBack()
        {
            var d = Hachi();
            var shell = d.Shell;
            var front = shell.rest.Max(v => v.z);
            var before = (Vector3[])shell.pos.Clone();
            // A hit at the middle of the front, pushing back (−Z), 0.2 m deep, 0.6 m wide.
            var dent = new CarBodyDeformer.Dent { point = new Vector3(0f, 0.6f, front + 0.1f), dir = Vector3.back, depth = 0.2f, radius = 0.6f, crumple = 0.6f, seed = 1 };
            var largest = d.Apply(dent, 1f, out var plane);
            Assert.That(float.IsNaN(plane), Is.False, "the hit found the body");
            Assert.That(largest, Is.InRange(0.12f, 0.35f), "the front moved about the depth");
            Assert.That(d.MaxDisplacement, Is.InRange(0.12f, 0.35f));
            Assert.That(shell.work, Is.Not.Null, "the car got its own copy of the mesh");
            Assert.That(shell.filter.sharedMesh, Is.SameAs(shell.work));
            var movedBehind = 0;
            var movedFront = 0;
            for (var i = 0; i < before.Length; i++)
            {
                var m = (shell.pos[i] - before[i]).magnitude;
                if (m < 1e-4f) continue;
                if (before[i].z < front - 1.2f) movedBehind++;
                else movedFront++;
            }
            Assert.That(movedFront, Is.GreaterThan(200), "many vertices of the front moved");
            Assert.That(movedBehind, Is.EqualTo(0), "nothing behind the crush zone moved (the rear stays whole)");
            foreach (var n in shell.normal) Assert.That(n.magnitude, Is.EqualTo(1f).Within(0.02f).Or.EqualTo(0f));
            // The uploaded mesh is the deformed one.
            var middle = shell.work.vertices.Where(v => Mathf.Abs(v.x) < 0.2f && v.y > 0.4f && v.y < 0.8f).Max(v => v.z);
            Assert.That(middle, Is.LessThan(front - 0.1f), "the drawn front is pushed in where it was hit");

            d.Restore();
            Assert.That(shell.filter.sharedMesh, Is.SameAs(shell.shared), "repair puts the modelled mesh back");
            Assert.That(d.MaxDisplacement, Is.EqualTo(0f));
            for (var i = 0; i < before.Length; i++) Assert.That(shell.pos[i], Is.EqualTo(before[i]));
        }

        [Test]
        public void ManyHits_StayWithinTheMaximum()
        {
            var d = Hachi();
            var front = d.Shell.rest.Max(v => v.z);
            for (var k = 0; k < 8; k++)
            {
                var dent = new CarBodyDeformer.Dent { point = new Vector3(0f, 0.6f, front), dir = Vector3.back, depth = 0.6f, radius = 1.2f, crumple = 0.65f, seed = k };
                d.Apply(dent, 0.8f, out _);
            }
            Assert.That(d.MaxDisplacement, Is.LessThanOrEqualTo(0.8f + 1e-3f), "no vertex further than the cap from its modelled place");
        }

        [Test]
        public void SlicedWork_EndsLikeAtOnce_WithinTheBudgetPerCall()
        {
            var d = Hachi();
            var front = d.Shell.rest.Max(v => v.z);
            var dent = new CarBodyDeformer.Dent { point = new Vector3(0f, 0.6f, front), dir = Vector3.back, depth = 0.5f, radius = 1.2f, crumple = 0.65f, seed = 3 };
            d.Enqueue(dent, 1f);
            var calls = 0;
            while (d.Busy && calls < 200)
            {
                d.Work(0.3f);
                calls++;
            }
            Assert.That(d.Busy, Is.False, "the crush finishes");
            Assert.That(calls, Is.GreaterThan(1), "a big crush is spread over several frames");
            var sliced = (Vector3[])d.Shell.pos.Clone();
            d.Restore();
            d.Apply(dent, 1f, out _);
            for (var i = 0; i < sliced.Length; i += 7) Assert.That((d.Shell.pos[i] - sliced[i]).magnitude, Is.LessThan(1e-5f), "same result sliced or at once");
        }

        [Test]
        public void EveryFleetCar_HasWhatDamageNeeds()
        {
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>("Assets/_Project/Data/Vehicles/Fleet.asset");
            Assert.NotNull(fleet.damage, "the fleet links the damage settings (JapanMap/Vehicles/Setup Damage)");
            foreach (var def in fleet.vehicles)
            {
                var prefab = def.EditorModel;
                Assert.NotNull(prefab, def.id);
                var body = VehicleVisuals.FindPrefix(prefab.transform, "body_root");
                Assert.NotNull(body, $"{def.id}: body_root");
                var d = new CarBodyDeformer(body);
                Assert.NotNull(d.Shell, $"{def.id}: a readable body mesh");
                Assert.That(d.Shell.shared.isReadable, $"{def.id}: body mesh readable (CPU crush)");
                var mats = d.Shell.filter.GetComponent<MeshRenderer>().sharedMaterials.Select(m => m.name).ToList();
                Assert.That(mats.Any(n => n.EndsWith("_paint")), $"{def.id}: a paint material for scratches ({string.Join(",", mats)})");
                foreach (var w in new[] { "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR" })
                    Assert.NotNull(VehicleVisuals.FindPrefix(prefab.transform, w), $"{def.id}: {w} (can come off)");
            }
        }
    }
}
