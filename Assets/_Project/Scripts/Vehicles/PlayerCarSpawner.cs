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
        [Tooltip("Where the game starts, Unity coordinates.")]
        [SerializeField] Vector3 spawnPoint;
        [SerializeField] float spawnHeading;
        [Tooltip("Put the first car on the road nearest to the spawn point. Off: exactly there (Sakura Commons court).")]
        [SerializeField] bool snapToRoad = true;
        [Tooltip("URP material of the plain body a car shows while its model downloads (D36). Unity's default is pink on the web.")]
        [SerializeField] Material standInMaterial;

        void Awake()
        {
            if (standInMaterial != null) PendingModel.Material = standInMaterial;
        }

        public VehicleController Current { get; private set; }
        public event Action<VehicleController> Spawned;

        public VehicleFleet Fleet => fleet;
        /// <summary>Owned parts, setup and looks of the next car (the progress sets it in its Awake).</summary>
        public ICarLoadout Loadout { get; set; }

        void Start()
        {
            var id = !string.IsNullOrEmpty(carId) ? carId : Loadout?.SelectedCar;
            Spawn(fleet.Get(id ?? "") ?? fleet.Default);
        }

        /// <summary>Replace the current car with <paramref name="def"/> at the same spot (or at the spawn point).</summary>
        public VehicleController Spawn(VehicleDefinition def)
        {
            var at = spawnPoint;
            var forward = Quaternion.Euler(0f, spawnHeading, 0f) * Vector3.forward;
            var snap = snapToRoad || Current != null; // a replaced car goes to the road nearest to it, as before
            if (Current != null)
            {
                at = Current.transform.position;
                forward = Current.transform.forward;
                Destroy(Current.gameObject);
            }
            var car = Build(def, fleet.tuning, fleet.effects, Loadout);
            VehicleDamage.Attach(car, fleet.damage); // a new car is a whole car
            car.transform.SetParent(transform, true);
            if (snap && roadLocator is IRoadLocator locator && locator.TryNearest(at, forward, 600f, out var p, out var f))
                car.Place(p, Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg, fromAbove: 3f);
            else
                car.Place(at, Mathf.Atan2(forward.x, forward.z) * Mathf.Rad2Deg);
            Current = car;
            if (driver != null) driver.Vehicle = car;
            if (respawn != null) respawn.Vehicle = car;
            Spawned?.Invoke(car);
            return car;
        }

        /// <summary>Replace the current car with <paramref name="def"/> exactly here (garage bay), not snapped to a road.</summary>
        public VehicleController SpawnAt(VehicleDefinition def, Vector3 position, float headingDegrees)
        {
            if (Current != null) Destroy(Current.gameObject);
            var car = Build(def, fleet.tuning, fleet.effects, Loadout);
            VehicleDamage.Attach(car, fleet.damage);
            car.transform.SetParent(transform, true);
            car.Place(position, headingDegrees, fromAbove: 2f);
            Current = car;
            if (driver != null) driver.Vehicle = car;
            if (respawn != null) respawn.Vehicle = car;
            Spawned?.Invoke(car);
            return car;
        }

        /// <summary>A complete car: physics root, controller, model and visuals.</summary>
        public static VehicleController Build(VehicleDefinition def, ArcadeTuning tuning, VehicleEffectsSettings effects = null, ICarLoadout loadout = null)
        {
            var root = new GameObject(def.displayName);
            root.AddComponent<Rigidbody>();
            var car = root.AddComponent<VehicleController>();
            var crawl = -1f;
            car.Configure(def, tuning, loadout?.SpecFor(def, out crawl), crawl);
            if (!CarModels.HasModel(def)) return car;
            CarModels.Request(def);
            var prefab = CarModels.Get(def);
            if (prefab != null) AttachModel(car, prefab, effects, loadout);
            else root.AddComponent<PendingModel>().Wait(car, effects, loadout); // drives now, looks right when the model lands
            return car;
        }

        /// <summary>Puts the model under a built car: visuals (wheels, steering), effects and the owner's parts and paint.</summary>
        public static void AttachModel(VehicleController car, GameObject prefab, VehicleEffectsSettings effects, ICarLoadout loadout)
        {
            var model = Instantiate(prefab, car.transform, false);
            model.name = "Model";
            foreach (var c in model.GetComponentsInChildren<Collider>()) Destroy(c);
            car.gameObject.AddComponent<VehicleVisuals>().Bind(car, model.transform);
            if (effects != null) car.gameObject.AddComponent<VehicleEffects>().Bind(car, model.transform, effects);
            loadout?.Dress(car.Definition, model.transform);
        }
    }
}
