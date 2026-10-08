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
            [Tooltip("Trees and bushes (VegetationRenderer) beyond this distance (m) are not drawn.")]
            public float treeDistance;
            [Tooltip("Grass and rice beyond this distance (m) are not drawn.")]
            public float detailDistance;
            [Range(0, 1)] public float detailDensity;
            [Tooltip("Terrain mesh error in pixels; higher = fewer triangles.")]
            public float pixelError;
        }

        public Tier[] tiers =
        {
            new() { name = "High", treeDistance = 1500, detailDistance = 90, detailDensity = 1f, pixelError = 5 },
            new() { name = "Medium", treeDistance = 900, detailDistance = 60, detailDensity = 0.6f, pixelError = 8 },
            new() { name = "Low", treeDistance = 500, detailDistance = 35, detailDensity = 0.3f, pixelError = 14 },
        };

        void OnEnable()
        {
            QualitySystem.TierChanged += Apply;
            Apply(QualitySettings.names[QualitySettings.GetQualityLevel()]);
        }

        void OnDisable() => QualitySystem.TierChanged -= Apply;

        public void Apply(string tierName)
        {
            var t = Array.Find(tiers, x => x.name == tierName);
            if (t.name == null) return;
            foreach (var veg in FindObjectsByType<VegetationRenderer>(FindObjectsSortMode.None)) veg.maxDistance = t.treeDistance;
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
