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
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")] static extern void JapanMapLoaded();
        static void PageLoaded() => JapanMapLoaded();
#else
        static void PageLoaded() { }
#endif

        bool _noUi, _uiCheck, _loaded;
        float _next, _played;

        void Start()
        {
            var url = Application.absoluteURL ?? "";
            _noUi = url.Contains("noui=1");
            _uiCheck = url.Contains("uicheck=1");
        }

        void Update()
        {
            UiPanel.Refresh();
            if (!_loaded && Platform.GamePlatform.Playing)
            {
                _loaded = true;
                PageLoaded();
            }
            // ?uicheck=1: one layout report after 4 s of real play (Tools/sizes-web.mjs, phone profiles).
            if (_uiCheck && Platform.GamePlatform.Playing && (_played += Time.unscaledDeltaTime) > 4f)
            {
                _uiCheck = false;
                Debug.Log(UiLayoutProbe.Summary());
            }
            if (!_noUi || Time.unscaledTime < _next) return;
            _next = Time.unscaledTime + 1f;
            foreach (var d in FindObjectsByType<UIDocument>()) if (d.enabled) d.enabled = false;
        }
    }
}
