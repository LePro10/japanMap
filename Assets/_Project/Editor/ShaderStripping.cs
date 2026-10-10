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
        // Post-processing keywords no profile/pipeline asset can switch on (checked at every build, so a later change keeps them).
        static readonly List<string> _unusedPost = new();
        static bool _postChecked;

        /// <summary>
        /// Which post keywords nothing can switch on — worked out on the first shader of a build, not in the build's
        /// pre-step (the list stayed empty there once: the rules never matched, Phase 10).
        /// </summary>
        static void CheckPost()
        {
            if (_postChecked) return;
            _postChecked = true;
            _unusedPost.Clear();
            var pipelines = AssetDatabase.FindAssets("t:UniversalRenderPipelineAsset", new[] { "Assets/_Project" })
                .Select(g => AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset>(AssetDatabase.GUIDToAssetPath(g)))
                .Where(a => a != null).ToList();
            // As URP resolves a parameter: the game's own look volume (Data/Look) first, then the pipeline's base profile
            // (the URP template's sample profile, part of the approved look), then the component's default.
            var look = AssetDatabase.FindAssets("t:VolumeProfile", new[] { "Assets/_Project/Data/Look" })
                .Select(g => AssetDatabase.LoadAssetAtPath<VolumeProfile>(AssetDatabase.GUIDToAssetPath(g))).Where(p => p != null).ToList();
            var bases = pipelines.Select(p => p.volumeProfile).Where(p => p != null).Distinct().ToList();
            bool Used<T, TV>(System.Func<T, VolumeParameter<TV>> param, System.Func<TV, bool> on) where T : VolumeComponent
            {
                bool? From(IEnumerable<VolumeProfile> set)
                {
                    foreach (var p in set)
                        if (p.TryGet<T>(out var c) && c.active && param(c).overrideState) return on(param(c).value);
                    return null;
                }
                var fromLook = From(look);
                if (fromLook.HasValue) return fromLook.Value;
                // Every tier has its own base: used if any tier's base switches it on.
                return bases.Any(b => From(new[] { b }) == true);
            }
            if (!Used<UnityEngine.Rendering.Universal.Tonemapping, UnityEngine.Rendering.Universal.TonemappingMode>(t => t.mode, m => m == UnityEngine.Rendering.Universal.TonemappingMode.Neutral))
                _unusedPost.Add("_TONEMAP_NEUTRAL");
            if (!Used<UnityEngine.Rendering.Universal.Bloom, bool>(b => b.highQualityFiltering, v => v))
                _unusedPost.Add("_BLOOM_HQ");
            if (!Used<UnityEngine.Rendering.Universal.FilmGrain, float>(f => f.intensity, v => v > 0f))
                _unusedPost.Add("_FILM_GRAIN");
            if (!pipelines.Any(a => a.upscalingFilter == UnityEngine.Rendering.Universal.UpscalingFilterSelection.FSR))
                _unusedPost.Add("_RCAS"); // FSR sharpening
        }
        /// <summary>Built-in render pipeline shaders Unity still adds; URP never draws with them.</summary>
        public static readonly string[] BuiltInOnly =
            { "Hidden/Internal-DeferredShading", "Hidden/Internal-DeferredReflections", "Hidden/Internal-ScreenSpaceShadows",
              "Hidden/Internal-DepthNormalsTexture", "Legacy Shaders/Diffuse" };
        static readonly ShaderKeyword LegacyLightmaps = new("USE_LEGACY_LIGHTMAPS");

        public void OnPreprocessBuild(BuildReport report)
        {
            Report.Clear();
            // The terrain shader's add pass draws layers 5+; with four or fewer it never runs.
            _terrainLayers = AssetDatabase.FindAssets("t:TerrainData")
                .Select(g => AssetDatabase.LoadAssetAtPath<TerrainData>(AssetDatabase.GUIDToAssetPath(g)))
                .Where(t => t != null).Select(t => t.terrainLayers.Length).DefaultIfEmpty(0).Max();
            _postChecked = false;
        }

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.WebGL) return;
            var key = $"{shader.name} | {snippet.passName}";
            if (!Report.TryGetValue(key, out var r)) r = (0, 0, new Dictionary<string, int>());
            CheckPost();
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
            if (System.Array.IndexOf(BuiltInOnly, shader.name) >= 0) return true;
            // BatchRendererGroup / GPU resident drawer: not available on WebGL2.
            if (d.shaderKeywordSet.IsEnabled(Dots)) return true;
            // The game scene always has exponential-squared fog (LookSetup); streamed places draw with the active scene's.
            if (hasFog && !d.shaderKeywordSet.IsEnabled(Fog)) return true;
            // No lightmaps anywhere in the project (all light is realtime).
            if (d.shaderKeywordSet.IsEnabled(LegacyLightmaps)) return true;
            // Post-processing keywords are local to their shader: compare names, not global keywords.
            if (_unusedPost.Count > 0)
                foreach (var k in d.shaderKeywordSet.GetShaderKeywords())
                    if (_unusedPost.Contains(k.name)) return true;
            return false;
        }

        public void OnPostprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.WebGL) return;
            var sb = new StringBuilder();
            sb.AppendLine($"unused post keywords (stripped): {string.Join(", ", _unusedPost)}");
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
