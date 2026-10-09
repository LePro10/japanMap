using System.Collections.Generic;
using System.IO;
using JapanMap.Core;
using JapanMap.Editor.Map;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEngine;
using UnityEngine.AI;

namespace JapanMap.Editor.Life
{
    /// <summary>
    /// Bakes the pedestrian NavMesh with Unity's AI Navigation (D23): one NavMeshSurface per place
    /// (volume = place bounds + margin, Tokyo = the city slab), from the physics colliders. Every road
    /// (carriageways, guard rails, viaducts) and every water surface is marked Not Walkable, so a
    /// pedestrian can stand on pavements, squares, the commons court and village ground — never on a
    /// road. Re-running replaces the surfaces and their data (Data/Nav).
    /// </summary>
    public static class PedestrianNav
    {
        public const string Dir = "Assets/_Project/Data/Nav";
        public const string RootName = "Navigation";
        const int NotWalkable = 1;
        // Pedestrian agent: shoulder radius with a little air, kerb-sized climb, no hillsides.
        public const float AgentRadius = 0.3f, AgentHeight = 1.8f, AgentSlope = 35f, AgentClimb = 0.25f;
        const float Margin = 25f;

        [MenuItem("JapanMap/Life/Bake Pedestrian NavMesh")]
        public static string Bake() => Bake(save: true);

        /// <summary>Also the last step of the map import, so the NavMesh never lags behind the roads.</summary>
        public static string Bake(bool save)
        {
            MapScene.OpenGameScene();
            SetAgent();
            var world = MapScene.Root();
            MarkNotWalkable(world.Find("Roads"));
            MarkNotWalkable(world.Find("Water"));
            // Tokyo's ground plate hangs under Roads but is the pavement: the child's modifier wins.
            Mark(world.Find("Roads/CitySlab"), 0);
            // Building boxes: their roofs are flat and would be walkable islands.
            MarkNotWalkable(world.Find("Places/Tokyo/Colliders"));

            var network = AssetDatabase.LoadAssetAtPath<JapanMap.World.RoadNetwork>(RoadImporter.NetworkPath);
            var nav = MapScene.FreshGroup(RootName);
            Directory.CreateDirectory(Dir);
            var report = new List<string>();
            foreach (var (name, bounds) in Areas(world))
            {
                var go = new GameObject("Nav_" + name);
                go.transform.SetParent(nav, false);
                var s = go.AddComponent<NavMeshSurface>();
                s.agentTypeID = 0;
                s.collectObjects = CollectObjects.Volume;
                s.center = bounds.center;
                s.size = bounds.size;
                s.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
                s.layerMask = ~(LayerMask.GetMask(GameLayers.Vehicle, GameLayers.Walker, GameLayers.Pedestrian, GameLayers.Debris, "UI") | Physics.IgnoreRaycastLayer);
                s.overrideVoxelSize = true;
                s.voxelSize = 0.15f; // half the agent radius: 2 m pavements stay open, data stays small
                s.minRegionArea = 4f;
                Build(s, bounds, network);
                var path = $"{Dir}/Nav_{Safe(name)}.asset";
                AssetDatabase.DeleteAsset(path);
                AssetDatabase.CreateAsset(s.navMeshData, path);
                report.Add($"{name}: {new FileInfo(path).Length / 1024} KB");
            }
            AssetDatabase.SaveAssets();
            if (save) MapScene.Save();
            var all = NavMesh.CalculateTriangulation();
            var line = $"[Nav] {report.Count} surfaces, {all.indices.Length / 3} triangles · " + string.Join(" · ", report);
            Debug.Log(line);
            return line;
        }

