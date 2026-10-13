using System;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Vehicles;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Gameplay.Garage
{
    /// <summary>
    /// Cars and tuning, ASTRA §6/§10: the dealer (every car on sale from the start), four tuning categories with
    /// Street/Sport, free setups, palette paint, rims and kits — the page is the menu's Cars tab
    /// (<see cref="CarsScreen"/>), this is its stage. At the Open Bay (E) the car stands on the hall floor under a
    /// camera and every change rebuilds the real player car there, so what stands in the bay drives away. From the
    /// menu anywhere else the changes reach the car the moment it stands still. Free 90 s test drive of any car.
    /// </summary>
    public sealed class GarageSystem : MonoBehaviour
    {
        [SerializeField] GarageSettings settings;
        [SerializeField] PlayerProgress progress;
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] GameplayHud hud;
        [SerializeField] InputActionAsset actions;

        CinemachineCamera _cam;
        InputAction _use;
        CarsScreen _screen;
        string _shown = "";
        string _status = "";
        float _openedAt;
        bool _apply, _closing;

        // Test drive: the car and place to return to.
        VehicleDefinition _testReturnCar;
        Vector3 _testReturnAt;
        float _testReturnYaw, _testLeft;
        // Long loan (ASTRA §12): the same return path as a test drive, longer, with a warning and a safe stop.
        bool _loan, _warned;
        float _overFor;
        string _testCar = "";
        readonly System.Collections.Generic.HashSet<string> _tested = new();

        public bool IsOpen { get; private set; }
        /// <summary>The car is on the Open Bay floor (garage opened with E).</summary>
        public bool InBay => IsOpen;
        /// <summary>Car on display (may be one the player does not own yet).</summary>
        public string Shown => _shown;
        public string Status => _status;
        public float TestDriveSeconds => settings.testDriveSeconds;
        public bool TestDriving => _testReturnCar != null;
        public float TestDriveLeft => _testLeft;
        /// <summary>The borrowed car is a long loan (ad or Sparks), not the free test drive.</summary>
        public bool Lending => TestDriving && _loan;
        /// <summary>Car on test drive or loan ("" when none).</summary>
        public string TestCar => TestDriving ? _testCar : "";
        /// <summary>This car had its free test drive this session (the loan offers follow it, ASTRA §12).</summary>
        public bool WasTested(string id) => _tested.Contains(id);
        /// <summary>Loan warning and end settings (set by <see cref="Economy.RewardedOffers"/>).</summary>
        public float LoanWarnSeconds { get; set; } = 30f;
        public float LoanStopSeconds { get; set; } = 20f;
        public CarsScreen Screen => _screen;
        /// <summary>Middle of the entry zone in front of the bay (x, z).</summary>
        public Vector2 Entry => settings.entry;
        public event Action<bool> OpenChanged;

        public void Configure(GarageSettings s, PlayerProgress p, PlayerModeController pm, PlayerCarSpawner sp, GameplayHud h)
        {
            settings = s;
            progress = p;
            player = pm;
            spawner = sp;
            hud = h;
        }

        void Awake()
        {
            if (actions != null) _use = actions.FindActionMap("Player", true).FindAction("Use", true);
            var camGo = new GameObject("GarageCamera");
            camGo.transform.SetParent(transform, false);
            camGo.transform.position = settings.cameraAt;
            camGo.transform.LookAt(settings.lookAt);
            _cam = camGo.AddComponent<CinemachineCamera>();
            _cam.Priority = 50;
            _cam.Lens = new LensSettings { FieldOfView = settings.fieldOfView, NearClipPlane = 0.1f, FarClipPlane = 2000f };
            camGo.SetActive(false);
            _screen = new CarsScreen(this, progress);
        }

        object _pin;

        void Start()
        {
            if (GameMenu.Instance != null) GameMenu.Instance.OpenChanged += OnMenu;
            // Seen from across the court: players follow what they see, not the map (legacy Open Bay marker).
            if (WorldPins.Instance != null)
                _pin = WorldPins.Instance.Add(this, new Vector3(settings.entry.x, settings.exit.y, settings.entry.y), "TUNE & CARS", "Open Bay", new Color(0.95f, 0.77f, 0.42f));
        }

        void OnEnable()
        {
            if (_use != null)
            {
                _use.Enable();
                _use.performed += OnUse;
            }
            if (hud != null) hud.UsePressed += Use;
        }

        void OnDisable()
        {
            if (_use != null) _use.performed -= OnUse;
            if (hud != null) hud.UsePressed -= Use;
        }

        void OnDestroy()
        {
            if (GameMenu.Instance != null) GameMenu.Instance.OpenChanged -= OnMenu;
        }

        void OnUse(InputAction.CallbackContext _) => Use();

        // Closing the menu (Continue, Esc) in the bay drives out.
        void OnMenu(bool open)
        {
            if (!open && IsOpen && !_closing) Close();
        }

        void Update()
        {
            if (TestDriving) TickBorrowed();
            if (_apply && !IsOpen && (GameMenu.Instance == null || !GameMenu.Instance.IsOpen)) TryApply();
            if (_pin != null) WorldPins.Instance.SetVisible(_pin, !IsOpen && !TestDriving);
            if (IsOpen) return;
            if (hud != null) hud.SetPrompt(this, InReach() ? "E  Garage · cars and tuning" : "");
        }

        bool InReach()
        {
            if (player == null || player.Suspended || TestDriving) return false;
            Vector3 p;
            if (player.Current == PlayerModeController.Mode.Driving && player.Car != null)
            {
                if (player.Car.Telemetry.speed * 3.6f > settings.entryKmh) return false;
                p = player.Car.transform.position;
            }
            else if (player.Walker != null && player.Walker.gameObject.activeInHierarchy) p = player.Walker.transform.position;
            else return false;
            return new Vector2(p.x - settings.entry.x, p.z - settings.entry.y).magnitude <= settings.entryRadius;
        }

        /// <summary>Use (E, touch USE): open when in reach; inside, E drives out again.</summary>
        public void Use()
        {
            if (IsOpen)
            {
                if (Time.unscaledTime - _openedAt > 0.3f) Close();
                return;
            }
            if (!InReach() || (hud != null && hud.PromptOwner != (object)this)) return;
            Open();
        }

        public void Open()
        {
            if (IsOpen) return;
            IsOpen = true;
            _openedAt = Time.unscaledTime;
            if (hud != null) hud.SetPrompt(this, "");
            player.Seat();
            player.SetSuspended(true);
            _shown = progress.Data.selectedCar;
            Show(_shown);
            _cam.gameObject.SetActive(true);
            if (hud != null) hud.Hidden = true;
            var menu = GameMenu.Instance;
            if (menu != null)
            {
                menu.AllowOverSuspended = true;
                menu.Open(_screen, pause: false);
                menu.AllowOverSuspended = false;
            }
            OpenChanged?.Invoke(true);
        }

        public void Close()
        {
            if (!IsOpen) return;
            _closing = true;
            IsOpen = false;
            if (GameMenu.Instance != null && GameMenu.Instance.IsOpen) GameMenu.Instance.Close();
            // A car on display that is not owned goes back; the selected owned car drives out.
            var def = progress.Fleet.Get(progress.Data.selectedCar) ?? progress.Fleet.Default;
            spawner.SpawnAt(def, settings.exit, settings.exitHeading);
            _cam.gameObject.SetActive(false);
            if (hud != null) hud.Hidden = false;
            player.SetSuspended(false);
            progress.Flush();
            _apply = false;
            _closing = false;
            OpenChanged?.Invoke(false);
        }

        /// <summary>Put this car on the bay floor, built with its saved parts (stock when not owned).</summary>
        void Show(string id)
        {
            var def = progress.Fleet.Get(id) ?? progress.Fleet.Default;
            _shown = def.id;
            if (!IsOpen) return;
            var car = spawner.SpawnAt(def, settings.bay, settings.bayHeading);
            car.HoldStill = true;
        }

        /// <summary>Outside the bay: rebuild the player's car with its new parts as soon as it stands still.</summary>
        public void ApplySoon()
        {
            if (IsOpen) return;
            _apply = true;
            // In the pause menu the car stands still and turns in front of the camera (MenuCamera): show the change
            // on it now, not after closing — paint, rims and kits are bought to be seen.
            if (GameMenu.Instance != null && GameMenu.Instance.IsOpen) TryApply();
        }

        void TryApply()
        {
            var car = player != null ? player.Car : null;
            if (car == null || TestDriving) return;
            if (car.Telemetry.speed * 3.6f > settings.applyBelowKmh) return;
            _apply = false;
            var def = progress.Fleet.Get(progress.Data.selectedCar) ?? progress.Fleet.Default;
            var t = car.transform;
            var walking = player.Current == PlayerModeController.Mode.Walking;
            spawner.SpawnAt(def, t.position, t.eulerAngles.y);
            if (!walking) player.Seat();
            Debug.Log($"[Garage] applied {def.id} where it stood");
        }

        // ── actions (public for tests and play scripts; the page's buttons call the same) ─────────────

        public void Pick(string id)
        {
            Show(id);
            if (progress.Owns(id)) progress.Select(id);
        }

        public bool Buy()
        {
            var def = progress.Fleet.Get(_shown);
            var ok = progress.BuyCar(def);
            if (ok) progress.Select(def.id);
            Say(ok ? $"{def.displayName} is yours." : $"Not enough Sparks for {def.displayName}.");
            Show(_shown);
            return ok;
        }

        public bool Fit(TuneCategory c, int tier)
        {
            var ok = progress.Fit(_shown, c, tier);
            var name = progress.Tuning.Info(c).title;
            Say(ok ? $"{name}: {TierName(tier)} fitted." : $"Not enough Sparks for {name} {TierName(tier)}.");
            if (ok) Show(_shown);
            return ok;
        }

        public void Setup(CarSetupMode mode)
        {
            progress.SetSetup(_shown, mode);
            Say($"Setup: {(mode == CarSetupMode.SafeReturn ? "Safe Return" : mode.ToString())}.");
            Show(_shown);
        }

        public bool Paint(string colour)
        {
            var def = progress.Fleet.Get(_shown);
            var ok = progress.Paint(def, colour);
            Say(ok ? (colour == "" ? "Factory livery." : $"Painted {colour}.") : "Not enough Sparks for this colour.");
            if (ok) Show(_shown);
            return ok;
        }

        public bool Look(bool kit, int option)
        {
            var ok = progress.FitLook(_shown, kit, option);
            Say(ok ? $"{(kit ? "Body kit" : "Rims")} {option} fitted." : "Not enough Sparks.");
            if (ok) Show(_shown);
            return ok;
        }

        /// <summary>
        /// Free test drive (ASTRA §6/§10): the car on the practice spur out of the court for 90 s, stock parts, no
        /// records or Sparks (they count the selected own car only); then back to the own car where it was.
        /// </summary>
        public bool TestDrive(string id)
        {
            var def = progress.Fleet.Get(id);
            if (def == null || player == null || player.Car == null || TestDriving) return false;
            if (IsOpen) Close();
            var own = player.Car;
            _testReturnCar = own.Definition;
            _testReturnAt = own.transform.position;
            _testReturnYaw = own.transform.eulerAngles.y;
            _testLeft = settings.testDriveSeconds;
            _loan = false;
            _testCar = id;
            _tested.Add(id);
            if (progress.Wallet != null) progress.Wallet.Frozen = true; // test drives earn nothing (ASTRA §9)
            spawner.SpawnAt(def, settings.testDriveAt, settings.testDriveHeading);
            player.Seat();
            hud?.Flash($"Test drive · {def.displayName} · {settings.testDriveSeconds:0} s");
            return true;
        }

        /// <param name="here">Own car back where the borrowed one stands (an event starts here), not at the old spot.</param>
        public void EndTestDrive(bool here = false)
        {
            if (!TestDriving) return;
            if (here && player.Car != null)
            {
                _testReturnAt = player.Car.transform.position;
                _testReturnYaw = player.Car.transform.eulerAngles.y;
            }
            var def = _testReturnCar;
            var wasLoan = _loan;
            _testReturnCar = null;
            _loan = false;
            if (progress != null && progress.Wallet != null) progress.Wallet.Frozen = false;
            spawner.SpawnAt(def, _testReturnAt, _testReturnYaw);
            player.Seat();
            hud?.SetActivity("");
            hud?.Flash(wasLoan ? "Loan over · back in your own car" : "Test drive over");
        }

        /// <summary>
        /// Long loan (ASTRA §12): free driving and photos in a car not owned for <paramref name="seconds"/> of active
        /// time (menus and photos pause it), no Sparks/records/discoveries; it starts where the own car stands.
        /// </summary>
        public bool Borrow(string id, float seconds)
        {
            var def = progress.Fleet.Get(id);
            if (def == null || player == null || player.Car == null || TestDriving) return false;
            if (IsOpen) Close();
            var own = player.Car;
            _testReturnCar = own.Definition;
            _testReturnAt = own.transform.position;
            _testReturnYaw = own.transform.eulerAngles.y;
            _testLeft = seconds;
            _loan = true;
            _warned = false;
            _overFor = 0f;
            _testCar = id;
            if (progress.Wallet != null) progress.Wallet.Frozen = true;
            spawner.SpawnAt(def, _testReturnAt, _testReturnYaw);
            player.Seat();
            hud?.Flash($"Loan · {def.displayName} · {seconds / 60f:0} min");
            return true;
        }

        void TickBorrowed()
        {
            _testLeft -= Time.deltaTime;
            if (!_loan)
            {
                hud?.SetActivity($"TEST DRIVE  {Mathf.CeilToInt(Mathf.Max(0f, _testLeft))} s");
                if (_testLeft <= 0f) EndTestDrive();
                return;
            }
            if (_testLeft > 0f)
            {
                var left = Mathf.CeilToInt(_testLeft);
                hud?.SetActivity($"LOAN  {left / 60}:{left % 60:00}");
                if (!_warned && _testLeft <= LoanWarnSeconds)
                {
                    _warned = true;
                    hud?.Flash($"Loan ends in {LoanWarnSeconds:0} s");
                }
                return;
            }
            // Over: never swap the car at speed. First a chance to stop, then the car brakes itself to a stop.
            var car = player != null ? player.Car : null;
            var moving = car != null && player.Current == PlayerModeController.Mode.Driving && car.Telemetry.speed > 1f;
            if (!moving)
            {
                if (car != null) car.HoldStill = false;
                EndTestDrive();
                return;
            }
            _overFor += Time.deltaTime;
            hud?.SetActivity("LOAN OVER · please stop");
            if (_overFor >= LoanStopSeconds) car.HoldStill = true;
        }

        void Say(string text) => _status = text;

        static string TierName(int t) => t == 0 ? "Stock" : t == 1 ? "Street" : "Sport";
    }
}
