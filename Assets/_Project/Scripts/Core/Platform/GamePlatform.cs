using System;
using JapanMap.Core.Ui;
using UnityEngine;

namespace JapanMap.Core.Platform
{
    /// <summary>What became of a rewarded ad request.</summary>
    public enum AdOutcome
    {
        /// <summary>Watched to the end: grant the reward.</summary>
        Rewarded,
        /// <summary>No ad came (unfilled, cooldown, adblock, error): no reward, "No ad available" once.</summary>
        Unavailable,
    }

    /// <summary>The signed-in portal user (null = guest).</summary>
    public sealed class PlatformUser
    {
        public string Id = "";
        public string Name = "";
    }

    /// <summary>
    /// The portal the game runs on, as the game needs it: rewarded ads, gameplay start/stop, happy time, mute, the
    /// user. The Platform module installs the CrazyGames implementation at boot; everywhere else (editor, our own test
    /// hosts) <see cref="OfflinePlatform"/> stands in — Gameplay never references the SDK (modules depend only on Core).
    /// </summary>
    public interface IGamePlatform
    {
        string Name { get; }
        /// <summary>Rewarded ads can be offered at all (false: hide every "Watch ad" action, ASTRA §12).</summary>
        bool AdsEnabled { get; }
        /// <summary>Shows a rewarded ad. <paramref name="done"/> always comes, once, on the main thread.</summary>
        void RequestRewarded(Action<AdOutcome> done);
        void GameplayStart();
        void GameplayStop();
        void HappyTime();
        PlatformUser User { get; }
        /// <summary>The portal has accounts here (a login button makes sense).</summary>
        bool AccountsAvailable { get; }
        /// <summary>Opens the portal's login. <paramref name="done"/> gets the user, or null if cancelled.</summary>
        void LogIn(Action<PlatformUser> done);
    }

    /// <summary>
    /// Entry point for the game: the current platform, the ad state (pauses and mutes everything while an ad runs),
    /// the portal's mute wish, and the gameplay start/stop bookkeeping (<see cref="Tick"/>).
    /// </summary>
    public static class GamePlatform
    {
        static IGamePlatform _current;
        static bool _playing, _portalMuted;
        static float _savedScale = 1f;
        static float _lastStart = -10f;
        /// <summary>CrazyGames throttles a gameplayStart within 1 s of the last one and logs it as an error (QA tool).</summary>
        const float StartGap = 1.05f;
        static bool _savedPause;

        /// <summary>Any change of <see cref="Muted"/>, <see cref="AdRunning"/> or the user.</summary>
        public static event Action Changed;
        /// <summary>The portal user changed (login): the save may have to be reconciled.</summary>
        public static event Action<PlatformUser> UserChanged;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _current = null;
            _playing = _portalMuted = false;
            _lastStart = -10f;
            AdRunning = false;
            WorldReady = false;
            GameplayStarts = GameplayStops = 0;
            Changed = null;
            UserChanged = null;
        }

        public static IGamePlatform Current
        {
            get => _current ??= new OfflinePlatform();
            set
            {
                if (_playing) _current?.GameplayStop();
                _current = value;
                _playing = false;
                Changed?.Invoke();
            }
        }

        /// <summary>A rewarded ad is on screen: time stopped, sound off, gameplay stopped.</summary>
        public static bool AdRunning { get; private set; }

        /// <summary>The portal asked for silence (CrazyGames settings.muteAudio).</summary>
        public static bool PortalMuted
        {
            get => _portalMuted;
            set
            {
                if (_portalMuted == value) return;
                _portalMuted = value;
                Changed?.Invoke();
            }
        }

        /// <summary>Sound must be off now (portal wish or ad).</summary>
        public static bool Muted => _portalMuted || AdRunning;

        /// <summary>The game scene has a player in a drivable world (set by the gameplay, cleared when it goes).</summary>
        public static bool WorldReady { get; set; }

        /// <summary>Counters for tests and the smoke run.</summary>
        public static int GameplayStarts { get; private set; }
        public static int GameplayStops { get; private set; }
        public static bool Playing => _playing;

