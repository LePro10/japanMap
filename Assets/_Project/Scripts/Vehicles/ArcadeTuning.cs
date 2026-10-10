using System;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Fleet-wide constants of the arcade model (surfaces, drift gate, stunt, air control, nitro
    /// earning). Defaults are the legacy values from arcade.config.ts, so CreateInstance() in a test
    /// gives exactly the prototype's model. The asset lives in Data/Vehicles/ArcadeTuning.asset.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Arcade Tuning", fileName = "ArcadeTuning")]
    public sealed class ArcadeTuning : ScriptableObject
    {
        public const float Gravity = 9.81f;

        [Tooltip("Shift strategy of the heard/shown gearbox, all cars (ASTRA §6; acts on no force).")]
        public ShiftStrategy shift = ShiftStrategy.Default;

        [Serializable]
        public struct PerSurface
        {
            public float asphalt, gravel, terrain, water;

            public float this[Surface s] => s switch
            {
                Surface.Asphalt => asphalt,
                Surface.Gravel => gravel,
                Surface.Terrain => terrain,
                _ => water,
            };
        }

        [Header("Surfaces (legacy ARCADE_SURFACE / ARCADE_SURFACE_DRAG)")]
        public PerSurface surfaceGrip = new() { asphalt = 1f, gravel = 1f, terrain = 0.65f, water = 0.75f };
        [Tooltip("Speed-proportional ground drag, 1/s.")]
        public PerSurface surfaceDrag = new() { asphalt = 0f, gravel = 0.09f, terrain = 0.12f, water = 0.55f };
        [Tooltip("Time constant of the grip blend between surfaces, s.")]
        public float gripBlend = 0.25f;
        [Tooltip("Water depth (m) at which asphalt aquaplaning is full.")]
        public float aquaplaneDepth = 0.35f;
        [Tooltip("Grip lost at full aquaplaning.")]
        public float aquaplaneLoss = 0.45f;

        [Header("Slopes (legacy supportPlane.ts)")]
        [Tooltip("Ground normal y from which a slope carries full wheel load (0.82 ≙ 35°).")]
        public float steepFull = 0.82f;
        [Tooltip("Ground normal y at which a slope carries nothing — a wall (0.64 ≙ 50°).")]
        public float steepNone = 0.64f;

        [Header("Physics body")]
        [Tooltip("Centre of mass height as a share of the chassis CG height. Lower = harder to roll over; " +
                 "the visible body roll comes from the visuals, as in the prototype.")]
        public float physicsComHeightShare = 0.4f;
        [Tooltip("Collision detection of the car body. Measured on the ring sag at 118 km/h: Speculative made ghost " +
                 "contacts at road triangle edges (118 → 40 km/h), Dynamic and Discrete passed at 115.")]
        public CollisionDetectionMode collisionMode = CollisionDetectionMode.ContinuousDynamic;
        [Tooltip("Contact offset of the body box, m: contacts start this far before touching, so a hard landing " +
                 "(a 21 cm step per physics tick from 6 m) is caught before the body is in the ground.")]
        public float bodyContactOffset = 0.25f;
        [Tooltip("Collision box bottom this far above the body's ride clearance, m (less nose-digging on dips).")]
        public float bodyUnderLift = 0.1f;
        [Tooltip("Collision box length as a share of the body length (bumper overhangs stay out of the ground).")]
        public float bodyLengthShare = 0.88f;

        [Header("Off-road drive (legacy OFFROAD_DRIVE, ARCADE_CRAWL)")]
        [Tooltip("Below this speed (m/s) loose ground keeps a share of asphalt traction.")]
        public float driveRetainSpeed = 50f / 3.6f;
        public float gradeAssist = 0.35f;
        public float capableGradeAssist = 0.75f;
        public float capableDragReduction = 0.4f;
        public float offroadReverseForce = 0.65f;
        public float assistFadeStart = 50f / 3.6f;
        public float assistFadeEnd = 80f / 3.6f;
        public float crawlSpeed = 8f;
        public float crawlExtra = 0.35f;

        [Header("Prepared circuit (legacy CIRCUIT_PREP)")]
        public float circuitLateral = 1.5f;
        public float circuitBrake = 1.2f;

        [Header("Drift gate (legacy DRIFT_GATE)")]
        [Tooltip("Below this speed (m/s) there is no drift.")]
        public float driftMinSpeed = 6f;
        [Tooltip("Seconds after a handbrake tap during which steering still opens a drift.")]
        public float driftArmWindow = 0.32f;
        public float driftEnterSteer = 0.22f;
        public float driftSustain = 0.12f;
        [Tooltip("Slip angle from which a drift scores, rad.")]
        public float driftScoreAngle = 0.21f;
        [Tooltip("Slip angle beyond which the car counts as spun, rad.")]
        public float driftMaxAngle = 1.4f;
        [Tooltip("Floor for the grip cap ω ≤ a/v, m/s.")]
        public float yawCapSpeed = 4f;

        [Header("Lift-off oversteer (legacy P26)")]
        public float liftMinSteer = 0.15f;
        public float liftOffThrottle = 0.15f;
        [Tooltip("Seconds the throttle must be closed before the impulse fires.")]
        public float liftOnset = 0.12f;
        public float liftRearmThrottle = 0.5f;
        public float liftDecay = 2.2f;

        [Header("Standstill")]
        [Tooltip("Below this speed (m/s) static friction holds the car on a slope.")]
        public float staticHoldSpeed = 0.9f;
        [Tooltip("Throttle ramp, 1/s.")]
        public float throttleRate = 9f;
        [Tooltip("Reverse gearing on asphalt (share of launch force).")]
        public float reverseGearing = 0.35f;
        [Tooltip("Max reverse speed, m/s.")]
        public float reverseMaxSpeed = 12f;
        [Tooltip("Handbrake deceleration in g (normal mode).")]
        public float handbrakeBrake = 0.36f;
        [Tooltip("Drive kept with handbrake pulled (normal mode).")]
        public float handbrakeDrive = 0.2f;
        [Tooltip("Traction limit in g per unit grip.")]
        public float tractionG = 1.35f;

        [Header("Air control (legacy AIR_CONTROL)")]
        public float airYaw = 2.2f;
        public float airPitch = 2.8f;
        public float airDamping = 1.4f;
        [Tooltip("In the air, pitch and roll turn towards the ground below at this rate per rad of misalignment, 1/s " +
                 "(legacy Vehicle.#updateAttitude: the car lands flat instead of nose first).")]
        public float airLevelRate = 2.5f;
        [Tooltip("How fast pitch/roll spin follows that level target, 1/s. 0 = free tumbling.")]
        public float airAttitudeResponse = 6f;

        [Header("Nitro earning (legacy BOOST_EARN)")]
        public float boostEarnDrift = 0.34f;
        public float boostEarnAir = 0.5f;
        public float boostEarnSmash = 0.12f;

        [Header("Stunt mode (legacy STUNT)")]
        public float stuntTapWindow = 0.28f;
        public float stuntEnterRate = 14f;
        public float stuntFall = 8.5f;
        public float stuntExitDump = 2.4f;
        public float stuntExtraAngle = 0.28f;
        public float stuntSpinYaw = 2.85f;
        public float stuntMaxYawRate = 5.2f;
        public float stuntSpinRise = 4.2f;
        public float stuntSpinFall = 5.8f;
        public float stuntSpinFallCounter = 12f;
        public float stuntLatGrip = 0.78f;
        public float stuntSpinLatGrip = 0.55f;
        public float stuntCatch = 0.6f;
        public float stuntCounterCatch = 4.8f;
        public float stuntHandbrakeDrive = 0.72f;
        public float stuntHandbrakeBrake = 0.14f;
        public float stuntAirYaw = 1.65f;
        public float stuntAirPitch = 1.3f;
        public float stuntMinSpeed = 30f / 3.6f;
        public float stuntTrickAngle = Mathf.PI * 2f;
        public float stuntTrickYaw = 5.4f;
        public float stuntTrickYawCap = 6.8f;
        public float stuntAirRoll = 7.2f;
        public float stuntTrickAbort = 5.5f;

        /// <summary>Wheel load a slope still carries, 0…1, smooth between steepNone and steepFull.</summary>
        public float SlopeSupport(float normalY)
        {
            if (normalY >= steepFull) return 1f;
            if (normalY <= steepNone) return 0f;
            var x = (normalY - steepNone) / (steepFull - steepNone);
            return x * x * (3f - 2f * x);
        }

        public bool IsStuntDoubleTap(float previousTapAt, float now) =>
            previousTapAt >= 0f && now - previousTapAt <= stuntTapWindow;
    }
}
