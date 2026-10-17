using UnityEngine;

namespace JapanMap.Gameplay.Stunts
{
    /// <summary>
    /// Stunt scoring rules from legacy ASTRA_PLAN.md §5 ("In Stunt mode, a ground spin needs ≥ 35 km/h …").
    /// Jump distance points are ours (ASTRA scores spins only); they make a plain ramp jump worth doing.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Stunt Settings")]
    public sealed class StuntSettings : ScriptableObject
    {
        [Header("Ground spins (Stunt mode only)")]
        [Tooltip("Speed needed when the spin starts, km/h (ASTRA: 35).")]
        public float spinMinKmh = 35f;
        [Tooltip("Yaw rate that starts / ends a spin, rad/s.")]
        public float spinStartRate = 1.6f;
        public float spinEndRate = 0.6f;
        [Tooltip("ASTRA: a 180 ends at 150–210° and ≥ 20 km/h, 300 points.")]
        public Vector2 range180 = new(150f, 210f);
        public float end180Kmh = 20f;
        public int points180 = 300;
        [Tooltip("ASTRA: a 360 ends at 330–390° keeping ≥ 25% of the entry speed, 600 points.")]
        public Vector2 range360 = new(330f, 390f);
        [Range(0f, 1f)] public float keep360 = 0.25f;
        public int points360 = 600;

        [Header("Air")]
        [Tooltip("Air time below this is a bump, not a jump, s.")]
        public float minAirtime = 0.5f;
        [Tooltip("Points per metre of jump distance (ours).")]
        public float pointsPerMetre = 10f;
        [Tooltip("ASTRA: airborne 360, 800 points. An air 180 pays this (ours).")]
        public int pointsAir360 = 800;
        public int pointsAir180 = 300;
        [Tooltip("A full barrel roll in the air (ours; the intro teaches it).")]
        public int pointsRoll = 700;
        [Tooltip("A full flip (nose over) in the air.")]
        public int pointsFlip = 900;
        [Tooltip("A corkscrew (roll and spin at once).")]
        public int pointsCorkscrew = 1200;
        [Tooltip("Two or more tricks in one jump: points × this.")]
        public float comboBonus = 1.5f;
        [Tooltip("Turned this much about the car's long / cross axis counts as one full roll / flip, degrees.")]
        public float fullTurn = 300f;
        [Tooltip("Wheels down (three of four: rough grass) this long before a landing counts, s (ASTRA: 0.25).")]
        public float settle = 0.25f;
        [Tooltip("Landing must be within this angle of the travel direction, degrees (ASTRA: 45).")]
        public float landingMaxAngle = 45f;
        [Tooltip("No body hit for this long after touchdown, s (ASTRA: 0.5).")]
        public float cleanAfter = 0.5f;

        [Header("Repeats")]
        [Tooltip("Same trick at the same ramp right again pays this share (ASTRA: 50%)…")]
        [Range(0f, 1f)] public float repeatShare = 0.5f;
        [Tooltip("…until the player has driven this far or used another ramp, m (ASTRA: 200).")]
        public float freshDistance = 200f;
    }
}
