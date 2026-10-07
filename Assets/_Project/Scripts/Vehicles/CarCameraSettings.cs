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

        [Header("Look and zoom")]
        [Tooltip("Orbit speed of the right stick, rad/s.")]
        public float orbitSpeed = 2.4f;
        [Tooltip("Rate at which the orbit returns behind the car, 1/s.")]
        public float recenterRate = 0.8f;
        public float zoomMin = 0.42f;
        public float zoomMax = 2.4f;
        [Tooltip("Zoom change per mouse wheel notch.")]
        public float zoomStep = 0.1f;

        [Header("Cockpit")]
        public float cockpitFov = 62f;
        public float cockpitFovBoost = 2f;
        public float cockpitNear = 0.1f;
        [Tooltip("Look down from the eye line, rad.")]
        public float cockpitLookPitch = -0.12f;
        [Tooltip("Share of the drift slip the head turns into, 0…1.")]
        public float cockpitDriftLook = 0.65f;
    }
}
