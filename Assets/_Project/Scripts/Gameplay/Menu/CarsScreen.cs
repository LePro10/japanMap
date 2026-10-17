using System.Collections.Generic;
using System.Text;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Progress;
using JapanMap.UI;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Cars (ASTRA §10): one labelled switch Owned / Showroom, filters All / Street / Utility / Sport / Track, a card
    /// strip and the car detail — labelled values (no unexplained bars), Buy through a purchase sheet (balance before
    /// and after, the exact amount missing), Drive, Test drive (90 s, free), Tune, Appearance. In the Open Bay the car
    /// on the floor follows the selection; elsewhere changes apply to the car when it next stands still.
    /// </summary>
    public sealed class CarsScreen : MenuScreen
    {
        enum Page { List, Tune, Look }

        static readonly string[] Filters = { "All", "Street", "Utility", "Sport", "Track" };
        readonly GarageSystem _garage;
        readonly PlayerProgress _progress;
        bool _showroom;
        int _filter;
        Page _page;
        string _text = "";
        // Cars whose loan ad found no ad: "No ad available" once, then the ad button stays away (ASTRA §12).
        readonly HashSet<string> _noAd = new();
        string _loanNote = "";

        public CarsScreen(GarageSystem garage, PlayerProgress progress)
        {
            _garage = garage;
            _progress = progress;
        }

        public override string Title => "Cars";
        public override Icon Icon => Icon.Car;
        public override Core.FeatureId? Feature => Core.FeatureId.Garage;
        public override string Text => _text;
        string Shown => _garage.Shown;

        public override bool Back()
        {
            if (_page == Page.List) return false;
            _page = Page.List;
            Menu.Rebuild();
            return true;
        }

        public override void Closed() => _page = Page.List;

        /// <summary>Every page keeps to the left: the car turns on the right and shows every change.</summary>
        public override bool Narrow => true;

        /// <summary>Straight to the tuning page of the selected car (Play tile "Tune your car").</summary>
        public void ShowTune()
        {
            if (!Core.Unlocks.IsUnlocked(Core.FeatureId.Tuning)) return;
            _page = Page.Tune;
            GameMenu.Instance?.Show(this);
        }

        public override void Build(VisualElement body)
        {
            Garage.CarPortraits.ClearWaiting(); // the old page's pictures are gone
            var t = new StringBuilder();
            if (string.IsNullOrEmpty(Shown)) _garage.Pick(_progress.Data.selectedCar);
            var def = _progress.Fleet.Get(Shown) ?? _progress.Fleet.Default;
            var head = Ui.Row(body, "jm-wrap");
            if (_page != Page.List) Ui.Button(head, "‹ Back", () => Back());
            Ui.H1(head, _page == Page.Tune ? $"Tune · {def.displayName}" : _page == Page.Look ? $"Appearance · {def.displayName}" : "Cars");
            var bal = Ui.Text(head, $"{_progress.Wallet.Balance:N0} Sparks", "jm-h2", "jm-amber");
            bal.style.marginLeft = 16;
            if (_garage.InBay) Ui.Small(body, "Open Bay · what you see on the floor drives out.");
            t.AppendLine($"balance {_progress.Wallet.Balance}");

            if (_page == Page.Tune) { BuildTune(body, def, t); _text = t.ToString(); return; }
            if (_page == Page.Look) { BuildLook(body, def, t); _text = t.ToString(); return; }

            // Selected car first: its photo from the Open Bay, values and what to do with it; below, every car as a
            // picture card (owner 2026-10-17: no pictures, could not find anything).
            Detail(body, def, t);

            var sw = Ui.Row(body, "jm-wrap");
            sw.style.marginTop = 18;
            Ui.On(Ui.Button(sw, "Owned", () => { _showroom = false; Menu.Rebuild(); }), !_showroom);
            Ui.On(Ui.Button(sw, "Showroom", () => { _showroom = true; Menu.Rebuild(); }), _showroom);
            Ui.Box(sw).style.width = 14;
            for (var i = 0; i < Filters.Length; i++)
            {
                var index = i;
                Ui.On(Ui.Button(sw, Filters[i], () => { _filter = index; Menu.Rebuild(); }), _filter == i);
            }

            var grid = Ui.Box(body, "jm-cargrid");
            foreach (var v in _progress.Fleet.vehicles)
            {
                if (v == null) continue;
                var owned = _progress.Owns(v.id);
                if (!_showroom && !owned) continue;
                if (_filter > 0 && v.category.ToString() != Filters[_filter]) continue;
                var id = v.id;
                var card = Ui.Button(grid, "", () => { _garage.Pick(id); Menu.Rebuild(); }, "jm-tile", "jm-carcard");
                card.name = "car-" + v.id;
                Ui.On(card, v.id == Shown, "jm-tile--on");
                Picture(Ui.Box(card, "jm-carpic"), v);
                var text = Ui.Box(card, "jm-carcard__text");
                Ui.Text(text, v.displayName, "jm-carcard__name");
                var driving = _progress.Data.selectedCar == v.id;
                var tag = driving ? "Driving" : owned ? "Owned" : $"{v.price:N0} Sparks";
                Ui.Text(text, $"{v.category} · {tag}", "jm-carcard__tag", driving ? "jm-carcard__tag--driving" : owned ? "jm-carcard__tag" : "jm-carcard__tag--price");
                t.AppendLine($"{v.displayName} {tag}");
            }
            if (grid.childCount == 0) Ui.Small(body, "No car in this filter yet — the Showroom has all ten.");
            _text = t.ToString();
        }

        /// <summary>The car's photo into <paramref name="e"/> now, or as soon as it is taken.</summary>
        static void Picture(VisualElement e, VehicleDefinition def)
        {
            var tex = Garage.CarPortraits.Get(def, got => e.style.backgroundImage = new StyleBackground(got));
            if (tex != null) e.style.backgroundImage = new StyleBackground(tex);
        }

        public override void Update() => Garage.CarPortraits.Pump(_garage.Settings, Menu.Player != null ? Menu.Player.Car : null);

        /// <summary>After its free test drive: borrow the car for 10 minutes by ad, or for Sparks (ASTRA §12).</summary>
        void LoanOffers(VisualElement p, VisualElement actions, VehicleDefinition def, StringBuilder t)
        {
            var offers = Economy.RewardedOffers.Instance;
            if (offers == null) return;
            var (ad, buy) = offers.LoanOffers(def.id);
            if (ad && !_noAd.Contains(def.id))
            {
                Ui.Button(actions, offers.LoanAdLabel, () => offers.BorrowByAd(def.id, rewarded =>
                {
                    if (rewarded) { Menu.Close(); return; }
                    _noAd.Add(def.id);
                    _loanNote = Economy.RewardedOffers.NoAd;
                    Menu.Rebuild();
                }));
                t.AppendLine(offers.LoanAdLabel);
            }
            if (buy)
            {
                var id = def.id;
                Ui.Button(actions, offers.LoanBuyLabel, () =>
                {
                    if (_progress.Wallet.Balance < offers.Settings.loanPrice)
                    {
                        _loanNote = $"{offers.Settings.loanPrice - _progress.Wallet.Balance:N0} Sparks to go for the loan.";
                        Menu.Rebuild();
                        return;
                    }
                    Menu.Close();
                    offers.BorrowForSparks(id);
                });
                t.AppendLine(offers.LoanBuyLabel);
            }
            if (buy && !ad && Core.Platform.GamePlatform.Current.AdBlocked)
            {
                Ui.Small(p, Economy.RewardedOffers.AdBlockedNote);
                t.AppendLine(Economy.RewardedOffers.AdBlockedNote);
            }
            if (ad || buy) Ui.Small(p, "A loan is for driving and photos: no Sparks, records or discoveries.");
            if (_loanNote != "")
            {
                Ui.Small(p, _loanNote);
                t.AppendLine(_loanNote);
                _loanNote = "";
            }
        }

        void Detail(VisualElement col, VehicleDefinition def, StringBuilder t)
        {
            var p = Ui.Box(col);
            Picture(Ui.Box(p, "jm-hero"), def);
            Ui.Text(p, def.displayName, "jm-h1");
            Ui.Small(p, $"{def.category}{(string.IsNullOrEmpty(def.blurb) ? "" : " · " + def.blurb)}");
            var state = _progress.Owns(def.id) ? _progress.Car(def.id) : null;
            var spec = _progress.Tuning.Apply(def, state?.tune ?? default, state?.setup ?? CarSetupMode.Road);
            var stock = def.arcade;
            // Values in a compact grid of label-over-value cells (six rows of a table pushed the buttons off screen).
            var stats = Ui.Box(p, "jm-specs");
            void Stat(string name, string value)
            {
                var cell = Ui.Box(stats, "jm-spec");
                Ui.Text(cell, name.ToUpperInvariant(), "jm-spec__name");
                Ui.Text(cell, value, "jm-spec__value");
                t.AppendLine($"{name} {value}");
            }
            Stat("Top speed", $"{Core.GameOptions.Speed(spec.TopSpeed(def.mass))} {Core.GameOptions.SpeedUnit}{Delta(spec.TopSpeed(def.mass), stock.TopSpeed(def.mass))}");
            Stat("Power", $"{spec.power / 1000f:0} kW{Delta(spec.power, stock.power)}");
            Stat("Grip", $"{spec.latG:0.00} g{Delta(spec.latG, stock.latG)}");
            Stat("Braking", $"{spec.brakeG:0.00} g{Delta(spec.brakeG, stock.brakeG)}");
            Stat("Dirt grip · clearance", $"{def.dirtGrip * 100f:0} % · {def.clearance * 100f:0} cm");
            Stat("Gearbox", $"{def.gearbox.gears} gears · redline {def.gearbox.redline:N0} rpm");

            var actions = Ui.Row(p, "jm-wrap");
            actions.style.marginTop = 10;
            if (state == null)
            {
                var afford = _progress.Wallet.Balance >= def.price;
                MenuTiles.Gate(Ui.Button(actions, $"Buy · {def.price:N0} Sparks", () => PurchaseSheet(def), afford ? "jm-btn--primary" : "jm-btn"), Core.FeatureId.CarShop);
                MenuTiles.Gate(Ui.Button(actions, $"Test drive · {_garage.TestDriveSeconds:0} s", () => { Menu.Close(); _garage.TestDrive(def.id); }), Core.FeatureId.TestDrive);
                if (!afford) Ui.Small(p, $"{def.price - _progress.Wallet.Balance:N0} Sparks to go.");
                t.AppendLine(afford ? "can buy" : "cannot afford");
                LoanOffers(p, actions, def, t);
                return;
            }
            var driving = _progress.Data.selectedCar == def.id;
            Ui.Button(actions, driving ? "Driving ✓" : "Drive this car", () => { _garage.Pick(def.id); _garage.ApplySoon(); Menu.Rebuild(); }, driving ? "jm-btn--on" : "jm-btn--primary");
            MenuTiles.Gate(Ui.Button(actions, "Tune", () => { _page = Page.Tune; Menu.Rebuild(); }), Core.FeatureId.Tuning);
            MenuTiles.Gate(Ui.Button(actions, "Appearance", () => { _page = Page.Look; Menu.Rebuild(); }), Core.FeatureId.Paint);
            if (!_garage.InBay) Ui.Small(p, "Changes reach your car as soon as it stands still. The Open Bay in Sakura Commons shows it on the floor.");
        }

        void PurchaseSheet(VehicleDefinition def)
        {
            var sheet = Menu.Sheet($"Buy {def.displayName}", out var close);
            var before = _progress.Wallet.Balance;
            Ui.Text(sheet, $"Price {def.price:N0} Sparks");
            Ui.Text(sheet, $"Balance {before:N0} → {before - def.price:N0}");
            var row = Ui.Row(sheet);
            row.style.marginTop = 12;
            if (before >= def.price)
            {
                var buy = Ui.Button(row, "Buy and select", () => { close(); _garage.Buy(); _garage.ApplySoon(); Menu.Rebuild(); }, "jm-btn--primary", "jm-btn--wide");
                buy.Focus();
            }
            else Ui.Text(sheet, $"{def.price - before:N0} Sparks missing.", "jm-body", "jm-error");
            Ui.Button(row, "Back", close, "jm-btn--wide");
        }

        // ── Tune: performance bars with a preview, parts as cards (2026-10-13: "Tuning gibt es noch gar nicht") ──

        /// <summary>The car's stats as 0…1 against the best any car reaches fully tuned (bars compare across the fleet).</summary>
        float[] Stats(VehicleDefinition def, CarTune tune, CarSetupMode setup)
        {
            var s = _progress.Tuning.Apply(def, tune, setup);
            return new[] { s.TopSpeed(def.mass), s.power / def.mass, s.latG, s.brakeG, s.steerRate };
        }

        float[] _fleetMax;

        float[] FleetMax()
        {
            if (_fleetMax != null) return _fleetMax;
            _fleetMax = new float[5];
            var full = new CarTune { engine = 2, brakes = 2, steering = 2, tyres = 2 };
            foreach (var v in _progress.Fleet.vehicles)
            {
                if (v == null) continue;
                var st = Stats(v, full, CarSetupMode.Road);
                for (var i = 0; i < 5; i++) _fleetMax[i] = Mathf.Max(_fleetMax[i], st[i]);
            }
            return _fleetMax;
        }

        static readonly string[] StatNames = { "Top speed", "Acceleration", "Grip", "Braking", "Response" };

        sealed class StatBar
        {
            public VisualElement Fill, Ghost;
            public Label Value;
        }

        void BuildTune(VisualElement body, VehicleDefinition def, StringBuilder t)
        {
            var state = _progress.Car(def.id);
            var max = FleetMax();
            var now = Stats(def, state.tune, state.setup);

            // Performance: five bars; hovering a part shows where it would take the car (green up, red down).
            var perf = Ui.Box(body, "jm-panel", "jm-perf");
            Ui.Text(perf, "PERFORMANCE", "jm-kicker");
            var bars = new StatBar[5];
            for (var i = 0; i < 5; i++)
            {
                var row = Ui.Row(perf, "jm-stat");
                Ui.Text(row, StatNames[i], "jm-stat__name");
                var track = Ui.Box(row, "jm-stat__track");
                var ghost = Ui.Box(track, "jm-stat__ghost");
                var fill = Ui.Box(track, "jm-stat__fill");
                fill.style.width = Length.Percent(Mathf.Clamp01(now[i] / max[i]) * 100f);
                ghost.style.width = 0;
                var value = Ui.Text(row, StatText(i, now[i]), "jm-stat__value");
                bars[i] = new StatBar { Fill = fill, Ghost = ghost, Value = value };
                t.AppendLine($"{StatNames[i]} {StatText(i, now[i])}");
            }
            void Preview(CarTune? tune, CarSetupMode? setup)
            {
                var then = tune.HasValue || setup.HasValue ? Stats(def, tune ?? state.tune, setup ?? state.setup) : now;
                for (var i = 0; i < 5; i++)
                {
                    var a = Mathf.Clamp01(now[i] / max[i]);
                    var b = Mathf.Clamp01(then[i] / max[i]);
                    var up = b >= a;
                    bars[i].Ghost.style.width = Length.Percent((up ? b : a) * 100f);
                    bars[i].Fill.style.width = Length.Percent((up ? a : b) * 100f);
                    bars[i].Ghost.EnableInClassList("jm-stat__ghost--down", !up);
                    bars[i].Value.text = StatText(i, then[i]);
                    bars[i].Value.EnableInClassList("jm-stat__value--up", then[i] > now[i] * 1.004f);
                    bars[i].Value.EnableInClassList("jm-stat__value--down", then[i] < now[i] * 0.996f);
                }
            }

            Ui.Text(body, "PARTS", "jm-kicker").style.marginTop = 18;
            foreach (var c in CarTune.All)
            {
                var info = _progress.Tuning.Info(c);
                var card = Ui.Box(body, "jm-part");
                var head = Ui.Row(card);
                Ui.Text(head, info.title, "jm-part__title");
                Ui.Text(head, Tier(state.tune[c]).ToUpperInvariant(), "jm-chip");
                Ui.Text(card, info.blurb, "jm-small");
                var seg = Ui.Row(card, "jm-seg");
                for (var tier = 0; tier <= 2; tier++)
                {
                    var k = tier;
                    var cost = _progress.FitCost(def.id, c, k);
                    var fitted = state.tune[c] == k;
                    var label = Tier(k).ToUpperInvariant() + (fitted ? " ✓" : cost > 0 ? $" · {cost:N0}" : "");
                    var b = Ui.Button(seg, label, () => { _garage.Fit(c, k); _garage.ApplySoon(); Menu.Rebuild(); }, "jm-seg__item");
                    Ui.On(b, fitted, "jm-seg__item--on");
                    b.SetEnabled(!fitted && cost <= _progress.Wallet.Balance);
                    var preview = state.tune;
                    preview[c] = k;
                    b.RegisterCallback<PointerEnterEvent>(_ => Preview(preview, null));
                    b.RegisterCallback<PointerLeaveEvent>(_ => Preview(null, null));
                    b.RegisterCallback<FocusInEvent>(_ => Preview(preview, null));
                    t.AppendLine($"{info.title} {Tier(k)}{(cost > 0 ? $" · {cost:N0}" : fitted ? " ✓" : "")}");
                }
            }

            Ui.Text(body, "SETUP · FREE", "jm-kicker").style.marginTop = 18;
            var setups = Ui.Row(body, "jm-seg");
            foreach (var m in TuningSettings.SetupsFor(def))
            {
                var mode = m;
                var b = Ui.Button(setups, SetupName(m).ToUpperInvariant(), () => { _garage.Setup(mode); _garage.ApplySoon(); Menu.Rebuild(); }, "jm-seg__item");
                Ui.On(b, state.setup == m, "jm-seg__item--on");
                b.RegisterCallback<PointerEnterEvent>(_ => Preview(null, mode));
                b.RegisterCallback<PointerLeaveEvent>(_ => Preview(null, null));
            }
            Ui.Small(body, SetupHint(state.setup));
            if (_garage.Status != "") Ui.Text(body, _garage.Status, "jm-body", "jm-amber");
        }

        static string SetupHint(CarSetupMode m) => m switch
        {
            CarSetupMode.Drift => "Drift: the rear lets go easier and the wheels turn further — for long slides.",
            CarSetupMode.Dirt => "Dirt: a little higher and calmer at speed — for gravel and forest tracks.",
            CarSetupMode.SafeReturn => "Safe Return: crawls home on loose ground without spinning out.",
            _ => "Road: balanced grip for tarmac.",
        };

        static string StatText(int i, float v) => i switch
        {
            0 => $"{Core.GameOptions.Speed(v)} {Core.GameOptions.SpeedUnit}",
            1 => $"{v:0} W/kg",
            2 => $"{v:0.00} g",
            3 => $"{v:0.00} g",
            _ => $"{v:0.0}",
        };

        void BuildLook(VisualElement body, VehicleDefinition def, StringBuilder t)
        {
            var state = _progress.Car(def.id);
            Ui.Text(body, $"PAINT · {_progress.Tuning.paintPrice} SPARKS PER NEW COLOUR", "jm-kicker");
            var paints = Ui.Row(body, "jm-wrap");
            Ui.On(Ui.Button(paints, "Factory", () => Paint("")), state.paint == "");
            foreach (var colour in _progress.Tuning.palette)
            {
                var name = colour;
                var sw = Ui.Button(paints, "", () => Paint(name), "jm-btn--swatch");
                sw.tooltip = colour;
                sw.style.backgroundColor = _progress.Tuning.PaintColor(colour);
                var mine = state.paints.Contains(colour) || colour == def.factoryPaint;
                Ui.On(sw, state.paint == colour);
                sw.SetEnabled(mine || _progress.Wallet.Balance >= _progress.Tuning.paintPrice);
            }
            LookRow(body, "RIMS", false, state.wheels, state.wheelSets, _progress.Tuning.wheelPrice);
            LookRow(body, "BODY KIT", true, state.aero, state.aeroKits, _progress.Tuning.kitPrice);
            if (_garage.Status != "") Ui.Text(body, _garage.Status, "jm-body", "jm-amber");
            t.AppendLine($"paint {state.paint}");
        }

        void Paint(string colour)
        {
            _garage.Paint(colour);
            _garage.ApplySoon();
            Menu.Rebuild();
        }

        void LookRow(VisualElement body, string title, bool kit, int fitted, List<int> owned, int price)
        {
            Ui.Text(body, $"{title} · {price} SPARKS EACH", "jm-kicker").style.marginTop = 18;
            var row = Ui.Row(body, "jm-seg");
            for (var o = 0; o <= 2; o++)
            {
                var option = o;
                var mine = o == 0 || owned.Contains(o);
                var label = (kit ? KitNames : RimNames)[o].ToUpperInvariant() + (fitted == o ? " ✓" : mine ? "" : $" · {price:N0}");
                var b = Ui.Button(row, label, () => { _garage.Look(kit, option); _garage.ApplySoon(); Menu.Rebuild(); }, "jm-seg__item");
                Ui.On(b, fitted == o, "jm-seg__item--on");
                b.SetEnabled(fitted != o && (mine || _progress.Wallet.Balance >= price));
            }
        }

        // The car lab's wheel and aero options 1 and 2, named for what they are (not "Option 1").
        static readonly string[] RimNames = { "Factory", "Street rims", "Sport rims" };
        static readonly string[] KitNames = { "Factory", "Street kit", "Aero kit" };

        static string Tier(int t) => t == 0 ? "Stock" : t == 1 ? "Street" : "Sport";
        static string SetupName(CarSetupMode m) => m == CarSetupMode.SafeReturn ? "Safe Return" : m.ToString();

        static string Delta(float now, float stock)
        {
            var pct = (now / stock - 1f) * 100f;
            return Mathf.Abs(pct) < 0.5f ? "" : $" ({(pct > 0 ? "+" : "−")}{Mathf.Abs(pct):0} %)";
        }
    }
}
