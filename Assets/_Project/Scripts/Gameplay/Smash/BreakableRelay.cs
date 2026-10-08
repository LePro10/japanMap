using UnityEngine;

namespace JapanMap.Gameplay.Smash
{
    /// <summary>Forwards a hit on a collider child to its <see cref="Breakable"/>.</summary>
    public sealed class BreakableRelay : MonoBehaviour
    {
        public Breakable target;
        void OnCollisionEnter(Collision c) => target.Hit(c);
    }
}
