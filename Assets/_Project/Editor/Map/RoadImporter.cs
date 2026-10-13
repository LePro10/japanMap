using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Road = JapanMap.Editor.Map.LegacySource.Road;
using RoadNetwork = JapanMap.World.RoadNetwork;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// roads.json → road surface and guardrail meshes under World/Roads in Game.unity.
    /// Follows legacy RoadMeshBuilder / resolveTrims / GuardrailBuilder: the centreline is used as
    /// baked (no resampling), a road that joins another stops at the other's edge (no coplanar
    /// overlap, the carved terrain fills the gap), banking follows the curvature up to the stored
    /// maximum. Everything is built in Three coordinates and mirrored at the end.
    /// Spans are merged into square chunks (one mesh, two materials each) to keep draw calls low.
    /// Menu: JapanMap/Map/Import Roads.
    /// </summary>
    public static class RoadImporter
    {
        public const string GroupName = "Roads";
        public const string MeshDir = "Assets/_Project/Data/Roads";
        const int Asphalt = 0, Gravel = 1;

        // Legacy circuit kerbs (ASTRA_PLAN "Concrete kerbs").
        const float KerbHeight = 0.04f, KerbWidth = 0.28f;

        [MenuItem("JapanMap/Map/Import Roads")]
        public static void ImportFromMenu()
        {
            var settings = MapImportSettings.LoadOrCreate();
            Import(settings);
            MapScene.Save();
            Debug.Log(FitReport(settings));
        }

        sealed class Chunk
        {
            public readonly List<Vector3> v = new();
            public readonly List<Vector2> uv = new();
            // Road data for the wet surface shader (UV3): lateral m, texture length m, half width m, marking style.
            public readonly List<Vector4> road = new();
            public readonly List<int>[] t = { new(), new() };
        }

        public static Transform Import(MapImportSettings settings)
        {
            var roads = ResolveTrims(Load(settings), TerrainImporter.RawGround(settings));
            var types = settings.roadTypes.ToDictionary(t => t.type);
            var surface = new Dictionary<(int, int), Chunk>();
            var rails = new Dictionary<(int, int), Chunk>();
            var index = new SegmentIndex(roads, types);

            foreach (var road in roads) BuildSurface(road, types[road.type], settings, surface);
            foreach (var road in roads) BuildRails(road, types[road.type], settings, index, rails);
            var viaducts = new Dictionary<(int, int), Chunk>();
            var (decks, piers) = BuildViaducts(roads, types, settings, index, viaducts);

            Directory.CreateDirectory(MeshDir);
            var group = MapScene.FreshGroup(GroupName);
            var asphalt = Material("Road_Asphalt", "asphalt_02", new Color(0.55f, 0.55f, 0.55f));
            var gravel = Material("Road_Gravel", "brown_mud_02", new Color(0.8f, 0.75f, 0.65f));
            var rail = Material("Road_Guardrail", null, new Color(0.62f, 0.64f, 0.66f));

            var written = new HashSet<string>();
            var slab = Save("CitySlab", ToMesh(CitySlab(settings)), written);
            Add(group, "CitySlab", slab, new[] { Material("City_Slab", null, new Color(0.22f, 0.23f, 0.24f)) })
                .AddComponent<MeshCollider>().sharedMesh = slab;
            int surfaceTris = 0, railTris = 0;
            foreach (var kv in surface.OrderBy(k => k.Key))
            {
                var name = $"Road_{kv.Key.Item1}_{kv.Key.Item2}";
                var mesh = Save(name, ToMesh(kv.Value), written);
                surfaceTris += mesh.triangles.Length / 3;
                var go = Add(group, name, mesh, new[] { asphalt, gravel });
                go.AddComponent<MeshCollider>().sharedMesh = mesh;
            }
            var railGroup = new GameObject("Guardrails").transform;
            railGroup.SetParent(group, false);
            foreach (var kv in rails.OrderBy(k => k.Key))
            {
                var name = $"Rail_{kv.Key.Item1}_{kv.Key.Item2}";
                var mesh = Save(name, ToMesh(kv.Value), written);
                railTris += mesh.triangles.Length / 3;
                var go = Add(railGroup, name, mesh, new[] { rail });
                go.AddComponent<MeshCollider>().sharedMesh = mesh;
            }
            var viaductGroup = new GameObject("Viaducts").transform;
            viaductGroup.SetParent(group, false);
            var concrete = Material("Road_Concrete", null, new Color(0.48f, 0.5f, 0.5f));
            foreach (var kv in viaducts.OrderBy(k => k.Key))
            {
                var name = $"Viaduct_{kv.Key.Item1}_{kv.Key.Item2}";
                var mesh = Save(name, ToMesh(kv.Value), written);
                Add(viaductGroup, name, mesh, new[] { concrete }).AddComponent<MeshCollider>().sharedMesh = mesh;
            }
            foreach (var guid in AssetDatabase.FindAssets("t:Mesh", new[] { MeshDir }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!written.Contains(path)) AssetDatabase.DeleteAsset(path);
            }
            SaveNetwork(roads, types);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Map] roads imported: {roads.Count} roads, {surface.Count} surface chunks ({surfaceTris} tris), {rails.Count} rail chunks ({railTris} tris), viaducts: {decks} deck spans, {piers} piers");
            return group;
        }

        /// <summary>
        /// Rewrites only the road surface mesh assets in place (same paths, same GUIDs): the streamed road scenes keep
        /// pointing at them. For changes to vertex data (UV3 road data) without a full map import.
        /// </summary>
        [MenuItem("JapanMap/Map/Refresh Road Meshes")]
        public static string RefreshSurfaceMeshes()
        {
            var settings = MapImportSettings.LoadOrCreate();
            var roads = ResolveTrims(Load(settings), TerrainImporter.RawGround(settings));
            var types = settings.roadTypes.ToDictionary(t => t.type);
            var surface = new Dictionary<(int, int), Chunk>();
            foreach (var road in roads) BuildSurface(road, types[road.type], settings, surface);
            var written = new HashSet<string>();
            var missing = 0;
            foreach (var kv in surface)
            {
                var path = $"{MeshDir}/Road_{kv.Key.Item1}_{kv.Key.Item2}.asset";
                if (AssetDatabase.LoadAssetAtPath<Mesh>(path) == null) missing++;
                Save($"Road_{kv.Key.Item1}_{kv.Key.Item2}", ToMesh(kv.Value), written);
            }
            AssetDatabase.SaveAssets();
            var msg = $"[Map] road meshes refreshed: {surface.Count} chunks, {missing} new (new ones need Import All)";
            Debug.Log(msg);
            return msg;
        }

        public const string NetworkPath = MeshDir + "/RoadNetwork.asset";

        /// <summary>
        /// Roads as runtime centrelines (Unity coordinates, full length — trims are a mesh matter). Width is
        /// the road's own (widest) carriageway like the mesh (<see cref="WidthAt"/>), not its type's: city
        /// streets are 5–24 m, the type said 8 — carve, clearings and footprint checks used the wrong edge.
        /// </summary>
        public static List<RoadNetwork.Road> NetworkRoads(List<Road> roads, Dictionary<string, MapImportSettings.RoadType> types) =>
            roads.Select(r =>
            {
                var c = r.centerline;
                var points = new Vector3[c.Length / 3];
                for (var i = 0; i < points.Length; i++) points[i] = LegacySource.ToUnity(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
                var width = r.widths != null && r.widths.Length > 0 ? r.widths.Max() : types[r.type].width;
                return new RoadNetwork.Road { id = r.id, type = r.type, closed = r.closed, width = width, points = points };
            }).ToList();

        /// <summary>Centrelines for runtime queries (respawn, later AI). Same asset GUID on every import.</summary>
        static void SaveNetwork(List<Road> roads, Dictionary<string, MapImportSettings.RoadType> types)
        {
            var network = AssetDatabase.LoadAssetAtPath<RoadNetwork>(NetworkPath);
            var created = network == null;
            if (created) network = ScriptableObject.CreateInstance<RoadNetwork>();
            network.roads = NetworkRoads(roads, types);
            if (created) AssetDatabase.CreateAsset(network, NetworkPath);
            else EditorUtility.SetDirty(network);
        }

        /// <summary>roads.json plus the roads the prototype's places built themselves (Places/PlaceRoads).</summary>
        public static List<Road> Load(MapImportSettings settings) =>
            RoadProfile.Smooth(Places.PlaceRoads.Apply(LegacySource.ReadJson<LegacySource.Roads>(settings, "roads/roads.json").roads.ToList(), settings), settings);

        static float Spacing(Road r)
        {
            var count = r.centerline.Length / 3;
            return r.length / (r.closed ? count : Mathf.Max(count - 1, 1));
        }

        static float WidthAt(Road r, MapImportSettings.RoadType type, int i) =>
            r.widths != null && i < r.widths.Length ? r.widths[i] : type.width;

        // ── Trims (legacy resolveTrims.ts) ─────────────────────────────────────

        /// <summary>
        /// An open road whose end lies within 2 m of another road's centreline is cut back to that
        /// road's edge + 1 m; junction trims from the file win if larger. At least 4 m stay.
        /// </summary>
        public static List<Road> ResolveTrims(List<Road> roads, Func<float, float, float> ground = null)
        {
            foreach (var road in roads)
            {
                if (road.closed || road.centerline.Length < 12) continue;
                var c = road.centerline;
                var last = c.Length - 3;
                float trimStart = road.trimStart, trimEnd = road.trimEnd;
                foreach (var other in roads)
                {
                    if (other == road) continue;
                    var (dS, halfS) = Nearest(other, c[0], c[2]);
                    if (dS < 2) trimStart = Mathf.Max(trimStart, halfS + 1);
                    var (dE, halfE) = Nearest(other, c[last], c[last + 2]);
                    if (dE < 2) trimEnd = Mathf.Max(trimEnd, halfE + 1);
                }
                // An end lying on another road's surface duplicates it; above it, it is a ramp across that
                // road (legacy bellwood-edge ran 70 m along the ring, up to 3.4 m above it). Cut it back to
                // where it leaves the other road.
                var spacing = Spacing(road);
                foreach (var other in roads)
                {
                    if (other == road) continue;
                    trimStart = Mathf.Max(trimStart, OverlapRun(road, other, false, ground) * spacing);
                    trimEnd = Mathf.Max(trimEnd, OverlapRun(road, other, true, ground) * spacing);
                }
                foreach (var j in road.junctions ?? Array.Empty<Road.Junction>())
                {
                    if (j.trim <= 0) continue;
                    if (j.at == "start") trimStart = Mathf.Max(trimStart, j.trim);
                    else trimEnd = Mathf.Max(trimEnd, j.trim);
                }
                var maxTrim = Mathf.Max(0, road.length / 2 - 4);
                road.trimStart = Mathf.Min(trimStart, maxTrim);
                road.trimEnd = Mathf.Min(trimEnd, maxTrim);
            }
            return roads;
        }

        /// <summary>The other road this far above means a viaduct overhead, not an overlap, m (legacy deck from 2.5 m).</summary>
        const float OverheadClearance = 2.5f;
        /// <summary>Overlapping surfaces further apart in height than this are at different levels, m.</summary>
        const float OverlapHeight = 0.1f; // body clearance is 0.10–0.32 m: a 0.3 m plate edge stopped a car dead (ring at the pit entry)

        /// <summary>
        /// How many samples, counted from one end of <paramref name="road"/>, lie on <paramref name="other"/>'s
        /// surface (+1 so the cut clears it). That stretch is a duplicate surface — at another height a ramp
        /// across the other road. 0 = the end does not lie on it.
        /// </summary>
        public static int OverlapRun(Road road, Road other, bool fromEnd, Func<float, float, float> groundAt = null)
        {
            var c = road.centerline;
            var count = c.Length / 3;
            var run = 0;
            var ramp = 0;
            var otherHalf = 0f;
            for (var k = 0; k < count; k++)
            {
                var i = fromEnd ? count - 1 - k : k;
                var (d, half, y) = NearestWithHeight(other, c[i * 3], c[i * 3 + 2]);
                var ownHalf = (road.widths != null && i < road.widths.Length ? road.widths[i] : 8f) / 2;
                var dy = c[i * 3 + 1] - y;
                if (-dy > OverheadClearance) break; // the other road is a viaduct overhead
                var onIt = d < half;
                // Surfaces overlap at another level: a ramp or plate across the other road — unless this
                // road is a viaduct here (its deck clears the ground), which may cross above.
                var bridge = groundAt != null && c[i * 3 + 1] - groundAt(c[i * 3], -c[i * 3 + 2]) > OverheadClearance;
                var across = d < half + ownHalf && Mathf.Abs(dy) > OverlapHeight && !bridge;
                if (!onIt && !across) break;
                if (across) ramp++;
                otherHalf = Mathf.Max(otherHalf, half);
                run++;
            }
            // Ordinary junctions reach about one width into the other road at its height and are trimmed
            // elsewhere; cut here only a stretch at another level or an end running along the other road.
            return ramp > 2 || run * Spacing(road) > 4f * otherHalf + 4f ? run + 1 : 0;
        }

        static (float d, float half, float y) NearestWithHeight(Road host, float x, float z)
        {
            var line = host.centerline;
            var count = line.Length / 3;
            var segments = host.closed ? count : count - 1;
            var best = (d: float.PositiveInfinity, half: 4f, y: 0f);
            for (var i = 0; i < segments; i++)
            {
                var j = (i + 1) % count;
                var d = SegmentDistance(x, z, line[i * 3], line[i * 3 + 2], line[j * 3], line[j * 3 + 2]);
                if (d >= best.d) continue;
                var half = (host.widths != null && i < host.widths.Length ? host.widths[i] : 8f) / 2;
                best = (d, half, (line[i * 3 + 1] + line[j * 3 + 1]) * 0.5f);
            }
            return best;
        }

        static (float d, float half) Nearest(Road host, float x, float z)
        {
            var line = host.centerline;
            var count = line.Length / 3;
            var segments = host.closed ? count : count - 1;
            var bestD = float.PositiveInfinity;
            var bestHalf = (host.widths != null && host.widths.Length > 0 ? host.widths[0] : 8f) / 2;
            for (var i = 0; i < segments; i++)
            {
                var j = (i + 1) % count;
                var d = SegmentDistance(x, z, line[i * 3], line[i * 3 + 2], line[j * 3], line[j * 3 + 2]);
                if (d < bestD)
                {
                    bestD = d;
                    bestHalf = (host.widths != null && i < host.widths.Length ? host.widths[i] : 8f) / 2;
                }
            }
            return (bestD, bestHalf);
        }

        static float SegmentDistance(float x, float z, float ax, float az, float bx, float bz)
        {
            float dx = bx - ax, dz = bz - az, q = dx * dx + dz * dz;
            var t = q > 0 ? Mathf.Clamp01(((x - ax) * dx + (z - az) * dz) / q) : 0;
            return Mathf.Sqrt(Sq(x - ax - dx * t) + Sq(z - az - dz * t));
        }

        static float Sq(float v) => v * v;

        // ── Surface (legacy RoadMeshBuilder.ts) ────────────────────────────────

        static void BuildSurface(Road road, MapImportSettings.RoadType type, MapImportSettings s, Dictionary<(int, int), Chunk> chunks)
        {
            var full = road.centerline;
            var fullCount = full.Length / 3;
            var closed = road.closed;
            var spacing = Spacing(road);
            var skipStart = closed ? 0 : Mathf.RoundToInt(road.trimStart / spacing);
            var skipEnd = closed ? 0 : Mathf.RoundToInt(road.trimEnd / spacing);
            var count = fullCount - skipStart - skipEnd;
            if (count < 2) throw new InvalidDataException($"road {road.id}: only {count} stations left after trimming");

            Vector3 P(int i) => new(full[(i + skipStart) * 3], full[(i + skipStart) * 3 + 1], full[(i + skipStart) * 3 + 2]);
            var kerbs = road.tags != null && road.tags.Contains("circuit");
            var stations = closed ? count + 1 : count;
            var rows = new Vector3[stations][];
            var uvs = new Vector2[stations][];
            var data = new Vector4[stations][];
            var style = type.gravel ? 0 : type.markings;
            // Verge (2026-10-13): beyond the shoulder a gravel strip falls onto the carved ground, so the road no
            // longer ends in a hard edge with the 1.5 m terrain grid zig-zagging into it. Outer edge on the terrain.
            var verge = type.gravel ? 0f : s.roadVerge;
            var arcs = new float[stations];
            var vergeL = new Vector3[stations][];
            var vergeR = new Vector3[stations][];

            for (var st = 0; st < stations; st++)
            {
                var i = closed && st == count ? 0 : st;
                var prev = closed ? (i - 1 + count) % count : Mathf.Max(i - 1, 0);
                var next = closed ? (i + 1) % count : Mathf.Min(i + 1, count - 1);
                var center = P(i);
                var tangent = (P(next) - P(prev)).normalized;
                // Right-handed Three space: right = tangent × up, roadUp = right × tangent.
                var right = RightHanded(tangent, Vector3.up).normalized;
                var roadUp = RightHanded(right, tangent).normalized;

                var curvature = SignedCurvature(P, i, count, closed);
                var maxBank = (road.banking != null && i + skipStart < road.banking.Length ? road.banking[i + skipStart] : 0) * Mathf.Deg2Rad;
                var bank = Mathf.Clamp(curvature * s.roadBankGain * maxBank, -maxBank, maxBank);
                float cos = Mathf.Cos(bank), sin = Mathf.Sin(bank);

                var arc = closed && st == count ? road.length : (i + skipStart) * spacing;
                arcs[st] = arc;
                var width = WidthAt(road, type, i + skipStart);
                var (lateral, vertical) = CrossSection(width, type.shoulder, kerbs, s.roadShoulderDrop);
                var total = width + 2 * type.shoulder;
                rows[st] = new Vector3[lateral.Length];
                uvs[st] = new Vector2[lateral.Length];
                data[st] = new Vector4[lateral.Length];
                for (var k = 0; k < lateral.Length; k++)
                {
                    var up = lateral[k] * sin + vertical[k] + s.roadSurfaceOffset;
                    rows[st][k] = center + right * (lateral[k] * cos) + roadUp * up;
                    var across = (lateral[k] + total / 2) / total;
                    // Paths sample a calm band at the texture edge (legacy: the asphalt crack at u≈0.5 read as a seam).
                    uvs[st][k] = new Vector2(type.gravel ? 0.08f + across * 0.3f : across, arc / type.textureLength);
                    // y = texture length: the shader gets the distance along the road as UV0.y × y (UV0 is 32-bit, this
                    // channel 16-bit — kilometres of arc in a half float would lose the dashes).
                    data[st][k] = new Vector4(lateral[k], type.textureLength, width / 2, style);
                }
                if (verge > 0f)
                {
                    var last = lateral.Length - 1;
                    vergeL[st] = new[] { rows[st][0], OnGround(center + right * ((lateral[0] - verge) * cos)) };
                    vergeR[st] = new[] { rows[st][last], OnGround(center + right * ((lateral[last] + verge) * cos)) };
                }
            }

            var sub = type.gravel ? Gravel : Asphalt;
            for (var st = 0; st < stations - 1; st++)
            {
                var mid = (rows[st][0] + rows[st + 1][rows[st + 1].Length - 1]) / 2;
                var chunk = ChunkAt(chunks, mid, s.roadChunk);
                var lanes = rows[st].Length;
                var b0 = chunk.v.Count;
                chunk.v.AddRange(rows[st]);
                chunk.v.AddRange(rows[st + 1]);
                chunk.uv.AddRange(uvs[st]);
                chunk.uv.AddRange(uvs[st + 1]);
                chunk.road.AddRange(data[st]);
                chunk.road.AddRange(data[st + 1]);
                for (var k = 0; k < lanes - 1; k++)
                {
                    int a = b0 + k, b = a + 1, c = a + lanes, d = c + 1;
                    // a→b→c: (b−a)×(c−a) = right × tangent = up in Three space.
                    chunk.t[sub].AddRange(new[] { a, b, c, b, d, c });
                }
                if (verge > 0f)
                {
                    // Left strip runs outer → inner, right strip inner → outer: same winding as the road (up-facing).
                    AddStrip(chunk, new[] { vergeL[st][1], vergeL[st][0] }, new[] { vergeL[st + 1][1], vergeL[st + 1][0] }, arcs[st], arcs[st + 1], type.textureLength);
                    AddStrip(chunk, vergeR[st], vergeR[st + 1], arcs[st], arcs[st + 1], type.textureLength);
                }
            }
        }

        /// <summary>A Three-space point dropped onto the carved terrain (Unity's terrain is mirrored in z), a hair above it.</summary>
        static Vector3 OnGround(Vector3 three)
        {
            var u = LegacySource.ToUnity(three.x, three.y, three.z);
            var t = TerrainImporter.TileAt(u);
            if (t == null) return three;
            return new Vector3(three.x, t.SampleHeight(u) + t.transform.position.y + 0.04f, three.z);
        }

        /// <summary>A two-point-wide strip between two stations into the gravel submesh.</summary>
        static void AddStrip(Chunk chunk, Vector3[] from, Vector3[] to, float arcFrom, float arcTo, float textureLength)
        {
            var b = chunk.v.Count;
            chunk.v.AddRange(new[] { from[0], from[1], to[0], to[1] });
            chunk.uv.AddRange(new[] { new Vector2(0f, arcFrom / textureLength), new Vector2(0.25f, arcFrom / textureLength), new Vector2(0f, arcTo / textureLength), new Vector2(0.25f, arcTo / textureLength) });
            chunk.road.AddRange(new[] { Vector4.zero, Vector4.zero, Vector4.zero, Vector4.zero });
            chunk.t[Gravel].AddRange(new[] { b, b + 1, b + 2, b + 1, b + 3, b + 2 });
        }

        static Vector3 RightHanded(Vector3 a, Vector3 b) =>
            new(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

        static (float[] lateral, float[] vertical) CrossSection(float width, float shoulder, bool kerbs, float drop)
        {
            var half = width / 2;
            if (!kerbs)
                return (new[] { -half - shoulder, -half, half, half + shoulder }, new[] { -drop, 0, 0, -drop });
            return (new[] { -half - shoulder, -half - KerbWidth, -half, half, half + KerbWidth, half + shoulder },
                new[] { -drop, KerbHeight, 0, 0, KerbHeight, -drop });
        }

        /// <summary>Signed XZ curvature in 1/m, positive = left turn (Three space).</summary>
        static float SignedCurvature(Func<int, Vector3> p, int i, int count, bool closed)
        {
            var prev = closed ? (i - 1 + count) % count : Mathf.Max(i - 1, 0);
            var next = closed ? (i + 1) % count : Mathf.Min(i + 1, count - 1);
            if (prev == next) return 0;
            Vector3 a = p(i) - p(prev), b = p(next) - p(i);
            float la = Mathf.Sqrt(a.x * a.x + a.z * a.z), lb = Mathf.Sqrt(b.x * b.x + b.z * b.z);
            if (la < 1e-5f || lb < 1e-5f) return 0;
            var cross = (a.x * b.z - a.z * b.x) / (la * lb);
            var dot = (a.x * b.x + a.z * b.z) / (la * lb);
            return Mathf.Atan2(cross, dot) / ((la + lb) / 2);
        }

        // ── Guardrails (legacy GuardrailBuilder.ts) ────────────────────────────

        static void BuildRails(Road road, MapImportSettings.RoadType type, MapImportSettings s, SegmentIndex index, Dictionary<(int, int), Chunk> chunks)
        {
            if (road.rails == null) return;
            var line = road.centerline;
            var count = line.Length / 3;
            var spacing = Spacing(road);
            foreach (var rail in road.rails)
            {
                var run = new List<(Vector3 p, Vector3 n, float dist)>();
                var first = Mathf.Max(0, Mathf.FloorToInt(rail.from / spacing));
                var last = Mathf.Min(count - 1, Mathf.CeilToInt(rail.to / spacing));
                for (var i = first; i <= last; i++)
                {
                    int a = Mathf.Max(i - 1, 0), b = Mathf.Min(i + 1, count - 1);
                    float tx = line[b * 3] - line[a * 3], tz = line[b * 3 + 2] - line[a * 3 + 2];
                    var len = Mathf.Sqrt(tx * tx + tz * tz);
                    if (len < 1e-6f) continue;
                    var n = new Vector3(-tz / len * rail.side, 0, tx / len * rail.side);
                    var edge = WidthAt(road, type, i) / 2 + type.shoulder + s.railOffset;
                    var p = new Vector3(line[i * 3] + n.x * edge, line[i * 3 + 1], line[i * 3 + 2] + n.z * edge);
                    // Where another road's carriageway lies, the rail would run across its mouth.
                    if (index.OnOtherRoad(p.x, p.z, road))
                    {
                        EmitRail(run, s, chunks);
                        run.Clear();
                        continue;
                    }
                    run.Add((p, n, i * spacing));
                }
                EmitRail(run, s, chunks);
            }
        }

        static void EmitRail(List<(Vector3 p, Vector3 n, float dist)> run, MapImportSettings s, Dictionary<(int, int), Chunk> chunks)
        {
            if (run.Count < 2) return;
            var chunk = ChunkAt(chunks, run[run.Count / 2].p, s.roadChunk);
            var b0 = chunk.v.Count;
            foreach (var (p, _, dist) in run)
            {
                chunk.v.Add(p + Vector3.up * s.railBottom);
                chunk.v.Add(p + Vector3.up * s.railTop);
                var u = (dist - run[0].dist) / 4f;
                chunk.uv.Add(new Vector2(u, 0));
                chunk.uv.Add(new Vector2(u, 1));
            }
            for (var i = 0; i < run.Count - 1; i++)
            {
                int a = b0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
                // Both sides: the band is seen from the road and from the valley.
                chunk.t[0].AddRange(new[] { a, b, c, b, d, c, a, c, b, b, c, d });
            }

            var length = run[run.Count - 1].dist - run[0].dist;
            var posts = Mathf.Max(2, Mathf.RoundToInt(length / s.railPostSpacing));
            for (var k = 0; k <= posts; k++)
            {
                var target = run[0].dist + length * k / posts;
                var best = run.OrderBy(r => Mathf.Abs(r.dist - target)).First();
                var forward = new Vector3(-best.n.z, 0, best.n.x);
                Box(chunk, best.p + Vector3.up * ((s.railTop + 0.1f) / 2 - 0.1f), forward, best.n,
                    new Vector3(0.12f, s.railTop + 0.1f, 0.16f));
            }
        }

        /// <summary>Oriented box, outward-facing in Three space; size = (side, up, forward).</summary>
        static void Box(Chunk chunk, Vector3 center, Vector3 forward, Vector3 side, Vector3 size, bool bottom = false, Vector3? upAxis = null)
        {
            var up = upAxis ?? Vector3.up;
            var corners = new Vector3[8];
            for (var c = 0; c < 8; c++)
                corners[c] = center + side * (((c & 1) == 0 ? -0.5f : 0.5f) * size.x)
                                    + up * (((c & 2) == 0 ? -0.5f : 0.5f) * size.y)
                                    + forward * (((c & 4) == 0 ? -0.5f : 0.5f) * size.z);
            var faceList = new List<int[]> { new[] { 2, 6, 7, 3 }, new[] { 0, 4, 6, 2 }, new[] { 1, 3, 7, 5 }, new[] { 0, 2, 3, 1 }, new[] { 4, 5, 7, 6 } };
            if (bottom) faceList.Add(new[] { 0, 1, 5, 4 });
            var faces = faceList;
            foreach (var f in faces)
            {
                var b0 = chunk.v.Count;
                foreach (var idx in f)
                {
                    chunk.v.Add(corners[idx]);
                    chunk.uv.Add(Vector2.zero);
                }
                // Outward-facing in a right-handed space regardless of how forward/side are oriented.
                var n = RightHanded(chunk.v[b0 + 1] - chunk.v[b0], chunk.v[b0 + 2] - chunk.v[b0]);
                var outward = Vector3.Dot(n, chunk.v[b0] - center) > 0;
                chunk.t[0].AddRange(outward ? new[] { b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3 } : new[] { b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2 });
            }
        }

        /// <summary>Grid of centreline segments for "is this point on another road" (rail breaks).</summary>
        sealed class SegmentIndex
        {
            const float Cell = 32f;
            readonly Dictionary<(int, int), List<(Road road, int i, float half, float shoulder)>> _cells = new();

            public SegmentIndex(List<Road> roads, Dictionary<string, MapImportSettings.RoadType> types)
            {
                foreach (var r in roads)
                {
                    var line = r.centerline;
                    var count = line.Length / 3;
                    var segments = r.closed ? count : count - 1;
                    var type = types[r.type];
                    for (var i = 0; i < segments; i++)
                    {
                        var j = (i + 1) % count;
                        var half = WidthAt(r, type, i) / 2;
                        var reach = half + Mathf.Max(type.shoulder, 2f);
                        var minX = Mathf.Min(line[i * 3], line[j * 3]) - reach;
                        var maxX = Mathf.Max(line[i * 3], line[j * 3]) + reach;
                        var minZ = Mathf.Min(line[i * 3 + 2], line[j * 3 + 2]) - reach;
                        var maxZ = Mathf.Max(line[i * 3 + 2], line[j * 3 + 2]) + reach;
                        for (var cx = Mathf.FloorToInt(minX / Cell); cx <= Mathf.FloorToInt(maxX / Cell); cx++)
                        for (var cz = Mathf.FloorToInt(minZ / Cell); cz <= Mathf.FloorToInt(maxZ / Cell); cz++)
                        {
                            if (!_cells.TryGetValue((cx, cz), out var list)) _cells[(cx, cz)] = list = new();
                            list.Add((r, i, half, type.shoulder));
                        }
                    }
                }
            }

            /// <summary>Nearest point on another road's centreline within this cell, with that road's half width.</summary>
            public bool ClosestOther(float x, float z, Road self, out Vector2 point, out float half)
            {
                point = default;
                half = 0;
                if (!_cells.TryGetValue((Mathf.FloorToInt(x / Cell), Mathf.FloorToInt(z / Cell)), out var list)) return false;
                var best = float.PositiveInfinity;
                foreach (var (road, i, h, _) in list)
                {
                    if (road == self) continue;
                    var line = road.centerline;
                    var j = (i + 1) % (line.Length / 3);
                    float ax = line[i * 3], az = line[i * 3 + 2], dx = line[j * 3] - ax, dz = line[j * 3 + 2] - az;
                    var q = dx * dx + dz * dz;
                    var t = q > 0 ? Mathf.Clamp01(((x - ax) * dx + (z - az) * dz) / q) : 0;
                    var p = new Vector2(ax + dx * t, az + dz * t);
                    var d = Vector2.Distance(p, new Vector2(x, z));
                    if (d >= best) continue;
                    best = d;
                    point = p;
                    half = h;
                }
                return best < 24f;
            }

            /// <summary>
            /// Within another road's half width plus <paramref name="margin"/> (null = its shoulder:
            /// rails break where the other road's surface begins).
            /// </summary>
            public bool OnOtherRoad(float x, float z, Road self, float? margin = null)
            {
                if (!_cells.TryGetValue((Mathf.FloorToInt(x / Cell), Mathf.FloorToInt(z / Cell)), out var list)) return false;
                foreach (var (road, i, half, shoulder) in list)
                {
                    if (road == self) continue;
                    var line = road.centerline;
                    var j = (i + 1) % (line.Length / 3);
                    if (SegmentDistance(x, z, line[i * 3], line[i * 3 + 2], line[j * 3], line[j * 3 + 2]) < half + (margin ?? shoulder)) return true;
                }
                return false;
            }
        }

        // ── Viaducts (legacy ViaductSystem.ts, simplified) ─────────────────────

        /// <summary>
        /// Concrete deck under every span that is deckFrom above the terrain, piers every pierSpacing
        /// where the deck is pierFrom high and the foot does not stand on another road (shifted by
        /// up to 6 m to find a free spot). The legacy portal frame over crossing roads is not built yet.
        /// </summary>
        static (int decks, int piers) BuildViaducts(List<Road> roads, Dictionary<string, MapImportSettings.RoadType> types,
            MapImportSettings s, SegmentIndex index, Dictionary<(int, int), Chunk> chunks)
        {
            int decks = 0, piers = 0, noRoadBelow = 0, legsBlocked = 0;
            // The source ground, not the one lowered under roads: a deck is where the road leaves the
            // natural ground (carving under a crossing road must not turn its neighbour into a bridge).
            var raw = TerrainImporter.RawGround(s);
            float Ground(float x, float z)
            {
                var u = LegacySource.ToUnity(x, 0, z);
                return raw(u.x, u.z);
            }
            foreach (var road in roads)
            {
                // Place roads sit on their own embankment (TerrainCarve fills under them, D21) — never a deck.
                if (road.tags != null && road.tags.Contains("place")) continue;
                var c = road.centerline;
                var count = c.Length / 3;
                var last = road.closed ? count : count - 1;
                var sincePier = s.pierSpacing / 2;
                for (var i = 0; i < last; i++)
                {
                    var j = (i + 1) % count;
                    var a = new Vector3(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
                    var b = new Vector3(c[j * 3], c[j * 3 + 1], c[j * 3 + 2]);
                    var d = b - a;
                    var run = new Vector2(d.x, d.z).magnitude;
                    if (run < 1e-3f) continue;
                    sincePier += run;
                    var m = (a + b) / 2;
                    var clearance = m.y - Ground(m.x, m.z);
                    if (clearance < s.deckFrom) continue;

                    var width = WidthAt(road, types[road.type], i) + 0.8f;
                    var forward = d.normalized;
                    var side = new Vector3(-d.z, 0, d.x).normalized;
                    var up = RightHanded(forward, side).y < 0 ? -RightHanded(forward, side) : RightHanded(forward, side);
                    var chunk = ChunkAt(chunks, m, s.roadChunk);
                    // 0.35 m overlap, otherwise gaps open at every kink (legacy).
                    Box(chunk, m - Vector3.up * (0.08f + s.deckDepth / 2), forward, side, new Vector3(width, s.deckDepth, d.magnitude + 0.35f), true, up);
                    decks++;

                    if (clearance < s.pierFrom || sincePier < s.pierSpacing) continue;
                    var top = m.y - 0.08f - s.deckDepth;
                    var flat = new Vector3(forward.x, 0, forward.z).normalized;
                    var placed = false;
                    foreach (var shift in new[] { 0f, 4f, -4f, 6f, -6f })
                    {
                        var p = m + flat * shift;
                        var g = Ground(p.x, p.z);
                        if (top - g < 2) break;
                        if (index.OnOtherRoad(p.x, p.z, road, 2f)) continue; // legacy: width / 2 + 2
                        Pier(chunk, p.x, p.z, g - 0.4f, top, flat, side);
                        Box(chunk, new Vector3(p.x, top - 0.55f, p.z), flat, side, new Vector3(width - 0.6f, 1.1f, 2.2f), true);
                        placed = true;
                        break;
                    }
                    // Portal frame: the viaduct runs right above another road — one leg on each side of it.
                    var hasBelow = index.ClosestOther(m.x, m.z, road, out var below, out var half);
                    if (!placed && !hasBelow) noRoadBelow++;
                    if (!placed && hasBelow && top - Ground(m.x, m.z) >= 4)
                    {
                        var reach = half + 1.3f;
                        var legs = new[] { -1f, 1f }.Select(k => below + new Vector2(side.x, side.z) * (reach * k)).ToArray();
                        if (legs.All(l => !index.OnOtherRoad(l.x, l.y, road, 0.9f))) // legacy: width / 2 + 0.9
                        {
                            foreach (var l in legs) Pier(chunk, l.x, l.y, Ground(l.x, l.y) - 0.4f, top, flat, side);
                            var mid = (legs[0] + legs[1]) / 2;
                            Box(chunk, new Vector3(mid.x, top - 0.6f, mid.y), flat, side, new Vector3(reach * 2 + 2, 1.2f, 2.2f), true);
                            placed = true;
                        }
                        else legsBlocked++;
                    }
                    if (placed)
                    {
                        piers++;
                        sincePier = 0;
                    }
                }
            }
            if (noRoadBelow + legsBlocked > 0) Debug.Log($"[Map] viaduct piers skipped: {noRoadBelow} with no free foot and no road below, {legsBlocked} portal legs on a road");
            return (decks, piers);
        }

        static void Pier(Chunk chunk, float x, float z, float bottom, float top, Vector3 forward, Vector3 side)
        {
            var h = top - bottom;
            Box(chunk, new Vector3(x, bottom + h / 2, z), forward, side, new Vector3(2.4f, h, 2.0f));
        }

        // ── City slab ──────────────────────────────────────────────────────────

        /// <summary>
        /// The district's asphalt plane (legacy CitySystem): flat at citySlabY over each part, with a
        /// vertical curtain down into the terrain so the 1 m step to the carved ground is closed.
        /// The proper city ground with its skirt comes with the city in Phase 5.
        /// </summary>
        static Chunk CitySlab(MapImportSettings s)
        {
            var chunk = new Chunk();
            var y = s.citySlabY;
            foreach (var r in s.cityParts)
            {
                // Tessellated: PhysX warns (and gets unstable) on triangles longer than 500 m.
                const float cell = 50f;
                int nx = Mathf.CeilToInt(r.width / cell), nz = Mathf.CeilToInt(r.height / cell);
                var b0 = chunk.v.Count;
                for (var iz = 0; iz <= nz; iz++)
                for (var ix = 0; ix <= nx; ix++)
                {
                    chunk.v.Add(new Vector3(Mathf.Lerp(r.xMin, r.xMax, (float)ix / nx), y, Mathf.Lerp(r.yMin, r.yMax, (float)iz / nz)));
                    chunk.uv.Add(new Vector2((float)ix / nx, (float)iz / nz));
                }
                for (var iz = 0; iz < nz; iz++)
                for (var ix = 0; ix < nx; ix++)
                {
                    int a = b0 + iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
                    // Counter-clockwise from above in Three space → faces up there (and after mirroring).
                    chunk.t[0].AddRange(new[] { a, d, b, a, c, d });
                }

                var corners = new[] { new Vector2(r.xMin, r.yMin), new Vector2(r.xMax, r.yMin), new Vector2(r.xMax, r.yMax), new Vector2(r.xMin, r.yMax) };
                for (var e = 0; e < 4; e++)
                {
                    Vector2 ea = corners[e], eb = corners[(e + 1) % 4];
                    var pieces = Mathf.CeilToInt(Vector2.Distance(ea, eb) / cell);
                    for (var k = 0; k < pieces; k++)
                    {
                        Vector2 a = Vector2.Lerp(ea, eb, (float)k / pieces), b = Vector2.Lerp(ea, eb, (float)(k + 1) / pieces);
                        var c0 = chunk.v.Count;
                        chunk.v.AddRange(new[] { new Vector3(a.x, y, a.y), new Vector3(b.x, y, b.y), new Vector3(b.x, y - 3, b.y), new Vector3(a.x, y - 3, a.y) });
                        chunk.uv.AddRange(new[] { Vector2.zero, Vector2.right, Vector2.one, Vector2.up });
                        chunk.t[0].AddRange(new[] { c0, c0 + 1, c0 + 2, c0, c0 + 2, c0 + 3, c0, c0 + 2, c0 + 1, c0, c0 + 3, c0 + 2 });
                    }
                }
            }
            return chunk;
        }

        // ── Fit check ──────────────────────────────────────────────────────────

        public struct Fit
        {
            public string type;
            public int samples, elevated;
            public float median, p95Abs;
        }

        /// <summary>
        /// Road centreline height minus terrain height, per road type, on the meshed (trimmed) part.
        /// Points more than 1.5 m above ground count as elevated (bridges, the ring viaduct) and are
        /// reported separately; the rest must sit on the carved terrain.
        /// </summary>
        public static List<Fit> MeasureFit(MapImportSettings settings)
        {
            var result = new List<Fit>();
            var roads = ResolveTrims(Load(settings), TerrainImporter.RawGround(settings));
            foreach (var group in roads.GroupBy(r => r.type))
            {
                var deltas = new List<float>();
                var elevated = 0;
                foreach (var road in group)
                {
                    var c = road.centerline;
                    var n = c.Length / 3;
                    var spacing = Spacing(road);
                    var from = road.closed ? 0 : Mathf.RoundToInt(road.trimStart / spacing);
                    var to = road.closed ? n : n - Mathf.RoundToInt(road.trimEnd / spacing);
                    for (var i = from; i < to; i++)
                    {
                        var p = LegacySource.ToUnity(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
                        var tile = TerrainImporter.TileAt(p);
                        if (tile == null) continue;
                        var ground = tile.SampleHeight(p) + tile.transform.position.y;
                        if (InCity(settings, c[i * 3], c[i * 3 + 2])) ground = Mathf.Max(ground, settings.citySlabY);
                        var d = p.y - ground;
                        if (d > 1.5f) elevated++;
                        else deltas.Add(d);
                    }
                }
                deltas.Sort();
                var abs = deltas.Select(Mathf.Abs).OrderBy(v => v).ToList();
                result.Add(new Fit
                {
                    type = group.Key,
                    samples = deltas.Count,
                    elevated = elevated,
                    median = deltas.Count > 0 ? deltas[deltas.Count / 2] : float.NaN,
                    p95Abs = abs.Count > 0 ? abs[(int)(abs.Count * 0.95f)] : float.NaN,
                });
            }
            return result;
        }

        static bool InCity(MapImportSettings s, float threeX, float threeZ) =>
            s.cityParts.Any(r => r.Contains(new Vector2(threeX, threeZ)));

        public static string FitReport(MapImportSettings settings)
        {
            var sb = new StringBuilder("[Map] road fit (centreline − terrain, m):\n");
            foreach (var f in MeasureFit(settings))
                sb.AppendLine($"  {f.type,-9} samples {f.samples,6}  median {f.median,6:F3}  |p95| {f.p95Abs,6:F3}  elevated >1.5 m: {f.elevated}");
            return sb.ToString();
        }

        // ── Helpers ────────────────────────────────────────────────────────────

        static Chunk ChunkAt(Dictionary<(int, int), Chunk> chunks, Vector3 threePos, float size)
        {
            var u = LegacySource.ToUnity(threePos.x, threePos.y, threePos.z);
            var key = (Mathf.FloorToInt(u.x / size), Mathf.FloorToInt(u.z / size));
            if (!chunks.TryGetValue(key, out var c)) chunks[key] = c = new Chunk();
            return c;
        }

        static Mesh ToMesh(Chunk c)
        {
            var v = new List<Vector3>(c.v);
            LegacySource.MirrorVertices(v);
            var mesh = new Mesh { indexFormat = IndexFormat.UInt32 };
            mesh.SetVertices(v);
            mesh.SetUVs(0, c.uv);
            if (c.road.Count == c.v.Count) mesh.SetUVs(3, c.road);
            mesh.subMeshCount = c.t.Length;
            for (var s = 0; s < c.t.Length; s++)
            {
                var t = new List<int>(c.t[s]);
                LegacySource.FlipWinding(t);
                mesh.SetTriangles(t, s);
            }
            mesh.RecalculateNormals();
            // No tangents: the wet surface shader builds its own frame (8 bytes per vertex out of the start download).
            mesh.RecalculateBounds();
            return mesh;
        }

        static Mesh Save(string name, Mesh mesh, HashSet<string> written)
        {
            var path = $"{MeshDir}/{name}.asset";
            written.Add(path);
            return MeshAssets.Save(path, mesh, compact: true);
        }

        static GameObject Add(Transform parent, string name, Mesh mesh, Material[] materials)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = materials;
            GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)~0);
            return go;
        }

        /// <summary>Created once; later edits to the material are kept.</summary>
        static Material Material(string name, string texture, Color tint)
        {
            Directory.CreateDirectory(WaterImporter.MaterialDir);
            var path = $"{WaterImporter.MaterialDir}/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;
            mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mat.SetColor("_BaseColor", tint);
            mat.SetFloat("_Smoothness", 0.2f);
            if (texture != null)
            {
                var folder = $"{TerrainImporter.TextureDir}/{texture}/{texture}";
                mat.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "_diff.jpg"));
                var normal = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "_nor_gl.jpg");
                if (normal != null)
                {
                    mat.SetTexture("_BumpMap", normal);
                    mat.EnableKeyword("_NORMALMAP");
                }
            }
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }
    }
}
