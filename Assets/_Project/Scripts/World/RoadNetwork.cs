using System;
using System.Collections.Generic;
using JapanMap.Core;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Road centrelines at runtime (Unity coordinates), written by the road importer from roads.json.
    /// Used for respawn now; AI, minimap and events later. A coarse grid makes the nearest-point
    /// query cheap enough for every respawn.
    /// </summary>
    public sealed class RoadNetwork : ScriptableObject, IRoadLocator
    {
        [Serializable]
        public struct Road
        {
            public string id;
            public string type;
            public bool closed;
            public float width;
            public Vector3[] points;
        }

        public const float CellSize = 64f;

        public List<Road> roads = new();

        // Grid: cell → (road, segment) pairs. Built on first query, not serialized.
        [NonSerialized] Dictionary<(int, int), List<(int road, int seg)>> _grid;

        public bool TryNearest(Vector3 position, Vector3 preferForward, float maxDistance, out Vector3 point, out Vector3 forward)
        {
            _grid ??= BuildGrid();
            point = default;
            forward = Vector3.forward;
            var best = maxDistance * maxDistance;
            var found = false;
            var reach = Mathf.CeilToInt(maxDistance / CellSize);
            var cx = Mathf.FloorToInt(position.x / CellSize);
            var cz = Mathf.FloorToInt(position.z / CellSize);
            for (var dx = -reach; dx <= reach; dx++)
            for (var dz = -reach; dz <= reach; dz++)
            {
                if (!_grid.TryGetValue((cx + dx, cz + dz), out var list)) continue;
                foreach (var (r, s) in list)
                {
                    var pts = roads[r].points;
                    var a = pts[s];
                    var b = pts[(s + 1) % pts.Length];
                    var p = ClosestOnSegmentXZ(a, b, position);
                    var d = Sqr(p.x - position.x) + Sqr(p.z - position.z);
                    if (d >= best) continue;
                    best = d;
                    point = p;
                    forward = (b - a).normalized;
                    found = true;
                }
            }
            if (found && Vector3.Dot(forward, preferForward) < 0f) forward = -forward;
            return found;
        }

        Dictionary<(int, int), List<(int, int)>> BuildGrid()
        {
            var grid = new Dictionary<(int, int), List<(int, int)>>();
            for (var r = 0; r < roads.Count; r++)
            {
                var pts = roads[r].points;
                var segs = roads[r].closed ? pts.Length : pts.Length - 1;
                for (var s = 0; s < segs; s++)
                {
                    var a = pts[s];
                    var b = pts[(s + 1) % pts.Length];
                    var x0 = Mathf.FloorToInt(Mathf.Min(a.x, b.x) / CellSize);
                    var x1 = Mathf.FloorToInt(Mathf.Max(a.x, b.x) / CellSize);
                    var z0 = Mathf.FloorToInt(Mathf.Min(a.z, b.z) / CellSize);
                    var z1 = Mathf.FloorToInt(Mathf.Max(a.z, b.z) / CellSize);
                    for (var x = x0; x <= x1; x++)
                    for (var z = z0; z <= z1; z++)
                    {
                        if (!grid.TryGetValue((x, z), out var list)) grid[(x, z)] = list = new List<(int, int)>();
                        list.Add((r, s));
                    }
                }
            }
            return grid;
        }

        static Vector3 ClosestOnSegmentXZ(Vector3 a, Vector3 b, Vector3 p)
        {
            var ab = new Vector2(b.x - a.x, b.z - a.z);
            var len = ab.sqrMagnitude;
            var t = len < 1e-6f ? 0f : Mathf.Clamp01(((p.x - a.x) * ab.x + (p.z - a.z) * ab.y) / len);
            return Vector3.Lerp(a, b, t);
        }

        static float Sqr(float x) => x * x;
    }
}
