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
