using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// Finds the nearest drivable road point. Lives in Core so Vehicles (respawn) can use the road
    /// network from World without depending on it; World's RoadNetwork asset implements it.
    /// </summary>
    public interface IRoadLocator
    {
        /// <summary>
        /// Nearest centreline point within <paramref name="maxDistance"/> (horizontal), with the road
        /// direction there. <paramref name="preferForward"/> picks which of the two directions.
        /// </summary>
        bool TryNearest(Vector3 position, Vector3 preferForward, float maxDistance, out Vector3 point, out Vector3 forward);
    }
}
