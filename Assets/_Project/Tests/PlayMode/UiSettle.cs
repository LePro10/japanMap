using System.Collections;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Tests
{
    /// <summary>
    /// Waits until an element stops moving before a test clicks or taps it. The menu slides pages in (240 ms, D48) and
    /// tiles rise one after another in real time: a click aimed at a moving element lands where it was, on its
    /// neighbour (a tab click became Play, a map pin click hit the drift zone beside it). A player clicks what is there.
    /// </summary>
    public static class UiSettle
    {
        public static IEnumerator Wait(VisualElement e, float timeout = 2f)
        {
            if (e == null) yield break;
            var last = e.worldBound;
            var start = Time.realtimeSinceStartup;
            var still = start;
            while (Time.realtimeSinceStartup - start < timeout)
            {
                yield return null;
                var now = e.worldBound;
                if ((now.center - last.center).sqrMagnitude > 0.04f || Mathf.Abs(now.width - last.width) > 0.2f || Mathf.Abs(now.height - last.height) > 0.2f)
                {
                    last = now;
                    still = Time.realtimeSinceStartup;
                }
                // Still for 0.1 s of real time (transitions run in real time; the menu pauses game time).
                else if (Time.realtimeSinceStartup - still > 0.1f) yield break;
            }
        }
    }
}
