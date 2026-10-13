using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Sea, paddy water and river under World/Water in Game.unity — simple flat surfaces, the look
    /// comes in Phase 4. Needs the terrain (heights are sampled from it). Re-runnable.
    /// Menu: JapanMap/Map/Import Water.
    /// </summary>
    public static class WaterImporter
    {
        public const string GroupName = "Water";
        public const string MaterialDir = "Assets/_Project/Art/Materials";
        public const string MeshDir = "Assets/_Project/Data/Water";

        [MenuItem("JapanMap/Map/Import Water")]
        public static void ImportFromMenu()
        {
            Import(MapImportSettings.LoadOrCreate());
            MapScene.Save();
        }

        public static Transform Import(MapImportSettings settings)
        {
            var terrain = TerrainImporter.TileAt(Vector3.zero)
                ?? throw new InvalidOperationException("import the terrain first");
            Directory.CreateDirectory(MeshDir);
            var group = MapScene.FreshGroup(GroupName);

            var sea = Material("Water_Sea", new Color32(0x1d, 0x3b, 0x52, 255), 0.9f);
            var paddy = Material("Water_Paddy", new Color32(0x2b, 0x30, 0x26, 255), 0.94f);
            var river = Material("Water_River", new Color32(0x24, 0x3c, 0x40, 255), 0.9f);

            var e = settings.seaExtent;
            Add(group, "Sea", SaveMesh("Sea", Quad(new Vector3(-e, 0, -e), new Vector3(e, 0, e))), sea);

            var paddies = new GameObject("Paddies").transform;
            paddies.SetParent(group, false);
            var paddyTris = 0;
            var written = new HashSet<string>();
            foreach (var (name, mesh) in PaddyMeshes(settings))
            {
                paddyTris += mesh.triangles.Length / 3;
                Add(paddies, name, SaveMesh(name, mesh), paddy);
                written.Add($"{MeshDir}/{name}.asset");
            }
            // A changed chunk size or mask would otherwise leave orphaned chunk meshes behind.
            foreach (var guid in AssetDatabase.FindAssets("Paddy_ t:Mesh", new[] { MeshDir }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!written.Contains(path)) AssetDatabase.DeleteAsset(path);
            }

            var riverMesh = SaveMesh("River", RiverMesh(settings));
            Add(group, "River", riverMesh, river);

            AssetDatabase.SaveAssets();
            Debug.Log($"[Map] water imported: sea, {paddies.childCount} paddy chunks ({paddyTris} tris), river ({riverMesh.triangles.Length / 3} tris)");
            return group;
        }

        // ── Paddies ────────────────────────────────────────────────────────────

        /// <summary>
        /// Cells between four wet mask texels (one texel ≈ 3 m) get water at floor + depth. The bake has
        /// levelled every parcel, so neighbouring wet cells at the same level merge into one strip
        /// along x — far fewer triangles than one quad per cell. Cells touching a dry texel stay dry,
        /// so no water hangs over a lower terrace.
        /// </summary>
        static IEnumerable<(string, Mesh)> PaddyMeshes(MapImportSettings settings)
        {
            var mask = PaddyMask(settings, out var res);
            const float worldSize = 3072f, half = worldSize / 2f; // legacy WORLD.size: the mask spans the original 2048² map
            var step = worldSize / (res - 1);
            float X(int i) => -half + i * step;
            float Z(int j) => -half + j * step; // j counts south → north (Unity z)

            var chunks = new Dictionary<(int, int), (List<Vector3> v, List<int> t)>();
            for (var j = 0; j < res - 1; j++)
            {
                var i = 0;
                while (i < res - 1)
                {
                    if (!CellWet(mask, res, i, j)) { i++; continue; }
                    var level = CellFloor(i, j) + settings.paddyDepth;
                    var start = i;
                    while (i < res - 1 && CellWet(mask, res, i, j)
                           && Mathf.Abs(CellFloor(i, j) + settings.paddyDepth - level) <= settings.paddyLevelTolerance)
                        i++;
                    var key = ((int)Mathf.Floor((X(start) + half) / settings.paddyChunk), (int)Mathf.Floor((Z(j) + half) / settings.paddyChunk));
                    if (!chunks.TryGetValue(key, out var c)) chunks[key] = c = (new List<Vector3>(), new List<int>());
                    AddQuad(c.v, c.t, new Vector3(X(start), level, Z(j)), new Vector3(X(i), level, Z(j + 1)));
                }
            }

            // Edge cells (legacy RicePaddy.ts marching squares): the old rule "all four texels wet" stopped the water a
            // whole 3 m cell short of every dam and drew the parcels as axis-aligned staircases. Now a cell with some wet
            // corners gets the wet part of the cell — corners plus points on the crossing edges — so the shore runs
            // diagonally. The edge point sits paddyBankInset short of the middle (water never climbs the dam), further
            // back (paddyDropInset) where the dry side drops below the water (no water hanging over a terrace edge).
            var bankT = Mathf.Clamp(0.5f - settings.paddyBankInset / step, 0.1f, 0.5f);
            var dropT = Mathf.Clamp(0.5f - settings.paddyDropInset / step, 0.05f, 0.5f);
            var polygon = new List<Vector3>(6);
            for (var j = 0; j < res - 1; j++)
            for (var i = 0; i < res - 1; i++)
            {
                if (CellWet(mask, res, i, j)) continue; // full cells are in the strips above
                var ci = new[] { i, i + 1, i + 1, i };
                var cj = new[] { j, j, j + 1, j + 1 };
                var wet = new bool[4];
                var any = 0;
                for (var k = 0; k < 4; k++) if (wet[k] = mask[cj[k] * res + ci[k]]) any++;
                if (any == 0) continue;
                var floor = float.MaxValue;
                for (var k = 0; k < 4; k++) if (wet[k]) floor = Mathf.Min(floor, Ground(ci[k], cj[k]));
                var level = floor + settings.paddyDepth;
                polygon.Clear();
                for (var k = 0; k < 4; k++)
                {
                    var n = (k + 1) % 4;
                    var pk = new Vector3(X(ci[k]), level, Z(cj[k]));
                    var pn = new Vector3(X(ci[n]), level, Z(cj[n]));
                    if (wet[k]) polygon.Add(pk);
                    if (wet[k] == wet[n]) continue;
                    // From the wet corner towards the dry one.
                    var (w, d, dk) = wet[k] ? (pk, pn, n) : (pn, pk, k);
                    var t = Ground(ci[dk], cj[dk]) < level ? dropT : bankT;
                    polygon.Add(Vector3.Lerp(w, d, t));
                }
                if (polygon.Count < 3) continue;
                var key = ((int)Mathf.Floor((X(i) + half) / settings.paddyChunk), (int)Mathf.Floor((Z(j) + half) / settings.paddyChunk));
                if (!chunks.TryGetValue(key, out var c)) chunks[key] = c = (new List<Vector3>(), new List<int>());
                var b0 = c.v.Count;
                c.v.AddRange(polygon);
                for (var k = 1; k < polygon.Count - 1; k++) AddUpFacing(c.v, c.t, b0, b0 + k, b0 + k + 1);
            }

            foreach (var kv in chunks)
            {
                // Weld: strips and shore polygons share their corners (to the millimetre, same level) — the unwelded
                // mesh was 191 000 vertices map-wide and part of the start download (2026-10-13).
                var (v, t) = Weld(kv.Value.v, kv.Value.t);
                var mesh = new Mesh { indexFormat = v.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.SetVertices(v);
                mesh.SetTriangles(t, 0);
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                yield return ($"Paddy_{kv.Key.Item1}_{kv.Key.Item2}", mesh);
            }

            float Ground(int gi, int gj)
            {
                var t = TerrainImporter.TileAt(new Vector3(X(gi), 0, Z(gj)));
                return t.SampleHeight(new Vector3(X(gi), 0, Z(gj))) + t.transform.position.y;
            }

            // Lowest of the four corner heights; the parcel floor is flat, so this is the floor.
            float CellFloor(int ci, int cj)
            {
                var t = TerrainImporter.TileAt(new Vector3(X(ci), 0, Z(cj)));
                var y = t.transform.position.y;
                return Mathf.Min(
                    Mathf.Min(t.SampleHeight(new Vector3(X(ci), 0, Z(cj))), t.SampleHeight(new Vector3(X(ci + 1), 0, Z(cj)))),
                    Mathf.Min(t.SampleHeight(new Vector3(X(ci), 0, Z(cj + 1))), t.SampleHeight(new Vector3(X(ci + 1), 0, Z(cj + 1))))) + y;
            }
        }

        static (List<Vector3>, List<int>) Weld(List<Vector3> v, List<int> t)
        {
            var map = new Dictionary<(int, int, int), int>();
            var outV = new List<Vector3>();
            var remap = new int[v.Count];
            for (var k = 0; k < v.Count; k++)
            {
                var p = v[k];
                var key = (Mathf.RoundToInt(p.x * 1000f), Mathf.RoundToInt(p.y * 1000f), Mathf.RoundToInt(p.z * 1000f));
                if (!map.TryGetValue(key, out var idx)) { idx = outV.Count; outV.Add(p); map[key] = idx; }
                remap[k] = idx;
            }
            var outT = new List<int>(t.Count);
            for (var k = 0; k < t.Count; k += 3)
            {
                int a = remap[t[k]], b = remap[t[k + 1]], c = remap[t[k + 2]];
                if (a == b || b == c || a == c) continue; // degenerate after welding
                outT.Add(a); outT.Add(b); outT.Add(c);
            }
            return (outV, outT);
        }

        /// <summary>
        /// No discovery stands in a paddy: the shore now reaches the dams (marching squares), and two cards and their
        /// buttons ended up under water (DiscoveryTests, 2026-10-13). Texels within 4 m of a card or button go dry.
        /// </summary>
        static void DryDiscoveries(bool[] wet, int res)
        {
            var set = AssetDatabase.LoadAssetAtPath<JapanMap.Gameplay.Discovery.DiscoverySet>("Assets/_Project/Data/Gameplay/Discoveries.asset");
            if (set == null) return;
            const float worldSize = 3072f, half = worldSize / 2f, reach = 4f;
            var step = worldSize / (res - 1);
            void Dry(Vector3 p)
            {
                int i0 = Mathf.Max(0, Mathf.FloorToInt((p.x - reach + half) / step)), i1 = Mathf.Min(res - 1, Mathf.CeilToInt((p.x + reach + half) / step));
                int j0 = Mathf.Max(0, Mathf.FloorToInt((p.z - reach + half) / step)), j1 = Mathf.Min(res - 1, Mathf.CeilToInt((p.z + reach + half) / step));
                for (var j = j0; j <= j1; j++)
                for (var i = i0; i <= i1; i++)
                    if (new Vector2(-half + i * step - p.x, -half + j * step - p.z).magnitude <= reach) wet[j * res + i] = false;
            }
            foreach (var c in set.cards)
            {
                Dry(new Vector3(c.position.x, 0f, c.position.y));
                for (var b = 0; b < c.buttons.Length; b++) Dry(set.ButtonPosition(c, b));
            }
        }

        static bool CellWet(bool[] mask, int res, int i, int j) =>
            mask[j * res + i] && mask[j * res + i + 1] && mask[(j + 1) * res + i] && mask[(j + 1) * res + i + 1];

        /// <summary>paddy.png → wet flags, index j * res + i with j south → north (PNG row 0 is north).</summary>
        static bool[] PaddyMask(MapImportSettings settings, out int res)
        {
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
            try
            {
                if (!tex.LoadImage(File.ReadAllBytes(LegacySource.PathOf(settings, "terrain/paddy.png"))))
                    throw new InvalidDataException("paddy.png could not be decoded");
                res = tex.width;
                var px = tex.GetPixels32(); // Texture2D row 0 = last PNG row = south
                var wet = new bool[px.Length];
                for (var k = 0; k < px.Length; k++) wet[k] = px[k].r > 127;
                Places.PlaceImporter.Dry(wet, res, settings);
                DryDiscoveries(wet, res);
                return wet;
            }
            finally { UnityEngine.Object.DestroyImmediate(tex); }
        }

        // ── River ──────────────────────────────────────────────────────────────

        /// <summary>
        /// Band along the centreline. Water level per node as in legacy riverGeometry.ts: at most
        /// surfaceRise above the node, below the lower bank minus edgeSink, narrowed until it is at
        /// least minDepth deep; nodes deeper than maxDepth or too shallow stay dry; then the level is
        /// smoothed with a min/mean filter so it never steps up downstream.
        /// </summary>
        static Mesh RiverMesh(MapImportSettings s)
        {
            var file = LegacySource.ReadJson<LegacySource.River>(s, "terrain/river.json");
            var n = file.centerline.Length / 3;
            var p = new Vector3[n];
            for (var i = 0; i < n; i++)
                p[i] = LegacySource.ToUnity(file.centerline[i * 3], file.centerline[i * 3 + 1], file.centerline[i * 3 + 2]);

            var side = new Vector3[n];
            var raw = new float[n];
            var halfWidth = new float[n];
            for (var i = 0; i < n; i++)
            {
                var tangent = p[Math.Min(n - 1, i + 1)] - p[Math.Max(0, i - 1)];
                tangent.y = 0;
                side[i] = Vector3.Cross(Vector3.up, tangent.normalized);
                var bed = Height(p[i]);
                var full = (i < file.halfWidths.Length ? file.halfWidths[i] : 4f) * s.riverWidthFactor;
                var level = float.NaN;
                var width = full;
                for (var k = 0; k < 6; k++)
                {
                    var w = full * (1 - k * 0.14f);
                    var edge = Mathf.Min(Height(p[i] - side[i] * w), Height(p[i] + side[i] * w));
                    var candidate = Mathf.Min(p[i].y + s.riverSurfaceRise, edge - s.riverEdgeSink);
                    if (candidate - bed >= s.riverMinDepth || k == 5)
                    {
                        level = candidate;
                        width = w;
                        if (candidate - bed >= s.riverMinDepth) break;
                    }
                }
                var depth = level - bed;
                raw[i] = depth > s.riverMaxDepth || depth < s.riverMinDepth ? float.NaN : level;
                halfWidth[i] = width;
            }

            // NaN never wins Mathf.Min comparisons the way JS Math.min does, so handle it explicitly.
            var low = new float[n];
            for (var i = 0; i < n; i++)
            {
                var m = raw[i];
                for (var k = -2; k <= 2; k++)
                {
                    var v = raw[Mathf.Clamp(i + k, 0, n - 1)];
                    if (float.IsNaN(v) || v < m) m = v;
                }
                low[i] = m;
            }
            var levels = new float[n];
            for (var i = 0; i < n; i++)
            {
                if (float.IsNaN(raw[i])) { levels[i] = float.NaN; continue; }
                float sum = 0; var cnt = 0;
                for (var k = -1; k <= 1; k++)
                {
                    var v = low[Mathf.Clamp(i + k, 0, n - 1)];
                    if (!float.IsNaN(v)) { sum += v; cnt++; }
                }
                levels[i] = cnt > 0 ? Mathf.Min(raw[i], sum / cnt) : raw[i];
            }

            var verts = new List<Vector3>();
            var tris = new List<int>();
            for (var i = 0; i < n; i++)
            {
                var y = float.IsNaN(levels[i]) ? p[i].y : levels[i];
                var c = new Vector3(p[i].x, y, p[i].z);
                verts.Add(c - side[i] * halfWidth[i]);
                verts.Add(c + side[i] * halfWidth[i]);
            }
            for (var i = 0; i < n - 1; i++)
            {
                if (float.IsNaN(levels[i]) || float.IsNaN(levels[i + 1])) continue;
                AddUpFacing(verts, tris, 2 * i, 2 * i + 1, 2 * i + 3);
                AddUpFacing(verts, tris, 2 * i, 2 * i + 3, 2 * i + 2);
            }
            var mesh = new Mesh();
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static float Height(Vector3 world)
        {
            var t = TerrainImporter.TileAt(world);
            return t == null ? 0f : t.SampleHeight(world) + t.transform.position.y;
        }

        // ── Helpers ────────────────────────────────────────────────────────────

        /// <summary>
        /// Adds the triangle with its normal pointing up. The legacy river once had the opposite
        /// winding and was culled away for months while every number looked fine.
        /// </summary>
        static void AddUpFacing(List<Vector3> v, List<int> t, int a, int b, int c)
        {
            var up = Vector3.Cross(v[b] - v[a], v[c] - v[a]).y >= 0;
            t.Add(a);
            t.Add(up ? b : c);
            t.Add(up ? c : b);
        }

        static void AddQuad(List<Vector3> v, List<int> t, Vector3 min, Vector3 max)
        {
            var i = v.Count;
            v.Add(new Vector3(min.x, min.y, min.z));
            v.Add(new Vector3(min.x, min.y, max.z));
            v.Add(new Vector3(max.x, min.y, max.z));
            v.Add(new Vector3(max.x, min.y, min.z));
            AddUpFacing(v, t, i, i + 1, i + 2);
            AddUpFacing(v, t, i, i + 2, i + 3);
        }

        static Mesh Quad(Vector3 min, Vector3 max)
        {
            var v = new List<Vector3>();
            var t = new List<int>();
            AddQuad(v, t, min, max);
            var mesh = new Mesh();
            mesh.SetVertices(v);
            mesh.SetTriangles(t, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static Mesh SaveMesh(string name, Mesh mesh) => MeshAssets.Save($"{MeshDir}/{name}.asset", mesh, compact: true);

        static GameObject Add(Transform parent, string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = ShadowCastingMode.Off;
            GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)~0);
            return go;
        }

        /// <summary>Created once with these values; later edits to the material are kept.</summary>
        static Material Material(string name, Color color, float smoothness)
        {
            Directory.CreateDirectory(MaterialDir);
            var path = $"{MaterialDir}/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mat.SetColor("_BaseColor", color);
            mat.SetFloat("_Smoothness", smoothness);
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }
    }
}
