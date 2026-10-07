using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// A system that the <see cref="Bootstrapper"/> brings up exactly once, in hierarchy order.
    /// Systems live under the Bootstrapper in the Boot scene and survive scene loads.
    /// </summary>
    public abstract class GameSystem : MonoBehaviour
    {
        public bool IsInitialized { get; private set; }

        internal void Initialize()
        {
            if (IsInitialized) return;
            OnInitialize();
            IsInitialized = true;
        }

        protected abstract void OnInitialize();
    }
}
