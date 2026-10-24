using UnityEngine;

namespace JapanMap.Gameplay.Map
{
    /// <summary>How the car drives itself to the waypoint (D49): pace, lane, traffic, takeover, arrival, recovery.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Auto Drive Settings", fileName = "AutoDriveSettings")]
    public sealed class AutoDriveSettings : ScriptableObject
    {
        [Header("Pace")]
        [Tooltip("Top speed on open road, km/h: brisk, never a race.")]
        public float maxSpeedKmh = 95f;
        [Tooltip("Share of the car's grip used in bends (PathFollower).")]
        public float gripShare = 0.5f;
        [Tooltip("Braking for bends and the stop at the waypoint, m/s².")]
        public float braking = 5f;
        [Tooltip("Shortest look-ahead, m: short enough for crossings (8 m cut the corners onto the verge).")]
        public float lookAheadMin = 4.5f;
        public float lookAheadSeconds = 0.5f;

        [Header("Lane")]
        [Tooltip("Lane centre from the road centre, share of the road width. Japan drives on the left.")]
        public float laneShare = 0.25f;
        [Tooltip("Roads narrower than this are driven in the middle, m.")]
        public float minLaneWidth = 6f;
        [Tooltip("The lane offset shrinks from this turn (degrees over ±12 m) and is gone at cornerFull: tight corners in the middle.")]
        public float cornerStart = 20f;
        public float cornerFull = 60f;
        [Tooltip("Crossings: the lane offset is gone within this of one (m); at a crossing with a height step beside it (an embankment) the car is at crossingKmh from half of it.")]
        public float crossingReach = 18f;
        public float crossingKmh = 50f;
        [Tooltip("Points of the planned route are re-laid this far apart and smoothed, m.")]
        [Min(0.5f)] // 0 would never advance the re-laying loop
        public float spacing = 3f;

        [Header("Traffic")]
        [Tooltip("Gap kept to anything ahead: base m + s × speed.")]
        public float gapBase = 5f;
        public float gapSeconds = 1.1f;
        [Tooltip("Waiting behind something this long, s, then it pulls out to pass.")]
        public float passAfter = 2.5f;

        [Header("Takeover")]
        [Tooltip("Steering beyond this (−1…1) hands control back at once.")]
        public float takeoverSteer = 0.2f;
        [Tooltip("Throttle or brake beyond this hands control back at once.")]
        public float takeoverPedal = 0.25f;

        [Header("Arrival and recovery")]
        [Tooltip("Within this of the waypoint and nearly stopped: arrived, m.")]
        public float arriveRadius = 12f;
        [Tooltip("The cinematic camera holds this long after the car stopped at the waypoint, s.")]
        public float arriveHold = 1.2f;
        [Tooltip("Off the route this far for replanSeconds: plan again from here, m.")]
        public float offRoute = 14f;
        public float replanSeconds = 1.5f;
        [Tooltip("Less than 3 m of progress in this long: put the car back on the route ahead, s.")]
        public float stuckSeconds = 8f;

        [Header("Look")]
        [Tooltip("Letterbox bar height, share of the screen height (0.12 ≈ 2.39:1 on 16:9).")]
        public float letterbox = 0.11f;
        [Tooltip("Bars slide in/out in this long, s.")]
        public float letterboxSeconds = 0.6f;
    }
}
