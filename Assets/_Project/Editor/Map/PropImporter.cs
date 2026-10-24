using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// props.json → placeholder prefab instances under World/Props in Game.unity.
    /// One prefab per prop id (Prefabs/Placeholders/&lt;id&gt;.prefab): a box in the legacy size with a red
    /// marker on its front (+Z) so orientation is visible, and a BoxCollider. Phase 4 swaps the
    /// prefabs for real models; positions and rotations stay.
    /// Height: terrain at (x, z), or the fixed y from the file, plus yOffset (legacy PropSystem).
    /// Yaw: propYawBase − rot (README: 180 − rot; checked on templeStairs).
    /// Menu: JapanMap/Map/Import Props.
    /// </summary>
    public static class PropImporter
    {
        public const string GroupName = "Props";
        public const string PrefabDir = "Assets/_Project/Prefabs/Placeholders";

        [MenuItem("JapanMap/Map/Import Props")]
        public static void ImportFromMenu()
        {
            Import(MapImportSettings.LoadOrCreate());
            MapScene.Save();
            // Props stream in World/Props_* scenes: without this they stay in Game.unity, i.e. in the start download
            // (the same slip as the vegetation import, LESSONS 2026-10-11).
            Debug.Log(Content.StreamingSetup.Apply());
        }

        public static Transform Import(MapImportSettings settings)
        {
            var raw = File.ReadAllText(LegacySource.PathOf(settings, "props/props.json"));
            var props = JsonUtility.FromJson<LegacySource.Props>(raw).props;
            var fixedY = FixedHeightFlags(raw, props.Length);
            var specs = settings.props.ToDictionary(p => p.id);

            Directory.CreateDirectory(PrefabDir);
            var prefabs = new Dictionary<string, GameObject[]>();
            var heights = new Dictionary<GameObject, float>();
            var replaced = 0;
            foreach (var id in props.Select(p => p.id).Distinct().OrderBy(i => i))
            {
                if (!specs.TryGetValue(id, out var spec))
                {
                    Debug.LogWarning($"[Map] prop '{id}' has no size in MapImportSettings — using 2 m cube");
                    spec = new MapImportSettings.PropSpec { id = id };
                    specs[id] = spec;
                }
                var library = (spec.library ?? new string[0]).Select(Art.LibraryImporter.LoadPrefab).Where(g => g != null).ToArray();
                if (library.Length < (spec.library?.Length ?? 0))
                    Debug.LogWarning($"[Map] prop '{id}': {spec.library.Length - library.Length} library models missing — run JapanMap/Art/Import Library");
                foreach (var g in library) heights[g] = ModelHeight(g);
                prefabs[id] = library.Length > 0 ? library : new[] { Placeholder(spec) };
            }

            var group = MapScene.FreshGroup(GroupName);
            var parents = new Dictionary<string, Transform>();
            for (var i = 0; i < props.Length; i++)
            {
                var p = props[i];
                if (!parents.TryGetValue(p.id, out var parent))
                {
                    parent = new GameObject(p.id).transform;
                    parent.SetParent(group, false);
                    parents[p.id] = parent;
                }
                var options = prefabs[p.id];
                var index = parent.childCount;
                var prefab = options[Variant(p, options.Length)];
                var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
                go.name = $"{p.id}_{index:D3}";
                var yaw = heights.ContainsKey(prefab) ? specs[p.id].libraryYaw : 0;
                go.transform.SetPositionAndRotation(Position(p, fixedY[i]), Rotation(settings, p.rot) * Quaternion.Euler(0, yaw, 0));
                var scale = p.scale > 0 ? p.scale : 1;
                if (heights.TryGetValue(prefab, out var h))
                {
                    replaced++;
                    if (specs[p.id].fitHeight && h > 0.01f) scale *= specs[p.id].size.y / h;
                }
                go.transform.localScale = Vector3.one * scale;
            }
            Debug.Log($"[Map] props imported: {props.Length} instances of {prefabs.Count} ids, {replaced} with library models");
            return group;
        }

        public static Vector3 Position(LegacySource.Prop p, bool hasFixedY)
        {
            var world = LegacySource.ToUnity(p.x, 0, p.z);
            float y;
            if (hasFixedY) y = p.y;
            else
            {
                var tile = TerrainImporter.TileAt(world);
                y = tile == null ? 0 : tile.SampleHeight(world) + tile.transform.position.y;
            }
            world.y = y + p.yOffset;
            return world;
        }

        /// <summary>Stable pick from the position, so a re-import gives the same model at the same place.</summary>
        public static int Variant(LegacySource.Prop p, int count)
        {
            if (count <= 1) return 0;
            var h = Mathf.FloorToInt(p.x * 7.13f) * 73856093 ^ Mathf.FloorToInt(p.z * 5.71f) * 19349663;
            return (int)((uint)h % (uint)count);
        }

        static float ModelHeight(GameObject prefab)
        {
            var max = 0f;
            foreach (var mf in prefab.GetComponentsInChildren<MeshFilter>(true))
                if (mf.sharedMesh != null && !mf.name.EndsWith("_LOD1"))
                    max = Mathf.Max(max, mf.transform.localPosition.y + mf.sharedMesh.bounds.max.y);
            return max;
        }

        public static Quaternion Rotation(MapImportSettings s, float rotDeg) =>
            Quaternion.Euler(0, s.propYawBase - rotDeg, 0);

        /// <summary>Which entries carry an explicit "y" (JsonUtility reads a missing y as 0).</summary>
        public static bool[] FixedHeightFlags(string raw, int count)
        {
            var objects = Regex.Matches(raw, @"\{[^{}]*""id""[^{}]*\}");
            if (objects.Count != count) throw new InvalidDataException($"props.json: {objects.Count} objects parsed, {count} expected");
            return objects.Cast<Match>().Select(m => Regex.IsMatch(m.Value, @"""y""\s*:")).ToArray();
        }

        /// <summary>Box in the legacy size, pivot on the ground, red marker on the +Z face.</summary>
        static GameObject Placeholder(MapImportSettings.PropSpec spec)
        {
            var root = new GameObject(spec.id);
            try
            {
                var size = spec.size;
                var material = PlaceholderMaterial(spec.category);
                if (spec.gate)
                {
                    var post = Mathf.Min(0.5f, size.x * 0.1f);
                    foreach (var side in new[] { -1f, 1f })
                    {
                        var center = new Vector3(side * (size.x / 2 - post), size.y / 2, 0);
                        Part(root, "Post", center, new Vector3(post, size.y, post), material);
                        var col = root.AddComponent<BoxCollider>();
                        col.center = center;
                        col.size = new Vector3(post, size.y, post);
                    }
                    Part(root, "Beam", new Vector3(0, size.y - 0.4f, 0), new Vector3(size.x, 0.5f, size.z), material);
                }
                else
                {
                    Part(root, "Body", new Vector3(0, size.y / 2, 0), size, material);
                    var box = root.AddComponent<BoxCollider>();
                    box.center = new Vector3(0, size.y / 2, 0);
                    box.size = size;
                }

                var marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.DestroyImmediate(marker.GetComponent<Collider>());
                marker.name = "FrontMarker";
                marker.transform.SetParent(root.transform, false);
                var m = new Vector3(Mathf.Max(0.1f, size.x * 0.4f), Mathf.Max(0.1f, size.y * 0.25f), Mathf.Min(0.3f, size.z * 0.2f + 0.05f));
                marker.transform.localPosition = new Vector3(0, size.y * 0.5f, size.z / 2 + m.z / 2);
                marker.transform.localScale = m;
                marker.GetComponent<MeshRenderer>().sharedMaterial = PlaceholderMaterial("Marker");

                // Measured: 977 placeholders were ~1 800 of 2 000 draw calls, half of them shadow pass.
                // Markers and small props cast no shadow; real models (Phase 4) bring instancing/LOD.
                foreach (var r in root.GetComponentsInChildren<MeshRenderer>())
                    if (r.gameObject == marker || size.y < 2.5f) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

                // Culled when small on screen, like the library models: 372 tetrapod boxes alone were
                // ~600 draw calls at the coast on Low (bench p4-low).
                var lod = root.AddComponent<LODGroup>();
                lod.SetLODs(new[] { new LOD(0.015f, root.GetComponentsInChildren<MeshRenderer>()) });
                lod.RecalculateBounds();

                foreach (var t in root.GetComponentsInChildren<Transform>())
                    GameObjectUtility.SetStaticEditorFlags(t.gameObject, (StaticEditorFlags)~0);
                return PrefabUtility.SaveAsPrefabAsset(root, $"{PrefabDir}/{spec.id}.prefab");
            }
            finally { Object.DestroyImmediate(root); }
        }

        static void Part(GameObject root, string name, Vector3 center, Vector3 size, Material material)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.DestroyImmediate(part.GetComponent<Collider>());
            part.name = name;
            part.transform.SetParent(root.transform, false);
            part.transform.localPosition = center;
            part.transform.localScale = size;
            part.GetComponent<MeshRenderer>().sharedMaterial = material;
        }

        static readonly Dictionary<string, Color> CategoryColors = new()
        {
            ["Concrete"] = new Color(0.62f, 0.62f, 0.6f),
            ["Wood"] = new Color(0.45f, 0.32f, 0.2f),
            ["Stone"] = new Color(0.5f, 0.5f, 0.48f),
            ["Rock"] = new Color(0.36f, 0.35f, 0.32f),
            ["Building"] = new Color(0.82f, 0.78f, 0.68f),
            ["Shrine"] = new Color(0.75f, 0.2f, 0.12f),
            ["Marker"] = new Color(0.9f, 0.1f, 0.1f),
        };

        /// <summary>One instanced material per category; created once, later edits are kept.</summary>
        static Material PlaceholderMaterial(string category)
        {
            Directory.CreateDirectory(WaterImporter.MaterialDir);
            var path = $"{WaterImporter.MaterialDir}/Placeholder_{category}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit")) { enableInstancing = true };
            mat.SetColor("_BaseColor", CategoryColors.TryGetValue(category, out var c) ? c : Color.magenta);
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }
    }
}
