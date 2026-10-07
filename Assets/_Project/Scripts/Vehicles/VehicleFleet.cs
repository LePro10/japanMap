using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>All cars of the game in dealer order, plus the shared arcade tuning.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Fleet", fileName = "Fleet")]
    public sealed class VehicleFleet : ScriptableObject
    {
        public ArcadeTuning tuning;
        public VehicleEffectsSettings effects;
        public VehicleDefinition[] vehicles;
        [Tooltip("Car the player starts in.")]
        public string defaultId = "hachi";

        public VehicleDefinition Get(string id)
        {
            foreach (var v in vehicles)
                if (v != null && v.id == id) return v;
            return null;
        }

        public VehicleDefinition Default => Get(defaultId) ?? (vehicles.Length > 0 ? vehicles[0] : null);
    }
}