        /// <summary>
        /// NavMeshSurface.BuildNavMesh plus one Not Walkable box per road segment, exactly the road
        /// network's carriageway (centre ± half width). The road meshes alone are not enough: where the
        /// terrain pokes through a road (commons-drive), its top was walkable.
        /// </summary>
        static void Build(NavMeshSurface s, Bounds bounds, JapanMap.World.RoadNetwork network)
        {
            var sources = new List<NavMeshBuildSource>();
            var markups = new List<NavMeshBuildMarkup>();
            foreach (var m in NavMeshModifier.activeModifiers)
                markups.Add(new NavMeshBuildMarkup { root = m.transform, overrideArea = m.overrideArea, area = m.area, ignoreFromBuild = m.ignoreFromBuild, applyToChildren = m.applyToChildren });
            NavMeshBuilder.CollectSources(bounds, s.layerMask, s.useGeometry, s.defaultArea, markups, sources);
            var carved = 0;
            foreach (var road in network.roads)
            {
                var pts = road.points;
                var segs = road.closed ? pts.Length : pts.Length - 1;
                for (var i = 0; i < segs; i++)
                {
                    var a = pts[i];
                    var b = pts[(i + 1) % pts.Length];
                    var mid = (a + b) * 0.5f;
                    if (!bounds.Contains(mid)) continue;
                    var flat = new Vector3(b.x - a.x, 0f, b.z - a.z);
                    if (flat.sqrMagnitude < 1e-4f) continue;
                    sources.Add(new NavMeshBuildSource
                    {
                        shape = NavMeshBuildSourceShape.ModifierBox,
                        // Overlap at the joints (half a width), so bends leave no walkable wedge.
                        size = new Vector3(road.width, 8f, flat.magnitude + road.width * 0.5f),
                        transform = Matrix4x4.TRS(mid, Quaternion.LookRotation(flat), Vector3.one),
                        area = NotWalkable,
                    });
                    carved++;
                }
            }
            // Walk-in shops are built at runtime; their walls and counters go in as boxes from the data.
            var shops = AssetDatabase.LoadAssetAtPath<JapanMap.Gameplay.Life.InteriorSet>(LifeImport.InteriorsPath);
            if (shops != null)
                foreach (var shop in shops.interiors)
                foreach (var b in shop.boxes)
                {
                    if (!b.solid || !bounds.Contains(b.centre)) continue;
                    sources.Add(new NavMeshBuildSource
                    {
                        shape = NavMeshBuildSourceShape.Box,
                        size = b.size,
                        transform = Matrix4x4.Translate(b.centre),
                        area = NotWalkable, // an obstacle; nobody stands on a counter
                    });
                }
            var settings = NavMesh.GetSettingsByID(s.agentTypeID);
            settings.overrideVoxelSize = s.overrideVoxelSize;
            settings.voxelSize = s.voxelSize;
            settings.minRegionArea = s.minRegionArea;
            var data = NavMeshBuilder.BuildNavMeshData(settings, sources, new Bounds(Vector3.zero, Vector3.one), Vector3.zero, Quaternion.identity);
            NavMeshBuilder.UpdateNavMeshData(data, settings, sources, bounds);
            s.RemoveData();
            s.navMeshData = data;
            s.AddData();
        }

        static string Safe(string n) => n.Replace(" ", "").Replace("&", "");

        /// <summary>Places (from their renderers) and Tokyo (from the city slab), widened by a margin.</summary>
        static IEnumerable<(string, Bounds)> Areas(Transform world)
        {
            var places = world.Find("Places");
            foreach (Transform p in places)
            {
                if (p.name == "Tokyo" || p.name == "Needle Circuit") continue; // Tokyo below; a race track has no pavements
                var rs = p.GetComponentsInChildren<Renderer>(true);
                if (rs.Length == 0) continue;
                var b = rs[0].bounds;
                foreach (var r in rs) b.Encapsulate(r.bounds);
                b.Expand(new Vector3(Margin * 2f, 60f, Margin * 2f));
                yield return (p.name, b);
            }
            var slab = world.Find("Roads/CitySlab");
            if (slab != null && slab.TryGetComponent<Renderer>(out var sr))
            {
                var b = sr.bounds;
                b.Expand(new Vector3(10f, 80f, 10f));
                yield return ("Tokyo", b);
            }
        }

        static void MarkNotWalkable(Transform root) => Mark(root, NotWalkable);

        static void Mark(Transform root, int area)
        {
            if (root == null) return;
            var m = root.GetComponent<NavMeshModifier>() ?? root.gameObject.AddComponent<NavMeshModifier>();
            m.overrideArea = true;
            m.area = area;
            m.applyToChildren = true;
        }

        static void SetAgent()
        {
            var so = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/NavMeshAreas.asset")[0]);
            var agent = so.FindProperty("m_Settings").GetArrayElementAtIndex(0);
            agent.FindPropertyRelative("agentRadius").floatValue = AgentRadius;
            agent.FindPropertyRelative("agentHeight").floatValue = AgentHeight;
            agent.FindPropertyRelative("agentSlope").floatValue = AgentSlope;
            agent.FindPropertyRelative("agentClimb").floatValue = AgentClimb;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
