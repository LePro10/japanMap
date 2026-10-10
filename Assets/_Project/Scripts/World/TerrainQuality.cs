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
