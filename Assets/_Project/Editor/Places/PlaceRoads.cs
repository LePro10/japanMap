using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using JapanMap.Editor.Map;
using UnityEngine;

namespace JapanMap.Editor.Places
{
    /// <summary>
    /// Roads the prototype built inside a place (Funaura's road down from Stillwater, village lanes) and
    /// that are therefore missing from roads.json. They join the road import like any other road (mesh,
    /// carve, network, respawn): centripetal Catmull-Rom through the control points, sampled every 2 m;
    /// height = raw ground smoothed and limited to 11 % grade, blended into a fixed end height where the
    /// place has one (quay). The terrain import cuts and fills under them (tag "place").
    /// </summary>
    public static class PlaceRoads
    {
        const float Spacing = 2f;

        [System.Serializable]
        class Spec
        {
            public string id, type;
            public float width, endY;
            public bool hasEndY;
            public string extends;
            public List<Vector2> points = new();
        }

        /// <summary>
        /// <paramref name="roads"/> (roads.json) plus the places' roads. A road with "extends" continues an
        /// existing one from its end (Koedo street B after the village road): appended to it, because two
        /// roads meeting end to end would trim each other back and leave a gap.
        /// </summary>
        public static List<LegacySource.Road> Apply(List<LegacySource.Road> roads, MapImportSettings settings)
        {
            var dir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", PlaceSource.Dir));
            if (!Directory.Exists(dir)) return roads;
            System.Func<float, float, float> ground = null;
            foreach (var file in Directory.GetFiles(dir, "*.json").OrderBy(f => f))
            foreach (var spec in Parse(File.ReadAllText(file)))
            {
                ground ??= TerrainImporter.RawGround(settings);
                var host = string.IsNullOrEmpty(spec.extends) ? null : roads.FirstOrDefault(r => r.id == spec.extends);
                if (!string.IsNullOrEmpty(spec.extends) && host == null)
                    Debug.LogWarning($"[Places] road {spec.id} extends unknown road '{spec.extends}' — added on its own");
                if (host == null) { roads.Add(Build(spec, ground, float.NaN)); continue; }
                var c = host.centerline;
                var end = new Vector2(c[c.Length - 3], c[c.Length - 1]);
                var startY = c[c.Length - 2];
                spec.points.Insert(0, end);
                var tail = Build(spec, ground, startY);
                var n = tail.centerline.Length / 3;
                host.centerline = c.Concat(tail.centerline.Skip(3)).ToArray();
                host.widths = (host.widths ?? Enumerable.Repeat(spec.width, c.Length / 3).ToArray()).Concat(tail.widths.Skip(1)).ToArray();
                host.banking = (host.banking ?? new float[c.Length / 3]).Concat(tail.banking.Skip(1)).ToArray();
                host.length += tail.length;
                host.tags = (host.tags ?? new string[0]).Concat(new[] { "extended" }).ToArray();
            }
            return roads;
        }

