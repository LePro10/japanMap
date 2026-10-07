using System.Linq;
using JapanMap.Editor.Map;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Acceptance of the map import (Phase 2) against the imported Game scene.</summary>
    public class MapImportTests
    {
        [SetUp]
        public void OpenGameScene() => MapScene.OpenGameScene();

        [Test]
        public void Terrain_MatchesLegacyCheckpoints()
        {
            var settings = MapImportSettings.LoadOrCreate();
            var results = TerrainImporter.CheckCheckpoints(settings);
            Assert.That(results, Is.Not.Empty);
            foreach (var r in results)
                Assert.That(r.Error, Is.LessThanOrEqualTo(settings.checkpointTolerance), $"{r.name}: expected {r.expected}, got {r.actual}");
        }

        [Test]
        public void TerrainImport_TwiceGivesIdenticalResult()
        {
            var settings = MapImportSettings.LoadOrCreate();
            var first = Fingerprint(TerrainImporter.Import(settings));
            var second = Fingerprint(TerrainImporter.Import(settings));
            Assert.AreEqual(first, second);
        }

        static string Fingerprint(Terrain[] tiles) => string.Join("|", tiles.Select(t =>
        {
            var d = t.terrainData;
            var h = d.GetHeights(0, 0, d.heightmapResolution, d.heightmapResolution);
            double sum = 0;
            for (var r = 0; r < h.GetLength(0); r += 5)
            for (var c = 0; c < h.GetLength(1); c += 3)
                sum += h[r, c] * (r + 1) * (c % 17 + 1);
            return $"{t.name} {t.transform.position} {d.size} {sum:R} {UnityEditor.AssetDatabase.GetAssetPath(d)}";
        }));

        // Mirror errors in zones.png would put sand into the mountains — check one clear spot per zone.
        [TestCase(-1000f, 1000f, 0, TestName = "Splat_NorthWestMassif_IsRock")]
        [TestCase(1000f, -1000f, 2, TestName = "Splat_SouthEastCoast_IsSand")]
        [TestCase(-600f, -100f, 3, TestName = "Splat_WestPlain_IsPaddy")]
        public void Splat_DominantLayerAt(float x, float z, int expectedLayer)
        {
            var world = new Vector3(x, 0, z);
            var tile = TerrainImporter.TileAt(world);
            var d = tile.terrainData;
            var local = world - tile.transform.position;
            var a = d.GetAlphamaps((int)(local.x / d.size.x * d.alphamapWidth), (int)(local.z / d.size.z * d.alphamapHeight), 1, 1);
            var best = Enumerable.Range(0, d.alphamapLayers).OrderByDescending(l => a[0, 0, l]).First();
            Assert.AreEqual(expectedLayer, best, $"dominant layer at ({x}, {z}) is {d.terrainLayers[best].name}");
        }

        [Test]
        public void Viewpoints_AreAboveTheTerrain()
        {
            var set = ViewpointTools.Load();
            Assert.That(set.viewpoints.Count, Is.GreaterThanOrEqualTo(6));
            foreach (var v in set.viewpoints)
            {
                var tile = TerrainImporter.TileAt(v.position);
                Assert.IsNotNull(tile, $"{v.name} lies outside the terrain");
                var ground = tile.SampleHeight(v.position) + tile.transform.position.y;
                Assert.That(v.position.y, Is.GreaterThan(ground + 0.3f), $"{v.name} is {ground - v.position.y:F1} m under the ground");
            }
        }

        [Test]
        public void Water_AllSurfacesFaceUp()
        {
            var water = GameObject.Find($"{MapScene.RootName}/{WaterImporter.GroupName}");
            Assert.IsNotNull(water, "World/Water missing — run JapanMap/Map/Import Water");
            var filters = water.GetComponentsInChildren<MeshFilter>();
            Assert.That(filters.Length, Is.GreaterThanOrEqualTo(3));
            foreach (var f in filters)
            {
                var m = f.sharedMesh;
                var v = m.vertices;
                var t = m.triangles;
                Assert.That(t.Length, Is.GreaterThan(0), f.name);
                for (var i = 0; i < t.Length; i += 3)
                    Assert.That(Vector3.Cross(v[t[i + 1]] - v[t[i]], v[t[i + 2]] - v[t[i]]).y, Is.GreaterThan(0f), $"{f.name}: triangle {i / 3} faces down");
            }
        }

        [Test]
        public void Roads_LieOnTheCarvedTerrain()
        {
            // Floating or sunken roads show up as a large p95; bridges/viaducts (> 1.5 m) are counted apart.
            foreach (var f in RoadImporter.MeasureFit(MapImportSettings.LoadOrCreate()))
            {
                Assert.That(f.samples, Is.GreaterThan(100), f.type);
                Assert.That(Mathf.Abs(f.median), Is.LessThan(0.05f), $"{f.type}: median {f.median:F3} m");
                Assert.That(f.p95Abs, Is.LessThan(0.15f), $"{f.type}: |p95| {f.p95Abs:F3} m");
            }
        }

        [Test]
        public void Roads_SurfacesFaceUp()
        {
            var roads = GameObject.Find($"{MapScene.RootName}/{RoadImporter.GroupName}");
            Assert.IsNotNull(roads, "World/Roads missing — run JapanMap/Map/Import Roads");
            int checkedTris = 0, folded = 0;
            foreach (Transform child in roads.transform)
            {
                if (!child.name.StartsWith("Road_") && child.name != "CitySlab") continue;
                var m = child.GetComponent<MeshFilter>().sharedMesh;
                var v = m.vertices;
                for (var s = 0; s < m.subMeshCount; s++)
                {
                    var t = m.GetTriangles(s);
                    for (var i = 0; i < t.Length; i += 3)
                    {
                        var n = Vector3.Cross(v[t[i + 1]] - v[t[i]], v[t[i + 2]] - v[t[i]]);
                        if (Mathf.Abs(n.normalized.y) < 0.5f) continue; // kerbs, slab curtain
                        checkedTris++;
                        if (n.y > 0) continue;
                        // The inner shoulder of a wide road folds over itself in a very tight corner (as in
                        // the prototype): a few tiny triangles. A wrong winding would flip all of them.
                        folded++;
                        Assert.That(n.magnitude / 2, Is.LessThan(1f), $"{child.name}: triangle {i / 3} faces down and is not a small fold");
                    }
                }
            }
            Assert.That(checkedTris, Is.GreaterThan(10000));
            Assert.That(folded, Is.LessThanOrEqualTo(10), $"{folded} folded road triangles");
        }

        [Test]
        public void MeshAssets_SaveTwice_KeepsGuidAndTakesNewGeometry()
        {
            const string path = "Assets/_Project/Data/__test_mesh.asset";
            try
            {
                var first = new Mesh { vertices = new[] { Vector3.zero, Vector3.forward, Vector3.right }, triangles = new[] { 0, 1, 2 } };
                MeshAssets.Save(path, first);
                var guid = UnityEditor.AssetDatabase.AssetPathToGUID(path);
                var second = new Mesh
                {
                    vertices = new[] { Vector3.zero, Vector3.forward, Vector3.right, Vector3.one },
                    triangles = new[] { 0, 1, 2, 1, 3, 2 },
                };
                var saved = MeshAssets.Save(path, second);
                Assert.AreEqual(guid, UnityEditor.AssetDatabase.AssetPathToGUID(path));
                Assert.AreEqual(6, saved.triangles.Length);
                Assert.AreEqual(4, saved.vertexCount);
            }
            finally { UnityEditor.AssetDatabase.DeleteAsset(path); }
        }

        [Test]
        public void Props_AllPlacedOnTheGround()
        {
            var props = GameObject.Find($"{MapScene.RootName}/{PropImporter.GroupName}");
            Assert.IsNotNull(props, "World/Props missing — run JapanMap/Map/Import Props");
            var placed = props.GetComponentsInChildren<BoxCollider>().Select(c => c.transform).Distinct().ToList();
            Assert.AreEqual(977, placed.Count, "props.json has 977 placements");

            // Expected position straight from the file: terrain or the fixed y (tetrapod piles, pier, jetty) + yOffset.
            var settings = MapImportSettings.LoadOrCreate();
            var raw = System.IO.File.ReadAllText(LegacySource.PathOf(settings, "props/props.json"));
            var file = JsonUtility.FromJson<LegacySource.Props>(raw).props;
            var fixedY = PropImporter.FixedHeightFlags(raw, file.Length);
            var seen = new System.Collections.Generic.Dictionary<string, int>();
            for (var k = 0; k < file.Length; k++)
            {
                var p = file[k];
                seen.TryGetValue(p.id, out var i);
                seen[p.id] = i + 1;
                var t = props.transform.Find(p.id).GetChild(i);
                var expected = new Vector3(p.x, 0, -p.z);
                if (fixedY[k]) expected.y = p.y + p.yOffset;
                else
                {
                    var tile = TerrainImporter.TileAt(expected);
                    expected.y = tile.SampleHeight(expected) + tile.transform.position.y + p.yOffset;
                }
                Assert.That(Vector3.Distance(t.position, expected), Is.LessThan(0.01f), $"{t.name}: at {t.position}, expected {expected}");
            }
        }

        [Test]
        public void Props_TempleStairsLeadUpToTheHall()
        {
            // The rotation formula of the README, checked on the one clearly directed prop: the foot of
            // the stairs (front, +Z) faces away from the hall.
            var stairs = GameObject.Find($"{MapScene.RootName}/{PropImporter.GroupName}/templeStairs").transform.GetChild(0);
            var hall = GameObject.Find($"{MapScene.RootName}/{PropImporter.GroupName}/templeHall").transform.GetChild(0);
            Assert.That(Vector3.Dot(stairs.forward, hall.position - stairs.position), Is.LessThan(0f));
            Assert.That(Vector3.Dot(hall.forward, stairs.position - hall.position), Is.GreaterThan(0f), "hall faces the stairs");
        }

        [Test]
        public void Props_ToriiCanBePassedThrough()
        {
            var torii = GameObject.Find($"{MapScene.RootName}/{PropImporter.GroupName}/torii").transform.GetChild(0);
            var centre = torii.position + Vector3.up * 1.5f;
            foreach (var c in torii.GetComponents<BoxCollider>())
                Assert.IsFalse(c.bounds.Contains(centre), "a collider blocks the middle of the torii");
        }

        [Test]
        public void ToUnity_MirrorsZ_NorthIsPlusZ()
        {
            // templeHall: Three (820, -954) lies north of the centre → Unity z must be positive.
            Assert.AreEqual(new Vector3(820, 5, 954), LegacySource.ToUnity(820, 5, -954));
        }
    }
}
