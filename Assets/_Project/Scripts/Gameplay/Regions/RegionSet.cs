using System;
using UnityEngine;

namespace JapanMap.Gameplay.Regions
{
    /// <summary>
    /// The eight regions in priority order: the first region whose shape holds a point owns it, the
    /// last one (no shapes) takes the rest — so every point of the map has exactly one region.
    /// From legacy ui/navigationMapRegions.ts regionAt (ASTRA_PLAN.md §3), Unity z = −legacy z.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Region Set")]
    public sealed class RegionSet : ScriptableObject
    {
        [Serializable]
        public struct Box
        {
            public Vector2 min, max; // x, z in Unity metres; min included, max excluded
            public bool Contains(float x, float z) => x >= min.x && x < max.x && z >= min.y && z < max.y;
        }

        [Serializable]
        public struct Region
        {
            public string id;
            public string title;
            public string detail;
            public Color color;
            [Tooltip("Circle owner (radius > 0), e.g. Sakura Commons.")]
            public Vector2 circleCenter;
            public float circleRadius;
            [Tooltip("Owns a point inside any of these boxes…")]
            public Box[] boxes;
            [Tooltip("…unless it is inside one of these.")]
            public Box[] except;
            [Tooltip("Label position on the map (Phase 9), Unity x, z.")]
            public Vector2 labelAt;

            /// <summary>No circle and no boxes: the catch-all.</summary>
            public bool IsRest => circleRadius <= 0f && (boxes == null || boxes.Length == 0);

            public bool Contains(float x, float z)
            {
                if (IsRest) return true;
                if (circleRadius > 0f && (new Vector2(x, z) - circleCenter).sqrMagnitude < circleRadius * circleRadius) return true;
                if (boxes == null) return false;
                var inside = false;
                foreach (var b in boxes) if (b.Contains(x, z)) { inside = true; break; }
                if (!inside) return false;
                if (except != null) foreach (var e in except) if (e.Contains(x, z)) return false;
                return true;
            }
        }

        public Region[] regions = Array.Empty<Region>();

        [Header("Explored")]
        [Tooltip("Seconds on the ground inside the region (legacy EXPLORE_DWELL_S, ASTRA: 1.5 s).")]
        public float dwellSeconds = 1.5f;
        [Tooltip("Metres moved from the point of entry — sitting still is not a visit (legacy EXPLORE_MOVE_M).")]
        public float moveMetres = 4f;

        public int IndexAt(Vector3 p)
        {
            for (var i = 0; i < regions.Length; i++) if (regions[i].Contains(p.x, p.z)) return i;
            return regions.Length - 1;
        }
    }
}
