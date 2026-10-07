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
        public class River
        {
            public float[] centerline; // flat x, y, z (Three coordinates)
            public float[] halfWidths;
        }

        [Serializable]
        public class Roads
        {
            public float sampleSpacing;
            public Road[] roads;
        }

        [Serializable]
        public class Road
        {
            public string id, type;
            public bool closed;
            public string[] tags;
            public float[] centerline; // flat x, y, z (Three coordinates), sampleSpacing apart
            public float[] widths, banking;
            public float length, trimStart, trimEnd;
            public Junction[] junctions;
            public Rail[] rails;
            [Serializable] public class Junction { public string at, with; public float trim; }
            [Serializable] public class Rail { public int side; public float from, to; }
        }

        public static void MirrorVertices(System.Collections.Generic.List<Vector3> vertices)
        {
            for (var i = 0; i < vertices.Count; i++) vertices[i] = ToUnity(vertices[i].x, vertices[i].y, vertices[i].z);
        }

        /// <summary>
        /// Mirroring z flips the handedness of every triangle; without swapping two indices each
        /// face built in Three coordinates would face away (and be culled) in Unity.
        /// </summary>
        public static void FlipWinding(System.Collections.Generic.List<int> triangles)
        {
            for (var i = 0; i < triangles.Count; i += 3) (triangles[i + 1], triangles[i + 2]) = (triangles[i + 2], triangles[i + 1]);
        }

        [Serializable]
        public class Checkpoints
        {
            public Point[] points;
            [Serializable] public class Point { public string name; public Vec2 unity; public float heightM; }
        }
    }
}
