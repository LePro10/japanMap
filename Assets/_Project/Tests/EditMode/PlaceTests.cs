using System.Linq;
using JapanMap.Editor.Map;
using JapanMap.Editor.Places;
using JapanMap.Vehicles;
using JapanMap.World;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Places of the prototype (Phase 5): kits, footprints, clearings, spawn.</summary>
    public class PlaceTests
    {
        [SetUp]
        public void OpenGameScene() => MapScene.OpenGameScene();

        [Test]
        public void EveryKit_HasItsSource_AndBuildsMostOfIt()
        {
            var kits = AssetDatabase.FindAssets("t:PlaceKit", new[] { PlaceKit.Dir })
                .Select(g => AssetDatabase.LoadAssetAtPath<PlaceKit>(AssetDatabase.GUIDToAssetPath(g))).ToList();
            Assert.That(kits.Count, Is.GreaterThan(0), "no place kits in Data/Places");
            foreach (var kit in kits)
            {
                Assert.IsTrue(System.IO.File.Exists(PlaceSource.PathOf(kit.source)), $"{kit.name}: {kit.source}.json missing — node Tools/export-places.mjs");
                var place = PlaceSource.Load(kit.source);
                var built = PlaceImporter.Resolve(kit, place).Count(p => p.prefab != null);
                Assert.That(built, Is.GreaterThan(0), $"{kit.name}: no item has a model");
            }
        }

        /// <summary>
        /// A house on the carriageway is a wall at 80 km/h. No building footprint (levelled or instanced)
        /// may reach into a carriageway (0.5 m tolerance at the edges for eaves).
        /// </summary>
        [Test]
        public void Buildings_DoNotStandOnRoads()
        {
            var network = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            Assert.IsNotNull(network);
            var hits = new System.Collections.Generic.List<string>();
            foreach (var kit in PlaceImporter.Kits())
            foreach (var p in PlaceImporter.Resolve(kit, PlaceSource.Load(kit.source)))
            {
                if (p.prefab == null || !(p.rule.level || kit.instanced)) continue;
                var toLocal = Quaternion.Euler(0, -p.yaw, 0);
                var half = p.halfSize - Vector2.one * 0.5f;
                foreach (var road in network.roads.Where(r => r.type != "pfad")) // footpaths lead to the doors
                foreach (var pt in road.points)
                {
                    // distance from the centreline point to the footprint must exceed half the carriageway
                    var l = toLocal * new Vector3(pt.x - p.position.x, 0, pt.z - p.position.z);
                    var dx = Mathf.Max(0, Mathf.Abs(l.x) - half.x);
                    var dz = Mathf.Max(0, Mathf.Abs(l.z) - half.y);
                    if (dx * dx + dz * dz < road.width * road.width / 4)
                    {
                        hits.Add($"{kit.name} {p.item.kind} at ({p.position.x:F0}, {p.position.z:F0}) on road {road.id}");
                        break;
                    }
                }
            }
            Assert.IsEmpty(hits, $"{hits.Count} on roads:\n" + string.Join("\n", hits.Distinct().Take(20)));
        }

        /// <summary>
        /// Every model in a place, at full detail, stays under 600 k triangles (High budget 3 M for the
        /// whole view). Ten fleet cars as a showroom display were 1.23 M triangles and 1 212 draw calls —
        /// drive models are not scenery until they have a light LOD.
        /// </summary>
        [Test]
        public void EveryPlace_StaysInItsTriangleBudget()
        {
            foreach (var kit in PlaceImporter.Kits().Where(k => !k.instanced))
            {
                long tris = 0;
                foreach (var p in PlaceImporter.Resolve(kit, PlaceSource.Load(kit.source)))
                {
                    if (p.prefab == null) continue;
                    foreach (var mf in p.prefab.GetComponentsInChildren<MeshFilter>(true))
                        if (mf.sharedMesh != null && !mf.name.Contains("_LOD1") && !mf.name.Contains("_LOD2"))
                            tris += mf.sharedMesh.triangles.Length / 3;
                }
                Assert.That(tris, Is.LessThan(600_000), $"{kit.name}: {tris} triangles at LOD0");
            }
        }

        /// <summary>
        /// Instanced places (thousands of models) stay affordable by distance, not by count: every
        /// prototype's coarsest level has at most a quarter of LOD0's triangles, and LOD0 ends within
        /// 100 m at lodBias 1 (Tokyo LOD0 out to 220 m on High was 12 M triangles).
        /// </summary>
        [Test]
        public void InstancedPlaces_GetCoarseQuickly()
        {
            foreach (var kit in PlaceImporter.Kits().Where(k => k.instanced))
            {
                var data = AssetDatabase.LoadAssetAtPath<PlaceInstanceData>(PlaceImporter.InstancesPath(kit));
                Assert.IsNotNull(data, $"{kit.name}: no instance data — run JapanMap/Places/Import All");
                foreach (var p in data.prototypes)
                {
                    var first = p.lods[0].triangles.Length / 3;
                    var last = p.lods[p.lods.Length - 1].triangles.Length / 3;
                    if (p.lods[0] != p.lods[p.lods.Length - 1] && p.name.EndsWith("#0")) // main body; signs are small anyway
                        Assert.That(last, Is.LessThanOrEqualTo(first / 4), $"{p.name}: last LOD {last} of {first} triangles");
                    Assert.That(p.lodEnd[0], Is.LessThanOrEqualTo(100), $"{p.name}: LOD0 to {p.lodEnd[0]:F0} m");
                }
            }
        }

        /// <summary>Prototype WP2: the game starts in Sakura Commons, car 4 m north of the bowl's spawn, facing east, not snapped to a road.</summary>
        [Test]
        public void Spawn_IsInSakuraCommons()
        {
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            Assert.IsNotNull(spawner);
            var so = new SerializedObject(spawner);
            var at = so.FindProperty("spawnPoint").vector3Value;
            Assert.That(Vector2.Distance(new Vector2(at.x, at.z), new Vector2(550, -506)), Is.LessThan(1f), $"spawn at {at}");
            Assert.That(Mathf.DeltaAngle(so.FindProperty("spawnHeading").floatValue, 90), Is.InRange(-1f, 1f), "not facing east");
            Assert.IsFalse(so.FindProperty("snapToRoad").boolValue, "the court spawn must not jump to the nearest road");
        }

        /// <summary>The court is clear: no scattered tree within the 55 m bowl, but the 24 cherries of the ring are there.</summary>
        [Test]
        public void SakuraBowl_IsClearedAndRingedWithCherries()
        {
            var data = Trees();
            var s = new Vector2(550, -510);
            int inner = 0, ring = 0;
            for (var i = 0; i < data.Count; i++)
            {
                var d = Vector2.Distance(new Vector2(data.positions[i].x, data.positions[i].z), s);
                if (d < 50) inner++;
                else if (d < 68 && data.prototypes[RunPrototype(data, i)].name.Contains("Cherry")) ring++;
            }
            Assert.AreEqual(0, inner, "trees inside the court");
            Assert.That(ring, Is.GreaterThanOrEqualTo(24), "cherry ring incomplete");
        }

        static VegetationData Trees() =>
            (VegetationData)Object.FindObjectsByType<InstanceRenderer>().First(r => r.data is VegetationData).data;

        static int RunPrototype(VegetationData data, int index)
        {
            foreach (var c in data.chunks)
            foreach (var r in c.runs)
                if (index >= r.start && index < r.start + r.count) return r.prototype;
            return -1;
        }
    }
}
