using JapanMap.Editor.Map;
using JapanMap.Editor.Vehicles;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Life;
using JapanMap.Gameplay.Traffic;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Life
{
    /// <summary>
    /// Puts World/Life into Game.unity: the pedestrian crowd with its settings and stand-in looks, and
    /// the city traffic.
    /// Re-running replaces it. The NavMesh comes from <see cref="PedestrianNav.Bake"/>.
    /// </summary>
    public static class LifeSetup
    {
        public const string Dir = "Assets/_Project/Data/Life";

        [MenuItem("JapanMap/Life/Setup Life In Game Scene")]
        public static string Setup()
        {
            MapScene.OpenGameScene();
            var life = MapScene.FreshGroup("Life");
            var crowdGo = new GameObject("Pedestrians");
            crowdGo.transform.SetParent(life, false);
            var crowd = crowdGo.AddComponent<PedestrianCrowd>();
            var so = new SerializedObject(crowd);
            so.FindProperty("settings").objectReferenceValue = Asset<PedestrianSettings>("PedestrianSettings");
            so.FindProperty("player").objectReferenceValue = Object.FindAnyObjectByType<PlayerModeController>();
            so.FindProperty("skin").objectReferenceValue = PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f));
            // Muted blue-hour clothing: office shirts, a red jacket, a school uniform, a grey coat.
            var tops = new[]
            {
                PlayerSetup.StandInMaterial("PedTopShirt", new Color(0.78f, 0.8f, 0.82f)),
                PlayerSetup.StandInMaterial("PedTopRed", new Color(0.55f, 0.16f, 0.14f)),
                PlayerSetup.StandInMaterial("PedTopNavy", new Color(0.12f, 0.15f, 0.28f)),
                PlayerSetup.StandInMaterial("PedTopCoat", new Color(0.42f, 0.4f, 0.36f)),
            };
            var bottoms = new[]
            {
                PlayerSetup.StandInMaterial("PedBottomDark", new Color(0.12f, 0.12f, 0.14f)),
                PlayerSetup.StandInMaterial("PedBottomBeige", new Color(0.55f, 0.5f, 0.4f)),
            };
            Fill(so.FindProperty("tops"), tops);
            Fill(so.FindProperty("bottoms"), bottoms);
            so.ApplyModifiedPropertiesWithoutUndo();

            var trafficGo = new GameObject("Traffic");
            trafficGo.transform.SetParent(life, false);
            var traffic = new SerializedObject(trafficGo.AddComponent<TrafficSystem>());
            traffic.FindProperty("settings").objectReferenceValue = Asset<TrafficSettings>("TrafficSettings");
            traffic.FindProperty("fleet").objectReferenceValue = AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath);
            traffic.FindProperty("roads").objectReferenceValue = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            traffic.FindProperty("player").objectReferenceValue = Object.FindAnyObjectByType<PlayerModeController>();
            traffic.FindProperty("template").objectReferenceValue = PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f));
            traffic.ApplyModifiedPropertiesWithoutUndo();
            MapScene.Save();
            return "[Life] crowd set up";
        }

        static void Fill(SerializedProperty array, Material[] values)
        {
            array.arraySize = values.Length;
            for (var i = 0; i < values.Length; i++) array.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
        }

        static T Asset<T>(string name) where T : ScriptableObject
        {
            var path = $"{Dir}/{name}.asset";
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a != null) return a;
            if (!AssetDatabase.IsValidFolder(Dir)) AssetDatabase.CreateFolder("Assets/_Project/Data", "Life");
            a = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(a, path);
            return a;
        }
    }
}
