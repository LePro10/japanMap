using JapanMap.Editor.Map;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;

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
            var so = new SerializedObject(spawner);
            so.FindProperty("spawnPoint").vector3Value = SpawnPoint;
            so.ApplyModifiedPropertiesWithoutUndo();

            MapScene.Save();
            Debug.Log("[Player] set up in Game.unity");
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
