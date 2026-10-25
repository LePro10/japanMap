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
        static byte[] _payload, _details;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            if (report == null || report.summary.platform != BuildTarget.WebGL) return; // play mode or another target
            foreach (var root in scene.GetRootGameObjects())
            foreach (var st in root.GetComponentsInChildren<StreamedTerrain>(true))
            {
                var terrain = st.GetComponent<Terrain>();
                var full = terrain.terrainData;
                if (full == null) continue;
                var grids = TerrainPayload.Read(full);
                _payload = TerrainPayload.Encode(grids, withDetails: false);
                _details = TerrainPayload.EncodeDetails(grids);
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
            void Write(string plain, string packed, byte[] bytes)
            {
                File.WriteAllBytes(Path.Combine(dir, plain), bytes);
                if (Gzip9(Path.Combine(dir, plain), Path.Combine(dir, packed))) return;
                using var file = File.Create(Path.Combine(dir, packed));
                using var gz = new GZipStream(file, System.IO.Compression.CompressionLevel.Optimal);
                gz.Write(bytes, 0, bytes.Length);
            }
            Write(StreamedTerrain.PlainName, StreamedTerrain.FileName, _payload);
            Write(StreamedTerrain.DetailPlainName, StreamedTerrain.DetailName, _details);
            Debug.Log($"[WebBuild] terrain file {_payload.Length / 1e6:0.00} MB raw → {new FileInfo(Path.Combine(dir, StreamedTerrain.FileName)).Length / 1e6:0.00} MB gzip");
            _payload = _details = null;
        }

        /// <summary>
        /// The system's gzip at level 9: .NET here knows only "Optimal" (level 6), and the terrain file is in the start
        /// download (−0.034 MB, measured 2026-10-25). False when there is no gzip; the caller packs it itself then.
        /// </summary>
        static bool Gzip9(string plain, string packed)
        {
            try
            {
                var p = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("gzip", $"-9 -n -c \"{plain}\"")
                {
                    UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true,
                });
                if (p == null) return false;
                using (var file = File.Create(packed)) p.StandardOutput.BaseStream.CopyTo(file);
                p.WaitForExit();
                return p.ExitCode == 0 && new FileInfo(packed).Length > 0;
            }
            catch (System.Exception) { return false; }
        }
    }
}
