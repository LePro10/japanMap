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

            var n = settings.tilesPerSide;
            if (n < 1 || (res - 1) % n != 0) throw new ArgumentException($"tilesPerSide {n} does not divide {res - 1}");
            var cells = (res - 1) / n;
            var tileRes = cells + 1;
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

            AssetDatabase.SaveAssets();
            Debug.Log($"[Map] terrain imported: {n}x{n} tiles, {tileRes}² samples each, {size.x:F1} m per tile");
            return tiles.Cast<Terrain>().ToArray();
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
