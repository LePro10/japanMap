using UnityEngine;

namespace JapanMap.Core.Ui
{
    /// <summary>Re-measures the screen each frame (rotation, window resize) for <see cref="UiPanel"/>.</summary>
    public sealed class UiPanelDriver : MonoBehaviour
    {
        void Update() => UiPanel.Refresh();
    }
}
