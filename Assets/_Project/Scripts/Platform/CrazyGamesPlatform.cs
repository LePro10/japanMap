using System;
using System.Collections;
using CrazyGames;
using JapanMap.Core;
using JapanMap.Core.Platform;
using JapanMap.Core.Save;
using UnityEngine;

namespace JapanMap.Platform
{
    /// <summary>
    /// CrazyGames SDK at boot. On CrazyGames (and localhost) the save goes to the SDK's data module, which keeps
    /// it with the player's account; everywhere else — editor, 127.0.0.1, the phone test on *.local — it stays on
    /// this device (PlayerPrefs = IndexedDB in the browser). The game scene waits for this (IBootGate)
    /// so the save is read from the right place; if the SDK does not answer in time the game starts on the local
    /// store and says so ("sync pending"). Once up it is the game's <see cref="GamePlatform"/>: rewarded ads,
    /// gameplay start/stop on every break (ticked here each frame), happy time, the portal's mute and the user.
    /// Loading start/stop are not called: the SDK does not support them in Unity (the Unity loader is the loading).
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

        MirroredStore _store;

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
                // The user first: the device copy is compared with the account copy of exactly this player.
                CrazySDK.User.GetUser(user =>
                {
                    if (Ready) return;
                    var owner = OwnerOf(user);
                    _store = new MirroredStore(new CrazyDataStore(), owner);
                    SaveSync.Reconcile(new PlayerPrefsStore(), _store, owner);
                    SaveStores.Current = _store;
                    var portal = new CrazyPortal(user);
                    GamePlatform.Current = portal;
                    GamePlatform.PortalMuted = CrazySDK.Game.Settings?.muteAudio == true;
                    CrazySDK.Game.AddSettingsChangeListener(s => GamePlatform.PortalMuted = s.muteAudio);
                    if (CrazySDK.User.IsUserAccountAvailable) CrazySDK.User.AddAuthListener(OnLogin);
                    Mode = "crazygames";
                    Ready = true;
                    Debug.Log($"[Platform] CrazyGames SDK up ({CrazySDK.Environment}, {owner}) — saving with the data module");
                });
            });
            StartCoroutine(Timeout());
        }

        static string OwnerOf(PortalUser user) => user == null ? "guest" : "user:" + user.__dangerousUserId;

        /// <summary>
        /// A login during play: the data module now answers with the account's copy. It is compared with the guest copy
        /// on this device before anything saves (ASTRA §9: a login never replaces a guest's progress unasked).
        /// </summary>
        void OnLogin(PortalUser user)
        {
            var owner = OwnerOf(user);
            if (_store != null) _store.Owner = owner;
            if (GamePlatform.Current is CrazyPortal p) p.SetUser(user);
            Debug.Log($"[Platform] login: {user?.username}");
            if (_store != null) SaveSync.Reconcile(new PlayerPrefsStore(), _store, owner);
            GamePlatform.RaiseUserChanged(CrazyPortal.ToUser(user));
        }

        IEnumerator Timeout()
        {
            yield return new WaitForSecondsRealtime(initTimeout);
            if (Ready) yield break;
            Mode = "local (sdk timeout)";
            Ready = true;
            Debug.LogWarning("[Platform] CrazyGames SDK did not answer — saved on this device, sync pending");
        }

        void Update()
        {
            OfflinePlatform.Pump();
            GamePlatform.Tick();
        }
    }

    /// <summary>The CrazyGames SDK as the game's platform.</summary>
    public sealed class CrazyPortal : IGamePlatform
    {
        PlatformUser _user;

        public CrazyPortal(PortalUser user) => _user = ToUser(user);

        public static PlatformUser ToUser(PortalUser u) => u == null ? null : new PlatformUser { Id = u.__dangerousUserId, Name = u.username };
        public void SetUser(PortalUser u) => _user = ToUser(u);

        public string Name => "CrazyGames";
        // Ads are off during a Basic Launch and may be blocked; the request itself reports it (adsDisabledBasicLaunch,
        // adblock) and the offer then says "No ad available" once (ASTRA §12).
        public bool AdsEnabled => CrazySDK.IsInitialized;

        public void RequestRewarded(Action<AdOutcome> done)
        {
            CrazySDK.Ad.RequestAd(CrazyAdType.Rewarded,
                () => Debug.Log("[Ads] rewarded started"),
                error =>
                {
                    Debug.Log($"[Ads] rewarded unavailable: {error?.code} {error?.message}");
                    done(AdOutcome.Unavailable);
                },
                () =>
                {
                    Debug.Log("[Ads] rewarded finished");
                    done(AdOutcome.Rewarded);
                });
        }

        // Logged: Tools/sdk-web.mjs measures the download up to the first gameplayStart (CrazyGames' start-size rule).
        public void GameplayStart()
        {
            CrazySDK.Game.GameplayStart();
            Debug.Log("[Platform] gameplayStart");
        }

        public void GameplayStop()
        {
            CrazySDK.Game.GameplayStop();
            Debug.Log("[Platform] gameplayStop");
        }

        public void HappyTime()
        {
            CrazySDK.Game.HappyTime();
            Debug.Log("[Platform] happytime");
        }
        public PlatformUser User => _user;
        public bool AccountsAvailable => CrazySDK.User.IsUserAccountAvailable;

        public void LogIn(Action<PlatformUser> done)
        {
            CrazySDK.User.ShowAuthPrompt((error, user) =>
            {
                if (error != null) Debug.Log($"[Platform] login: {error.code}");
                done?.Invoke(error != null ? null : ToUser(user));
            });
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
