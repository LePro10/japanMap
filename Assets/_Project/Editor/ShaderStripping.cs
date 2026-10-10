using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.Editor
{
    /// <summary>
    /// Shader variants the game can never use, removed from web builds (D36): shaders were ~12 MB of the start download
    /// (Lit 4.4, three terrain shaders 6.1, glTF car shaders 2.1 — already compressed, so only fewer variants help).
    /// Every build writes Builds/shader-variants.txt (variants per shader/pass and keyword counts) so each rule is
    /// measured, and a rule that strips something still in use shows up there.
    /// </summary>
    public sealed class ShaderStripping : IPreprocessShaders, IPreprocessBuildWithReport, IPostprocessBuildWithReport
    {
        public int callbackOrder => 100; // after URP's own stripping

        static readonly Dictionary<string, (int kept, int stripped, Dictionary<string, int> keywords)> Report = new();

        static readonly ShaderKeyword Dots = new("DOTS_INSTANCING_ON");
        static readonly ShaderKeyword Fog = new("FOG_EXP2");
        public const string TerrainAddPass = "Hidden/Universal Render Pipeline/Terrain/Lit (Add Pass)";
        static int _terrainLayers;

        public void OnPreprocessBuild(BuildReport report)
        {
            Report.Clear();
            // The terrain shader's add pass draws layers 5+; with four or fewer it never runs.
            _terrainLayers = AssetDatabase.FindAssets("t:TerrainData")
                .Select(g => AssetDatabase.LoadAssetAtPath<TerrainData>(AssetDatabase.GUIDToAssetPath(g)))
                .Where(t => t != null).Select(t => t.terrainLayers.Length).DefaultIfEmpty(0).Max();
        }

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.WebGL) return;
            var key = $"{shader.name} | {snippet.passName}";
            if (!Report.TryGetValue(key, out var r)) r = (0, 0, new Dictionary<string, int>());
            var hasFog = false;
            foreach (var d in data) if (d.shaderKeywordSet.IsEnabled(Fog)) { hasFog = true; break; }
            for (var i = data.Count - 1; i >= 0; i--)
            {
                if (Strip(shader, data[i], hasFog))
                {
                    data.RemoveAt(i);
                    r.stripped++;
                    continue;
                }
                r.kept++;
                foreach (var k in data[i].shaderKeywordSet.GetShaderKeywords())
                {
                    var name = k.name;
                    r.keywords[name] = r.keywords.TryGetValue(name, out var c) ? c + 1 : 1;
                }
            }
            Report[key] = r;
        }

        /// <summary>True = this variant is never drawn in this game.</summary>
        static bool Strip(Shader shader, ShaderCompilerData d, bool hasFog)
        {
            if (shader.name == TerrainAddPass && _terrainLayers <= 4) return true;
            // BatchRendererGroup / GPU resident drawer: not available on WebGL2.
            if (d.shaderKeywordSet.IsEnabled(Dots)) return true;
            // The game scene always has exponential-squared fog (LookSetup); streamed places draw with the active scene's.
            if (hasFog && !d.shaderKeywordSet.IsEnabled(Fog)) return true;
            return false;
        }

        public void OnPostprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.WebGL) return;
            var sb = new StringBuilder();
            foreach (var kv in Report.OrderByDescending(k => k.Value.kept))
            {
                sb.AppendLine($"{kv.Value.kept,5} kept {kv.Value.stripped,5} stripped  {kv.Key}");
                foreach (var k in kv.Value.keywords.OrderByDescending(k => k.Value)) sb.AppendLine($"        {k.Value,5}  {k.Key}");
            }
            Directory.CreateDirectory("Builds");
            File.WriteAllText("Builds/shader-variants.txt", sb.ToString());
        }
    }
}
