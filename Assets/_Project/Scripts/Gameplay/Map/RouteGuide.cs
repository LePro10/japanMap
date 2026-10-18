using System.Collections.Generic;
using JapanMap.Gameplay.Hud;
using UnityEngine;

namespace JapanMap.Gameplay.Map
{
    /// <summary>
    /// The navigation route on the road, as in the prototype (legacy GuideLine.ts; owner 2026-10-17: "das Navi soll auch
    /// am Boden wieder angezeigt werden"): from the car to the waypoint or the next race checkpoint along the roads
    /// (<see cref="RouteGraph"/>), drawn as a cyan tape with chevrons a few hundred metres ahead and re-planned when the
    /// player leaves it. The same route is drawn on the map and the minimap (<see cref="Path"/>). One mesh, one draw call.
    /// </summary>
    public sealed class RouteGuide : MonoBehaviour
    {
        const float Spacing = 2f, Half = 1.35f, Lift = 0.07f;
        static readonly int ArcId = Shader.PropertyToID("_Arc"), RevealId = Shader.PropertyToID("_Reveal"), OpacityId = Shader.PropertyToID("_Opacity");

        PlayerModeController _player;
        MapSystem _map;
        GameplayHud _hud;
        Material _mat;
        RouteGraph _graph;
        readonly List<Vector3> _path = new();
        readonly List<float> _arcs = new();
        Vector3? _aim;
        int _idx;
        float _arc, _offFor, _builtArc = -999f, _builtAt, _opacity;
        Mesh _mesh;
        GameObject _go;

        public static RouteGuide Instance { get; private set; }
        /// <summary>The road graph (built on first use, ~30 ms; shared with auto-drive).</summary>
        public RouteGraph Graph => _graph ??= _map != null ? new RouteGraph(_map.Roads) : null;
        /// <summary>The planned route (empty when there is none).</summary>
        public IReadOnlyList<Vector3> Path => _path;
        /// <summary>Changes whenever the route is planned again (map views redraw).</summary>
        public int Version { get; private set; }
        public bool OnRoad { get; private set; }
        /// <summary>Metres from the car to the goal along the route.</summary>
        public float Remaining => _arcs.Count > 0 ? Mathf.Max(0f, _arcs[^1] - _arc) : 0f;
        /// <summary>Ahead of the car, m, drawn on the road.</summary>
        public float Reveal { get; set; } = 260f;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = null;

