using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// The water surfaces had no collider and sat on the Default layer, and the controller passed a fixed 0 as water depth:
    /// aquaplaning, water drag, water grip and the Water surface (sound, spray) never ran. This puts the car in the river
    /// the way the game does (Place onto the ground below) and wants the depth and the surface to arrive, and the deep river
    /// to carry the car like the prototype did.
    /// </summary>
    [FreshSave]
    public class WaterDriveTests
    {
        [TearDown]
        public void TearDown()
        {
            if (JapanMap.Core.Bootstrapper.Instance != null) Object.Destroy(JapanMap.Core.Bootstrapper.Instance.gameObject);
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator CarInTheRiver_FeelsTheWater_ButNotOnTheRoad()
        {
            UnityEngine.SceneManagement.SceneManager.LoadScene(JapanMap.Core.Bootstrapper.BootSceneName);
            for (var f = 0; f < 120 && UnityEngine.SceneManagement.SceneManager.GetActiveScene().name != "Game"; f++) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var car = Object.FindAnyObjectByType<JapanMap.Vehicles.PlayerCarSpawner>().Current;
            Object.FindAnyObjectByType<JapanMap.Vehicles.DriverInput>().Vehicle = null;

            // Every water surface that is loaded can be asked (layer Water, a mesh collider) and pushes nothing.
            var water = LayerMask.NameToLayer(JapanMap.Core.GameLayers.Water);
            MeshCollider river = null;
            foreach (var r in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
            {
                if (r.sharedMaterial == null || !r.sharedMaterial.name.StartsWith("Water_")) continue;
                Assert.AreEqual(water, r.gameObject.layer, $"{r.name} is not on the Water layer");
                var c = r.GetComponent<MeshCollider>();
                Assert.IsNotNull(c, $"{r.name} has no collider");
                if (r.name == "River") river = c;
            }
            Assert.IsNotNull(river, "no river in the game scene");
            Assert.IsTrue(Physics.GetIgnoreLayerCollision(water, JapanMap.Core.GameLayers.Layer(JapanMap.Core.GameLayers.Vehicle)), "water must not push cars");

            // Dry first: on the start road there is no water.
            for (var i = 0; i < 30; i++) yield return new WaitForFixedUpdate();
            Assert.AreEqual(0f, car.Telemetry.waterDepth, "water on the start road");

            // The widest river triangle: its centre is over water.
            var mesh = river.sharedMesh;
            var v = mesh.vertices;
            var t = mesh.triangles;
            var best = Vector3.zero;
            var area = 0f;
            for (var i = 0; i < t.Length; i += 3)
            {
                var a = Vector3.Cross(v[t[i + 1]] - v[t[i]], v[t[i + 2]] - v[t[i]]).magnitude;
                if (a > area) { area = a; best = (v[t[i]] + v[t[i + 1]] + v[t[i + 2]]) / 3f; }
            }
            var spot = river.transform.TransformPoint(best);
            // The terrain streams in around the car: park it above the spot, let the ground arrive, then put it down.
            car.Body.isKinematic = true;
            car.transform.position = spot + Vector3.up * 20f;
            for (var i = 0; i < 180; i++) yield return null;
            car.Body.isKinematic = false;
            car.Place(spot, 0f, fromAbove: 30f);
            var deepest = 0f;
            var inWater = false;
            float low = float.MaxValue, high = float.MinValue;
            for (var i = 0; i < 200; i++)
            {
                yield return new WaitForFixedUpdate();
                deepest = Mathf.Max(deepest, car.Telemetry.waterDepth);
                inWater |= car.Telemetry.surface == JapanMap.Vehicles.Surface.Water;
                if (i < 120) continue;
                low = Mathf.Min(low, car.transform.position.y);
                high = Mathf.Max(high, car.transform.position.y);
            }
            Debug.Log($"[WaterDrive] depth {deepest:0.00} m, surface {spot.y:0.00}, car y {low:0.00}..{high:0.00}");
            Assert.Greater(deepest, 0.08f, $"no water depth in the river at {spot} (car at {car.transform.position})");
            Assert.IsTrue(inWater, "the tyres never reported the Water surface");
            // Legacy WATER_PHYS: from 0.55 m the surface carries the car, sunk in by the draft — not down on the bed.
            var tuning = car.Tuning;
            if (deepest >= tuning.floatDepth)
                Assert.Greater(car.transform.position.y, spot.y - tuning.draft - 0.25f, $"the car sank to the bed (depth {deepest:0.00} m)");
            Assert.Less(high - low, 0.1f, "the car bobs on the water instead of resting");
        }
    }
}
