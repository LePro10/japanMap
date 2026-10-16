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
    /// placed anew when far, stuck or knocked off. Built at runtime like the player's car, with the
    /// driving numbers of the default car and a light traffic model (asset sprint 6: kei cars, taxis,
    /// a 2-t truck, a community bus; ~1 600 triangles) painted from the street's colour mix.
    /// </summary>
    public sealed class TrafficSystem : MonoBehaviour
    {
        [SerializeField] TrafficSettings settings;
        [SerializeField] VehicleFleet fleet;
        [SerializeField] RoadNetwork roads;
        [SerializeField] PlayerModeController player;

        readonly List<TrafficCar> _cars = new();
        readonly Dictionary<string, Material> _paints = new();
        TrafficLooks _looks;
        readonly List<int> _cityRoads = new();
        int _next;

        public IReadOnlyList<TrafficCar> Cars => _cars;
        /// <summary>
        /// A zone traffic stays out of (null = none): cars inside go, none is placed there. The intro's run-up crosses
        /// the coast road — a pickup rammed the player's car at the start (2026-10-11).
        /// </summary>
        public System.Func<Vector3, bool> KeepOut;
        public RoadNetwork Roads => roads;

        void Start()
        {
            for (var r = 0; r < roads.roads.Count; r++)
                if (System.Array.IndexOf(settings.roadTypes, roads.roads[r].type) >= 0 && roads.roads[r].points.Length > 1
                    && roads.roads[r].width >= settings.minRoadWidth
                    && System.Array.IndexOf(settings.excludeRoads, roads.roads[r].id) < 0) _cityRoads.Add(r);
            StartCoroutine(Life.LifeContent.Load<TrafficLooks>(Life.LifeContent.Traffic, looks =>
            {
                _looks = looks;
                var tier = QualitySettings.names[QualitySettings.GetQualityLevel()];
                var count = tier == "Low" ? settings.countLow : settings.countHigh;
                for (var i = 0; i < count; i++) _cars.Add(Build(i));
            }));
        }

        TrafficCar Build(int i)
        {
            var def = fleet.Default;
            var model = Pick(_looks.models, m => m.prefab != null ? m.weight : 0f);
            var car = PlayerCarSpawner.Build(TrafficDefinition(def, model), fleet.tuning);
            car.name = $"Traffic {i} {model.name}";
            car.transform.SetParent(transform, false);
            var pilot = car.gameObject.AddComponent<PathFollower>();
            pilot.maxSpeedKmh = settings.maxSpeedKmh;
            pilot.lookAheadMin = settings.lookAheadMin; // tight turns at crossings, not the racing line
            var t = car.gameObject.AddComponent<TrafficCar>();
            t.Bind(settings, car, pilot);
            t.BodyRenderers = AddBody(car, model);
            car.gameObject.SetActive(false);
            return t;
        }

        // Same driving numbers as the default car, without its 120 k-triangle model; body box and axles of the traffic model.
        static VehicleDefinition TrafficDefinition(VehicleDefinition def, TrafficLooks.Model model)
        {
            var d = Instantiate(def);
            d.model = null;
            d.modelAsset = null; // no streamed model either (it would download and never match this copy)
            d.displayName = "Traffic";
            d.wheelPositions = new Vector3[0];
            d.bodySize = new Vector3(model.size.y, model.size.x, model.size.z);
            d.wheelbase = model.wheelbase;
            d.bodyCenterZ = AxleMiddle(d);
            return d;
        }

        /// <summary>Where the axles' middle lies from the car's root (the root is the centre of mass along Z).</summary>
        static float AxleMiddle(VehicleDefinition d) => d.wheelbase * (0.5f - d.frontWeight);

        Renderer[] AddBody(VehicleController car, TrafficLooks.Model model)
        {
            var body = Instantiate(model.prefab, car.transform, false);
            body.name = "Body";
            body.transform.localPosition = new Vector3(0f, 0f, AxleMiddle(car.Definition));
            // The car has its own body box; the model's COL_ box would double it.
            foreach (var c in body.GetComponentsInChildren<Collider>(true)) Destroy(c);
            var renderers = body.GetComponentsInChildren<Renderer>(true);
            if (model.paint && _looks.paintMaterial != null && _looks.paints.Length > 0)
            {
                var paint = Paint(Pick(_looks.paints, p => p.weight));
                foreach (var r in renderers)
                {
                    var mats = r.sharedMaterials;
                    for (var k = 0; k < mats.Length; k++)
                        if (mats[k] == _looks.paintMaterial) mats[k] = paint;
                    r.sharedMaterials = mats;
                }
            }
            return renderers;
        }

        /// <summary>One material per colour, shared by every car of that colour (keeps them batched).</summary>
        Material Paint(TrafficLooks.Paint p)
        {
            if (_paints.TryGetValue(p.name, out var m)) return m;
            m = new Material(_looks.paintMaterial) { name = "TrafficPaint " + p.name };
            m.SetColor("_BaseColor", p.color);
            _paints[p.name] = m;
            return m;
        }

        static T Pick<T>(T[] items, System.Func<T, float> weight)
        {
            var total = 0f;
            foreach (var x in items) total += weight(x);
            var at = Random.value * total;
            foreach (var x in items)
            {
                at -= weight(x);
                if (at <= 0f && weight(x) > 0f) return x;
            }
            foreach (var x in items) if (weight(x) > 0f) return x;
            return items[0];
        }

        void OnDestroy()
        {
            foreach (var m in _paints.Values) Destroy(m);
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
                if (KeepOut != null && KeepOut(c.transform.position)) { c.gameObject.SetActive(false); continue; }
                var mode = (c.transform.position - focus).sqrMagnitude < shadow2 ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
                foreach (var r in c.BodyRenderers)
                    if (r.shadowCastingMode != mode) r.shadowCastingMode = mode;
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
                if (lane.Length < 2 || Occupied(lane[0], t) || (KeepOut != null && KeepOut(lane[0]))) continue;
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
