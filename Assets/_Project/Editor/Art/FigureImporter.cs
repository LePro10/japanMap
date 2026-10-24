using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using JapanMap.Gameplay.Traffic;
using JapanMap.Gameplay.Life;
using JapanMap.OnFoot;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.Editor.Art
{
    /// <summary>
    /// Asset sprint 6 → Unity: the people. SM_Hito_*.fbx bodies share one rig whose bone names are
    /// HumanBodyBones, so each imports as Humanoid with its own avatar (Bake Axis Conversion on: the
    /// rig is exported without "Apply Transform"); the clips of SM_Hito_Anims.fbx retarget to all. Clips are split by anims.json
    /// (loop), one Animator state per clip. Each body becomes Prefabs/Library/P_Hito_&lt;Name&gt; with a
    /// LODGroup and a grip under each hand (75 mm along the hand, 12 mm towards the palm). Then the
    /// FigureSet (bodies, clips, hand props, animals) and the traffic models of TrafficSettings are
    /// filled from the export's json files (streamed: LifeContent; the player's body in PlayerFigure stays in the start). Animals, hand props and traffic cars are plain library
    /// assets (LibraryImporter). Menu: JapanMap/Art/Import Figures + Traffic.
    /// </summary>
    public static class FigureImporter
    {
        public const string ArtDir = "Assets/_Project/Art/Figures";
        public const string AnimsName = "SM_Hito_Anims";
        public const string ControllerPath = ArtDir + "/AC_Hito.controller";
        public const string PlayerControllerPath = ArtDir + "/AC_Hito_Player.controller";
        /// <summary>The player's clips: only these ship in the start download (all 14 = 0.23 MB raw).</summary>
        static readonly string[] PlayerClips = { "Idle", "Walk", "Run", "Slide", "Jump", "Fall" };
        public const string PlayerBody = "SM_Hito_Driver";
        public const string PlayerPrefab = "Hito_Player";
        public const string FigureSetPath = "Assets/_Project/Data/Life/FigureSet.asset";
        public const string PlayerFigurePath = "Assets/_Project/Data/Life/PlayerFigure.asset";
        public const string TrafficLooksPath = "Assets/_Project/Data/Life/TrafficLooks.asset";
        static string AnimsPath => $"{ArtDir}/{AnimsName}.fbx";

        /// <summary>Skinned bodies (not the hand props): imported here, not by the library importer.</summary>
        public static bool IsBody(string assetName) => assetName.StartsWith("Hito_") && !assetName.StartsWith("Hito_Prop_");

        [MenuItem("JapanMap/Art/Import Figures + Traffic")]
        public static void ImportFromMenu() => Debug.Log(Import());

        public static string Import()
        {
            var s = LibraryImporter.Settings();
            var src = Path.Combine(s.sourceDir, "characters");
            var lib = LibraryImporter.Import(s); // animals, hand props, traffic cars, details; atlas material first
            var bodies = Directory.GetFiles(src, "SM_Hito_*.fbx").Select(Path.GetFileNameWithoutExtension)
                .Where(n => n != AnimsName && IsBody(n.Substring(3))).OrderBy(n => n).ToList();

            Directory.CreateDirectory(ArtDir);
            Copy(Path.Combine(src, AnimsName + ".fbx"), AnimsPath);
            AssetDatabase.ImportAsset(AnimsPath, ImportAssetOptions.ForceUpdate);
            var clips = Clips(Path.Combine(src, "anims.json"));
            var problem = SplitClips(clips);
            if (problem != null) return lib + "\n[Figures] " + problem;
            var avatar = AssetDatabase.LoadAllAssetsAtPath(AnimsPath).OfType<Avatar>().FirstOrDefault();
            if (avatar == null || !avatar.isHuman || !avatar.isValid) return lib + "\n[Figures] avatar of the anims FBX is not a valid humanoid";

            AssetDatabase.StartAssetEditing();
            try { foreach (var b in bodies) Copy(Path.Combine(src, b + ".fbx"), $"{ArtDir}/{b}.fbx"); }
            finally { AssetDatabase.StopAssetEditing(); }
            AssetDatabase.Refresh();
            // Import rules changed since the last copy (same bytes, so no reimport by itself): no humanoid avatar = old settings.
            foreach (var b in bodies)
            {
                if (AssetDatabase.LoadAllAssetsAtPath($"{ArtDir}/{b}.fbx").OfType<Avatar>().Any(a => a.isHuman)) continue;
                var m = (ModelImporter)AssetImporter.GetAtPath($"{ArtDir}/{b}.fbx");
                m.sourceAvatar = null; // first: setting it (even to null) switches the setup back to Copy From Other
                m.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel; // in the .meta: the avatar step reads it there
                m.SaveAndReimport();
            }
            var controller = Controller(clips, ControllerPath);
            var playerController = Controller(clips.Where(c => PlayerClips.Contains(c.name)).ToList(), PlayerControllerPath);
            var built = new List<string>();
            foreach (var b in bodies)
            {
                var p = BuildPrefab(b, b.Substring(3), controller, s);
                if (p != null) return lib + $"\n[Figures] {p}";
                built.Add(b);
            }
            var pp = BuildPrefab(PlayerBody, PlayerPrefab, playerController, s);
            if (pp != null) return lib + $"\n[Figures] {pp}";
            FillFigureSet(clips, Path.Combine(src, "hand_props.json"));
            var traffic = FillTraffic(Path.Combine(s.sourceDir, "traffic", "traffic.json"));
            AssetDatabase.SaveAssets();
            return lib + $"\n[Figures] {built.Count} bodies, {clips.Count} clips, avatar {avatar.name}; {traffic}";
        }

        static void Copy(string from, string to)
        {
            if (!File.Exists(from)) throw new FileNotFoundException(from);
            if (File.Exists(to) && File.ReadAllBytes(to).SequenceEqual(File.ReadAllBytes(from))) return;
            File.Copy(from, to, true);
            AssetDatabase.ImportAsset(to);
        }

        // ── clips ──────────────────────────────────────────────────────────────

        static List<FigureSet.Clip> Clips(string json)
        {
            var list = new List<FigureSet.Clip>();
            foreach (Match m in Regex.Matches(File.ReadAllText(json),
                         "\"(\\w+)\":\\s*\\{\\s*\"frames\":\\s*\\d+,\\s*\"fps\":\\s*\\d+,\\s*\"loop\":\\s*(true|false),\\s*\"speed\":\\s*([\\d.]+)"))
                list.Add(new FigureSet.Clip
                {
                    name = m.Groups[1].Value, loop = m.Groups[2].Value == "true",
                    speed = float.Parse(m.Groups[3].Value, System.Globalization.CultureInfo.InvariantCulture),
                });
            return list;
        }

        /// <summary>One clip per take ("Rig|Walk" → "Walk"), in place: root motion baked into the pose (code moves people).</summary>
        static string SplitClips(List<FigureSet.Clip> clips)
        {
            var m = (ModelImporter)AssetImporter.GetAtPath(AnimsPath);
            var takes = m.importedTakeInfos;
            var result = new List<ModelImporterClipAnimation>();
            foreach (var c in clips)
            {
                var take = takes.FirstOrDefault(t => t.name == c.name || t.name.EndsWith("|" + c.name));
                if (take.name == null) return $"take {c.name} not in {AnimsName}.fbx (has: {string.Join(", ", takes.Select(t => t.name))})";
                result.Add(new ModelImporterClipAnimation
                {
                    name = c.name, takeName = take.name,
                    firstFrame = take.startTime * take.sampleRate, lastFrame = take.stopTime * take.sampleRate,
                    loopTime = c.loop, loopPose = false,
                    lockRootRotation = true, keepOriginalOrientation = true,
                    lockRootHeightY = true, keepOriginalPositionY = true,
                    lockRootPositionXZ = true, keepOriginalPositionXZ = true,
                });
            }
            var same = m.clipAnimations.Length == result.Count && m.clipAnimations.Zip(result, (a, b) =>
                a.name == b.name && a.loopTime == b.loopTime && Mathf.Approximately(a.lastFrame, b.lastFrame)).All(x => x);
            if (same) return null;
            m.clipAnimations = result.ToArray();
            m.SaveAndReimport();
            return null;
        }

        static AnimatorController Controller(List<FigureSet.Clip> clips, string path)
        {
            // Rebuilt from the clip list every time, in place (a new asset would give every prefab a new link).
            var ac = AssetDatabase.LoadAssetAtPath<AnimatorController>(path) ?? AnimatorController.CreateAnimatorControllerAtPath(path);
            var sm = ac.layers[0].stateMachine;
            foreach (var old in sm.states.ToArray()) sm.RemoveState(old.state);
            var motions = AssetDatabase.LoadAllAssetsAtPath(AnimsPath).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview")).ToList();
            var y = 0;
            foreach (var c in clips)
            {
                var clip = motions.FirstOrDefault(a => a.name == c.name);
                if (clip == null) continue;
                var st = sm.AddState(c.name, new Vector3(300, y += 60, 0));
                st.motion = clip;
                st.writeDefaultValues = true;
                if (c.name == "Idle") sm.defaultState = st;
            }
            EditorUtility.SetDirty(ac);
            return ac;
        }

        // ── prefabs ────────────────────────────────────────────────────────────

        static string BuildPrefab(string body, string name, AnimatorController controller, LibraryImportSettings s)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>($"{ArtDir}/{body}.fbx");
            if (model == null) return $"{body}: model missing";
            var root = new GameObject($"P_{name}");
            try
            {
                // With Bake Axis Conversion the body looks along −Z (measured: face away from the
                // showroom camera); the game's +Z is the front, so the model turns under a neutral root.
                var inst = (GameObject)Object.Instantiate(model, root.transform, false);
                inst.name = "Model";
                inst.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
                var anim = inst.GetComponent<Animator>();
                if (anim == null) anim = inst.AddComponent<Animator>(); // Unity null: no ?? on components
                anim.runtimeAnimatorController = controller;
                anim.applyRootMotion = false;
                if (anim.avatar == null) anim.avatar = AssetDatabase.LoadAllAssetsAtPath($"{ArtDir}/{body}.fbx").OfType<Avatar>().FirstOrDefault();
                anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
                if (anim.avatar == null || !anim.avatar.isHuman) return $"{body}: no humanoid avatar";

                var smrs = root.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                var lod = new List<Renderer>[3] { new(), new(), new() };
                foreach (var r in smrs)
                {
                    r.updateWhenOffscreen = false;
                    r.skinnedMotionVectors = false;
                    r.lightProbeUsage = LightProbeUsage.BlendProbes;
                    r.reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox;
                    r.shadowCastingMode = ShadowCastingMode.On;
                    lod[r.name.EndsWith("_LOD2") ? 2 : r.name.EndsWith("_LOD1") ? 1 : 0].Add(r);
                }
                if (lod[0].Count == 0) return $"{body}: no _LOD0 skinned mesh";
                var group = root.GetComponent<LODGroup>();
                if (group == null) group = root.AddComponent<LODGroup>();
                var present = lod.Where(l => l.Count > 0).ToList();
                var steps = new[] { s.propLod0, s.propLod1, s.propCull };
                group.SetLODs(present.Select((l, i) => new LOD(i == present.Count - 1 ? steps[2] : steps[i], l.ToArray())).ToArray());
                group.RecalculateBounds();

                foreach (var hand in new[] { HumanBodyBones.LeftHand, HumanBodyBones.RightHand })
                    if (!Grip(root.transform, anim, hand)) return $"{body}: no {hand} bone";

                PrefabUtility.SaveAsPrefabAsset(root, LibraryImporter.PrefabPath(name));
                return null;
            }
            finally { Object.DestroyImmediate(root); }
        }

        /// <summary>
        /// Grip = 75 mm from the wrist along the hand, 12 mm towards the palm (towards the body's middle
        /// in the rest pose, arms hanging). Its −Y runs along the hand, so a 'hang' prop (−Z in Blender)
        /// hangs from the fist; its +Z faces the figure's front.
        /// </summary>
        static bool Grip(Transform root, Animator anim, HumanBodyBones bone)
        {
            var hand = anim.GetBoneTransform(bone);
            var arm = anim.GetBoneTransform(bone == HumanBodyBones.LeftHand ? HumanBodyBones.LeftLowerArm : HumanBodyBones.RightLowerArm);
            if (hand == null || arm == null) return false;
            var name = bone == HumanBodyBones.LeftHand ? HitoFigure.GripLeft : HitoFigure.GripRight;
            var old = hand.Find(name);
            if (old != null) Object.DestroyImmediate(old.gameObject);
            var along = (hand.position - arm.position).normalized;
            var side = root.InverseTransformPoint(hand.position).x;
            var palm = root.TransformDirection(new Vector3(-Mathf.Sign(side), 0f, 0f));
            var grip = new GameObject(name).transform;
            grip.SetParent(hand, false);
            grip.position = hand.position + along * 0.075f + palm * 0.012f;
            grip.rotation = Quaternion.LookRotation(Vector3.ProjectOnPlane(root.forward, along).normalized, -along);
            return true;
        }

        // ── data ───────────────────────────────────────────────────────────────

        static void FillFigureSet(List<FigureSet.Clip> clips, string handProps)
        {
            var set = AssetDatabase.LoadAssetAtPath<FigureSet>(FigureSetPath);
            if (set == null)
            {
                set = ScriptableObject.CreateInstance<FigureSet>();
                AssetDatabase.CreateAsset(set, FigureSetPath);
            }
            set.clips = clips.ToArray();
            var props = new List<FigureSet.Prop>();
            foreach (Match m in Regex.Matches(File.ReadAllText(handProps), "\"(\\w+)\":\\s*\\{\\s*\"hand\":\\s*\"(\\w+)\",\\s*\"axis\":\\s*\"(\\w+)\""))
                props.Add(new FigureSet.Prop
                {
                    name = m.Groups[1].Value, prefab = LibraryImporter.LoadPrefab("Hito_Prop_" + m.Groups[1].Value),
                    rightHand = m.Groups[2].Value == "RightHand", upright = m.Groups[3].Value == "up",
                });
            set.props = props.ToArray();
            set.player = LibraryImporter.LoadPrefab("Hito_Driver");
            GameObject[] P(params string[] names) => names.Select(n => LibraryImporter.LoadPrefab(n)).Where(p => p != null).ToArray();
            GameObject[] A(string prefix) => Directory.GetFiles(LibraryImporter.PrefabDir, $"P_Animal_{prefix}*.prefab").OrderBy(f => f)
                .Select(AssetDatabase.LoadAssetAtPath<GameObject>).ToArray();
            set.animals = new[]
            {
                new FigureSet.AnimalLook { kind = "cat", prefabs = A("Cat_") },
                new FigureSet.AnimalLook { kind = "chicken", prefabs = A("Chicken_") },
                new FigureSet.AnimalLook { kind = "goat", prefabs = A("Goat") },
                // The perched crow sits on power poles (AnimalSpots); on the ground it would look wrong.
                new FigureSet.AnimalLook { kind = "crow", prefabs = A("Crow").Where(g => !g.name.EndsWith("_Perch")).ToArray() },
                new FigureSet.AnimalLook { kind = "crowPerch", prefabs = A("Crow_Perch") },
                new FigureSet.AnimalLook { kind = "pigeon", prefabs = A("Pigeon") },
                new FigureSet.AnimalLook { kind = "dog", prefabs = A("Shiba_") },
            };
            // Who plays what (ArtSource/STATUS.md task 6). Seeded once: weights and roles are choices.
            if (set.looks == null || set.looks.Length == 0)
            {
                var town = P("Hito_Salaryman", "Hito_SalarymanB", "Hito_OfficeLady", "Hito_Student", "Hito_Schoolgirl", "Hito_Casual", "Hito_CasualF", "Hito_Yukata");
                var old = P("Hito_Obaachan", "Hito_Ojiichan");
                var kids = P("Hito_KidBoy", "Hito_KidGirl");
                FigureSet.Look L(string role, GameObject[] b, string clip, string prop, float w) =>
                    new() { role = role, bodies = b, clip = clip, prop = prop, weight = w };
                set.looks = new[]
                {
                    // After the rain: some still under the umbrella, many carry it furled.
                    L("crowd", town, "WalkUmbrella", "Umbrella_Vinyl_Open", 0.14f),
                    L("crowd", town, "WalkUmbrella", "Umbrella_Black_Open", 0.06f),
                    L("crowd", town, "WalkUmbrella", "Umbrella_Red_Open", 0.04f),
                    L("crowd", town, "Walk", "Umbrella_Vinyl_Closed", 0.16f),
                    L("crowd", town, "Walk", "Umbrella_Navy_Closed", 0.08f),
                    L("crowd", P("Hito_Salaryman", "Hito_SalarymanB", "Hito_OfficeLady"), "Walk", "Briefcase", 0.14f),
                    L("crowd", town, "Walk", "KonbiniBag", 0.1f),
                    L("crowd", town, "Walk", "EcoBag", 0.06f),
                    L("crowd", town, "Walk", "", 0.12f),
                    L("crowd", old, "Walk", "Cane", 0.05f),
                    L("crowd", old, "Walk", "Kinchaku", 0.03f),
                    L("crowd", kids, "Walk", "", 0.04f),
                    L("worker", P("Hito_Worker"), "Work", "Hammer", 1f),
                    L("fisher", P("Hito_Fisher"), "Fish", "FishingRod", 1f),
                    L("seated", old, "Sit", "", 1f),
                    L("visitor", town, "Phone", "Phone", 0.3f),
                    L("visitor", town, "Idle", "KonbiniBag", 0.25f),
                    L("visitor", old, "Idle", "Cane", 0.15f),
                    L("visitor", P("Hito_Shopkeeper"), "Sweep", "Broom", 0.15f),
                    L("visitor", P("Hito_Shopkeeper"), "Bow", "", 0.15f),
                };
            }
            EditorUtility.SetDirty(set);

            // The player's own body in the start download; everything else above is streamed (LifeContent).
            var player = AssetDatabase.LoadAssetAtPath<FigureSet>(PlayerFigurePath);
            if (player == null)
            {
                player = ScriptableObject.CreateInstance<FigureSet>();
                AssetDatabase.CreateAsset(player, PlayerFigurePath);
            }
            player.player = LibraryImporter.LoadPrefab(PlayerPrefab);
            player.clips = set.clips.Where(c => PlayerClips.Contains(c.name)).ToArray();
            player.props = new FigureSet.Prop[0];
            player.looks = new FigureSet.Look[0];
            player.animals = new FigureSet.AnimalLook[0];
            EditorUtility.SetDirty(player);
        }

        /// <summary>Traffic models and paint mix from traffic.json; weights and wheelbases set once (generator values).</summary>
        static string FillTraffic(string json)
        {
            var s = AssetDatabase.LoadAssetAtPath<TrafficLooks>(TrafficLooksPath);
            if (s == null)
            {
                s = ScriptableObject.CreateInstance<TrafficLooks>();
                AssetDatabase.CreateAsset(s, TrafficLooksPath);
            }
            var text = File.ReadAllText(json);
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            // Share of the street and wheelbase (ArtSource/props/traffic_cars.py), seeded once per model.
            var seed = new Dictionary<string, (float w, float wb)>
            {
                ["Kei_Tall"] = (0.18f, 2.52f), ["Kei_Hatch"] = (0.1f, 2.52f), ["Kei_Van"] = (0.08f, 2.43f),
                ["Compact"] = (0.15f, 2.53f), ["Sedan"] = (0.1f, 2.7f), ["Minivan"] = (0.12f, 2.86f),
                ["Taxi_JPN"] = (0.1f, 2.75f), ["Taxi_Sedan"] = (0.05f, 2.68f), ["Truck_2t"] = (0.07f, 3.4f), ["Bus_Mini"] = (0.05f, 4.2f),
            };
            var models = new List<TrafficLooks.Model>();
            foreach (Match m in Regex.Matches(text, "\"(\\w+)\":\\s*\\{\\s*\"size\":\\s*\\[\\s*([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)\\s*\\],\\s*\"paint\":\\s*(true|false)"))
            {
                var name = m.Groups[1].Value;
                var old = s.models?.FirstOrDefault(x => x.name == name);
                var (w, wb) = seed.TryGetValue(name, out var v) ? v : (0.05f, 2.6f);
                models.Add(new TrafficLooks.Model
                {
                    name = name, prefab = LibraryImporter.LoadPrefab("Traffic_" + name),
                    // json: width, length, height
                    size = new Vector3(float.Parse(m.Groups[3].Value, inv), float.Parse(m.Groups[2].Value, inv), float.Parse(m.Groups[4].Value, inv)),
                    paint = m.Groups[5].Value == "true",
                    weight = old is { prefab: not null } o ? o.weight : w,
                    wheelbase = old is { prefab: not null } o2 ? o2.wheelbase : wb,
                });
            }
            s.models = models.ToArray();
            var paints = new List<TrafficLooks.Paint>();
            foreach (Match m in Regex.Matches(text, "\"(\\w+)\":\\s*\\[\\s*\"(#[0-9a-fA-F]{6})\",\\s*([\\d.]+)\\s*\\]"))
            {
                ColorUtility.TryParseHtmlString(m.Groups[2].Value, out var c);
                paints.Add(new TrafficLooks.Paint { name = m.Groups[1].Value, color = c, weight = float.Parse(m.Groups[3].Value, inv) });
            }
            s.paints = paints.ToArray();
            s.paintMaterial = AssetDatabase.LoadAssetAtPath<Material>(LibraryImporter.PaintPath);
            EditorUtility.SetDirty(s);
            return $"traffic {models.Count(x => x.prefab != null)}/{models.Count} models, {paints.Count} paints";
        }
    }

    /// <summary>Import settings for the people: Humanoid, axis conversion baked, atlas material, metres.</summary>
    public sealed class FigureModelRules : AssetPostprocessor
    {
        void OnPreprocessModel()
        {
            if (!assetPath.StartsWith(FigureImporter.ArtDir + "/")) return;
            var m = (ModelImporter)assetImporter;
            var anims = Path.GetFileNameWithoutExtension(assetPath) == FigureImporter.AnimsName;
            m.globalScale = 1;
            m.useFileScale = true;
            m.bakeAxisConversion = true;
            m.animationType = ModelImporterAnimationType.Human;
            // Every body its own avatar: the bodies have a "Rig" node above Hips that the anims file lacks
            // (Copy From Other then fails silently, no Animator), and kids need their own proportions anyway.
            m.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            m.importAnimation = anims;
            m.animationCompression = ModelImporterAnimationCompression.Optimal;
            m.importCameras = false;
            m.importLights = false;
            m.importBlendShapes = false;
            m.importVisibility = false;
            m.isReadable = false;
            m.meshCompression = ModelImporterMeshCompression.Medium;
            m.importNormals = ModelImporterNormals.Import;
            m.importTangents = ModelImporterTangents.None;
            m.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            m.materialLocation = ModelImporterMaterialLocation.InPrefab;
            m.skinWeights = ModelImporterSkinWeights.Standard; // 4 bones
            if (!Directory.Exists(LibraryImporter.MaterialDir)) return;
            foreach (var path in Directory.GetFiles(LibraryImporter.MaterialDir, "*.mat"))
            {
                var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (mat != null) m.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), mat.name), mat);
            }
        }
    }
}
