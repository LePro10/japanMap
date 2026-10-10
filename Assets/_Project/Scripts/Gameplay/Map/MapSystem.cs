using System.Collections.Generic;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using JapanMap.World;
using UnityEngine;

namespace JapanMap.Gameplay.Map
{
    public enum MapFilter { All, Events, Places, Discoveries }

    /// <summary>
    /// What the minimap and the world map show (ASTRA §10): the base image (baked once per scene), the pins —
    /// player, car, garage, events, travel points, drift zones, ramps, known discoveries (diamond) and clues
    /// (hollow question mark with an 80 m search circle) — and the waypoint. The minimap shows only nearby
    /// uncompleted activities, the active route and rivals; filters belong to the world map.
    /// </summary>
    public sealed class MapSystem : MonoBehaviour
    {
        [SerializeField] RoadNetwork roads;
        [SerializeField] RegionWatch regions;
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerProgress progress;
        [SerializeField] RaceDirector races;
        [SerializeField] DiscoverySystem discoveries;
        [SerializeField] DriftZoneSet driftZones;
        [SerializeField] GarageSettings garage;
        [SerializeField] Travel travel;
        [Tooltip("World x/z covered by the map, m.")]
        [SerializeField] Rect bounds = new(-1536f, -1537.5f, 3072f, 3072f);
        [Tooltip("Base image resolution, m per pixel.")]
        [SerializeField] float metresPerPixel = 6f;
        [Tooltip("Search circle of a clue, m (ASTRA/STATUS: 80).")]
        [SerializeField] float clueRadius = 80f;

        Texture2D _base;
        public Rect Bounds => bounds;
        public RoadNetwork Roads => roads;
        public RegionSet Regions => regions != null ? regions.Regions : null;
        public RegionWatch RegionWatch => regions;
        public Texture2D Base => _base;
        public float ClueRadius => clueRadius;
        public DiscoverySystem Discoveries => discoveries;
        public RaceDirector Races => races;
        public Travel Travel => travel;
        public PlayerProgress Progress => progress;
        /// <summary>Player's waypoint (world x/z), or null.</summary>
        public Vector2? Waypoint { get; set; }

        public static readonly Color Paper = new(0.965f, 0.937f, 0.894f);
        public static readonly Color Amber = new(0.95f, 0.77f, 0.42f);
        public static readonly Color Sakura = new(0.91f, 0.66f, 0.75f);
        public static readonly Color Nitro = new(0.4f, 0.84f, 0.96f);

        public Vector3 PlayerPosition => player == null ? Vector3.zero
            : player.Current == PlayerModeController.Mode.Driving && player.Car != null ? player.Car.transform.position
            : player.Walker != null ? player.Walker.transform.position : Vector3.zero;

        public float PlayerHeading
        {
            get
            {
                if (player == null) return 0f;
                var t = player.Current == PlayerModeController.Mode.Driving && player.Car != null ? player.Car.transform
                    : player.Walker != null ? player.Walker.transform : null;
                return t != null ? t.eulerAngles.y : 0f;
            }
        }

        public bool Driving => player != null && player.Current == PlayerModeController.Mode.Driving;

        public Texture2D EnsureBase()
        {
            if (_base != null) return _base;
            var sea = GameObject.Find("World/Water/Sea");
            var level = sea != null && sea.TryGetComponent<Renderer>(out var r) ? r.bounds.max.y : 0.5f;
            var t0 = Time.realtimeSinceStartup;
            _base = MapView.BakeBase(Terrain.activeTerrain, Regions, bounds, metresPerPixel, level);
            Debug.Log($"[Map] base {_base.width}×{_base.height} in {(Time.realtimeSinceStartup - t0) * 1000f:0} ms (sea {level:0.0} m)");
            return _base;
        }

        void OnDestroy()
        {
            if (_base != null) Destroy(_base);
        }

        bool Explored(string id)
        {
            if (regions == null) return true;
            foreach (var e in regions.Explored) if (e == id) return true;
            return false;
        }

        /// <summary>Where a clue's search circle sits: near, but not on, the card (a fixed offset per card).</summary>
        public Vector2 ClueCentre(in DiscoverySet.Card c)
        {
            var h = Mathf.Abs(c.id.GetHashCode());
            var a = h % 360 * Mathf.Deg2Rad;
            var d = clueRadius * 0.55f * ((h / 360 % 100) / 100f);
            return c.position + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * d;
        }

