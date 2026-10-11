using System;
using System.Collections.Generic;
using JapanMap.Core.Platform;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.ResourceManagement.ResourceProviders;
using UnityEngine.SceneManagement;

namespace JapanMap.Gameplay.Content
{
    /// <summary>
    /// The rest of the world after the start download (D36, CrazyGames ≤ 20 MB to the first gameplayStart): the base world
    /// — terrain, roads, water, vegetation, props, Sakura Commons and the starter car — is in Game.unity; the other places
    /// are scenes loaded additively, nearest to the player first, then the other cars' models and engine sounds. One
    /// download at a time (ASTRA §13: phones at most two). Builds wait for the first gameplayStart so nothing competes
    /// with the start; the editor loads everything at once (asset database, tests see the whole world as before).
    /// </summary>
    public sealed class ContentStreamer : MonoBehaviour
    {
        [Serializable]
        public struct Place
        {
            public string address;
            public Vector3 centre;
            [Tooltip("Scene asset path — the editor opens it directly (no asynchronous loads across play sessions/tests).")]
            public string editorPath;
        }

        [Tooltip("Streamed places (address \"place/<title>\") and their centres; written by JapanMap/Content/Setup Streaming.")]
        [SerializeField] Place[] places = Array.Empty<Place>();
        [SerializeField] VehicleFleet fleet;
        [SerializeField] PlayerModeController player;
        [SerializeField] CarAudio carAudio;
        [SerializeField] Smash.SmashSystem smash;
        [Tooltip("Seconds after the world is ready before streaming starts even if gameplayStart never comes (menu left open).")]
        [SerializeField] float startAfterAtMost = 8f;
        [Tooltip("Road tiles count as this fraction of their distance: they are small (< 1 s on 5 Mbit/s) and the player drives on " +
                 "bare terrain until they come; a nearby place like Tokyo took 19 s first (Phase 11, measured).")]
        [SerializeField, Range(0.05f, 1f)] float roadDistanceFactor = 0.2f;

        readonly HashSet<string> _loaded = new();
        readonly HashSet<string> _failed = new();
        string _busy;
        float _readySince = -1f;
        bool _started;
        int _carIndex;
        VehicleDefinition _lastCar;

