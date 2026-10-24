using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Sagging cables between neighbouring power poles (POLISH B7, legacy CityStreetDress): one static mesh under the
    /// pole group, so it streams with the poles. Thin three-sided tubes, no shadows, no collider.
    /// </summary>
    public static class PowerCables
    {
        public const string MeshPath = "Assets/_Project/Data/Map/PowerCables.asset";
        const string MaterialPath = "Assets/_Project/Art/Materials/PowerCable.mat";
        /// <summary>Name of the cable object under the pole group — not a placement; loops over prop instances skip it.</summary>
        public const string ObjectName = "Cables";

        /// <summary>Wires each pole to the next one in file order when they are close. Returns the number of spans.</summary>
        public static int Build(Transform poles, MapImportSettings s)
        {
            if (poles == null) return 0;
            var old = poles.Find(ObjectName);
            if (old != null) Object.DestroyImmediate(old.gameObject);
            var list = poles.Cast<Transform>().Where(c => c.name != ObjectName).ToList();
            var v = new List<Vector3>();
            var n = new List<Vector3>();
            var t = new List<int>();
            var spans = 0;
            var skewed = 0;
            for (var i = 0; i + 1 < list.Count; i++)
            {
                Transform a = list[i], b = list[i + 1];
                var d = b.position - a.position;
                d.y = 0f;
                if (d.magnitude > s.cableMaxSpan || d.magnitude < 1f) continue;
                // Cables run across the crossarm (local z); a crossarm along the line would bunch them up.
                if (Mathf.Abs(Vector3.Dot(a.forward, d.normalized)) > 0.7f) { skewed++; continue; }
                var right = Vector3.Cross(Vector3.up, d).normalized;
                var from = Attach(a, s).OrderBy(p => Vector3.Dot(p, right)).ToArray();
                var to = Attach(b, s).OrderBy(p => Vector3.Dot(p, right)).ToArray();
                for (var k = 0; k < from.Length; k++) Tube(v, n, t, from[k], to[k], s);
                spans++;
            }
            if (spans == 0) return 0;

            var mesh = new Mesh { name = "PowerCables" };
            mesh.SetVertices(v);
            mesh.SetNormals(n);
            mesh.SetTriangles(t, 0);
            mesh.RecalculateBounds();
            var go = new GameObject(ObjectName, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(poles, false);
            go.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            go.GetComponent<MeshFilter>().sharedMesh = MeshAssets.Save(MeshPath, mesh, compact: true);
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = CableMaterial();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)~0 & ~StaticEditorFlags.ContributeGI);
            Debug.Log($"[Map] power cables: {spans} spans, {t.Count / 3} triangles{(skewed > 0 ? $", {skewed} skipped (crossarm along the line)" : "")}");
            return spans;
        }

        static IEnumerable<Vector3> Attach(Transform pole, MapImportSettings s) =>
            s.cableOffsets.Select(z => pole.TransformPoint(new Vector3(0f, s.cableHeight, z)));

        /// <summary>A parabola from a to b sagging by cableSag × span, as a triangular tube.</summary>
        static void Tube(List<Vector3> v, List<Vector3> n, List<int> t, Vector3 a, Vector3 b, MapImportSettings s)
        {
            var span = Vector3.Distance(a, b);
            var segs = s.cableSegments;
            var start = v.Count;
            for (var j = 0; j <= segs; j++)
            {
                var u = j / (float)segs;
                var c = Vector3.Lerp(a, b, u) + Vector3.down * (4f * s.cableSag * span * u * (1f - u));
                var dir = (b - a).normalized;
                var side = Vector3.Cross(Vector3.up, dir).normalized;
                var up = Vector3.Cross(dir, side);
                for (var k = 0; k < 3; k++)
                {
                    var ang = k * Mathf.PI * 2f / 3f;
                    var radial = side * Mathf.Cos(ang) + up * Mathf.Sin(ang);
                    v.Add(c + radial * s.cableRadius);
                    n.Add(radial);
                }
            }
            for (var j = 0; j < segs; j++)
            for (var k = 0; k < 3; k++)
            {
                int i0 = start + j * 3 + k, i1 = start + j * 3 + (k + 1) % 3, i2 = i0 + 3, i3 = i1 + 3;
                t.Add(i0); t.Add(i2); t.Add(i1);
                t.Add(i1); t.Add(i2); t.Add(i3);
            }
        }

        static Material CableMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (mat != null) return mat;
            Directory.CreateDirectory(Path.GetDirectoryName(MaterialPath));
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mat.SetColor("_BaseColor", new Color32(0x19, 0x24, 0x2b, 255)); // legacy cable colour
            mat.SetFloat("_Smoothness", 0.35f);
            mat.enableInstancing = true;
            AssetDatabase.CreateAsset(mat, MaterialPath);
            return mat;
        }
    }
}
