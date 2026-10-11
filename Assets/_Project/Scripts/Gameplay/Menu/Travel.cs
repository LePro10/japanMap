using System;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using JapanMap.World;
using UnityEngine;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Free travel (ASTRA §10 "Travel"): to Sakura Commons always, to the travel points of discovered regions, and
    /// to an event's start (also before its region is discovered — discovery still needs real movement there). Only
    /// on an explicit button; the player arrives in the car on the road, facing along it. Points in
    /// Data/Gameplay/TravelPoints.asset.
    /// </summary>
    public sealed class Travel : MonoBehaviour
    {
        [SerializeField] TravelPoints points;
        [SerializeField] PlayerModeController player;
        [SerializeField] RaceDirector races;
        [SerializeField] RegionWatch regions;
        [SerializeField] RoadNetwork roads;

        public TravelPoints Points => points;
        /// <summary>Last place travelled to (tests).</summary>
        public string Last { get; private set; } = "";
        public event Action<string> Travelled;

        public bool Unlocked(in TravelPoints.Point p) => string.IsNullOrEmpty(p.region) || regions == null || IsExplored(p.region);

        bool IsExplored(string id)
        {
            foreach (var e in regions.Explored) if (e == id) return true;
            return false;
        }

        public void ToCommons()
        {
            if (points != null && points.points.Length > 0) To(points.points[0]);
        }

        public bool To(string id)
        {
            if (points == null) return false;
            foreach (var p in points.points)
                if (p.id == id)
                {
                    if (!Unlocked(p)) return false;
                    To(p);
                    return true;
                }
            return false;
        }

        void To(in TravelPoints.Point p)
        {
            var at = new Vector3(p.at.x, 0f, p.at.y);
            var yaw = p.heading;
            if (roads != null && roads.TryNearest(at, Quaternion.Euler(0f, yaw, 0f) * Vector3.forward, 150f, out var onRoad, out var fwd))
            {
                at = onRoad;
                yaw = Quaternion.LookRotation(fwd).eulerAngles.y;
            }
            Place(at, yaw);
            Last = p.id;
            Travelled?.Invoke(p.id);
        }

        /// <summary>To an event's marker; the card is then one E away.</summary>
        public void ToEvent(int index)
        {
            if (races == null) return;
            foreach (var (at, i) in races.Markers)
                if (i == index)
                {
                    var e = races.Set.events[index];
                    var track = races.TrackOf(e, out var start);
                    var yaw = track != null ? Quaternion.LookRotation(track.TangentAt(start)).eulerAngles.y : 0f;
                    Place(at, yaw);
                    Last = e.id;
                    Travelled?.Invoke(e.id);
                    return;
                }
        }

        void Place(Vector3 at, float yaw)
        {
            if (player == null || player.Car == null) return;
            player.Seat();
            player.Car.Place(at, yaw, fromAbove: 40f);
            // Travel is a break: a midgame ad may cover the arrival while the place streams in (D42).
            Economy.RewardedOffers.Break(null);
        }
    }
}
