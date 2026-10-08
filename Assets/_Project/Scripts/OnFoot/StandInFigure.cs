using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// PROVISIONAL stand-in person (no model in the library yet — STATUS "Für die Asset-Sitzung").
    /// Boxes for head, torso, arms and legs, built as ONE skinned mesh whose bones are the limb
    /// pivots, coloured from a shared palette texture: one renderer and one material for every
    /// figure. Six separate primitives cost ~550 draw calls for 48 pedestrians (measured in Tokyo).
    /// Shared by the player and the pedestrians; replaced by a skinned model from the asset session.
    /// </summary>
    public sealed class StandInFigure : MonoBehaviour
    {
        Transform _body, _legL, _legR, _armL, _armR;
        float _height = 1.72f;

        /// <summary>
        /// Build a figure of <paramref name="height"/> m under <paramref name="parent"/>, feet at its origin.
        /// Colours come from the materials' base colours; <paramref name="skin"/> is the shader template.
        /// </summary>
        public static StandInFigure Build(Transform parent, float height, Material skin, Material top, Material bottom)
        {
            var root = new GameObject("StandIn (provisional)");
            root.transform.SetParent(parent, false);
            var f = root.AddComponent<StandInFigure>();
            f._height = height;
            var k = height / 1.72f;
            f._body = Bone("Hips", root.transform, new Vector3(0f, 0.92f, 0f) * k);
            f._armL = Bone("ArmL", f._body, new Vector3(-0.29f, 0.56f, 0f) * k);
            f._armR = Bone("ArmR", f._body, new Vector3(0.29f, 0.56f, 0f) * k);
            f._legL = Bone("LegL", f._body, new Vector3(-0.11f, 0f, 0f) * k);
            f._legR = Bone("LegR", f._body, new Vector3(0.11f, 0f, 0f) * k);

            var palette = Palette.For(skin);
            var cSkin = palette.Uv(skin.GetColor(BaseColor));
            var cTop = palette.Uv(top.GetColor(BaseColor));
            var cBottom = palette.Uv(bottom.GetColor(BaseColor));
            var mesh = new MeshBuilder();
            // Positions in the figure's root space at bind pose; bone index per box.
            mesh.Box(0, new Vector3(0f, 0.92f + 0.3f, 0f) * k, new Vector3(0.44f, 0.6f, 0.26f) * k, cTop);
            mesh.Box(0, new Vector3(0f, 0.92f + 0.74f, 0.01f) * k, new Vector3(0.22f, 0.25f, 0.24f) * k, cSkin);
            mesh.Box(1, new Vector3(-0.29f, 0.92f + 0.56f - 0.3f, 0f) * k, new Vector3(0.12f, 0.6f, 0.12f) * k, cTop);
            mesh.Box(2, new Vector3(0.29f, 0.92f + 0.56f - 0.3f, 0f) * k, new Vector3(0.12f, 0.6f, 0.12f) * k, cTop);
            mesh.Box(3, new Vector3(-0.11f, 0.92f - 0.45f, 0f) * k, new Vector3(0.17f, 0.9f, 0.18f) * k, cBottom);
            mesh.Box(4, new Vector3(0.11f, 0.92f - 0.45f, 0f) * k, new Vector3(0.17f, 0.9f, 0.18f) * k, cBottom);

            var bones = new[] { f._body, f._armL, f._armR, f._legL, f._legR };
            var m = mesh.ToMesh();
            var bind = new Matrix4x4[bones.Length];
            for (var i = 0; i < bones.Length; i++) bind[i] = bones[i].worldToLocalMatrix * root.transform.localToWorldMatrix;
            m.bindposes = bind;
            var smr = root.AddComponent<SkinnedMeshRenderer>();
            smr.sharedMesh = m;
            smr.bones = bones;
            smr.rootBone = root.transform;
            smr.sharedMaterial = palette.Material;
            smr.quality = SkinQuality.Bone1;
            smr.localBounds = new Bounds(new Vector3(0f, 0.9f, 0f) * k, new Vector3(2.2f, 2.2f, 2.2f) * k);
            smr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            return f;
        }

        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");

        static Transform Bone(string name, Transform parent, Vector3 localPos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = localPos;
            return t;
        }

        /// <summary>
        /// Pose for this frame. <paramref name="cycle"/> = metres walked, <paramref name="gait"/> 0…1
        /// (stand…run), <paramref name="slide"/> 0…1, <paramref name="air"/> = in the air.
        /// </summary>
        public void Pose(float cycle, float gait, float lean, float slide, bool air)
        {
            var k = _height / 1.72f;
            // One full leg cycle per two steps of ~0.75 m (legacy bob period).
            var phase = cycle * (Mathf.PI / 0.75f) / k;
            var swing = Mathf.Sin(phase) * Mathf.Lerp(0f, 38f, gait);
            if (air) swing = 0f;
            var tuck = air ? 25f : 0f;
            _legL.localRotation = Quaternion.Euler(swing - tuck, 0f, 0f);
            _legR.localRotation = Quaternion.Euler(-swing - tuck * 0.4f, 0f, 0f);
            _armL.localRotation = Quaternion.Euler(-swing * 0.8f, 0f, -6f);
            _armR.localRotation = Quaternion.Euler(swing * 0.8f, 0f, 6f);

            // Run: lean into the stride. Slide: lie back, hips down, one leg forward (Fortnite slide).
            var bodyPitch = lean * 9f * (1f - slide) - 52f * slide;
            _body.localRotation = Quaternion.Euler(bodyPitch, 0f, 0f);
            _body.localPosition = new Vector3(0f, Mathf.Lerp(0.92f, 0.42f, slide) * k, 0f);
            if (slide > 0.01f)
            {
                _legL.localRotation = Quaternion.Slerp(_legL.localRotation, Quaternion.Euler(-40f, 0f, 0f), slide);
                _legR.localRotation = Quaternion.Slerp(_legR.localRotation, Quaternion.Euler(-10f, 0f, 0f), slide);
                _armL.localRotation = Quaternion.Slerp(_armL.localRotation, Quaternion.Euler(30f, 0f, -40f), slide);
                _armR.localRotation = Quaternion.Slerp(_armR.localRotation, Quaternion.Euler(-60f, 0f, 20f), slide);
            }
        }

        /// <summary>One palette texture + material per template: each new colour gets a texel.</summary>
        sealed class Palette
        {
            const int Size = 64;
            static readonly Dictionary<Material, Palette> All = new();
            readonly Texture2D _tex;
            readonly List<Color> _colors = new();
            public Material Material { get; }

            // Domain reload may be off: palettes from the last play session hold destroyed textures.
            [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
            static void Reset() => All.Clear();

            Palette(Material template)
            {
                _tex = new Texture2D(Size, 1, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "StandInPalette" };
                Material = new Material(template) { name = "StandIn (palette)", enableInstancing = true };
                Material.SetColor(BaseColor, Color.white);
                Material.SetTexture("_BaseMap", _tex);
            }

            public static Palette For(Material template)
            {
                if (!All.TryGetValue(template, out var p) || p._tex == null) All[template] = p = new Palette(template);
                return p;
            }

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

        sealed class MeshBuilder
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
                    _t.Add(b); _t.Add(b + 1); _t.Add(b + 2); _t.Add(b); _t.Add(b + 2); _t.Add(b + 3);
                }
                Face(Vector3.up, Vector3.right, Vector3.forward);
                Face(Vector3.down, Vector3.forward, Vector3.right);
                Face(Vector3.forward, Vector3.up, Vector3.right);
                Face(Vector3.back, Vector3.right, Vector3.up);
                Face(Vector3.right, Vector3.forward, Vector3.up);
                Face(Vector3.left, Vector3.up, Vector3.forward);
            }

            public Mesh ToMesh()
            {
                var m = new Mesh { name = "StandInFigure" };
                m.SetVertices(_v);
                m.SetNormals(_n);
                m.SetUVs(0, _uv);
                m.boneWeights = _w.ToArray();
                m.SetTriangles(_t, 0);
                m.RecalculateBounds();
                return m;
            }
        }
    }
}
