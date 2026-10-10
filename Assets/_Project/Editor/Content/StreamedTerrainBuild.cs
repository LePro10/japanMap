using System.IO;
using System.IO.Compression;
using JapanMap.World;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// Web build: a streamed terrain's grids go into StreamingAssets/terrain.jmtz (gzip, plus a plain copy) and the scene
    /// keeps a placeholder of the same terrain data with tiny grids (D36) — the full data would otherwise travel in the
    /// LZ4 player data at twice the size. Play mode in the editor is untouched.
    /// </summary>
    public sealed class StreamedTerrainBuild : IProcessSceneWithReport, IPostprocessBuildWithReport
    {
        public int callbackOrder => 0;
        static byte[] _payload;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            if (report == null || report.summary.platform != BuildTarget.WebGL) return; // play mode or another target
            foreach (var root in scene.GetRootGameObjects())
            foreach (var st in root.GetComponentsInChildren<StreamedTerrain>(true))
            {
                var terrain = st.GetComponent<Terrain>();
                var full = terrain.terrainData;
                if (full == null) continue;
                _payload = TerrainPayload.Encode(TerrainPayload.Read(full));
                // Same layers, prototypes and settings; only the grids shrink (refilled at runtime).
                var lite = Object.Instantiate(full);
                lite.name = full.name + " (placeholder)";
                lite.heightmapResolution = 33;
                lite.alphamapResolution = 16;
                lite.SetDetailResolution(16, 8);
                lite.size = full.size;
                terrain.terrainData = lite;
                var collider = st.GetComponent<TerrainCollider>();
                if (collider != null) collider.terrainData = lite;
                st.MarkPlaceholder();
            }
        }

        public void OnPostprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.WebGL || _payload == null) return;
            var dir = Path.Combine(report.summary.outputPath, "StreamingAssets");
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, StreamedTerrain.PlainName), _payload);
            using (var file = File.Create(Path.Combine(dir, StreamedTerrain.FileName)))
            using (var gz = new GZipStream(file, System.IO.Compression.CompressionLevel.Optimal))
                gz.Write(_payload, 0, _payload.Length);
            Debug.Log($"[WebBuild] terrain file {_payload.Length / 1e6:0.00} MB raw → {new FileInfo(Path.Combine(dir, StreamedTerrain.FileName)).Length / 1e6:0.00} MB gzip");
            _payload = null;
        }
    }
}
