using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>Chase and cockpit camera numbers. Defaults from legacy vehicle.config.ts CHASE_CAMERA / COCKPIT_CAMERA.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Car Camera Settings", fileName = "CarCameraSettings")]
    public sealed class CarCameraSettings : ScriptableObject
    {
        [Header("Chase")]
        [Tooltip("Distance behind the car, m.")]
        public float distance = 6.4f;
        [Tooltip("Extra distance at fovSpeed, m.")]
        public float distanceFast = 1.6f;
        public float height = 2.35f;
        [Tooltip("Look-at point above the car's origin, m.")]
        public float targetHeight = 1f;
        [Tooltip("How much the camera follows the velocity instead of the nose (drift shows the car's side).")]
        public float velocityBlend = 0.55f;
        [Tooltip("Speed (m/s) from which the velocity blend is full.")]
        public float velocityBlendSpeed = 6f;
        [Tooltip("Heading follow rate, 1/s.")]
        public float headingRate = 7f;
        [Tooltip("Position damping of the Cinemachine follow, s.")]
        public float positionDamping = 0.12f;
        [Tooltip("Look-ahead along the velocity per m/s, m.")]
        public float lookAhead = 0.05f;
        public float lookAheadMax = 1.1f;

        [Header("Field of view")]
        public float fov = 62f;
        public float fovFast = 82f;
        [Tooltip("Speed (m/s) at which fovFast is reached.")]
        public float fovSpeed = 45f;
        public float fovBoost = 9f;
        public float fovRate = 3.5f;

        [Header("Speed feel and nitro burst")]
        [Tooltip("FOV punch at the burst kick, degrees (on top of the boost FOV).")]
        public float burstFov = 14f;
        [Tooltip("The camera falls this far behind at the burst kick, m — the car shoots away from it.")]
        public float burstPullBack = 2.4f;
        [Tooltip("Shake at the burst kick, m of look-target jitter.")]
        public float burstShake = 0.18f;
        [Tooltip("Road buzz at top speed, m of look-target jitter (0 = still camera).")]
        public float speedShake = 0.035f;
        [Tooltip("Speed (m/s) from which the buzz starts and at which it is full.")]
        public Vector2 speedShakeRange = new(22f, 55f);
        [Header("Look and zoom")]
        [Tooltip("Orbit speed of the right stick, rad/s.")]
        public float orbitSpeed = 2.4f;
        [Tooltip("Rate at which the orbit returns behind the car, 1/s.")]
        public float recenterRate = 0.8f;
        public float zoomMin = 0.42f;
        public float zoomMax = 2.4f;
        [Tooltip("Zoom change per mouse wheel notch.")]
        public float zoomStep = 0.1f;

        [Header("Cinematic (auto-drive, D49)")]
        [Tooltip("Shot list of the cinematic camera while the car drives itself; none = auto-drive keeps the chase camera.")]
        public CinematicCameraSettings cinematic;

        [Header("Cockpit seat (D51)")]
        [Tooltip("Eye, field of view, wheel and instruments per car.")]
        public CockpitSettings cockpits;
        [Tooltip("Narrowest horizontal view in the cockpit, degrees: a phone held upright widens the vertical view to keep it.")]
        public float cockpitMinHorizontalFov = 74f;
        public float cockpitFovBoost = 2f;
        [Tooltip("Cockpit: the head is pressed back at the burst, degrees of pitch up.")]
        public float cockpitBurstPitch = 2.5f;

        [Header("Cockpit head: look (D51)")]
        [Tooltip("Share of the slide angle the head turns into (0 = eyes on the nose, 1 = eyes on the travel).")]
        public float headDriftLook = 0.8f;
        [Tooltip("The head turns ahead of the yaw: seconds of yaw rate.")]
        public float headYawLead = 0.12f;
        [Tooltip("Degrees of head turn per degree of front-wheel angle (looking into the bend).")]
        public float headSteerLook = 0.35f;
        public float headLookMax = 42f;
        [Tooltip("Head turn response, rad/s (critically damped).")]
        public float headLookRate = 5.5f;

        [Header("Cockpit head: g-forces (D51)")]
        [Tooltip("Response of the lean to the forces, 1/s.")]
        public float headLeanRate = 6f;
        [Tooltip("Head roll per g sideways, degrees.")]
        public float headRoll = 3.5f;
        [Tooltip("Head pitch per g along the car (back under power, down on the brakes), degrees.")]
        public float headSurge = 2.2f;
        [Tooltip("Head shift per g, m (out of the bend, back under power).")]
        public float headShift = 0.035f;
        public float headSink = 0.012f;

        [Header("Cockpit head: kicks and buzz (D51, scaled by the Camera shake option)")]
        [Tooltip("Pitch kick of a gear change, degrees.")]
        public float shiftKick = 0.9f;
        [Tooltip("Pitch kick per m/s of touchdown speed, degrees; and its cap.")]
        public float landingKick = 0.45f;
        public float landingKickMax = 4f;
        [Tooltip("Kick per m/s of crash Δv, degrees; and its cap.")]
        public float impactKick = 0.45f;
        public float impactKickMax = 6f;
        [Tooltip("Suspension speed (sum of the wheels, m/s) from which a bump or kerb kicks.")]
        public float bumpFrom = 0.9f;
        public float bumpKick = 0.9f;
        public float bumpKickMax = 1.6f;
        [Tooltip("Spring of the kicks: frequency rad/s, damping ratio.")]
        public float kickFrequency = 16f;
        public float kickDamping = 0.38f;
        [Tooltip("Road buzz at full speed, degrees.")]
        public float buzz = 0.1f;
        [Tooltip("Speed (m/s) at which the buzz starts and is full.")]
        public Vector2 buzzSpeed = new(6f, 55f);
        [Tooltip("Buzz factor on gravel and open ground.")]
        public float buzzGravel = 2.6f;
        public float buzzTerrain = 3.6f;
        [Tooltip("Tyre shudder, degrees: drifting, wheelspin, the nitro burst.")]
        public float buzzDrift = 0.22f;
        public float buzzWheelspin = 0.14f;
        public float buzzBurst = 0.3f;
        [Tooltip("Buzz frequency, Hz-ish (Perlin steps per second).")]
        public float buzzFrequency = 24f;

        [Header("Pad rumble (D51, Vibration option)")]
        [Tooltip("Motor speeds at full signal: low motor (hits, landings, kerbs), high motor (tyres, ground).")]
        public float rumbleLow = 0.85f;
        public float rumbleHigh = 0.35f;
        [Tooltip("How fast a hit's rumble fades, 1/s.")]
        public float rumbleFade = 7f;
    }
}
