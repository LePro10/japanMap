using System;
using System.IO;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Reads the legacy export under SourceData/legacy (see the README there for the axes).
    /// Three.js is right-handed with north = -Z; Unity is left-handed with north = +Z.
    /// </summary>
    public static class LegacySource
    {
        public static Vector3 ToUnity(float x, float y, float z) => new(x, y, -z);

        public static string PathOf(MapImportSettings settings, string relative) =>
            Path.Combine(settings.sourceDir, relative);

        public static T ReadJson<T>(MapImportSettings settings, string relative)
        {
            var path = PathOf(settings, relative);
            if (!File.Exists(path)) throw new FileNotFoundException($"legacy source missing: {path}");
            return JsonUtility.FromJson<T>(File.ReadAllText(path));
        }

        [Serializable] public class Vec3 { public float x, y, z; }
        [Serializable] public class Vec2 { public float x, z; }

        [Serializable]
        public class TerrainInfo
        {
            public string file;
            public ImportInfo import;
            public Vec3 terrainSize;
            public Vec3 unityTerrainPosition;
            [Serializable] public class ImportInfo { public int resolution; public bool flipVertically; }
        }

        [Serializable]
        public class Checkpoints
        {
            public Point[] points;
            [Serializable] public class Point { public string name; public Vec2 unity; public float heightM; }
        }
    }
}
