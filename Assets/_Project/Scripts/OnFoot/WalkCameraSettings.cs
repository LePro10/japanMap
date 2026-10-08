using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>Third-person camera on foot. Defaults from legacy walker.config.ts WALK_CAMERA.</summary>
    [CreateAssetMenu(menuName = "JapanMap/OnFoot/Walk Camera Settings", fileName = "WalkCameraSettings")]
    public sealed class WalkCameraSettings : ScriptableObject
    {
        [Tooltip("Distance behind the walker, m. Closer than the car: the walker is 1.7 m, the car 4.2 m.")]
        public float distance = 4.1f;
        [Tooltip("Camera height above the feet at level pitch, m.")]
        public float height = 1.55f;
        [Tooltip("Look target above the feet, m.")]
        public float targetHeight = 1.28f;
        [Tooltip("Mouse look, degrees per pixel (legacy 0.0026 rad).")]
        public float mouseSensitivity = 0.15f;
        [Tooltip("Stick look, degrees per second.")]
        public float stickSpeed = 150f;
        [Tooltip("Lowest pitch, degrees (negative = looking down). Legacy -0.85 rad.")]
        public float pitchMin = -48f;
        [Tooltip("Highest pitch, degrees. Legacy 0.45 rad.")]
        public float pitchMax = 26f;
        [Tooltip("Start pitch, degrees: slightly down onto the walker.")]
        public float pitchStart = -10f;
        [Tooltip("Follow damping, s (legacy positionRate 9/s).")]
        public float damping = 0.11f;
        public float fov = 58f;
        [Tooltip("Near plane on foot, m: keeps the walker in front of the clip at walls.")]
        public float near = 0.15f;
        [Tooltip("Camera sphere radius against walls, m.")]
        public float collisionRadius = 0.2f;
        [Tooltip("Head bob at walk speed, m. 2 cm — the horizon stays calm.")]
        public float bob = 0.02f;
        [Tooltip("Bob phase per metre walked, rad (one nod per 0.75 m step).")]
        public float bobFreq = 8.4f;
        [Tooltip("Camera drop while sliding, m.")]
        public float slideDip = 0.38f;
        public float zoomMin = 0.5f;
        public float zoomMax = 2.2f;
        [Tooltip("Zoom change per mouse wheel notch.")]
        public float zoomStep = 0.1f;
    }
}
