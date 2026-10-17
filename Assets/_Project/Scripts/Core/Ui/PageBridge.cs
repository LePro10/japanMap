using JapanMap.Core.Platform;
using UnityEngine;

namespace JapanMap.Core.Ui
{
    /// <summary>
    /// Talks to the web page around the game (WebGLTemplates/JapanMap/index.html): reports the loading progress after
    /// Unity's own files, and lets the page's loading screen go once something playable is on screen — the title, or
    /// the first gameplayStart when there is no title (?title=off, tests). Created at boot, lives for the session.
    /// </summary>
    public sealed class PageBridge : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")] static extern void JapanMapLoaded();
        [System.Runtime.InteropServices.DllImport("__Internal")] static extern void JapanMapLoadProgress(float share, string stage);
        static void Send(float share, string stage) => JapanMapLoadProgress(share, stage);
        static void PageLoaded() => JapanMapLoaded();
#else
        static void Send(float share, string stage) { }
        static void PageLoaded() { }
#endif

        /// <summary>The page was told the game is ready (tests).</summary>
        public static bool Loaded { get; private set; }
        /// <summary>Last progress sent (tests).</summary>
        public static float Share { get; private set; }
        public static string Stage { get; private set; } = "";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Loaded = false;
            Share = 0f;
            Stage = "";
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Create()
        {
            var go = new GameObject("PageBridge") { hideFlags = HideFlags.HideAndDontSave };
            go.AddComponent<PageBridge>();
            DontDestroyOnLoad(go);
        }

        void Update()
        {
            if (Loaded) return;
            var share = StartFlow.Progress(out var stage);
            if (stage != Stage || share > Share + 0.01f)
            {
                Share = Mathf.Max(Share, share);
                Stage = stage;
                Send(Share, Stage);
            }
            if (StartFlow.Current != StartFlow.Phase.Loading || GamePlatform.Playing)
            {
                Loaded = true;
                Debug.Log($"[Page] loaded at {StartFlow.Current}");
                PageLoaded();
            }
        }
    }
}
