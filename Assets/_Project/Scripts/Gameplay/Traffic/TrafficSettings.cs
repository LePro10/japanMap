using UnityEngine;

namespace JapanMap.Gameplay.Traffic
{
    /// <summary>
    /// A little city traffic (PLAN Phase 6.3: "wenige NPC-Autos in der Stadt, wegschiebbar"). The
    /// prototype had only six boxes on one loop (CityCrowd TRAFFIC = 6), later switched off; these
    /// numbers are chosen, not ported.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Life/Traffic Settings", fileName = "TrafficSettings")]
    public sealed class TrafficSettings : ScriptableObject
    {
        [Tooltip("Cars around the player on High / Medium / Low. Prototype: 6.")]
        public int countHigh = 6;
        [Tooltip("Medium is the Intel-iGPU tier (D38): between High and Low.")]
        public int countMedium = 4;
        public int countLow = 3;
        [Tooltip("Road types traffic uses (roads.json type).")]
        public string[] roadTypes = { "city" };
        [Tooltip("Roads of the right type that still get no traffic: commons-drive is the dead end into the Sakura court (cars turned helplessly at its end).")]
        public string[] excludeRoads = { "commons-drive" };
        [Tooltip("Narrower roads get no traffic, m: two lanes of 1.9 m cars need room (takeshita, 7 m, jammed a car).")]
        public float minRoadWidth = 8f;
        [Tooltip("Cruising speed, km/h (city streets).")]
        public float maxSpeedKmh = 40f;
        [Tooltip("Shortest look-ahead of the lane follower, m (PathFollower default 7 cut corners onto the pavement).")]
        public float lookAheadMin = 4f;
        [Tooltip("Lane centre from the road centre, share of the road width. Japan drives on the left.")]
        public float laneShare = 0.25f;
        [Tooltip("New cars appear this far from the player, m (min, max).")]
        public Vector2 spawnRange = new(70f, 200f);
        [Tooltip("Farther than this, a car is taken away and placed anew, m.")]
        public float despawn = 260f;
        [Tooltip("Brake for anything ahead closer than base + seconds × speed, m.")]
        public float gapBase = 5f;
        public float gapSeconds = 1.2f;
        [Tooltip("Stuck or knocked off the road this long → placed anew (out of sight), s.")]
        public float stuckSeconds = 5f;
        [Tooltip("Only cars this close to the player cast shadows, m (draw calls per cascade; sakura-hof sat at the High budget).")]
        public float shadowDistance = 40f;
    }
}
