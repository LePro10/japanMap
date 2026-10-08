using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// One palette texture + material per template material: each new colour gets a texel, so every
    /// stand-in built from boxes (people, traffic) shares one material and draws in one call.
    /// PROVISIONAL helpers until the asset session delivers models.
    /// </summary>
    public sealed class StandInPalette
    {
        public static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        const int Size = 64;
        static readonly Dictionary<Material, StandInPalette> All = new();
        readonly Texture2D _tex;
        readonly List<Color> _colors = new();
        public Material Material { get; }

        // Domain reload may be off: palettes from the last play session hold destroyed textures.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset() => All.Clear();

        StandInPalette(Material template)
        {
            _tex = new Texture2D(Size, 1, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "StandInPalette" };
            Material = new Material(template) { name = "StandIn (palette)", enableInstancing = true };
            Material.SetColor(BaseColor, Color.white);
            Material.SetTexture("_BaseMap", _tex);
        }

        public static StandInPalette For(Material template)
        {
            if (!All.TryGetValue(template, out var p) || p._tex == null) All[template] = p = new StandInPalette(template);
            return p;
        }

        /// <summary>UV of the texel holding <paramref name="c"/> (added on first use).</summary>
        public Vector2 Uv(Color c)
        {
            var i = _colors.IndexOf(c);
            if (i < 0)
            {
                i = Mathf.Min(_colors.Count, Size - 1);
                if (_colors.Count < Size) _colors.Add(c);
                // sRGB texture, like the _BaseColor it replaces: the colour reads the same.
                _tex.SetPixel(i, 0, c);
                _tex.Apply(false);
            }
            return new Vector2((i + 0.5f) / Size, 0.5f);
        }
    }

    /// <summary>Axis-aligned boxes into one mesh, each with a palette UV and (for skinning) a bone.</summary>
    public sealed class BoxMeshBuilder
    {
        readonly List<Vector3> _v = new(), _n = new();
        readonly List<Vector2> _uv = new();
        readonly List<BoneWeight> _w = new();
        readonly List<int> _t = new();

        public void Box(int bone, Vector3 c, Vector3 size, Vector2 uv)
        {
            var h = size * 0.5f;
            void Face(Vector3 n, Vector3 u, Vector3 v)
            {
                var b = _v.Count;
                var o = c + Vector3.Scale(n, h);
                var du = Vector3.Scale(u, h);
                var dv = Vector3.Scale(v, h);
                _v.Add(o - du - dv); _v.Add(o - du + dv); _v.Add(o + du + dv); _v.Add(o + du - dv);
                for (var i = 0; i < 4; i++)
                {
                    _n.Add(n);
                    _uv.Add(uv);
                    _w.Add(new BoneWeight { boneIndex0 = bone, weight0 = 1f });
                }
                // Clockwise seen from outside (cross(u, v) = -n in Unity's left-handed space).
                _t.Add(b); _t.Add(b + 1); _t.Add(b + 2); _t.Add(b); _t.Add(b + 2); _t.Add(b + 3);
            }
            Face(Vector3.up, Vector3.right, Vector3.forward);
            Face(Vector3.down, Vector3.forward, Vector3.right);
            Face(Vector3.forward, Vector3.up, Vector3.right);
            Face(Vector3.back, Vector3.right, Vector3.up);
            Face(Vector3.right, Vector3.forward, Vector3.up);
            Face(Vector3.left, Vector3.up, Vector3.forward);
        }

        public Mesh ToMesh(string name, bool skinned = true)
        {
            var m = new Mesh { name = name };
            m.SetVertices(_v);
            m.SetNormals(_n);
            m.SetUVs(0, _uv);
            if (skinned) m.boneWeights = _w.ToArray();
            m.SetTriangles(_t, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
