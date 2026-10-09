using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Vehicles;
using JapanMap.World;
using UnityEngine;

namespace JapanMap.Gameplay.Traffic
{
    /// <summary>
    /// Keeps a few NPC cars on the city streets around the player: placed on a lane 70–200 m away,
    /// driving road after road (at a road's end it turns into one that starts there), taken away and
    /// placed anew when far, stuck or knocked off. Built at runtime like the player's car; the body
    /// is a PROVISIONAL box stand-in (the fleet models have 120 k triangles; light traffic cars are
    /// on the asset list).
    /// </summary>
    public sealed class TrafficSystem : MonoBehaviour
    {
        [SerializeField] TrafficSettings settings;
        [SerializeField] VehicleFleet fleet;
        [SerializeField] RoadNetwork roads;
        [SerializeField] PlayerModeController player;
        [Tooltip("Lit material the stand-in palette is made from.")]
        [SerializeField] Material template;

        readonly List<TrafficCar> _cars = new();
        readonly List<int> _cityRoads = new();
        int _next;

        public IReadOnlyList<TrafficCar> Cars => _cars;
        public RoadNetwork Roads => roads;

        void Start()
        {
            for (var r = 0; r < roads.roads.Count; r++)
                if (System.Array.IndexOf(settings.roadTypes, roads.roads[r].type) >= 0 && roads.roads[r].points.Length > 1
                    && roads.roads[r].width >= settings.minRoadWidth
                    && System.Array.IndexOf(settings.excludeRoads, roads.roads[r].id) < 0) _cityRoads.Add(r);
            var tier = QualitySettings.names[QualitySettings.GetQualityLevel()];
            var count = tier == "Low" ? settings.countLow : settings.countHigh;
            for (var i = 0; i < count; i++) _cars.Add(Build(i));
        }

        TrafficCar Build(int i)
        {
            var def = fleet.Default;
            var car = PlayerCarSpawner.Build(StandInDefinition(def), fleet.tuning);
            car.name = "Traffic " + i;
            car.transform.SetParent(transform, false);
            var body = AddBody(car.transform, def, settings.colors[i % settings.colors.Length]);
            var pilot = car.gameObject.AddComponent<PathFollower>();
            pilot.maxSpeedKmh = settings.maxSpeedKmh;
            pilot.lookAheadMin = settings.lookAheadMin; // tight turns at crossings, not the racing line
            var t = car.gameObject.AddComponent<TrafficCar>();
            t.Bind(settings, car, pilot);
            t.BodyRenderer = body;
            car.gameObject.SetActive(false);
            return t;
        }

        // Same driving numbers as the default car, without its 120 k-triangle model.
        static VehicleDefinition StandInDefinition(VehicleDefinition def)
        {
            var d = Instantiate(def);
            d.model = null;
            d.displayName = "Traffic";
            return d;
        }

        MeshRenderer AddBody(Transform car, VehicleDefinition def, Color paint)
        {
            var palette = StandInPalette.For(template);
            var len = def.bodySize.x;
            var wid = def.bodySize.y * 0.9f;
            var b = new BoxMeshBuilder();
            var body = palette.Uv(paint);
            var glass = palette.Uv(new Color(0.1f, 0.12f, 0.15f));
            var tyre = palette.Uv(new Color(0.05f, 0.05f, 0.05f));
            var lamp = palette.Uv(new Color(1f, 0.95f, 0.8f));
            var tail = palette.Uv(new Color(0.8f, 0.05f, 0.05f));
            var z = def.bodyCenterZ;
            b.Box(0, new Vector3(0f, 0.62f, z), new Vector3(wid, 0.6f, len), body);
            b.Box(0, new Vector3(0f, 1.15f, z - 0.25f), new Vector3(wid * 0.86f, 0.5f, len * 0.5f), glass);
            b.Box(0, new Vector3(0f, 1.41f, z - 0.25f), new Vector3(wid * 0.84f, 0.04f, len * 0.46f), body);
            foreach (var sx in new[] { -1f, 1f })
            {
                foreach (var sz in new[] { -1f, 1f })
                    b.Box(0, new Vector3(sx * (wid * 0.5f - 0.12f), def.wheelRadius, z + sz * def.wheelbase * 0.5f), new Vector3(0.26f, def.wheelRadius * 2f, def.wheelRadius * 2f), tyre);
                b.Box(0, new Vector3(sx * wid * 0.32f, 0.72f, z + len * 0.5f + 0.01f), new Vector3(0.3f, 0.12f, 0.04f), lamp);
                b.Box(0, new Vector3(sx * wid * 0.36f, 0.75f, z - len * 0.5f - 0.01f), new Vector3(0.32f, 0.1f, 0.04f), tail);
            }
            var go = new GameObject("Body (provisional)");
            go.transform.SetParent(car, false);
            go.AddComponent<MeshFilter>().sharedMesh = b.ToMesh("TrafficCar", skinned: false);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = palette.Material;
            return r;
        }

