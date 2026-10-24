using System;
using JapanMap.Core;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Terrain draw distances and densities per quality tier (trees, grass/rice, terrain detail) —
    /// what URP's quality levels do not cover. Sits in Game.unity next to the terrains.
    /// </summary>
    public sealed class TerrainQuality : MonoBehaviour
    {
        [Serializable]
        public struct Tier
        {
            public string name;
            [Tooltip("Trees and bushes (InstanceRenderer with VegetationData) beyond this distance (m) are not drawn.")]
            public float treeDistance;
            [Tooltip("Place models drawn instanced (Tokyo; InstanceRenderer with PlaceInstanceData) beyond this distance (m) are not drawn. 0 = no limit.")]
            public float buildingDistance;
            [Tooltip("Grass and rice beyond this distance (m) are not drawn.")]
            public float detailDistance;
            [Range(0, 1)] public float detailDensity;
            [Tooltip("Terrain mesh error in pixels; higher = fewer triangles.")]
            public float pixelError;
        }

        public Tier[] tiers =
        {
            new() { name = "High", treeDistance = 1500, buildingDistance = 2500, detailDistance = 70, detailDensity = 1f, pixelError = 5 },
            new() { name = "Medium", treeDistance = 900, buildingDistance = 1200, detailDistance = 60, detailDensity = 0.6f, pixelError = 8 },
            new() { name = "Low", treeDistance = 500, buildingDistance = 450, detailDistance = 35, detailDensity = 0.3f, pixelError = 14 },
        };

        [Tooltip("Most 3D pixels per CSS pixel (canvas pixel ratio × URP render scale) on Medium. A 2× laptop screen draws 4× the pixels; " +
                 "the cap lowers only the 3D render scale, so UI text stays sharp. 0 = no cap.")]
        public float mediumPixelBudget = 1.5f;
        [Tooltip("The same on Low (phones and weak GPUs). Low's own render scale is 0.8.")]
        public float lowPixelBudget = 1.2f;

        // Render scale each pipeline asset was shipped with: the cap is applied on top of it, never on an already capped value.
        static readonly System.Collections.Generic.Dictionary<UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, float> BaseScale = new();

        void OnEnable()
        {
            QualitySystem.TierChanged += Apply;
            Apply(QualitySettings.names[QualitySettings.GetQualityLevel()]);
        }

        void OnDisable() => QualitySystem.TierChanged -= Apply;

        /// <summary>
        /// Measurement knobs for one browser build (A/B, rule 5 — one knob per measurement), never settings:
        /// ?msaa=1|2|4, ?cascades=1..4, ?shadowdist=metres on the tier's pipeline asset.
        /// </summary>
        static void ApplyUrlKnobs()
        {
            if (QualitySettings.renderPipeline is not UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset urp) return;
            var url = Application.absoluteURL;
            if (int.TryParse(QualitySystem.UrlParam(url, "msaa"), out var msaa)) urp.msaaSampleCount = msaa;
            if (int.TryParse(QualitySystem.UrlParam(url, "cascades"), out var cascades)) urp.shadowCascadeCount = cascades;
            if (float.TryParse(QualitySystem.UrlParam(url, "shadowdist"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var dist))
                urp.shadowDistance = dist;
        }

        /// <summary>Render scale that keeps pixel ratio × scale within the budget (0 = no cap); never above the asset's own scale.</summary>
        public static float CappedScale(float assetScale, float pixelRatio, float budget) =>
            budget > 0f && pixelRatio > 0f ? Mathf.Clamp(budget / pixelRatio, 0.5f, assetScale) : assetScale;

        static void ApplyPixelBudget(float budget)
        {
            // Only in the player: in the editor the pixel ratio is 1 and the asset must not be changed on disk.
            if (Application.isEditor) return;
            if (QualitySettings.renderPipeline is not UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset urp) return;
            if (!BaseScale.TryGetValue(urp, out var shipped)) BaseScale[urp] = shipped = urp.renderScale;
            urp.renderScale = CappedScale(shipped, Core.Ui.UiPanel.DevicePixelRatio(), budget);
        }

        public void Apply(string tierName)
        {
            var t = Array.Find(tiers, x => x.name == tierName);
            if (t.name == null) return;
            foreach (var r in FindObjectsByType<InstanceRenderer>())
            {
                if (r.data is VegetationData) r.maxDistance = t.treeDistance;
                else if (r.data is PlaceInstanceData) r.maxDistance = t.buildingDistance > 0 ? t.buildingDistance : 6000;
            }
            ApplyUrlKnobs();
            ApplyPixelBudget(tierName == "Low" ? lowPixelBudget : tierName == "Medium" ? mediumPixelBudget : 0f);
            foreach (var terrain in Terrain.activeTerrains)
            {
                terrain.treeDistance = t.treeDistance;
                terrain.detailObjectDistance = t.detailDistance;
                terrain.detailObjectDensity = t.detailDensity;
                terrain.heightmapPixelError = t.pixelError;
            }
        }
    }
}
