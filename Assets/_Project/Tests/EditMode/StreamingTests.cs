using System.Linq;
using JapanMap.Editor.Content;
using JapanMap.Vehicles;
using JapanMap.World;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Phase 10.2 (D36): what the start download leaves out stays out — every car by address, every streamed scene
    /// addressable — and the terrain file brings the ground back exactly (heights, splat, holes, grass).
    /// </summary>
    public class StreamingTests
    {
        const string TerrainPath = "Assets/_Project/Data/Terrain/Terrain.asset";

        [Test]
        public void TerrainFile_RestoresTheRealTerrainExactly()
        {
            var full = AssetDatabase.LoadAssetAtPath<TerrainData>(TerrainPath);
            // As the build ships it: the ground file without grass, the grass in its own file (D38).
            var grids = TerrainPayload.Read(full);
            var bytes = TerrainPayload.Encode(grids, withDetails: false);
            var grass = TerrainPayload.EncodeDetails(grids);
            // What the build ships: the same data with tiny grids, filled from the file at runtime.
            var lite = Object.Instantiate(full);
            try
            {
                lite.heightmapResolution = 33;
                lite.alphamapResolution = 16;
                lite.SetDetailResolution(16, 8);
                lite.size = full.size;
                TerrainPayload.Apply(TerrainPayload.Decode(bytes), lite);
                TerrainPayload.ApplyDetails(TerrainPayload.DecodeDetails(grass), lite);

                Assert.AreEqual(full.heightmapResolution, lite.heightmapResolution);
                Assert.AreEqual(full.size, lite.size);
                var n = full.heightmapResolution;
                var a = full.GetHeights(0, 0, n, n);
                var b = lite.GetHeights(0, 0, n, n);
                for (var y = 0; y < n; y += 7)
                for (var x = 0; x < n; x += 7)
                    Assert.AreEqual(a[y, x], b[y, x], $"height at {x},{y} — road contact must not change");
                var ar = full.alphamapResolution;
                var sa = full.GetAlphamaps(0, 0, ar, ar);
                var sb = lite.GetAlphamaps(0, 0, ar, ar);
                for (var y = 0; y < ar; y += 5)
                for (var x = 0; x < ar; x += 5)
                for (var l = 0; l < full.alphamapLayers; l++)
                    Assert.AreEqual(sa[y, x, l], sb[y, x, l], 0.5f / 255f, $"splat {l} at {x},{y}");
                var hr = full.holesResolution;
                var ha = full.GetHoles(0, 0, hr, hr);
                var hb = lite.GetHoles(0, 0, hr, hr);
                var holes = 0;
                for (var y = 0; y < hr; y++)
                for (var x = 0; x < hr; x++)
                {
                    if (!ha[y, x]) holes++;
                    Assert.AreEqual(ha[y, x], hb[y, x], $"hole at {x},{y}");
                }
                Assert.AreEqual(full.GetDetailLayer(0, 0, 64, 64, 0), lite.GetDetailLayer(0, 0, 64, 64, 0), "grass density");
                TestContext.WriteLine($"{bytes.Length / 1e6:0.00} MB raw, {holes} hole cells");
            }
            finally { Object.DestroyImmediate(lite); }
        }

        [Test]
        public void Cars_AllByAddress_NoDirectModelInTheStartDownload()
        {
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(JapanMap.Editor.Vehicles.FleetSeed.FleetPath);
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            Assert.NotNull(settings, "Addressables not set up — JapanMap/Content/Setup Streaming");
            foreach (var def in fleet.vehicles)
            {
                Assert.IsNull(def.model, $"{def.id}: a direct model link puts it into the start download (D36)");
                Assert.IsTrue(def.modelAsset != null && def.modelAsset.RuntimeKeyIsValid(), $"{def.id}: no model address");
                var entry = settings.FindAssetEntry(def.modelAsset.AssetGUID);
                Assert.NotNull(entry, $"{def.id}: model not addressable");
                Assert.AreEqual(StreamingSetup.CarAddress(def.id), entry.address);
            }
        }

        [Test]
        public void StreamedScenes_AreAddressable_AndOnlyTheStartPlaceStaysInGame()
        {
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            var scenes = StreamingSetup.StreamedScenes().ToList();
            Assert.Greater(scenes.Count, 40, "places and world parts stream");
            foreach (var path in scenes)
            {
                var entry = settings.FindAssetEntry(AssetDatabase.AssetPathToGUID(path));
                Assert.NotNull(entry, $"{path} is not addressable — it would never load");
                Assert.AreEqual(StreamingSetup.Address(path), entry.address);
            }
            var game = System.IO.File.ReadAllText("Assets/_Project/Scenes/Game.unity");
            Assert.IsTrue(game.Contains("m_Name: " + StreamingSetup.StartPlace), "Sakura Commons stays in the start");
            Assert.IsFalse(game.Contains("m_Name: Tokyo\n"), "Tokyo streams");
        }

        /// <summary>
        /// A prop group kept in the start must not also have a streamed scene: both copies load (grey placeholder
        /// boxes beside the new harbour models, 2026-10-24).
        /// </summary>
        [Test]
        public void PropGroups_LiveEitherInTheStartOrInTheirScene_NotBoth()
        {
            Editor.Map.MapScene.OpenGameScene();
            var props = Editor.Map.MapScene.Root().Find("Props");
            var inStart = props == null ? new string[0] : props.Cast<Transform>().Select(t => t.name).ToArray();
            var twice = StreamingSetup.StreamedScenes()
                .Select(System.IO.Path.GetFileNameWithoutExtension)
                .Where(n => n.StartsWith("Props_"))
                .Select(n => n.Substring("Props_".Length))
                .Where(id => inStart.Contains(id))
                .ToArray();
            Assert.That(twice, Is.Empty, "prop groups both in Game.unity and in a Props_ scene");
        }
    }
}
