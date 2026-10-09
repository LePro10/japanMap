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
    /// the city traffic, the breakable props, the place actors (people, animals) and the walk-in shops.
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

            var smashGo = new GameObject("Smash");
            smashGo.transform.SetParent(life, false);
            var smash = new SerializedObject(smashGo.AddComponent<JapanMap.Gameplay.Smash.SmashSystem>());
            smash.FindProperty("settings").objectReferenceValue = Asset<JapanMap.Gameplay.Smash.BreakableSettings>("BreakableSettings");
            smash.FindProperty("player").objectReferenceValue = Object.FindAnyObjectByType<PlayerModeController>();
            smash.FindProperty("template").objectReferenceValue = PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f));
            smash.ApplyModifiedPropertiesWithoutUndo();

            Debug.Log(LifeImport.Import());
            var actorsGo = new GameObject("Actors");
            actorsGo.transform.SetParent(life, false);
            var actors = new SerializedObject(actorsGo.AddComponent<PlaceActors>());
            actors.FindProperty("data").objectReferenceValue = AssetDatabase.LoadAssetAtPath<ActorSet>(LifeImport.ActorsPath);
            actors.FindProperty("pedestrians").objectReferenceValue = Asset<PedestrianSettings>("PedestrianSettings");
            actors.FindProperty("player").objectReferenceValue = Object.FindAnyObjectByType<PlayerModeController>();
            actors.FindProperty("skin").objectReferenceValue = PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f));
            // Work clothes: indigo, khaki, a red apron, faded blue.
            Fill(actors.FindProperty("tops"), new[]
            {
                PlayerSetup.StandInMaterial("WorkIndigo", new Color(0.16f, 0.2f, 0.36f)),
                PlayerSetup.StandInMaterial("WorkKhaki", new Color(0.5f, 0.46f, 0.32f)),
                PlayerSetup.StandInMaterial("WorkApron", new Color(0.6f, 0.2f, 0.15f)),
                PlayerSetup.StandInMaterial("WorkBlue", new Color(0.36f, 0.48f, 0.6f)),
            });
            actors.FindProperty("bottom").objectReferenceValue = PlayerSetup.StandInMaterial("PedBottomDark", new Color(0.12f, 0.12f, 0.14f));
            actors.ApplyModifiedPropertiesWithoutUndo();

            var shopsGo = new GameObject("Shops");
            shopsGo.transform.SetParent(life, false);
            var shops = new SerializedObject(shopsGo.AddComponent<ShopInteriors>());
            shops.FindProperty("data").objectReferenceValue = AssetDatabase.LoadAssetAtPath<InteriorSet>(LifeImport.InteriorsPath);
            shops.FindProperty("template").objectReferenceValue = PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f));
            shops.ApplyModifiedPropertiesWithoutUndo();
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
