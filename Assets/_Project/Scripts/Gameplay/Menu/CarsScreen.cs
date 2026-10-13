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

        /// <summary>Straight to the tuning page of the selected car (Play tile "Tune your car").</summary>
        public void ShowTune()
        {
            _page = Page.Tune;
            GameMenu.Instance?.Show(this);
        }

        public override void Build(VisualElement body)
        {
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

            var sw = Ui.Row(body, "jm-wrap");
            Ui.On(Ui.Button(sw, "Owned", () => { _showroom = false; Menu.Rebuild(); }), !_showroom);
            Ui.On(Ui.Button(sw, "Showroom", () => { _showroom = true; Menu.Rebuild(); }), _showroom);
            var filters = Ui.Row(body, "jm-wrap");
            for (var i = 0; i < Filters.Length; i++)
            {
                var index = i;
                Ui.On(Ui.Button(filters, Filters[i], () => { _filter = index; Menu.Rebuild(); }), _filter == i);
            }

            var cols = Ui.Box(body, "jm-cols");
            var list = Ui.Box(cols, "jm-col");
            var strip = Ui.Row(list, "jm-wrap");
            foreach (var v in _progress.Fleet.vehicles)
            {
                if (v == null) continue;
                var owned = _progress.Owns(v.id);
                if (!_showroom && !owned) continue;
                if (_filter > 0 && v.category.ToString() != Filters[_filter]) continue;
                var id = v.id;
                var tile = Ui.Button(strip, "", () => { _garage.Pick(id); Menu.Rebuild(); }, "jm-tile");
                tile.style.width = Core.Ui.UiPanel.IsPhone ? 160 : 200;
                tile.style.alignItems = Align.FlexStart;
                Ui.On(tile, v.id == Shown, "jm-tile--on");
                Ui.Text(tile, v.displayName, "jm-h2");
                var tag = _progress.Data.selectedCar == v.id ? "Driving" : owned ? "Owned" : $"{v.price:N0} Sparks";
                Ui.Small(tile, $"{v.category} · {tag}");
                t.AppendLine($"{v.displayName} {tag}");
            }
            if (strip.childCount == 0) Ui.Small(list, "No car in this filter yet — the Showroom has all ten.");

            Detail(Ui.Box(cols, "jm-col"), def, t);
            _text = t.ToString();
        }

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
            var p = Ui.Box(col, "jm-panel");
            Ui.Text(p, def.displayName, "jm-h1");
            Ui.Small(p, $"{def.category}{(string.IsNullOrEmpty(def.blurb) ? "" : " · " + def.blurb)}");
            var state = _progress.Owns(def.id) ? _progress.Car(def.id) : null;
            var spec = _progress.Tuning.Apply(def, state?.tune ?? default, state?.setup ?? CarSetupMode.Road);
            var stock = def.arcade;
            void Stat(string name, string value)
            {
                var r = Ui.Row(p, "jm-setting");
                Ui.Text(r, name);
                Ui.Text(r, value, "jm-body", "jm-amber");
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
                Ui.Button(actions, $"Buy · {def.price:N0} Sparks", () => PurchaseSheet(def), afford ? "jm-btn--primary" : "jm-btn");
                Ui.Button(actions, $"Test drive · {_garage.TestDriveSeconds:0} s", () => { Menu.Close(); _garage.TestDrive(def.id); });
                if (!afford) Ui.Small(p, $"{def.price - _progress.Wallet.Balance:N0} Sparks to go.");
                t.AppendLine(afford ? "can buy" : "cannot afford");
                LoanOffers(p, actions, def, t);
                return;
            }
            var driving = _progress.Data.selectedCar == def.id;
            Ui.Button(actions, driving ? "Driving ✓" : "Drive this car", () => { _garage.Pick(def.id); _garage.ApplySoon(); Menu.Rebuild(); }, driving ? "jm-btn--on" : "jm-btn--primary");
            Ui.Button(actions, "Tune", () => { _page = Page.Tune; Menu.Rebuild(); });
            Ui.Button(actions, "Appearance", () => { _page = Page.Look; Menu.Rebuild(); });
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

        void BuildTune(VisualElement body, VehicleDefinition def, StringBuilder t)
        {
            var state = _progress.Car(def.id);
            Ui.H2(body, "Performance parts");
            foreach (var c in CarTune.All)
            {
                var info = _progress.Tuning.Info(c);
                var row = Ui.Row(body, "jm-setting", "jm-wrap");
                var name = Ui.Text(row, info.title);
                for (var tier = 0; tier <= 2; tier++)
                {
                    var k = tier;
                    var cost = _progress.FitCost(def.id, c, k);
                    var fitted = state.tune[c] == k;
                    var label = Tier(k) + (cost > 0 ? $" · {cost:N0}" : fitted ? " ✓" : "");
                    var b = Ui.Button(row, label, () => { _garage.Fit(c, k); _garage.ApplySoon(); Menu.Rebuild(); });
                    Ui.On(b, fitted);
                    b.SetEnabled(!fitted && cost <= _progress.Wallet.Balance);
                    t.AppendLine($"{info.title} {label}");
                }
            }
            Ui.H2(body, "Setup (free)");
            var setups = Ui.Row(body, "jm-wrap");
            foreach (var m in TuningSettings.SetupsFor(def))
            {
                var mode = m;
                Ui.On(Ui.Button(setups, SetupName(m), () => { _garage.Setup(mode); _garage.ApplySoon(); Menu.Rebuild(); }), state.setup == m);
            }
            Ui.Small(body, _garage.Status);
        }

        void BuildLook(VisualElement body, VehicleDefinition def, StringBuilder t)
        {
            var state = _progress.Car(def.id);
            Ui.H2(body, $"Paint · {_progress.Tuning.paintPrice} per new colour");
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
            LookRow(body, "Rims", false, state.wheels, state.wheelSets, _progress.Tuning.wheelPrice);
            LookRow(body, "Body kit", true, state.aero, state.aeroKits, _progress.Tuning.kitPrice);
            Ui.Small(body, _garage.Status);
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
            Ui.H2(body, $"{title} · {price} each");
            var row = Ui.Row(body, "jm-wrap");
            for (var o = 0; o <= 2; o++)
            {
                var option = o;
                var mine = o == 0 || owned.Contains(o);
                var b = Ui.Button(row, o == 0 ? "Factory" : $"Option {o}{(mine ? "" : $" · {price}")}", () => { _garage.Look(kit, option); _garage.ApplySoon(); Menu.Rebuild(); });
                Ui.On(b, fitted == o);
                b.SetEnabled(fitted != o && (mine || _progress.Wallet.Balance >= price));
            }
        }

        static string Tier(int t) => t == 0 ? "Stock" : t == 1 ? "Street" : "Sport";
        static string SetupName(CarSetupMode m) => m == CarSetupMode.SafeReturn ? "Safe Return" : m.ToString();

        static string Delta(float now, float stock)
        {
            var pct = (now / stock - 1f) * 100f;
            return Mathf.Abs(pct) < 0.5f ? "" : $" ({(pct > 0 ? "+" : "−")}{Mathf.Abs(pct):0} %)";
        }
    }
}
