using System.Collections.Generic;
using JapanMap.Editor.Map;
using JapanMap.Editor.Places;
using JapanMap.Editor.Vehicles;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// Puts World/Content into Game.unity: Sparks wallet, drift scorer with its zones and their
    /// boundary flags, and the gameplay HUD. Re-running replaces the group; the data assets under
    /// Data/Gameplay are created once with the values below and then owned by the asset.
    /// </summary>
    public static class ContentSetup
    {
        public const string Dir = "Assets/_Project/Data/Gameplay";
        public const string GroupName = "Content";
        const string FlagPrefab = "Assets/_Project/Prefabs/Library/P_Nobori_Red.prefab";

        [MenuItem("JapanMap/Content/Setup Content In Game Scene")]
        public static string Setup()
        {
            MapScene.OpenGameScene();
            var group = MapScene.FreshGroup(GroupName);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var respawn = Object.FindAnyObjectByType<VehicleRespawn>();
            if (player == null) throw new System.InvalidOperationException("Player missing — run Vehicles/Setup Player first");

            var wallet = Child<SparksWallet>(group, "Wallet");
            Set(wallet, "settings", Asset<EconomySettings>("EconomySettings"));

            var zones = Zones();
            var drift = Child<DriftScorer>(group, "Drift");
            Set(drift, "settings", Asset<DriftSettings>("DriftSettings"));
            Set(drift, "zones", zones);
            Set(drift, "player", player);
            Set(drift, "wallet", wallet);
            Set(drift, "respawn", respawn);
            var flags = PlaceZoneFlags(drift.transform, zones);

            var hud = Child<GameplayHud>(group, "Hud");
            Set(hud, "panelSettings", AssetDatabase.LoadAssetAtPath<PanelSettings>(PlayerSetup.PanelPath));
            Set(hud, "drift", drift);
            Set(hud, "wallet", wallet);

            MapScene.Save();
            var msg = $"[Content] set up: {zones.zones.Length} drift zones, {flags} flags";
            Debug.Log(msg);
            return msg;
        }

        /// <summary>Drift zones (ASTRA §5): the bowl's drive loop and the open star junction west of the city.</summary>
        static DriftZoneSet Zones()
        {
            var path = $"{Dir}/DriftZones.asset";
            var set = AssetDatabase.LoadAssetAtPath<DriftZoneSet>(path);
            if (set != null) return set;
            set = ScriptableObject.CreateInstance<DriftZoneSet>();
            set.zones = new[]
            {
                new DriftZoneSet.Zone
                {
                    id = "sakura-bowl", title = "Sakura Bowl", center = new Vector2(550f, -508f), radius = 62f,
                    note = "legacy stunt.config.ts DRIFT_ZONES sakura-bowl (550 | 510) r 62, Unity z mirrored. The cherry ring of " +
                           "Sakura Commons marks it. Measured 2026-10-09: 6.2 m height range within 60 m.",
                },
                new DriftZoneSet.Zone
                {
                    id = "rotor-court", title = "Rotor Court", center = new Vector2(180f, -280f), size = new Vector2(70f, 55f),
                    note = "ASTRA §5: Rotor Court 70 × 55 m about (180, 280), replaces legacy harbour-pan (a sloped meadow, 8.5 m " +
                           "range). Here the open star junction west of Tokyo: asphalt, 6.5 m range within 60 m. Red nobori mark it.",
                },
            };
            AssetDatabase.CreateAsset(set, path);
            return set;
        }

        /// <summary>Red banners every ~18 m along a rectangle zone's edge, not on a carriageway.</summary>
        static int PlaceZoneFlags(Transform parent, DriftZoneSet set)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(FlagPrefab);
            var roads = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            if (prefab == null) return 0;
            var n = 0;
            foreach (var z in set.zones)
            {
                if (z.radius > 0f) continue; // circles are marked by their place (the cherry ring)
                var spots = new List<Vector2>();
                var rot = Quaternion.Euler(0f, 0f, -z.yaw);
                var h = z.size * 0.5f;
                var corners = new[] { new Vector2(-h.x, -h.y), new Vector2(h.x, -h.y), new Vector2(h.x, h.y), new Vector2(-h.x, h.y) };
                for (var c = 0; c < 4; c++)
                {
                    var a = corners[c];
                    var b = corners[(c + 1) % 4];
                    var steps = Mathf.Max(1, Mathf.RoundToInt(Vector2.Distance(a, b) / 18f));
                    for (var s = 0; s < steps; s++) spots.Add(z.center + (Vector2)(rot * Vector2.Lerp(a, b, s / (float)steps)));
                }
                foreach (var s in spots)
                {
                    var p = new Vector3(s.x, 0f, s.y);
                    if (roads != null && roads.CarriagewayAt(p, 1.5f, 1000f) != null) continue;
                    p.y = PlaceImporter.Ground(p);
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
                    go.name = $"ZoneFlag_{z.id}_{n}";
                    var toCentre = new Vector3(z.center.x - p.x, 0f, z.center.y - p.z);
                    go.transform.SetPositionAndRotation(p, Quaternion.LookRotation(toCentre));
                    GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic);
                    n++;
                }
            }
            return n;
        }

        static T Child<T>(Transform parent, string name) where T : Component
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go.AddComponent<T>();
        }

        public static T Asset<T>(string name) where T : ScriptableObject
        {
            var path = $"{Dir}/{name}.asset";
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a != null) return a;
            if (!AssetDatabase.IsValidFolder(Dir)) AssetDatabase.CreateFolder("Assets/_Project/Data", "Gameplay");
            a = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(a, path);
            return a;
        }

        public static void Set(Object target, string field, Object value)
        {
            var so = new SerializedObject(target);
            var p = so.FindProperty(field);
            if (p == null) throw new System.ArgumentException($"{target.GetType().Name}.{field} not found");
            p.objectReferenceValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
