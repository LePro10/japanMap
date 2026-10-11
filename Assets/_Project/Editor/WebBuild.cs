using System;
using System.Diagnostics;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build.Reporting;
using Debug = UnityEngine.Debug;

namespace JapanMap.Editor
{
    /// <summary>
    /// Web build into Builds/Web plus a size report (Builds/Web/size-report.txt).
    /// Batch:  Unity -batchmode -quit -buildTarget WebGL -executeMethod JapanMap.Editor.WebBuild.Batch [-jmDev]
    /// Editor: menu JapanMap/Build Web (Release|Development).
    /// Size is only meaningful on a release build; development builds carry the overlay and symbols.
    /// </summary>
    public static class WebBuild
    {
        public const string DefaultDir = "Builds/Web";
        /// <summary>Where the current build goes (Builds/Web; the WebGPU trial goes to Builds/WebGPU).</summary>
        static string OutputDir = DefaultDir;

        /// <summary>
        /// Trial (D38): the same release build with WebGPU first and WebGL2 as fallback, into Builds/WebGPU — to compare the
        /// start download and the frame rate. Graphics APIs are put back afterwards.
        /// </summary>
        public static void BatchWebGpu()
        {
            var web = BuildTarget.WebGL;
            var apis = PlayerSettings.GetGraphicsAPIs(web);
            OutputDir = "Builds/WebGPU";
            try
            {
                PlayerSettings.SetGraphicsAPIs(web, new[] { UnityEngine.Rendering.GraphicsDeviceType.WebGPU, UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 });
                if (!Build(false)) EditorApplication.Exit(1);
            }
            finally
            {
                PlayerSettings.SetGraphicsAPIs(web, apis);
                OutputDir = DefaultDir;
            }
        }

        public static void Batch()
        {
            var ok = Build(BatchArgs.Has("jmDev"));
            if (!ok) EditorApplication.Exit(1);
        }

        [MenuItem("JapanMap/Build Web (Release)")]
        public static void Release() => Build(false);

        [MenuItem("JapanMap/Build Web (Development)")]
        public static void Development() => Build(true);

        public static bool Build(bool development)
        {
            if (Directory.Exists(OutputDir)) Directory.Delete(OutputDir, true);
            var options = new BuildPlayerOptions
            {
                scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(),
                locationPathName = OutputDir,
                target = BuildTarget.WebGL,
                // Release builds start clean: the incremental cache once skipped new shader stripping rules (Phase 10,
                // same size to the byte) — a release must never ship a stale cache.
                options = development ? BuildOptions.Development : BuildOptions.CleanBuildCache,
            };

            var stripped = new List<string>();
            void Collect(string message, string _, UnityEngine.LogType __)
            {
                var name = StrippedShaderName(message);
                if (name != null) lock (stripped) stripped.Add(name);
            }

            var clock = Stopwatch.StartNew();
            // Streamed content first (D36): cars and places as bundles under StreamingAssets/aa, not in the start data.
            Content.StreamingSetup.Settings();
            if (!development) UnityEditor.Build.Pipeline.Utilities.BuildCache.PurgeCache(false);
            UnityEditor.AddressableAssets.Settings.AddressableAssetSettings.BuildPlayerContent(out var content);
            if (!string.IsNullOrEmpty(content.Error))
            {
                Debug.LogError($"[WebBuild] Addressables content build failed: {content.Error}");
                return false;
            }
            UnityEngine.Application.logMessageReceivedThreaded += Collect;
            BuildReport report;
            try { report = BuildPipeline.BuildPlayer(options); }
            finally { UnityEngine.Application.logMessageReceivedThreaded -= Collect; }
            clock.Stop();

            var summary = report.summary;
            if (summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"[WebBuild] {summary.result}: {summary.totalErrors} errors");
                return false;
            }

            var text = SizeReport(development, clock.Elapsed.TotalSeconds) + StartDataReport(report, out var forbidden);
            File.WriteAllText(Path.Combine(OutputDir, "size-report.txt"), text);
            Debug.Log("[WebBuild] done\n" + text);

            if (forbidden.Count > 0)
            {
                Debug.LogError("[WebBuild] start data holds what must not ship: " + string.Join(", ", forbidden));
                return false;
            }

