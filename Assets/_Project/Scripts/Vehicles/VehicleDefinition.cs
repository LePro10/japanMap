using UnityEngine;

namespace JapanMap.Vehicles
{
    public enum VehicleCategory { Street, Utility, Sport, Track }

    /// <summary>
    /// One car: identity, chassis, suspension and arcade handling. Handling and chassis numbers start
    /// from the legacy game fleet (vehicles.config.ts + arcade.config.ts); the model comes from the
    /// legacy car lab. Pairing of the two fleets: docs/DECISIONS.md D16.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Vehicle Definition", fileName = "Vehicle")]
    public sealed class VehicleDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string id = "hachi";
        public string displayName = "Hachi 86";
        public VehicleCategory category = VehicleCategory.Street;
        [Tooltip("Legacy game fleet id these driving numbers come from.")]
        public string legacyId = "touge";
        [Tooltip("Car model prefab (GLB from the car lab, node layout in ArtSource/cars/README.legacy.md).")]
        public GameObject model;

        [Header("Chassis")]
        public float mass = 1180f;
        [Tooltip("Wheelbase used by the steering kinematics, m.")]
        public float wheelbase = 2.43f;
        [Tooltip("Share of weight on the front axle.")]
        [Range(0.3f, 0.7f)] public float frontWeight = 0.52f;
        [Tooltip("Centre of gravity above ground, m.")]
        public float cgHeight = 0.5f;
        public float wheelRadius = 0.31f;
        [Tooltip("Body box for collisions: length, width, height, m (from the model bounds once linked).")]
        public Vector3 bodySize = new(4.12f, 1.92f, 1.36f);
        [Tooltip("Wheel centres FL, FR, RL, RR in the model (root on the ground, +Z forward). Empty = from wheelbase.")]
        public Vector3[] wheelPositions = new Vector3[0];
        [Tooltip("Body box centre along Z (model bounds), m.")]
        public float bodyCenterZ;
        [Tooltip("Gap between body underside and ground at rest, m.")]
        public float clearance = 0.16f;
        [Tooltip("Water depth the car wades without trouble, m.")]
        public float ford = 0.2f;

        [Header("Suspension")]
        [Tooltip("Suspension travel either side of the static ride height, m.")]
        public float travel = 0.22f;
        [Tooltip("Natural frequency, rad/s (legacy: Utility 8, Street/Sport 10, Track 13).")]
        public float springFrequency = 10f;
        [Tooltip("Damping ratio (legacy 0.72, Skiff Mini 0.42).")]
        public float dampingRatio = 0.72f;
        [Tooltip("Stiffness multiplier beyond the travel (bump stop).")]
        public float bumpStopFactor = 9f;
        [Tooltip("Spring force cap as a multiple of the car's weight (a wheel climbs a kerb instead of launching).")]
        public float maxLoadFactor = 3.5f;

        [Header("Body motion (visual)")]
        [Tooltip("Body roll per g of lateral acceleration, rad.")]
        public float rollPerLateralG = 0.065f;
        [Tooltip("Body pitch per g of longitudinal acceleration, rad.")]
        public float pitchPerLongitudinalG = 0.06f;

        [Header("Ground")]
        [Tooltip("Grip factor on gravel roads (legacy DIRT_GRIP).")]
        public float dirtGrip = 0.7f;
        [Tooltip("Share of asphalt traction kept on loose ground below 50 km/h.")]
        public float driveRetain = 0.65f;
        [Tooltip("Crawl assist share on loose ground.")]
        public float crawlShare = 0.5f;

        [Header("Handling")]
        public ArcadeSpec arcade = new();

        /// <summary>Static suspension compression: g / ω².</summary>
        public float StaticCompression => ArcadeTuning.Gravity / (springFrequency * springFrequency);

        public float TopSpeed => arcade.TopSpeed(mass);
    }
}
