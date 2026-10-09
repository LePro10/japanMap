using UnityEngine;

namespace JapanMap.Editor.Vegetation
{
    /// <summary>
    /// Scatter rules, ported from legacy vegetation.config.ts SPECIES: one candidate per jittered grid
    /// cell, accepted with probability = Σ zone weight × splat weight (zones.png channels rock, grass,
    /// sand, paddy), then filtered by height, slope, distance to road centre lines, the city district
    /// and props. The asset is the truth (defaults seed a missing asset).
    /// </summary>
    public sealed class VegetationSettings : ScriptableObject
    {
        public const string AssetPath = "Assets/_Project/Data/World/Vegetation.asset";

        [System.Serializable]
        public class Species
        {
            public TreeBuilder.Species model;
            [Tooltip("Grid cell (m); one candidate per cell.")]
            public float cellSize = 10;
            [Tooltip("rock, grass, sand, paddy (legacy: paddy −1 keeps trees off the dikes).")]
            public Vector4 zoneWeights;
            public float minScale = 0.8f, maxScale = 1.3f;
            public float maxSlopeDeg = 30;
            public float minHeight = 2, maxHeight = 400;
            [Tooltip("Minimum distance to the road edge (m). Legacy measured from the centre; edge distance scales with road width like legacy vegetationDistance (P8.7).")]
            public float roadClearance = 15;
            [Tooltip("Variant weights (3 variants); e.g. maple: green, orange, red.")]
            public Vector3 variantWeights = Vector3.one;
            [Tooltip("Distance (m) where LOD0 / LOD1 end at QualitySettings.lodBias 1 (High has 2 → double).")]
            public float lod0End = 35, lod1End = 110;
            [Tooltip("Never drawn beyond (m), whatever the tier allows.")]
            public float maxDistance = 3000;
            [Tooltip("Trunk collider near the player; 0 = drive through.")]
            public float colliderRadius = 0.35f, colliderHeight = 4f;
            [Tooltip("Library models for the 3 variants (asset sprint, style Flora); empty or not imported = the provisional tree.")]
            public string[] library = { };
            [Tooltip("LOD0 / LOD1 end (m, lodBias 1) for the library models: the real trees have 700–1 500 triangles in LOD1 (the provisional ones 136), so they switch to the 50–110-triangle far LOD much earlier.")]
            public Vector2 libraryLodEnd = new(25f, 60f);
        }

        public int seed = 20260727;

        public Species[] species =
        {
            // legacy 'pine' (Nadelbaum): cell 8, grass 0.35, slope 38°, 12–350 m, road 20 m
            new() { model = TreeBuilder.Species.Cedar, cellSize = 8, zoneWeights = new Vector4(0, 0.35f, 0, -1), minScale = 0.7f, maxScale = 1.25f, maxSlopeDeg = 38, minHeight = 12, maxHeight = 350, roadClearance = 16, lod0End = 45, lod1End = 140 },
            // legacy 'broadleaf': cell 11, grass 0.5, slope 27°, 6–190 m, road 22 m — mostly green, some autumn red
            new() { model = TreeBuilder.Species.Maple, cellSize = 11, zoneWeights = new Vector4(0, 0.5f, 0, -1), minScale = 0.8f, maxScale = 1.5f, maxSlopeDeg = 27, minHeight = 6, maxHeight = 190, roadClearance = 18, variantWeights = new Vector3(0.96f, 0.03f, 0.01f) },
            // legacy 'bush': cell 5, grass 0.3, slope 42°, 2–400 m, road 16 m
            new() { model = TreeBuilder.Species.Bush, cellSize = 5, zoneWeights = new Vector4(0, 0.3f, 0, -1), minScale = 0.6f, maxScale = 1.35f, maxSlopeDeg = 42, minHeight = 2, maxHeight = 400, roadClearance = 12, lod0End = 10, lod1End = 30, maxDistance = 220, colliderRadius = 0 },
            // new (rule 15): a few cherries and bamboo groves in the low meadows
            new() { model = TreeBuilder.Species.Cherry, cellSize = 24, zoneWeights = new Vector4(0, 0.08f, 0, -1), minScale = 0.85f, maxScale = 1.35f, maxSlopeDeg = 20, minHeight = 3, maxHeight = 80, roadClearance = 8 },
            new() { model = TreeBuilder.Species.Bamboo, cellSize = 7, zoneWeights = new Vector4(0, 0.05f, 0, -1), minScale = 0.8f, maxScale = 1.2f, maxSlopeDeg = 30, minHeight = 4, maxHeight = 120, roadClearance = 10, lod0End = 30, lod1End = 90, colliderRadius = 0.6f },
        };

        [Header("Detail (grass, rice)")]
        [Tooltip("Detail map resolution per terrain tile. 1024 on 3 km = 3 m cells.")]
        public int detailResolution = 1024;
        [Tooltip("Coverage (0–255) at full grass weight. Legacy grass: grass 1.0, sand 0.06, paddy 0.85 (paddy gets rice instead).")]
        public int grassCoverage = 200;
        public int riceCoverage = 255;
        [Tooltip("Prototype density in coverage mode. Measured: 2.5 gave ~7.6 tufts/m² and 30 M triangles at the sando; 0.25 → 3.4 M.")]
        public float grassDensity = 0.25f;
        public float riceDensity = 0.4f;
        [Tooltip("No grass within this distance (m) of the road edge (legacy: 7 m from the centre of a ~6 m road).")]
        public float grassRoadClearance = 1;

        [Header("Keep clear")]
        [Tooltip("Extra free radius (m) around props, added to their footprint.")]
        public float propClearance = 3;
        [Tooltip("Vegetation fades out over this distance (m) into the city district.")]
        public float cityFade = 40;
    }
}
