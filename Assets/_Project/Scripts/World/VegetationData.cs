using System;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Scattered trees and bushes for <see cref="VegetationRenderer"/>, written by the editor's
    /// vegetation import. Instances are sorted by chunk, then prototype; each chunk lists its runs.
    /// Compact per instance: position, height scale, width scale, yaw (radians).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/World/Vegetation Data", fileName = "VegetationInstances")]
    public sealed class VegetationData : ScriptableObject
    {
        [Serializable]
        public class Prototype
        {
            public string name;
            public Mesh[] lods;
            public Material material;
            [Tooltip("Distance (m) where each LOD but the last ends, at QualitySettings.lodBias = 1.")]
            public float[] lodEnd;
            [Tooltip("Not drawn beyond this distance (m), on top of the tier's vegetation distance.")]
            public float maxDistance = 3000;
            [Tooltip("LODs below this index cast shadows.")]
            public int shadowLods = 2;
            public float colliderRadius;
            public float colliderHeight;
        }

        [Serializable]
        public struct Run
        {
            public int prototype, start, count;
        }

        [Serializable]
        public class Chunk
        {
            public Bounds bounds;
            public Run[] runs;
        }

        public float chunkSize = 64;
        public Prototype[] prototypes = { };
        public Chunk[] chunks = { };
        public Vector3[] positions = { };
        /// <summary>x = height scale, y = width scale, z = yaw.</summary>
        public Vector3[] shapes = { };

        public int Count => positions.Length;

        public Matrix4x4 Matrix(int i)
        {
            var s = shapes[i];
            return Matrix4x4.TRS(positions[i], Quaternion.Euler(0, s.z * Mathf.Rad2Deg, 0), new Vector3(s.y, s.x, s.y));
        }
    }
}
