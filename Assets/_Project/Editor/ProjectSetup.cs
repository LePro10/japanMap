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
