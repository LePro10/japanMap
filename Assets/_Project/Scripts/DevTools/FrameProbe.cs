using System.Collections;
using JapanMap.Core;
using UnityEngine;

namespace JapanMap.DevTools
{
    /// <summary>
    /// <c>?probe=frame</c>: a few seconds after start the game reads back one finished frame and logs its mean colour and
    /// how much of it is lit — proof that something is drawn, independent of how the browser takes screenshots (the
    /// headless WebGPU canvas screenshot was black, Phase 10). Tools/sdk-web.mjs reads the "[Probe]" lines.
    /// </summary>
    public sealed class FrameProbe : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
            if (QualitySystem.UrlParam(Application.absoluteURL, "probe") != "frame") return;
            var go = new GameObject("FrameProbe");
            DontDestroyOnLoad(go);
            go.AddComponent<FrameProbe>();
        }

        IEnumerator Start()
        {
            for (var i = 0; i < 3; i++)
            {
                yield return new WaitForSecondsRealtime(4f);
                yield return new WaitForEndOfFrame();
                var tex = ScreenCapture.CaptureScreenshotAsTexture();
                var px = tex.GetPixels32();
                long r = 0, g = 0, b = 0;
                var lit = 0;
                foreach (var p in px)
                {
                    r += p.r; g += p.g; b += p.b;
                    if (p.r + p.g + p.b > 60) lit++;
                }
                var n = Mathf.Max(1, px.Length);
                Debug.Log($"[Probe] frame {tex.width}x{tex.height} mean {r / n},{g / n},{b / n} lit {100f * lit / n:0}% on {SystemInfo.graphicsDeviceType}");
                Destroy(tex);
            }
        }
    }
}
