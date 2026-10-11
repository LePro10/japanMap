using System;
using UnityEngine;

namespace JapanMap.Gameplay.Stunts
{
    /// <summary>
    /// The six activity ramps of ASTRA_PLAN.md §4 ("Ramps belong to activities"): a kicker, an optional
    /// table and down-slope, then a landing pad — built as one rigid body on a foundation (the
    /// prototype's lesson: ramps draped onto the terrain did not describe the surface the car drove).
    /// Positions in Unity metres; the start is the foot of the kicker, yaw the launch direction.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Ramp Set")]
    public sealed class RampSet : ScriptableObject
    {
        [Serializable]
        public struct Ramp
        {
            public string id;
            public string title;
            public Vector2 start;
            public float yaw;
            public float width;
            [Tooltip("Lip height above the base line, m.")]
            public float height;
            public float riseLength;
            [Tooltip("Kicker curve: 0 straight, 1 fully curved; the launch slope is (1 + kick) · height / length.")]
            [Range(0f, 1f)] public float kick;
            [Tooltip("Flat top after the lip (a table: undershooting lands on it), m.")]
            public float tableLength;
            [Tooltip("Descending landing from table height to the base, m (0: none).")]
            public float downLength;
            public float landingLength;
            public float landingWidth;
            [Tooltip("Shown on approach, ASTRA's recommended speed.")]
            public string speedHint;
            [Tooltip("Kept free of trees before the foot / after it, m (0: the default 80 m run-up and the ramp's length). " +
                     "The intro's jump needs 130 m of run-up and ~90 m of flight.")]
            public float clearBefore, clearAfter;
            [Header("Written by the builder")]
            [Tooltip("Base line height at the start and its rise per metre along the ramp (fitted to the terrain).")]
            public float baseY;
            public float baseSlope;
            [TextArea] public string note;

            public Vector3 Forward => Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
            public float Length => riseLength + tableLength + downLength + landingLength;

            /// <summary>Lip (launch point) in world space.</summary>
            public Vector3 Lip => new Vector3(start.x, 0f, start.y) + Forward * riseLength + Vector3.up * (baseY + baseSlope * riseLength + height);
        }

        public Ramp[] ramps = Array.Empty<Ramp>();

        [Header("Hint and scoring")]
        [Tooltip("The speed hint shows within this distance before the kicker, m.")]
        public float hintDistance = 60f;
        [Tooltip("A jump counts for a ramp if it took off within this distance of its lip, m.")]
        public float lipReach = 8f;

        /// <summary>
        /// Index of the ramp a take-off at <paramref name="p"/> belongs to: on its body (kicker, table,
        /// down-slope — undershooting a table and hopping off its end still counts) or within reach of
        /// its lip; else −1.
        /// </summary>
        public int AtLip(Vector3 p)
        {
            for (var i = 0; i < ramps.Length; i++)
            {
                var r = ramps[i];
                var l = r.Lip;
                if (new Vector2(p.x - l.x, p.z - l.z).sqrMagnitude < lipReach * lipReach) return i;
                var d = p - new Vector3(r.start.x, p.y, r.start.y);
                var along = Vector3.Dot(d, r.Forward);
                var side = Vector3.Dot(d, new Vector3(r.Forward.z, 0f, -r.Forward.x));
                if (along >= 0f && along <= r.riseLength + r.tableLength + r.downLength + 2f && Mathf.Abs(side) <= r.width * 0.5f + 1f) return i;
            }
            return -1;
        }
    }
}
