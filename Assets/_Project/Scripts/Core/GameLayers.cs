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
        public const string Water = "Water";

        // Built once on first use: these are read every frame by probes and cameras, and LayerMask.GetMask
        // allocates a name array on each call. Layer names never change at runtime, so the cache stays valid.
        static int _notGround;
        static bool _masksReady;

        static void EnsureMasks()
        {
            if (_masksReady) return;
            _notGround = LayerMask.GetMask(Vehicle, Walker, Pedestrian, Debris, Water, "UI") | Physics.IgnoreRaycastLayer;
            _masksReady = true;
        }

        /// <summary>Bodies that are never ground for a wheel, a walker's feet or a spawn probe.</summary>
        public static int NotGround { get { EnsureMasks(); return _notGround; } }

        /// <summary>What a follow camera may be pushed in front of: static world only.</summary>
        public static int CameraObstacles { get { EnsureMasks(); return ~_notGround; } }

        public static int Layer(string name) => LayerMask.NameToLayer(name);

        /// <summary>
        /// Water surfaces carry mesh colliders for queries only (a car's water depth, the car call): they must never
        /// push a body, so the Water layer touches no layer. Set before the first scene, for the whole run.
        /// </summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        public static void WaterTouchesNothing()
        {
            var water = LayerMask.NameToLayer(Water);
            if (water < 0) return;
            for (var i = 0; i < 32; i++) Physics.IgnoreLayerCollision(water, i, true);
        }
    }
}
