using System.IO;
using JapanMap.Core;
using JapanMap.DevTools;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace JapanMap.Editor
{
    /// <summary>
    /// Brings the project settings to the agreed state (docs/PLAN.md, Phase 1). Idempotent:
    /// running it again changes nothing that is already right, and never overwrites existing scenes.
    /// Batch: Unity -batchmode -quit -executeMethod JapanMap.Editor.ProjectSetup.Apply
    /// The guard tests in Tests/EditMode/ProjectSettingsTests.cs check the same values.
    /// </summary>
    public static class ProjectSetup
    {
        public const string Root = "Assets/_Project";
        public const string SettingsDir = Root + "/Settings";
        public const string ScenesDir = Root + "/Scenes";
        public const string BootScene = ScenesDir + "/Boot.unity";
        public const string GameScene = ScenesDir + "/Game.unity";

        [MenuItem("JapanMap/Setup/Apply Project Settings")]
        public static void Apply()
        {
            ApplyEditorAndPlayerSettings();
            ApplyWebSettings();
            MoveTemplateAssets();
            QualitySetup.Apply();
            CreateScenes();
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(BootScene, true),
                new EditorBuildSettingsScene(GameScene, true),
            };
            AssetDatabase.SaveAssets();
            Debug.Log("[Setup] project settings applied");
        }

        static void ApplyEditorAndPlayerSettings()
        {
            EditorSettings.serializationMode = SerializationMode.ForceText;
            VersionControlSettings.mode = "Visible Meta Files";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.companyName = "japanMap";
            PlayerSettings.productName = "japanMap";
            // Headless smoke tests and unfocused editors must keep ticking.
            PlayerSettings.runInBackground = true;

            // 1 = new Input System only. No public API for this field.
            var player = new SerializedObject(Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings"));
            player.FindProperty("activeInputHandler").intValue = 1;
            player.ApplyModifiedPropertiesWithoutUndo();

            // Domain reload off: statics are reset via RuntimeInitializeOnLoadMethod (see Bootstrapper).
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
        }

        static void ApplyWebSettings()
        {
            var web = NamedBuildTarget.WebGL;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            // Lets any static file server deliver the build (no Content-Encoding headers needed).
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.SetManagedStrippingLevel(web, ManagedStrippingLevel.High);
            PlayerSettings.SetIl2CppCodeGeneration(web, Il2CppCodeGeneration.OptimizeSize);
            // No Unity splash (optional for every plan since Unity 6): 2.7 MB logo texture and seconds before play (D36).
            PlayerSettings.SplashScreen.show = false;
            // Own page (Assets/WebGLTemplates/JapanMap): full frame, no selection, pixel ratio 1 on iOS/low-memory phones,
            // errors without alert() — CrazyGames requirements (D37).
            PlayerSettings.WebGL.template = "PROJECT:JapanMap";
            TrimGraphicsSettings();
            // Optimize Mesh Data: vertex channels no material reads (UV2+, colours, tangents) leave the build (D36).
            PlayerSettings.stripUnusedMeshComponents = true;
        }

        /// <summary>The URP template puts its assets in Assets/Settings; ours live under _Project.</summary>
        static void MoveTemplateAssets()
        {
            if (AssetDatabase.IsValidFolder("Assets/Settings") && !AssetDatabase.IsValidFolder(SettingsDir))
            {
                var error = AssetDatabase.MoveAsset("Assets/Settings", SettingsDir);
                if (!string.IsNullOrEmpty(error)) Debug.LogError("[Setup] " + error);
            }
            if (AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.DeleteAsset("Assets/Scenes");
            if (!AssetDatabase.IsValidFolder(SettingsDir))
                AssetDatabase.CreateFolder(Root, "Settings");
        }

        /// <summary>Adds a boot system under the Bootstrapper if it is missing (sibling index = init order).</summary>
        /// <summary>
        /// Built-in-pipeline shaders the URP template keeps "always included" (deferred, screen-space shadows, depth-normals,
        /// legacy diffuse) and lightmap variants (no lightmaps here) — compiled for every graphics API into the start
        /// download for nothing (D38).
        /// </summary>
        static void TrimGraphicsSettings()
        {
            var gs = new SerializedObject(AssetDatabase.LoadAssetAtPath<Object>("ProjectSettings/GraphicsSettings.asset"));
            var list = gs.FindProperty("m_AlwaysIncludedShaders");
            for (var i = list.arraySize - 1; i >= 0; i--)
            {
                var shader = list.GetArrayElementAtIndex(i).objectReferenceValue as Shader;
                if (shader == null) continue;
                var n = shader.name;
                if (n.StartsWith("Hidden/Internal-Deferred") || n.StartsWith("Hidden/Internal-ScreenSpaceShadows") ||
                    n.StartsWith("Hidden/Internal-DepthNormalsTexture") || n.StartsWith("Legacy Shaders/"))
                    list.DeleteArrayElementAtIndex(i);
            }
            gs.FindProperty("m_LightmapStripping").intValue = 1; // custom: keep none
            foreach (var k in new[] { "m_LightmapKeepPlain", "m_LightmapKeepDirCombined", "m_LightmapKeepDynamicPlain",
                                      "m_LightmapKeepDynamicDirCombined", "m_LightmapKeepShadowMask", "m_LightmapKeepSubtractive" })
                gs.FindProperty(k).boolValue = false;
            gs.ApplyModifiedPropertiesWithoutUndo();
        }

        public const string QualityCalibrationPath = "Assets/_Project/Data/Core/QualityCalibration.asset";

        /// <summary>Auto quality's thresholds and GPU hints as data (D38), wired to the Boot scene's QualitySystem.</summary>
        static void WireQualityCalibration()
        {
            var asset = AssetDatabase.LoadAssetAtPath<QualityCalibration>(QualityCalibrationPath);
            if (asset == null)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(QualityCalibrationPath));
                asset = ScriptableObject.CreateInstance<QualityCalibration>();
                AssetDatabase.CreateAsset(asset, QualityCalibrationPath);
            }
            var scene = EditorSceneManager.OpenScene(BootScene, OpenSceneMode.Additive);
            try
            {
                foreach (var r in scene.GetRootGameObjects())
                foreach (var q in r.GetComponentsInChildren<QualitySystem>(true))
                {
                    var so = new SerializedObject(q);
                    so.FindProperty("calibration").objectReferenceValue = asset;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
                EditorSceneManager.SaveScene(scene);
            }
            finally
            {
                if (UnityEngine.SceneManagement.SceneManager.sceneCount > 1) EditorSceneManager.CloseScene(scene, true);
            }
        }

        public static string EnsureBootSystem<T>(string name, int index) where T : GameSystem
        {
            var scene = EditorSceneManager.OpenScene(BootScene, OpenSceneMode.Additive);
            try
            {
                Bootstrapper boot = null;
                foreach (var r in scene.GetRootGameObjects()) if (r.TryGetComponent(out boot)) break;
                if (boot == null) return "no Bootstrapper";
                if (boot.GetComponentInChildren<T>(true) != null) return $"{name} present";
                var go = new GameObject(name, typeof(T));
                go.transform.SetParent(boot.transform, false);
                go.transform.SetSiblingIndex(index);
                EditorSceneManager.SaveScene(scene);
                return $"{name} added";
            }
            finally
            {
                if (UnityEngine.SceneManagement.SceneManager.sceneCount > 1) EditorSceneManager.CloseScene(scene, true);
            }
        }

        static void CreateScenes()
        {
            if (!File.Exists(BootScene))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var boot = new GameObject("Bootstrapper", typeof(Bootstrapper));
                // Child order is the initialisation order.
                new GameObject("QualitySystem", typeof(QualitySystem)).transform.SetParent(boot.transform);
                new GameObject("StatsOverlay", typeof(StatsOverlay)).transform.SetParent(boot.transform);
                EditorSceneManager.SaveScene(scene, BootScene);
            }
            EnsureBootSystem<JapanMap.Platform.CrazyGamesPlatform>("CrazyGamesPlatform", 0);
            // The terrain bundle loads beside the SDK, before the game scene (D36).
            EnsureBootSystem<JapanMap.World.StartContentGate>("StartContent", 1);
            WireQualityCalibration();

            if (!File.Exists(GameScene))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

                var cam = new GameObject("Main Camera", typeof(Camera), typeof(UniversalAdditionalCameraData));
                cam.tag = "MainCamera";
                cam.transform.SetPositionAndRotation(new Vector3(0f, 6f, -14f), Quaternion.Euler(18f, 0f, 0f));

                var sun = new GameObject("Sun", typeof(Light));
                var light = sun.GetComponent<Light>();
                light.type = LightType.Directional;
                light.shadows = LightShadows.Soft;
                sun.transform.rotation = Quaternion.Euler(35f, -40f, 0f);

                var volume = new GameObject("Global Volume", typeof(Volume)).GetComponent<Volume>();
                volume.isGlobal = true;
                volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(SettingsDir + "/DefaultVolumeProfile.asset");

                // Placeholder geometry so captures and draw-call counters show something.
                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.name = "Ground";
                ground.transform.localScale = new Vector3(5f, 1f, 5f);
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = "Reference Cube (1 m)";
                cube.transform.position = new Vector3(-2f, 0.5f, 0f);
                var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                sphere.name = "Reference Sphere (1 m)";
                sphere.transform.position = new Vector3(2f, 0.5f, 0f);

                EditorSceneManager.SaveScene(scene, GameScene);
            }
        }
    }
}
