using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Audio
{
    /// <summary>Diagnostic: where a looping stand-in clip restarts (the WAV's smpl loop start, or sample 0?).</summary>
    public class LoopPointProbe
    {
        [UnityTest, Explicit("diagnostic, start by name")]
        public IEnumerator WhereDoesALoopRestart()
        {
#if UNITY_EDITOR
            var clip = UnityEditor.AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Project/Art/Audio/StandIn/SFX_STANDIN_Engine_hachi_on1.wav");
            var go = new GameObject("probe");
            go.AddComponent<AudioListener>();
            var a = go.AddComponent<AudioSource>();
            a.clip = clip;
            a.loop = true;
            a.Play();
            var last = 0;
            var after = new System.Collections.Generic.List<int>();
            for (var t = 0f; t < 3.5f; t += Time.unscaledDeltaTime)
            {
                yield return null;
                var s = a.timeSamples;
                if (s < last) after.Add(s);
                last = s;
            }
            Debug.Log($"[LoopProbe] clip {clip.samples} samples @ {clip.frequency} Hz; restarts at {string.Join(", ", after)}");
            Object.Destroy(go);
#endif
            Assert.Pass();
        }
    }
}