        /// <summary>
        /// Real play: the world is ready, nothing is open (menu, garage, photo mode, sheets all sit on the
        /// <see cref="UiStack"/>), time runs and no ad is showing. CrazyGames: stop "on every game break".
        /// </summary>
        public static bool ShouldPlay => WorldReady && UiStack.Count == 0 && Time.timeScale > 0f && !AdRunning;

        /// <summary>Sends gameplayStart/Stop on every change of <see cref="ShouldPlay"/>. Called each frame by the platform system.</summary>
        public static void Tick()
        {
            var want = ShouldPlay;
            if (want == _playing) return;
            // A menu opened and closed within a second: play resumes, the event follows once the gap allows it.
            if (want && Time.unscaledTime - _lastStart < StartGap) return;
            _playing = want;
            if (want) { GameplayStarts++; _lastStart = Time.unscaledTime; Current.GameplayStart(); }
            else { GameplayStops++; Current.GameplayStop(); }
        }

        /// <summary>
        /// Shows a rewarded ad with everything paused and muted, then restores time and sound and reports.
        /// Only one at a time; a second request while one runs is Unavailable.
        /// </summary>
        public static void ShowRewarded(Action<AdOutcome> done)
        {
            if (AdRunning || !Current.AdsEnabled)
            {
                done?.Invoke(AdOutcome.Unavailable);
                return;
            }
            AdRunning = true;
            _savedScale = Time.timeScale;
            _savedPause = AudioListener.pause;
            Time.timeScale = 0f;
            AudioListener.pause = true;
            Changed?.Invoke();
            Tick();
            var answered = false;
            Current.RequestRewarded(outcome =>
            {
                if (answered) return; // the SDK may report error after finish; the first answer counts
                answered = true;
                AdRunning = false;
                // Back to exactly what was before: a menu open behind the ad keeps its pause.
                Time.timeScale = _savedScale;
                AudioListener.pause = _savedPause;
                Changed?.Invoke();
                done?.Invoke(outcome);
            });
        }

        /// <summary>The platform reports a login (or another account).</summary>
        public static void RaiseUserChanged(PlatformUser user)
        {
            Changed?.Invoke();
            UserChanged?.Invoke(user);
        }
    }

    /// <summary>
    /// Editor and our own test hosts: no portal. Ads are simulated in the editor (fill after a short real-time
    /// wait, or per <see cref="Simulate"/>) so the offers can be played and tested; in a browser outside CrazyGames
    /// they are off and the offers stay hidden.
    /// </summary>
    public sealed class OfflinePlatform : IGamePlatform
    {
        public enum AdSim { Fill, Unfilled, Off }

        /// <summary>Editor ad simulation (tests, play scripts).</summary>
        public static AdSim Simulate = AdSim.Fill;
        /// <summary>Real seconds a simulated ad lasts.</summary>
        public static float SimSeconds = 1f;
        /// <summary>The last simulated ad request waits here until its time is up (driven by <see cref="Pump"/>).</summary>
        static Action<AdOutcome> _pending;
        static float _pendingUntil;
        public static int Requests { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Simulate = AdSim.Fill;
            SimSeconds = 1f;
            _pending = null;
            Requests = 0;
        }

        public string Name => Application.isEditor ? "Editor" : "Offline";
        public bool AdsEnabled => Application.isEditor && Simulate != AdSim.Off;

        public void RequestRewarded(Action<AdOutcome> done)
        {
            Requests++;
            _pending = done;
            _pendingUntil = Time.realtimeSinceStartup + SimSeconds;
        }

        /// <summary>Finishes a simulated ad when its time is up (called every frame by the platform system).</summary>
        public static void Pump()
        {
            if (_pending == null || Time.realtimeSinceStartup < _pendingUntil) return;
            var done = _pending;
            _pending = null;
            done(Simulate == AdSim.Fill ? AdOutcome.Rewarded : AdOutcome.Unavailable);
        }

        // Logged in builds (not the editor): Tools/sdk-web.mjs measures the start download up to here on any host.
        public void GameplayStart() { if (!Application.isEditor) Debug.Log("[Platform] gameplayStart (offline)"); }
        public void GameplayStop() { if (!Application.isEditor) Debug.Log("[Platform] gameplayStop (offline)"); }
        public void HappyTime() { }
        public PlatformUser User => null;
        public bool AccountsAvailable => false;
        public void LogIn(Action<PlatformUser> done) => done?.Invoke(null);
    }
}
