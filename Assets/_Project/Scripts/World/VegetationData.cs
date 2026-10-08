using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Scattered trees and bushes, written by the editor's vegetation import. Compact per instance:
    /// position plus shape (height scale, width scale, yaw in radians).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/World/Vegetation Data", fileName = "VegetationInstances")]
    public sealed class VegetationData : InstanceData
    {
        /// <summary>x = height scale, y = width scale, z = yaw.</summary>
        public Vector3[] shapes = { };

        public override Matrix4x4 Matrix(int i)
        {
            var s = shapes[i];
            return Matrix4x4.TRS(positions[i], Quaternion.Euler(0, s.z * Mathf.Rad2Deg, 0), new Vector3(s.y, s.x, s.y));
        }
    }
}
