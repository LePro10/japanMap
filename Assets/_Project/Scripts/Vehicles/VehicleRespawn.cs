using JapanMap.Core;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Puts the car back on the nearest road: on request (R / Y / touch button) and by itself when it
    /// lies on its roof or fell out of the world (legacy DriveSystem.respawn → network.closestPoint, 600 m).
    /// </summary>
    public sealed class VehicleRespawn : MonoBehaviour
    {
        [SerializeField] VehicleController vehicle;
        [Tooltip("Asset implementing IRoadLocator (World/RoadNetwork).")]
        [SerializeField] ScriptableObject roadLocator;
        [SerializeField] DriverInput driver;
        [Tooltip("Search radius for the nearest road, m (legacy 600).")]
        [SerializeField] float searchRadius = 600f;
        [Tooltip("Seconds on the roof (or on the side) at low speed before an automatic respawn.")]
        [SerializeField] float flippedSeconds = 2.5f;
        [Tooltip("Below this height the car fell out of the world.")]
        [SerializeField] float killHeight = -30f;

        float _flipped;

        public event System.Action Respawned;

        public VehicleController Vehicle
        {
            get => vehicle;
            set => vehicle = value;
        }

        public IRoadLocator Locator => roadLocator as IRoadLocator;

        void OnEnable()
        {
            if (driver != null) driver.RespawnPressed += Respawn;
        }

        void OnDisable()
        {
            if (driver != null) driver.RespawnPressed -= Respawn;
        }

        void OnValidate()
        {
            if (roadLocator != null && roadLocator is not IRoadLocator)
            {
                Debug.LogWarning($"{roadLocator.name} is not an IRoadLocator", this);
                roadLocator = null;
            }
        }

        void FixedUpdate()
        {
            if (vehicle == null) return;
            var t = vehicle.transform;
            var lying = t.up.y < 0.3f && vehicle.Telemetry.speed < 3f;
            _flipped = lying ? _flipped + Time.fixedDeltaTime : 0f;
            if (_flipped > flippedSeconds || t.position.y < killHeight) Respawn();
        }

        /// <summary>Nearest road point, facing the road direction closest to the current heading.</summary>
        public void Respawn()
        {
            if (vehicle == null) return;
            _flipped = 0f;
            var t = vehicle.transform;
            var heading = Vector3.ProjectOnPlane(t.forward, Vector3.up);
            if (heading.sqrMagnitude < 1e-4f) heading = Vector3.forward;
            if (Locator != null && Locator.TryNearest(t.position, heading, searchRadius, out var point, out var forward))
                vehicle.Place(point, Mathf.Atan2(forward.x, forward.z) * Mathf.Rad2Deg, fromAbove: 3f);
            else
                vehicle.Place(t.position, Mathf.Atan2(heading.x, heading.z) * Mathf.Rad2Deg, fromAbove: 50f);
            Respawned?.Invoke();
        }
    }
}
