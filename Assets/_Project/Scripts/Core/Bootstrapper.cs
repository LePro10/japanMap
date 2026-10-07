using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace JapanMap.Core
{
    /// <summary>
    /// Entry point of the game. Lives in the Boot scene (build index 0), initialises every
    /// <see cref="GameSystem"/> below it in hierarchy order, then loads the first gameplay scene.
    /// The order is the sibling order in Boot.unity — one place, visible in the editor.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class Bootstrapper : MonoBehaviour
    {
        public const string BootSceneName = "Boot";

        [SerializeField] string firstScene = "Game";
        [SerializeField] bool loadFirstScene = true;

        readonly List<GameSystem> _systems = new();

        public static Bootstrapper Instance { get; private set; }
        public static bool IsBooted => Instance != null;
        public IReadOnlyList<GameSystem> Systems => _systems;

        // Domain reload may be disabled (Enter Play Mode Options), so statics must be reset by hand.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = null;

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                // Boot scene loaded a second time: the running systems stay, only the scene switch happens.
                Destroy(gameObject);
                if (loadFirstScene) SceneManager.LoadScene(firstScene);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            InitializeSystems();
            if (loadFirstScene) SceneManager.LoadScene(firstScene);
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        /// <summary>Initialises all child systems in hierarchy order. Public for tests.</summary>
        public void InitializeSystems()
        {
            _systems.Clear();
            GetComponentsInChildren(true, _systems);
            foreach (var system in _systems)
                system.Initialize();
            Debug.Log($"[Boot] {_systems.Count} systems up: {string.Join(", ", _systems.ConvertAll(s => s.GetType().Name))}");
        }
    }
}