        /// <summary>All pins for the world map (filter) or the minimap (nearby activity only).</summary>
        public void CollectPins(List<MapPin> pins, MapFilter filter, bool minimap)
        {
            pins.Clear();
            var me = PlayerPosition;
            var me2 = new Vector2(me.x, me.z);
            var near = minimap ? 450f : float.MaxValue;
            bool Near(Vector2 p) => (p - me2).sqrMagnitude < near * near;
            var racing = races != null && (races.Current == RaceDirector.State.Countdown || races.Current == RaceDirector.State.Running);

            if (filter is MapFilter.All or MapFilter.Places && !racing)
            {
                if (garage != null && Near(garage.entry)) pins.Add(new MapPin { at = garage.entry, icon = Icon.Garage, color = Amber, size = 20f, id = "garage" });
                if (!minimap && travel != null && travel.Points != null)
                    foreach (var p in travel.Points.points)
                        pins.Add(new MapPin { at = p.at, icon = p.icon, color = travel.Unlocked(p) ? Paper : new Color(1f, 1f, 1f, 0.35f), size = 22f, id = "travel:" + p.id });
                if (driftZones != null)
                    foreach (var z in driftZones.zones)
                        if (Near(z.center)) pins.Add(new MapPin { at = z.center, icon = Icon.Drift, color = Sakura, size = 18f, id = "drift:" + z.id });
            }
            if (filter is MapFilter.All or MapFilter.Events && races != null && !racing)
                foreach (var (at, index) in races.Markers)
                {
                    var e = races.Set.events[index];
                    var rec = progress != null ? progress.Data.events.Find(x => x.id == e.id) : null;
                    var done = rec != null && rec.bestTier >= 3;
                    var p = new Vector2(at.x, at.z);
                    if (minimap && (done || !Near(p))) continue;
                    pins.Add(new MapPin { at = p, icon = e.road == "needle-circuit" ? Icon.Circuit : Icon.Flag, color = done ? new Color(1f, 1f, 1f, 0.5f) : Amber, size = 22f, id = "event:" + index });
                }
            if (filter is MapFilter.All or MapFilter.Discoveries && discoveries != null && discoveries.Set != null)
            {
                var found = discoveries.Found;
                for (var i = 0; i < discoveries.Set.cards.Length; i++)
                {
                    var c = discoveries.Set.cards[i];
                    var known = false;
                    foreach (var f in found) if (f == c.id) { known = true; break; }
                    if (known)
                    {
                        if (!minimap) pins.Add(new MapPin { at = c.position, icon = Icon.Diamond, color = Sakura, size = 16f, id = "card:" + i });
                    }
                    else if (Explored(c.region) && !minimap)
                        pins.Add(new MapPin { at = ClueCentre(c), icon = Icon.Clue, color = Sakura, size = 18f, id = "clue:" + i });
                }
            }

            if (racing && races.Track != null)
            {
                // The route's next checkpoints and the rivals (ASTRA: only the selected route and active rivals while racing).
                RaceDirector.Entrant mine = null;
                foreach (var x in races.Entrants) if (x.isPlayer) mine = x;
                if (mine != null)
                    for (var k = mine.progress.Passed; k < Mathf.Min(mine.progress.Passed + 3, mine.progress.TotalCheckpoints); k++)
                    {
                        var cp = mine.progress.CheckpointPoint(k);
                        pins.Add(new MapPin { at = new Vector2(cp.x, cp.z), icon = Icon.Flag, color = k == mine.progress.Passed ? Nitro : new Color(0.4f, 0.84f, 0.96f, 0.45f), size = k == mine.progress.Passed ? 20f : 14f });
                    }
                foreach (var e in races.Entrants)
                    if (!e.isPlayer && e.car != null)
                        pins.Add(new MapPin { at = new Vector2(e.car.transform.position.x, e.car.transform.position.z), icon = Icon.Car, color = Nitro, size = 14f, heading = e.car.transform.eulerAngles.y });
            }

            if (Waypoint.HasValue) pins.Add(new MapPin { at = Waypoint.Value, icon = Icon.Flag, color = Nitro, size = 22f, id = "waypoint" });
            // The parked car when on foot, then the player arrow on top.
            if (!Driving && player != null && player.Car != null)
            {
                var c = player.Car.transform;
                pins.Add(new MapPin { at = new Vector2(c.position.x, c.position.z), icon = Icon.Car, color = Amber, size = 16f, heading = c.eulerAngles.y, id = "car" });
            }
            pins.Add(new MapPin { at = me2, icon = Icon.Play, color = Paper, size = minimap ? 18f : 22f, heading = PlayerHeading - 90f, id = "" });
        }
    }
}
