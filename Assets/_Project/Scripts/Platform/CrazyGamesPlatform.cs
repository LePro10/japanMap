using System.Collections;
using CrazyGames;
using JapanMap.Core;
using JapanMap.Core.Save;
using UnityEngine;

namespace JapanMap.Platform
{
    /// <summary>
    /// CrazyGames SDK at boot. On CrazyGames (and localhost) the save goes to the SDK's data module, which keeps
    /// it with the player's account; everywhere else — editor, 127.0.0.1, the phone test on *.local — it stays on
    /// this device (PlayerPrefs = IndexedDB in the browser). The game scene waits for this (IBootGate)
    /// so the save is read from the right place; if the SDK does not answer in time the game starts on the local
    /// store and says so ("sync pending").
    /// </summary>
    public sealed class CrazyGamesPlatform : GameSystem, IBootGate
    {
        [Tooltip("Longest wait for the SDK before the game starts on the local store, s.")]
        [SerializeField] float initTimeout = 6f;

        public bool Ready { get; private set; }
        /// <summary>"crazygames", "local", "local (sdk timeout)" — for logs and tests.</summary>
        public static string Mode { get; private set; } = "local";

        // Domain reload may be disabled.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Mode = "local";

        protected override void OnInitialize()
        {
            // The editor keeps our PlayerPrefs store (the SDK's editor path is PlayerPrefs too, but without the
            // agent/test save slots).
            // Our own test hosts (127.0.0.1 preview/smoke, *.local phone test — whitelisted in CrazyGamesSettings) skip the
            // SDK: in its local environment it lays a full-page overlay over the game, and the walk camera's pointer
            // lock then fails with an error dialog (Phase 8 smoke). On CrazyGames and on localhost the SDK runs.
            if (Application.isEditor || Application.platform != RuntimePlatform.WebGLPlayer || !CrazySDK.IsAvailable
                || SiteLock.IsOnWhitelistedDomain())
            {
                Mode = "local";
                Ready = true;
                return;
            }
            CrazySDK.Init(() =>
            {
                if (Ready) return; // timed out already: keep the store the game started with
                SaveStores.Current = new CrazyDataStore();
                Mode = "crazygames";
                Ready = true;
                Debug.Log($"[Platform] CrazyGames SDK up ({CrazySDK.Environment}) — saving with the data module");
            });
            StartCoroutine(Timeout());
        }

        IEnumerator Timeout()
        {
            yield return new WaitForSecondsRealtime(initTimeout);
            if (Ready) yield break;
            Mode = "local (sdk timeout)";
            Ready = true;
            Debug.LogWarning("[Platform] CrazyGames SDK did not answer — saved on this device, sync pending");
        }
    }

    /// <summary>The CrazyGames data module as a save store (1 MB per game, saves debounced by the SDK).</summary>
    public sealed class CrazyDataStore : ISaveStore
    {
        public string Name => "CrazyGames";

        public bool TryRead(string key, out string value)
        {
            value = CrazySDK.Data.HasKey(key) ? CrazySDK.Data.GetString(key) : null;
            return value != null;
        }

        public void Write(string key, string value) => CrazySDK.Data.SetString(key, value);
        public void Delete(string key) => CrazySDK.Data.DeleteKey(key);
    }
}
