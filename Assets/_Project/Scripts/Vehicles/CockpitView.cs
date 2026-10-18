using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// What the driver can see out of a car (D51): rays from the eye against the car's own drawn triangles — body, dash,
    /// wheel, arms, the cockpit's screens — glass and other see-through materials excepted. Tells how far ahead the road
    /// first shows over the bonnet, and whether a point is hidden. CPU work of a few ms per car: for tests and tuning,
    /// never per frame.
    /// </summary>
    public sealed class CockpitView
    {
        readonly List<Vector3> _tri = new();

        /// <summary>The opaque triangles of every active renderer under <paramref name="root"/>, in world space, minus <paramref name="skip"/>.</summary>
        public CockpitView(Transform root, Transform skip = null)
        {
            var verts = new List<Vector3>();
            var idx = new List<int>();
            foreach (var r in root.GetComponentsInChildren<MeshRenderer>())
            {
                if (!r.enabled || !r.gameObject.activeInHierarchy) continue;
                if (skip != null && r.transform.IsChildOf(skip)) continue;
                var mf = r.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;
                var mesh = mf.sharedMesh;
                if (!mesh.isReadable) continue;
                mesh.GetVertices(verts);
                var m = r.localToWorldMatrix;
                var mats = r.sharedMaterials;
                for (var s = 0; s < mesh.subMeshCount; s++)
                {
                    var mat = s < mats.Length ? mats[s] : null;
                    if (!Opaque(mat)) continue;
                    mesh.GetTriangles(idx, s);
                    for (var i = 0; i < idx.Count; i++) _tri.Add(m.MultiplyPoint3x4(verts[idx[i]]));
                }
            }
        }

        public int Triangles => _tri.Count / 3;

        /// <summary>See-through: glass, transparent queues (head-up, damage marks), no material.</summary>
        public static bool Opaque(Material m) =>
            m != null && m.renderQueue < 2450 && !m.name.EndsWith("_glass") && !m.name.Contains("glass");

        /// <summary>True when something of the car lies between <paramref name="eye"/> and <paramref name="point"/>.</summary>
        public bool Hidden(Vector3 eye, Vector3 point)
        {
            var d = point - eye;
            var len = d.magnitude;
            if (len < 1e-4f) return false;
            d /= len;
            for (var i = 0; i < _tri.Count; i += 3)
            {
                var t = Ray(eye, d, _tri[i], _tri[i + 1], _tri[i + 2]);
                if (t > 0.02f && t < len) return true;
            }
            return false;
        }

        /// <summary>
        /// First distance ahead (m, along the car's forward from the eye) where the ground under the eye's line shows over
        /// the dash and the bonnet; <paramref name="max"/> when nothing within it does.
        /// </summary>
        public float GroundFrom(Transform car, Vector3 eye, float max = 60f)
        {
            var fwd = Vector3.ProjectOnPlane(car.forward, car.up).normalized;
            var ground = car.position.y;
            for (var d = 2f; d <= max; d += d < 10f ? 0.25f : 1f)
            {
                var p = eye + fwd * d;
                p.y = ground;
                if (!Hidden(eye, p)) return d;
            }
            return max;
        }

        // Möller–Trumbore, both faces.
        static float Ray(Vector3 o, Vector3 d, Vector3 a, Vector3 b, Vector3 c)
        {
            var e1 = b - a;
            var e2 = c - a;
            var p = Vector3.Cross(d, e2);
            var det = Vector3.Dot(e1, p);
            if (det > -1e-9f && det < 1e-9f) return -1f;
            var inv = 1f / det;
            var s = o - a;
            var u = Vector3.Dot(s, p) * inv;
            if (u < 0f || u > 1f) return -1f;
            var q = Vector3.Cross(s, e1);
            var v = Vector3.Dot(d, q) * inv;
            if (v < 0f || u + v > 1f) return -1f;
            return Vector3.Dot(e2, q) * inv;
        }
    }
}
