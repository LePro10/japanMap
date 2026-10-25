using System.Collections.Generic;
using System.Text;
using JapanMap.Core.Ui;
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
        bool _showroom = true; // every car by default: the dealer is where the next goal is
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
            _body = body;
            var t = new StringBuilder();
            if (string.IsNullOrEmpty(Shown)) _garage.Pick(_progress.Data.selectedCar);
            var def = _progress.Fleet.Get(Shown) ?? _progress.Fleet.Default;
            var aside = UiPanel.IsPhone || Menu.Aside == null ? body : Menu.Aside;
            if (_page != Page.List)
            {
                var head = Ui.Row(body, "jm-wrap");
                Ui.Button(head, "‹ Back", () => Back(), "nm-back");
                Ui.Text(head, _page == Page.Tune ? "Tune" : "Appearance", "jm-h1");
                Ui.Text(head, def.displayName.ToUpperInvariant(), "nm-pagehead__sub");
            }
            if (_garage.InBay) Ui.Small(body, "Open Bay · the car on the floor drives out.");
            t.AppendLine($"balance {_progress.Wallet.Balance}");

            if (_page == Page.Tune) { BuildTune(body, def, t); _text = t.ToString(); return; }
            if (_page == Page.Look) { BuildLook(body, def, t); _text = t.ToString(); return; }

            // Garage (D55): a list with pictures on the left that never jumps; the chosen car's paper card at the right
            // over the car, its one main button always in the same place (owner 2026-10-21: "klicke auf ein Auto und
            // muss nochmal nach oben scrollen").
            // Phones have no aside: the chosen car's card comes first, the list under it (a list click scrolls up to it).
            if (aside == body) Detail(body, def, t);
            var chips = Ui.Row(body, "jm-wrap", "nm-chips");
            Chip(chips, $"All {_progress.Fleet.vehicles.Length}", _showroom && _filter == 0, () => { _showroom = true; _filter = 0; });
            var mine = 0;
            foreach (var v in _progress.Fleet.vehicles) if (v != null && _progress.Owns(v.id)) mine++;
            Chip(chips, $"Mine {mine}", !_showroom, () => { _showroom = false; _filter = 0; });
            for (var i = 1; i < Filters.Length; i++)
            {
                var index = i;
                Chip(chips, Filters[i], _showroom && _filter == i, () => { _showroom = true; _filter = index; });
            }

            var list = Ui.Box(body, "nm-carlist");
            // Yours first, then the dealer by price.
            var cars = new List<VehicleDefinition>();
            foreach (var v in _progress.Fleet.vehicles) if (v != null) cars.Add(v);
            cars.Sort((a, b) => _progress.Owns(a.id) != _progress.Owns(b.id) ? (_progress.Owns(a.id) ? -1 : 1) : a.price.CompareTo(b.price));
            foreach (var v in cars)
            {
                var owned = _progress.Owns(v.id);
                if (!_showroom && !owned) continue;
                if (_filter > 0 && v.category.ToString() != Filters[_filter]) continue;
                var id = v.id;
                var row = Ui.Button(list, "", () => OnCard(id), "nm-carrow");
                row.name = "car-" + v.id;
                Ui.On(row, v.id == Shown, "nm-carrow--on");
                Picture(Ui.Box(row, "nm-carrow__pic"), v);
                var text = Ui.Box(row, "nm-carrow__text");
                Ui.Text(text, v.displayName.ToUpperInvariant(), "nm-carrow__name");
                var driving = _progress.Data.selectedCar == v.id;
                Ui.Text(text, $"{v.category}{(owned ? " · yours" : "")}".ToUpperInvariant(), "nm-carrow__sub");
                var tag = driving ? "Driving" : owned ? "Owned" : $"{v.price:N0}";
                var tagLabel = Ui.Text(row, tag, "nm-carrow__tag", driving ? "nm-carrow__tag--driving" : owned ? "nm-carrow__tag--owned" : "nm-carrow__tag--price");
                if (!owned) { var sp = new UiIcon(Icon.Spark, 13f) { Tint = Palette.Momo }; sp.AddToClassList("nm-carrow__spark"); row.Add(sp); }
                foreach (var c in row.Query<VisualElement>().ToList()) if (c != row) c.pickingMode = PickingMode.Ignore;
                t.AppendLine($"{v.displayName} {(driving ? "Driving" : owned ? "Owned" : $"{v.price:N0} Sparks")}");
            }
            if (list.childCount == 0) Ui.Small(body, "No car here yet.");
            if (aside != body) Detail(aside, def, t);
            _text = t.ToString();
        }

        void Chip(VisualElement row, string label, bool on, System.Action pick)
        {
            var b = Ui.Button(row, label, () => { pick(); Menu.Rebuild(); }, "nm-chip");
            Ui.On(b, on, "nm-chip--on");
        }

        VisualElement _body;

        /// <summary>
        /// A card click (owner 2026-10-21: "klicke auf ein Auto und muss nochmal nach oben scrollen, selecten"): an owned
        /// car is driven at once and the list stays where it was; a car not owned scrolls up to its detail, where Buy and
        /// Test drive are.
        /// </summary>
        void OnCard(string id)
        {
            var scroll = _body?.GetFirstAncestorOfType<ScrollView>();
            var offset = scroll != null ? scroll.scrollOffset : Vector2.zero;
            var owned = _progress.Owns(id);
            _garage.Pick(id);
            if (owned) _garage.ApplySoon();
            Menu.Rebuild();
            if (scroll == null) return;
            // The detail sits in the aside (desktop): the list stays where it was. Phones show it on top: scroll up.
            var to = !UiPanel.IsPhone ? offset : Vector2.zero;
            scroll.scrollOffset = to;
            scroll.schedule.Execute(() => scroll.scrollOffset = to); // again once the rebuilt page has its layout
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
            var p = Ui.Box(col, "nm-paper", "nm-cardetail");
            p.pickingMode = PickingMode.Position;
            var state = _progress.Owns(def.id) ? _progress.Car(def.id) : null;
            var driving = state != null && _progress.Data.selectedCar == def.id;
            var head = Ui.Row(p, "nm-cardetail__head");
            var names = Ui.Box(head, "jm-grow");
            Ui.Text(names, def.displayName.ToUpperInvariant(), "nm-cardetail__name");
            Ui.Text(names, $"{def.category}{(string.IsNullOrEmpty(def.blurb) ? "" : " · " + def.blurb)}", "nm-cardetail__sub");
            if (driving) head.Add(new Hanko(Jp.Mine, 54f));
            // Not the car on the stage: its Open Bay photo (the car behind the menu is the one you drive).
            if (!driving) Picture(Ui.Box(p, "nm-cardetail__pic"), def);
            var spec = _progress.Tuning.Apply(def, state?.tune ?? default, state?.setup ?? CarSetupMode.Road, state?.fine ?? default);
            var stock = def.arcade;
            var max = FleetMax();
            var stats = Ui.Box(p, "nm-cardetail__stats");
            void Stat(string name, float now, float of, string value)
            {
                var row = Ui.Row(stats, "nm-statrow");
                Ui.Text(row, name, "nm-statrow__name");
                var track = Ui.Box(row, "nm-statrow__track");
                var fill = Ui.Add(track, new Slant { Fill = Palette.Sumi, Lean = 5f }, "nm-statrow__fill");
                fill.style.width = Length.Percent(Mathf.Clamp01(now / Mathf.Max(0.001f, of)) * 100f);
                Ui.Text(row, value, "nm-statrow__value");
                t.AppendLine($"{name} {value}");
            }
            var top = spec.TopSpeed(def.mass);
            Stat("Top speed", top, max[0], $"{Core.GameOptions.Speed(top)} {Core.GameOptions.SpeedUnit}{Delta(top, stock.TopSpeed(def.mass))}");
            Stat("Power", spec.power / def.mass, max[1], $"{spec.power / 1000f:0} kW{Delta(spec.power, stock.power)}");
            Stat("Grip", spec.latG, max[2], $"{spec.latG:0.00} g{Delta(spec.latG, stock.latG)}");
            Stat("Braking", spec.brakeG, max[3], $"{spec.brakeG:0.00} g{Delta(spec.brakeG, stock.brakeG)}");
            t.AppendLine($"Dirt grip · clearance {def.dirtGrip * 100f:0} % · {def.clearance * 100f:0} cm");
            t.AppendLine($"Gearbox {def.gearbox.gears} gears · redline {def.gearbox.redline:N0} rpm");

            var actions = Ui.Row(p, "nm-cardetail__acts");
            if (state == null)
            {
                var afford = _progress.Wallet.Balance >= def.price;
                MenuTiles.Gate(Ui.Button(actions, $"Test drive · {_garage.TestDriveSeconds:0} s", () => { Menu.Close(); _garage.TestDrive(def.id); }, "nm-btn--ink"), Core.FeatureId.TestDrive);
                var buy = Ui.Button(actions, afford ? $"Buy · {def.price:N0} Sparks" : $"{def.price - _progress.Wallet.Balance:N0} Sparks to go", () => PurchaseSheet(def), "jm-btn--primary", "jm-btn--wide");
                buy.name = "car-buy";
                buy.SetEnabled(afford);
                MenuTiles.Gate(buy, Core.FeatureId.CarShop);
                t.AppendLine(afford ? "can buy" : "cannot afford");
                LoanOffers(p, actions, def, t);
                return;
            }
            MenuTiles.Gate(Ui.Button(actions, "Tune", () => { _page = Page.Tune; Menu.Rebuild(); }, "nm-btn--ink"), Core.FeatureId.Tuning);
            MenuTiles.Gate(Ui.Button(actions, "Paint", () => { _page = Page.Look; Menu.Rebuild(); }, "nm-btn--ink"), Core.FeatureId.Paint);
            var go = Ui.Button(actions, driving ? "Driving" : "Drive this car", () => { _garage.Pick(def.id); _garage.ApplySoon(); Menu.Rebuild(); },
                driving ? "jm-btn--on" : "jm-btn--primary", "jm-btn--wide");
            go.name = "car-drive";
            go.SetEnabled(!driving);
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
        float[] Stats(VehicleDefinition def, CarTune tune, CarSetupMode setup, CarFine fine = default)
        {
            var s = _progress.Tuning.Apply(def, tune, setup, fine);
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
            var now = Stats(def, state.tune, state.setup, state.fine);

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
            void Preview(CarTune? tune, CarSetupMode? setup, CarFine? fine = null)
            {
                var then = tune.HasValue || setup.HasValue || fine.HasValue ? Stats(def, tune ?? state.tune, setup ?? state.setup, fine ?? state.fine) : now;
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
                    var label = Tier(k).ToUpperInvariant() + (fitted ? "" : cost > 0 ? $" · {cost:N0}" : ""); // fitted: the segment is lit
                    var b = Ui.Button(seg, label, () => { _garage.Fit(c, k); _garage.ApplySoon(); Menu.Rebuild(); }, "jm-seg__item");
                    Ui.On(b, fitted, "jm-seg__item--on");
                    b.SetEnabled(!fitted && cost <= _progress.Wallet.Balance);
                    var preview = state.tune;
                    preview[c] = k;
                    b.RegisterCallback<PointerEnterEvent>(_ => Preview(preview, null));
                    b.RegisterCallback<PointerLeaveEvent>(_ => Preview(null, null));
                    b.RegisterCallback<FocusInEvent>(_ => Preview(preview, null));
                    t.AppendLine($"{info.title} {Tier(k)}{(cost > 0 ? $" · {cost:N0}" : fitted ? " fitted" : "")}");
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

            // Fine tune (POLISH D): free steps, seen on the car at once; hovering previews the stats like the parts.
            var set = _progress.Tuning;
            Ui.Text(body, "FINE TUNE · FREE", "jm-kicker").style.marginTop = 18;
            void FineRow(string title, int from, int to, int fitted, System.Func<int, string> label, System.Func<int, CarFine> with)
            {
                var card = Ui.Box(body, "jm-part");
                Ui.Text(Ui.Row(card), title, "jm-part__title");
                var seg = Ui.Row(card, "jm-seg");
                for (var v = from; v <= to; v++)
                {
                    var f = with(v);
                    var b = Ui.Button(seg, label(v), () => { _garage.Fine(f); _garage.ApplySoon(); Menu.Rebuild(); }, "jm-seg__item");
                    Ui.On(b, v == fitted, "jm-seg__item--on");
                    b.RegisterCallback<PointerEnterEvent>(_ => Preview(null, null, f));
                    b.RegisterCallback<PointerLeaveEvent>(_ => Preview(null, null));
                    b.RegisterCallback<FocusInEvent>(_ => Preview(null, null, f));
                    t.AppendLine($"{title} {label(v)}{(v == fitted ? " fitted" : "")}");
                }
            }
            var fine = set.Clamp(state.fine);
            string Mm(float m) => m == 0f ? "STOCK" : $"{(m > 0f ? "+" : "-")}{Mathf.Abs(m) * 1000f:0} MM"; // ASCII minus (font coverage)
            FineRow("Ride height", -set.heightSteps, set.heightSteps, fine.height, v => Mm(v * set.heightStep), v => new CarFine { height = v, camber = fine.camber, track = fine.track });
            FineRow("Camber", 0, set.camberSteps, fine.camber, v => v == 0 ? "STOCK" : $"-{v * set.camberStep:0.#}°", v => new CarFine { height = fine.height, camber = v, track = fine.track });
            FineRow("Track", 0, set.trackSteps, fine.track, v => Mm(v * set.trackStep), v => new CarFine { height = fine.height, camber = fine.camber, track = v });
            Ui.Small(body, "Lower and more camber: more grip in bends, a little less braking. Wider: calmer, slower to turn in.");
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
                var label = (kit ? KitNames : RimNames)[o].ToUpperInvariant() + (fitted == o || mine ? "" : $" · {price:N0}");
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
