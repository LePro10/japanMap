using System.Collections.Generic;
using System.Linq;
using JapanMap.World;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Drives every road end that runs into another road with raycasts and finds height steps a car would hit: the
    /// topmost ground (road, terrain, slab, deck) is sampled every 0.5 m along three lane lines from the other road's
    /// centre out past its edge. hill-steps-west stood 1.3 m above the mouth of west-works-03-2 (D49, Auto-Drive got
    /// stuck there). Needs the game scene with its streamed parts open (<see cref="MapScene.OpenGameScene"/>).
    /// </summary>
    public static class JunctionCheck
    {
        public struct Step
        {
            public string road, host;
            public Vector3 at;
            public float height;
            public override string ToString() => $"{road} → {host} at ({at.x:F0}, {at.z:F0}): {height:F2} m";
        }

        /// <summary>A car's body clears 0.10–0.32 m; a step above this is a kerb in the lane, m.</summary>
        public const float Limit = 0.25f;

        /// <summary>Distance driven beyond the other road's edge, m.</summary>
        const float Beyond = 10f;
        const float Sample = 0.5f;

        /// <summary>
        /// Every step above <see cref="Limit"/> into the log. Batch: <c>node Tools/unity-run.mjs
        /// JapanMap.Editor.Map.JunctionCheck.Report</c>; <c>-jmRoad &lt;id&gt;</c> also lists that road's samples (height, collider).
        /// </summary>
        [MenuItem("JapanMap/Map/Check Junction Steps")]
        public static string Report()
        {
            MapScene.OpenGameScene();
            var road = BatchArgs.Get("jmRoad", null);
            var trace = road != null ? new System.Text.StringBuilder($"[Map] samples along {road}:\n") : null;
            var steps = Find(AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath), Limit, trace, road);
            var msg = $"[Map] junction steps > {Limit} m: {steps.Count}" + (steps.Count > 0 ? "\n  " + string.Join("\n  ", steps.Take(30)) : "");
            Debug.Log(msg);
            if (trace != null) Debug.Log(trace.ToString());
            return msg;
        }

        /// <param name="trace">Optional: every sample along <paramref name="traceRoad"/>'s ends (lane, x/z, height, collider).</param>
        public static List<Step> Find(RoadNetwork net, float limit, System.Text.StringBuilder trace = null, string traceRoad = null)
        {
            Physics.SyncTransforms();
            var steps = new List<Step>();
            foreach (var road in net.roads)
            {
                if (road.closed || road.points == null || road.points.Length < 4) continue;
                foreach (var fromEnd in new[] { false, true })
                {
                    var pts = fromEnd ? road.points.Reverse().ToArray() : road.points;
                    var host = HostAt(net, road, pts[0]);
                    if (host == null) continue;
                    var reach = host.Value.half + 2f + Beyond;
                    var worst = new Step { road = road.id, host = host.Value.id };
                    foreach (var lane in new[] { -0.25f, 0f, 0.25f })
                    {
                        float? last = null;
                        foreach (var p in Walk(pts, reach, lane * road.width))
                        {
                            var y = Ground(p, out var what);
                            if (trace != null && road.id == traceRoad) trace.Append($"{(fromEnd ? 'E' : 'S')}{lane:+0.00;-0.00} {p.x:F1},{p.z:F1} {y:F2} {what}\n");
                            if (y == null) { last = null; continue; }
                            if (last != null && Mathf.Abs(y.Value - last.Value) > worst.height)
                            {
                                worst.height = Mathf.Abs(y.Value - last.Value);
                                worst.at = new Vector3(p.x, y.Value, p.z);
                            }
                            last = y;
                        }
                    }
                    if (worst.height > limit) steps.Add(worst);
                }
            }
            return steps.OrderByDescending(s => s.height).ToList();
        }

        /// <summary>The road whose carriageway the end <paramref name="p"/> lies on (± 2 m, same level), with its half width.</summary>
        static (string id, float half)? HostAt(RoadNetwork net, RoadNetwork.Road self, Vector3 p)
        {
            (string id, float half)? best = null;
            var bestD = float.MaxValue;
            foreach (var other in net.roads)
            {
                if (other.id == self.id || other.points == null) continue;
                var o = other.points;
                var segs = other.closed ? o.Length : o.Length - 1;
                for (var i = 0; i < segs; i++)
                {
                    var a = o[i];
                    var b = o[(i + 1) % o.Length];
                    var ab = new Vector2(b.x - a.x, b.z - a.z);
                    var t = ab.sqrMagnitude > 0 ? Mathf.Clamp01(Vector2.Dot(new Vector2(p.x - a.x, p.z - a.z), ab) / ab.sqrMagnitude) : 0f;
                    var q = Vector3.Lerp(a, b, t);
                    var d = new Vector2(p.x - q.x, p.z - q.z).magnitude;
                    if (d > other.width / 2 + 2f || Mathf.Abs(p.y - q.y) > 1.5f || d >= bestD) continue;
                    bestD = d;
                    best = (other.id, other.width / 2);
                }
            }
            return best;
        }

        /// <summary>Points along the polyline from its start, every <see cref="Sample"/> m up to <paramref name="reach"/>, shifted sideways.</summary>
        static IEnumerable<Vector3> Walk(Vector3[] pts, float reach, float lateral)
        {
            var travelled = 0f;
            for (var i = 0; i < pts.Length - 1 && travelled < reach; i++)
            {
                var a = pts[i];
                var b = pts[i + 1];
                var f = b - a;
                f.y = 0f;
                var len = f.magnitude;
                if (len < 1e-3f) continue;
                var right = new Vector3(f.z, 0f, -f.x) / len;
                for (var s = travelled == 0f ? 0f : Sample - (travelled % Sample); s < len && travelled + s < reach; s += Sample)
                    yield return Vector3.Lerp(a, b, s / len) + right * lateral;
                travelled += len;
            }
        }

        /// <summary>Topmost drivable ground within 3 m above / 6 m below <paramref name="p"/> — props and cars do not count.</summary>
        static float? Ground(Vector3 p, out string what)
        {
            float? top = null;
            what = null;
            foreach (var h in Physics.RaycastAll(p + Vector3.up * 3f, Vector3.down, 9f, ~0, QueryTriggerInteraction.Ignore))
            {
                var n = h.collider.name;
                if (!(n.StartsWith("Road") || n.StartsWith("Terrain") || n.StartsWith("CitySlab") || n.StartsWith("Viaduct")) || n.Contains("Rail")) continue;
                if (top == null || h.point.y > top) { top = h.point.y; what = n; }
            }
            return top;
        }
    }
}
