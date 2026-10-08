using System.Linq;
using JapanMap.Editor.Art;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Asset-sprint library in Unity (Phase 4): approved = imported, unapproved = not.</summary>
    public class LibraryTests
    {
        [Test]
        public void EveryApprovedAsset_HasAPrefabWithLodAndColliders()
        {
            var s = LibraryImporter.Settings();
            var m = LibraryImporter.Manifest(s);
            Assert.That(m.entries.Count, Is.GreaterThan(50), "manifest not read");
            foreach (var e in m.entries.Where(e => LibraryImporter.IsApproved(s, e)))
            {
                var p = LibraryImporter.LoadPrefab(e.name);
                Assert.IsNotNull(p, $"{e.name}: no prefab — run JapanMap/Art/Import Library");
                var lod = p.GetComponent<LODGroup>();
                Assert.IsNotNull(lod, $"{e.name}: no LODGroup");
                Assert.AreEqual(e.lods.Any(l => l.EndsWith("_LOD1")) ? 2 : 1, lod.lodCount, $"{e.name}: LOD levels");
                Assert.AreEqual(e.colliders.Length, p.GetComponentsInChildren<BoxCollider>(true).Length, $"{e.name}: colliders");
                Assert.AreEqual(e.lights?.Length ?? 0, p.GetComponentsInChildren<Light>(true).Length, $"{e.name}: lights");
                foreach (var r in p.GetComponentsInChildren<MeshRenderer>(true))
                    Assert.That(r.sharedMaterials.All(mat => mat != null && mat.shader.name.StartsWith("Universal")), $"{e.name}/{r.name}: material not remapped");
            }
        }

        /// <summary>URP's validation (runs on reimport) silently dropped _EMISSION with GI flags None — signs went dark.</summary>
        [Test]
        public void AtlasMaterials_KeepEmissionAfterUrpValidation()
        {
            var lit = System.Type.GetType("UnityEditor.Rendering.Universal.ShaderGUI.LitShader, Unity.RenderPipelines.Universal.Editor");
            Assert.IsNotNull(lit, "URP LitShader GUI not found");
            var gui = System.Activator.CreateInstance(lit);
            var paths = System.IO.Directory.GetFiles(LibraryImporter.MaterialDir, "M_*_Atlas.mat");
            Assert.That(paths, Is.Not.Empty);
            foreach (var path in paths)
            {
                var copy = new Material(UnityEditor.AssetDatabase.LoadAssetAtPath<Material>(path));
                lit.GetMethod("ValidateMaterial").Invoke(gui, new object[] { copy });
                Assert.IsTrue(copy.IsKeywordEnabled("_EMISSION"), $"{path}: emission switched off by URP validation");
                Object.DestroyImmediate(copy);
            }
        }

        [Test]
        public void UnapprovedStyles_StayOut()
        {
            var s = LibraryImporter.Settings();
            foreach (var e in LibraryImporter.Manifest(s).entries.Where(e => !LibraryImporter.IsApproved(s, e)))
                Assert.IsNull(LibraryImporter.LoadPrefab(e.name), $"{e.name} is not approved but has a prefab");
        }
    }
}
