using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEngine;

namespace JapanMap.Editor.Places
{
    /// <summary>
    /// SourceData/legacy/places/&lt;place&gt;.json, written by Tools/export-places.mjs from the prototype's
    /// layout code. Three coordinates (north = −z, yaw in radians counter-clockwise, front = local +Z);
    /// the helpers here convert to Unity (SourceData/legacy/README.md: (x, y, −z), yaw 180 − deg).
    /// </summary>
    public static class PlaceSource
    {
        public const string Dir = "SourceData/legacy/places";

        [Serializable]
        public class Place
        {
            public string place, title;
            public Anchor anchor;
            public Item[] items = { };
            public Tree[] trees = { };
            public Spawn spawn, walkSpawn;
            [NonSerialized] public bool hasSpawn, hasWalkSpawn;
            /// <summary>Keep vegetation out: (x, z, r) and (minX, minZ, maxX, maxZ), Three coordinates.</summary>
            [NonSerialized] public float[][] clearCircles, clearRects;
        }

        [Serializable] public class Anchor { public float x, z; }
        [Serializable] public class Spawn { public float x, z, yaw; }

        [Serializable]
        public class Item
        {
            public string kind, tag;
            public float x, z, yaw, w, d, h, y;
            [Tooltip("y is a fixed height (quay, deck) instead of the ground.")]
            public bool fixedY;
        }

        [Serializable]
        public class Tree
        {
            public string species;
            public float x, z, scale, yaw;
        }

        public static string PathOf(string source) => Path.GetFullPath(Path.Combine(Application.dataPath, "..", Dir, source + ".json"));

        public static Place Load(string source)
        {
            var raw = File.ReadAllText(PathOf(source));
            var p = JsonUtility.FromJson<Place>(raw);
            p.hasSpawn = raw.Contains("\"spawn\"");
            p.hasWalkSpawn = raw.Contains("\"walkSpawn\"");
            // JsonUtility cannot read arrays of arrays.
            p.clearCircles = Tuples(raw, "clearCircles", 3);
            p.clearRects = Tuples(raw, "clearRects", 4);
            return p;
        }

        static float[][] Tuples(string raw, string key, int n)
        {
            var at = raw.IndexOf($"\"{key}\"", StringComparison.Ordinal);
            if (at < 0) return new float[0][];
            var start = raw.IndexOf('[', at);
            int depth = 0, end = start;
            for (; end < raw.Length; end++)
            {
                if (raw[end] == '[') depth++;
                else if (raw[end] == ']' && --depth == 0) break;
            }
            var list = new List<float[]>();
            foreach (var part in raw.Substring(start + 1, end - start - 1).Split(']'))
            {
                var values = new List<float>();
                foreach (var s in part.Replace("[", "").Split(','))
                    if (float.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) values.Add(v);
                if (values.Count == n) list.Add(values.ToArray());
            }
            return list.ToArray();
        }

        public static Vector3 ToUnity(float x, float z) => new(x, 0, -z);

        /// <summary>Unity yaw (deg) for a legacy yaw (rad); both models face local +Z.</summary>
        public static float Yaw(float legacyYawRad) => 180f - legacyYawRad * Mathf.Rad2Deg;
    }
}
