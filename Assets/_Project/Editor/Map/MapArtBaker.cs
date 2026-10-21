using System.Collections.Generic;
using System.IO;
using JapanMap.World;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Bakes the world map's art offline (UI redo 2026-10-21, "Night cartography"): relief with contour lines, water with
    /// shore rings, building footprints from the place scenes and the instanced city, roads by class. The runtime bake
    /// (MapView.BakeBase) only has the terrain at 6 m/px and paints regions as tinted boxes; buildings exist only in the
    /// editor (place scenes, instance data), so a nice map has to be baked here. Open Game.unity with its places loaded.
    ///   node Tools/unity-exec.mjs with: return JapanMap.Editor.Map.MapArtBaker.Bake(2048, "Captures/map-art/map.png", true);
    /// </summary>
    public static class MapArtBaker
    {
        static readonly Rect Bounds = new(-1536f, -1537.5f, 3072f, 3072f); // MapSystem.bounds
        /// <summary>The art the game streams (MapSystem.ArtAddress): no roads — the game draws them as vectors on top.</summary>
        public const string ArtPath = "Assets/_Project/Art/Map/MapArt.png";
        public const int ArtSize = 2048;

        /// <summary>Bakes the game's map art, sets its import and streams it (group "Map", address map/art).</summary>
        [MenuItem("JapanMap/Map/Bake Map Art")]
        public static string BakeArt()
        {
            var report = Bake(ArtSize, ArtPath, false);
            AssetDatabase.ImportAsset(ArtPath, ImportAssetOptions.ForceUpdate);
            var importer = (TextureImporter)AssetImporter.GetAtPath(ArtPath);
            importer.textureType = TextureImporterType.Default;
            importer.sRGBTexture = true;
            importer.mipmapEnabled = true; // the minimap shows it small
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.maxTextureSize = ArtSize;
            importer.alphaSource = TextureImporterAlphaSource.None;
            importer.SaveAndReimport();
            report += " · " + Content.StreamingSetup.MapArt(Content.StreamingSetup.Settings());
            AssetDatabase.SaveAssets();
            Debug.Log(report);
            return report;
        }

        // Palette (see the UI proposal): night violet land, ink water with periwinkle shore, paper roads.
        static readonly Color LandLow = Hex("1d1931"), LandHigh = Hex("37304f");
        static readonly Color Contour = Hex("4a4268"), ContourMajor = Hex("625887");
        static readonly Color WaterDeep = Hex("07060f"), WaterShallow = Hex("15132c"), Shore = Hex("8c97ff");
        static readonly Color BuildingLow = Hex("3a3356"), BuildingHigh = Hex("5d5385"), BuildingShadow = Hex("0e0c18");
        static readonly Color Casing = Hex("0b0914"), RoadMain = Hex("f4efe6"), RoadCity = Hex("cfc7dd"), RoadLocal = Hex("9d94b5"), RoadDirt = Hex("ff9a3c");

        public static string Bake(int size, string outPath, bool withRoads)
        {
            var t0 = Time.realtimeSinceStartup;
            var mpp = Bounds.width / size;
            var terrain = Terrain.activeTerrain;
            if (terrain == null) return "no terrain (open Game.unity)";
            var sea = GameObject.Find("World/Water/Sea");
            var seaLevel = sea != null && sea.TryGetComponent<Renderer>(out var sr) ? sr.bounds.max.y : 0.5f;

            var h = Heights(terrain, size, mpp);
            var px = new Color[size * size];
            var land = new bool[size * size];
            for (var i = 0; i < px.Length; i++) land[i] = h[i] >= seaLevel;
            var shoreDist = Distance(land, size, false); // water pixels: distance to land
            Relief(px, h, Blur(h, size, 3), land, shoreDist, size, mpp, seaLevel);
            var nTrees = Trees(px, size, mpp);
            Paddies(px, size, mpp);
            var nBuild = Buildings(px, size, mpp, out var nInst);
            if (withRoads) Roads(px, size, mpp);

            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            // Texture row 0 is the bottom: our row 0 is the north edge.
            var flipped = new Color[px.Length];
            for (var y = 0; y < size; y++) System.Array.Copy(px, y * size, flipped, (size - 1 - y) * size, size);
            tex.SetPixels(flipped);
            tex.Apply();
            var full = Path.GetFullPath(outPath);
            Directory.CreateDirectory(Path.GetDirectoryName(full));
            File.WriteAllBytes(full, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            return $"MAP-ART {size}² · {mpp:0.00} m/px · sea {seaLevel:0.0} m · {nBuild} building footprints ({nInst} instanced) · {nTrees} trees · {Time.realtimeSinceStartup - t0:0.0} s → {outPath}";
        }

        /// <summary>World x/z → pixel (row 0 = north).</summary>
        static Vector2 Px(float x, float z, float mpp) => new((x - Bounds.xMin) / mpp, (Bounds.yMax - z) / mpp);

        static float[] Heights(Terrain t, int size, float mpp)
        {
            var d = t.terrainData;
            var o = t.transform.position;
            var h = new float[size * size];
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var wx = Bounds.xMin + (x + 0.5f) * mpp;
                var wz = Bounds.yMax - (y + 0.5f) * mpp;
                var u = Mathf.Clamp01((wx - o.x) / d.size.x);
                var v = Mathf.Clamp01((wz - o.z) / d.size.z);
                h[y * size + x] = d.GetInterpolatedHeight(u, v) + o.y;
            }
            return h;
        }

        /// <summary>Two-pass chamfer distance in pixels from every pixel to the nearest pixel whose mask equals <paramref name="target"/>… inverted: to the nearest pixel where mask is true when target is false.</summary>
        static float[] Distance(bool[] mask, int size, bool insideIsTrue)
        {
            const float big = 1e6f, d1 = 1f, d2 = 1.4142f;
            var d = new float[size * size];
            for (var i = 0; i < d.Length; i++) d[i] = mask[i] != insideIsTrue ? 0f : big;
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var i = y * size + x;
                var v = d[i];
                if (x > 0) v = Mathf.Min(v, d[i - 1] + d1);
                if (y > 0)
                {
                    v = Mathf.Min(v, d[i - size] + d1);
                    if (x > 0) v = Mathf.Min(v, d[i - size - 1] + d2);
                    if (x < size - 1) v = Mathf.Min(v, d[i - size + 1] + d2);
                }
                d[i] = v;
            }
            for (var y = size - 1; y >= 0; y--)
            for (var x = size - 1; x >= 0; x--)
            {
                var i = y * size + x;
                var v = d[i];
                if (x < size - 1) v = Mathf.Min(v, d[i + 1] + d1);
                if (y < size - 1)
                {
                    v = Mathf.Min(v, d[i + size] + d1);
                    if (x < size - 1) v = Mathf.Min(v, d[i + size + 1] + d2);
                    if (x > 0) v = Mathf.Min(v, d[i + size - 1] + d2);
                }
                d[i] = v;
            }
            return d;
        }

        /// <summary>Box blur (separable, radius r): contours from a smoothed field instead of the terrain's noise.</summary>
        static float[] Blur(float[] src, int size, int r)
        {
            var tmp = new float[src.Length];
            var dst = new float[src.Length];
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                float s = 0f; var n = 0;
                for (var k = -r; k <= r; k++) { var xx = x + k; if (xx < 0 || xx >= size) continue; s += src[y * size + xx]; n++; }
                tmp[y * size + x] = s / n;
            }
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                float s = 0f; var n = 0;
                for (var k = -r; k <= r; k++) { var yy = y + k; if (yy < 0 || yy >= size) continue; s += tmp[yy * size + x]; n++; }
                dst[y * size + x] = s / n;
            }
            return dst;
        }

        static void Relief(Color[] px, float[] h, float[] smooth, bool[] land, float[] shoreDist, int size, float mpp, float sea)
        {
            const float interval = 20f; // contour every 20 m, every fifth stronger
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var i = y * size + x;
                if (!land[i])
                {
                    // Water: darker with distance, three thin rings parallel to the coast (old Japanese sea charts).
                    var dm = shoreDist[i] * mpp;
                    var c = Color.Lerp(WaterShallow, WaterDeep, Mathf.Clamp01(dm / 220f));
                    foreach (var (ring, a) in new[] { (8f, 0.55f), (20f, 0.35f), (38f, 0.22f), (64f, 0.12f) })
                    {
                        var r = ring / mpp;
                        c = Color.Lerp(c, Shore, a * Mathf.Clamp01(1f - Mathf.Abs(shoreDist[i] - r) / 0.9f));
                    }
                    c = Color.Lerp(c, Shore, 0.75f * Mathf.Clamp01(1.6f - shoreDist[i])); // the coastline itself
                    px[i] = c;
                    continue;
                }
                var hx = h[y * size + Mathf.Min(size - 1, x + 1)] - h[y * size + Mathf.Max(0, x - 1)];
                var hz = h[Mathf.Max(0, y - 1) * size + x] - h[Mathf.Min(size - 1, y + 1) * size + x]; // +z = north = row up
                var g = new Vector2(hx, hz) / (2f * mpp); // slope m/m
                var n = new Vector3(-g.x, 1f, -g.y).normalized;
                var light = Vector3.Dot(n, new Vector3(-0.55f, 0.75f, 0.45f).normalized); // from the north-west
                var col = Color.Lerp(LandLow, LandHigh, Mathf.Clamp01((h[i] - sea) / 260f));
                col *= Mathf.Lerp(0.72f, 1.22f, Mathf.Clamp01((light - 0.35f) / 0.65f));
                // Anti-aliased contour: distance to the nearest isoline in pixels = height offset / slope per pixel.
                var sx = smooth[y * size + Mathf.Min(size - 1, x + 1)] - smooth[y * size + Mathf.Max(0, x - 1)];
                var sz = smooth[Mathf.Max(0, y - 1) * size + x] - smooth[Mathf.Min(size - 1, y + 1) * size + x];
                var sg = new Vector2(sx, sz) / (2f * mpp);
                var level = (smooth[i] - sea) / interval;
                var nearest = Mathf.Round(level);
                var slopePx = Mathf.Max(0.0001f, sg.magnitude * mpp / interval);
                var dist = Mathf.Abs(level - nearest) / slopePx;
                var major = Mathf.RoundToInt(nearest) % 5 == 0;
                if (nearest > 0 && slopePx < 0.6f) // no contour soup on cliffs
                    col = Color.Lerp(col, major ? ContourMajor : Contour, (major ? 0.95f : 0.7f) * Mathf.Clamp01((major ? 1.3f : 0.9f) - dist));
                col.a = 1f;
                px[i] = col;
            }
        }

        // ── trees: soft dots by kind (sakura pink, conifers dark, the rest a muted green-violet) ──

        static readonly Color TreeDark = Hex("17142a"), TreeMid = Hex("263a3f"), TreeSakura = Hex("e58fb4");

        static int Trees(Color[] px, int size, float mpp)
        {
            var n = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:JapanMap.World.VegetationData"))
            {
                var data = AssetDatabase.LoadAssetAtPath<VegetationData>(AssetDatabase.GUIDToAssetPath(guid));
                foreach (var chunk in data.chunks)
                foreach (var run in chunk.runs)
                {
                    var proto = data.prototypes[run.prototype];
                    var name = proto.name.ToLowerInvariant();
                    if (!name.Contains("tree") && !name.Contains("sakura") && !name.Contains("sugi") && !name.Contains("pine") && !name.Contains("bamboo")) continue;
                    var sakura = name.Contains("sakura") || name.Contains("cherry");
                    var conifer = name.Contains("sugi") || name.Contains("pine") || name.Contains("cedar");
                    var c = sakura ? TreeSakura : conifer ? TreeDark : TreeMid;
                    var alpha = sakura ? 0.8f : 0.55f;
                    for (var k = 0; k < run.count; k++)
                    {
                        var m = data.Matrix(run.start + k);
                        var w = m.GetColumn(3);
                        var r = Mathf.Clamp(3.6f * m.lossyScale.x / mpp, 1.2f, 5f);
                        Dot(px, size, Px(w.x, w.z, mpp), r, c, alpha);
                        n++;
                    }
                }
            }
            return n;
        }

        static void Dot(Color[] px, int size, Vector2 p, float r, Color c, float alpha)
        {
            var x0 = Mathf.Max(0, Mathf.FloorToInt(p.x - r - 1)); var x1 = Mathf.Min(size - 1, Mathf.CeilToInt(p.x + r + 1));
            var y0 = Mathf.Max(0, Mathf.FloorToInt(p.y - r - 1)); var y1 = Mathf.Min(size - 1, Mathf.CeilToInt(p.y + r + 1));
            for (var y = y0; y <= y1; y++)
            for (var x = x0; x <= x1; x++)
            {
                var d = (new Vector2(x + 0.5f, y + 0.5f) - p).magnitude;
                var cov = Mathf.Clamp01(r + 0.5f - d) * alpha;
                if (cov <= 0f) continue;
                var i = y * size + x;
                px[i] = Color.Lerp(px[i], c, cov);
            }
        }

        static readonly Color Paddy = Hex("2b2f63"), PaddyEdge = Hex("6f78d8");

        /// <summary>Rice paddies: flooded fields reflect the sky, a small periwinkle patchwork (Water_Paddies scene).</summary>
        static void Paddies(Color[] px, int size, float mpp)
        {
            foreach (var r in Object.FindObjectsByType<MeshRenderer>(FindObjectsInactive.Exclude))
            {
                if (!r.gameObject.scene.path.Contains("Paddies")) continue;
                var mf = r.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;
                var mesh = mf.sharedMesh;
                var v = mesh.vertices;
                var t = mesh.triangles;
                var m = r.transform.localToWorldMatrix;
                for (var i = 0; i < t.Length; i += 3)
                {
                    var a = m.MultiplyPoint3x4(v[t[i]]); var b = m.MultiplyPoint3x4(v[t[i + 1]]); var c = m.MultiplyPoint3x4(v[t[i + 2]]);
                    var q = new[] { Px(a.x, a.z, mpp), Px(b.x, b.z, mpp), Px(c.x, c.z, mpp), Px(c.x, c.z, mpp) };
                    FillQuad(px, size, q, Paddy, 0.5f, hard: true);
                }
            }
        }

        // ── buildings: oriented footprints of place-scene meshes and city instances, a little shadow to the south-east ──

        static int Buildings(Color[] px, int size, float mpp, out int instanced)
        {
            var quads = new List<(Vector2[] q, float height)>();
            foreach (var r in Object.FindObjectsByType<MeshRenderer>(FindObjectsInactive.Exclude))
            {
                var path = r.gameObject.scene.path;
                if (!path.Contains("/Places/") && !path.Contains("Props_templeHall") && !path.Contains("Props_fishHut") && !path.Contains("Props_lighthouse")) continue;
                var mf = r.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;
                var b = r.bounds;
                if (b.size.y < 2.5f || b.size.x > 140f || b.size.z > 140f || Mathf.Max(b.size.x, b.size.z) < 2f) continue;
                var name = r.name.ToLowerInvariant();
                if (name.Contains("ground") || name.Contains("road") || name.Contains("terrain") || name.Contains("tree") || name.Contains("water") || name.Contains("lod1") || name.Contains("lod2")) continue;
                quads.Add((Footprint(mf.sharedMesh.bounds, r.transform.localToWorldMatrix, mpp), b.size.y));
            }
            instanced = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:JapanMap.World.PlaceInstanceData"))
            {
                var data = AssetDatabase.LoadAssetAtPath<PlaceInstanceData>(AssetDatabase.GUIDToAssetPath(guid));
                foreach (var chunk in data.chunks)
                foreach (var run in chunk.runs)
                {
                    var proto = data.prototypes[run.prototype];
                    var mesh = proto.lods != null && proto.lods.Length > 0 ? proto.lods[^1] : null;
                    if (mesh == null) continue;
                    for (var k = 0; k < run.count; k++)
                    {
                        var m = data.Matrix(run.start + k);
                        var height = mesh.bounds.size.y * m.lossyScale.y;
                        if (height < 2.5f) continue;
                        quads.Add((Footprint(mesh.bounds, m, mpp), height));
                        instanced++;
                    }
                }
            }
            // Shadows first (offset to the south-east by height), then roofs, taller ones brighter.
            foreach (var (q, height) in quads)
            {
                var off = new Vector2(1f, 1f) * Mathf.Clamp(height * 0.12f / mpp, 0.6f, 6f);
                var s = new Vector2[4];
                for (var i = 0; i < 4; i++) s[i] = q[i] + off;
                FillQuad(px, size, s, BuildingShadow, 0.55f);
            }
            foreach (var (q, height) in quads) FillQuad(px, size, q, Color.Lerp(BuildingLow, BuildingHigh, Mathf.Clamp01(height / 90f)), 1f);
            return quads.Count;
        }

        static Vector2[] Footprint(Bounds local, Matrix4x4 m, float mpp)
        {
            var c = local.center;
            var e = local.extents;
            var q = new Vector2[4];
            var corners = new[] { new Vector3(-e.x, 0f, -e.z), new Vector3(e.x, 0f, -e.z), new Vector3(e.x, 0f, e.z), new Vector3(-e.x, 0f, e.z) };
            for (var i = 0; i < 4; i++)
            {
                var w = m.MultiplyPoint3x4(c + corners[i]);
                q[i] = Px(w.x, w.z, mpp);
            }
            return q;
        }

        /// <summary>Convex quad, anti-aliased by the signed distance to its nearest edge.</summary>
        static void FillQuad(Color[] px, int size, Vector2[] q, Color color, float alpha, bool hard = false)
        {
            float minX = q[0].x, maxX = q[0].x, minY = q[0].y, maxY = q[0].y;
            foreach (var p in q) { minX = Mathf.Min(minX, p.x); maxX = Mathf.Max(maxX, p.x); minY = Mathf.Min(minY, p.y); maxY = Mathf.Max(maxY, p.y); }
            var x0 = Mathf.Max(0, Mathf.FloorToInt(minX) - 1); var x1 = Mathf.Min(size - 1, Mathf.CeilToInt(maxX) + 1);
            var y0 = Mathf.Max(0, Mathf.FloorToInt(minY) - 1); var y1 = Mathf.Min(size - 1, Mathf.CeilToInt(maxY) + 1);
            // Winding: make edges' inward normal consistent.
            var area = 0f;
            for (var i = 0; i < 4; i++) { var a = q[i]; var b = q[(i + 1) % 4]; area += a.x * b.y - b.x * a.y; }
            var sign = area >= 0f ? 1f : -1f;
            for (var y = y0; y <= y1; y++)
            for (var x = x0; x <= x1; x++)
            {
                var p = new Vector2(x + 0.5f, y + 0.5f);
                var d = float.MaxValue;
                for (var i = 0; i < 4; i++)
                {
                    var a = q[i]; var b = q[(i + 1) % 4];
                    var edge = b - a;
                    var len = edge.magnitude;
                    if (len < 1e-4f) continue;
                    var cross = (edge.x * (p.y - a.y) - edge.y * (p.x - a.x)) / len * sign;
                    d = Mathf.Min(d, cross);
                }
                var cov = (hard ? (d >= 0f ? 1f : 0f) : Mathf.Clamp01(d + 0.5f)) * alpha;
                if (cov <= 0f) continue;
                var idx = y * size + x;
                px[idx] = Color.Lerp(px[idx], color, cov);
            }
        }

        // ── roads: one casing pass for all, then fills by class (coverage kept as max per pass: no bright joints) ──

        static void Roads(Color[] px, int size, float mpp)
        {
            var net = AssetDatabase.LoadAssetAtPath<RoadNetwork>("Assets/_Project/Data/Roads/RoadNetwork.asset");
            if (net == null) return;
            float Width(RoadNetwork.Road r) => r.type == "highway" ? 12f : r.width >= 9f ? 9f : Dirt(r) ? 4f : 6f;
            Color Fill(RoadNetwork.Road r) => r.type == "highway" ? RoadMain : Dirt(r) ? RoadDirt : r.width >= 9f ? RoadCity : RoadLocal;
            var cover = new float[size * size];
            foreach (var r in net.roads) Stroke(cover, size, r, mpp, (Width(r) + 5f) / mpp);
            Composite(px, cover, Casing, 0.9f);
            var order = new[] { "local", "dirt", "city", "main" };
            foreach (var pass in order)
            {
                System.Array.Clear(cover, 0, cover.Length);
                var any = false;
                foreach (var r in net.roads)
                {
                    var cls = r.type == "highway" ? "main" : Dirt(r) ? "dirt" : r.width >= 9f ? "city" : "local";
                    if (cls != pass) continue;
                    Stroke(cover, size, r, mpp, Width(r) / mpp);
                    any = true;
                }
                if (!any) continue;
                var c = pass == "main" ? RoadMain : pass == "dirt" ? RoadDirt : pass == "city" ? RoadCity : RoadLocal;
                Composite(px, cover, c, 1f);
            }
        }

        static bool Dirt(RoadNetwork.Road r) => r.type == "dirt" || r.type == "path" || r.type == "pfad" || r.type == "gravel" || r.type == "mountain";

        static void Stroke(float[] cover, int size, RoadNetwork.Road r, float mpp, float widthPx)
        {
            if (r.points == null || r.points.Length < 2) return;
            var half = Mathf.Max(0.6f, widthPx * 0.5f);
            var n = r.closed ? r.points.Length : r.points.Length - 1;
            for (var i = 0; i < n; i++)
            {
                var a3 = r.points[i];
                var b3 = r.points[(i + 1) % r.points.Length];
                var a = Px(a3.x, a3.z, mpp);
                var b = Px(b3.x, b3.z, mpp);
                var x0 = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(a.x, b.x) - half - 1)); var x1 = Mathf.Min(size - 1, Mathf.CeilToInt(Mathf.Max(a.x, b.x) + half + 1));
                var y0 = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(a.y, b.y) - half - 1)); var y1 = Mathf.Min(size - 1, Mathf.CeilToInt(Mathf.Max(a.y, b.y) + half + 1));
                var ab = b - a;
                var len2 = Mathf.Max(1e-6f, ab.sqrMagnitude);
                for (var y = y0; y <= y1; y++)
                for (var x = x0; x <= x1; x++)
                {
                    var p = new Vector2(x + 0.5f, y + 0.5f);
                    var t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / len2);
                    var d = (a + ab * t - p).magnitude;
                    var c = Mathf.Clamp01(half + 0.5f - d);
                    var idx = y * size + x;
                    if (c > cover[idx]) cover[idx] = c;
                }
            }
        }

        static void Composite(Color[] px, float[] cover, Color c, float alpha)
        {
            for (var i = 0; i < px.Length; i++)
                if (cover[i] > 0f) px[i] = Color.Lerp(px[i], c, cover[i] * alpha);
        }

        static Color Hex(string s) => ColorUtility.TryParseHtmlString("#" + s, out var c) ? c : Color.magenta;

        /// <summary>World x/z of each region's label and each event start, as pixel positions in a baked map (proposal mockups).</summary>
        public static string Labels(int size)
        {
            var mpp = Bounds.width / size;
            var sb = new System.Text.StringBuilder();
            var regions = AssetDatabase.LoadAssetAtPath<Gameplay.Regions.RegionSet>("Assets/_Project/Data/Gameplay/Regions.asset");
            if (regions != null)
                foreach (var r in regions.regions) { var p = Px(r.labelAt.x, r.labelAt.y, mpp); sb.AppendLine($"region|{r.title}|{p.x:0}|{p.y:0}"); }
            var net = AssetDatabase.LoadAssetAtPath<RoadNetwork>("Assets/_Project/Data/Roads/RoadNetwork.asset");
            var events = AssetDatabase.LoadAssetAtPath<Gameplay.Races.RaceEventSet>("Assets/_Project/Data/Gameplay/RaceEvents.asset");
            if (events != null && net != null)
                foreach (var e in events.events)
                {
                    var road = net.roads.Find(r => r.id == e.road);
                    if (road.points == null || road.points.Length == 0) continue;
                    var at = e.reverse ? road.points[^1] : road.points[0];
                    var p = Px(at.x, at.z, mpp);
                    sb.AppendLine($"event|{e.title}|{e.kind}|{p.x:0}|{p.y:0}");
                }
            var travel = AssetDatabase.LoadAssetAtPath<Gameplay.Menu.TravelPoints>("Assets/_Project/Data/Gameplay/TravelPoints.asset");
            if (travel != null)
                foreach (var t in travel.points) { var p = Px(t.at.x, t.at.y, mpp); sb.AppendLine($"place|{t.title}|{p.x:0}|{p.y:0}"); }
            return sb.ToString();
        }
    }
}
