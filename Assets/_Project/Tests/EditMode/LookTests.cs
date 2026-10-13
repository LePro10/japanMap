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

        [Test]
        public void WetSurfaces_UseTheWetShader_AndRoadsCarryTheirData()
        {
            // Puddles, paint and shoulder need both the shader and the road data channel (UV3); a re-import that drops
            // either leaves a plain glossy road again (2026-10-13).
            foreach (var name in new[] { "Road_Asphalt", "Road_Concrete", "City_Slab" })
            {
                var mat = UnityEditor.AssetDatabase.LoadAssetAtPath<Material>($"Assets/_Project/Art/Materials/{name}.mat");
                Assert.AreEqual(LookSetup.WetShader, mat.shader.name, $"{name} is not on the wet shader — run JapanMap/Look/Apply");
            }
            var road = UnityEditor.AssetDatabase.LoadAssetAtPath<Mesh>(RoadImporter.MeshDir + "/Road_0_0.asset");
            var data = new System.Collections.Generic.List<Vector4>();
            road.GetUVs(3, data);
            Assert.AreEqual(road.vertexCount, data.Count, "road mesh without UV3 road data — run JapanMap/Map/Refresh Road Meshes");
            Assert.That(data.Exists(d => d.z > 1f && d.w > 0.5f), "no road with paint in Road_0_0");
        }

        [Test]
        public void CameraShot_KeepsTheBloom()
        {
            // Photos, record cards and captures rendered into an 8-bit target lost the bloom (2026-10-13): a glowing
            // ball must light up the dark pixels beside it.
            var cam = Camera.main;
            var keep = (cam.transform.position, cam.transform.rotation);
            var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            mat.SetColor("_BaseColor", Color.white * 40f);
            ball.GetComponent<Renderer>().sharedMaterial = mat;
            try
            {
                cam.transform.SetPositionAndRotation(new Vector3(0f, 900f, 0f), Quaternion.Euler(-80f, 0f, 0f)); // the dark sky above everything
                ball.transform.position = cam.transform.position + cam.transform.forward * 20f;
                var tex = JapanMap.Core.CameraShot.Render(cam, 256, 256);
                // Beside the ball (radius ≈ 0.5 m at 20 m in a 60° view ≈ 6 px): 20 px off-centre.
                var beside = tex.GetPixel(148, 128).grayscale;
                var far = tex.GetPixel(250, 250).grayscale;
                Object.DestroyImmediate(tex);
                Assert.Greater(beside, far + 0.05f, $"no glow beside the bright ball (beside {beside:0.000}, far {far:0.000})");
            }
            finally
            {
                cam.transform.SetPositionAndRotation(keep.position, keep.rotation);
                Object.DestroyImmediate(ball);
                Object.DestroyImmediate(mat);
            }
        }

        [Test]
        public void EveryPlace_HasBakedReflectionProbes()
        {
            // Without them the puddles mirror only the bright sky and read as ice.
            foreach (var path in JapanMap.Editor.Content.StreamingSetup.StreamedScenes())
            {
                if (!path.StartsWith(JapanMap.Editor.Content.StreamingSetup.PlaceDir)) continue;
                var scene = UnityEngine.SceneManagement.SceneManager.GetSceneByPath(path);
                if (!scene.IsValid() || !scene.isLoaded) scene = UnityEditor.SceneManagement.EditorSceneManager.OpenScene(path, UnityEditor.SceneManagement.OpenSceneMode.Additive);
                var probes = new System.Collections.Generic.List<ReflectionProbe>();
                foreach (var root in scene.GetRootGameObjects()) probes.AddRange(root.GetComponentsInChildren<ReflectionProbe>());
                Assert.IsNotEmpty(probes, $"{scene.name}: no reflection probe — run JapanMap/Look/Bake Place Reflections");
                foreach (var probe in probes) Assert.IsNotNull(probe.customBakedTexture, $"{scene.name}/{probe.name}: no baked cubemap");
            }
        }
    }
}
