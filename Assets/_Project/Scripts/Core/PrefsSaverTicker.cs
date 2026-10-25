using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>Writes <see cref="PrefsSaver"/>'s held-back save once the interval has passed. Also flushes when the
    /// page is hidden, so a drag that ends right before the tab closes is not lost.</summary>
    public sealed class PrefsSaverTicker : MonoBehaviour
    {
        void Update() => PrefsSaver.Flush();
        void OnApplicationPause(bool paused) { if (paused) PrefsSaver.SaveIfPending(); }
        void OnApplicationFocus(bool focus) { if (!focus) PrefsSaver.SaveIfPending(); }
    }
}
