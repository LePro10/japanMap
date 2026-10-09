using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// height_2049.raw + terrain.json → TerrainData assets under Data/Terrain and terrain tiles under
    /// World/Terrain in Game.unity. Re-runnable: assets are updated in place (GUIDs stay), tiles rebuilt.
    /// Menu: JapanMap/Map/Import Terrain. Acceptance: <see cref="CheckCheckpoints"/>.
    /// </summary>
    public static class TerrainImporter
    {
        public const string GroupName = "Terrain";
        public const string DataDir = "Assets/_Project/Data/Terrain";
        public const string LayerDir = DataDir + "/Layers";
        public const string TextureDir = "Assets/ThirdParty/PolyHaven/Textures";

        [MenuItem("JapanMap/Map/Import Terrain")]
        public static void ImportFromMenu()
        {
            Import(MapImportSettings.LoadOrCreate());
            MapScene.Save();
            Report(CheckCheckpoints(MapImportSettings.LoadOrCreate()));
        }

        public static Terrain[] Import(MapImportSettings settings)
        {
            var info = LegacySource.ReadJson<LegacySource.TerrainInfo>(settings, "terrain/terrain.json");
            var res = info.import.resolution;
            if (info.import.flipVertically) throw new InvalidOperationException("source expects a vertical flip — not supported");
            var heights = ReadRaw(LegacySource.PathOf(settings, "terrain/" + info.file), res);
            var layers = settings.splatLayers.Select(LoadOrCreateLayer).ToArray();
            var zones = ReadZones(settings, layers.Length);
            var zonesRes = zones.GetLength(0);

            var n = settings.tilesPerSide;
            if (n < 1 || (res - 1) % n != 0) throw new ArgumentException($"tilesPerSide {n} does not divide {res - 1}");
            var cells = (res - 1) / n;
            var tileRes = cells + 1;
            if (zonesRes % n != 0) throw new ArgumentException($"tilesPerSide {n} does not divide zones resolution {zonesRes}");
            var alphaRes = zonesRes / n;
            var size = new Vector3(info.terrainSize.x / n, info.terrainSize.y, info.terrainSize.z / n);
            var origin = new Vector3(info.unityTerrainPosition.x, info.unityTerrainPosition.y, info.unityTerrainPosition.z);

            Directory.CreateDirectory(DataDir);
            RemoveStaleTileAssets(n);
            var group = MapScene.FreshGroup(GroupName);
            var tiles = new Terrain[n, n];
            for (var tz = 0; tz < n; tz++)
            for (var tx = 0; tx < n; tx++)
            {
                var block = new float[tileRes, tileRes];
                for (var r = 0; r < tileRes; r++)
                for (var c = 0; c < tileRes; c++)
                    block[r, c] = heights[(tz * cells + r) * res + tx * cells + c];

                var data = LoadOrCreateData(TileAssetPath(n, tx, tz));
                data.heightmapResolution = tileRes; // must come before size: it resets the size
                data.size = size;
                data.SetHeights(0, 0, block);

                data.terrainLayers = layers;
                data.alphamapResolution = alphaRes;
                var alpha = new float[alphaRes, alphaRes, layers.Length];
                for (var r = 0; r < alphaRes; r++)
                for (var c = 0; c < alphaRes; c++)
                for (var l = 0; l < layers.Length; l++)
                    alpha[r, c, l] = zones[tz * alphaRes + r, tx * alphaRes + c, l];
                data.SetAlphamaps(0, 0, alpha);
                EditorUtility.SetDirty(data);

                var go = Terrain.CreateTerrainGameObject(data);
                go.name = $"Terrain_{tx}_{tz}";
                go.transform.SetParent(group, false);
                go.transform.position = origin + new Vector3(tx * size.x, 0, tz * size.z);
                GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)~0);
                var terrain = go.GetComponent<Terrain>();
                terrain.heightmapPixelError = settings.pixelError;
                terrain.basemapDistance = settings.basemapDistance;
                terrain.drawInstanced = settings.drawInstanced;
                terrain.groupingID = 1;
                terrain.allowAutoConnect = true;
                tiles[tx, tz] = terrain;
            }

            for (var tz = 0; tz < n; tz++)
            for (var tx = 0; tx < n; tx++)
                tiles[tx, tz].SetNeighbors(
                    tx > 0 ? tiles[tx - 1, tz] : null, tz < n - 1 ? tiles[tx, tz + 1] : null,
                    tx < n - 1 ? tiles[tx + 1, tz] : null, tz > 0 ? tiles[tx, tz - 1] : null);

            // Part of the terrain itself, so every way to the terrain (Import All, terrain only, tests) gives
            // the same ground: a terrain-only import once left the ring's cliff 4 m above the road.
            var types = settings.roadTypes.ToDictionary(t => t.type);
            var legacyRoads = RoadImporter.Load(settings);
            // place roads and extended roads.json roads (the extension is not baked into the heightmap either)
            var placeRoads = new HashSet<string>(legacyRoads.Where(r => r.tags != null && (r.tags.Contains("place") || r.tags.Contains("extended"))).Select(r => r.id));
            var carve = TerrainCarve.UnderRoads(RoadImporter.NetworkRoads(legacyRoads, types), type => types[type].shoulder, settings, placeRoads);
            // Building pads of the places too (Phase 5): a terrain-only import must not undo them.
            var pads = Places.PlaceGround.Level(Places.PlaceImporter.Pads(), settings);
            // …and the ramps (Phase 7): their ground is lowered under the base line.
            Content.RampBuilder.CarveTerrain(settings);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Map] terrain imported: {n}x{n} tiles, {tileRes}² samples each, {size.x:F1} m per tile; " +
                      $"lowered under roads: {carve.texels} texels, deepest cut {carve.maxCut:F2} m, left alone (tunnel-deep) {carve.skipped}; levelled under {pads.pads} building footprints (max {pads.maxChange:F2} m, {pads.roadTexels} texels left to the roads)");
            return tiles.Cast<Terrain>().ToArray();
        }

        /// <summary>
        /// Height of the source heightmap at a Unity x/z (bilinear), before anything lowers it — for
        /// decisions that must not depend on the carved ground (is this road a viaduct here?).
        /// </summary>
        public static Func<float, float, float> RawGround(MapImportSettings settings)
        {
            var info = LegacySource.ReadJson<LegacySource.TerrainInfo>(settings, "terrain/terrain.json");
            var res = info.import.resolution;
            var h = ReadRaw(LegacySource.PathOf(settings, "terrain/" + info.file), res);
            var ox = info.unityTerrainPosition.x;
            var oy = info.unityTerrainPosition.y;
            var oz = info.unityTerrainPosition.z;
            var cx = info.terrainSize.x / (res - 1);
            var cz = info.terrainSize.z / (res - 1);
            var sy = info.terrainSize.y;
            return (x, z) =>
            {
                var u = Mathf.Clamp((x - ox) / cx, 0f, res - 1.001f);
                var v = Mathf.Clamp((z - oz) / cz, 0f, res - 1.001f);
                int c = (int)u, r = (int)v;
                float fu = u - c, fv = v - r;
                var a = Mathf.Lerp(h[r * res + c], h[r * res + c + 1], fu);
                var b = Mathf.Lerp(h[(r + 1) * res + c], h[(r + 1) * res + c + 1], fu);
                return oy + Mathf.Lerp(a, b, fv) * sy;
            };
        }

        /// <summary>16-bit little-endian, row 0 = south edge (Unity z min), normalised to 0..1.</summary>
        static float[] ReadRaw(string path, int res)
        {
            var bytes = File.ReadAllBytes(path);
            if (bytes.Length != res * res * 2) throw new InvalidDataException($"{path}: {bytes.Length} bytes, expected {res * res * 2}");
            var values = new float[res * res];
            for (var i = 0; i < values.Length; i++)
                values[i] = (bytes[2 * i] | (bytes[2 * i + 1] << 8)) / 65535f;
            return values;
        }

        /// <summary>
        /// zones.png → weights [row = south..north, col = west..east, layer]. Channels R, G, B are the
        /// first three layers, the remainder (1 − R − G − B) the fourth. The PNG has north in its first
        /// row; Texture2D puts the first PNG row at the top (highest y), so GetPixel(c, r) is already
        /// south-first like the alphamap.
        /// </summary>
        static float[,,] ReadZones(MapImportSettings settings, int layerCount)
        {
            if (layerCount != 4) throw new ArgumentException($"zones.png carries 4 layers, settings have {layerCount}");
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
            try
            {
                if (!tex.LoadImage(File.ReadAllBytes(LegacySource.PathOf(settings, "terrain/zones.png"))))
                    throw new InvalidDataException("zones.png could not be decoded");
                var res = tex.width;
                var px = tex.GetPixels32();
                var w = new float[res, res, 4];
                for (var r = 0; r < res; r++)
                for (var c = 0; c < res; c++)
                {
                    var p = px[r * res + c];
                    float a = p.r / 255f, b = p.g / 255f, d = p.b / 255f;
                    var rest = Mathf.Max(0f, 1f - a - b - d);
                    var sum = a + b + d + rest;
                    w[r, c, 0] = a / sum;
                    w[r, c, 1] = b / sum;
                    w[r, c, 2] = d / sum;
                    w[r, c, 3] = rest / sum;
                }
                return w;
            }
            finally { UnityEngine.Object.DestroyImmediate(tex); }
        }

        static TerrainLayer LoadOrCreateLayer(MapImportSettings.SplatLayer spec)
        {
            Directory.CreateDirectory(LayerDir);
            var path = $"{LayerDir}/{spec.name}.terrainlayer";
            var layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(path);
            if (layer == null)
            {
                layer = new TerrainLayer();
                AssetDatabase.CreateAsset(layer, path);
            }
            var folder = $"{TextureDir}/{spec.texture}/{spec.texture}";
            layer.diffuseTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "_diff.jpg")
                ?? throw new FileNotFoundException(folder + "_diff.jpg");
            layer.normalMapTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "_nor_gl.jpg");
            layer.tileSize = new Vector2(spec.tileMeters, spec.tileMeters);
            var tint = spec.tint.maxColorComponent > 0 ? spec.tint : Color.white; // assets from before the field read black
            layer.diffuseRemapMin = Vector4.zero;
            layer.diffuseRemapMax = new Vector4(tint.r, tint.g, tint.b, 1);
            EditorUtility.SetDirty(layer);
            return layer;
        }

        static string TileAssetPath(int n, int tx, int tz) =>
            n == 1 ? $"{DataDir}/Terrain.asset" : $"{DataDir}/Terrain_{n}x{n}_{tx}_{tz}.asset";

        static TerrainData LoadOrCreateData(string path)
        {
            var data = AssetDatabase.LoadAssetAtPath<TerrainData>(path);
            if (data != null) return data;
            data = new TerrainData();
            AssetDatabase.CreateAsset(data, path);
            return data;
        }

        // Switching the tile count would otherwise leave the old tile assets (and their size) behind.
        static void RemoveStaleTileAssets(int n)
        {
            var keep = new HashSet<string>();
            for (var tz = 0; tz < n; tz++)
            for (var tx = 0; tx < n; tx++)
                keep.Add(TileAssetPath(n, tx, tz));
            foreach (var guid in AssetDatabase.FindAssets("t:TerrainData", new[] { DataDir }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!keep.Contains(path)) AssetDatabase.DeleteAsset(path);
            }
        }

        public struct CheckResult
        {
            public string name;
            public float expected, actual;
            public float Error => Mathf.Abs(actual - expected);
        }

        /// <summary>Samples the terrain tiles in the open scene at every point of checkpoints.json.</summary>
        public static List<CheckResult> CheckCheckpoints(MapImportSettings settings)
        {
            var points = LegacySource.ReadJson<LegacySource.Checkpoints>(settings, "terrain/checkpoints.json").points;
            var results = new List<CheckResult>();
            foreach (var p in points)
            {
                var world = new Vector3(p.unity.x, 0, p.unity.z);
                var terrain = TileAt(world);
                results.Add(new CheckResult
                {
                    name = p.name,
                    expected = p.heightM,
                    actual = terrain == null ? float.NaN : terrain.SampleHeight(world) + terrain.transform.position.y,
                });
            }
            return results;
        }

        public static Terrain TileAt(Vector3 world)
        {
            foreach (var t in Terrain.activeTerrains)
            {
                var p = t.transform.position;
                var s = t.terrainData.size;
                if (world.x >= p.x && world.x <= p.x + s.x && world.z >= p.z && world.z <= p.z + s.z) return t;
            }
            return null;
        }

        static void Report(List<CheckResult> results)
        {
            var tolerance = MapImportSettings.LoadOrCreate().checkpointTolerance;
            var lines = results.Select(r => $"  {r.name,-16} expected {r.expected,8:F2}  actual {r.actual,8:F2}  error {r.Error:F3}");
            var ok = results.All(r => r.Error <= tolerance);
            var text = $"[Map] checkpoints {(ok ? "OK" : "FAILED")} (tolerance {tolerance} m)\n" + string.Join("\n", lines);
            if (ok) Debug.Log(text); else Debug.LogError(text);
        }
    }
}
