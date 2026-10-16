using System.Collections.Generic;
using JapanMap.World;
using UnityEngine;

namespace JapanMap.Gameplay.Map
{
    /// <summary>
    /// The road network as a graph and the shortest drive from here to there (legacy routeGraph.ts). Nodes every few
    /// metres along each centreline; crossings are found by nearness between <b>different</b> roads at the same height
    /// (the network has no junction tags here; a bridge 6 m above is not a crossing). A* with the straight distance.
    /// Paths ("pfad") cost 2.5 × their length: taken only where they are the way (the field path to Stillwater).
    /// Pure logic, built once per network.
    /// </summary>
    public sealed class RouteGraph
    {
        readonly List<Vector3> _pos = new();
        readonly List<int> _road = new();
        readonly List<List<(int to, float cost)>> _edges = new();
        readonly Dictionary<(int, int), List<int>> _cells = new();
        const float Cell = 32f;

        public int NodeCount => _pos.Count;

        public RouteGraph(RoadNetwork net, float spacing = 4f, float link = 9f, float maxStep = 2.5f)
        {
            if (net == null) return;
            for (var r = 0; r < net.roads.Count; r++)
            {
                var road = net.roads[r];
                if (road.points == null || road.points.Length < 2) continue;
                _slow = road.type == "pfad" ? 2.5f : 1f;
                var first = _pos.Count;
                var pts = road.points;
                var segs = road.closed ? pts.Length : pts.Length - 1;
                Add(pts[0], r);
                for (var s = 0; s < segs; s++)
                {
                    var a = pts[s];
                    var b = pts[(s + 1) % pts.Length];
                    var n = Mathf.Max(1, Mathf.CeilToInt(Vector3.Distance(a, b) / spacing));
                    for (var k = 1; k <= n; k++)
                    {
                        if (road.closed && s == segs - 1 && k == n) break; // back at the first node
                        Add(Vector3.Lerp(a, b, k / (float)n), r);
                        Link(_pos.Count - 2, _pos.Count - 1);
                    }
                }
                if (road.closed && _pos.Count - first > 2) Link(first, _pos.Count - 1);
            }
            // Crossings and T-junctions: near nodes of other roads at the same height.
            for (var i = 0; i < _pos.Count; i++)
            {
                var a = _pos[i];
                var cx = Mathf.FloorToInt(a.x / Cell);
                var cz = Mathf.FloorToInt(a.z / Cell);
                var best = new Dictionary<int, (int j, float d)>();
                for (var dx = -1; dx <= 1; dx++)
                for (var dz = -1; dz <= 1; dz++)
                {
                    if (!_cells.TryGetValue((cx + dx, cz + dz), out var list)) continue;
                    foreach (var j in list)
                    {
                        if (j <= i || _road[j] == _road[i]) continue;
                        var b = _pos[j];
                        if (Mathf.Abs(a.y - b.y) > maxStep) continue;
                        var d = Sqr(a.x - b.x) + Sqr(a.z - b.z);
                        if (d > link * link) continue;
                        // One link per other road: the nearest node of it.
                        if (!best.TryGetValue(_road[j], out var bj) || d < bj.d) best[_road[j]] = (j, d);
                    }
                }
                _slow = 1f;
                foreach (var kv in best) Link(i, kv.Value.j);
            }
        }

        void Add(Vector3 p, int road)
        {
            _pos.Add(p);
            _road.Add(road);
            _edges.Add(new List<(int, float)>(3));
            var key = (Mathf.FloorToInt(p.x / Cell), Mathf.FloorToInt(p.z / Cell));
            if (!_cells.TryGetValue(key, out var list)) _cells[key] = list = new List<int>();
            list.Add(_pos.Count - 1);
        }

        float _slow = 1f;

        void Link(int a, int b)
        {
            var c = Vector3.Distance(_pos[a], _pos[b]) * _slow;
            _edges[a].Add((b, c));
            _edges[b].Add((a, c));
        }

