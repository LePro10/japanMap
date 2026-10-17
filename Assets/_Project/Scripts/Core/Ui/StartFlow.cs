using System;
using JapanMap.Core.Platform;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace JapanMap.Core.Ui
{
    /// <summary>
    /// Where the start of the game stands: loading (the page's loading screen covers everything) → title (the world
    /// is ready behind START / CONTINUE; no gameplayStart yet) → starting (the camera flies to the car) → playing.
    /// Lives in Core so the page bridge and the intro can follow it without knowing the menu.
    /// </summary>
    public static class StartFlow
    {
        public enum Phase { Loading, Title, Starting, Playing }

        static Phase _phase;

        public static event Action<Phase> Changed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _phase = Phase.Loading;
            Changed = null;
        }

        public static Phase Current
        {
            get => _phase;
            set
            {
                if (_phase == value) return;
                _phase = value;
                Changed?.Invoke(value);
            }
        }

        /// <summary>
        /// The title owns the screen, or may still claim it (loading: it decides on the first frame the world is ready,
        /// and the intro must not start in that same frame) — the intro waits.
        /// </summary>
        public static bool Holding => _phase != Phase.Playing;

        /// <summary>
        /// Loading progress 0…1 after Unity's own files (the page shows those itself) with a short line for the player.
        /// Boot gates (platform SDK, terrain) are the first half, the game scene and the start car the rest.
        /// </summary>
        public static float Progress(out string stage)
        {
            if (_phase != Phase.Loading || GamePlatform.WorldReady) { stage = "Ready"; return 1f; }
            var boot = Bootstrapper.Instance;
            if (boot == null) { stage = "Starting the engine"; return 0f; }
            int gates = 0, open = 0;
            foreach (var s in boot.Systems)
                if (s is IBootGate g) { gates++; if (g.Ready) open++; }
            if (SceneManager.GetActiveScene().name == Bootstrapper.BootSceneName)
            {
                stage = "Waking the city";
                return gates == 0 ? 0.5f : 0.5f * open / gates;
            }
            stage = "Bringing your car";
            return 0.8f;
        }
    }
}
