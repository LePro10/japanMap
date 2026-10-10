using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace JapanMap.Editor
{
    /// <summary>
    /// Three quality tiers, each with its own URP asset. Values are starting points without fine
    /// tuning (Phase 1); calibration against real devices follows in Phase 10.
    /// </summary>
    static class QualitySetup
    {
        struct Tier
        {
            public string Name, Source;
            public float RenderScale, ShadowDistance, LodBias;
            public int Cascades, Msaa, MipLimit;
            public bool Hdr, Shadows;
        }

        static readonly Tier[] Tiers =
        {
            new() { Name = "High",   Source = "PC_RPAsset",     RenderScale = 1f,   ShadowDistance = 150f, Cascades = 4, Msaa = 2, Hdr = true,  Shadows = true,  LodBias = 2f,   MipLimit = 0 },
            new() { Name = "Medium", Source = "PC_RPAsset",     RenderScale = 1f,   ShadowDistance = 80f,  Cascades = 2, Msaa = 1, Hdr = true,  Shadows = true,  LodBias = 1.5f, MipLimit = 0 },
            new() { Name = "Low",    Source = "Mobile_RPAsset", RenderScale = 0.8f, ShadowDistance = 40f,  Cascades = 1, Msaa = 1, Hdr = false, Shadows = false, LodBias = 1f,   MipLimit = 1 },
        };

        public static string AssetPath(string tier) => $"{ProjectSetup.SettingsDir}/URP-{tier}.asset";

        public static void Apply()
        {
            var assets = new UniversalRenderPipelineAsset[Tiers.Length];
            for (var i = 0; i < Tiers.Length; i++)
                assets[i] = CreateOrUpdateAsset(Tiers[i]);

            var qualityAsset = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset")[0];
            var so = new SerializedObject(qualityAsset);
            var levels = so.FindProperty("m_QualitySettings");
            levels.arraySize = Tiers.Length;
            for (var i = 0; i < Tiers.Length; i++)
            {
                var t = Tiers[i];
                var level = levels.GetArrayElementAtIndex(i);
                level.FindPropertyRelative("name").stringValue = t.Name;
                level.FindPropertyRelative("customRenderPipeline").objectReferenceValue = assets[i];
                level.FindPropertyRelative("lodBias").floatValue = t.LodBias;
                level.FindPropertyRelative("globalTextureMipmapLimit").intValue = t.MipLimit;
                level.FindPropertyRelative("anisotropicTextures").intValue = i == 0 ? 2 : 1;
                level.FindPropertyRelative("vSyncCount").intValue = 1;
                var excluded = level.FindPropertyRelative("excludedTargetPlatforms");
                if (excluded != null) excluded.arraySize = 0;
            }
            so.FindProperty("m_CurrentQuality").intValue = 0;
            so.ApplyModifiedPropertiesWithoutUndo();

            GraphicsSettings.defaultRenderPipeline = assets[0];

            // The template assets are now unused copies; remove them so nothing points at them by accident.
            foreach (var old in new[] { "PC_RPAsset", "Mobile_RPAsset" })
            {
                var path = $"{ProjectSetup.SettingsDir}/{old}.asset";
                if (AssetDatabase.LoadAssetAtPath<Object>(path) != null) AssetDatabase.DeleteAsset(path);
            }
            AssetDatabase.SaveAssets();
        }

        static UniversalRenderPipelineAsset CreateOrUpdateAsset(Tier t)
        {
            var path = AssetPath(t.Name);
            var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            if (asset == null)
            {
                var source = $"{ProjectSetup.SettingsDir}/{t.Source}.asset";
                if (!AssetDatabase.CopyAsset(source, path))
                    throw new System.InvalidOperationException($"[Quality] cannot copy {source} to {path}");
                asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            }

            asset.renderScale = t.RenderScale;
            asset.shadowDistance = t.ShadowDistance;
            asset.shadowCascadeCount = t.Cascades;
            asset.msaaSampleCount = t.Msaa;
            asset.supportsHDR = t.Hdr;
            // No public setter for main-light shadows; serialized field instead.
            var so = new SerializedObject(asset);
            so.FindProperty("m_MainLightShadowsSupported").boolValue = t.Shadows;
            // Template features the game never uses (measured Phase 10: 0 cookie lights, 0 point/spot shadows, 0 custom
            // light layers, 0 cross-fading LOD groups). Each one doubles shader variants — off = smaller start download (D36).
            so.FindProperty("m_SupportsLightCookies").boolValue = false;
            so.FindProperty("m_AdditionalLightShadowsSupported").boolValue = false;
            so.FindProperty("m_SupportsLightLayers").boolValue = false;
            so.FindProperty("m_EnableLODCrossFade").boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return asset;
        }
    }
}
