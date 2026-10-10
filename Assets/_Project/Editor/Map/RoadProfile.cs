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
            for (var r = 0; r < roads.Count; r++)
            {
                if (before[r] == null) continue;
                var c = roads[r].centerline;
                for (var i = 0; i < before[r].Length; i++) LastMaxChange = Mathf.Max(LastMaxChange, Mathf.Abs(c[i * 3 + 1] - before[r][i]));
            }
            return roads;
        }

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

        static void Relax(Road road, float limit)
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
