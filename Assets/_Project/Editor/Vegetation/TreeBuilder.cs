using System.Collections.Generic;
using System.IO;
using JapanMap.Editor.Map;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.Editor.Vegetation
{
    /// <summary>
    /// Interim vegetation models, generated in the editor until the asset sprint delivers its trees
    /// (sprint task 4; DECISIONS D18). Cedar (sugi), maple (momiji), cherry (sakura), bamboo, bush,
    /// plus detail meshes for grass and rice. Each tree: LOD0 / LOD1 / LOD2 (a few dozen triangles
    /// instead of a billboard) in one prefab Prefabs/Vegetation/P_Veg_&lt;Species&gt;_&lt;n&gt;.
    /// All share one material with a palette texture. Menu: JapanMap/Vegetation/Build Models.
    /// </summary>
    public static class TreeBuilder
    {
        public const string ArtDir = "Assets/_Project/Art/Vegetation";
        public const string PrefabDir = "Assets/_Project/Prefabs/Vegetation";
        public static string PalettePath => $"{ArtDir}/T_Vegetation_Palette.png";
        public static string MaterialPath => $"{ArtDir}/M_Vegetation.mat";

        // Palette: 8×8 cells of 8 px. Colours (sRGB) after ART-DIRECTION / style kit (Laub #3c5a2a, Holz dunkel).
        static readonly Color[] Palette =
        {
            Hex(0x3a2c22), Hex(0x5a4030), Hex(0x6b4a3a), Hex(0x8a8a80), // 0 bark dark, 1 cedar bark, 2 cherry bark, 3 birch-ish
            Hex(0x2c3f2a), Hex(0x33482c), Hex(0x3c5a2a), Hex(0x4a6630), // 4..7 cedar / broadleaf greens dark→light
            Hex(0xa8321e), Hex(0xc4501f), Hex(0xd77a2a), Hex(0x7a8a32), // 8..11 maple red, orange, amber, yellow-green
            Hex(0xe8b4c4), Hex(0xf2c8d4), Hex(0xd890a8), Hex(0xfbe0e6), // 12..15 sakura pinks
            Hex(0x6f8a3a), Hex(0x8ea24a), Hex(0x55702e), Hex(0x9aa860), // 16..19 bamboo culm / leaves
            Hex(0x5a6b35), Hex(0x6e7d3c), Hex(0x4a5a2c), Hex(0x8a8a4a), // 20..23 grass (legacy GROUND_TINT #5a6b35), dry tip
            Hex(0x4f7a3a), Hex(0x6a9440), Hex(0x86a850), Hex(0x3f6030), // 24..27 rice
            Hex(0x46592f), Hex(0x3e5030), Hex(0x55683a), Hex(0x2f4a34), // 28..31 bush, legacy pine #2f4a34
        };

        static Color Hex(int rgb) => new(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
        public static Vector2 Cell(int i) => new(((i % 8) + 0.5f) / 8f, ((i / 8) + 0.5f) / 8f);

        public enum Species { Cedar, Maple, Cherry, Bamboo, Bush }
        public const int Variants = 3;

        public static string PrefabPath(Species s, int v) => $"{PrefabDir}/P_Veg_{s}_{v}.prefab";
        public static string DetailPath(string name) => $"{PrefabDir}/P_Veg_{name}.prefab";

        [MenuItem("JapanMap/Vegetation/Build Models")]
        public static void BuildFromMenu() => Debug.Log(Build());

        public static string Build()
        {
            Directory.CreateDirectory(ArtDir);
            Directory.CreateDirectory(PrefabDir);
            var mat = MaterialAsset();
            var report = new List<string>();
            foreach (Species s in System.Enum.GetValues(typeof(Species)))
            for (var v = 0; v < Variants; v++)
            {
                var lods = new[] { Make(s, v, 0), Make(s, v, 1), Make(s, v, 2) };
                report.Add($"{s}_{v}: {lods[0].Triangles}/{lods[1].Triangles}/{lods[2].Triangles}");
                SavePrefab(PrefabPath(s, v), $"Veg_{s}_{v}", lods, mat, s == Species.Bush ? 0.08f : 0.25f, s == Species.Bush ? 0.03f : 0.07f, s == Species.Bush ? 0.012f : 0.006f);
            }
            var grass = Grass(); SaveDetail("Grass", grass, mat);
            var rice = Rice(); SaveDetail("Rice", rice, mat);
            report.Add($"Grass {grass.Triangles}, Rice {rice.Triangles}");
            AssetDatabase.SaveAssets();
            return "[Vegetation] " + string.Join(" · ", report);
        }

        static MeshKit Make(Species s, int v, int lod)
        {
            var k = new MeshKit();
            var rnd = new System.Random(1000 * (int)s + v); // same seed for all LODs → same silhouette
            switch (s)
            {
                case Species.Cedar: Cedar(k, rnd, v, lod); break;
                case Species.Maple: Broadleaf(k, rnd, v, lod, maple: true); break;
                case Species.Cherry: Broadleaf(k, rnd, v, lod, maple: false); break;
                case Species.Bamboo: Bamboo(k, rnd, v, lod); break;
                case Species.Bush: Bush(k, rnd, v, lod); break;
            }
            return k;
        }

        static float R(System.Random r, float a, float b) => a + (float)r.NextDouble() * (b - a);

        /// <summary>Sugi: straight trunk to the top, narrow conical crown of drooping tiers, 18–26 m.</summary>
        static void Cedar(MeshKit k, System.Random r, int v, int lod)
        {
            var h = R(r, 18, 26);
            var crownBase = h * R(r, 0.28f, 0.38f);
            var sides = lod == 0 ? 7 : lod == 1 ? 5 : 4;
            k.Tube(Vector3.zero - Vector3.up * 0.3f, Vector3.up * h * 0.92f, 0.38f, 0.08f, sides, Cell(1), lod == 0 ? 3 : 1);
            var crown = new Vector3(0, (crownBase + h) / 2, 0);
            var tiers = lod == 0 ? 13 : lod == 1 ? 6 : 2;
            for (var i = 0; i < tiers; i++)
            {
                var f = i / (float)(tiers - 1);
                var y = Mathf.Lerp(crownBase, h * 0.9f, f);
                // Sugi: narrow, almost columnar crown, rounded at the top (radius ~ sqrt of the distance to the top).
                var radius = h * 0.15f * Mathf.Sqrt(1 - f * 0.92f) * R(r, 0.8f, 1.2f);
                var tierH = (h - crownBase) / tiers * (lod == 2 ? 2.4f : 2.3f);
                var colour = 5 + (f > 0.55f ? 1 : 0) - (v == 2 ? 1 : 0);
                if (lod == 2) k.Cone(new Vector3(0, y, 0), radius * 1.05f, (h - y) * 0.9f + tierH * 0.2f, 5, 0.1f, i, Cell(colour), crown, 0.15f);
                else k.Cone(new Vector3(R(r, -0.25f, 0.25f), y, R(r, -0.25f, 0.25f)), radius, tierH, lod == 0 ? 13 : 7, 0.3f, i + v * 17, Cell(colour), crown, 0.35f);
            }
        }

        /// <summary>Momiji / sakura: short trunk, a few branches, a wide crown of noisy blobs. Cherry is flatter and spreads more.</summary>
        static void Broadleaf(MeshKit k, System.Random r, int v, int lod, bool maple)
        {
            var h = maple ? R(r, 7, 10) : R(r, 6, 8.5f);
            var trunkTop = h * (maple ? 0.42f : 0.36f);
            var sides = lod == 0 ? 7 : 5;
            var bark = maple ? 0 : 2;
            k.Tube(-Vector3.up * 0.3f, Vector3.up * trunkTop, maple ? 0.3f : 0.38f, 0.2f, sides, Cell(bark), lod == 0 ? 2 : 1, new Vector3(R(r, -0.3f, 0.3f), 0, R(r, -0.3f, 0.3f)));
            var crownC = new Vector3(0, maple ? h * 0.66f : h * 0.62f, 0);
            var spread = maple ? h * 0.42f : h * 0.62f;
            var blobs = lod == 0 ? 9 : lod == 1 ? 5 : 1;
            var branchCount = lod == 2 ? 0 : (maple ? 4 : 5);
            for (var b = 0; b < branchCount; b++)
            {
                var ang = b * Mathf.PI * 2 / branchCount + R(r, -0.3f, 0.3f);
                var tip = new Vector3(Mathf.Cos(ang) * spread * 0.7f, crownC.y + R(r, -0.6f, 0.8f), Mathf.Sin(ang) * spread * 0.7f);
                k.Tube(Vector3.up * trunkTop * 0.9f, tip, 0.17f, 0.06f, 4, Cell(bark));
            }
            int[] colours = maple ? (v == 0 ? new[] { 6, 7, 11 } : v == 1 ? new[] { 9, 10, 8 } : new[] { 8, 9, 8 }) : new[] { 12, 13, 14, 15 };
            if (lod == 2)
            {
                k.Blob(crownC, new Vector3(spread, maple ? h * 0.36f : h * 0.3f, spread), 1, 0.15f, v, Cell(colours[0]), crownC - Vector3.up * 2);
                return;
            }
            for (var i = 0; i < blobs; i++)
            {
                var ang = i * 2.39996f + v; // golden angle
                var rad = i == 0 ? 0 : spread * R(r, 0.45f, 0.8f);
                var c = crownC + new Vector3(Mathf.Cos(ang) * rad, R(r, -0.7f, 1.2f) - (rad / spread) * (maple ? 0.6f : 1.1f), Mathf.Sin(ang) * rad);
                var size = (i == 0 ? spread * 0.75f : spread * R(r, 0.42f, 0.6f));
                k.Blob(c, new Vector3(size, size * (maple ? 0.72f : 0.55f), size), lod == 0 ? 2 : 1, 0.28f, i + v * 31, Cell(colours[i % colours.Length]), crownC - Vector3.up * 1.5f);
            }
        }

        /// <summary>A clump of culms (8–13 m) with leafy tops leaning outwards.</summary>
        static void Bamboo(MeshKit k, System.Random r, int v, int lod)
        {
            var culms = lod == 0 ? 9 : lod == 1 ? 6 : 3;
            var top = Vector3.zero;
            for (var i = 0; i < culms; i++)
            {
                var ang = i * 2.39996f + v;
                var baseP = new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang)) * R(r, 0.2f, 1.4f) - Vector3.up * 0.2f;
                var h = R(r, 8, 13);
                var lean = new Vector3(baseP.x, 0, baseP.z).normalized * h * R(r, 0.08f, 0.2f);
                var tip = baseP + Vector3.up * h + lean;
                if (lod < 2) k.Tube(baseP, tip, 0.06f, 0.035f, lod == 0 ? 5 : 4, Cell(16 + (i % 2)), lod == 0 ? 3 : 1, lean * 0.15f);
                // Foliage hangs along the upper third in small feathery clumps, not one ball on a stick.
                var clumps = lod == 0 ? 6 : lod == 1 ? 2 : 1;
                for (var c = 0; c < clumps; c++)
                {
                    var f = Mathf.Lerp(0.5f, 0.98f, clumps == 1 ? 0.6f : c / (float)(clumps - 1));
                    var p = Vector3.Lerp(baseP, tip, f) + new Vector3(R(r, -0.5f, 0.5f), 0, R(r, -0.5f, 0.5f)) + lean.normalized * 0.4f;
                    var size = lod == 2 ? 1.6f : R(r, 0.7f, 1.05f);
                    k.Blob(p, new Vector3(size * 0.75f, size * 1.15f, size * 0.75f), lod == 0 ? 1 : 0, 0.45f, i * 5 + c + v * 7, Cell(18 + (i + c) % 2 * 1 + (c == clumps - 1 ? 1 : 0)), p - Vector3.up * 1.5f, 0.6f);
                }
                top += tip;
            }
            if (lod == 2) k.Tube(Vector3.zero, top / culms * 0.9f, 0.15f, 0.06f, 3, Cell(16));
        }

        static void Bush(MeshKit k, System.Random r, int v, int lod)
        {
            var blobs = lod == 0 ? 4 : lod == 1 ? 3 : 1;
            var c0 = new Vector3(0, 0.55f, 0);
            for (var i = 0; i < blobs; i++)
            {
                var ang = i * 2.39996f + v;
                var rad = i == 0 ? 0 : R(r, 0.4f, 0.7f);
                var c = c0 + new Vector3(Mathf.Cos(ang) * rad, R(r, -0.15f, 0.15f), Mathf.Sin(ang) * rad);
                var size = i == 0 ? 0.9f : R(r, 0.5f, 0.7f);
                k.Blob(c, new Vector3(size, size * 0.8f, size), lod == 0 ? 2 : lod == 1 ? 1 : 0, 0.3f, i + v * 5, Cell(28 + (i + v) % 3), c0 - Vector3.up * 0.4f, 0.1f);
            }
        }

        /// <summary>Grass tuft: 7 tapered blades, ~0.45 m.</summary>
        static MeshKit Grass()
        {
            var k = new MeshKit();
            var r = new System.Random(7);
            for (var i = 0; i < 7; i++)
            {
                var ang = i * 2.39996f;
                var dir = new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang));
                var b = dir * R(r, 0, 0.12f);
                k.Blade(b, b + dir * R(r, 0.08f, 0.2f) + Vector3.up * R(r, 0.3f, 0.5f), 0.07f, Cell(20 + i % 3), Cell(i % 3 == 0 ? 23 : 21));
            }
            return k;
        }

        /// <summary>Rice hill: 9 upright blades, ~0.6 m (young rice in water).</summary>
        static MeshKit Rice()
        {
            var k = new MeshKit();
            var r = new System.Random(11);
            for (var i = 0; i < 9; i++)
            {
                var ang = i * 2.39996f;
                var dir = new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang));
                k.Blade(dir * 0.03f, dir * R(r, 0.06f, 0.16f) + Vector3.up * R(r, 0.45f, 0.65f), 0.035f, Cell(27), Cell(24 + i % 3));
            }
            return k;
        }

        static Material MaterialAsset()
        {
            var tex = new Texture2D(64, 64, TextureFormat.RGBA32, false);
            for (var y = 0; y < 64; y++)
            for (var x = 0; x < 64; x++)
                tex.SetPixel(x, y, (y / 8) * 8 + x / 8 < Palette.Length ? Palette[(y / 8) * 8 + x / 8] : Color.magenta);
            File.WriteAllBytes(PalettePath, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(PalettePath);
            var ti = (TextureImporter)AssetImporter.GetAtPath(PalettePath);
            ti.mipmapEnabled = false;
            ti.filterMode = FilterMode.Point;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.SaveAndReimport();

            var mat = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (mat == null)
            {
                mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(mat, MaterialPath);
            }
            mat.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(PalettePath));
            mat.SetColor("_BaseColor", Color.white);
            mat.SetFloat("_Smoothness", 0.25f); // wet leaves catch a little sky
            mat.SetFloat("_Cull", (float)CullMode.Off); // blades and cone undersides
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        static void SavePrefab(string path, string name, MeshKit[] lods, Material mat, float lod0, float lod1, float cull)
        {
            var root = new GameObject(name);
            try
            {
                var renderers = new Renderer[lods.Length];
                for (var i = 0; i < lods.Length; i++)
                {
                    var mesh = MeshAssets.Save($"{ArtDir}/SM_{name}_LOD{i}.asset", lods[i].ToMesh($"SM_{name}_LOD{i}"));
                    var go = new GameObject($"{name}_LOD{i}", typeof(MeshFilter), typeof(MeshRenderer));
                    go.transform.SetParent(root.transform, false);
                    go.GetComponent<MeshFilter>().sharedMesh = mesh;
                    var r = go.GetComponent<MeshRenderer>();
                    r.sharedMaterial = mat;
                    r.lightProbeUsage = LightProbeUsage.Off;
                    r.shadowCastingMode = i == 2 ? ShadowCastingMode.Off : ShadowCastingMode.On;
                    renderers[i] = r;
                }
                var group = root.AddComponent<LODGroup>();
                group.SetLODs(new[] { new LOD(lod0, new[] { renderers[0] }), new LOD(lod1, new[] { renderers[1] }), new LOD(cull, new[] { renderers[2] }) });
                group.RecalculateBounds();
                // Trunk collider: you hit the tree, not the crown.
                var cap = root.AddComponent<CapsuleCollider>();
                var b = renderers[0].GetComponent<MeshFilter>().sharedMesh.bounds;
                cap.radius = name.Contains("Bush") ? 0.5f : name.Contains("Bamboo") ? 0.6f : 0.35f;
                cap.height = Mathf.Min(b.size.y, 4f);
                cap.center = new Vector3(0, cap.height / 2, 0);
                PrefabUtility.SaveAsPrefabAsset(root, path);
            }
            finally { Object.DestroyImmediate(root); }
        }

        static void SaveDetail(string name, MeshKit kit, Material mat)
        {
            var root = new GameObject($"Veg_{name}", typeof(MeshFilter), typeof(MeshRenderer));
            try
            {
                root.GetComponent<MeshFilter>().sharedMesh = MeshAssets.Save($"{ArtDir}/SM_Veg_{name}.asset", kit.ToMesh($"SM_Veg_{name}"));
                var r = root.GetComponent<MeshRenderer>();
                r.sharedMaterial = mat;
                r.shadowCastingMode = ShadowCastingMode.Off;
                PrefabUtility.SaveAsPrefabAsset(root, DetailPath(name));
            }
            finally { Object.DestroyImmediate(root); }
        }
    }
}