        /// <summary>Nearest node within <paramref name="reach"/> m (xz), −1 if none.</summary>
        public int Nearest(Vector3 p, float reach = 400f)
        {
            var best = -1;
            var bestD = reach * reach;
            var r = Mathf.CeilToInt(reach / Cell);
            var cx = Mathf.FloorToInt(p.x / Cell);
            var cz = Mathf.FloorToInt(p.z / Cell);
            for (var ring = 0; ring <= r; ring++)
            {
                for (var dx = -ring; dx <= ring; dx++)
                for (var dz = -ring; dz <= ring; dz++)
                {
                    if (Mathf.Max(Mathf.Abs(dx), Mathf.Abs(dz)) != ring) continue;
                    if (!_cells.TryGetValue((cx + dx, cz + dz), out var list)) continue;
                    foreach (var i in list)
                    {
                        var q = _pos[i];
                        var d = Sqr(q.x - p.x) + Sqr(q.z - p.z) + Sqr(q.y - p.y) * 0.25f;
                        if (d < bestD) { bestD = d; best = i; }
                    }
                }
                // Found one and the next ring is farther than it: done.
                if (best >= 0 && (ring * Cell) * (ring * Cell) > bestD) break;
            }
            return best;
        }

        /// <summary>
        /// The drive from <paramref name="from"/> to <paramref name="to"/> as points (start, road nodes, goal). False
        /// when either end is far from every road or no road connects them (then <paramref name="path"/> is the
        /// straight line).
        /// </summary>
        public bool Find(Vector3 from, Vector3 to, List<Vector3> path)
        {
            path.Clear();
            var s = Nearest(from);
            var g = Nearest(to);
            if (s < 0 || g < 0 || !AStar(s, g, path))
            {
                path.Add(from);
                path.Add(to);
                return false;
            }
            if (Flat(from - path[0]) > 4f) path.Insert(0, from);
            if (Flat(to - path[^1]) > 4f) path.Add(new Vector3(to.x, path[^1].y, to.z));
            return true;
        }

        readonly List<(float f, int i)> _heap = new();

        bool AStar(int start, int goal, List<Vector3> path)
        {
            var n = _pos.Count;
            var gScore = new float[n];
            var prev = new int[n];
            var closed = new bool[n];
            for (var i = 0; i < n; i++) { gScore[i] = float.MaxValue; prev[i] = -1; }
            gScore[start] = 0f;
            _heap.Clear();
            Push(0f, start);
            var goalP = _pos[goal];
            while (_heap.Count > 0)
            {
                var cur = Pop();
                if (closed[cur]) continue;
                if (cur == goal) break;
                closed[cur] = true;
                foreach (var (to, cost) in _edges[cur])
                {
                    var tentative = gScore[cur] + cost;
                    if (tentative >= gScore[to]) continue;
                    gScore[to] = tentative;
                    prev[to] = cur;
                    Push(tentative + Vector3.Distance(_pos[to], goalP), to);
                }
            }
            if (prev[goal] < 0 && goal != start) return false;
            for (var i = goal; i >= 0; i = prev[i]) path.Add(_pos[i]);
            path.Reverse();
            return true;
        }

        void Push(float f, int i)
        {
            _heap.Add((f, i));
            var c = _heap.Count - 1;
            while (c > 0)
            {
                var p = (c - 1) / 2;
                if (_heap[p].f <= _heap[c].f) break;
                (_heap[p], _heap[c]) = (_heap[c], _heap[p]);
                c = p;
            }
        }

        int Pop()
        {
            var top = _heap[0].i;
            var last = _heap[^1];
            _heap.RemoveAt(_heap.Count - 1);
            if (_heap.Count == 0) return top;
            _heap[0] = last;
            var c = 0;
            while (true)
            {
                var l = c * 2 + 1;
                var r = l + 1;
                var m = c;
                if (l < _heap.Count && _heap[l].f < _heap[m].f) m = l;
                if (r < _heap.Count && _heap[r].f < _heap[m].f) m = r;
                if (m == c) break;
                (_heap[m], _heap[c]) = (_heap[c], _heap[m]);
                c = m;
            }
            return top;
        }

        static float Flat(Vector3 v) => Mathf.Sqrt(v.x * v.x + v.z * v.z);
        static float Sqr(float x) => x * x;
    }
}