            // A fully stripped shader renders nothing (or pink) in the browser while the editor looks fine.
            var broken = UnexpectedStrippedShaders(stripped);
            if (broken.Count > 0)
            {
                Debug.LogError("[WebBuild] shaders with no subshader left for Web: " + string.Join(", ", broken));
                return false;
            }
            return true;
        }

        static readonly Regex StrippedShader = new(@"Shader '([^']+)': All SubShaders were stripped", RegexOptions.Compiled);

        // Unity's own GPU-occlusion debug shaders are always stripped on Web; nothing of ours uses them.
        // The terrain add pass goes on purpose while the terrain has four layers or fewer (ShaderStripping).
        static readonly string[] KnownStrippedPrefixes =
            new[] { "Hidden/Core/Debug", ShaderStripping.TerrainAddPass }.Concat(ShaderStripping.BuiltInOnly).ToArray();

        public static string StrippedShaderName(string logMessage)
        {
            var m = StrippedShader.Match(logMessage);
            return m.Success ? m.Groups[1].Value : null;
        }

        public static List<string> UnexpectedStrippedShaders(IEnumerable<string> shaderNames) =>
            shaderNames.Distinct()
                .Where(n => !KnownStrippedPrefixes.Any(n.StartsWith))
                .OrderBy(n => n)
                .ToList();

        // Assets nobody sees that still cost start download (the splash logo stayed in with the splash off, D36).
        // Streamed world content too: the vegetation import once left 2 MB of trees in Game.unity (fix: Setup Streaming).
        static readonly string[] ForbiddenInStart = { "Splash Screen Unity Logo", "Data/World/VegetationInstances.asset" };

        /// <summary>The largest assets inside Web.data (raw, before Brotli): the start download is where a hidden
        /// 2.7 MB texture hurt slow phones most, and the file sizes alone never showed what it was.</summary>
        static string StartDataReport(BuildReport report, out List<string> forbidden)
        {
            var bySource = new Dictionary<string, ulong>();
            foreach (var pack in report.packedAssets)
                foreach (var c in pack.contents)
                {
                    bySource.TryGetValue(c.sourceAssetPath, out var size);
                    bySource[c.sourceAssetPath] = size + c.packedSize;
                }
            forbidden = bySource.Keys.Where(k => ForbiddenInStart.Any(k.Contains)).ToList();
            var sb = new StringBuilder();
            sb.AppendLine($"start data  {bySource.Values.Aggregate(0UL, (a, b) => a + b) / 1e6:F2} MB raw, largest:");
            foreach (var kv in bySource.OrderByDescending(kv => kv.Value).Take(12))
                sb.AppendLine($"  {kv.Value / 1e6,8:F2} MB  {kv.Key}");
            return sb.ToString();
        }

        static string SizeReport(bool development, double seconds)
        {
            var root = new DirectoryInfo(OutputDir);
            var files = root.GetFiles("*", SearchOption.AllDirectories)
                .Where(f => f.Name != "size-report.txt")
                .OrderByDescending(f => f.Length)
                .ToList();
            var total = files.Sum(f => f.Length);
            var sb = new StringBuilder();
            sb.AppendLine($"date        {DateTime.Now:yyyy-MM-dd HH:mm}");
            sb.AppendLine($"unity       {UnityEngine.Application.unityVersion}");
            sb.AppendLine($"type        {(development ? "development" : "release")}");
            sb.AppendLine($"build time  {seconds:F0} s");
            // Decimal MB as CrazyGames and the browser count them (MiB under-reported by 5 % until Phase 10).
            sb.AppendLine($"total       {total / 1e6:F2} MB in {files.Count} files");
            // The start download: everything but the streamed bundles (CrazyGames counts up to the first gameplayStart).
            // Streamed later: the Addressables bundles and the plain terrain copy (only for browsers without gzip streams).
            var streamed = files.Where(f => f.FullName.Replace('\\', '/').Contains("/StreamingAssets/aa/") || f.Name == JapanMap.World.StreamedTerrain.PlainName
                || f.Name.StartsWith("terrain-detail")).Sum(f => f.Length);
            sb.AppendLine($"start       {(total - streamed) / 1e6:F2} MB (streamed later {streamed / 1e6:F2} MB)");
            sb.AppendLine("largest:");
            foreach (var f in files.Take(10))
                sb.AppendLine($"  {f.Length / 1e6,8:F2} MB  {Path.GetRelativePath(OutputDir, f.FullName).Replace('\\', '/')}");
            return sb.ToString();
        }
    }
}
