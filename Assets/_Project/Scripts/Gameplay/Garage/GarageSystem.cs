using System;
using System.Collections.Generic;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Vehicles;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Garage
{
    /// <summary>
    /// The garage at the Open Bay: dealer (every car, all prices from the start — ASTRA §6), the four tuning
    /// categories with Street/Sport tiers, the free setups, palette paint, rims and body kits. Every change rebuilds
    /// the real player car through the spawner, so what stands in the bay is exactly what drives away.
    /// PROVISIONAL look: a plain UI Toolkit sheet until the menus of Phase 9.
    /// </summary>
    public sealed class GarageSystem : MonoBehaviour
    {
        [SerializeField] GarageSettings settings;
        [SerializeField] PlayerProgress progress;
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] GameplayHud hud;
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] InputActionAsset actions;

        UIDocument _doc;
        VisualElement _root, _list, _detail;
        Label _title, _stats, _balance, _status;
        CinemachineCamera _cam;
        InputAction _use;
        string _shown = "";
        float _openedAt;

        public bool IsOpen { get; private set; }
        /// <summary>Car on display (may be one the player does not own yet).</summary>
        public string Shown => _shown;
        public string Status => _status?.text ?? "";
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
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = panelSettings;
            _doc.sortingOrder = 6;
            if (actions != null) _use = actions.FindActionMap("Player", true).FindAction("Use", true);
            var camGo = new GameObject("GarageCamera");
            camGo.transform.SetParent(transform, false);
            camGo.transform.position = settings.cameraAt;
            camGo.transform.LookAt(settings.lookAt);
            _cam = camGo.AddComponent<CinemachineCamera>();
            _cam.Priority = 50;
            _cam.Lens = new LensSettings { FieldOfView = settings.fieldOfView, NearClipPlane = 0.1f, FarClipPlane = 2000f };
            camGo.SetActive(false);
        }

        void OnEnable()
        {
            BuildUi();
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

        void OnUse(InputAction.CallbackContext _) => Use();

        void Update()
        {
            if (IsOpen)
            {
                if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame) Close();
                return;
            }
            var near = InReach();
            if (hud != null) hud.SetPrompt(this, near ? "E  Garage · cars and tuning" : "");
        }

        bool InReach()
        {
            if (player == null || player.Suspended) return false;
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

        /// <summary>Use (E, touch USE): open when in reach; inside, E closes again.</summary>
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
            _root.style.display = DisplayStyle.Flex;
            if (hud != null) hud.Hidden = true;
            UnityEngine.Cursor.lockState = CursorLockMode.None;
            UnityEngine.Cursor.visible = true;
            Refresh();
            OpenChanged?.Invoke(true);
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            // A car on display that is not owned goes back; the selected owned car drives out.
            var def = progress.Fleet.Get(progress.Data.selectedCar) ?? progress.Fleet.Default;
            spawner.SpawnAt(def, settings.exit, settings.exitHeading);
            _cam.gameObject.SetActive(false);
            _root.style.display = DisplayStyle.None;
            if (hud != null) hud.Hidden = false;
            player.SetSuspended(false);
            progress.Flush();
            OpenChanged?.Invoke(false);
        }

        /// <summary>Put this car on the bay floor, built with its saved parts (stock when not owned).</summary>
        void Show(string id)
        {
            var def = progress.Fleet.Get(id) ?? progress.Fleet.Default;
            _shown = def.id;
            var car = spawner.SpawnAt(def, settings.bay, settings.bayHeading);
            car.HoldStill = true;
        }

        // ── actions (public for tests and play scripts; the buttons call the same) ──────────────

        public void Pick(string id)
        {
            Show(id);
            if (progress.Owns(id)) progress.Select(id);
            Refresh();
        }

        public bool Buy()
        {
            var def = progress.Fleet.Get(_shown);
            var ok = progress.BuyCar(def);
            if (ok) progress.Select(def.id);
            Say(ok ? $"{def.displayName} is yours." : $"Not enough Sparks for {def.displayName}.");
            Show(_shown);
            Refresh();
            return ok;
        }

        public bool Fit(TuneCategory c, int tier)
        {
            var ok = progress.Fit(_shown, c, tier);
            var name = progress.Tuning.Info(c).title;
            Say(ok ? $"{name}: {TierName(tier)} fitted." : $"Not enough Sparks for {name} {TierName(tier)}.");
            if (ok) Show(_shown);
            Refresh();
            return ok;
        }

        public void Setup(CarSetupMode mode)
        {
            progress.SetSetup(_shown, mode);
            Say($"Setup: {SetupName(mode)}.");
            Show(_shown);
            Refresh();
        }

        public bool Paint(string colour)
        {
            var def = progress.Fleet.Get(_shown);
            var ok = progress.Paint(def, colour);
            Say(ok ? (colour == "" ? "Factory livery." : $"Painted {colour}.") : "Not enough Sparks for this colour.");
            if (ok) Show(_shown);
            Refresh();
            return ok;
        }

        public bool Look(bool kit, int option)
        {
            var ok = progress.FitLook(_shown, kit, option);
            Say(ok ? $"{(kit ? "Body kit" : "Rims")} {option} fitted." : "Not enough Sparks.");
            if (ok) Show(_shown);
            Refresh();
            return ok;
        }

        void Say(string text)
        {
            if (_status != null) _status.text = text;
        }

        static string TierName(int t) => t == 0 ? "Stock" : t == 1 ? "Street" : "Sport";
        static string SetupName(CarSetupMode m) => m == CarSetupMode.SafeReturn ? "Safe Return" : m.ToString();

        // ── sheet ────────────────────────────────────────────────────────────

        void BuildUi()
        {
            _root = _doc.rootVisualElement;
            _root.Clear();
            _root.style.position = Position.Absolute;
            _root.style.left = _root.style.top = _root.style.bottom = 0;
            _root.style.right = 0;
            _root.style.flexDirection = FlexDirection.Row;
            _root.style.justifyContent = Justify.SpaceBetween;
            _root.style.paddingLeft = _root.style.paddingRight = 24;
            _root.style.paddingTop = _root.style.paddingBottom = 24;
            _root.pickingMode = PickingMode.Ignore;

            var left = Panel(_root, 300);
            Heading(left, "Cars");
            _list = new ScrollView();
            _list.style.flexGrow = 1;
            left.Add(_list);

            var right = Panel(_root, 470);
            _title = Heading(right, "");
            _balance = Line(right, 22, new Color(1f, 0.82f, 0.35f));
            _stats = Line(right, 18, new Color(0.85f, 0.88f, 0.92f));
            _stats.style.whiteSpace = WhiteSpace.Normal;
            var scroll = new ScrollView();
            scroll.style.flexGrow = 1;
            right.Add(scroll);
            _detail = scroll;
            _status = Line(right, 18, new Color(0.7f, 0.95f, 0.8f));
            var close = Button(right, "Drive out  (E / Esc)", Close);
            close.style.marginTop = 8;
            close.style.height = 44;
            _root.style.display = DisplayStyle.None;
        }

        void Refresh()
        {
            if (_list == null || progress == null) return;
            var fleet = progress.Fleet;
            _list.Clear();
            foreach (var v in fleet.vehicles)
            {
                if (v == null) continue;
                var owned = progress.Owns(v.id);
                var tag = progress.Data.selectedCar == v.id ? "  · driving" : owned ? "  · owned" : $"  · {v.price:N0}";
                var b = Button(_list, $"{v.displayName}{tag}", () => Pick(v.id));
                b.style.backgroundColor = v.id == _shown ? new Color(0.25f, 0.4f, 0.6f, 0.9f) : new Color(0.15f, 0.16f, 0.2f, 0.9f);
            }

            var def = fleet.Get(_shown);
            var state = progress.Owns(def.id) ? progress.Car(def.id) : null;
            var tune = state?.tune ?? default;
            var stock = def.arcade;
            var spec = progress.Tuning.Apply(def, tune, state?.setup ?? CarSetupMode.Road);
            _title.text = $"{def.displayName}  ·  {def.category}";
            _balance.text = $"{progress.Wallet.Balance:N0} Sparks";
            _stats.text =
                $"Top speed {Kmh(def, spec):0} km/h{Delta(Kmh(def, spec), Kmh(def, stock))}   ·   Power {spec.power / 1000f:0} kW{Delta(spec.power, stock.power)}\n" +
                $"Grip {spec.latG:0.00} g{Delta(spec.latG, stock.latG)}   ·   Braking {spec.brakeG:0.00} g{Delta(spec.brakeG, stock.brakeG)}   ·   {def.mass:0} kg";

            _detail.Clear();
            if (state == null)
            {
                Line(_detail, 18, Color.white).text = "All cars are on sale from the start. Parts, setup and paint after buying.";
                var afford = progress.Wallet.Balance >= def.price;
                var buy = Button(_detail, $"Buy · {def.price:N0} Sparks", () => Buy());
                buy.SetEnabled(afford);
                buy.style.height = 48;
                if (!afford) Line(_detail, 16, new Color(1f, 0.7f, 0.6f)).text = $"{def.price - progress.Wallet.Balance:N0} Sparks to go.";
                return;
            }

            Heading(_detail, "Performance parts");
            foreach (var c in CarTune.All)
            {
                var info = progress.Tuning.Info(c);
                var row = Row(_detail);
                var name = Line(row, 17, Color.white);
                name.text = info.title;
                name.style.width = 90;
                for (var t = 0; t <= 2; t++)
                {
                    var tier = t;
                    var cost = progress.FitCost(def.id, c, tier);
                    var fitted = tune[c] == tier;
                    var label = TierName(tier) + (cost > 0 ? $" {cost:N0}" : fitted ? " ✓" : "");
                    var b = Button(row, label, () => Fit(c, tier));
                    b.style.flexGrow = 1;
                    b.style.backgroundColor = fitted ? new Color(0.2f, 0.5f, 0.35f, 0.95f) : new Color(0.15f, 0.16f, 0.2f, 0.9f);
                    b.SetEnabled(!fitted && cost <= progress.Wallet.Balance);
                }
            }

            Heading(_detail, "Setup (free)");
            var setups = Row(_detail);
            foreach (var m in TuningSettings.SetupsFor(def))
            {
                var mode = m;
                var b = Button(setups, SetupName(m), () => Setup(mode));
                b.style.flexGrow = 1;
                b.style.backgroundColor = state.setup == m ? new Color(0.2f, 0.5f, 0.35f, 0.95f) : new Color(0.15f, 0.16f, 0.2f, 0.9f);
            }

            Heading(_detail, $"Paint · {progress.Tuning.paintPrice} per new colour");
            var paints = Row(_detail);
            paints.style.flexWrap = Wrap.Wrap;
            var factory = Button(paints, "Factory", () => Paint(""));
            factory.style.backgroundColor = state.paint == "" ? new Color(0.2f, 0.5f, 0.35f, 0.95f) : new Color(0.15f, 0.16f, 0.2f, 0.9f);
            foreach (var colour in progress.Tuning.palette)
            {
                var name = colour;
                var sw = Button(paints, "", () => Paint(name));
                sw.tooltip = colour;
                sw.style.width = sw.style.height = 30;
                sw.style.backgroundColor = progress.Tuning.PaintColor(colour);
                var mine = state.paints.Contains(colour) || colour == def.factoryPaint;
                var on = state.paint == colour;
                sw.style.borderBottomWidth = sw.style.borderTopWidth = sw.style.borderLeftWidth = sw.style.borderRightWidth = on ? 3 : mine ? 1 : 0;
                sw.style.borderBottomColor = sw.style.borderTopColor = sw.style.borderLeftColor = sw.style.borderRightColor = Color.white;
                sw.SetEnabled(mine || progress.Wallet.Balance >= progress.Tuning.paintPrice);
            }

            LookRow("Rims", false, state.wheels, state.wheelSets, progress.Tuning.wheelPrice);
            LookRow("Body kit", true, state.aero, state.aeroKits, progress.Tuning.kitPrice);
        }

        void LookRow(string title, bool kit, int fitted, List<int> owned, int price)
        {
            Heading(_detail, $"{title} · {price} each");
            var row = Row(_detail);
            for (var o = 0; o <= 2; o++)
            {
                var option = o;
                var mine = o == 0 || owned.Contains(o);
                var label = o == 0 ? "Factory" : $"Option {o}{(mine ? "" : $" {price}")}";
                var b = Button(row, label, () => Look(kit, option));
                b.style.flexGrow = 1;
                b.style.backgroundColor = fitted == o ? new Color(0.2f, 0.5f, 0.35f, 0.95f) : new Color(0.15f, 0.16f, 0.2f, 0.9f);
                b.SetEnabled(fitted != o && (mine || progress.Wallet.Balance >= price));
            }
        }

        static float Kmh(VehicleDefinition def, ArcadeSpec s) => s.TopSpeed(def.mass) * 3.6f;

        static string Delta(float now, float stock)
        {
            var pct = (now / stock - 1f) * 100f;
            return Mathf.Abs(pct) < 0.5f ? "" : $" ({(pct > 0 ? "+" : "−")}{Mathf.Abs(pct):0} %)";
        }

        static VisualElement Panel(VisualElement parent, float width)
        {
            var p = new VisualElement();
            p.style.width = width;
            p.style.backgroundColor = new Color(0.05f, 0.06f, 0.1f, 0.88f);
            p.style.paddingLeft = p.style.paddingRight = p.style.paddingTop = p.style.paddingBottom = 14;
            p.style.borderTopLeftRadius = p.style.borderTopRightRadius = p.style.borderBottomLeftRadius = p.style.borderBottomRightRadius = 10;
            parent.Add(p);
            return p;
        }

        static VisualElement Row(VisualElement parent)
        {
            var r = new VisualElement();
            r.style.flexDirection = FlexDirection.Row;
            r.style.alignItems = Align.Center;
            r.style.marginBottom = 4;
            parent.Add(r);
            return r;
        }

        static Label Heading(VisualElement parent, string text)
        {
            var l = Line(parent, 22, Color.white);
            l.text = text;
            l.style.unityFontStyleAndWeight = FontStyle.Bold;
            l.style.marginTop = 8;
            return l;
        }

        static Label Line(VisualElement parent, float size, Color color)
        {
            var l = new Label();
            l.style.fontSize = size;
            l.style.color = color;
            l.style.marginBottom = 4;
            parent.Add(l);
            return l;
        }

        static Button Button(VisualElement parent, string text, Action click)
        {
            var b = new Button(click) { text = text };
            b.style.fontSize = 16;
            b.style.color = Color.white;
            b.style.minHeight = 32;
            b.style.backgroundColor = new Color(0.15f, 0.16f, 0.2f, 0.9f);
            b.style.borderTopWidth = b.style.borderBottomWidth = b.style.borderLeftWidth = b.style.borderRightWidth = 0;
            b.style.marginRight = 4;
            parent.Add(b);
            return b;
        }
    }
}
