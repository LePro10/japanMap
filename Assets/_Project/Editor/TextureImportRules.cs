using UnityEditor;

namespace JapanMap.Editor
{
    /// <summary>
    /// Import settings by file-name convention, so no texture depends on a hand-set checkbox:
    /// *_nor_gl → normal map, *_arm → linear data. Web download size: capped at 1024 px, and crunched (D36) — plain
    /// DXT barely shrinks under the build's Brotli, crunched DXT is a fraction on the wire and becomes DXT again on load.
    /// </summary>
    public sealed class TextureImportRules : AssetPostprocessor
    {
        public const int MaxSize = 1024;
        /// <summary>Ground normal maps: relief only, the colour carries the look — half size for the start download (D36).</summary>
        public const int NormalMaxSize = 512;
        /// <summary>Crunch quality 0–100 (Unity's default 50). One knob for the download size of every texture.</summary>
        public const int CrunchQuality = 50;

        void OnPreprocessTexture()
        {
            var polyHaven = assetPath.StartsWith("Assets/ThirdParty/PolyHaven/");
            if (!polyHaven && !assetPath.StartsWith("Assets/_Project/Art/")) return;
            var importer = (TextureImporter)assetImporter;
            if (polyHaven)
            {
                var name = System.IO.Path.GetFileNameWithoutExtension(assetPath);
                if (name.EndsWith("_nor_gl")) importer.textureType = TextureImporterType.NormalMap;
                if (name.EndsWith("_arm")) importer.sRGBTexture = false;
                importer.maxTextureSize = name.EndsWith("_nor_gl") ? NormalMaxSize : MaxSize;
            }
            if (importer.textureCompression == TextureImporterCompression.Uncompressed) return; // UI and data textures stay exact
            importer.crunchedCompression = true;
            importer.compressionQuality = CrunchQuality;
        }
    }
}
