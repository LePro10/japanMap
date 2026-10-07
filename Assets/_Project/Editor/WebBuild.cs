using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
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

            var clock = Stopwatch.StartNew();
            var report = BuildPipeline.BuildPlayer(options);
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
            return true;
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
            sb.AppendLine($"total       {total / 1048576.0:F2} MB in {files.Count} files");
            sb.AppendLine("largest:");
            foreach (var f in files.Take(10))
                sb.AppendLine($"  {f.Length / 1048576.0,8:F2} MB  {Path.GetRelativePath(OutputDir, f.FullName).Replace('\\', '/')}");
            return sb.ToString();
        }
    }
}
