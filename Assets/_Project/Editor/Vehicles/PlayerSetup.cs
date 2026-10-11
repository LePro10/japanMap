using JapanMap.Editor.Map;
using JapanMap.Gameplay;
using JapanMap.OnFoot;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Editor.Vehicles
{
    /// <summary>
    /// Puts the "Player" object into Game.unity: spawner, input, respawn and camera rig, wired to the
    /// fleet, the road network and the Drive actions; the on-foot side (walker input, camera, touch)
    /// and the mode switch between them. Re-running replaces it (one source of truth).
    /// </summary>
    public static class PlayerSetup
    {
        public const string ObjectName = "Player";
        public const string InputPath = "Assets/_Project/Data/Input/Drive.inputactions";
        public const string CameraSettingsPath = FleetSeed.Dir + "/CarCameraSettings.asset";
        // Fallback when no place defines a spawn: city street (viewpoint "stadt-strasse"). Normally
        // Sakura Commons sets it (Places/PlaceImporter.ApplySpawn), as in the prototype.
        static readonly Vector3 SpawnPoint = new(640f, 30f, -262f);

        [MenuItem("JapanMap/Vehicles/Setup Player In Game Scene")]
        public static void Setup()
        {
            MapScene.OpenGameScene();
            var old = GameObject.Find(ObjectName);
            if (old != null) Object.DestroyImmediate(old);

            var settings = AssetDatabase.LoadAssetAtPath<CarCameraSettings>(CameraSettingsPath);
            if (settings == null)
            {
                settings = ScriptableObject.CreateInstance<CarCameraSettings>();
                AssetDatabase.CreateAsset(settings, CameraSettingsPath);
            }

            var go = new GameObject(ObjectName);
            var driver = go.AddComponent<DriverInput>();
            var respawn = go.AddComponent<VehicleRespawn>();
            var spawner = go.AddComponent<PlayerCarSpawner>();
            var rig = go.AddComponent<CarCameraRig>();
            var touch = go.AddComponent<DriveTouchControls>();
            var network = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);

            Set(driver, "actions", AssetDatabase.LoadAssetAtPath<InputActionAsset>(InputPath));
            Set(respawn, "roadLocator", network);
            Set(respawn, "driver", driver);
            Set(spawner, "fleet", AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath));
            Set(spawner, "roadLocator", network);
            Set(spawner, "driver", driver);
            Set(spawner, "respawn", respawn);
            Set(rig, "settings", settings);
            Set(rig, "spawner", spawner);
            Set(rig, "driver", driver);
            Set(touch, "driver", driver);
            Set(touch, "panelSettings", HudPanel());

            var hud = HudPanel();
            var walkInput = go.AddComponent<WalkerInput>();
            var walkRig = go.AddComponent<WalkCameraRig>();
            var walkTouch = go.AddComponent<WalkTouchControls>();
            var mode = go.AddComponent<PlayerModeController>();
            var ui = go.AddComponent<PlayerModeUi>();
            var actions = AssetDatabase.LoadAssetAtPath<InputActionAsset>(InputPath);
            Set(walkInput, "actions", actions);
            Set(walkRig, "settings", Asset<WalkCameraSettings>(OnFootDir + "/WalkCameraSettings.asset"));
            Set(walkTouch, "panelSettings", hud);
            Set(mode, "spawner", spawner);
            Set(mode, "driver", driver);
            Set(mode, "carCamera", rig);
            Set(mode, "driveTouch", touch);
            Set(mode, "roadLocator", network);
            Set(mode, "walkerSettings", Asset<WalkerSettings>(OnFootDir + "/WalkerSettings.asset"));
            Set(mode, "walkInput", walkInput);
            Set(mode, "walkCamera", walkRig);
            Set(mode, "walkTouch", walkTouch);
            Set(mode, "actions", actions);
            Set(mode, "skin", StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f)));
            Set(mode, "top", StandInMaterial("Jacket", new Color(0.2f, 0.36f, 0.42f)));
            Set(mode, "bottom", StandInMaterial("Trousers", new Color(0.16f, 0.17f, 0.2f)));
            Set(ui, "player", mode);
            Set(ui, "panelSettings", hud);
            Set(ui, "progress", Object.FindAnyObjectByType<JapanMap.Gameplay.Progress.PlayerProgress>());

            var so = new SerializedObject(spawner);
            so.FindProperty("spawnPoint").vector3Value = SpawnPoint;
            so.ApplyModifiedPropertiesWithoutUndo();
            Places.PlaceImporter.ApplySpawn();

            MapScene.Save();
            Debug.Log("[Player] set up in Game.unity");
        }

        public const string OnFootDir = "Assets/_Project/Data/OnFoot";
        public const string StandInDir = "Assets/_Project/Art/Materials";

        static T Asset<T>(string path) where T : ScriptableObject
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a != null) return a;
            if (!AssetDatabase.IsValidFolder(OnFootDir)) AssetDatabase.CreateFolder("Assets/_Project/Data", "OnFoot");
            a = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(a, path);
            return a;
        }

        /// <summary>Flat URP material for the provisional stand-in figures (player, pedestrians).</summary>
        public static Material StandInMaterial(string name, Color color)
        {
            var path = $"{StandInDir}/StandIn_{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m != null) return m;
            m = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = "StandIn_" + name, enableInstancing = true };
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", 0.2f);
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        public const string PanelPath = "Assets/_Project/Data/UI/HudPanel.asset";

        /// <summary>Panel for in-game UI: scales with height from 1080 p, default runtime theme.</summary>
        static PanelSettings HudPanel()
        {
            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelPath);
            if (panel != null) return panel;
            panel = ScriptableObject.CreateInstance<PanelSettings>();
            panel.themeStyleSheet = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>("Assets/_Project/Data/UI/RuntimeTheme.tss");
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1920, 1080);
            panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panel.match = 1f;
            panel.sortingOrder = 10;
            AssetDatabase.CreateAsset(panel, PanelPath);
            return panel;
        }

        static void Set(Object target, string field, Object value)
        {
            var so = new SerializedObject(target);
            var p = so.FindProperty(field);
            if (p == null) throw new System.ArgumentException($"{target.GetType().Name}.{field} not found");
            if (value == null) throw new System.ArgumentException($"{target.GetType().Name}.{field}: asset missing");
            p.objectReferenceValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
