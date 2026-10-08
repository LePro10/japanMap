using System;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Instances for <see cref="InstanceRenderer"/>: sorted by chunk, then prototype; each chunk lists
    /// its runs. Trees (<see cref="VegetationData"/>) and place models (<see cref="PlaceInstanceData"/>)
    /// differ only in how an instance's matrix is stored.
    /// </summary>
    public abstract class InstanceData : ScriptableObject
    {
        [Serializable]
        public class Prototype
        {
            public string name;
            public Mesh[] lods;
            public Material material;
            [Tooltip("Optional material per LOD (null entries = material), e.g. a plain shell at distance.")]
            public Material[] lodMaterials;
            [Tooltip("Distance (m) where each LOD but the last ends, at QualitySettings.lodBias = 1.")]
            public float[] lodEnd;
            [Tooltip("Not drawn beyond this distance (m), on top of the tier's vegetation distance.")]
            public float maxDistance = 3000;
            [Tooltip("LODs below this index cast shadows.")]
            public int shadowLods = 2;
            [Tooltip("−1: off. Else LODs below this index cast no shadow themselves; this LOD's mesh casts it for them (a 1 k-triangle shadow instead of a 5 k one: Tokyo LOD0 shadows were 5 M triangles).")]
            public int shadowProxyLod = -1;
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
        /// <summary>Where each instance is (LOD distance, colliders).</summary>
        public Vector3[] positions = { };

        public int Count => positions.Length;

        public abstract Matrix4x4 Matrix(int i);
    }
}