        static IEnumerable<Spec> Parse(string raw)
        {
            var at = raw.IndexOf("\"roads\"", System.StringComparison.Ordinal);
            if (at < 0) yield break;
            foreach (Match m in Regex.Matches(raw.Substring(at), @"\{[^{}]*?""id""\s*:\s*""(?<id>[^""]+)""[^{}]*?""points""\s*:\s*\[(?<pts>(?:\s*\[[^\]]*\]\s*,?)*)\][^{}]*\}"))
            {
                var body = m.Value;
                var spec = new Spec { id = m.Groups["id"].Value };
                spec.type = Regex.Match(body, @"""type""\s*:\s*""([^""]+)""").Groups[1].Value;
                spec.width = Num(body, "width", 5);
                var end = Regex.Match(body, @"""endY""\s*:\s*(-?[\d.]+)");
                spec.hasEndY = end.Success;
                spec.extends = Regex.Match(body, @"""extends""\s*:\s*""([^""]+)""").Groups[1].Value;
                if (end.Success) spec.endY = float.Parse(end.Groups[1].Value, CultureInfo.InvariantCulture);
                foreach (Match p in Regex.Matches(m.Groups["pts"].Value, @"\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]"))
                    spec.points.Add(new Vector2(float.Parse(p.Groups[1].Value, CultureInfo.InvariantCulture), float.Parse(p.Groups[2].Value, CultureInfo.InvariantCulture)));
                if (spec.points.Count >= 2) yield return spec;
            }
        }

        static float Num(string body, string key, float fallback)
        {
            var m = Regex.Match(body, $@"""{key}""\s*:\s*(-?[\d.]+)");
            return m.Success ? float.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : fallback;
        }

        static LegacySource.Road Build(Spec spec, System.Func<float, float, float> ground, float startY)
        {
            var dense = Resample(CatmullRom(spec.points), Spacing);
            var n = dense.Count;
            // Profile like the prototype's own village roads (FunauraVillage #buildRoad): ground smoothed over
            // ±20 m, then at most 11 % grade, lifting dips rather than cutting crests (the raw ridge gave 34 %).
            // TerrainCarve cuts where the road is lower and fills (embankment) where it is higher.
            var raw = dense.Select(p => G(ground, p)).ToArray();
            var y = new float[n];
            const int half = 10;
            for (var i = 0; i < n; i++)
            {
                float sum = 0;
                var c = 0;
                for (var k = Mathf.Max(0, i - half); k <= Mathf.Min(n - 1, i + half); k++) { sum += raw[k]; c++; }
                y[i] = sum / c;
            }
            const float grade = 0.11f;
            for (var pass = 0; pass < 3; pass++)
            {
                for (var i = 1; i < n; i++) y[i] = Mathf.Max(y[i], y[i - 1] - Spacing * grade);
                for (var i = n - 2; i >= 0; i--) y[i] = Mathf.Max(y[i], y[i + 1] - Spacing * grade);
            }
            if (!float.IsNaN(startY))
            {
                const int blend = 10; // 20 m out of the host road's end height
                for (var j = 0; j < Mathf.Min(blend, n); j++) y[j] = Mathf.Lerp(startY, y[j], j / (float)blend);
            }
            if (spec.hasEndY)
            {
                const int blend = 14; // 28 m onto the quay
                for (var j = 0; j < Mathf.Min(blend, n); j++)
                {
                    var i = n - 1 - j;
                    y[i] = Mathf.Lerp(spec.endY, y[i], j / (float)blend);
                }
            }
            var centerline = new float[n * 3];
            for (var i = 0; i < n; i++)
            {
                centerline[i * 3] = dense[i].x;
                centerline[i * 3 + 1] = y[i];
                centerline[i * 3 + 2] = dense[i].y;
            }
            return new LegacySource.Road
            {
                id = spec.id,
                type = spec.type,
                tags = new[] { "place" },
                centerline = centerline,
                widths = Enumerable.Repeat(spec.width, n).ToArray(),
                banking = new float[n],
                length = Spacing * (n - 1),
                junctions = new LegacySource.Road.Junction[0],
                rails = new LegacySource.Road.Rail[0],
            };
        }

        static float G(System.Func<float, float, float> ground, Vector2 three) => ground(three.x, -three.y); // Three z → Unity z

        static List<Vector2> CatmullRom(List<Vector2> p)
        {
            var q = new List<Vector2> { 2 * p[0] - p[1] };
            q.AddRange(p);
            q.Add(2 * p[p.Count - 1] - p[p.Count - 2]);
            var dense = new List<Vector2>();
            for (var i = 1; i < q.Count - 2; i++)
            {
                Vector2 p0 = q[i - 1], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2];
                float T(Vector2 a, Vector2 b) => Mathf.Max(1e-4f, Mathf.Sqrt(Vector2.Distance(a, b)));
                float t0 = 0, t1 = t0 + T(p0, p1), t2 = t1 + T(p1, p2), t3 = t2 + T(p2, p3);
                var steps = Mathf.Max(4, Mathf.CeilToInt(Vector2.Distance(p1, p2) / 0.5f));
                for (var k = i == 1 ? 0 : 1; k <= steps; k++)
                {
                    var t = t1 + (t2 - t1) * k / steps;
                    var a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1;
                    var a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2;
                    var a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3;
                    var b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
                    var b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
                    dense.Add((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2);
                }
            }
            return dense;
        }

        static List<Vector2> Resample(List<Vector2> line, float step)
        {
            var output = new List<Vector2> { line[0] };
            var carry = 0f;
            for (var i = 1; i < line.Count; i++)
            {
                var a = line[i - 1];
                var b = line[i];
                var len = Vector2.Distance(a, b);
                var s = step - carry;
                while (s <= len)
                {
                    output.Add(Vector2.Lerp(a, b, s / len));
                    s += step;
                }
                carry = len - (s - step);
            }
            if (Vector2.Distance(output[output.Count - 1], line[line.Count - 1]) > step * 0.3f) output.Add(line[line.Count - 1]);
            return output;
        }
    }
}
