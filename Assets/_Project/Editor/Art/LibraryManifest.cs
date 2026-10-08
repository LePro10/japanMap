using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace JapanMap.Editor.Art
{
    /// <summary>ArtSource/exports/manifest.json (written by ArtSource/build.py): one entry per FBX.</summary>
    public sealed class LibraryManifest
    {
        [Serializable]
        public class Light
        {
            public string name;
            public float[] pos;
            public float[] color;
            public float range;
        }

        public class Entry
        {
            public string name, fbx, cls;
            public string[] lods, materials, colliders, switchable, attach;
            public int[] tris;
            public Light[] lights;

            /// <summary>"M_Street_Atlas" → "Street"; M_Glass → null (shared, always allowed).</summary>
            public IEnumerable<string> Atlases => materials.Select(AtlasOf).Where(a => a != null);
        }

        public readonly List<Entry> entries = new();

        public static string AtlasOf(string material) =>
            material.StartsWith("M_") && material.EndsWith("_Atlas") ? material.Substring(2, material.Length - 8) : null;

        /// <summary>The manifest is a JSON object keyed by asset name, which JsonUtility cannot read; split it by hand.</summary>
        public static LibraryManifest Load(string path)
        {
            var text = File.ReadAllText(path);
            var m = new LibraryManifest();
            var i = text.IndexOf('{') + 1;
            while (true)
            {
                var keyStart = text.IndexOf('"', i);
                if (keyStart < 0) break;
                var keyEnd = text.IndexOf('"', keyStart + 1);
                var name = text.Substring(keyStart + 1, keyEnd - keyStart - 1);
                var objStart = text.IndexOf('{', keyEnd);
                var objEnd = MatchBrace(text, objStart);
                var raw = JsonUtility.FromJson<Raw>(text.Substring(objStart, objEnd - objStart + 1));
                m.entries.Add(new Entry
                {
                    name = name, fbx = raw.fbx, cls = raw.@class, lods = raw.lods, tris = raw.tris,
                    materials = raw.materials, colliders = raw.colliders, lights = raw.lights,
                    switchable = raw.switchable, attach = raw.attach,
                });
                i = objEnd + 1;
            }
            return m;
        }

        static int MatchBrace(string s, int open)
        {
            var depth = 0;
            var inString = false;
            for (var k = open; k < s.Length; k++)
            {
                var c = s[k];
                if (inString) { if (c == '\\') k++; else if (c == '"') inString = false; continue; }
                if (c == '"') inString = true;
                else if (c == '{') depth++;
                else if (c == '}' && --depth == 0) return k;
            }
            throw new InvalidDataException("manifest.json: unbalanced braces");
        }

        [Serializable]
        class Raw
        {
            public string fbx, @class;
            public string[] lods, materials, colliders, switchable, attach;
            public int[] tris;
            public Light[] lights;
        }
    }
}
