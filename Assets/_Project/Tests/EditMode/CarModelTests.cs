using System.Collections.Generic;
using System.IO;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every car model as Unity imported it (D52). The tyres were inside-out in all ten cars — the generator's lathe
    /// wound the faces towards the axle, so back-face culling showed the inside of the tyre. Judged as rendered: in the
    /// car's space, with Unity's own flip for a negative-scale transform, so a mirrored wheel without a winding fix fails too.
    /// </summary>
    public class CarModelTests
    {
        const string CarDir = "Assets/_Project/Art/Cars";

        static IEnumerable<string> Cars()
        {
            foreach (var f in Directory.GetFiles(CarDir, "*.glb")) yield return Path.GetFileNameWithoutExtension(f);
        }

        [Test]
        public void FleetHasItsTenModels() => Assert.That(new List<string>(Cars()).Count, Is.GreaterThanOrEqualTo(10));

        [TestCaseSource(nameof(Cars))]
        public void TyresFaceOutward(string id)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"{CarDir}/{id}.glb");
            Assert.That(prefab, Is.Not.Null, id);
            var root = prefab.transform;
            var checkedWheels = 0;
            foreach (var w in new[] { "FL", "FR", "RL", "RR" })
            {
                var spin = VehicleVisuals.FindPrefix(root, "spin_" + w);
                Assert.That(spin, Is.Not.Null, $"{id}: spin_{w}");
                foreach (var mr in spin.GetComponentsInChildren<MeshRenderer>(true))
                {
                    var mesh = mr.GetComponent<MeshFilter>().sharedMesh;
                    var mats = mr.sharedMaterials;
                    for (var s = 0; s < mesh.subMeshCount && s < mats.Length; s++)
                    {
                        if (mats[s] == null || !mats[s].name.EndsWith("_tire")) continue;
                        var share = OutwardShare(mesh, s, root.worldToLocalMatrix * mr.transform.localToWorldMatrix,
                            root.InverseTransformPoint(spin.position), root.InverseTransformDirection(spin.right));
                        Assert.That(share, Is.GreaterThan(0.9f), $"{id} {mr.name}: only {share:P0} of tread/flank faces point outward");
                        checkedWheels++;
                    }
                }
            }
            Assert.That(checkedWheels, Is.GreaterThanOrEqualTo(4), $"{id}: no tyre submesh found (material *_tire)");
        }

        /// <summary>Without a loadout (rivals) only the stock rim shows: one wheel mesh per wheel after the visuals bind.</summary>
        [TestCaseSource(nameof(Cars))]
        public void OneRimPerWheel_WithoutLoadout(string id)
        {
            var car = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>($"{CarDir}/{id}.glb"));
            try
            {
                foreach (var t in car.GetComponentsInChildren<Transform>(true))
                    if (VehicleVisuals.IsTuningOption(t)) t.gameObject.SetActive(false);
                foreach (var w in new[] { "FL", "FR", "RL", "RR" })
                {
                    var spin = VehicleVisuals.FindPrefix(car.transform, "spin_" + w);
                    var shown = 0;
                    foreach (Transform c in spin) if (c.gameObject.activeInHierarchy && c.name.StartsWith("wheelmesh_")) shown++;
                    Assert.AreEqual(1, shown, $"{id} {w}: rims shown");
                }
            }
            finally { Object.DestroyImmediate(car); }
        }

        /// <summary>Tread faces must point away from the axle, flank faces away from the wheel's centre plane.</summary>
        static float OutwardShare(Mesh mesh, int sub, Matrix4x4 toCar, Vector3 centre, Vector3 axis)
        {
            var v = mesh.vertices;
            var tris = mesh.GetTriangles(sub);
            // Unity culls by the winding as transformed; a mirroring transform flips which side is the front.
            var flip = toCar.determinant < 0f ? -1f : 1f;
            var p = new Vector3[v.Length];
            float rMax = 0f, aMax = 0f;
            for (var i = 0; i < v.Length; i++)
            {
                p[i] = toCar.MultiplyPoint3x4(v[i]) - centre;
                var a = Vector3.Dot(p[i], axis);
                rMax = Mathf.Max(rMax, (p[i] - a * axis).magnitude);
                aMax = Mathf.Max(aMax, Mathf.Abs(a));
            }
            int judged = 0, outward = 0;
            for (var t = 0; t < tris.Length; t += 3)
            {
                Vector3 a = p[tris[t]], b = p[tris[t + 1]], c = p[tris[t + 2]];
                var n = flip * Vector3.Cross(b - a, c - a);
                var m = (a + b + c) / 3f;
                var along = Vector3.Dot(m, axis);
                var radial = m - along * axis;
                float d;
                if (radial.magnitude > rMax * 0.93f) d = Vector3.Dot(n, radial);
                else if (Mathf.Abs(along) > aMax * 0.8f) d = Vector3.Dot(n, along * axis);
                else continue;
                judged++;
                if (d > 0f) outward++;
            }
            Assert.That(judged, Is.GreaterThan(20), "too few tread/flank faces to judge");
            return (float)outward / judged;
        }
    }
}
