using System;
using UnityEngine;

namespace JapanMap.Gameplay.Drift
{
    /// <summary>
    /// Drift zones with a spot bonus (legacy stunt.config.ts DRIFT_ZONES, renamed and moved by
    /// ASTRA_PLAN.md §5). Positions in Unity metres (x, z); a zone is a circle or a turned rectangle.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Drift Zones")]
    public sealed class DriftZoneSet : ScriptableObject
    {
        [Serializable]
        public struct Zone
        {
            public string id;
            public string title;
            public Vector2 center;
            [Tooltip("> 0: circle of this radius; else the rectangle below.")]
            public float radius;
            public Vector2 size;
            [Tooltip("Rectangle heading, degrees.")]
            public float yaw;
            [Tooltip("Where it came from — measured site, legacy value.")]
            [TextArea] public string note;

            public bool Contains(Vector3 p)
            {
                var d = new Vector2(p.x, p.z) - center;
                if (radius > 0f) return d.sqrMagnitude <= radius * radius;
                var r = Quaternion.Euler(0f, 0f, yaw) * d; // rotate into the rectangle's frame
                return Mathf.Abs(r.x) <= size.x * 0.5f && Mathf.Abs(r.y) <= size.y * 0.5f;
            }
        }

        public Zone[] zones = Array.Empty<Zone>();

        public int IndexAt(Vector3 p)
        {
            for (var i = 0; i < zones.Length; i++) if (zones[i].Contains(p)) return i;
            return -1;
        }
    }
}
