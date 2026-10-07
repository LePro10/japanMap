using UnityEditor;

namespace JapanMap.Editor
{
    /// <summary>
    /// Import settings by file-name convention, so no texture depends on a hand-set checkbox:
    /// *_nor_gl → normal map, *_arm → linear data. Web download size: capped at 1024 px.
    /// </summary>
    public sealed class TextureImportRules : AssetPostprocessor
    {
        public const int MaxSize = 1024;

        void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith("Assets/ThirdParty/PolyHaven/")) return;
            var importer = (TextureImporter)assetImporter;
            var name = System.IO.Path.GetFileNameWithoutExtension(assetPath);
            if (name.EndsWith("_nor_gl")) importer.textureType = TextureImporterType.NormalMap;
            if (name.EndsWith("_arm")) importer.sRGBTexture = false;
            importer.maxTextureSize = MaxSize;
        }
    }
}
