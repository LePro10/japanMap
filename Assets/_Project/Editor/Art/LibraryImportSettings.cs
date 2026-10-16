using UnityEngine;

namespace JapanMap.Editor.Art
{
    /// <summary>
    /// Which models of the asset sprint come into Unity. The sprint (ArtSource/) runs in parallel and
    /// not every style is approved yet: an asset is imported only when every atlas it uses is listed
    /// in <see cref="approvedAtlases"/>. Approving a style later = add its atlas here, run the import
    /// again. The asset is the truth (defaults below only seed a missing asset).
    /// </summary>
    public sealed class LibraryImportSettings : ScriptableObject
    {
        public const string AssetPath = "Assets/_Project/Data/Art/LibraryImport.asset";

        [Tooltip("Asset-sprint export folder (read only), relative to the project folder.")]
        public string sourceDir = "ArtSource/exports";

        [Tooltip("Atlases of approved styles (ArtSource/STATUS.md). M_<Atlas>_Atlas; M_Glass is always allowed.")]
        public string[] approvedAtlases =
            { "Props", "Street", "Nature", "Kura", "Tokyo", "TokyoSigns", "Koedo", "KoedoShop", "Kiso", "KisoShop", "Figures", "Traffic", "Details" };

        [Tooltip("Single assets to leave out even if their style is approved.")]
        public string[] excluded = { };

        [Header("LOD (screen-relative height where the level ends)")]
        [Tooltip("Where the middle level ends when a model has _LOD2 (trees, towers).")]
        public float propLod1 = 0.035f;
        public float buildingLod1 = 0.07f;
        public float propLod0 = 0.12f;
        public float propCull = 0.012f;
        public float buildingLod0 = 0.22f;
        public float buildingCull = 0.02f;

        [Header("Lights from LIGHT_ markers")]
        [Tooltip("Point light intensity for LIGHT_ markers without unity_intensity. Measured against the lit road.")]
        public float lightIntensity = 1.5f;
        [Tooltip("Objects lower than this cast no shadow (draw calls: the shadow pass doubles them).")]
        public float shadowMinHeight = 2.5f;

        [Header("Emission")]
        [Tooltip("Multiplier on the emission atlas (HDR). Set against a measured reference in the final image.")]
        public float emissionStrength = 2f;
        [Tooltip("Emission of the Tokyo sign atlas: neon tubes and light boxes must cross the bloom threshold (legacy " +
                 "neonEmissive 5.5 with bloom threshold 1.05).")]
        public float signEmission = 5f;
        [Tooltip("Emission of the shop atlases (lanterns, noren lights, shop signs).")]
        public float shopEmission = 3f;

        public float EmissionFor(string atlas) =>
            atlas == "TokyoSigns" ? signEmission : atlas.EndsWith("Shop") ? shopEmission : emissionStrength;
    }
}
