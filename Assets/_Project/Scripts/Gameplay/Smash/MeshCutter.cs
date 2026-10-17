using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Gameplay.Smash
{
    /// <summary>
    /// Cuts a broken thing's own mesh (D47): across at a height — a trunk snaps at the bumper, a lamp post kinks — or
    /// into slices along its length — a bench or a rack bursts into planks. Faces go to the side their centre is on, so
    /// the cut follows the model's own edges (a ragged break, no new holes to fill); a tree's cut gets a splintered ring
    /// of fresh wood on both pieces. Results are cached per mesh and height step, so a forest of the same tree costs
    /// once. Needs readable meshes (LibraryModelRules.Breakable).
    /// </summary>
    public static class MeshCutter
    {
        public sealed class Cut
        {
            public Mesh below, above;
            /// <summary>Trunk centre and radius at the cut, mesh space.</summary>
            public Vector3 centre;
            public float radius;
            public float height;
        }

        const float Step = 0.1f; // m: cuts are cached per height step
        static readonly Dictionary<(Mesh, int, bool), Cut> Cuts = new();
        static readonly Dictionary<(Mesh, int), Mesh[]> Sliced = new();
        static readonly List<(Mesh, int, bool)> Order = new();

        /// <summary>Cached cuts at most (a tree's top is nearly the whole tree: ~0.4 MB each); the oldest unused goes.</summary>
        public const int MaxCuts = 24;
        /// <summary>Asked before a cached piece is destroyed: is it still shown (a stump, a falling top)?</summary>
        public static System.Func<Mesh, bool> InUse;
        public static int CachedCuts => Cuts.Count;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Cuts.Clear();
            Sliced.Clear();
            Order.Clear();
            InUse = null;
        }

        /// <summary>
        /// The mesh cut at <paramref name="height"/> m above its origin (its foot). <paramref name="splinters"/>: a ragged ring
        /// of fresh wood as an extra sub-mesh on both pieces (its UV from <paramref name="woodUv"/>, a palette texel).
        /// </summary>
        public static bool TryCut(Mesh mesh, float height, bool splinters, Vector2 woodUv, out Cut cut)
        {
            cut = null;
            if (mesh == null || !mesh.isReadable) return false;
            var step = Mathf.Max(1, Mathf.RoundToInt(height / Step));
            if (Cuts.TryGetValue((mesh, step, splinters), out cut)) return cut != null;
            var h = step * Step;
            var v = mesh.vertices;
            var n = mesh.normals;
            var uv = mesh.uv;
            if (n.Length != v.Length) n = new Vector3[v.Length];
            if (uv.Length != v.Length) uv = new Vector2[v.Length];
            var below = new Builder(mesh.subMeshCount + (splinters ? 1 : 0), v.Length);
            // The top keeps nearly all of the tree: it shares the original vertex list as is (copying 10 000 vertices one
            // by one through a map cost ~4 ms on the first break of a kind).
            var above = new Builder(mesh.subMeshCount + (splinters ? 1 : 0), v, n, uv);
            // Faces across the cut are clipped into a lower and an upper part (a low-poly trunk has one ring of faces
            // from the root to the fork: sorting whole faces left no stump). Where edges cross the cut is the section.
            var section = new List<Vector3>();
            for (var s = 0; s < mesh.subMeshCount; s++)
            {
                var t = mesh.GetTriangles(s);
                for (var k = 0; k < t.Length; k += 3)
                {
                    int a = t[k], b = t[k + 1], c = t[k + 2];
                    float ya = v[a].y, yb = v[b].y, yc = v[c].y;
                    if (ya < h && yb < h && yc < h) { below.Tri(s, a, b, c, v, n, uv); continue; }
                    if (ya >= h && yb >= h && yc >= h) { above.Tri(s, a, b, c, v, n, uv); continue; }
                    Clip(s, a, b, c, h, v, n, uv, below, above, section);
                }
            }
            // The trunk at the cut: section points near the axis (hanging willow strands farther out are cut too, but are not the trunk).
            var sum = Vector3.zero;
            var count = 0;
            foreach (var p in section)
                if (p.x * p.x + p.z * p.z < 0.9f * 0.9f) { sum += p; count++; }
            if (count < 3)
            {
                Cuts[(mesh, step, splinters)] = null;
                return false;
            }
            var centre = sum / count;
            centre.y = h;
            var radius = 0f;
            foreach (var p in section)
                if (p.x * p.x + p.z * p.z < 0.9f * 0.9f)
                    radius = Mathf.Max(radius, new Vector2(p.x - centre.x, p.z - centre.z).magnitude);
            radius = Mathf.Clamp(radius, 0.04f, 0.8f);
            if (splinters)
            {
                Splinters(below, mesh.subMeshCount, centre, radius, up: true, woodUv, mesh.GetHashCode());
                Splinters(above, mesh.subMeshCount, centre, radius, up: false, woodUv, mesh.GetHashCode() + 1);
            }
            cut = new Cut { below = below.ToMesh(mesh.name + " (stump)"), above = above.ToMesh(mesh.name + " (top)"), centre = centre, radius = radius, height = h };
            Cuts[(mesh, step, splinters)] = cut;
            Order.Add((mesh, step, splinters));
            Evict();
            return true;
        }

        /// <summary>Runs every path once on a small box (the editor compiles code on first use: the first real break paid ~4 ms for it).</summary>
        public static void Warm()
        {
            var b = new JapanMap.Core.BoxMeshBuilder();
            b.Box(0, new Vector3(0f, 0.5f, 0f), new Vector3(0.3f, 1f, 0.3f), Vector2.zero);
            var m = b.ToMesh("CutterWarm", skinned: false);
            TryCut(m, 0.5f, true, Vector2.zero, out _);
            TrySlices(m, 2, out _);
            Cuts.Clear();
            Sliced.Clear();
            Order.Clear();
            Object.Destroy(m);
        }

        /// <summary>The mesh in <paramref name="count"/> slices along its longest horizontal axis (planks of a bench, a rack).</summary>
        public static bool TrySlices(Mesh mesh, int count, out Mesh[] slices)
        {
            slices = null;
            if (mesh == null || !mesh.isReadable || count < 2) return false;
            if (Sliced.TryGetValue((mesh, count), out slices)) return slices != null;
            var b = mesh.bounds;
            var axis = b.size.x >= b.size.z ? 0 : 2;
            var lo = b.min[axis];
            var len = Mathf.Max(1e-3f, b.size[axis]);
            var v = mesh.vertices;
            var n = mesh.normals;
            var uv = mesh.uv;
            var parts = new Builder[count];
            for (var i = 0; i < count; i++) parts[i] = new Builder(mesh.subMeshCount, v.Length);
            for (var s = 0; s < mesh.subMeshCount; s++)
            {
                var t = mesh.GetTriangles(s);
                for (var k = 0; k < t.Length; k += 3)
                {
                    var c = (v[t[k]][axis] + v[t[k + 1]][axis] + v[t[k + 2]][axis]) / 3f;
                    var i = Mathf.Clamp((int)((c - lo) / len * count), 0, count - 1);
                    parts[i].Tri(s, t[k], t[k + 1], t[k + 2], v, n, uv);
                }
            }
            var list = new List<Mesh>();
            for (var i = 0; i < count; i++)
                if (parts[i].Faces > 0) list.Add(parts[i].ToMesh($"{mesh.name} ({i + 1}/{count})"));
            slices = list.Count >= 2 ? list.ToArray() : null;
            Sliced[(mesh, count)] = slices;
            return slices != null;
        }

        static void Evict()
        {
            for (var i = 0; i < Order.Count && Cuts.Count > MaxCuts; i++)
            {
                var key = Order[i];
                if (!Cuts.TryGetValue(key, out var c) || c == null) { Order.RemoveAt(i--); continue; }
                if (InUse != null && (InUse(c.below) || InUse(c.above))) continue;
                Object.Destroy(c.below);
                Object.Destroy(c.above);
                Cuts.Remove(key);
                Order.RemoveAt(i--);
            }
        }

        /// <summary>Already cut at this height step (precomputing in idle frames skips these).</summary>
        public static bool Has(Mesh mesh, float height, bool splinters) =>
            Cuts.ContainsKey((mesh, Mathf.Max(1, Mathf.RoundToInt(height / Step)), splinters));

        /// <summary>One face across the plane y = h, split into the polygon below and the one above (fans), new vertices on the edges.</summary>
        static void Clip(int sub, int a, int b, int c, float h, Vector3[] v, Vector3[] n, Vector2[] uv, Builder below, Builder above, List<Vector3> section)
        {
            var lo = Lo;
            var hi = Hi;
            lo.Clear();
            hi.Clear();
            for (var k = 0; k < 3; k++)
            {
                var i = k == 0 ? a : k == 1 ? b : c;
                var j = k == 0 ? b : k == 1 ? c : a;
                var pi = (v[i], n[i], uv[i]);
                if (v[i].y < h) lo.Add(pi); else hi.Add(pi);
                var si = v[i].y - h;
                var sj = v[j].y - h;
                if ((si < 0f) == (sj < 0f)) continue;
                var f = si / (si - sj);
                var x = (Vector3.Lerp(v[i], v[j], f), Vector3.Lerp(n[i], n[j], f).normalized, Vector2.Lerp(uv[i], uv[j], f));
                lo.Add(x);
                hi.Add(x);
                section.Add(x.Item1);
            }
            below.Polygon(sub, lo);
            above.Polygon(sub, hi);
        }

        static readonly List<(Vector3 p, Vector3 n, Vector2 uv)> Lo = new(4), Hi = new(4);

        /// <summary>A ring of jagged wood spikes and a rough disc at the break, pointing up (stump) or down (the falling top).</summary>
        static void Splinters(Builder b, int sub, Vector3 c, float r, bool up, Vector2 uv, int seed)
        {
            var rng = new System.Random(seed);
            float R(float a, float z) => a + (float)rng.NextDouble() * (z - a);
            const int spikes = 14;
            var dir = up ? 1f : -1f;
            var ring = new Vector3[spikes];
            for (var k = 0; k < spikes; k++)
            {
                var a = k * Mathf.PI * 2f / spikes;
                ring[k] = c + new Vector3(Mathf.Cos(a) * r * 1.02f, -dir * 0.02f, Mathf.Sin(a) * r * 1.02f);
            }
            // The broken face: a rough disc a little inside the bark.
            var mid = c + Vector3.up * (dir * r * 0.15f);
            for (var k = 0; k < spikes; k++)
            {
                var a = ring[k];
                var bb = ring[(k + 1) % spikes];
                b.Raw(sub, mid, bb, a, uv);
                b.Raw(sub, mid, a, bb, uv); // both faces: whichever way the piece lies, the wood shows
            }
            // Spikes: long fibres torn out of the rim, some leaning in.
            for (var k = 0; k < spikes; k++)
            {
                var a = ring[k];
                var bb = ring[(k + 1) % spikes];
                var m = (a + bb) * 0.5f;
                // Fibres a hand long, longer on a thick trunk — not stakes (0.8 m on a cherry looked like a fence).
                var tip = Vector3.Lerp(m, c, R(0.1f, 0.6f)) + Vector3.up * dir * R(0.05f, 0.24f) * (0.6f + r);
                // Both faces: a fibre is seen from inside and out.
                b.Raw(sub, a, bb, tip, uv);
                b.Raw(sub, bb, a, tip, uv);
            }
        }

        sealed class Builder
        {
            readonly List<Vector3> _v;
            readonly List<Vector3> _n;
            readonly List<Vector2> _uv;
            readonly List<int>[] _t;
            readonly int[] _map; // original index → new, -1 = not yet (null: the original list is kept as is)

            public int Faces { get; private set; }

            /// <summary>A part that takes original vertices as they are used.</summary>
            public Builder(int subMeshes, int originalCount)
            {
                _t = new List<int>[subMeshes];
                for (var i = 0; i < subMeshes; i++) _t[i] = new List<int>();
                _v = new List<Vector3>();
                _n = new List<Vector3>();
                _uv = new List<Vector2>();
                _map = new int[originalCount];
                for (var i = 0; i < _map.Length; i++) _map[i] = -1;
            }

            /// <summary>A part that keeps the whole original vertex list (most of the mesh goes to it).</summary>
            public Builder(int subMeshes, Vector3[] v, Vector3[] n, Vector2[] uv)
            {
                _t = new List<int>[subMeshes];
                for (var i = 0; i < subMeshes; i++) _t[i] = new List<int>();
                _v = new List<Vector3>(v);
                _n = new List<Vector3>(n);
                _uv = new List<Vector2>(uv);
            }

            public void Tri(int sub, int a, int b, int c, Vector3[] v, Vector3[] n, Vector2[] uv)
            {
                _t[sub].Add(Index(a, v, n, uv));
                _t[sub].Add(Index(b, v, n, uv));
                _t[sub].Add(Index(c, v, n, uv));
                Faces++;
            }

            int Index(int i, Vector3[] v, Vector3[] n, Vector2[] uv)
            {
                if (_map == null) return i;
                if (_map[i] >= 0) return _map[i];
                var at = _v.Count;
                _v.Add(v[i]);
                _n.Add(n.Length > i ? n[i] : Vector3.up);
                _uv.Add(uv.Length > i ? uv[i] : Vector2.zero);
                _map[i] = at;
                return at;
            }

            /// <summary>A convex polygon of new vertices (a clipped face), as a fan.</summary>
            public void Polygon(int sub, List<(Vector3 p, Vector3 n, Vector2 uv)> poly)
            {
                if (poly.Count < 3) return;
                var start = _v.Count;
                foreach (var q in poly)
                {
                    _v.Add(q.p);
                    _n.Add(q.n);
                    _uv.Add(q.uv);
                }
                for (var k = 1; k < poly.Count - 1; k++)
                {
                    _t[sub].Add(start);
                    _t[sub].Add(start + k);
                    _t[sub].Add(start + k + 1);
                    Faces++;
                }
            }

            /// <summary>A face of new geometry (flat-shaded).</summary>
            public void Raw(int sub, Vector3 a, Vector3 b, Vector3 c, Vector2 uv)
            {
                var n = Vector3.Cross(b - a, c - a).normalized;
                foreach (var p in new[] { a, b, c })
                {
                    _t[sub].Add(_v.Count);
                    _v.Add(p);
                    _n.Add(n);
                    _uv.Add(uv);
                }
                Faces++;
            }

            public Mesh ToMesh(string name)
            {
                var m = new Mesh { name = name };
                if (_v.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                m.SetVertices(_v);
                m.SetNormals(_n);
                m.SetUVs(0, _uv);
                m.subMeshCount = _t.Length;
                for (var i = 0; i < _t.Length; i++) m.SetTriangles(_t[i], i, false);
                m.RecalculateBounds();
                m.UploadMeshData(true); // GPU only: nothing reads these again
                return m;
            }
        }
    }
}
