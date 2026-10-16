using System.Collections;
using JapanMap.Core.Platform;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// The looks of the living world (people, animals, traffic models) are streamed, not in the start download: they
    /// added 1.3 MB on the wire (start 19.6 → 21.0 MB, over the 20 MB mark, 2026-10-16). And they wait for real play
    /// like the places (ContentStreamer): loaded at once, their bundles and shared dependencies made it 26.5 MB until
    /// gameplayStart. Crowd, actors and traffic start the moment their asset is there; the player's own body stays in
    /// the start (PlayerFigure). Run with StartCoroutine.
    /// </summary>
    public static class LifeContent
    {
        public const string Figures = "life/figures";
        public const string Traffic = "life/traffic";
        /// <summary>Seconds after the world is ready before loading even if gameplayStart never comes (as ContentStreamer).</summary>
        const float StartAfterAtMost = 8f;

        public static IEnumerator Load<T>(string address, System.Action<T> done) where T : Object
        {
            if (!Application.isEditor)
            {
                var since = -1f;
                while (true)
                {
                    if (GamePlatform.WorldReady)
                    {
                        if (since < 0f) since = Time.unscaledTime;
                        if (GamePlatform.GameplayStarts > 0 || Time.unscaledTime - since > StartAfterAtMost) break;
                    }
                    yield return null;
                }
            }
            var op = Addressables.LoadAssetAsync<T>(address);
            // Editor play mode answers from the asset database at once: tests see the crowd in the first frame as before.
            if (Application.isEditor && CarModels.EditorSync) op.WaitForCompletion();
            else yield return op;
            if (op.Status == AsyncOperationStatus.Succeeded) done(op.Result);
            else Debug.LogWarning($"[Content] {address} failed");
        }
    }
}
