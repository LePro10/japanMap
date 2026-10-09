using System.Collections.Generic;
using JapanMap.Editor.Map;
using JapanMap.Editor.Places;
using JapanMap.Editor.Vehicles;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using JapanMap.Gameplay.Stunts;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
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

            var regions = Child<RegionWatch>(group, "Regions");
            Set(regions, "regions", Regions());
            Set(regions, "player", player);
            Set(regions, "wallet", wallet);
            Set(regions, "hud", hud);

            var cards = DiscoverySeed.LoadOrCreate();
            WriteGround(cards);
            var discovery = Child<DiscoverySystem>(group, "Discoveries");
            Set(discovery, "set", cards);
            Set(discovery, "player", player);
            Set(discovery, "wallet", wallet);
            Set(discovery, "hud", hud);
            Set(discovery, "actions", AssetDatabase.LoadAssetAtPath<InputActionAsset>(PlayerSetup.InputPath));
            Set(discovery, "template", PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f)));

            var stunts = Child<StuntScorer>(group, "Stunts");
            Set(stunts, "settings", Asset<StuntSettings>("StuntSettings"));
            Set(stunts, "ramps", RampBuilder.LoadOrCreate());
            Set(stunts, "player", player);
            Set(stunts, "driver", Object.FindAnyObjectByType<DriverInput>());
            Set(stunts, "wallet", wallet);
            Set(stunts, "hud", hud);

            var races = Child<RaceDirector>(group, "Races");
            Set(races, "set", RaceSeed.LoadOrCreate());
            Set(races, "roads", AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath));
            Set(races, "player", player);
            Set(races, "spawner", Object.FindAnyObjectByType<PlayerCarSpawner>());
            Set(races, "driver", Object.FindAnyObjectByType<DriverInput>());
            Set(races, "respawn", respawn);
            Set(races, "fleet", AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath));
            Set(races, "wallet", wallet);
            Set(races, "hud", hud);
            Set(races, "drift", drift);
            Set(races, "stunts", stunts);
            Set(races, "actions", AssetDatabase.LoadAssetAtPath<InputActionAsset>(PlayerSetup.InputPath));
            Set(races, "template", PlayerSetup.StandInMaterial("Skin", new Color(0.73f, 0.58f, 0.45f)));

            MapScene.Save();
            var msg = $"[Content] set up: {zones.zones.Length} drift zones, {flags} flags, {Regions().regions.Length} regions, {cards.cards.Length} discoveries";
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

        /// <summary>Terrain height under each card, so the token sits on the ground and never on a roof.</summary>
        static void WriteGround(DiscoverySet set)
        {
            for (var i = 0; i < set.cards.Length; i++)
                set.cards[i].ground = PlaceImporter.Ground(new Vector3(set.cards[i].position.x, 0f, set.cards[i].position.y));
            EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
        }

        static RegionSet.Box B(float x0, float x1, float z0, float z1) => new() { min = new Vector2(x0, z0), max = new Vector2(x1, z1) };

        /// <summary>
        /// Eight regions from legacy navigationMapRegions.ts regionAt, z mirrored (legacy z ≥ a ∧ z &lt; b → Unity
        /// −b &lt; z ≤ −a; the one-point difference on a border does not matter). Map edge ±1600 covers the margin.
        /// </summary>
        static RegionSet Regions()
        {
            var path = $"{Dir}/Regions.asset";
            var set = AssetDatabase.LoadAssetAtPath<RegionSet>(path);
            if (set != null) return set;
            const float E = 1600f;
            static Color C(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.white;
            set = ScriptableObject.CreateInstance<RegionSet>();
            set.regions = new[]
            {
                new RegionSet.Region { id = "commons", title = "Sakura Commons", detail = "Car court under petals", color = C("#e8a9c0"),
                    circleCenter = new Vector2(550f, -506f), circleRadius = 180f, labelAt = new Vector2(550f, -506f) },
                new RegionSet.Region { id = "needle", title = "Needle Works", detail = "Circuit and pit court", color = C("#c44536"),
                    boxes = new[] { B(-1160f, -80f, -940f, -540f) }, labelAt = new Vector2(-620f, -740f) },
                new RegionSet.Region { id = "tideglass", title = "Tideglass Harbour", detail = "Working ocean port", color = C("#3d8fd1"),
                    boxes = new[] { B(520f, 1100f, -E, -780f) }, labelAt = new Vector2(810f, -1158f) },
                new RegionSet.Region { id = "neon", title = "Neo Tokyo", detail = "Scramble, alleys and neon", color = C("#9b6bb3"),
                    boxes = new[] { B(-80f, 1490f, -960f, 1000f) },
                    except = new[] { B(620f, 1040f, 520f, 1000f), B(560f, 1040f, -960f, -780f) }, labelAt = new Vector2(800f, -100f) },
                new RegionSet.Region { id = "cinder", title = "Cinder Pass", detail = "Hairpins in the cloud", color = C("#7a8490"),
                    boxes = new[] { B(-E, -80f, 250f, E) }, labelAt = new Vector2(-536f, 495f) },
                new RegionSet.Region { id = "bellwood", title = "Bellwood", detail = "Temple forest and ridges", color = C("#5f8f4a"),
                    boxes = new[] { B(-E, E, 520f, E) }, labelAt = new Vector2(790f, 760f) },
                new RegionSet.Region { id = "stillwater", title = "Stillwater Terraces", detail = "Paddies and mill village", color = C("#c4a35a"),
                    boxes = new[] { B(-E, -80f, -620f, E) }, labelAt = new Vector2(-760f, -180f) },
                new RegionSet.Region { id = "longshore", title = "Longshore", detail = "Coast, lighthouse, horizon", color = C("#2aa3a8"),
                    labelAt = new Vector2(80f, -1280f) },
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
