using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// The player on foot: body, gait, jump, slide, and the distances to the car.
    /// Defaults from legacy walker.config.ts WALKER / WALK_* (numbers measured there in tools/bench/walker.mts).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/OnFoot/Walker Settings", fileName = "WalkerSettings")]
    public sealed class WalkerSettings : ScriptableObject
    {
        [Header("Body (legacy WALKER.height/radius)")]
        [Tooltip("Standing height, m. 1.72 — not a giant next to a 1.48 m coupé.")]
        public float height = 1.72f;
        [Tooltip("Capsule radius, m. Passes a door gap, not a guard rail.")]
        public float radius = 0.24f;
        [Tooltip("Highest step taken without jumping, m (kerb 0.15).")]
        public float stepHeight = 0.38f;
        [Tooltip("Steepest walkable slope, degrees. Legacy minNy 0.55 ≈ 57°: a person climbs what a car can't.")]
        public float slopeLimit = 56.6f;

        [Header("Gait (legacy walkSpeed/runSpeed/accel/brake)")]
        [Tooltip("Walk, m/s. A brisk pace — 1.4 m/s would make the 9 km² map a long hike.")]
        public float walkSpeed = 4.4f;
        [Tooltip("Run (Shift), m/s.")]
        public float runSpeed = 7.5f;
        [Tooltip("Ground acceleration, 1/s blend rate: standstill to walk in ~0.24 s.")]
        public float accel = 18f;
        [Tooltip("Coast-down on the ground, 1/s.")]
        public float brake = 12f;
        [Tooltip("Air steering as share of ground acceleration.")]
        public float airControl = 0.28f;
        [Tooltip("Turn rate of the body towards the move direction, 1/s.")]
        public float turnRate = 10f;

        [Header("Jump (legacy jumpSpeed/coyote/jumpBuffer)")]
        [Tooltip("Take-off speed, m/s. v²/2g = 1.08 m apex.")]
        public float jumpSpeed = 4.6f;
        public float gravity = 9.81f;
        [Tooltip("Jump still allowed this long after leaving an edge, s.")]
        public float coyote = 0.1f;
        [Tooltip("A jump pressed this long before landing is kept, s.")]
        public float jumpBuffer = 0.1f;

        [Header("Slide (legacy slide*, Fortnite-like: momentum, not a second walk)")]
        [Tooltip("Minimum speed on flat ground to start a slide, m/s (between walk and run).")]
        public float slideEnterSpeed = 5.8f;
        [Tooltip("Kick when dropping into the slide, m/s. Legacy measured run 7.50 → 8.58.")]
        public float slideBoost = 1.15f;
        [Tooltip("Cap, so a long hill is no second car, m/s.")]
        public float slideMaxSpeed = 11.5f;
        [Tooltip("Friction on flat ground, m/s². Legacy measured 1.20 s from run to stop.")]
        public float slideFriction = 4.2f;
        [Tooltip("Share of friction a downhill takes away.")]
        public float slideHillRelief = 0.88f;
        [Tooltip("Extra brake uphill, m/s².")]
        public float slideUphillBrake = 8f;
        [Tooltip("Steering while sliding, 1/s: bends the path, sets no target speed.")]
        public float slideSteer = 3.4f;
        [Tooltip("Shortest slide, s — a tap is a slide, not a one-frame duck.")]
        public float slideMinTime = 0.22f;
        [Tooltip("Below this the walker stands up again, m/s.")]
        public float slideExitSpeed = 3.6f;
        [Tooltip("Capsule height while sliding, share of standing height.")]
        public float slideCrouch = 0.62f;

        [Header("Car (legacy WALK_ALIGHT_* / WALK_BOARD_RANGE)")]
        [Tooltip("Side distance from the car centre when getting out, m: half body + shoulder + a hand.")]
        public float alightGap = 1.55f;
        [Tooltip("Getting out only below this speed, km/h (PLAN: 5).")]
        public float alightMaxKmh = 5f;
        [Tooltip("Getting in only below this car speed, km/h (PLAN: standing; 1 km/h for a settling suspension).")]
        public float boardMaxKmh = 1f;
        [Tooltip("This close to the car to get in, m.")]
        public float boardRange = 4.2f;
        [Tooltip("Extra metres the prompt holds once shown, against flicker at the edge.")]
        public float promptSlack = 0.8f;

        [Header("Call the car (legacy callPlayerCar.ts)")]
        [Tooltip("Ring distances searched for a parking spot, m.")]
        public float[] callRings = { 8f, 14f, 22f, 32f };
        [Tooltip("Directions per ring.")]
        public int callDirections = 12;
        [Tooltip("Farthest a spot may be from the player, m.")]
        public float callMaxDistance = 45f;
        [Tooltip("Closer than this the car counts as already here, m.")]
        public float callAlreadyHere = 6f;
        [Tooltip("Search radius from a ring point to the nearest road, m.")]
        public float callRoadSnap = 12f;
        [Tooltip("Largest height difference across the car's footprint, m.")]
        public float callMaxStep = 0.7f;
    }
}
