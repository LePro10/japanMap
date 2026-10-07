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
        public void ToUnity_MirrorsZ_NorthIsPlusZ()
        {
            // templeHall: Three (820, -954) lies north of the centre → Unity z must be positive.
            Assert.AreEqual(new Vector3(820, 5, 954), LegacySource.ToUnity(820, 5, -954));
        }
    }
}
