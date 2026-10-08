using JapanMap.Editor.Look;
using JapanMap.Editor.Map;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace JapanMap.Tests
{
    /// <summary>The mood in Game.unity matches the Look profile (Phase 4).</summary>
    public class LookTests
    {
        [SetUp]
        public void OpenGameScene() => MapScene.OpenGameScene();

        [Test]
        public void Sun_ComesFromTheLegacyAzimuth()
        {
            // lighting.config.ts FALLBACK_SUN.direction (Three) → Unity mirrors z.
            var legacy = new Vector3(0.80865f, 0.03897f, -0.58699f);
            var p = ScriptableObject.CreateInstance<JapanMap.World.LookProfile>();
            p.sunAzimuth = 126f;
            p.sunElevation = 2.23f;
            Assert.That(Vector3.Angle(p.TowardsSun(), legacy), Is.LessThan(0.5f));
            Object.DestroyImmediate(p);
        }

        [Test]
        public void Scene_HasTheProfileApplied()
        {
            var p = LookSetup.LoadOrCreate();
            Assert.IsTrue(RenderSettings.fog, "fog off");
            Assert.AreEqual(p.fogDensity, RenderSettings.fogDensity, 1e-6f, "fog density not applied — run JapanMap/Look/Apply");
            Assert.AreEqual(LookSetup.SkyPath, UnityEditor.AssetDatabase.GetAssetPath(RenderSettings.skybox));
            var sun = RenderSettings.sun;
            Assert.IsNotNull(sun, "no sun");
            Assert.That(Vector3.Angle(-sun.transform.forward, p.TowardsSun()), Is.LessThan(0.5f), "sun direction");
            var vol = Object.FindAnyObjectByType<Volume>();
            Assert.AreEqual(LookSetup.VolumePath, UnityEditor.AssetDatabase.GetAssetPath(vol.sharedProfile));
            Assert.IsTrue(Camera.main.GetComponent<UniversalAdditionalCameraData>().renderPostProcessing, "post-processing off on the main camera");
        }
    }
}
