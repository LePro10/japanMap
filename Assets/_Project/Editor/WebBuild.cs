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
        public const string OutputDir = "Builds/Web";

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
                options = development ? BuildOptions.Development : BuildOptions.None,
            };

            var stripped = new List<string>();
            void Collect(string message, string _, UnityEngine.LogType __)
            {
                var name = StrippedShaderName(message);
                if (name != null) lock (stripped) stripped.Add(name);
            }

            var clock = Stopwatch.StartNew();
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

            var text = SizeReport(development, clock.Elapsed.TotalSeconds);
            File.WriteAllText(Path.Combine(OutputDir, "size-report.txt"), text);
            Debug.Log("[WebBuild] done\n" + text);

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
        static readonly string[] KnownStrippedPrefixes = { "Hidden/Core/Debug" };

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
            sb.AppendLine("largest:");
            foreach (var f in files.Take(10))
                sb.AppendLine($"  {f.Length / 1e6,8:F2} MB  {Path.GetRelativePath(OutputDir, f.FullName).Replace('\\', '/')}");
            return sb.ToString();
        }
    }
}
