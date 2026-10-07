using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>Materials and amounts for <see cref="VehicleEffects"/>. Assets, so the web build keeps their shaders.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Vehicle Effects Settings", fileName = "VehicleEffects")]
    public sealed class VehicleEffectsSettings : ScriptableObject
    {
        public Material skidMaterial;
        public Material smokeMaterial;

        [Header("Skid marks")]
        [Tooltip("Telemetry skid (0…1) from which the tyres mark the road.")]
        public float markFromSkid = 0.3f;
        public float markWidth = 0.24f;
        [Tooltip("Seconds a mark stays.")]
        public float markSeconds = 12f;

        [Header("Smoke and dust")]
        public float smokeRate = 40f;
        [Tooltip("Off-road speed (m/s) at which dust is full.")]
        public float dustFullSpeed = 20f;
        public Color smokeColor = new(0.85f, 0.85f, 0.88f, 1f);
        public Color dustColor = new(0.62f, 0.52f, 0.38f, 1f);

        [Header("Tail lights (multiplier on the model's emission)")]
        public float tailIdle = 0.35f;
        public float tailBrake = 3f;
    }
}
