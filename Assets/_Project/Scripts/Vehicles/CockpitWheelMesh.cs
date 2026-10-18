using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Steering wheels built in code for the cockpit view (D51): a round wood-and-leather wheel, a sport wheel with a flat
    /// bottom and a top marker, and a formula yoke with grips, a screen bay, coloured knobs and shift paddles. One mesh,
    /// three sub-meshes (grip, trim, accent) — three draw calls, no download. Local frame: X right, Y up, −Z towards
    /// the driver (the face looks down −Z); the wheel turns about Z.
    /// </summary>
    public static class CockpitWheelMesh
    {
        public const int Grip = 0, Trim = 1, Accent = 2;

        /// <summary>Where the hands hold, in the wheel's frame (left, right).</summary>
        public static Vector3[] Hands(CockpitWheel kind, float size)
        {
            var r = size * 0.5f;
            if (kind == CockpitWheel.Formula) return new[] { new Vector3(-r * 0.86f, -r * 0.05f, -0.02f), new Vector3(r * 0.86f, -r * 0.05f, -0.02f) };
            var a = (kind == CockpitWheel.Sport ? 75f : 60f) * Mathf.Deg2Rad; // "quarter to three" / "ten to two"
            return new[] { new Vector3(-Mathf.Sin(a) * r, Mathf.Cos(a) * r, 0f), new Vector3(Mathf.Sin(a) * r, Mathf.Cos(a) * r, 0f) };
        }

        public static Mesh Build(CockpitWheel kind, float size)
        {
            var b = new Builder();
            var r = size * 0.5f;
            switch (kind)
            {
                case CockpitWheel.Formula: Formula(b, r); break;
                case CockpitWheel.Sport: Sport(b, r); break;
                default: Round(b, r); break;
            }
            return b.ToMesh("CockpitWheel_" + kind);
        }

        static void Round(Builder b, float r)
        {
            var t = r * 0.085f;
            b.Torus(Grip, Vector3.zero, r, t, 0f, 360f, 40, 10);
            // Three spokes and a hub.
            foreach (var a in new[] { 90f, 270f, 180f })
            {
                var d = Quaternion.Euler(0f, 0f, a) * Vector3.right;
                b.Box(Trim, d * r * 0.5f + Vector3.forward * 0.02f, new Vector3(r * 0.9f, t * 1.3f, t * 0.6f), Quaternion.Euler(0f, 0f, a));
            }
            b.Cylinder(Trim, Vector3.forward * 0.025f, r * 0.24f, 0.05f, 20);
            b.Cylinder(Accent, Vector3.forward * -0.002f, r * 0.11f, 0.006f, 16);
        }

        static void Sport(Builder b, float r)
        {
            var t = r * 0.1f;
            // Round rim with a flat bottom: an arc over the top, a straight bar below.
            const float flat = 38f; // half angle of the flat part
            b.Torus(Grip, Vector3.zero, r, t, -90f + flat, 270f - flat, 40, 10);
            var y = -r * Mathf.Cos(flat * Mathf.Deg2Rad);
            var half = r * Mathf.Sin(flat * Mathf.Deg2Rad);
            b.Capsule(Grip, new Vector3(-half, y, 0f), new Vector3(half, y, 0f), t, 12);
            // Top centre marker.
            b.Box(Accent, new Vector3(0f, r, -t * 0.2f), new Vector3(0.03f, t * 2.15f, t * 2.15f), Quaternion.identity);
            // Spokes at 3, 9 and 6 o'clock, a flat hub plate.
            b.Box(Trim, new Vector3(-r * 0.55f, -r * 0.05f, 0.015f), new Vector3(r * 0.8f, r * 0.2f, 0.02f), Quaternion.Euler(0f, 0f, -6f));
            b.Box(Trim, new Vector3(r * 0.55f, -r * 0.05f, 0.015f), new Vector3(r * 0.8f, r * 0.2f, 0.02f), Quaternion.Euler(0f, 0f, 6f));
            b.Box(Trim, new Vector3(0f, -r * 0.5f, 0.015f), new Vector3(r * 0.24f, r * 0.7f, 0.02f), Quaternion.identity);
            b.Cylinder(Trim, Vector3.forward * 0.03f, r * 0.28f, 0.05f, 24);
            b.Box(Accent, new Vector3(0f, 0f, -0.002f), new Vector3(r * 0.3f, r * 0.12f, 0.006f), Quaternion.identity);
        }

        static void Formula(Builder b, float r)
        {
            // A carbon body as wide as the wheel, the screen bay in its upper middle, grips on both sides, paddles behind.
            var w = r * 1.5f;
            var h = r * 0.62f;
            b.Box(Trim, new Vector3(0f, 0.004f, 0.012f), new Vector3(w, h, 0.03f), Quaternion.identity);
            b.Box(Trim, new Vector3(0f, -h * 0.5f, 0.012f), new Vector3(w * 0.62f, h * 0.45f, 0.03f), Quaternion.identity);
            // Grips: upright capsules, tilted outwards at the top.
            foreach (var s in new[] { -1f, 1f })
            {
                var x = s * r * 0.86f;
                b.Capsule(Grip, new Vector3(x - s * 0.006f, -r * 0.42f, 0.0f), new Vector3(x + s * 0.012f, r * 0.34f, 0.0f), r * 0.11f, 12);
                // Paddles: thin blades behind the grips.
                b.Box(Accent, new Vector3(s * r * 0.62f, r * 0.16f, 0.045f), new Vector3(r * 0.42f, r * 0.24f, 0.006f), Quaternion.Euler(0f, 0f, s * -8f));
                // Knobs and buttons below the screen.
                for (var k = 0; k < 2; k++)
                    b.Cylinder(Accent, new Vector3(s * r * (0.25f + 0.24f * k), -h * 0.36f, -0.006f), r * 0.055f, 0.012f, 12);
                b.Cylinder(Accent, new Vector3(s * r * 0.52f, h * 0.22f, -0.005f), r * 0.045f, 0.01f, 10);
            }
            // Rev lights over the screen.
            for (var i = -4; i <= 4; i++)
                b.Box(Accent, new Vector3(i * r * 0.07f, h * 0.43f, -0.004f), new Vector3(r * 0.045f, r * 0.03f, 0.006f), Quaternion.identity);
            // Column hub behind.
            b.Cylinder(Trim, new Vector3(0f, 0f, 0.05f), r * 0.16f, 0.05f, 16);
        }

        sealed class Builder
        {
            readonly List<Vector3> _v = new(), _n = new();
            readonly List<int>[] _t = { new(), new(), new() };

            public Mesh ToMesh(string name)
            {
                var m = new Mesh { name = name, subMeshCount = 3 };
                m.SetVertices(_v);
                m.SetNormals(_n);
                for (var i = 0; i < 3; i++) m.SetTriangles(_t[i], i);
                m.RecalculateBounds();
                return m;
            }

            void Quad(int sub, int a, int b, int c, int d)
            {
                var t = _t[sub];
                t.Add(a); t.Add(b); t.Add(c);
                t.Add(a); t.Add(c); t.Add(d);
            }

            /// <summary>Tube along a circle in the XY plane, from angle a0 to a1 (degrees, 0 = +X, anticlockwise seen from −Z).</summary>
            public void Torus(int sub, Vector3 c, float R, float r, float a0, float a1, int seg, int ring)
            {
                var start = _v.Count;
                for (var i = 0; i <= seg; i++)
                {
                    var a = Mathf.Lerp(a0, a1, i / (float)seg) * Mathf.Deg2Rad;
                    var dir = new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0f);
                    for (var j = 0; j < ring; j++)
                    {
                        var b = j / (float)ring * Mathf.PI * 2f;
                        var n = dir * Mathf.Cos(b) + Vector3.forward * Mathf.Sin(b);
                        _v.Add(c + dir * R + n * r);
                        _n.Add(n);
                    }
                }
                for (var i = 0; i < seg; i++)
                for (var j = 0; j < ring; j++)
                {
                    var j1 = (j + 1) % ring;
                    Quad(sub, start + i * ring + j, start + i * ring + j1, start + (i + 1) * ring + j1, start + (i + 1) * ring + j);
                }
            }

            /// <summary>A tube from p to q with round-ish ends (hemisphere caps squashed into a few rings).</summary>
            public void Capsule(int sub, Vector3 p, Vector3 q, float r, int ring)
            {
                var axis = (q - p).normalized;
                var u = Vector3.Cross(axis, Vector3.forward).sqrMagnitude > 1e-4f ? Vector3.Cross(axis, Vector3.forward).normalized : Vector3.right;
                var v = Vector3.Cross(axis, u);
                // Rings: cap at p (3), body, cap at q (3).
                var rows = new List<(Vector3 c, float rad, float k)>();
                for (var i = 0; i <= 3; i++) { var a = (1f - i / 3f) * Mathf.PI * 0.5f; rows.Add((p - axis * Mathf.Sin(a) * r, Mathf.Cos(a) * r, -Mathf.Sin(a))); }
                for (var i = 0; i <= 3; i++) { var a = i / 3f * Mathf.PI * 0.5f; rows.Add((q + axis * Mathf.Sin(a) * r, Mathf.Cos(a) * r, Mathf.Sin(a))); }
                var start = _v.Count;
                foreach (var (c, rad, k) in rows)
                for (var j = 0; j < ring; j++)
                {
                    var b = j / (float)ring * Mathf.PI * 2f;
                    var d = u * Mathf.Cos(b) + v * Mathf.Sin(b);
                    _v.Add(c + d * Mathf.Max(rad, 1e-4f));
                    _n.Add((d * Mathf.Sqrt(Mathf.Max(0f, 1f - k * k)) + axis * k).normalized);
                }
                for (var i = 0; i < rows.Count - 1; i++)
                for (var j = 0; j < ring; j++)
                {
                    var j1 = (j + 1) % ring;
                    Quad(sub, start + i * ring + j, start + (i + 1) * ring + j, start + (i + 1) * ring + j1, start + i * ring + j1);
                }
            }

            /// <summary>A disc of thickness <paramref name="depth"/> along Z, its face towards −Z.</summary>
            public void Cylinder(int sub, Vector3 c, float r, float depth, int seg)
            {
                var front = c - Vector3.forward * depth * 0.5f;
                var back = c + Vector3.forward * depth * 0.5f;
                var start = _v.Count;
                // Side.
                for (var i = 0; i <= seg; i++)
                {
                    var a = i / (float)seg * Mathf.PI * 2f;
                    var d = new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0f);
                    _v.Add(front + d * r); _n.Add(d);
                    _v.Add(back + d * r); _n.Add(d);
                }
                for (var i = 0; i < seg; i++) Quad(sub, start + i * 2, start + i * 2 + 1, start + i * 2 + 3, start + i * 2 + 2);
                // Face.
                var centre = _v.Count;
                _v.Add(front); _n.Add(-Vector3.forward);
                for (var i = 0; i <= seg; i++)
                {
                    var a = i / (float)seg * Mathf.PI * 2f;
                    _v.Add(front + new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0f) * r); _n.Add(-Vector3.forward);
                }
                for (var i = 0; i < seg; i++) { _t[sub].Add(centre); _t[sub].Add(centre + 2 + i); _t[sub].Add(centre + 1 + i); }
            }

            public void Box(int sub, Vector3 c, Vector3 size, Quaternion rot)
            {
                var h = size * 0.5f;
                var faces = new[] { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
                foreach (var f in faces)
                {
                    var u = Mathf.Abs(f.y) > 0.5f ? Vector3.right : Vector3.up;
                    var v = Vector3.Cross(f, u);
                    var start = _v.Count;
                    var n = rot * f;
                    foreach (var (su, sv) in new[] { (-1f, -1f), (1f, -1f), (1f, 1f), (-1f, 1f) })
                    {
                        var p = Vector3.Scale(f + u * su + v * sv, h);
                        _v.Add(c + rot * p);
                        _n.Add(n);
                    }
                    Quad(sub, start, start + 1, start + 2, start + 3);
                }
            }
        }
    }
}
