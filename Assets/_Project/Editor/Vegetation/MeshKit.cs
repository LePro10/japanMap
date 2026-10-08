using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Editor.Vegetation
{
    /// <summary>
    /// Small mesh builder for the interim vegetation: trunks, displaced foliage blobs, cones, blades.
    /// Colour comes from a palette texture (one cell per colour, UV at the cell centre), like the
    /// style kit's atlas cells. Foliage normals point away from the crown centre so a crown shades
    /// as one soft volume instead of facets.
    /// </summary>
    public sealed class MeshKit
    {
        readonly List<Vector3> _v = new();
        readonly List<Vector3> _n = new();
        readonly List<Vector2> _uv = new();
        readonly List<int> _t = new();
        public int Triangles => _t.Count / 3;

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name };
            if (_v.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(_v);
            m.SetNormals(_n);
            m.SetUVs(0, _uv);
            m.SetTriangles(_t, 0);
            m.RecalculateBounds();
            return m;
        }

        int Add(Vector3 p, Vector3 n, Vector2 uv)
        {
            _v.Add(p); _n.Add(n.normalized); _uv.Add(uv);
            return _v.Count - 1;
        }

        void Tri(int a, int b, int c) { _t.Add(a); _t.Add(b); _t.Add(c); }

        /// <summary>Tapered, slightly bent cylinder from <paramref name="a"/> to <paramref name="b"/>; no caps (hidden in crown/ground).</summary>
        public void Tube(Vector3 a, Vector3 b, float r0, float r1, int sides, Vector2 uv, int segments = 1, Vector3 bend = default)
        {
            var axis = (b - a).normalized;
            var side = Vector3.Cross(axis, Mathf.Abs(axis.y) > 0.9f ? Vector3.right : Vector3.up).normalized;
            var up = Vector3.Cross(side, axis);
            var rings = new int[segments + 1, sides];
            for (var s = 0; s <= segments; s++)
            {
                var f = s / (float)segments;
                var c = Vector3.Lerp(a, b, f) + bend * Mathf.Sin(f * Mathf.PI);
                var r = Mathf.Lerp(r0, r1, f);
                for (var k = 0; k < sides; k++)
                {
                    var ang = k * Mathf.PI * 2 / sides;
                    var dir = side * Mathf.Cos(ang) + up * Mathf.Sin(ang);
                    rings[s, k] = Add(c + dir * r, dir, uv);
                }
            }
            for (var s = 0; s < segments; s++)
            for (var k = 0; k < sides; k++)
            {
                var k2 = (k + 1) % sides;
                Tri(rings[s, k], rings[s + 1, k], rings[s + 1, k2]);
                Tri(rings[s, k], rings[s + 1, k2], rings[s, k2]);
            }
        }

        /// <summary>
        /// Noisy ellipsoid around <paramref name="center"/>. <paramref name="detail"/> 0 = 20, 1 = 80, 2 = 320 triangles.
        /// Normals blend between the crown direction (from <paramref name="crown"/>) and the blob's own.
        /// </summary>
        public void Blob(Vector3 center, Vector3 radii, int detail, float noise, int seed, Vector2 uv, Vector3 crown, float flatBottom = 0.35f)
        {
            Icosphere(detail, out var verts, out var tris);
            var idx = new int[verts.Count];
            for (var i = 0; i < verts.Count; i++)
            {
                var d = verts[i];
                var n = 1 + noise * (Noise(d * 2.3f + Vector3.one * seed) - 0.5f) * 2;
                var p = Vector3.Scale(d * n, radii);
                if (p.y < -radii.y * flatBottom) p.y = Mathf.Lerp(p.y, -radii.y * flatBottom, 0.7f);
                var world = center + p;
                var normal = Vector3.Lerp((world - crown).normalized, d, 0.35f);
                idx[i] = Add(world, normal, uv);
            }
            for (var i = 0; i < tris.Count; i += 3) Tri(idx[tris[i]], idx[tris[i + 1]], idx[tris[i + 2]]);
        }

        /// <summary>Hanging cone (cedar tier): ring at <paramref name="baseY"/> with radius r, apex above.</summary>
        public void Cone(Vector3 basePos, float radius, float height, int sides, float noise, int seed, Vector2 uv, Vector3 crown, float droop = 0.25f)
        {
            var apex = Add(basePos + Vector3.up * height, Vector3.up, uv);
            var ring = new int[sides];
            var inner = new int[sides];
            for (var k = 0; k < sides; k++)
            {
                var ang = (k + seed * 0.37f) * Mathf.PI * 2 / sides;
                var dir = new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang));
                var r = radius * (1 + noise * (Noise(dir * 3 + Vector3.one * seed) - 0.5f) * 2);
                var p = basePos + dir * r - Vector3.up * height * droop;
                ring[k] = Add(p, Vector3.Lerp((p - crown).normalized, dir + Vector3.up * 0.4f, 0.4f), uv);
                inner[k] = Add(basePos + dir * r * 0.35f + Vector3.up * height * 0.05f, Vector3.Lerp((p - crown).normalized, Vector3.down, 0.5f), uv);
            }
            for (var k = 0; k < sides; k++)
            {
                var k2 = (k + 1) % sides;
                Tri(apex, ring[k2], ring[k]);
                Tri(ring[k], ring[k2], inner[k2]); // underside so the tier has thickness from below
                Tri(ring[k], inner[k2], inner[k]);
            }
        }

        /// <summary>A blade or leaf card: tapered quad from base to tip, both faces.</summary>
        public void Blade(Vector3 basePos, Vector3 tip, float width, Vector2 uvBase, Vector2 uvTip)
        {
            var dir = (tip - basePos).normalized;
            var side = Vector3.Cross(dir, Vector3.up);
            if (side.sqrMagnitude < 1e-4f) side = Vector3.right;
            side = side.normalized * width * 0.5f;
            var normal = Vector3.Cross(side, dir).normalized + Vector3.up;
            var a = Add(basePos - side, normal, uvBase);
            var b = Add(basePos + side, normal, uvBase);
            var c = Add(tip, normal, uvTip);
            Tri(a, c, b);
            var a2 = Add(basePos - side, -normal + Vector3.up * 2, uvBase);
            var b2 = Add(basePos + side, -normal + Vector3.up * 2, uvBase);
            var c2 = Add(tip, -normal + Vector3.up * 2, uvTip);
            Tri(a2, b2, c2);
        }

        public static float Noise(Vector3 p) =>
            (Mathf.PerlinNoise(p.x + 13.1f, p.y + 7.7f) + Mathf.PerlinNoise(p.y + 3.3f, p.z + 19.9f) + Mathf.PerlinNoise(p.z + 29.4f, p.x + 5.2f)) / 3f;

        static readonly Dictionary<int, (List<Vector3>, List<int>)> Spheres = new();

        static void Icosphere(int detail, out List<Vector3> verts, out List<int> tris)
        {
            if (Spheres.TryGetValue(detail, out var cached)) { (verts, tris) = cached; return; }
            var t = (1 + Mathf.Sqrt(5)) / 2;
            verts = new List<Vector3>
            {
                new(-1, t, 0), new(1, t, 0), new(-1, -t, 0), new(1, -t, 0), new(0, -1, t), new(0, 1, t),
                new(0, -1, -t), new(0, 1, -t), new(t, 0, -1), new(t, 0, 1), new(-t, 0, -1), new(-t, 0, 1),
            };
            for (var i = 0; i < verts.Count; i++) verts[i] = verts[i].normalized;
            tris = new List<int> { 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
                3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 };
            for (var d = 0; d < detail; d++)
            {
                var mid = new Dictionary<long, int>();
                var vs = verts;
                int Mid(int a, int b)
                {
                    var key = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
                    if (mid.TryGetValue(key, out var m)) return m;
                    vs.Add(((vs[a] + vs[b]) / 2).normalized);
                    return mid[key] = vs.Count - 1;
                }
                var next = new List<int>();
                for (var i = 0; i < tris.Count; i += 3)
                {
                    int a = tris[i], b = tris[i + 1], c = tris[i + 2];
                    int ab = Mid(a, b), bc = Mid(b, c), ca = Mid(c, a);
                    next.AddRange(new[] { a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca });
                }
                tris = next;
            }
            Spheres[detail] = (verts, tris);
        }
    }
}
