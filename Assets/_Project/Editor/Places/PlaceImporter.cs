using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using JapanMap.Editor.Map;
using JapanMap.Editor.Vehicles;
using JapanMap.Vehicles;
using JapanMap.World;
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
    /// Menu: JapanMap/Places/Import All (= the whole map import: pads, places, then the trees they clear).
    /// </summary>
    public static class PlaceImporter
    {
        public const string GroupName = "Places";
        /// <summary>Library entry that means "the fleet car whose legacy id is the item's tag".</summary>
        public const string FleetCar = "@car";
        /// <summary>Library entry for a flat water surface of the item's size at its height (canal, pond).</summary>
        public const string WaterSurface = "@water";

        /// <summary>
        /// The whole map import (≈ 4 s): building pads are levelled from the raw terrain inside the terrain
        /// import, so levelling again on top of a levelled terrain is not repeatable (overlapping pads
        /// moved the ground by up to 0.85 m per run).
        /// </summary>
        [MenuItem("JapanMap/Places/Import All")]
        public static void ImportFromMenu()
        {
            MapImport.ImportAll();
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
            /// <summary>Pivot of the model (where it is instantiated).</summary>
            public Vector3 position;
            /// <summary>Centre of the footprint (levelling, checks) — differs from the pivot for end-pivoted pieces.</summary>
            public Vector3 centre;
            public float yaw;
            public Vector3 scale;
            public Vector2 halfSize; // footprint half extents in the model's own x/z, scaled
        }

        public static List<Placement> Resolve(PlaceKit kit, PlaceSource.Place place, Dictionary<string, int> missing = null)
        {
            var list = new List<Placement>();
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath);
            foreach (var item in place.items)
            {
                var rule = kit.Find(item.kind, item.tag, item.h);
                var yaw = PlaceSource.Yaw(item.yaw);
                var turn = Quaternion.Euler(0, yaw, 0);
                var at = PlaceSource.ToUnity(item.x, item.z);
                if (rule != null && rule.library.Length == 1 && rule.library[0] == WaterSurface)
                {
                    list.Add(new Placement { item = item, rule = rule, position = at, centre = at, yaw = yaw + rule.yaw, scale = Vector3.one, halfSize = new Vector2(item.w, item.d) / 2 });
                    continue;
                }
                if (rule != null && rule.level && rule.library.Length == 0)
                {
                    // Ground only (a forecourt, a car lot): levelled to the item's own size, nothing placed.
                    list.Add(new Placement { item = item, rule = rule, position = at, centre = at, yaw = yaw + rule.yaw, scale = Vector3.one, halfSize = new Vector2(item.w, item.d) / 2 });
                    continue;
                }
                var options = rule == null ? new GameObject[0] : rule.library.Select(n => Load(n, item, fleet)).Where(g => g != null).ToArray();
                if (rule != null && rule.fitFootprint && item.w > 0 && item.d > 0)
                {
                    // A tower must fit its parcel within the stretch limit; else the parcel keeps the low
                    // frontage (two towers hung over the 7 m takeshita lane).
                    var fits = options.Where(o => item.w / SizeOf(o).x >= 0.6f && item.d / SizeOf(o).z >= 0.6f).ToArray();
                    if (fits.Length > 0) options = fits;
                    else
                    {
                        rule = kit.Find(item.kind, item.tag, 0f);
                        options = rule == null ? new GameObject[0] : rule.library.Select(n => Load(n, item, fleet)).Where(g => g != null).ToArray();
                    }
                }
                if (options.Length == 0)
                {
                    if (missing != null)
                    {
                        var key = string.IsNullOrEmpty(item.tag) || item.tag.Length > 24 ? item.kind : $"{item.kind} ({item.tag})";
                        missing[key] = missing.GetValueOrDefault(key) + 1;
                    }
                    continue;
                }
                at += turn * new Vector3(rule.offset.x, 0, rule.offset.y);
                if (rule.matchHeight && item.h > 0)
                {
                    // The models closest to the prototype's height (± 25 % of the best match) — a 5-storey
                    // parcel gets 4–6 storey fronts, never a 3-storey konbini.
                    var best = options.Min(o => Mathf.Abs(SizeOf(o).y - item.h));
                    options = options.Where(o => Mathf.Abs(SizeOf(o).y - item.h) <= best + 0.25f * item.h).ToArray();
                }
                if (!rule.fill || item.w <= 0)
                {
                    var prefab = options[Variant(item.x, item.z, options.Length)];
                    var size = SizeOf(prefab);
                    var scale = rule.scale;
                    // footprint in the item's frame: a model turned by ±90° lies across
                    var across = Mathf.Abs(Mathf.Sin(rule.yaw * Mathf.Deg2Rad)) > 0.7f;
                    var fx = across ? size.z : size.x;
                    var fz = across ? size.x : size.z;
                    if (rule.fitUniform && item.w > 0 && item.d > 0) scale *= Mathf.Min(item.w / fx, item.d / fz);
                    var sv = Vector3.one * scale;
                    // A tower keeps its height and fills the parcel (facade texels stretch at most ±40 %).
                    if (rule.fitFootprint && item.w > 0 && item.d > 0)
                        sv = new Vector3(Mathf.Clamp(item.w / size.x, 0.6f, 1.4f), 1f, Mathf.Clamp(item.d / size.z, 0.6f, 1.4f)) * scale;
                    list.Add(new Placement
                    {
                        item = item, rule = rule, prefab = prefab, position = PivotFor(at, yaw + rule.yaw, prefab, sv), centre = at, yaw = yaw + rule.yaw,
                        scale = sv, halfSize = new Vector2(size.x * sv.x, size.z * sv.z) / 2,
                    });
                    continue;
                }
                // Fill the frontage with modules side by side (the prototype's 30–50 m fronts of 8–14 m shops):
                // n modules of equal width, each stretched to it within ±35 %, depth fitted to the parcel.
                var meanW = options.Average(o => SizeOf(o).x);
                var n = Mathf.Max(1, Mathf.RoundToInt(item.w / meanW));
                var module = item.w / n;
                for (var k = 0; k < n; k++)
                {
                    var centre = at + turn * new Vector3(-item.w / 2 + (k + 0.5f) * module, 0, 0);
                    // Models that fit the module within ±35 % (else the closest), stretched exactly to it:
                    // a clamped stretch let a 5 m front poke 1 m into a side street.
                    var fitting = options.Where(o => Mathf.Abs(Mathf.Log(module / SizeOf(o).x)) < 0.3f).ToArray();
                    if (fitting.Length == 0) fitting = new[] { options.OrderBy(o => Mathf.Abs(Mathf.Log(module / SizeOf(o).x))).First() };
                    var prefab = fitting[Variant(centre.x, centre.z, fitting.Length)];
                    var size = SizeOf(prefab);
                    var sx = module / size.x;
                    var sz = item.d > 0 ? Mathf.Clamp(item.d / size.z, 0.6f, 1.25f) : 1;
                    // Front on the building line: depth the parcel cannot take goes behind, into the block; a
                    // parcel deeper than the model (Koedo brewery, 40 m) keeps its yard behind the house.
                    if (item.d > 0) centre += turn * new Vector3(0, 0, (item.d - size.z * sz) / 2);
                    var sc = new Vector3(sx, 1, sz) * rule.scale;
                    list.Add(new Placement
                    {
                        item = item, rule = rule, prefab = prefab, position = PivotFor(centre, yaw + rule.yaw, prefab, sc), centre = centre, yaw = yaw + rule.yaw,
                        scale = sc, halfSize = new Vector2(size.x * sx, size.z * sz) * rule.scale / 2,
                    });
                }
            }
            return list;
        }

        static readonly Dictionary<GameObject, Vector3> Sizes = new();

        /// <summary>LOD0 render size of a prefab: footprint (x, z; centre in <see cref="CentreOf"/>) and height.</summary>
        public static Vector3 SizeOf(GameObject prefab)
        {
            if (Sizes.TryGetValue(prefab, out var s)) return s;
            var f = FootprintOf(prefab);
            var h = 0f;
            foreach (var mf in prefab.GetComponentsInChildren<MeshFilter>(true))
                if (mf.sharedMesh != null && !mf.name.Contains("_LOD1") && !mf.name.Contains("_LOD2"))
                    h = Mathf.Max(h, (prefab.transform.worldToLocalMatrix * mf.transform.localToWorldMatrix).MultiplyPoint3x4(mf.sharedMesh.bounds.max).y);
            return Sizes[prefab] = new Vector3(f.x, h, f.y);
        }

        static GameObject Load(string name, PlaceSource.Item item, VehicleFleet fleet)
        {
            if (name != FleetCar) return Art.LibraryImporter.LoadPrefab(name);
            return fleet == null ? null : fleet.vehicles.FirstOrDefault(v => v.legacyId == item.tag)?.EditorModel;
        }

        /// <summary>Stable pick from the position, so a re-import gives the same model at the same place.</summary>
        public static int Variant(float x, float z, int count)
        {
            if (count <= 1) return 0;
            var h = Mathf.FloorToInt(x * 7.13f) * 73856093 ^ Mathf.FloorToInt(z * 5.71f) * 19349663;
            return (int)((uint)h % (uint)count);
        }

        /// <summary>LOD0 render bounds of a prefab's body (without hanging signs) on the ground plane (x, z).</summary>
        public static Vector2 FootprintOf(GameObject prefab)
        {
            var b = new Bounds();
            var any = false;
            foreach (var r in prefab.GetComponentsInChildren<MeshFilter>(true))
            {
                // signs hang over the pavement; the footprint is the body
                if (r.sharedMesh == null || r.name.Contains("_LOD1") || r.name.Contains("_LOD2") || r.name.Contains("_Signs")) continue;
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
            Centres[prefab] = any ? new Vector2(b.center.x, b.center.z) : Vector2.zero;
            return any ? new Vector2(b.size.x, b.size.z) : Vector2.one;
        }

        static readonly Dictionary<GameObject, Vector2> Centres = new();

        /// <summary>
        /// Footprint centre relative to the pivot (x, z). Rails, fences and wall pieces have their pivot at
        /// one end (GuardRail_4m: centre at x −2.0) — placed by the pivot they sat 2 m off their spot.
        /// </summary>
        public static Vector2 CentreOf(GameObject prefab)
        {
            if (!Centres.ContainsKey(prefab)) FootprintOf(prefab);
            return Centres[prefab];
        }

        /// <summary>Pivot position that puts the model's footprint centre at <paramref name="at"/>.</summary>
        static Vector3 PivotFor(Vector3 at, float yaw, GameObject prefab, Vector3 scale)
        {
            var c = CentreOf(prefab);
            return at - Quaternion.Euler(0, yaw, 0) * new Vector3(c.x * scale.x, 0, c.y * scale.z);
        }

        /// <summary>Footprints to level, for every kit (also called by the terrain import).</summary>
        public static List<PlaceGround.Pad> Pads()
        {
            var pads = new List<PlaceGround.Pad>();
            var layers = MapImportSettings.LoadOrCreate().splatLayers.Select(l => l.name).ToList();
            foreach (var kit in Kits())
                foreach (var p in Resolve(kit, PlaceSource.Load(kit.source)))
                    if (p.rule.level && (!p.item.fixedY || p.prefab == null))
                        pads.Add(new PlaceGround.Pad
                        {
                            center = p.centre, yaw = p.yaw, half = p.halfSize, blend = kit.levelBlend,
                            fixedLevel = p.item.fixedY ? p.item.y : float.NaN,
                            paint = string.IsNullOrEmpty(p.rule.paint) ? -1 : layers.IndexOf(p.rule.paint),
                            paintOnly = p.rule.paintOnly,
                        });
            return pads;
        }

        public static string Import()
        {
            var report = new StringBuilder("[Places] ground: levelled by the terrain import");
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
                if (kit.instanced) report.Append("\n" + BuildInstanced(kit, placed, root));
                foreach (var p in placed.Where(p => p.prefab == null && p.rule.library.Contains(WaterSurface)))
                    AddWater(root, p);
                foreach (var p in placed)
                {
                    if (p.prefab == null || kit.instanced) continue;
                    if (!parents.TryGetValue(p.item.kind, out var parent))
                    {
                        parent = new GameObject(p.item.kind).transform;
                        parent.SetParent(root, false);
                        parents[p.item.kind] = parent;
                    }
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(p.prefab, parent);
                    go.name = $"{p.item.kind}_{parent.childCount - 1:D3}";
                    var pos = p.position;
                    pos.y = p.item.fixedY ? p.item.y : Ground(p.centre); // the pad is levelled around the footprint centre
                    pos.y += p.rule.yOffset;
                    go.transform.SetPositionAndRotation(pos, Quaternion.Euler(0, p.yaw, 0));
                    go.transform.localScale = p.scale;
                    if (p.rule.library.Contains(FleetCar)) PrepareShowCar(go);
                }
                var cables = Cables(kit, placed, root);
                if (cables > 0) report.Append($"\n[Places] {place.title}: {cables} cable spans");
                if (place.hasSpawn) SetSpawn(place.spawn, place.hasWalkSpawn ? PlaceSource.ToUnity(place.walkSpawn.x, place.walkSpawn.z) : null);
                foreach (var m in missing) missingAll[$"{place.title}: {m.Key}"] = m.Value;
                report.Append($"\n[Places] {place.title}: {placed.Count(p => p.prefab != null)} models from {placed.Where(p => p.prefab != null).Select(p => p.prefab).Distinct().Count()} prefabs, {place.trees.Length} trees" +
                              (missing.Count > 0 ? $", {missing.Values.Sum()} without model" : ""));
            }
            if (missingAll.Count > 0)
                report.Append("\n[Places] no model yet (asset session): " + string.Join(", ", missingAll.Select(m => $"{m.Key} ×{m.Value}")));
            return report.ToString();
        }

        /// <summary>
        /// Rebuilds only the cables of every place in its open scene (no full import: that rewrites ~100 scenes with new
        /// file ids). Exec: JapanMap.Editor.Places.PlaceImporter.RefreshCables().
        /// </summary>
        public static string RefreshCables()
        {
            var report = new StringBuilder();
            foreach (var kit in Kits())
            {
                var place = PlaceSource.Load(kit.source);
                Transform root = null;
                for (var i = 0; i < UnityEngine.SceneManagement.SceneManager.sceneCount && root == null; i++)
                    foreach (var go in UnityEngine.SceneManagement.SceneManager.GetSceneAt(i).GetRootGameObjects())
                    {
                        var t = go.transform.Find(place.title) ?? (go.name == place.title ? go.transform : null);
                        if (t != null) { root = t; break; }
                    }
                if (root == null) { report.Append($"{place.title}: not open; "); continue; }
                var n = Cables(kit, Resolve(kit, place), root);
                UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(root.gameObject.scene);
                UnityEditor.SceneManagement.EditorSceneManager.SaveScene(root.gameObject.scene);
                report.Append($"{place.title}: {n} spans; ");
            }
            return report.ToString();
        }

        /// <summary>Utility poles of a place wired to their neighbour along the street (file order), like the rural line.</summary>
        static int Cables(PlaceKit kit, List<Placement> placed, Transform root)
        {
            var s = MapImportSettings.LoadOrCreate();
            var poles = placed.Where(p => p.prefab != null && p.item.kind == s.placeCablePole)
                .Select(p =>
                {
                    var pos = p.position;
                    pos.y = (p.item.fixedY ? p.item.y : Ground(p.centre)) + p.rule.yOffset;
                    return Matrix4x4.TRS(pos, Quaternion.Euler(0, p.yaw, 0), p.scale);
                }).ToList();
            return poles.Count < 2 ? 0 : Map.PowerCables.Build(poles, root, $"{PlaceKit.Dir}/{kit.name}Cables.asset", s.placeCableMaxSpan, s);
        }

        /// <summary>Distance at which an object of <paramref name="size"/> m covers <paramref name="screen"/> of a 60° view's height (LODGroup thresholds → metres).</summary>
        public static float DistanceForScreen(float size, float screen) => size / (2f * Mathf.Tan(30f * Mathf.Deg2Rad) * Mathf.Max(1e-3f, screen));

        public static string InstancesPath(PlaceKit kit) => $"{PlaceKit.Dir}/{kit.name}Instances.asset";

        /// <summary>
        /// Instanced build: every LOD chain of every model becomes a prototype (mesh per LOD, its material,
        /// LOD ends from the library's LODGroup thresholds and the model's size); instances sorted into
        /// 64 m chunks. Collision: one box per legacy item (the prototype's own building volume).
        /// </summary>
        static string BuildInstanced(PlaceKit kit, List<Placement> placed, Transform root)
        {
            var protoIndex = new Dictionary<(GameObject, int), int>();
            var protos = new List<InstanceData.Prototype>();
            var parts = new Dictionary<GameObject, List<(int proto, Matrix4x4 local)>>();
            var instances = new List<(Vector2Int chunk, int proto, Matrix4x4 m, Vector3 pos)>();
            const float chunk = 64f;
            foreach (var p in placed)
            {
                if (p.prefab == null) continue;
                if (!parts.TryGetValue(p.prefab, out var chains)) parts[p.prefab] = chains = Chains(kit, p.prefab, protos, protoIndex);
                var pos = p.position;
                pos.y = (p.item.fixedY ? p.item.y : Ground(p.centre)) + p.rule.yOffset;
                var m = Matrix4x4.TRS(pos, Quaternion.Euler(0, p.yaw, 0), p.scale);
                var c = new Vector2Int(Mathf.FloorToInt(pos.x / chunk), Mathf.FloorToInt(pos.z / chunk));
                foreach (var (proto, local) in chains) instances.Add((c, proto, m * local, pos));
            }

            var data = AssetDatabase.LoadAssetAtPath<PlaceInstanceData>(InstancesPath(kit));
            if (data == null)
            {
                data = ScriptableObject.CreateInstance<PlaceInstanceData>();
                AssetDatabase.CreateAsset(data, InstancesPath(kit));
            }
            var sorted = instances.OrderBy(i => i.chunk.y).ThenBy(i => i.chunk.x).ThenBy(i => i.proto).ToList();
            var chunks = new List<InstanceData.Chunk>();
            for (var s0 = 0; s0 < sorted.Count;)
            {
                var key = sorted[s0].chunk;
                var e = s0;
                var b = new Bounds(sorted[s0].pos, Vector3.zero);
                var runs = new List<InstanceData.Run>();
                while (e < sorted.Count && sorted[e].chunk == key)
                {
                    var r0 = e;
                    while (e < sorted.Count && sorted[e].chunk == key && sorted[e].proto == sorted[r0].proto)
                    {
                        var mesh = protos[sorted[e].proto].lods[0];
                        b.Encapsulate(GeometryUtility.CalculateBounds(Corners(mesh.bounds), sorted[e].m));
                        e++;
                    }
                    runs.Add(new InstanceData.Run { prototype = sorted[r0].proto, start = r0, count = e - r0 });
                }
                chunks.Add(new InstanceData.Chunk { bounds = b, runs = runs.ToArray() });
                s0 = e;
            }
            data.chunkSize = chunk;
            data.prototypes = protos.ToArray();
            data.chunks = chunks.ToArray();
            data.positions = sorted.Select(i => i.m.GetPosition()).ToArray();
            data.matrices = sorted.Select(i => i.m).ToArray();
            EditorUtility.SetDirty(data);

            var draw = new GameObject("Models");
            draw.transform.SetParent(root, false);
            var renderer = draw.AddComponent<JapanMap.World.InstanceRenderer>();
            renderer.data = data;
            renderer.maxDistance = 6000; // each prototype ends at its own cull distance
            renderer.Build(); // OnEnable ran before data was assigned

            var colliders = new GameObject("Colliders").transform;
            colliders.SetParent(root, false);
            var boxes = 0;
            foreach (var g in placed.Where(p => p.prefab != null).GroupBy(p => p.item))
            {
                var it = g.Key;
                var first = g.First();
                var size = it.w > 0 && it.d > 0 ? new Vector3(it.w, it.h > 0 ? it.h : SizeOf(first.prefab).y, it.d) : SizeOf(first.prefab);
                var centre = g.Count() == 1 ? first.position : PlaceSource.ToUnity(it.x, it.z) + Quaternion.Euler(0, PlaceSource.Yaw(it.yaw), 0) * new Vector3(first.rule.offset.x, 0, first.rule.offset.y);
                centre.y = (it.fixedY ? it.y : Ground(centre)) + first.rule.yOffset;
                var go = new GameObject($"{it.kind}_{boxes:D4}");
                go.transform.SetParent(colliders, false);
                go.transform.SetPositionAndRotation(centre, Quaternion.Euler(0, first.yaw, 0));
                var box = go.AddComponent<BoxCollider>();
                box.center = new Vector3(0, size.y / 2, 0);
                box.size = size;
                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.NavigationStatic);
                boxes++;
            }
            AssetDatabase.SaveAssets();
            return $"[Places] {kit.name}: {data.Count} instances of {protos.Count} prototypes in {chunks.Count} chunks, {boxes} colliders";
        }

        static Vector3[] Corners(Bounds b)
        {
            var c = new Vector3[8];
            for (var i = 0; i < 8; i++)
                c[i] = b.center + Vector3.Scale(b.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
            return c;
        }

        /// <summary>
        /// LOD chains of a library prefab: renderer i of LOD0 continues as renderer i of LOD1 (main body,
        /// signs, …). Each chain is one prototype; its matrix relative to the prefab root comes along.
        /// </summary>
        static List<(int, Matrix4x4)> Chains(PlaceKit kit, GameObject prefab, List<InstanceData.Prototype> protos, Dictionary<(GameObject, int), int> index)
        {
            var result = new List<(int, Matrix4x4)>();
            var lodGroup = prefab.GetComponent<LODGroup>();
            var lods = lodGroup != null ? lodGroup.GetLODs() : new[] { new LOD(0.01f, prefab.GetComponentsInChildren<MeshRenderer>()) };
            var height = Mathf.Max(1f, SizeOf(prefab).y);
            var size = Mathf.Max(height, SizeOf(prefab).x);
            var chains = lods[0].renderers.Length;
            for (var r = 0; r < chains; r++)
            {
                var first = lods[0].renderers[r];
                if (first == null) continue;
                var meshes = new List<Mesh>();
                var ends = new List<float>();
                for (var l = 0; l < lods.Length; l++)
                {
                    var rr = l < lods.Length && r < lods[l].renderers.Length ? lods[l].renderers[r] : null;
                    var mf = rr != null ? rr.GetComponent<MeshFilter>() : null;
                    if (mf == null || mf.sharedMesh == null) break;
                    meshes.Add(mf.sharedMesh);
                    var last = l == lods.Length - 1;
                    var end = DistanceForScreen(size, lods[l].screenRelativeTransitionHeight) * (last ? kit.cullDistanceScale : kit.lodDistanceScale);
                    // Full detail ends by 100 m whatever the size: a 90 m tower's screen share kept LOD0 to 147 m.
                    if (l == 0 && !last) end = Mathf.Min(end, 100f);
                    ends.Add(end);
                }
                if (meshes.Count == 0) continue;
                if (meshes.Count == 1)
                {
                    // the renderer needs two levels; the second is never reached (it starts at the cull distance)
                    meshes.Add(meshes[0]);
                    ends.Add(ends[0]);
                }
                Material[] lodMaterials = null;
                if (kit.shellDistance > 0 && meshes.Count == 2)
                {
                    // ends = [LOD0 end, cull]. The main body (chain 0) continues as a shell to the cull distance;
                    // attachments (signs, chain > 0) simply end where the shell begins.
                    var cull = ends[1];
                    var shellAt = Mathf.Min(kit.shellDistance, cull);
                    ends[1] = shellAt;
                    if (r == 0)
                    {
                        meshes.Add(Shell(prefab, meshes[0]));
                        ends.Add(cull);
                        lodMaterials = new[] { null, null, ShellMaterial() };
                    }
                }
                var key = (prefab, r);
                if (!index.TryGetValue(key, out var proto))
                {
                    proto = protos.Count;
                    index[key] = proto;
                    protos.Add(new InstanceData.Prototype
                    {
                        name = $"{prefab.name}#{r}",
                        lods = meshes.ToArray(),
                        material = first.sharedMaterial,
                        lodEnd = ends.Take(meshes.Count - 1).ToArray(),
                        maxDistance = ends[meshes.Count - 1],
                        shadowLods = 1, // far LODs cast none: instanced draws are not culled per cascade
                        shadowProxyLod = kit.shadowFromLastLod ? 1 : -1,
                        lodMaterials = lodMaterials,
                    });
                }
                result.Add((proto, prefab.transform.worldToLocalMatrix * first.transform.localToWorldMatrix));
            }
            return result;
        }

        public const string ShellDir = "Assets/_Project/Art/Places/Shells";
        public const string ShellMaterialPath = "Assets/_Project/Art/Places/M_PlaceShell.mat";

        /// <summary>Box of the mesh's bounds without its floor: what a building is at 300 m in rain and dusk.</summary>
        static Mesh Shell(GameObject prefab, Mesh body)
        {
            Directory.CreateDirectory(ShellDir);
            var path = $"{ShellDir}/SM_{prefab.name}_Shell.asset";
            var b = body.bounds;
            Vector3 min = b.min, max = b.max;
            var v = new List<Vector3>();
            var n = new List<Vector3>();
            var uv = new List<Vector2>();
            var t = new List<int>();
            // UV in window bays: the shell texture holds ShellBays × ShellBays bays of ShellBay metres.
            const float span = ShellBay * ShellBays;
            void Face(Vector3 a, Vector3 bb, Vector3 c, Vector3 d, Vector3 normal)
            {
                var i = v.Count;
                v.AddRange(new[] { a, bb, c, d });
                n.AddRange(new[] { normal, normal, normal, normal });
                if (normal == Vector3.up) uv.AddRange(new[] { Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero }); // roof: wall texel
                else
                {
                    var w = Vector3.Distance(a, d);
                    var h = bb.y - a.y;
                    // offset by position so neighbouring shells do not repeat the same lit windows
                    var o = new Vector2(Mathf.Abs(a.x * 0.37f + a.z * 0.61f) % span, 0) / span;
                    uv.AddRange(new[] { o, o + new Vector2(0, h / span), o + new Vector2(w / span, h / span), o + new Vector2(w / span, 0) });
                }
                t.AddRange(new[] { i, i + 1, i + 2, i, i + 2, i + 3 });
            }
            Face(new Vector3(min.x, min.y, max.z), new Vector3(min.x, max.y, max.z), new Vector3(max.x, max.y, max.z), new Vector3(max.x, min.y, max.z), Vector3.forward);
            Face(new Vector3(max.x, min.y, min.z), new Vector3(max.x, max.y, min.z), new Vector3(min.x, max.y, min.z), new Vector3(min.x, min.y, min.z), Vector3.back);
            Face(new Vector3(max.x, min.y, max.z), new Vector3(max.x, max.y, max.z), new Vector3(max.x, max.y, min.z), new Vector3(max.x, min.y, min.z), Vector3.right);
            Face(new Vector3(min.x, min.y, min.z), new Vector3(min.x, max.y, min.z), new Vector3(min.x, max.y, max.z), new Vector3(min.x, min.y, max.z), Vector3.left);
            Face(new Vector3(min.x, max.y, max.z), new Vector3(min.x, max.y, min.z), new Vector3(max.x, max.y, min.z), new Vector3(max.x, max.y, max.z), Vector3.up);
            var mesh = new Mesh { name = $"SM_{prefab.name}_Shell" };
            mesh.SetVertices(v);
            mesh.SetNormals(n);
            mesh.SetUVs(0, uv);
            mesh.SetTriangles(t, 0);
            mesh.RecalculateBounds();
            return Map.MeshAssets.Save(path, mesh);
        }

        const float ShellBay = 3.2f;  // m per window bay (storey height)
        const int ShellBays = 16;     // bays per texture side
        const int BayPixels = 8;

        /// <summary>
        /// Distant buildings: dark wall, glass bays, one in three windows lit warm (ASTRA §3 "only one
        /// in three upper-storey windows is lit"). Texel (0, 0) is wall — the roof samples it.
        /// </summary>
        static Material ShellMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(ShellMaterialPath);
            if (mat != null) return mat;
            Directory.CreateDirectory(Path.GetDirectoryName(ShellMaterialPath));
            var size = ShellBays * BayPixels;
            var baseTex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var glowTex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var rnd = new System.Random(20261008);
            var wall = new Color(0.46f, 0.4f, 0.34f);   // mean facade tone of the Tokyo atlas at dusk (beige render, look-shell)
            var glass = new Color(0.12f, 0.13f, 0.16f);
            for (var by = 0; by < ShellBays; by++)
            for (var bx = 0; bx < ShellBays; bx++)
            {
                var lit = rnd.NextDouble() < 0.33;
                var warm = Color.Lerp(new Color(1f, 0.78f, 0.5f), new Color(0.75f, 0.85f, 1f), (float)rnd.NextDouble() * 0.4f) * (0.5f + (float)rnd.NextDouble() * 0.5f);
                for (var py = 0; py < BayPixels; py++)
                for (var px = 0; px < BayPixels; px++)
                {
                    var window = px >= 2 && px <= 5 && py >= 2 && py <= 5 && !(bx == 0 && by == 0);
                    var x = bx * BayPixels + px;
                    var y = by * BayPixels + py;
                    baseTex.SetPixel(x, y, window ? glass : wall);
                    glowTex.SetPixel(x, y, window && lit ? warm : Color.black);
                }
            }
            var basePath = Path.Combine(Path.GetDirectoryName(ShellMaterialPath), "T_PlaceShell_Base.png");
            var glowPath = Path.Combine(Path.GetDirectoryName(ShellMaterialPath), "T_PlaceShell_Emission.png");
            File.WriteAllBytes(basePath, baseTex.EncodeToPNG());
            File.WriteAllBytes(glowPath, glowTex.EncodeToPNG());
            Object.DestroyImmediate(baseTex);
            Object.DestroyImmediate(glowTex);
            AssetDatabase.ImportAsset(basePath);
            AssetDatabase.ImportAsset(glowPath);
            foreach (var p in new[] { basePath, glowPath })
                if (AssetImporter.GetAtPath(p) is TextureImporter ti)
                {
                    ti.filterMode = FilterMode.Point; // crisp windows at distance, no blur into the wall
                    ti.mipmapEnabled = true;
                    ti.SaveAndReimport();
                }
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit")) { enableInstancing = true };
            mat.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(basePath));
            mat.SetColor("_BaseColor", Color.white);
            mat.SetFloat("_Smoothness", 0.3f);
            mat.EnableKeyword("_EMISSION");
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            mat.SetTexture("_EmissionMap", AssetDatabase.LoadAssetAtPath<Texture2D>(glowPath));
            mat.SetColor("_EmissionColor", Color.white * 1.6f);
            AssetDatabase.CreateAsset(mat, ShellMaterialPath);
            return mat;
        }

        /// <summary>
        /// Paddy mask texels under the places' own roads and building pads become dry (legacy gasshoDry,
        /// koedoDry): the mask is from before the places, and its water lay across the gassho street.
        /// Mask layout as WaterImporter: res² over the original 3072 m, j south → north.
        /// </summary>
        public static int Dry(bool[] wet, int res, MapImportSettings settings)
        {
            const float worldSize = 3072f, half = worldSize / 2f;
            var step = worldSize / (res - 1);
            var dried = 0;
            void Clear(Vector3 centre, float reach, System.Func<Vector3, bool> inside)
            {
                int i0 = Mathf.Max(0, Mathf.FloorToInt((centre.x - reach + half) / step)), i1 = Mathf.Min(res - 1, Mathf.CeilToInt((centre.x + reach + half) / step));
                int j0 = Mathf.Max(0, Mathf.FloorToInt((centre.z - reach + half) / step)), j1 = Mathf.Min(res - 1, Mathf.CeilToInt((centre.z + reach + half) / step));
                for (var j = j0; j <= j1; j++)
                for (var i = i0; i <= i1; i++)
                {
                    var k = j * res + i;
                    if (!wet[k] || !inside(new Vector3(-half + i * step, 0, -half + j * step))) continue;
                    wet[k] = false;
                    dried++;
                }
            }
            foreach (var pad in Pads())
            {
                var rot = Quaternion.Euler(0, -pad.yaw, 0);
                var h = pad.half + Vector2.one * 2f;
                Clear(pad.center, h.magnitude, w => { var l = rot * (w - pad.center); return Mathf.Abs(l.x) < h.x && Mathf.Abs(l.z) < h.y; });
            }
            foreach (var road in RoadImporter.Load(settings).Where(r => r.tags != null && (r.tags.Contains("place") || r.tags.Contains("extended"))))
            {
                var c = road.centerline;
                var r = (road.widths != null && road.widths.Length > 0 ? road.widths.Max() : 5) / 2 + 2f;
                for (var i = 0; i < c.Length / 3; i++)
                {
                    var p = PlaceSource.ToUnity(c[i * 3], c[i * 3 + 2]);
                    Clear(p, r, w => (w - p).sqrMagnitude < r * r);
                }
            }
            return dried;
        }

        public const string WaterMeshDir = "Assets/_Project/Art/Places/Water";

        /// <summary>A flat quad of the item's size at its fixed height, with the river's water material.</summary>
        static void AddWater(Transform root, Placement p)
        {
            var parent = root.Find("Water") ?? new GameObject("Water").transform;
            parent.SetParent(root, false);
            Directory.CreateDirectory(WaterMeshDir);
            var i = parent.childCount;
            var name = $"{root.name.Replace(" ", "").Replace("&", "")}_Water_{i:D3}";
            var hw = p.item.w / 2;
            var hd = p.item.d / 2;
            var mesh = new Mesh();
            mesh.SetVertices(new[] { new Vector3(-hw, 0, -hd), new Vector3(-hw, 0, hd), new Vector3(hw, 0, hd), new Vector3(hw, 0, -hd) });
            mesh.SetTriangles(new[] { 0, 1, 2, 0, 2, 3 }, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            mesh = MeshAssets.Save($"{WaterMeshDir}/{name}.asset", mesh);
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.transform.SetPositionAndRotation(new Vector3(p.centre.x, p.item.y, p.centre.z), Quaternion.Euler(0, p.yaw, 0));
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>($"{WaterImporter.MaterialDir}/Water_River.mat");
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)~0 & ~StaticEditorFlags.ContributeGI);
            WaterImporter.MakeQueryable(go);
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

        /// <summary>Only the start (car and walker) again, into Game.unity. Batch: <c>node Tools/unity-run.mjs JapanMap.Editor.Places.PlaceImporter.ApplySpawnAndSave</c>.</summary>
        [MenuItem("JapanMap/Places/Apply Spawn")]
        public static void ApplySpawnAndSave()
        {
            MapScene.OpenGameScene();
            if (ApplySpawn()) MapScene.Save();
        }

        /// <summary>Spawn from the place that has one (PlayerSetup calls this too). False: none found.</summary>
        public static bool ApplySpawn()
        {
            foreach (var kit in Kits())
            {
                var place = PlaceSource.Load(kit.source);
                if (!place.hasSpawn) continue;
                SetSpawn(place.spawn, place.hasWalkSpawn ? PlaceSource.ToUnity(place.walkSpawn.x, place.walkSpawn.z) : null);
                if (place.hasWalkSpawn) SetWalkSpawn(place.walkSpawn);
                return true;
            }
            return false;
        }

        /// <summary>
        /// The player's car starts here (prototype: Sakura Commons, WP2), not snapped to a road's centre. On a road it
        /// stands in the left lane facing the way out (<see cref="AlongRoad"/>).
        /// </summary>
        static void SetSpawn(PlaceSource.Spawn s, Vector3? walker)
        {
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            if (spawner == null) { Debug.LogWarning("[Places] no PlayerCarSpawner in Game.unity — spawn not set"); return; }
            var at = PlaceSource.ToUnity(s.x, s.z);
            // Unity heading: clockwise from +Z; legacy yaw counter-clockwise from +Z with z mirrored.
            var heading = Mathf.Repeat(PlaceSource.Yaw(s.yaw), 360f);
            var network = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            if (network != null) (at, heading) = AlongRoad(network, at, heading, walker);
            at.y = Ground(at);
            var so = new SerializedObject(spawner);
            so.FindProperty("spawnPoint").vector3Value = at;
            so.FindProperty("spawnHeading").floatValue = heading;
            so.FindProperty("snapToRoad").boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>
        /// A start on a road (within its half width): in the left lane (Japan drives on the left; Auto-Drive's lane, a
        /// quarter of the width, at most 2.2 m) facing the end that joins other roads — the prototype parked the car
        /// across commons-drive facing east, and Auto-Drive began every trip with a three-point turn (D54). Off any
        /// road, or on one open at both ends with no way out preferred: the given place and heading.
        /// </summary>
        /// <param name="walker">The session starts on foot here: the car stays within <see cref="BoardReach"/> of it.</param>
        public static (Vector3 at, float heading) AlongRoad(RoadNetwork network, Vector3 at, float heading, Vector3? walker = null)
        {
            RoadNetwork.Road road = default;
            var best = float.MaxValue;
            var seg = -1;
            foreach (var r in network.roads)
            {
                if (r.points == null || r.closed) continue;
                for (var i = 0; i < r.points.Length - 1; i++)
                {
                    var d = DistanceXZ(at, r.points[i], r.points[i + 1], out _);
                    if (d >= best || d > r.width / 2) continue;
                    best = d;
                    road = r;
                    seg = i;
                }
            }
            if (seg < 0) return (at, heading);
            var a = road.points[seg];
            var b = road.points[seg + 1];
            DistanceXZ(at, a, b, out var t);
            var centre = Vector3.Lerp(a, b, t);
            var forward = new Vector3(b.x - a.x, 0f, b.z - a.z).normalized;
            bool Joins(Vector3 end) => network.roads.Any(o => o.id != road.id && o.points != null
                && o.points.Where((_, k) => k < o.points.Length - 1).Select((p, k) => DistanceXZ(end, p, o.points[k + 1], out _)).Any(d => d < 2f));
            bool outAtEnd = Joins(road.points[^1]), outAtStart = Joins(road.points[0]);
            if (outAtStart && !outAtEnd) forward = -forward;
            else if (outAtStart == outAtEnd && Vector3.Dot(forward, Quaternion.Euler(0f, heading, 0f) * Vector3.forward) < 0f) forward = -forward;
            var left = new Vector3(-forward.z, 0f, forward.x);
            var lane = Mathf.Min(road.width * 0.25f, 2.2f);
            var spot = centre + left * lane;
            if (walker is Vector3 w)
            {
                // Along the lane towards the walker until F reaches the car (4.3 m away it did not: 43 PlayMode tests).
                var flat = new Vector3(spot.x - w.x, 0f, spot.z - w.z);
                var along = Vector3.Dot(flat, forward);
                var across = flat - forward * along;
                if (flat.magnitude > BoardReach && across.magnitude < BoardReach)
                    spot -= forward * (along - Mathf.Sign(along) * Mathf.Sqrt(BoardReach * BoardReach - across.sqrMagnitude));
            }
            return (spot, Mathf.Repeat(Mathf.Atan2(forward.x, forward.z) * Mathf.Rad2Deg, 360f));
        }

        /// <summary>The start car's distance from the walk spawn at most, m: inside WalkerSettings.boardRange (4.2) with room.</summary>
        const float BoardReach = 3.5f;

        static float DistanceXZ(Vector3 p, Vector3 a, Vector3 b, out float t)
        {
            var ab = new Vector2(b.x - a.x, b.z - a.z);
            t = ab.sqrMagnitude > 1e-6f ? Mathf.Clamp01(Vector2.Dot(new Vector2(p.x - a.x, p.z - a.z), ab) / ab.sqrMagnitude) : 0f;
            return (new Vector2(a.x, a.z) + ab * t - new Vector2(p.x, p.z)).magnitude;
        }

        /// <summary>The session starts on foot here (legacy rollWalkSpawn), the car beside it.</summary>
        static void SetWalkSpawn(PlaceSource.Spawn s)
        {
            var player = Object.FindAnyObjectByType<JapanMap.Gameplay.PlayerModeController>();
            if (player == null) { Debug.LogWarning("[Places] no PlayerModeController in Game.unity — walk spawn not set"); return; }
            var at = PlaceSource.ToUnity(s.x, s.z);
            at.y = Ground(at);
            var so = new SerializedObject(player);
            so.FindProperty("walkSpawn").vector3Value = at;
            so.FindProperty("walkSpawnYaw").floatValue = Mathf.Repeat(PlaceSource.Yaw(s.yaw), 360f);
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
