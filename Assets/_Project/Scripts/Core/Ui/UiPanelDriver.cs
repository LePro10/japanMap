using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Core.Ui
{
    /// <summary>
    /// Re-measures the screen each frame (rotation, window resize) for <see cref="UiPanel"/>. With ?noui=1 in the page
    /// URL every UI document is switched off — an A/B switch for frame-time measurements (Tools/smoke.mjs --param).
    /// </summary>
    public sealed class UiPanelDriver : MonoBehaviour
    {
        bool _noUi;
        float _next;

        void Start() => _noUi = (Application.absoluteURL ?? "").Contains("noui=1");

        void Update()
        {
            UiPanel.Refresh();
            if (!_noUi || Time.unscaledTime < _next) return;
            _next = Time.unscaledTime + 1f;
            foreach (var d in FindObjectsByType<UIDocument>()) if (d.enabled) d.enabled = false;
        }
    }
}