        public static ContentStreamer Instance { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = null;

        public IReadOnlyList<Place> Places => places;
        public bool IsLoaded(string address) => _loaded.Contains(address);
        public int LoadedPlaces => _loaded.Count;
        /// <summary>Every place is in (tests, the loading line on the map).</summary>
        public bool AllPlaces => _loaded.Count + _failed.Count >= places.Length;
        /// <summary>A place arrived (address) — systems that scan the world add it.</summary>
        public event Action<string, Scene> PlaceLoaded;

        const string RoadPrefix = "world/Roads_";

        void Awake() => Instance = this;

        void OnDestroy()
        {
            Core.QualitySystem.Hold = false;
            if (Instance == this) Instance = null;
        }

        void Start()
        {
#if UNITY_EDITOR
            // Editor: every part at once and synchronously (loaded by the end of this frame), as when the places were still
            // in Game.unity — no load may still be running when a test ends the session (native PhysX crash, Phase 10).
            foreach (var p in places)
            {
                var title = p.address.Substring(p.address.IndexOf('/') + 1);
                var open = SceneManager.GetSceneByName(title);
                if (open.IsValid() && open.isLoaded) { Arrive(p.address, open); continue; }
                var scene = UnityEditor.SceneManagement.EditorSceneManager.LoadSceneInPlayMode(p.editorPath, new LoadSceneParameters(LoadSceneMode.Additive));
                _pendingEditor.Add((p.address, scene));
            }
            _started = true;
#endif
        }

#if UNITY_EDITOR
        readonly List<(string address, Scene scene)> _pendingEditor = new();

        void LateUpdate()
        {
            for (var i = _pendingEditor.Count - 1; i >= 0; i--)
            {
                var (address, scene) = _pendingEditor[i];
                if (!scene.isLoaded) continue;
                _pendingEditor.RemoveAt(i);
                Arrive(address, scene);
            }
        }
#endif

        void Update()
        {
            if (Application.isEditor) return; // the editor loaded everything in Start
            // Frames while the world streams in are not the game's real frame rate: auto quality waits (D38).
            Core.QualitySystem.Hold = !AllPlaces || _busy != null;
            if (!_started)
            {
                if (!GamePlatform.WorldReady) return;
                if (_readySince < 0f) _readySince = Time.unscaledTime;
                // Nothing may compete with the start download: wait for real play, or a while if a menu stays open.
                if (GamePlatform.GameplayStarts == 0 && Time.unscaledTime - _readySince < startAfterAtMost) return;
                _started = true;
                Debug.Log($"[Content] start download done — streaming {places.Length} places, then cars");
                World.StreamedTerrain.FetchDetails(); // grass: small, independent of the scene queue
            }
            if (_busy != null) return;
            // The own car's model first: a place loading beside it shares the line (stand-in car for 21 s at 5 Mbit/s).
            var own = player != null && player.Car != null ? player.Car.Definition : null;
            if (own != null && CarModels.IsLoading(own)) return;
            var next = NearestMissing();
            if (next != null) { Load(next); return; }
            PrefetchNextCar();
        }

        string NearestMissing()
        {
            var at = PlayerPosition();
            string best = null;
            var bestD = float.MaxValue;
            foreach (var p in places)
            {
                if (_loaded.Contains(p.address) || _failed.Contains(p.address) || p.address == _busy) continue;
                var d = (new Vector2(p.centre.x, p.centre.z) - new Vector2(at.x, at.z)).sqrMagnitude;
                if (p.address.StartsWith(RoadPrefix)) d *= roadDistanceFactor * roadDistanceFactor;
                if (d < bestD) { bestD = d; best = p.address; }
            }
            return best;
        }

        Vector3 PlayerPosition()
        {
            if (player == null) return Vector3.zero;
            if (player.Current == PlayerModeController.Mode.Driving && player.Car != null) return player.Car.transform.position;
            return player.Walker != null ? player.Walker.transform.position : Vector3.zero;
        }

        void Load(string address)
        {
            // Already open (the editor had it open additively when Play started): count it, do not load twice.
            var title = address.Substring(address.IndexOf('/') + 1);
            var open = SceneManager.GetSceneByName(title);
            if (open.IsValid() && open.isLoaded)
            {
                Arrive(address, open);
                return;
            }
            _busy = address;
            var t0 = Time.realtimeSinceStartup;
            var op = Addressables.LoadSceneAsync(address, LoadSceneMode.Additive);
            op.Completed += h =>
            {
                if (_busy == address) _busy = null;
                if (h.Status != AsyncOperationStatus.Succeeded)
                {
                    _failed.Add(address);
                    Debug.LogWarning($"[Content] {address} failed: {h.OperationException?.Message}");
                    return;
                }
                if (!Application.isEditor) Debug.Log($"[Content] {address} in {Time.realtimeSinceStartup - t0:0.0} s");
                Arrive(address, h.Result.Scene);
            };
        }

        void Arrive(string address, Scene scene)
        {
            _loaded.Add(address);
            foreach (var root in scene.GetRootGameObjects())
                if (smash != null) smash.Scan(root);
            // Draw distances of the tier now in force reach the new place's instanced buildings.
            var tq = FindAnyObjectByType<World.TerrainQuality>();
            if (tq != null) tq.Apply(QualitySettings.names[QualitySettings.GetQualityLevel()]);
            PlaceLoaded?.Invoke(address, scene);
        }

        /// <summary>After the places: every car's model and engine sound, one car per step, the selected/shown first.</summary>
        void PrefetchNextCar()
        {
            if (fleet == null || _carIndex >= fleet.vehicles.Length) return;
            if (_lastCar != null && !CarModels.Ready(_lastCar) && CarModels.IsLoading(_lastCar)) return; // one at a time
            var def = fleet.vehicles[_carIndex++];
            _lastCar = def;
            if (def == null || !CarModels.HasModel(def)) return;
            CarModels.Request(def);
            if (carAudio != null) carAudio.Prefetch(def.id);
        }
    }
}
