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
