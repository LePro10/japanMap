using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Tuning for the map importers (Phase 2). One asset at <see cref="AssetPath"/>; the importers
    /// create it with these defaults if it is missing. The asset is the truth: changing a default
    /// here does not reach the existing asset — edit the asset (inspector or SerializedObject).
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
        [Tooltip("Paddy shore: water stops this far short of the dam's middle, m (legacy bankInset 0.25).")]
        public float paddyBankInset = 0.25f;
        [Tooltip("Paddy shore where the dry side lies lower (a terrace edge), m (legacy dropInset 0.55).")]
        public float paddyDropInset = 0.55f;
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
        [Tooltip("Gravel verge beyond the shoulder down onto the terrain, m (0 = none; paths have none).")]
        public float roadVerge = 1.4f;
        [Tooltip("Banking reaches its maximum at this curvature × max (legacy BANK_GAIN 20 = full at 20 m radius).")]
        public float roadBankGain = 20f;
        [Tooltip("Roads are merged into square chunks of this size (fewer draw calls, still culled).")]
        public float roadChunk = 512f;
        [Tooltip("Guardrail band bottom/top above the road, offset outside the shoulder, post spacing (legacy GuardrailBuilder RAIL).")]
        public float railBottom = 0.5f;
        public float railTop = 0.85f;
        public float railOffset = 0.35f;
        public float railPostSpacing = 4f;

        [Header("Terrain under roads (Phase 3: the 1.5 m heightmap poked up to 4 m through the ring at a cliff)")]
        [Tooltip("Terrain is kept this far below the road centreline across road + shoulder, m.")]
        public float carveDepth = 0.03f;
        [Tooltip("Width of the 45° bank from the shoulder edge back up to the natural ground, m.")]
        public float carveBank = 2f;
        [Tooltip("Deeper cuts are left alone (a road that far below ground is a tunnel, not a bump), m.")]
        public float carveMaxDepth = 8f;
        [Tooltip("Ground below a road's core by up to this much is raised to it (m); larger gaps are bridges and stay.")]
        public float carveGapFill = 1f;

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

        [Header("Props (placeholders until Phase 4; sizes W × H × D from legacy landmarkMeshes.ts / props.config.ts)")]
        [Tooltip("Yaw in Unity = propYawBase − rot (README: 180 − rot for models whose front is local +Z in both worlds).")]
        public float propYawBase = 180f;
        public PropSpec[] props =
        {
            new() { id = "tetrapod", size = new Vector3(2.0f, 1.7f, 2.2f), category = "Concrete" },
            new() { id = "delineator", size = new Vector3(0.15f, 1.0f, 0.15f), category = "Marker" },
            new() { id = "concreteWall", size = new Vector3(8.42f, 2.05f, 0.44f), category = "Concrete" },
            new() { id = "shed", size = new Vector3(4.6f, 2.9f, 3.6f), category = "Wood" },
            new() { id = "powerPole", size = new Vector3(0.3f, 9.0f, 0.3f), category = "Wood" },
            new() { id = "rock_moss_set_02", size = new Vector3(3.5f, 2.0f, 3.5f), category = "Rock" },
            new() { id = "boulder_01", size = new Vector3(2.5f, 1.8f, 2.5f), category = "Rock" },
            new() { id = "greenhouse", size = new Vector3(7.1f, 3.6f, 14.3f), category = "Building" },
            new() { id = "stoneLantern", size = new Vector3(0.8f, 2.24f, 0.8f), category = "Stone" },
            new() { id = "farmhouse", size = new Vector3(11.9f, 7.5f, 9.8f), category = "Building" },
            new() { id = "warehouse", size = new Vector3(21.52f, 6.42f, 13.3f), category = "Building" },
            new() { id = "netRack", size = new Vector3(2.91f, 2.47f, 4.6f), category = "Wood" },
            new() { id = "torii", size = new Vector3(6.0f, 5.0f, 0.8f), category = "Shrine", gate = true },
            new() { id = "fishHut", size = new Vector3(6.2f, 3.77f, 4.92f), category = "Wood" },
            new() { id = "boat", size = new Vector3(2.0f, 1.2f, 5.6f), category = "Wood" },
            new() { id = "crateStack", size = new Vector3(2.11f, 1.23f, 1.49f), category = "Wood" },
            new() { id = "templeHall", size = new Vector3(14.0f, 7.7f, 11.0f), category = "Shrine" },
            new() { id = "templeStairs", size = new Vector3(4.3f, 2.5f, 3.8f), category = "Stone" },
            new() { id = "chozuya", size = new Vector3(3.25f, 2.9f, 3.25f), category = "Shrine" },
            new() { id = "bellTower", size = new Vector3(3.54f, 4.23f, 3.54f), category = "Shrine" },
            new() { id = "hokora", size = new Vector3(1.0f, 1.4f, 1.0f), category = "Shrine" },
            new() { id = "lighthouse", size = new Vector3(3.0f, 13.56f, 3.0f), category = "Building" },
            new() { id = "modular_wooden_pier", size = new Vector3(3.0f, 1.0f, 10.0f), category = "Wood" },
            new() { id = "coastal_cliff_04", size = new Vector3(20.0f, 12.0f, 20.0f), category = "Rock" },
            new() { id = "boatRamp", size = new Vector3(5.25f, 2.53f, 11.58f), category = "Concrete" },
            new() { id = "jetty", size = new Vector3(2.59f, 2.6f, 14.0f), category = "Wood" },
        };

        [System.Serializable]
        public class PropSpec
        {
            public string id;
            public Vector3 size = Vector3.one * 2;
            [Tooltip("Placeholder material: Concrete, Wood, Stone, Rock, Building, Shrine, Marker.")]
            public string category = "Concrete";
            [Tooltip("Two posts and a beam instead of a solid box; only the posts collide (you pass through a torii).")]
            public bool gate;
            [Tooltip("Library models (Prefabs/Library/P_<name>) that replace the placeholder; one is picked per instance, stable by index. Empty = placeholder.")]
            public string[] library = { };
            [Tooltip("Scale the library model so its height matches size.y (natural objects like rocks); off = real-world size.")]
            public bool fitHeight;
            [Tooltip("Extra yaw (degrees) for library models whose long axis differs from the legacy prop (boats: length along X).")]
            public float libraryYaw;
        }

        [System.Serializable]
        public class RoadType
        {
            public string type;
            public float width = 8f;
            public float shoulder = 1f;
            public float textureLength = 8f;
            public bool gravel;
            [Tooltip("Road paint drawn by the wet surface shader: 0 none, 1 edge lines + dashed centre line, 2 edge lines only.")]
            public int markings;
            [Tooltip("Smallest vertical radius of a dip or crest, m (0 = keep the data). At 120 km/h a 46 m dip pulled 2.6 g " +
                     "and the body hit the road (Phase 10); ~v²/(0.35 g) for the road's speed.")]
            public float minVerticalRadius;
        }

        [System.Serializable]
        public class SplatLayer
        {
            public string name;
            [Tooltip("Folder name under Assets/ThirdParty/PolyHaven/Textures.")]
            public string texture;
            public float tileMeters = 11f;
            [Tooltip("Multiplier on the texture colour (TerrainLayer diffuseRemapMax). Legacy GROUND_TINT pulled grass towards #5a6b35.")]
            public Color tint = Color.white;
            [Tooltip("Colour added under the texture (TerrainLayer diffuseRemapMin): pulls a texture towards a hue, e.g. the " +
                     "red sandstone towards wet, mossy Japanese rock.")]
            public Color floor = Color.black;
            [Tooltip("Normal map from this third-party texture instead (own colour variants reuse the original's normals).")]
            public string normalFrom = "";
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