        Vector3 Focus()
        {
            if (player == null) return transform.position;
            return player.Current == PlayerModeController.Mode.Walking && player.Walker != null
                ? player.Walker.transform.position
                : player.Car != null ? player.Car.transform.position : transform.position;
        }

        void Update()
        {
            if (_cars.Count == 0) return;
            var focus = Focus();
            var shadow2 = settings.shadowDistance * settings.shadowDistance;
            foreach (var c in _cars)
            {
                if (!c.gameObject.activeSelf) continue;
                var mode = (c.transform.position - focus).sqrMagnitude < shadow2 ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
                if (c.BodyRenderer.shadowCastingMode != mode) c.BodyRenderer.shadowCastingMode = mode;
            }
            // One car per frame: drive on, or place anew.
            var t = _cars[_next];
            _next = (_next + 1) % _cars.Count;
            var active = t.gameObject.activeSelf;
            if (active && t.Pilot.Finished) Continue(t);
            if (active && !t.Lost && Flat(t.transform.position, focus) < settings.despawn) return;
            if (!TryPlace(t, focus)) t.gameObject.SetActive(false);
        }

        bool TryPlace(TrafficCar t, Vector3 focus)
        {
            if (_cityRoads.Count == 0) return false;
            for (var attempt = 0; attempt < 8; attempt++)
            {
                var r = _cityRoads[Random.Range(0, _cityRoads.Count)];
                var pts = roads.roads[r].points;
                var i = Random.Range(0, pts.Length - 1);
                var d = Flat(pts[i], focus);
                if (d < settings.spawnRange.x || d > settings.spawnRange.y) continue;
                var forward = Random.value < 0.5f;
                var lane = Lane(r, i, forward, out var start);
                if (lane.Length < 2 || Occupied(lane[0], t)) continue;
                t.gameObject.SetActive(true);
                var dir = lane[1] - lane[0];
                t.Car.Place(lane[0], Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg, fromAbove: 3f);
                t.Pilot.Begin(t.Car, lane, false);
                t.RoadIndex = r;
                t.ResetState();
                return true;
            }
            return false;
        }

        /// <summary>At a road's end: carry on into a city road that starts (or ends) here, not back.</summary>
        void Continue(TrafficCar t)
        {
            var at = t.transform.position;
            var heading = t.transform.forward;
            var bestScore = -2f;
            var best = (-1, 0, true);
            foreach (var r in _cityRoads)
            {
                if (r == t.RoadIndex) continue;
                var pts = roads.roads[r].points;
                for (var i = 0; i < pts.Length; i++)
                {
                    // Only roads that really join here; a road 14 m off meant cutting across the pavement.
                    if (Flat(pts[i], at) > 8f) continue;
                    foreach (var fwd in new[] { true, false })
                    {
                        var j = fwd ? i + 1 : i - 1;
                        if (j < 0 || j >= pts.Length) continue;
                        var dir = (pts[j] - pts[i]).normalized;
                        var score = Vector3.Dot(dir, heading) + Random.value * 0.6f; // a little choice at crossings
                        if (score > bestScore && Vector3.Dot(dir, heading) > -0.2f) { bestScore = score; best = (r, i, fwd); }
                    }
                    break;
                }
            }
            if (best.Item1 < 0) { t.gameObject.SetActive(false); return; }
            var lane = Lane(best.Item1, best.Item2, best.Item3, out _);
            if (lane.Length < 2) { t.gameObject.SetActive(false); return; }
            t.Pilot.Begin(t.Car, lane, false);
            t.RoadIndex = best.Item1;
        }

        /// <summary>The road from point <paramref name="i"/> to its end in the chosen direction, shifted onto the left lane.</summary>
        Vector3[] Lane(int r, int i, bool forward, out int start)
        {
            var road = roads.roads[r];
            var pts = road.points;
            var list = new List<Vector3>();
            for (var k = i; forward ? k < pts.Length : k >= 0; k += forward ? 1 : -1) list.Add(pts[k]);
            start = i;
            var lane = new Vector3[list.Count];
            var shift = road.width * settings.laneShare;
            for (var k = 0; k < list.Count; k++)
            {
                var a = list[Mathf.Max(0, k - 1)];
                var b = list[Mathf.Min(list.Count - 1, k + 1)];
                var dir = new Vector3(b.x - a.x, 0f, b.z - a.z).normalized;
                var left = new Vector3(-dir.z, 0f, dir.x);
                lane[k] = list[k] + left * shift;
            }
            return lane;
        }

        bool Occupied(Vector3 at, TrafficCar self)
        {
            foreach (var c in _cars)
                if (c != self && c.gameObject.activeSelf && Flat(c.transform.position, at) < 15f) return true;
            return player != null && player.Car != null && Flat(player.Car.transform.position, at) < 15f;
        }

        static float Flat(Vector3 a, Vector3 b) => new Vector2(a.x - b.x, a.z - b.z).magnitude;
    }
}
