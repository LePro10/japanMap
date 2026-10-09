using System;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Sits on a pooled collider of an <see cref="InstanceRenderer"/> (a tree trunk near the camera) and
    /// says which instance it stands for, so a hit can break that one tree. World knows nothing of
    /// gameplay: it only reports the hit (<see cref="Hit"/>); the smash system decides.
    /// </summary>
    public sealed class InstanceCollider : MonoBehaviour
    {
        public InstanceRenderer Owner { get; internal set; }
        public int Index { get; internal set; } = -1;

        /// <summary>A rigidbody hit an instance collider: (renderer, instance index, collision).</summary>
        public static event Action<InstanceRenderer, int, Collision> Hit;

        // Domain reload may be off: no listeners from the last play session.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Hit = null;

        void OnCollisionEnter(Collision c)
        {
            if (Owner != null && Index >= 0) Hit?.Invoke(Owner, Index, c);
        }
    }
}
