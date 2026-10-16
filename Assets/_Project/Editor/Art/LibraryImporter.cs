using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.Editor.Art
{
    /// <summary>
    /// Asset sprint → Unity. Reads ArtSource/exports/manifest.json, copies approved FBX and atlas
    /// textures to Art/Library/, makes one URP/Lit material per atlas and one prefab per asset
    /// (Prefabs/Library/P_&lt;Name&gt;): LODGroup from _LOD0/_LOD1/_LOD2, BoxColliders from COL_ meshes,
    /// point lights from LIGHT_ markers, LENS_ parts (traffic lights) switched to one state.
    /// Running it twice changes nothing; files are copied only when their bytes differ.
    /// Menu: JapanMap/Art/Import Library.
    /// </summary>
    public static class LibraryImporter
    {
        public const string ArtDir = "Assets/_Project/Art/Library";
        public const string PrefabDir = "Assets/_Project/Prefabs/Library";
        public static string TextureDir => $"{ArtDir}/Textures";
        public static string MaterialDir => $"{ArtDir}/Materials";

        public static LibraryImportSettings Settings()
        {
            var s = AssetDatabase.LoadAssetAtPath<LibraryImportSettings>(LibraryImportSettings.AssetPath);
            if (s != null) return s;
            Directory.CreateDirectory(Path.GetDirectoryName(LibraryImportSettings.AssetPath));
            s = ScriptableObject.CreateInstance<LibraryImportSettings>();
            AssetDatabase.CreateAsset(s, LibraryImportSettings.AssetPath);
            return s;
        }

        public static LibraryManifest Manifest(LibraryImportSettings s) =>
            LibraryManifest.Load(Path.Combine(s.sourceDir, "manifest.json"));

        public static bool IsApproved(LibraryImportSettings s, LibraryManifest.Entry e) =>
            !s.excluded.Contains(e.name) && e.Atlases.All(a => s.approvedAtlases.Contains(a));

        public static string PrefabPath(string name) => $"{PrefabDir}/P_{name}.prefab";

        public static GameObject LoadPrefab(string name) => AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath(name));

        [MenuItem("JapanMap/Art/Import Library")]
        public static void ImportFromMenu() => Debug.Log(Import(Settings()));

        public static string Import(LibraryImportSettings s)
        {
            var manifest = Manifest(s);
            // Skinned bodies come in through FigureImporter (Humanoid), not as static library props.
            var approved = manifest.entries.Where(e => IsApproved(s, e) && !FigureImporter.IsBody(e.name)).ToList();
            var skipped = manifest.entries.Count(e => !IsApproved(s, e));
            var atlases = approved.SelectMany(e => e.Atlases).Distinct().OrderBy(a => a).ToList();

            Directory.CreateDirectory(TextureDir);
            Directory.CreateDirectory(MaterialDir);
            Directory.CreateDirectory(PrefabDir);

            var copied = 0;
            AssetDatabase.StartAssetEditing();
            try
            {
                foreach (var a in atlases)
                foreach (var map in new[] { "BaseColor", "MaskMap", "Emission" })
                    copied += Copy(Path.Combine(s.sourceDir, "textures", $"T_{a}_{map}.png"), $"{TextureDir}/T_{a}_{map}.png") ? 1 : 0;
            }
            finally { AssetDatabase.StopAssetEditing(); }
            AssetDatabase.Refresh();

            // Materials must exist before the FBX import so LibraryModelRules can remap to them.
            foreach (var a in atlases) AtlasMaterial(a, s);
            GlassMaterial();
            PaintMaterial();
            AssetDatabase.SaveAssets();

            // Unity drops self-intersecting n-gons on import (holes in the model) and only logs it.
            var dropped = new Dictionary<string, int>();
            void Watch(string msg, string _, LogType __)
            {
                if (!msg.Contains("self-intersecting")) return;
                var mesh = System.Text.RegularExpressions.Regex.Match(msg, "Mesh '([^']+)'").Groups[1].Value;
                dropped[mesh] = dropped.TryGetValue(mesh, out var n) ? n + 1 : 1;
            }
            Application.logMessageReceived += Watch;
            AssetDatabase.StartAssetEditing();
            try
            {
                foreach (var e in approved)
                    copied += Copy(Path.Combine(s.sourceDir, e.fbx), ModelPath(e)) ? 1 : 0;
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.Refresh();
                Application.logMessageReceived -= Watch;
            }

            var built = 0;
            var problems = new List<string>();
            foreach (var e in approved)
            {
                var problem = BuildPrefab(e, s);
                if (problem == null) built++;
                else problems.Add(problem);
            }
            AssetDatabase.SaveAssets();
            var report = $"[Library] {built}/{approved.Count} prefabs, {atlases.Count} atlases, {copied} files copied, {skipped} not approved yet";
            if (dropped.Count > 0)
                problems.Add($"{dropped.Values.Sum()} self-intersecting polygons dropped by Unity (holes) in: " +
                             string.Join(", ", dropped.OrderByDescending(d => d.Value).Select(d => $"{d.Key} {d.Value}")) +
                             " — fix in ArtSource (triangulate before export)");
            if (problems.Count > 0) report += "\n  " + string.Join("\n  ", problems);
            return report;
        }

        public static string ModelPath(LibraryManifest.Entry e) => $"{ArtDir}/{e.cls}/{Path.GetFileName(e.fbx)}";

        static bool Copy(string from, string to)
        {
            if (!File.Exists(from)) throw new FileNotFoundException(from);
            Directory.CreateDirectory(Path.GetDirectoryName(to));
            if (File.Exists(to) && File.ReadAllBytes(to).SequenceEqual(File.ReadAllBytes(from))) return false;
            File.Copy(from, to, true);
            return true;
        }

        public static string MaterialPath(string atlas) => $"{MaterialDir}/M_{atlas}_Atlas.mat";

        /// <summary>Emission strengths only, without a library import (light levels are tuned against the image).</summary>
        [MenuItem("JapanMap/Art/Apply Emission")]
        public static string ApplyEmission()
        {
            var s = AssetDatabase.LoadAssetAtPath<LibraryImportSettings>(LibraryImportSettings.AssetPath);
            var n = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:Material", new[] { MaterialDir }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var file = Path.GetFileNameWithoutExtension(path);
                if (!file.StartsWith("M_") || !file.EndsWith("_Atlas")) continue;
                var atlas = file.Substring(2, file.Length - 8);
                var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (mat.GetTexture("_EmissionMap") == null) continue;
                mat.SetColor("_EmissionColor", Color.white * s.EmissionFor(atlas));
                EditorUtility.SetDirty(mat);
                n++;
            }
            AssetDatabase.SaveAssets();
            return $"[Library] emission applied to {n} atlas materials";
        }
        public static string GlassPath => $"{MaterialDir}/M_Glass.mat";

        static Material AtlasMaterial(string atlas, LibraryImportSettings s)
        {
            var path = MaterialPath(atlas);
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(mat, path);
            }
            Texture2D Tex(string map) => AssetDatabase.LoadAssetAtPath<Texture2D>($"{TextureDir}/T_{atlas}_{map}.png");
            mat.SetTexture("_BaseMap", Tex("BaseColor"));
            mat.SetColor("_BaseColor", Color.white);
            // MaskMap: R metal, G AO (=1), A smoothness — the layout URP/Lit reads from _MetallicGlossMap.
            mat.SetTexture("_MetallicGlossMap", Tex("MaskMap"));
            mat.SetFloat("_Smoothness", 1f);
            mat.SetFloat("_SmoothnessTextureChannel", 0);
            mat.EnableKeyword("_METALLICSPECGLOSSMAP");
            var emission = Tex("Emission");
            mat.SetTexture("_EmissionMap", emission);
            mat.SetColor("_EmissionColor", Color.white * s.EmissionFor(atlas));
            mat.EnableKeyword("_EMISSION");
            // Not None: URP's material validation (on every reimport) turns _EMISSION off when the GI flags are None.
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            // Flora (leaf cards with alpha, STYLE-KIT): one cutout material, both sides — opaque, the
            // cards drew as pink planks (weeping cherries at Sakura, 2026-10-09).
            var cutout = atlas == "Flora";
            mat.SetFloat("_AlphaClip", cutout ? 1f : 0f);
            mat.SetFloat("_Cutoff", 0.5f);
            mat.SetFloat("_Cull", cutout ? (float)CullMode.Off : (float)CullMode.Back);
            if (cutout) mat.EnableKeyword("_ALPHATEST_ON"); else mat.DisableKeyword("_ALPHATEST_ON");
            mat.SetOverrideTag("RenderType", cutout ? "TransparentCutout" : "Opaque");
            mat.renderQueue = cutout ? (int)RenderQueue.AlphaTest : -1;
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        static Material GlassMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(GlassPath);
            if (mat != null) return mat;
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mat.SetFloat("_Surface", 1); // transparent
            mat.SetFloat("_Blend", 0);
            mat.SetFloat("_ZWrite", 0);
            mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            mat.SetOverrideTag("RenderType", "Transparent");
            mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            mat.renderQueue = (int)RenderQueue.Transparent;
            mat.SetColor("_BaseColor", new Color(0.55f, 0.65f, 0.72f, 0.28f));
            mat.SetFloat("_Smoothness", 0.95f);
            mat.enableInstancing = true;
            AssetDatabase.CreateAsset(mat, GlassPath);
            return mat;
        }

        public static string PaintPath => $"{MaterialDir}/M_TrafficPaint.mat";

        /// <summary>
        /// Body paint of the traffic cars (asset sprint 6): one plain lit material the FBX slot maps to;
        /// TrafficSystem tints a copy per colour of the mix (traffic.json).
        /// </summary>
        static Material PaintMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(PaintPath);
            if (mat != null) return mat;
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mat.SetColor("_BaseColor", new Color(0.82f, 0.82f, 0.8f)); // Blender: roughness 0.28, not metallic
            mat.SetFloat("_Smoothness", 0.72f);
            mat.SetFloat("_Metallic", 0f);
            mat.enableInstancing = true;
            AssetDatabase.CreateAsset(mat, PaintPath);
            return mat;
        }

        /// <summary>Returns null on success, else a one-line problem.</summary>
        static string BuildPrefab(LibraryManifest.Entry e, LibraryImportSettings s)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath(e));
            if (model == null) return $"{e.name}: model missing at {ModelPath(e)}";
            var root = (GameObject)Object.Instantiate(model);
            root.name = $"P_{e.name}";
            try
            {
                var all = root.GetComponentsInChildren<Transform>(true);
                Transform Find(string n) => all.FirstOrDefault(t => t != null && t.name == n);

                foreach (var col in e.colliders)
                {
                    var t = Find(col);
                    if (t == null) return $"{e.name}: collider {col} not in FBX";
                    var mf = t.GetComponent<MeshFilter>();
                    if (mf != null && mf.sharedMesh != null)
                    {
                        var box = t.gameObject.AddComponent<BoxCollider>();
                        box.center = mf.sharedMesh.bounds.center;
                        box.size = mf.sharedMesh.bounds.size;
                    }
                    Object.DestroyImmediate(t.GetComponent<MeshRenderer>());
                    Object.DestroyImmediate(mf);
                }

                var renderers = root.GetComponentsInChildren<MeshRenderer>(true);
                var lod = new List<Renderer>[3] { new(), new(), new() };
                foreach (var r in renderers)
                {
                    if (r.name.EndsWith("_LOD1")) lod[1].Add(r);
                    // _LOD2 (asset sprint 4/5c: trees, towers) was filed under LOD0 and drawn on top of it.
                    else if (r.name.EndsWith("_LOD2")) lod[2].Add(r);
                    else lod[0].Add(r); // _LOD0, LENS_ etc. belong to the full detail level
                }
                if (lod[0].Count == 0) return $"{e.name}: no _LOD0 renderer";

                var bounds = renderers[0].bounds;
                foreach (var r in renderers) bounds.Encapsulate(r.bounds);
                var building = e.cls == "buildings";
                var group = root.GetComponent<LODGroup>();
                if (group == null) group = root.AddComponent<LODGroup>(); // Unity adds one itself for _LODn names; fake-null defeats ??
                var present = lod.Where(l => l.Count > 0).ToList();
                // Screen heights: LOD0 → next at lod0, middle → far at lod1, last culled at cull.
                var steps = new[] { building ? s.buildingLod0 : s.propLod0, building ? s.buildingLod1 : s.propLod1, building ? s.buildingCull : s.propCull };
                var levels = new List<LOD>();
                for (var i = 0; i < present.Count; i++)
                {
                    var last = i == present.Count - 1;
                    levels.Add(new LOD(last ? steps[2] : steps[i], present[i].ToArray()));
                }
                group.SetLODs(levels.ToArray());
                group.RecalculateBounds();

                var castShadows = bounds.size.y >= s.shadowMinHeight;
                foreach (var r in renderers)
                {
                    r.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                    r.lightProbeUsage = LightProbeUsage.Off;
                    r.reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox;
                }

                // Traffic lights: only one lens lit (green); the others stay dark until gameplay switches them.
                foreach (var name in e.switchable)
                {
                    var t = Find(name);
                    if (t != null) t.gameObject.SetActive(name.Contains("_Green"));
                }

                foreach (var l in e.lights ?? new LibraryManifest.Light[0])
                {
                    var t = Find(l.name);
                    if (t == null) return $"{e.name}: light marker {l.name} not in FBX";
                    var light = t.gameObject.AddComponent<Light>();
                    // URP adds this itself the first time a scene shows the light — then as an added
                    // component on every placed instance (Game.unity grew 3.7 MB from 385 lamps).
                    t.gameObject.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalLightData>();
                    light.type = LightType.Point;
                    light.color = new Color(l.color[0], l.color[1], l.color[2]);
                    light.range = l.range > 0 ? l.range : 6f;
                    light.intensity = s.lightIntensity;
                    light.shadows = LightShadows.None;
                    light.renderMode = LightRenderMode.Auto;
                }

                foreach (var t in root.GetComponentsInChildren<Transform>(true))
                    GameObjectUtility.SetStaticEditorFlags(t.gameObject,
                        StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.ReflectionProbeStatic);

                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath(e.name));
                return null;
            }
            finally { Object.DestroyImmediate(root); }
        }
    }

    /// <summary>Import settings for library FBX: metres, no animation/cameras, materials remapped to the atlas materials.</summary>
    public sealed class LibraryModelRules : AssetPostprocessor
    {
        void OnPreprocessModel()
        {
            if (!assetPath.StartsWith(LibraryImporter.ArtDir + "/")) return;
            var m = (ModelImporter)assetImporter;
            m.globalScale = 1;
            m.useFileScale = true;
            m.importAnimation = false;
            m.animationType = ModelImporterAnimationType.None;
            m.importCameras = false;
            m.importLights = false;
            m.importBlendShapes = false;
            m.importVisibility = false;
            m.isReadable = false;
            m.meshCompression = ModelImporterMeshCompression.Medium;
            m.optimizeMeshPolygons = true;
            m.optimizeMeshVertices = true;
            m.importNormals = ModelImporterNormals.Import;
            m.importTangents = ModelImporterTangents.None; // no normal maps in the style kit
            m.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            m.materialLocation = ModelImporterMaterialLocation.InPrefab;
            if (!Directory.Exists(LibraryImporter.MaterialDir)) return;
            foreach (var path in Directory.GetFiles(LibraryImporter.MaterialDir, "*.mat"))
            {
                var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (mat != null) m.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), mat.name), mat);
            }
        }

        void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith(LibraryImporter.ArtDir + "/")) return;
            var t = (TextureImporter)assetImporter;
            t.sRGBTexture = !assetPath.EndsWith("_MaskMap.png");
            // Figures atlas: flat colour cells, 256 px carry them (ArtSource/STATUS.md, task 6).
            t.maxTextureSize = assetPath.Contains("/T_Figures_") ? 256 : TextureImportRules.MaxSize;
            t.mipmapEnabled = true;
            t.anisoLevel = 4;
        }
    }
}
