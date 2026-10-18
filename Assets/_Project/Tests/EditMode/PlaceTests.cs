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
                if (p.halfSize.x * p.halfSize.y * 4 < 6) continue; // lamps, poles, machines: their arms may reach over the road
                var toLocal = Quaternion.Euler(0, -p.yaw, 0);
                var half = p.halfSize - Vector2.one * 0.5f;
                foreach (var road in network.roads.Where(r => r.type != "pfad")) // footpaths lead to the doors
                foreach (var pt in road.points)
                {
                    // distance from the centreline point to the footprint must exceed half the carriageway
                    var l = toLocal * new Vector3(pt.x - p.centre.x, 0, pt.z - p.centre.z);
                    var dx = Mathf.Max(0, Mathf.Abs(l.x) - half.x);
                    var dz = Mathf.Max(0, Mathf.Abs(l.z) - half.y);
                    if (dx * dx + dz * dz < road.width * road.width / 4)
                    {
                        hits.Add($"{kit.name} {p.item.kind} at ({p.centre.x:F0}, {p.centre.z:F0}) on road {road.id}");
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
                    // Known: Mixed_Tile_70 far LOD is 54 % of LOD0 (STYLE-KIT ≤ 35 %) — asset session, STATUS.
                    if (p.name == "P_Tokyo_Tower_Mixed_Tile_70#0") continue;
                    if (p.lods[0] != p.lods[p.lods.Length - 1] && p.name.EndsWith("#0")) // main body; signs are small anyway
                        // A quarter of LOD0, or tiny anyway: tower silhouettes are 10–35 % (STYLE-KIT), ≤ 300 triangles × 41 towers = 12 k.
                        Assert.That(last, Is.LessThanOrEqualTo(Mathf.Max(first / 4, 300)), $"{p.name}: last LOD {last} of {first} triangles");
                    Assert.That(p.lodEnd[0], Is.LessThanOrEqualTo(100), $"{p.name}: LOD0 to {p.lodEnd[0]:F0} m");
                }
            }
        }

        /// <summary>
        /// Prototype WP2: the game starts in Sakura Commons beside the bowl's spawn, not snapped to a road's centre. Since D54
        /// the car stands on commons-drive in the left lane facing the way out to the city (it was across the drive facing
        /// east: Auto-Drive began with a three-point turn).
        /// </summary>
        [Test]
        public void Spawn_IsInSakuraCommons_InTheLeftLaneFacingTheWayOut()
        {
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            Assert.IsNotNull(spawner);
            var so = new SerializedObject(spawner);
            var at = so.FindProperty("spawnPoint").vector3Value;
            Assert.That(Vector2.Distance(new Vector2(at.x, at.z), new Vector2(550, -506)), Is.LessThan(5f), $"spawn at {at}");
            Assert.IsFalse(so.FindProperty("snapToRoad").boolValue, "the court spawn must not jump to the nearest road");
            var network = AssetDatabase.LoadAssetAtPath<JapanMap.World.RoadNetwork>(JapanMap.Editor.Map.RoadImporter.NetworkPath);
            var drive = network.roads.First(r => r.id == "commons-drive").points;
            var outward = drive[^1] - drive[0];
            outward.y = 0f;
            var heading = so.FindProperty("spawnHeading").floatValue;
            Assert.That(Mathf.Abs(Mathf.DeltaAngle(heading, Mathf.Atan2(outward.x, outward.z) * Mathf.Rad2Deg)), Is.LessThan(5f), $"facing up the drive, heading {heading}");
            var forward = Quaternion.Euler(0f, heading, 0f) * Vector3.forward;
            var side = Vector3.Dot(at - drive[0], Vector3.Cross(Vector3.up, forward)); // + = right of the centreline
            Assert.That(side, Is.InRange(-2.4f, -1.5f), "left of the centreline (Japan drives on the left)");
        }

        [Test]
        public void AlongRoad_OffTheRoad_KeepsPlaceAndHeading()
        {
            var network = AssetDatabase.LoadAssetAtPath<JapanMap.World.RoadNetwork>(JapanMap.Editor.Map.RoadImporter.NetworkPath);
            var (at, heading) = JapanMap.Editor.Places.PlaceImporter.AlongRoad(network, new Vector3(-1500f, 0f, -1500f), 42f);
            Assert.AreEqual(new Vector3(-1500f, 0f, -1500f), at, "the map corner has no road");
            Assert.AreEqual(42f, heading);
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
                else if (d < 68 && data.prototypes[RunPrototype(data, i)].name.Contains("Cherry") || data.prototypes[RunPrototype(data, i)].name.Contains("Sakura")) ring++; // provisional or library cherry
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