        public void Bind(PlayerModeController player, MapSystem map, GameplayHud hud, Material material)
        {
            _player = player;
            _map = map;
            _hud = hud;
            _mat = material != null ? new Material(material) : null;
            Instance = this;
            _mesh = new Mesh { name = "GuideRibbon" };
            _mesh.MarkDynamic();
            _go = new GameObject("RouteGuide");
            _go.transform.SetParent(transform, false);
            _go.AddComponent<MeshFilter>().sharedMesh = _mesh;
            var r = _go.AddComponent<MeshRenderer>();
            r.sharedMaterial = _mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            _go.SetActive(false);
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        void Update()
        {
            if (_map == null || _mat == null) return;
            var car = _player != null && _player.Current == PlayerModeController.Mode.Driving ? _player.Car : null;
            var from = car != null ? car.transform.position : _player != null && _player.Walker != null ? _player.Walker.transform.position : Vector3.zero;
            Vector3? aim = _hud != null ? _hud.Target : null;
            if (!aim.HasValue && _map.Waypoint.HasValue) aim = new Vector3(_map.Waypoint.Value.x, from.y, _map.Waypoint.Value.y);
            if (!aim.HasValue || _player == null)
            {
                if (_path.Count > 0) { _path.Clear(); _arcs.Clear(); Version++; }
                _aim = null;
                Fade(0f);
                return;
            }
            if (!_aim.HasValue || Flat(aim.Value - _aim.Value) > 5f) Plan(from, aim.Value);
            if (_path.Count < 2) { Fade(0f); return; }
            Track(from);
            // Off the route for a while (took another street): plan again from here.
            var off = Flat(from - PointAt(_arc));
            _offFor = off > 30f ? _offFor + Time.unscaledDeltaTime : 0f;
            if (_offFor > 1f) { _offFor = 0f; Plan(from, aim.Value); Track(from); }
            // On the road only from the car; on foot the map and the arrow guide.
            Fade(car != null ? 1f : 0f);
            if (car == null) return;
            if (Mathf.Abs(_arc - _builtArc) > 1.5f || Time.unscaledTime - _builtAt > 0.5f) Build();
            _mat.SetFloat(ArcId, _arc);
            _mat.SetFloat(RevealId, Reveal);
        }

        void Fade(float target)
        {
            _opacity = Mathf.MoveTowards(_opacity, target, Time.unscaledDeltaTime * (target > _opacity ? 3f : 4f));
            if (_mat != null) _mat.SetFloat(OpacityId, _opacity);
            var show = _opacity > 0.01f && _path.Count > 1;
            if (_go != null && _go.activeSelf != show) _go.SetActive(show);
        }

        void Plan(Vector3 from, Vector3 to)
        {
            OnRoad = Graph.Find(from, to, _path);
            _arcs.Clear();
            var a = 0f;
            for (var i = 0; i < _path.Count; i++)
            {
                if (i > 0) a += Vector3.Distance(_path[i - 1], _path[i]);
                _arcs.Add(a);
            }
            _aim = to;
            _idx = 0;
            _arc = 0f;
            _builtArc = -999f;
            Version++;
        }

        /// <summary>Where along the route the car is: the nearest segment near the last one (no jumps to a parallel leg).</summary>
        void Track(Vector3 p)
        {
            var best = float.MaxValue;
            var bestI = _idx;
            var bestT = 0f;
            for (var i = Mathf.Max(0, _idx - 6); i < Mathf.Min(_path.Count - 1, _idx + 60); i++)
            {
                var a = _path[i];
                var b = _path[i + 1];
                var ab = new Vector2(b.x - a.x, b.z - a.z);
                var len = ab.sqrMagnitude;
                var t = len < 1e-4f ? 0f : Mathf.Clamp01(((p.x - a.x) * ab.x + (p.z - a.z) * ab.y) / len);
                var q = Vector3.Lerp(a, b, t);
                var d = Flat(p - q);
                if (d < best) { best = d; bestI = i; bestT = t; }
            }
            _idx = bestI;
            _arc = _arcs[bestI] + (_arcs[bestI + 1] - _arcs[bestI]) * bestT;
        }

        Vector3 PointAt(float arc)
        {
            if (_path.Count == 0) return Vector3.zero;
            var i = Mathf.Clamp(_idx, 0, _path.Count - 2);
            while (i > 0 && _arcs[i] > arc) i--;
            while (i < _path.Count - 2 && _arcs[i + 1] < arc) i++;
            var span = _arcs[i + 1] - _arcs[i];
            return Vector3.Lerp(_path[i], _path[i + 1], span < 1e-4f ? 0f : Mathf.Clamp01((arc - _arcs[i]) / span));
        }

        readonly List<Vector3> _v = new();
        readonly List<Vector2> _uv = new();
        readonly List<int> _tri = new();

        /// <summary>The tape from just behind the car to Reveal ahead, laid on the ground left and right (it follows a
        /// camber or a crest instead of cutting through it).</summary>
        void Build()
        {
            _builtArc = _arc;
            _builtAt = Time.unscaledTime;
            _v.Clear();
            _uv.Clear();
            _tri.Clear();
            var start = Mathf.Max(0f, _arc - 10f);
            var end = Mathf.Min(_arcs[^1], _arc + Reveal);
            var mask = ~Core.GameLayers.NotGround;
            var prev = PointAt(start);
            for (var s = start; s <= end + 0.01f; s += Spacing)
            {
                var c = PointAt(s);
                var next = PointAt(Mathf.Min(end, s + Spacing));
                var dir = next - (s > start ? prev : c);
                dir.y = 0f;
                if (dir.sqrMagnitude < 1e-4f) dir = Vector3.forward;
                dir.Normalize();
                var right = new Vector3(dir.z, 0f, -dir.x);
                for (var side = -1; side <= 1; side += 2)
                {
                    var e = c + right * (Half * side);
                    var y = c.y;
                    if (Physics.Raycast(new Vector3(e.x, c.y + 4f, e.z), Vector3.down, out var hit, 10f, mask, QueryTriggerInteraction.Ignore)) y = hit.point.y;
                    _v.Add(new Vector3(e.x, y + Lift, e.z));
                    _uv.Add(new Vector2(side < 0 ? 0f : 1f, s));
                }
                prev = c;
            }
            for (var i = 0; i + 3 < _v.Count; i += 2)
            {
                _tri.Add(i); _tri.Add(i + 2); _tri.Add(i + 1);
                _tri.Add(i + 1); _tri.Add(i + 2); _tri.Add(i + 3);
            }
            _mesh.Clear();
            _mesh.SetVertices(_v);
            _mesh.SetUVs(0, _uv);
            _mesh.SetTriangles(_tri, 0);
            _mesh.RecalculateBounds();
        }

        static float Flat(Vector3 v) => Mathf.Sqrt(v.x * v.x + v.z * v.z);
    }
}
