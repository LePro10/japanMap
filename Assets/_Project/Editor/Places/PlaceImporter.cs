using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using JapanMap.Editor.Map;
using JapanMap.Editor.Vehicles;
using JapanMap.Vehicles;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Places
{
    /// <summary>
    /// Builds the prototype's places (Sakura Commons, Koedo, Kiso, …) from library models:
    /// SourceData/legacy/places/&lt;place&gt;.json (Tools/export-places.mjs) + Data/Places/&lt;Place&gt;.asset
    /// (kind → models). Everything lands under World/Places/&lt;title&gt;/&lt;kind&gt;; a re-import replaces it.
    /// Buildings level the ground under their footprint (<see cref="PlaceGround"/>), small props sit on it.
    /// Kinds without a model are reported, not faked — they are the asset session's list.
    /// Menu: JapanMap/Places/Import All (places + vegetation, because places clear trees).
    /// </summary>
    public static class PlaceImporter
    {
        public const string GroupName = "Places";
        /// <summary>Library entry that means "the fleet car whose legacy id is the item's tag".</summary>
        public const string FleetCar = "@car";

        [MenuItem("JapanMap/Places/Import All")]
        public static void ImportFromMenu()
        {
            Debug.Log(Import());
            Debug.Log(Vegetation.VegetationImporter.Import(Vegetation.VegetationImporter.Settings(), MapImportSettings.LoadOrCreate()));
            MapScene.Save();
        }

        /// <summary>Batch entry (Tools/unity-run.mjs JapanMap.Editor.Places.PlaceImporter.Batch).</summary>
        public static void Batch()
        {
            ImportFromMenu();
            AssetDatabase.SaveAssets();
        }

        public static IEnumerable<PlaceKit> Kits() =>
            AssetDatabase.FindAssets("t:PlaceKit", new[] { PlaceKit.Dir })
                .Select(g => AssetDatabase.LoadAssetAtPath<PlaceKit>(AssetDatabase.GUIDToAssetPath(g)))
                .Where(k => k != null && File.Exists(PlaceSource.PathOf(k.source)))
                .OrderBy(k => k.name);

        /// <summary>One resolved placement: the model and where it goes (y not yet known).</summary>
        public struct Placement
        {
            public PlaceSource.Item item;
            public PlaceKit.Rule rule;
            public GameObject prefab;
            public Vector3 position;
            public float yaw;
            public Vector2 halfSize; // footprint half extents in the model's own x/z, scaled
        }

        public static List<Placement> Resolve(PlaceKit kit, PlaceSource.Place place, Dictionary<string, int> missing = null)
        {
            var list = new List<Placement>();
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath);
            foreach (var item in place.items)
            {
                var rule = kit.Find(item.kind, item.tag);
                if (rule != null && rule.level && rule.library.Length == 0)
                {
                    // Ground only (a forecourt, a car lot): levelled to the item's own size, nothing placed.
                    list.Add(new Placement
                    {
                        item = item, rule = rule,
                        position = PlaceSource.ToUnity(item.x, item.z),
                        yaw = PlaceSource.Yaw(item.yaw) + rule.yaw,
                        halfSize = new Vector2(item.w, item.d) / 2,
                    });
                    continue;
                }
                var options = rule == null ? new GameObject[0] : rule.library.Select(n => Load(n, item, fleet)).Where(g => g != null).ToArray();
                if (options.Length == 0)
                {
                    if (missing != null)
                    {
                        var key = string.IsNullOrEmpty(item.tag) ? item.kind : $"{item.kind} ({item.tag})";
                        missing[key] = missing.GetValueOrDefault(key) + 1;
                    }
                    continue;
                }
                var prefab = options[Variant(item.x, item.z, options.Length)];
                var size = FootprintOf(prefab) * rule.scale;
                list.Add(new Placement
                {
                    item = item, rule = rule, prefab = prefab,
                    position = PlaceSource.ToUnity(item.x, item.z) + Quaternion.Euler(0, PlaceSource.Yaw(item.yaw), 0) * new Vector3(rule.offset.x, 0, rule.offset.y),
                    yaw = PlaceSource.Yaw(item.yaw) + rule.yaw,
                    halfSize = size / 2,
                });
            }
            return list;
        }

        static GameObject Load(string name, PlaceSource.Item item, VehicleFleet fleet)
        {
            if (name != FleetCar) return Art.LibraryImporter.LoadPrefab(name);
            return fleet == null ? null : fleet.vehicles.FirstOrDefault(v => v.legacyId == item.tag)?.model;
        }

        /// <summary>Stable pick from the position, so a re-import gives the same model at the same place.</summary>
        public static int Variant(float x, float z, int count)
        {
            if (count <= 1) return 0;
            var h = Mathf.FloorToInt(x * 7.13f) * 73856093 ^ Mathf.FloorToInt(z * 5.71f) * 19349663;
            return (int)((uint)h % (uint)count);
        }

        /// <summary>LOD0 render bounds of a prefab on the ground plane (x, z).</summary>
        public static Vector2 FootprintOf(GameObject prefab)
        {
            var b = new Bounds();
            var any = false;
            foreach (var r in prefab.GetComponentsInChildren<MeshFilter>(true))
            {
                if (r.sharedMesh == null || r.name.Contains("_LOD1") || r.name.Contains("_LOD2")) continue;
                var m = prefab.transform.worldToLocalMatrix * r.transform.localToWorldMatrix;
                var mb = r.sharedMesh.bounds;
                for (var i = 0; i < 8; i++)
                {
                    var c = mb.center + Vector3.Scale(mb.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                    var p = m.MultiplyPoint3x4(c);
                    if (!any) { b = new Bounds(p, Vector3.zero); any = true; }
                    else b.Encapsulate(p);
                }
            }
            return any ? new Vector2(Mathf.Max(Mathf.Abs(b.min.x), Mathf.Abs(b.max.x)) * 2, Mathf.Max(Mathf.Abs(b.min.z), Mathf.Abs(b.max.z)) * 2) : Vector2.one;
        }

        /// <summary>Footprints to level, for every kit (also called by the terrain import).</summary>
        public static List<PlaceGround.Pad> Pads()
        {
            var pads = new List<PlaceGround.Pad>();
            var layers = MapImportSettings.LoadOrCreate().splatLayers.Select(l => l.name).ToList();
            foreach (var kit in Kits())
                foreach (var p in Resolve(kit, PlaceSource.Load(kit.source)))
                    if (p.rule.level && !p.item.fixedY)
                        pads.Add(new PlaceGround.Pad
                        {
                            center = p.position, yaw = p.yaw, half = p.halfSize, blend = kit.levelBlend,
                            paint = string.IsNullOrEmpty(p.rule.paint) ? -1 : layers.IndexOf(p.rule.paint),
                            paintOnly = p.rule.paintOnly,
                        });
            return pads;
        }

        public static string Import()
        {
            var report = new StringBuilder();
            var level = PlaceGround.Level(Pads(), MapImportSettings.LoadOrCreate());
            report.Append($"[Places] ground levelled under {level.pads} footprints ({level.texels} texels, max change {level.maxChange:F2} m, {level.roadTexels} texels left to the roads)");
            var group = MapScene.FreshGroup(GroupName);
            var missingAll = new SortedDictionary<string, int>();
            foreach (var kit in Kits())
            {
                var place = PlaceSource.Load(kit.source);
                var root = new GameObject(place.title).transform;
                root.SetParent(group, false);
                var missing = new Dictionary<string, int>();
                var placed = Resolve(kit, place, missing);
                var parents = new Dictionary<string, Transform>();
                foreach (var p in placed)
                {
                    if (p.prefab == null) continue;
                    if (!parents.TryGetValue(p.item.kind, out var parent))
                    {
                        parent = new GameObject(p.item.kind).transform;
                        parent.SetParent(root, false);
                        parents[p.item.kind] = parent;
                    }
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(p.prefab, parent);
                    go.name = $"{p.item.kind}_{parent.childCount - 1:D3}";
                    var pos = p.position;
                    pos.y = p.item.fixedY ? p.item.y : Ground(pos);
                    pos.y += p.rule.yOffset;
                    go.transform.SetPositionAndRotation(pos, Quaternion.Euler(0, p.yaw, 0));
                    go.transform.localScale = Vector3.one * p.rule.scale;
                    if (p.rule.library.Contains(FleetCar)) PrepareShowCar(go);
                }
                if (place.hasSpawn) SetSpawn(place.spawn);
                foreach (var m in missing) missingAll[$"{place.title}: {m.Key}"] = m.Value;
                report.Append($"\n[Places] {place.title}: {placed.Count(p => p.prefab != null)} models from {placed.Where(p => p.prefab != null).Select(p => p.prefab).Distinct().Count()} prefabs, {place.trees.Length} trees" +
                              (missing.Count > 0 ? $", {missing.Values.Sum()} without model" : ""));
            }
            if (missingAll.Count > 0)
                report.Append("\n[Places] no model yet (asset session): " + string.Join(", ", missingAll.Select(m => $"{m.Key} ×{m.Value}")));
            return report.ToString();
        }

        public static float Ground(Vector3 p)
        {
            var tile = TerrainImporter.TileAt(p);
            return tile == null ? 0 : tile.SampleHeight(p) + tile.transform.position.y;
        }

        /// <summary>A display car: model only, static, no physics (the fleet prefab has none of the drive scripts).</summary>
        static void PrepareShowCar(GameObject go)
        {
            foreach (var t in go.GetComponentsInChildren<Transform>())
                GameObjectUtility.SetStaticEditorFlags(t.gameObject, (StaticEditorFlags)~0 & ~StaticEditorFlags.ContributeGI);
        }

        /// <summary>Spawn from the place that has one (PlayerSetup calls this too). False: none found.</summary>
        public static bool ApplySpawn()
        {
            foreach (var kit in Kits())
            {
                var place = PlaceSource.Load(kit.source);
                if (!place.hasSpawn) continue;
                SetSpawn(place.spawn);
                return true;
            }
            return false;
        }

        /// <summary>The player's car starts here (prototype: Sakura Commons, WP2). Placed as is, not snapped to a road.</summary>
        static void SetSpawn(PlaceSource.Spawn s)
        {
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            if (spawner == null) { Debug.LogWarning("[Places] no PlayerCarSpawner in Game.unity — spawn not set"); return; }
            var at = PlaceSource.ToUnity(s.x, s.z);
            at.y = Ground(at);
            var so = new SerializedObject(spawner);
            so.FindProperty("spawnPoint").vector3Value = at;
            // Unity heading: clockwise from +Z; legacy yaw counter-clockwise from +Z with z mirrored.
            so.FindProperty("spawnHeading").floatValue = Mathf.Repeat(PlaceSource.Yaw(s.yaw), 360f);
            so.FindProperty("snapToRoad").boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
