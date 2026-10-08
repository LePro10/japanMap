using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// Physics layers shared by all modules. One place, so a new body layer (walker, pedestrians,
    /// debris) is excluded from every ground probe and camera at once — not found later by a car
    /// standing on a pedestrian's head.
    /// </summary>
    public static class GameLayers
    {
        public const string Vehicle = "Vehicle";
        public const string Walker = "Walker";
        public const string Pedestrian = "Pedestrian";
        public const string Debris = "Debris";

        /// <summary>Bodies that are never ground for a wheel, a walker's feet or a spawn probe.</summary>
        public static int NotGround => LayerMask.GetMask(Vehicle, Walker, Pedestrian, Debris, "Water", "UI") | Physics.IgnoreRaycastLayer;

        /// <summary>What a follow camera may be pushed in front of: static world only.</summary>
        public static int CameraObstacles => ~(LayerMask.GetMask(Vehicle, Walker, Pedestrian, Debris, "Water", "UI") | Physics.IgnoreRaycastLayer);

        public static int Layer(string name) => LayerMask.NameToLayer(name);
    }
}
