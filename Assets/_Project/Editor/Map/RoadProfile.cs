using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Road = JapanMap.Editor.Map.LegacySource.Road;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Evens out dips and crests that are tighter than the road type allows (<see cref="MapImportSettings.RoadType.minVerticalRadius"/>):
    /// the prototype's centrelines change grade abruptly in places — on the ring at (541, −710) a 46 m dip where the body
    /// of every car hit the road at 110 km/h. Only heights move (the plan stays), and only where the bend is too tight;
    /// where a lesser road meets a greater one at the same level it follows the greater one's change (fading over 20 m),
    /// so junctions keep fitting. Applied once where roads are loaded (RoadImporter.Load), so road meshes, terrain
    /// carving and the runtime network agree.
    /// </summary>
    public static class RoadProfile
    {
        /// <summary>Largest height change made by the last <see cref="Smooth"/> (report, tests).</summary>
        public static float LastMaxChange { get; private set; }

        /// <summary>
        /// Road indices, greatest first: faster type (vertical radius), then wider (an avenue over a lane), then longer.
        /// Where two surfaces overlap the greater one's is the road (step 3 here, the mouths in RoadImporter's meshes).
        /// </summary>
        public static List<int> GreatestFirst(List<Road> roads, MapImportSettings s)
        {
            var types = s.roadTypes.ToDictionary(t => t.type);
            float Type(Road r) => types.TryGetValue(r.type ?? "", out var t) ? t.minVerticalRadius : 0f;
            float Radius(Road r) => r.tags != null && r.tags.Contains("circuit") ? Mathf.Max(CircuitRadius, Type(r)) : Type(r);
            float Widest(Road r) => r.widths != null && r.widths.Length > 0 ? r.widths.Max() : 8f;
            return Enumerable.Range(0, roads.Count).Where(i => roads[i].centerline != null)
                .OrderByDescending(i => Radius(roads[i])).ThenByDescending(i => Widest(roads[i])).ThenByDescending(i => roads[i].length).ToList();
        }

        public static List<Road> Smooth(List<Road> roads, MapImportSettings s)
        {
            LastMaxChange = 0f;
            var types = s.roadTypes.ToDictionary(t => t.type);
            float Radius(Road r) => r.tags != null && r.tags.Contains("circuit") ? Mathf.Max(CircuitRadius, Type(r)) : Type(r);
            float Type(Road r) => types.TryGetValue(r.type ?? "", out var t) ? t.minVerticalRadius : 0f;
            var before = roads.Select(r => r.centerline == null ? null : Heights(r)).ToList();
            // 1. Each road on its own: relax every station that bends tighter than its type allows.
            foreach (var road in roads)
            {
                var radius = Radius(road);
                if (road.centerline == null || radius <= 0f || road.centerline.Length < 9) continue;
                Relax(road, 1f / radius);
            }
            // 2. Junctions: where a lesser road meets a greater one at the same level, it takes over the greater one's
            //    change and lets it fade along itself over FollowMetres — no step where they meet.
            var order = Enumerable.Range(0, roads.Count).Where(i => roads[i].centerline != null)
                .OrderByDescending(i => Radius(roads[i])).ThenByDescending(i => roads[i].length).ToList();
            var cells = new Dictionary<(int, int), List<(int road, int station)>>();
            foreach (var r in order)
            {
                var c = roads[r].centerline;
                for (var i = 0; i < c.Length / 3; i++)
                {
                    var k = Key(c[i * 3], c[i * 3 + 2]);
                    if (!cells.TryGetValue(k, out var l)) cells[k] = l = new List<(int, int)>();
                    l.Add((r, i));
                }
            }
            var rank = new Dictionary<int, int>();
            for (var i = 0; i < order.Count; i++) rank[order[i]] = i;
            foreach (var b in order)
            {
                // Footpaths (no profile limit) stay exactly as the data: a steep path start that followed the ring by
                // 4 cm let the ground show through it (sando, Phase 10).
                if (Radius(roads[b]) <= 0f) continue;
                var c = roads[b].centerline;
                var n = c.Length / 3;
                var anchors = new List<(int station, float delta)>();
                for (var i = 0; i < n; i++)
                {
                    float x = c[i * 3], z = c[i * 3 + 2];
                    var best = float.MaxValue;
                    var delta = 0f;
                    for (var dx = -1; dx <= 1; dx++)
                    for (var dz = -1; dz <= 1; dz++)
                    {
                        if (!cells.TryGetValue((Mathf.FloorToInt(x / Cell) + dx, Mathf.FloorToInt(z / Cell) + dz), out var l)) continue;
                        foreach (var (a, j) in l)
                        {
                            if (rank[a] >= rank[b]) continue; // only roads that rank above follow-lead
                            var ca = roads[a].centerline;
                            var d = new Vector2(ca[j * 3] - x, ca[j * 3 + 2] - z).magnitude;
                            if (d > MeetMetres || d >= best || Mathf.Abs(before[a][j] - before[b][i]) > 1f) continue;
                            best = d;
                            delta = ca[j * 3 + 1] - before[a][j];
                        }
                    }
                    if (best < float.MaxValue) anchors.Add((i, delta));
                }
                if (anchors.Count == 0) continue;
                var ds = roads[b].length / (roads[b].closed ? n : Mathf.Max(n - 1, 1));
                for (var i = 0; i < n; i++)
                {
                    // The nearest anchor along the road decides; its weight fades to nothing over FollowMetres.
                    var w = 0f;
                    var target = 0f;
                    foreach (var (st, dlt) in anchors)
                    {
                        var along = Mathf.Abs(st - i) * ds;
                        var wi = 1f - along / FollowMetres;
                        if (wi > w) { w = wi; target = dlt; }
                    }
                    if (w <= 0f) continue;
                    var own = c[i * 3 + 1] - before[b][i];
                    c[i * 3 + 1] = before[b][i] + Mathf.Lerp(own, target, w);
                }
            }
            // 3. Where a road lies on a greater one's surface at about its level — a mouth, a crossing, a stretch alongside —
            //    it takes that surface's height there and eases back into its own profile after. The prototype let side
            //    roads fall away from the other road's centreline: west-works-03-2 (13.7 %) left hill-steps-west's flat edge
            //    0.6 m lower, and the trim (RoadImporter.OverlapRun) took that for a ramp across it and cut 4 m more — a
            //    1.3 m kerb (D49, D54); rain-garden-drive-2's flat deck stood 0.8 m above the east-lantern corner beside it.
            //    Greater = faster type, then wider (an avenue over a lane), then longer.
            var byWidth = GreatestFirst(roads, s);
            var widthRank = new Dictionary<int, int>();
            for (var i = 0; i < byWidth.Count; i++) widthRank[byWidth[i]] = i;
            OnGreaterSurfaces(roads, byWidth, widthRank, cells, types, Radius);
            for (var r = 0; r < roads.Count; r++)
            {
                if (before[r] == null) continue;
                var c = roads[r].centerline;
                for (var i = 0; i < before[r].Length; i++) LastMaxChange = Mathf.Max(LastMaxChange, Mathf.Abs(c[i * 3 + 1] - before[r][i]));
            }
            return roads;
        }

        static void OnGreaterSurfaces(List<Road> roads, List<int> order, Dictionary<int, int> rank,
            Dictionary<(int, int), List<(int road, int station)>> cells, Dictionary<string, MapImportSettings.RoadType> types,
            System.Func<Road, float> radius)
        {
            float Shoulder(Road r) => types.TryGetValue(r.type ?? "", out var t) ? t.shoulder : 0f;
            var reach = Mathf.CeilToInt((roads.Where(r => r.widths != null && r.widths.Length > 0).Select(r => r.widths.Max()).DefaultIfEmpty(8f).Max() / 2 + 2f) / Cell);
            // Corners where only ends meet (no road passes through, one keeps its end): fixed points. A road whose surface
            // covers one takes its height there — rain-garden-drive-2 passed 7 m from the east-lantern-05/-08/-10 corner,
            // 0.95 m higher, and no flat street could join both (0.59 m kerb).
            var corners = new List<(Road keeper, float x, float y, float z)>();
            foreach (var r in roads)
            {
                if (r.closed || r.centerline == null || r.type == "pfad") continue;
                var rc = r.centerline;
                foreach (var fromEnd in new[] { false, true })
                {
                    HostOfEnd(roads, r, fromEnd, out var keeper);
                    var e = fromEnd ? rc.Length / 3 - 1 : 0;
                    if (keeper) corners.Add((r, rc[e * 3], rc[e * 3 + 1], rc[e * 3 + 2]));
                }
            }
            foreach (var b in order)
            {
                var road = roads[b];
                // Footpaths too (unlike step 2): feldpfad's end lay 0.5 m below the ring's edge, kuestenpfad crossed
                // lantern-south-2 0.3 m above it. They never carry another road.
                if (road.centerline.Length < 12) continue;
                var c = road.centerline;
                var n = c.Length / 3;
                var ds = road.length / (road.closed ? n : Mathf.Max(n - 1, 1));
                var target = new float?[n];
                // An end always yields to the road it runs onto, whatever their rank: a wide side road ending on a narrow
                // street kept falling away across it (rain-garden-drive at east-lantern-05, 0.29 m).
                var mouthS = road.closed ? null : HostOfEnd(roads, road, false, out _);
                var mouthE = road.closed ? null : HostOfEnd(roads, road, true, out _);
                for (var i = 0; i < n; i++)
                {
                    float x = c[i * 3], y = c[i * 3 + 1], z = c[i * 3 + 2];
                    var (tx, tz) = Tangent(c, n, i);
                    var own = (road.widths != null && i < road.widths.Length ? road.widths[i] : 8f) / 2;
                    var near = new HashSet<Road>();
                    var mouth = i < n / 2 ? mouthS : mouthE;
                    if (mouth != null && mouth.type != "pfad") near.Add(mouth);
                    for (var dx = -reach; dx <= reach; dx++)
                    for (var dz = -reach; dz <= reach; dz++)
                        if (cells.TryGetValue((Mathf.FloorToInt(x / Cell) + dx, Mathf.FloorToInt(z / Cell) + dz), out var l))
                            foreach (var (a, _) in l)
                                if (rank[a] < rank[b] && roads[a].type != "pfad") near.Add(roads[a]);
                    var best = int.MaxValue;
                    var bestD = float.MaxValue;
                    foreach (var host in near)
                    {
                        var (d, half, hy, _, beyond) = Surface(host, x, z);
                        if (Mathf.Abs(hy - y) > SameLevel) continue; // a bridge over it or a road under it
                        // On it while this road's centre or either edge is: at an oblique mouth one edge leaves much
                        // later than the centreline (0.4 m kerb at west-works-05 when only the centre counted). Beyond
                        // the other road's end is not on it: a road going on from there keeps its own grade.
                        var edge = half + Shoulder(host);
                        var on = !beyond && d <= edge;
                        foreach (var side in new[] { -own, own })
                        {
                            var (de, he, _, _, past) = Surface(host, x + tz * side, z - tx * side);
                            on |= !past && de <= he + Shoulder(host);
                        }
                        // The greatest road under it decides (a lane can lie on two): its surface is the one on top.
                        var r = rank.TryGetValue(roads.IndexOf(host), out var hr) ? hr : int.MaxValue;
                        if (!on || r > best || (r == best && d >= bestD)) continue;
                        best = r;
                        bestD = d;
                        target[i] = hy;
                    }
                    foreach (var corner in corners)
                    {
                        if (corner.keeper == road || Mathf.Abs(corner.y - y) > SameLevel) continue;
                        // At its station nearest to the corner, when the corner lies on its surface.
                        var (dc, half, _, station, past) = Surface(road, corner.x, corner.z);
                        if (past || dc > half + Shoulder(road) || Mathf.RoundToInt(station) % n != i) continue;
                        target[i] = corner.y;
                        best = -1;
                    }
                }
                // Each stretch on a greater surface takes its height; beyond it the offset fades out (smoothstep over at
                // least FollowMetres, adding at most MouthGrade to the grade). The nearest stretch decides, like step 2.
                var shift = new float[n];
                var weight = new float[n];
                for (var i = 0; i < n; i++)
                {
                    if (target[i] == null) continue;
                    var offset = target[i].Value - c[i * 3 + 1];
                    shift[i] = offset;
                    weight[i] = 2f; // inside a stretch: always
                    var ease = Mathf.Max(FollowMetres, 1.5f * Mathf.Abs(offset) / MouthGrade);
                    for (var dir = -1; dir <= 1; dir += 2)
                    for (var k = 1; k * ds < ease && k < n; k++)
                    {
                        var j = i + dir * k;
                        if (road.closed) j = (j % n + n) % n;
                        else if (j < 0 || j >= n) break;
                        if (target[j] != null) break;
                        var w = 1f - Mathf.SmoothStep(0f, 1f, k * ds / ease);
                        if (w <= weight[j]) continue;
                        weight[j] = w;
                        shift[j] = offset * w;
                    }
                }
                for (var i = 0; i < n; i++) c[i * 3 + 1] += shift[i];
                // Where the stretch meets the road's own grade the profile kinks (toge leaving the ring): evened out
                // again with the stretches held, before lesser roads take their heights from this one.
                if (radius(road) > 0f && target.Any(t => t != null)) Relax(road, 1f / radius(road), target.Select(t => t != null).ToArray());
            }
        }

        /// <summary>
        /// Roads closer in height than this where one lies on the other meet at one level, m. More is another level beside
        /// it — the pit lane beside the circuit, bellwood-edge along the ring, a fork climbing away: pulled together at
        /// 2.5 m they moved up to 2.4 m and the sando sank 2.2 m.
        /// </summary>
        const float SameLevel = 1.5f;

        /// <summary>Unit direction of a centreline at station <paramref name="i"/> (xz).</summary>
        public static (float x, float z) Tangent(float[] c, int n, int i)
        {
            int a = Mathf.Max(i - 1, 0), b = Mathf.Min(i + 1, n - 1);
            float x = c[b * 3] - c[a * 3], z = c[b * 3 + 2] - c[a * 3 + 2];
            var len = Mathf.Max(Mathf.Sqrt(x * x + z * z), 1e-6f);
            return (x / len, z / len);
        }

        /// <summary>
        /// The road an end of <paramref name="road"/> runs onto (its end within 2 m of that road's centreline, same level):
        /// a road passing through there first. Where every road there ends (a city grid corner), the widest — then
        /// longest — keeps its end and is the host of the others; <paramref name="keeper"/> says this road is that one.
        /// Null and not keeper: a free end. Trims (RoadImporter.ResolveTrims) and mouth heights share this.
        /// </summary>
        public static Road HostOfEnd(List<Road> roads, Road road, bool fromEnd, out bool keeper)
        {
            keeper = false;
            var c = road.centerline;
            var e = fromEnd ? c.Length / 3 - 1 : 0;
            float x = c[e * 3], y = c[e * 3 + 1], z = c[e * 3 + 2];
            Road through = null, widest = null;
            float throughD = float.MaxValue, widestW = 0f;
            float Width(Road r, int i) => r.widths != null && r.widths.Length > 0 ? r.widths[Mathf.Clamp(i, 0, r.widths.Length - 1)] : 8f;
            foreach (var other in roads)
            {
                // A footpath carries no road: a city street ending where a path crosses took the path as its main road.
                if (other == road || other.centerline == null || (other.type == "pfad" && road.type != "pfad")) continue;
                var (d, half, oy, station, _) = Surface(other, x, z);
                if (d > 2f || Mathf.Abs(oy - y) > SameLevel) continue;
                var on = other.centerline.Length / 3;
                var ods = other.length / (other.closed ? on : Mathf.Max(on - 1, 1));
                var fromItsEnd = other.closed ? float.MaxValue : Mathf.Min(station, on - 1 - station) * ods;
                if (fromItsEnd > half + 1f)
                {
                    if (d < throughD) { through = other; throughD = d; }
                    continue;
                }
                var w = Width(other, Mathf.RoundToInt(station));
                if (widest == null || w > widestW || (w == widestW && Outranks(other, widest))) { widest = other; widestW = w; }
            }
            if (through != null || widest == null) return through;
            var own = Width(road, e);
            if (own > widestW || (own == widestW && Outranks(road, widest))) { keeper = true; return null; }
            return widest;
        }

        static bool Outranks(Road a, Road b) => a.length != b.length ? a.length > b.length : string.CompareOrdinal(a.id, b.id) < 0;

        /// <summary>
        /// Nearest point of <paramref name="host"/>'s centreline: xz distance, half width and height there, station
        /// (fractional index) and whether the point lies beyond one of its open ends.
        /// </summary>
        public static (float d, float half, float y, float station, bool beyond) Surface(Road host, float x, float z)
        {
            var line = host.centerline;
            var count = line.Length / 3;
            var segments = host.closed ? count : count - 1;
            var best = (d: float.PositiveInfinity, half: 4f, y: 0f, station: 0f, beyond: false);
            for (var i = 0; i < segments; i++)
            {
                var j = (i + 1) % count;
                float ax = line[i * 3], az = line[i * 3 + 2], dx = line[j * 3] - ax, dz = line[j * 3 + 2] - az;
                var q = dx * dx + dz * dz;
                var raw = q > 0 ? ((x - ax) * dx + (z - az) * dz) / q : 0f;
                var t = Mathf.Clamp01(raw);
                var d = new Vector2(x - ax - dx * t, z - az - dz * t).magnitude;
                if (d >= best.d) continue;
                var half = (host.widths != null && i < host.widths.Length ? host.widths[i] : 8f) / 2;
                var beyond = !host.closed && ((i == 0 && raw < 0f) || (i == segments - 1 && raw > 1f));
                best = (d, half, Mathf.Lerp(line[i * 3 + 1], line[j * 3 + 1], t), i + t, beyond);
            }
            return best;
        }

        /// <summary>Extra grade a mouth may add while it eases back into its road's own profile.</summary>
        const float MouthGrade = 0.05f;

        /// <summary>Race circuits are fast whatever their road type (Needle Circuit is a "city" road).</summary>
        const float CircuitRadius = 300f;
        const float MeetMetres = 3f;
        const float FollowMetres = 20f;

        static float[] Heights(Road r)
        {
            var h = new float[r.centerline.Length / 3];
            for (var i = 0; i < h.Length; i++) h[i] = r.centerline[i * 3 + 1];
            return h;
        }

        static void Relax(Road road, float limit, bool[] pinned = null)
        {
            var c = road.centerline;
            var n = c.Length / 3;
            var closed = road.closed;
            var ds = road.length / (closed ? n : n - 1);
            var y = Heights(road);
            for (var pass = 0; pass < 6000; pass++)
            {
                var changed = false;
                for (var i = 0; i < n; i++)
                {
                    if (!closed && (i == 0 || i == n - 1)) continue;
                    var a = y[(i - 1 + n) % n];
                    var b = y[(i + 1) % n];
                    var curve = (a - 2f * y[i] + b) / (ds * ds);
                    if (Mathf.Abs(curve) <= limit * 1.001f) continue;
                    if (pinned != null && pinned[i])
                    {
                        // A held station bends too tightly (the edge of a mouth): its free neighbour gives way.
                        int prev = (i - 1 + n) % n, next = (i + 1) % n;
                        var free = !pinned[next] && (closed || next != n - 1) ? next : !pinned[prev] && (closed || prev != 0) ? prev : -1;
                        if (free < 0) continue;
                        var other = free == next ? a : b;
                        var want = 2f * y[i] - other + Mathf.Sign(curve) * limit * ds * ds;
                        y[free] += (want - y[free]) * 0.5f;
                        changed = true;
                        continue;
                    }
                    var target = (a + b) * 0.5f - Mathf.Sign(curve) * limit * ds * ds * 0.5f;
                    y[i] += (target - y[i]) * 0.5f;
                    changed = true;
                }
                if (!changed) break;
            }
            for (var i = 0; i < n; i++) c[i * 3 + 1] = y[i];
        }

        /// <summary>Largest curvature of a road's profile, 1/m (tests).</summary>
        public static float MaxCurvature(Road road, int skipEnds = 0)
        {
            var c = road.centerline;
            var n = c.Length / 3;
            var ds = road.length / (road.closed ? n : n - 1);
            var max = 0f;
            for (var i = road.closed ? 0 : 1 + skipEnds; i < (road.closed ? n : n - 1 - skipEnds); i++)
            {
                var a = c[((i - 1 + n) % n) * 3 + 1];
                var b = c[((i + 1) % n) * 3 + 1];
                max = Mathf.Max(max, Mathf.Abs((a - 2f * c[i * 3 + 1] + b) / (ds * ds)));
            }
            return max;
        }

        const float Cell = 8f;
        static (int, int) Key(float x, float z) => (Mathf.FloorToInt(x / Cell), Mathf.FloorToInt(z / Cell));

    }
}
