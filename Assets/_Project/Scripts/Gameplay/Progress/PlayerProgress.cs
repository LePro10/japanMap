using System;
using JapanMap.Core.Platform;
using JapanMap.Core.Save;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Progress
{
    /// <summary>
    /// The player's saved progress at runtime: loads it before anything spawns, owns the wallet balance,
    /// pays one-time rewards exactly once (claim ids), records purchases, and saves after every change that
    /// ASTRA §9 names (purchases, reward grants, discoveries, safe parking) — at most once per second.
    /// It is also the car loadout: the spawner builds the selected car with its fitted parts and looks.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class PlayerProgress : MonoBehaviour, ICarLoadout
    {
        [SerializeField] SparksWallet wallet;
        [SerializeField] VehicleFleet fleet;
        [SerializeField] TuningSettings tuning;
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] GameplayHud hud;
        [SerializeField] PlayerModeController player;
        [Tooltip("A parked spot is saved when it is this far from the saved one, m (ASTRA: save on safe parking).")]
        [SerializeField] float parkMoveMetres = 5f;
        [Tooltip("Longest wait for the starter car's model before play starts anyway (it swaps in when it lands), s.")]
        [SerializeField] float startCarWait = 12f;

        ProgressData _data;
        ISaveStore _store;
        bool _dirty;
        float _nextSave, _parkedFor;

        public ProgressData Data => _data;
        public ProgressStore.Source LoadedFrom { get; private set; }
        public string StoreName => _store?.Name ?? "";
        public TuningSettings Tuning => tuning;
        public VehicleFleet Fleet => fleet;
        public SparksWallet Wallet => wallet;
        /// <summary>Saves written in this session (tests, HUD).</summary>
        public int SaveCount { get; private set; }
        public event Action Changed;

        void Awake()
        {
            _store = SaveStores.Current;
            _data = ProgressStore.Load(_store, MaxBalance, out var source);
            LoadedFrom = source;
            if (fleet != null && UnlockAllFromUrl(Application.absoluteURL))
            {
                // The human's preview (serve-web --preview adds ?unlock=all): every car and full Sparks to try everything.
                foreach (var v in fleet.vehicles) if (v != null) _data.Car(v.id).owned = true;
                _data.sparks = MaxBalance;
                Debug.Log("[Save] unlock=all: all cars owned, Sparks full");
            }
            if (fleet != null)
            {
                var starter = fleet.Default;
                if (starter != null) _data.Car(starter.id).owned = true;
                if (fleet.Get(_data.selectedCar) == null || !Owns(_data.selectedCar)) _data.selectedCar = starter != null ? starter.id : "";
            }
            if (wallet != null)
            {
                wallet.Restore(_data.sparks);
                wallet.Changed += OnWallet;
            }
            if (spawner != null) spawner.Loadout = this;
            Debug.Log($"[Save] progress from {source} ({_store.Name}): {_data.sparks} Sparks, {_data.regions.Count} regions, " +
                      $"{_data.discoveries.Count} cards, {_data.cars.FindAll(c => c.owned).Count} cars");
        }

        /// <summary>
        /// Continue (ASTRA §2 "Returning is different"): a returning player sits in the selected car at the last safe
        /// parked spot; the first walking scene does not repeat. A spot that no longer has ground under it (world
        /// update) is dropped and the game starts at S as on a first visit.
        /// </summary>
        System.Collections.IEnumerator Start()
        {
            SaveSync.Resolved += OnSaveResolved;
            yield return null; // the spawner builds the car in its Start
            // The starter car streams (D36). Until its model lands the car is a grey box — the first thing a new player
            // saw on the human's phone (2026-10-11). The world counts as ready (gameplayStart, the page's loading screen
            // goes) only with the real car, at most startCarWait seconds; after that the box drives and swaps in place.
            var def = spawner != null && spawner.Current != null ? spawner.Current.Definition : null;
            var held = def != null && !CarModels.Ready(def) ? spawner.Current : null;
            if (held != null) held.HoldStill = true; // waiting under the loading screen: the car must not roll off
            for (var until = Time.realtimeSinceStartup + startCarWait; def != null && !CarModels.Ready(def) && Time.realtimeSinceStartup < until;)
            {
                CarModels.Request(def);
                yield return null;
            }
            if (held != null) held.HoldStill = false;
            GamePlatform.WorldReady = true;
            if (!_data.hasLastPosition || spawner == null || spawner.Current == null || player == null) yield break;
            var p = _data.lastPosition;
            if (!Physics.Raycast(p + Vector3.up * 3f, Vector3.down, out var hit, 8f, ~JapanMap.Core.GameLayers.NotGround, QueryTriggerInteraction.Ignore))
            {
                Debug.LogWarning($"[Save] last position {p} has no ground any more — starting at S");
                _data.hasLastPosition = false;
                yield break;
            }
            spawner.Current.Place(hit.point, _data.lastYaw, fromAbove: 3f);
            player.Seat();
            Resumed = true;
        }

        /// <summary>A copy was chosen (Choose progress, recovery swap): the game starts again on it, like a reload.</summary>
        void OnSaveResolved()
        {
            _dirty = false;
            UnityEngine.SceneManagement.SceneManager.LoadScene(gameObject.scene.name);
        }

        /// <summary>The game continued at the saved parked spot (tests).</summary>
        public bool Resumed { get; private set; }

        void OnDestroy()
        {
            GamePlatform.WorldReady = false;
            SaveSync.Resolved -= OnSaveResolved;
            if (wallet != null) wallet.Changed -= OnWallet;
            Flush();
        }

        void OnApplicationPause(bool paused)
        {
            if (paused) Flush();
        }

        void OnApplicationQuit() => Flush();

        /// <summary>
        /// ?unlock=all, honoured only off the store (localhost, *.local, quick tunnel): a player on CrazyGames
        /// cannot unlock anything by editing the URL.
        /// </summary>
        public static bool UnlockAllFromUrl(string url)
        {
            if (JapanMap.Core.QualitySystem.UrlParam(url, "unlock") != "all") return false;
            var host = url.Contains("://") ? url.Substring(url.IndexOf("://", StringComparison.Ordinal) + 3).Split('/', ':', '?')[0] : "";
            return host == "127.0.0.1" || host == "localhost" || host.EndsWith(".local") || host.EndsWith(".trycloudflare.com");
        }

        int MaxBalance => wallet != null && wallet.Settings != null ? wallet.Settings.maxBalance : 9_999_999;

        void OnWallet()
        {
            if (_data.sparks == wallet.Balance) return; // the restore at load changes nothing: no save, no tick
            _data.sparks = wallet.Balance;
            MarkDirty();
        }

        public void MarkDirty()
        {
            _dirty = true;
            Changed?.Invoke();
        }

        void Update()
        {
            _data.playSeconds += Time.unscaledDeltaTime;
            TrackParking();
            if (_dirty && Time.unscaledTime >= _nextSave) Flush();
        }

        /// <summary>Writes now if anything changed. Returns true when a save was written.</summary>
        public bool Flush()
        {
            if (!_dirty || _data == null || _store == null) return false;
            // Two copies disagree and the player has not chosen yet: writing now would decide for them.
            if (SaveSync.Pending != null) return false;
            _nextSave = Time.unscaledTime + 1f;
            // Clear the flag only after a write that worked: a failed save stays dirty and is retried after the wait above.
            if (!ProgressStore.Save(_store, _data)) return false;
            _dirty = false;
            SaveCount++;
            // One line per save (saves are rare: grants, purchases, parking) — Tools/save-web.mjs reads it.
            Debug.Log($"[Save] saved #{SaveCount} to {_store.Name}: {_data.sparks} Sparks, {_data.regions.Count} regions, {_data.discoveries.Count} cards");
            if (hud != null) hud.ShowSaved(_store.Name);
            return true;
        }

        /// <summary>Last safe position: the car stands still for 2 s (never mid-jump or mid-race).</summary>
        void TrackParking()
        {
            var car = spawner != null ? spawner.Current : null;
            // Not in a menu, not during a countdown, and never an event loan (Open Seat's Needle): only the player's
            // own selected car leaves a safe spot to continue from.
            if (car == null || car.HoldStill || car.Definition.id != _data.selectedCar) return;
            var still = car.Telemetry.speed < 0.5f && !car.Telemetry.airborne;
            _parkedFor = still ? _parkedFor + Time.deltaTime : 0f;
            if (_parkedFor < 2f) return;
            var at = car.transform.position;
            if (_data.hasLastPosition && (at - _data.lastPosition).sqrMagnitude < parkMoveMetres * parkMoveMetres) return;
            _data.hasLastPosition = true;
            _data.lastPosition = car.transform.position;
            _data.lastYaw = car.transform.eulerAngles.y;
            MarkDirty();
        }

        // ── one-time rewards ─────────────────────────────────────────────────

        public bool Claimed(string claim) => _data.claims.Contains(claim);

        /// <summary>Pays <paramref name="sparks"/> once for this claim id. False (and nothing paid) if already claimed.</summary>
        public bool Grant(string claim, int sparks, string reason)
        {
            if (Claimed(claim)) return false;
            _data.claims.Add(claim);
            if (wallet != null && sparks > 0) wallet.Add(sparks, reason);
            MarkDirty();
            Flush();
            return true;
        }

        // ── garage ───────────────────────────────────────────────────────────

        public bool Owns(string carId) => _data.Car(carId, false)?.owned == true;
        public CarState Car(string carId) => _data.Car(carId);

        public bool BuyCar(VehicleDefinition def)
        {
            if (def == null || Owns(def.id) || wallet == null || !wallet.Spend(def.price)) return false;
            _data.Car(def.id).owned = true;
            Purchased($"car:{def.id}");
            return true;
        }

        public void Select(string carId)
        {
            if (!Owns(carId)) return;
            _data.selectedCar = carId;
            MarkDirty();
            Flush();
        }

        /// <summary>Buy and fit tiers up to <paramref name="tier"/> (sequential; incremental prices). Downgrades are free.</summary>
        public bool Fit(string carId, TuneCategory c, int tier)
        {
            if (!Owns(carId)) return false;
            var state = Car(carId);
            var have = state.tune[c];
            if (tier <= have)
            {
                state.tune[c] = tier;
                MarkDirty();
                Flush();
                return true;
            }
            var bought = Bought(carId, c);
            var cost = 0;
            for (var t = bought + 1; t <= tier; t++) cost += tuning.Price(c, t);
            if (wallet == null || !wallet.Spend(cost)) return false;
            for (var t = bought + 1; t <= tier; t++) _data.purchases.Add($"tune:{carId}:{c}:{t}");
            state.tune[c] = tier;
            Purchased(null);
            return true;
        }

        /// <summary>Highest tier ever bought for this category (a refitted lower tier keeps the higher one owned).</summary>
        public int Bought(string carId, TuneCategory c)
        {
            var b = 0;
            for (var t = 1; t <= 2; t++) if (_data.purchases.Contains($"tune:{carId}:{c}:{t}")) b = t;
            return b;
        }

        /// <summary>Price to fit this tier now (0 when already bought).</summary>
        public int FitCost(string carId, TuneCategory c, int tier)
        {
            var cost = 0;
            for (var t = Bought(carId, c) + 1; t <= tier; t++) cost += tuning.Price(c, t);
            return cost;
        }

        public void SetSetup(string carId, CarSetupMode mode)
        {
            if (!Owns(carId)) return;
            Car(carId).setup = mode;
            MarkDirty();
            Flush();
        }

        /// <summary>Applies a palette colour ("" = factory livery); buys it first if needed (ASTRA: once per car).</summary>
        public bool Paint(VehicleDefinition def, string colour)
        {
            if (!Owns(def.id)) return false;
            var state = Car(def.id);
            var free = string.IsNullOrEmpty(colour) || colour == def.factoryPaint || state.paints.Contains(colour);
            if (!free)
            {
                if (wallet == null || !wallet.Spend(tuning.paintPrice)) return false;
                state.paints.Add(colour);
                _data.purchases.Add($"paint:{def.id}:{colour}");
            }
            state.paint = colour;
            Purchased(null);
            return true;
        }

        /// <summary>Fits rim set / body kit option 0–2; options 1 and 2 are bought once per car.</summary>
        public bool FitLook(string carId, bool kit, int option)
        {
            if (!Owns(carId)) return false;
            var state = Car(carId);
            var owned = kit ? state.aeroKits : state.wheelSets;
            if (option > 0 && !owned.Contains(option))
            {
                if (wallet == null || !wallet.Spend(kit ? tuning.kitPrice : tuning.wheelPrice)) return false;
                owned.Add(option);
                _data.purchases.Add($"{(kit ? "kit" : "wheels")}:{carId}:{option}");
            }
            if (kit) state.aero = option;
            else state.wheels = option;
            Purchased(null);
            return true;
        }

        void Purchased(string entry)
        {
            if (entry != null) _data.purchases.Add(entry);
            MarkDirty();
            Flush();
        }

        // ── ICarLoadout ──────────────────────────────────────────────────────

        public string SelectedCar => _data?.selectedCar;

        public ArcadeSpec SpecFor(VehicleDefinition def, out float crawlShare)
        {
            crawlShare = -1f;
            var state = Owns(def.id) ? _data.Car(def.id, false) : null;
            if (state == null || tuning == null) return null;
            if (state.setup == CarSetupMode.SafeReturn) crawlShare = tuning.safeCrawl;
            return tuning.Apply(def, state.tune, state.setup);
        }

        public void Dress(VehicleDefinition def, Transform model)
        {
            var state = Owns(def.id) ? _data.Car(def.id, false) : null;
            if (state == null) return;
            Color? paint = string.IsNullOrEmpty(state.paint) || tuning == null ? null : tuning.PaintColor(state.paint);
            CarLooks.Apply(model, state.tune.engine, state.aero, state.wheels, paint);
        }
    }
}
