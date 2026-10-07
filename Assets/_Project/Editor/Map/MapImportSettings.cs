using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Tuning for the map importers (Phase 2). One asset at <see cref="AssetPath"/>; the importers
    /// create it with these defaults if it is missing.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Map Import Settings")]
    public sealed class MapImportSettings : ScriptableObject
    {
        public const string AssetPath = "Assets/_Project/Data/Map/MapImportSettings.asset";

        [Header("Source")]
        [Tooltip("Folder with the legacy export, relative to the project folder.")]
        public string sourceDir = "SourceData/legacy";

        [Header("Terrain")]
        [Tooltip("Tiles per side: 1 = one 3 km terrain, 2 = 2x2, 4 = 4x4. 2048 must be divisible by it.")]
        public int tilesPerSide = 1;
        [Tooltip("Terrain LOD error in pixels; higher = fewer triangles, more popping.")]
        public float pixelError = 5f;
        public float basemapDistance = 1000f;
        public bool drawInstanced = true;
        [Tooltip("Allowed deviation at the checkpoints of checkpoints.json, in metres.")]
        public float checkpointTolerance = 0.1f;

        [Header("Splatmap (zones.png: R, G, B, rest = 4th layer)")]
        [Tooltip("Order is the channel order of zones.png. Tile size from legacy terrain.config.ts: 11 m × tileScale.")]
        public SplatLayer[] splatLayers =
        {
            new() { name = "Rock", texture = "rock_face_03", tileMeters = 17.6f },
            new() { name = "Grass", texture = "aerial_grass_rock", tileMeters = 11f },
            new() { name = "Sand", texture = "coast_sand_01", tileMeters = 8.25f },
            new() { name = "Paddy", texture = "brown_mud_02", tileMeters = 12.1f },
        };

        [Header("Water")]
        [Tooltip("Half size of the sea plane around the map centre, metres. Sea level is 0 (meta.json).")]
        public float seaExtent = 8000f;
        [Tooltip("Water above the paddy floor. Legacy props.config PADDY_WATER.depth: 0.10 (0.30 from the bake drowned the cars).")]
        public float paddyDepth = 0.1f;
        [Tooltip("Max height difference of the wet cells merged into one water strip (legacy levelTolerance).")]
        public float paddyLevelTolerance = 0.08f;
        [Tooltip("Paddy water is split into square chunks of this size so whole chunks are culled.")]
        public float paddyChunk = 256f;
        [Tooltip("Legacy water.config RIVER: surfaceRise, edgeSink, minDepth, maxDepth, widthFactor.")]
        public float riverSurfaceRise = 0.9f;
        public float riverEdgeSink = 0.2f;
        public float riverMinDepth = 0.35f;
        public float riverMaxDepth = 6f;
        public float riverWidthFactor = 0.78f;

        [Header("Roads (legacy roads.config.ts ROAD_TYPES / ROAD_MESH)")]
        public RoadType[] roadTypes =
        {
            new() { type = "highway", width = 9f, shoulder = 1.6f, textureLength = 8f },
            new() { type = "mountain", width = 6.5f, shoulder = 1f, textureLength = 7f },
            new() { type = "village", width = 5f, shoulder = 0.8f, textureLength = 6f },
            new() { type = "city", width = 8f, shoulder = 1.2f, textureLength = 8f },
            new() { type = "dirt", width = 4f, shoulder = 0.6f, textureLength = 5f },
            new() { type = "pfad", width = 1.8f, shoulder = 0f, textureLength = 3f, gravel = true },
        };
        [Tooltip("Road surface above the centreline height (legacy ROAD_MESH.surfaceOffset).")]
        public float roadSurfaceOffset = 0.06f;
        [Tooltip("Outer shoulder edge lies this much lower, so the road does not end in a knife edge.")]
        public float roadShoulderDrop = 0.22f;
        [Tooltip("Banking reaches its maximum at this curvature × max (legacy BANK_GAIN 20 = full at 20 m radius).")]
        public float roadBankGain = 20f;
        [Tooltip("Roads are merged into square chunks of this size (fewer draw calls, still culled).")]
        public float roadChunk = 512f;
        [Tooltip("Guardrail band bottom/top above the road, offset outside the shoulder, post spacing (legacy GuardrailBuilder RAIL).")]
        public float railBottom = 0.5f;
        public float railTop = 0.85f;
        public float railOffset = 0.35f;
        public float railPostSpacing = 4f;

        [Header("Viaducts (legacy ViaductSystem.ts)")]
        [Tooltip("Deck below road spans this far above ground; piers from pierFrom, every pierSpacing metres.")]
        public float deckFrom = 2.5f;
        public float deckDepth = 1.35f;
        public float pierFrom = 4f;
        public float pierSpacing = 28f;

        [Header("City slab (legacy city.mjs CITY_DISTRICT.parts, CITY_GROUND_Y 30 − dropBelowRoad 0.03)")]
        [Tooltip("The city streets lie at 30 m on a slab; the carved terrain below is at 29.0 m.")]
        public float citySlabY = 29.97f;
        [Tooltip("Rectangles in Three coordinates: x = minX, y = minZ, width/height = size.")]
        public Rect[] cityParts =
        {
            Rect.MinMaxRect(300, -160, 1300, 450),
            Rect.MinMaxRect(300, -250, 1040, -160),
        };

        [System.Serializable]
        public class RoadType
        {
            public string type;
            public float width = 8f;
            public float shoulder = 1f;
            public float textureLength = 8f;
            public bool gravel;
        }

        [System.Serializable]
        public class SplatLayer
        {
            public string name;
            [Tooltip("Folder name under Assets/ThirdParty/PolyHaven/Textures.")]
            public string texture;
            public float tileMeters = 11f;
        }

        public static MapImportSettings LoadOrCreate()
        {
            var settings = UnityEditor.AssetDatabase.LoadAssetAtPath<MapImportSettings>(AssetPath);
            if (settings != null) return settings;
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(AssetPath));
            settings = CreateInstance<MapImportSettings>();
            UnityEditor.AssetDatabase.CreateAsset(settings, AssetPath);
            return settings;
        }
    }
}
