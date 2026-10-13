using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using JapanMap.Editor.Map;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Content;
using JapanMap.Vehicles;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Build.AnalyzeRules;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.SceneManagement;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// What is not in the start download (D36): every car but the starter (model + engine bank) and every place but
    /// Sakura Commons become Addressables, loaded in the background by <see cref="ContentStreamer"/>. Idempotent: run after
    /// any import that rebuilds places or the fleet (PlaceImporter and FleetSeed call it themselves).
    ///   Places: World/Places/&lt;title&gt; moves out of Game.unity into Scenes/Places/&lt;name&gt;.unity (address place/&lt;name&gt;).
    ///   Cars:   the GLB gets address car/&lt;id&gt;, the definition an AssetReference instead of the direct model link.
    /// In the editor the place scenes open with Game.unity (<see cref="PlaceScenesInEditor"/>) so tools see the whole world.
    /// </summary>
    public static class StreamingSetup
    {
        public const string PlaceDir = "Assets/_Project/Scenes/Places";
        public const string StartPlace = "Sakura Commons";
        const string CarsGroup = "Cars";
        const string PlacesGroup = "Places";

        [MenuItem("JapanMap/Content/Setup Streaming")]
        public static string Apply()
        {
            var held = PlaceScenesInEditor.Hold;
            PlaceScenesInEditor.Hold = true;
            try { return ApplyHeld(); }
            finally
            {
                PlaceScenesInEditor.Hold = held;
                if (!held) PlaceScenesInEditor.OpenAll();
            }
        }

        static string ApplyHeld()
        {
            var report = new StringBuilder("[Streaming]");
            var settings = Settings();
            report.Append(" " + StartContent(settings));
            report.Append(" · " + Cars(settings));
            report.Append(" · " + CarShared(settings));
            report.Append(" · " + SplitPlaces(settings));
            report.Append(" · " + Isolate(settings));
            report.Append(" · " + WireScene());
            AssetDatabase.SaveAssets();
            Debug.Log(report.ToString());
            return report.ToString();
        }

        public static AddressableAssetSettings Settings()
        {
            var s = AddressableAssetSettingsDefaultObject.GetSettings(true);
            // The web build builds the content itself first (WebBuild), not on every player build (tests, batch).
            s.BuildAddressablesWithPlayerBuild = AddressableAssetSettings.PlayerBuildOption.DoNotBuildWithPlayer;
            return s;
        }

        static AddressableAssetGroup Group(AddressableAssetSettings s, string name)
        {
            var g = s.FindGroup(name) ?? s.CreateGroup(name, false, false, false, null, typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
            var b = g.GetSchema<BundledAssetGroupSchema>();
            // One bundle per car / place: a download is useful on its own (ASTRA §13 "independently useful packs").
            b.BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackSeparately;
            // LZ4: decompresses in small blocks, no long main-thread stall on the phone (LZMA would be ~25 % smaller).
            b.Compression = BundledAssetGroupSchema.BundleCompressionMode.LZ4;
            b.UseAssetBundleCache = true;
            b.IncludeInBuild = true;
            return g;
        }

        const string StartGroup = "Start";

        /// <summary>
        /// Every terrain gets the swap component (StreamedTerrain): the build moves its grids into a gzip file beside the
        /// game. Not an Addressables bundle — LZMA bundles do not load on the web, LZ4 ones are as large as the player data.
        /// </summary>
        public static string StartContent(AddressableAssetSettings s)
        {
            var old = s.FindGroup(StartGroup); // first try was an LZMA bundle ("format 1 not supported" in the browser)
            if (old != null) s.RemoveGroup(old);
            var game = MapScene.OpenGameScene();
            var n = 0;
            foreach (var t in Object.FindObjectsByType<Terrain>())
            {
                if (t.gameObject.scene != game || t.terrainData == null) continue;
                if (t.GetComponent<JapanMap.World.StreamedTerrain>() == null) t.gameObject.AddComponent<JapanMap.World.StreamedTerrain>();
                n++;
            }
            if (n > 1) Debug.LogError("[Streaming] more than one terrain: StreamedTerrain writes one file — give each its own");
            EditorSceneManager.MarkSceneDirty(game);
            EditorSceneManager.SaveScene(game);
            return $"terrain as gzip file ({n})";
        }

        public static string CarAddress(string id) => "car/" + id;

        /// <summary>
        /// Car models by address, the direct links cut — the starter's too: a first visit begins on foot, and a returning
        /// player's car drives on a stand-in body for the second its model takes (it is the first download after the
        /// start). Its engine bank stays in the start (sound from the first second, 0.1 MB).
        /// </summary>
        public static string Cars(AddressableAssetSettings s)
        {
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(Vehicles.FleetSeed.FleetPath);
            var group = Group(s, CarsGroup);
            var starter = fleet.Default;
            var n = 0;
            foreach (var def in fleet.vehicles)
            {
                if (def == null) continue;
                var model = def.EditorModel;
                if (model == null) continue;
                var guid = AssetDatabase.AssetPathToGUID(AssetDatabase.GetAssetPath(model));
                var e = s.CreateOrMoveEntry(guid, group, false, false);
                e.address = CarAddress(def.id);
                def.modelAsset = new AssetReferenceGameObject(guid);
                def.model = null;
                n++;
                EditorUtility.SetDirty(def);
                var bank = AssetDatabase.FindAssets("t:JapanMap.Audio.EngineSoundBank", new[] { Audio.AudioSetup.DataDir })
                    .Select(AssetDatabase.GUIDToAssetPath).Select(AssetDatabase.LoadAssetAtPath<JapanMap.Audio.EngineSoundBank>)
                    .FirstOrDefault(b => b != null && b.carId == def.id);
                if (bank == null) continue;
                var bankGuid = AssetDatabase.AssetPathToGUID(AssetDatabase.GetAssetPath(bank));
                if (def == starter) s.RemoveAssetEntry(bankGuid);
                else s.CreateOrMoveEntry(bankGuid, group, false, false).address = CarAudio.BankAddress(def.id);
            }
            s.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
            return $"{n} cars streamed (engine bank of {starter.id} in the start download)";
        }

        const string CarSharedGroup = "CarShared";

        /// <summary>
        /// What the car models share with other content (glTF and Lit shaders, materials) in one small bundle of its own.
        /// Without it the duplicate isolation put those shaders into the 4.4 MB bundle of buildings, and the starter car —
        /// waited for before play since 2026-10-11 — pulled the buildings in too (start 18.4 → 25.1 MB until gameplayStart).
        /// </summary>
        static string CarShared(AddressableAssetSettings s)
        {
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(Vehicles.FleetSeed.FleetPath);
            var group = Group(s, CarSharedGroup);
            group.GetSchema<BundledAssetGroupSchema>().BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackTogether;
            var models = new HashSet<string>();
            foreach (var def in fleet.vehicles)
                if (def != null && def.modelAsset != null && def.modelAsset.editorAsset != null)
                    models.Add(AssetDatabase.GetAssetPath(def.modelAsset.editorAsset));
            var n = 0;
            foreach (var model in models)
                foreach (var dep in AssetDatabase.GetDependencies(model, true))
                {
                    if (models.Contains(dep) || dep.EndsWith(".cs") || dep.EndsWith(".asmdef")) continue;
                    var guid = AssetDatabase.AssetPathToGUID(dep);
                    var had = s.FindAssetEntry(guid);
                    // Addressed on purpose elsewhere: leave it; moved there by an earlier isolation run: take it.
                    if (had != null && had.parentGroup != group && !had.parentGroup.Name.StartsWith("Duplicate Asset Isolation")) continue;
                    if (had == null || had.parentGroup != group) n++;
                    s.CreateOrMoveEntry(guid, group, false, false);
                }
            s.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
            return $"car shared: {group.entries.Count} assets ({n} new)";
        }

        public static string SceneName(string title) => new string(title.Where(char.IsLetterOrDigit).ToArray());
        public static string PlaceAddress(string sceneName) => "place/" + sceneName;

        /// <summary>Where the game starts (the car spawner's point): what lies within <see cref="KeepRadius"/> stays in the start download.</summary>
        public const float KeepRadius = 350f;
        public const string WorldDir = "Assets/_Project/Scenes/World";

        /// <summary>A World/&lt;group&gt; that streams: its children one scene each, or the whole group as one.</summary>
        struct Rule
        {
            public string group, dir, prefix;
            public bool whole, keepNearStart;
            public System.Func<Transform, bool> keep, never;
        }

        static IEnumerable<Rule> Rules() => new[]
        {
            new Rule { group = Places.PlaceImporter.GroupName, dir = PlaceDir, prefix = "", keep = t => t.name == StartPlace },
            // Road tiles at the start stay; the city plate and the guard rails span the map, their bounds always reach the
            // start — they stream like any far tile (the city is ~500 m away).
            new Rule { group = "Roads", dir = WorldDir, prefix = "Roads_", keepNearStart = true, never = t => t.name == "CitySlab" || t.name == "Guardrails" || t.name == "Viaducts" },
            new Rule { group = "Props", dir = WorldDir, prefix = "Props_", keepNearStart = true },
            new Rule { group = "Navigation", dir = WorldDir, prefix = "Nav_", keep = t => t.name.Contains(StartPlace) },
            new Rule { group = "Vegetation", dir = WorldDir, prefix = "", whole = true },
            // The paddy water (≈100 000 vertices since the shores follow the dams) streams in; sea and river stay.
            new Rule { group = "Water", dir = WorldDir, prefix = "Water_", keep = t => t.name != "Paddies" },
        };

        /// <summary>Scene/root name prefix of a group's streamed parts (null: the group does not stream by parts).</summary>
        public static string PrefixOf(string group) => Rules().Where(r => r.group == group && !r.whole).Select(r => r.prefix).FirstOrDefault();

        /// <summary>Names a part of World/&lt;group&gt;/&lt;child&gt; can have as a streamed scene root.</summary>
        public static IEnumerable<string> PartNames(string group, string child) =>
            Rules().Where(r => r.group == group).Select(r => r.whole ? Name(r, group) : Name(r, child));

        static string Name(Rule r, string title) =>
            r.prefix == "" ? SceneName(title) : r.prefix + new string(title.Replace("-", "m").Where(c => char.IsLetterOrDigit(c) || c == '_').ToArray());

        static Bounds BoundsOf(GameObject go)
        {
            var b = new Bounds(go.transform.position, Vector3.zero);
            var any = false;
            foreach (var r in go.GetComponentsInChildren<Renderer>(true)) { if (any) b.Encapsulate(r.bounds); else { b = r.bounds; any = true; } }
            foreach (var c in go.GetComponentsInChildren<Collider>(true)) { if (any) b.Encapsulate(c.bounds); else { b = c.bounds; any = true; } }
            return b;
        }

        static Vector3 StartPoint()
        {
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            return spawner == null ? Vector3.zero : new SerializedObject(spawner).FindProperty("spawnPoint").vector3Value;
        }

        static bool NearStart(GameObject go, Vector3 start)
        {
            var b = BoundsOf(go);
            var nearest = b.ClosestPoint(new Vector3(start.x, b.center.y, start.z));
            return new Vector2(nearest.x - start.x, nearest.z - start.z).magnitude <= KeepRadius;
        }

        /// <summary>
        /// Every streaming rule: the group's children (or the group) move out of Game.unity into scenes of their own.
        /// Groups already moved stay as they are (a re-import puts them back first, MapImport.ImportAll).
        /// </summary>
        public static string SplitPlaces(AddressableAssetSettings s)
        {
            PlaceScenesInEditor.CloseAll();
            var game = MapScene.OpenGameScene();
            var start = StartPoint();
            var group = Group(s, PlacesGroup);
            var world = Group(s, WorldGroup);
            var moved = 0;
            var kept = new List<string>();
            foreach (var rule in Rules())
            {
                var root = MapScene.Root().Find(rule.group);
                if (root == null) continue;
                Directory.CreateDirectory(rule.dir);
                var parts = rule.whole ? new List<Transform> { root } : root.Cast<Transform>().ToList();
                foreach (var t in parts)
                {
                    if (rule.keep != null && rule.keep(t)) { kept.Add(t.name); continue; }
                    var never = rule.never != null && rule.never(t);
                    if (rule.keepNearStart && !never && NearStart(t.gameObject, start)) { kept.Add(t.name); continue; }
                    var name = Name(rule, t.name);
                    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
                    t.SetParent(null, true);
                    t.name = name; // the root carries the scene's name: the streamer finds an already open part by it
                    SceneManager.MoveGameObjectToScene(t.gameObject, scene);
                    EditorSceneManager.SaveScene(scene, $"{rule.dir}/{name}.unity");
                    EditorSceneManager.CloseScene(scene, true);
                    moved++;
                }
            }
            if (moved > 0)
            {
                EditorSceneManager.MarkSceneDirty(game);
                EditorSceneManager.SaveScene(game);
            }
            var n = 0;
            foreach (var path in StreamedScenes())
            {
                var guid = AssetDatabase.AssetPathToGUID(path);
                var g = path.StartsWith(PlaceDir) ? group : world;
                s.CreateOrMoveEntry(guid, g, false, false).address = Address(path);
                n++;
            }
            s.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
            return $"{n} streamed scenes ({moved} moved now; kept in the start: {string.Join(", ", kept)})";
        }

        const string WorldGroup = "World";

        /// <summary>Address of a streamed scene: place/&lt;name&gt; for places, world/&lt;name&gt; for the rest of the base world.</summary>
        public static string Address(string scenePath) =>
            (scenePath.StartsWith(PlaceDir) ? "place/" : "world/") + Path.GetFileNameWithoutExtension(scenePath);

        public static IEnumerable<string> StreamedScenes()
        {
            foreach (var dir in new[] { PlaceDir, WorldDir })
                if (Directory.Exists(dir))
                    foreach (var p in Directory.GetFiles(dir, "*.unity").OrderBy(p => p)) yield return p.Replace('\\', '/');
        }

        /// <summary>Assets two place/car bundles share go into one bundle of their own (Addressables' duplicate rule).</summary>
        static string Isolate(AddressableAssetSettings s)
        {
            var rule = new CheckBundleDupeDependencies();
            var found = rule.RefreshAnalysis(s).Count;
            rule.FixIssues(s);
            return $"shared assets isolated ({found} findings)";
        }

        /// <summary>The streamer's place list with centres, and the car sound with only the starter's bank.</summary>
        public static string WireScene()
        {
            var game = MapScene.OpenGameScene();
            var streamer = Object.FindAnyObjectByType<ContentStreamer>();
            if (streamer == null) return "no ContentStreamer — run Content/Setup";
            var entries = new List<ContentStreamer.Place>();
            foreach (var path in StreamedScenes())
            {
                var scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Additive);
                var bounds = new Bounds();
                var any = false;
                foreach (var root in scene.GetRootGameObjects())
                {
                    foreach (var r in root.GetComponentsInChildren<Renderer>(true)) { if (any) bounds.Encapsulate(r.bounds); else { bounds = r.bounds; any = true; } }
                    foreach (var c in root.GetComponentsInChildren<Collider>(true)) { if (any) bounds.Encapsulate(c.bounds); else { bounds = c.bounds; any = true; } }
                }
                entries.Add(new ContentStreamer.Place { address = Address(path), centre = bounds.center, editorPath = path });
                EditorSceneManager.CloseScene(scene, true);
            }
            var so = new SerializedObject(streamer);
            var arr = so.FindProperty("places");
            arr.arraySize = entries.Count;
            for (var i = 0; i < entries.Count; i++)
            {
                arr.GetArrayElementAtIndex(i).FindPropertyRelative("address").stringValue = entries[i].address;
                arr.GetArrayElementAtIndex(i).FindPropertyRelative("centre").vector3Value = entries[i].centre;
                arr.GetArrayElementAtIndex(i).FindPropertyRelative("editorPath").stringValue = entries[i].editorPath;
            }
            so.ApplyModifiedPropertiesWithoutUndo();

            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            if (spawner != null)
            {
                var sso = new SerializedObject(spawner);
                sso.FindProperty("standInMaterial").objectReferenceValue = Vehicles.PlayerSetup.StandInMaterial("CarBody", new Color(0.55f, 0.58f, 0.62f));
                sso.ApplyModifiedPropertiesWithoutUndo();
            }
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(Vehicles.FleetSeed.FleetPath);
            var audio = Object.FindAnyObjectByType<CarAudio>();
            if (audio != null)
            {
                var aso = new SerializedObject(audio);
                var banks = aso.FindProperty("banks");
                var starterBank = AssetDatabase.FindAssets("t:JapanMap.Audio.EngineSoundBank", new[] { Audio.AudioSetup.DataDir })
                    .Select(AssetDatabase.GUIDToAssetPath).Select(AssetDatabase.LoadAssetAtPath<JapanMap.Audio.EngineSoundBank>)
                    .FirstOrDefault(b => b != null && b.carId == fleet.Default.id);
                banks.arraySize = starterBank != null ? 1 : 0;
                if (starterBank != null) banks.GetArrayElementAtIndex(0).objectReferenceValue = starterBank;
                aso.ApplyModifiedPropertiesWithoutUndo();
            }
            EditorSceneManager.MarkSceneDirty(game);
            EditorSceneManager.SaveScene(game);
            PlaceScenesInEditor.OpenAll();
            return $"streamer: {entries.Count} places";
        }
    }

    /// <summary>
    /// Opening Game.unity in the editor (not in play mode) opens the place scenes beside it, so captures, benches and
    /// look tools see the whole world as before the split. Play mode loads them through Addressables instead.
    /// </summary>
    [InitializeOnLoad]
    public static class PlaceScenesInEditor
    {
        static PlaceScenesInEditor() => EditorSceneManager.sceneOpened += OnOpened;

        static void OnOpened(Scene scene, OpenSceneMode mode)
        {
            if (mode != OpenSceneMode.Single || scene.path != ProjectSetup.GameScene) return;
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            OpenAll();
        }

        /// <summary>While importers rebuild groups in Game.unity and StreamingSetup moves them out, nothing reopens.</summary>
        public static bool Hold;

        public static void OpenAll()
        {
            if (Hold) return;
            foreach (var p in StreamingSetup.StreamedScenes())
            {
                var open = SceneManager.GetSceneByPath(p);
                if (!open.IsValid() || !open.isLoaded) EditorSceneManager.OpenScene(p, OpenSceneMode.Additive);
            }
            var game = SceneManager.GetSceneByPath(ProjectSetup.GameScene);
            if (game.IsValid()) SceneManager.SetActiveScene(game);
        }

        public static void CloseAll()
        {
            for (var i = SceneManager.sceneCount - 1; i >= 0; i--)
            {
                var s = SceneManager.GetSceneAt(i);
                if (s.path.StartsWith(StreamingSetup.PlaceDir) || s.path.StartsWith(StreamingSetup.WorldDir)) EditorSceneManager.CloseScene(s, true);
            }
        }
    }
}
