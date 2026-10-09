using System;
using UnityEngine;

namespace JapanMap.Gameplay.Drift
{
    /// <summary>Passes the car body's collisions on (callbacks only reach the Rigidbody's own object).</summary>
    public sealed class ContactRelay : MonoBehaviour
    {
        public event Action<Collision> Touched;
        void OnCollisionEnter(Collision c) => Touched?.Invoke(c);
    }
}
