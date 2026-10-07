using JapanMap.Editor.Map;
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
    /// fleet, the road network and the Drive actions. Re-running replaces it (one source of truth).
    /// </summary>
    public static class PlayerSetup
    {
        public const string ObjectName = "Player";
        public const string InputPath = "Assets/_Project/Data/Input/Drive.inputactions";
        public const string CameraSettingsPath = FleetSeed.Dir + "/CarCameraSettings.asset";
        // City street (viewpoint "stadt-strasse"): flat, wide, room to try a first drift.
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
            var so = new SerializedObject(spawner);
            so.FindProperty("spawnPoint").vector3Value = SpawnPoint;
            so.ApplyModifiedPropertiesWithoutUndo();

            MapScene.Save();
            Debug.Log("[Player] set up in Game.unity");
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
