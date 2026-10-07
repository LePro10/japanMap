using System;
using JapanMap.Core;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Builds the player's car from a <see cref="VehicleDefinition"/> and puts it on the road nearest
    /// to the spawn point. Wires input and respawn to it; others (camera, HUD) listen to <see cref="Spawned"/>.
    /// </summary>
    public sealed class PlayerCarSpawner : MonoBehaviour
    {
        [SerializeField] VehicleFleet fleet;
        [Tooltip("Asset implementing IRoadLocator (World/RoadNetwork).")]
        [SerializeField] ScriptableObject roadLocator;
        [SerializeField] DriverInput driver;
        [SerializeField] VehicleRespawn respawn;
        [Tooltip("Car id from the fleet; empty = fleet default.")]
        [SerializeField] string carId = "";
        [Tooltip("Where the game starts (the road nearest to it), Unity coordinates.")]
        [SerializeField] Vector3 spawnPoint;
        [SerializeField] float spawnHeading;

        public VehicleController Current { get; private set; }
        public event Action<VehicleController> Spawned;

        public VehicleFleet Fleet => fleet;

        void Start() => Spawn(string.IsNullOrEmpty(carId) ? fleet.Default : fleet.Get(carId));

        /// <summary>Replace the current car with <paramref name="def"/> at the same spot (or at the spawn point).</summary>
        public VehicleController Spawn(VehicleDefinition def)
        {
            var at = spawnPoint;
            var forward = Quaternion.Euler(0f, spawnHeading, 0f) * Vector3.forward;
            if (Current != null)
            {
                at = Current.transform.position;
                forward = Current.transform.forward;
                Destroy(Current.gameObject);
            }
            var car = Build(def, fleet.tuning);
            car.transform.SetParent(transform, true);
            if (roadLocator is IRoadLocator locator && locator.TryNearest(at, forward, 600f, out var p, out var f))
                car.Place(p, Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg, fromAbove: 3f);
            else
                car.Place(at, Mathf.Atan2(forward.x, forward.z) * Mathf.Rad2Deg);
            Current = car;
            if (driver != null) driver.Vehicle = car;
            if (respawn != null) respawn.Vehicle = car;
            Spawned?.Invoke(car);
            return car;
        }

        /// <summary>A complete car: physics root, controller, model and visuals.</summary>
        public static VehicleController Build(VehicleDefinition def, ArcadeTuning tuning)
        {
            var root = new GameObject(def.displayName);
            root.AddComponent<Rigidbody>();
            var car = root.AddComponent<VehicleController>();
            car.Configure(def, tuning);
            if (def.model != null)
            {
                var model = Instantiate(def.model, root.transform, false);
                model.name = "Model";
                foreach (var c in model.GetComponentsInChildren<Collider>()) Destroy(c);
                root.AddComponent<VehicleVisuals>().Bind(car, model.transform);
            }
            return car;
        }
    }
}
