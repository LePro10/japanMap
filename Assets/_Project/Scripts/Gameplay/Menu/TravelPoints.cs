using System;
using JapanMap.UI;
using UnityEngine;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Free travel destinations (ASTRA §10): Commons, Rotor Court, Needle pits, Cinder Lookout, Temple forecourt,
    /// Stillwater Village, Harbour entrance (Lighthouse turnout once Longshore has a road) — each after its region is discovered (Commons
    /// always). The first point is Sakura Commons. Positions snap to the nearest road at arrival.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Travel Points")]
    public sealed class TravelPoints : ScriptableObject
    {
        [Serializable]
        public struct Point
        {
            public string id;
            public string title;
            [Tooltip("Region id that must be explored first; empty = always.")]
            public string region;
            [Tooltip("Unity x, z.")]
            public Vector2 at;
            public float heading;
            public Icon icon;
        }

        public Point[] points = Array.Empty<Point>();
    }
}
