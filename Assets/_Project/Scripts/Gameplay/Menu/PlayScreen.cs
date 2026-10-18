using System.Text;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Play (ASTRA §10, tiles D48): the selected car as the page's headline, one hero tile with the next thing to do
    /// (a nearby recommended event; in an event Restart and Leave; in a test drive its end), then halves: tune, daily
    /// challenge, next car, Sakura Commons. Travel only on an explicit tile — opening this tab never moves the player.
    /// </summary>
    public sealed class PlayScreen : MenuScreen
    {
        readonly PlayerProgress _progress;
        readonly RaceDirector _races;
        readonly Travel _travel;
        readonly Garage.GarageSystem _garage;
        string _text = "";

        public PlayScreen(PlayerProgress progress, RaceDirector races, Travel travel, Garage.GarageSystem garage)
        {
            _progress = progress;
            _races = races;
            _travel = travel;
            _garage = garage;
        }

        public override string Title => "Play";
        public override Icon Icon => Icon.Play;
        public override string Text => _text;

        // The tiles' car photos are taken in the Open Bay, one per frame while the page is open (as on Cars).
        public override void Update()
        {
            if (_garage != null) Garage.CarPortraits.Pump(_garage.Settings, Menu.Player != null ? Menu.Player.Car : null);
        }

        public override void Build(VisualElement body)
        {
            var t = new StringBuilder();
            var p = Menu.Player;
            var car = p != null && p.Car != null ? p.Car.Definition : null;
            var balance = _progress != null ? _progress.Wallet.Balance : 0;

            // Header: what you drive and what you have — the two facts a returning glance looks for.
            var head = Ui.Box(body, "jm-pagehead", "jm-rise");
            Ui.Text(head, p != null && p.Current == PlayerModeController.Mode.Walking ? "PAUSED  ·  ON FOOT" : "PAUSED", "jm-kicker");
            Ui.Text(head, car != null ? car.displayName : "—", "jm-display");
            if (UiPanel.IsPhone) Ui.Text(head, $"{balance:N0} Sparks", "jm-lede"); // desktop: in the top bar
            t.AppendLine($"car {car?.displayName} · {balance} Sparks");

            // One hero tile — the next thing to do — then a grid of halves (FH-style hierarchy, one voice leads).
            var grid = Ui.Box(body, "jm-cards");
            if (_garage != null && _garage.TestDriving)
            {
                Hero(grid, new MenuTiles.Spec
                {
                    Name = "tile-testdrive", Icon = Icon.Car, Kicker = "TEST DRIVE", Title = $"{Mathf.CeilToInt(_garage.TestDriveLeft)} s left",
                    Body = $"in the {car?.displayName}", Action = "End test drive", Style = "jm-card--accent",
                    Click = () => { Menu.Close(); _garage.EndTestDrive(); },
                });
                t.AppendLine("test drive");
            }
            else if (_races != null && (_races.Current == RaceDirector.State.Running || _races.Current == RaceDirector.State.Countdown))
            {
                var id = _races.Event.id;
                Hero(grid, new MenuTiles.Spec
                {
                    Name = "tile-restart", Icon = Icon.Flag, Kicker = "IN AN EVENT", Title = _races.Event.title, Body = "Start again from the grid.",
                    Action = "Restart", Style = "jm-card--accent",
                    Click = () => { Menu.Close(); _races.Abort("restarted"); _races.Begin(id); },
                });
                Half(grid, new MenuTiles.Spec
                {
                    Name = "tile-leave", Icon = Icon.Back, Kicker = "EVENT", Title = "Leave event", Body = "Back to free roam, right here.",
                    Action = "Leave", Click = () => { Menu.Close(); _races.Abort("left"); },
                });
                t.AppendLine($"in event {_races.Event.title}");
            }
            else
            {
                // During the career its goal leads; the next event steps down to a half tile.
                var career = CareerTile(grid, t);
                var rec = _races != null ? Recommend() : -1;
                if (rec >= 0)
                {
                    var ev = _races.Set.events[rec];
                    var spec = new MenuTiles.Spec
                    {
                        Name = "tile-event", Icon = Icon.Flag, Kicker = "NEXT EVENT", Title = ev.title, Body = ev.blurb,
                        Value = $"+{ev.completion:N0} Sparks  ·  up to +{ev.completion + ev.bonus:N0}", Action = "Go to the start",
                        Style = career ? "" : "jm-card--accent",
                        // The tile travels there: with events open but fast travel not yet (career), it waits for fast travel.
                        Feature = Core.Unlocks.IsUnlocked(Core.FeatureId.Races) ? Core.FeatureId.FastTravel : Core.FeatureId.Races,
                        Click = () => { Menu.Close(); _travel.ToEvent(rec); },
                    };
                    if (career) Half(grid, spec);
                    else Hero(grid, spec);
                    t.AppendLine($"event {ev.title}");
                }
            }

            // The garage — tuning was there but nobody found it (owner, 2026-10-13).
            if (_garage != null && car != null && !_garage.TestDriving)
            {
                var fitted = 0;
                var state = _progress.Car(car.id);
                foreach (var c in Vehicles.CarTune.All) if (state.tune[c] > 0) fitted++;
                Half(grid, new MenuTiles.Spec
                {
                    Name = "tile-tune", Icon = Icon.Tune, Kicker = "GARAGE", Title = $"Tune your {car.displayName}",
                    Body = fitted == 0 ? "Engine, brakes, suspension, tyres · paint, rims, kits" : $"{fitted} of 4 parts upgraded · paint, rims, kits",
                    Action = "Tune now", Feature = Core.FeatureId.Tuning, Click = () => _garage.Screen.ShowTune(), Car = car,
                });
                t.AppendLine("garage tile");
            }

            // Daily challenge: the reason to drive today, and to come back tomorrow.
            var daily = Progress.DailySystem.Instance;
            if (daily != null && daily.Settings != null)
            {
                var c = daily.Challenge;
                var left = daily.Left;
                Half(grid, new MenuTiles.Spec
                {
                    Name = "tile-daily", Icon = Icon.Daily, Kicker = daily.Streak > 1 ? $"DAILY CHALLENGE · DAY {daily.Streak}" : "DAILY CHALLENGE",
                    Title = string.Format(c.title, c.target),
                    Value = daily.ChallengeDone ? $"Done · +{c.reward:N0} Sparks earned" : $"+{c.reward:N0} Sparks",
                    Meter = daily.ChallengeDone ? 1f : Mathf.Clamp01(daily.ChallengeProgress / Mathf.Max(0.001f, c.target)),
                    Note = $"New challenge in {(int)left.TotalHours} h {left.Minutes:00} min", Style = "jm-card--daily", Feature = Core.FeatureId.Daily,
                    Click = () => Menu.Close(),
                });
                t.AppendLine($"daily {string.Format(c.title, c.target)} {(daily.ChallengeDone ? "done" : "")}");
            }

            // The pinned purchase goal (ASTRA: purchase progress on Play).
            var goal = Goal();
            if (goal != null)
            {
                Half(grid, new MenuTiles.Spec
                {
                    Name = "tile-nextcar", Icon = Icon.Car, Kicker = "NEXT CAR", Title = goal.displayName, Value = $"{goal.price:N0} Sparks",
                    Meter = Mathf.Clamp01(balance / (float)Mathf.Max(1, goal.price)),
                    Note = balance >= goal.price ? "You can buy it now." : $"{goal.price - balance:N0} Sparks to go",
                    Action = "See cars", Feature = Core.FeatureId.CarShop, Car = goal,
                    Click = () => { var cars = Menu.Screen<CarsScreen>(); if (cars != null) Menu.Show(cars); },
                });
                t.AppendLine($"goal {goal.displayName}");
            }

            Half(grid, new MenuTiles.Spec
            {
                Name = "tile-commons", Icon = Icon.Home, Kicker = "FAST TRAVEL", Title = "Sakura Commons", Body = "Home: the Open Bay, the café, the start of every road.",
                Action = "Go to Sakura Commons", Feature = Core.FeatureId.FastTravel,
                Click = () => { Menu.Close(); _travel.ToCommons(); },
            });
            if (CareerOn)
            {
                // Skip lives here and on the title, never in the way: a plain text button under the tiles, with a question.
                var skip = Ui.Button(body, "Skip tutorial · unlock everything", ConfirmSkip, "jm-btn", "jm-rise");
                skip.name = "career-skip";
            }
            if (!UiPanel.IsPhone) Ui.Small(body, "Esc resumes exactly where you are.").AddToClassList("jm-pagefoot");
            _text = t.ToString();
        }

        static bool CareerOn => Career.CareerSystem.Instance != null && Career.CareerSystem.Instance.Active;

        /// <summary>The career's current goal as the page's hero (one voice leads): chapter, goal, how far, "Show me".</summary>
        bool CareerTile(VisualElement grid, StringBuilder t)
        {
            var career = Career.CareerSystem.Instance;
            var step = CareerOn ? career.Chain.Current : null;
            if (step == null) return false;
            var chain = career.Chain;
            chain.Chapter(chain.Index, out var chapter, out var chapters, out _, out _);
            var s = step.Value;
            Hero(grid, new MenuTiles.Spec
            {
                Name = "tile-career", Icon = Icon.Flag, Kicker = $"CAREER · CHAPTER {chapter} OF {chapters} · {s.chapter.ToUpperInvariant()}",
                Title = Career.CareerChain.Title(s), Body = Career.CareerOverlay.Touch ? s.touchHint : s.hint,
                Value = s.reward > 0 ? $"+{s.reward:N0} Sparks" : "", Meter = chain.Index / (float)chain.Count,
                Note = $"Step {chain.Index + 1} of {chain.Count}", Action = "Back to it", Style = "jm-card--accent",
                Click = () => Menu.Close(),
            });
            t.AppendLine($"career {chain.Index + 1}/{chain.Count} {Career.CareerChain.Title(s)}");
            return true;
        }

        void ConfirmSkip()
        {
            var career = Career.CareerSystem.Instance;
            if (career == null) return;
            var sheet = Menu.Sheet("Skip the tutorial?", out var close);
            Ui.Text(sheet, $"Everything unlocks now — garage, map, events, photo mode, every car in the dealer — and you get {career.Settings.skipSparks:N0} Sparks to start. The career's own rewards are not paid.");
            var row = Ui.Row(sheet, "jm-wrap");
            Ui.Button(row, "Skip and unlock all", () => { close(); career.Skip(); Menu.Rebuild(); }, "jm-btn--primary").name = "career-skip-yes";
            Ui.Button(row, "Keep playing", close).name = "career-skip-no";
        }

        static void Hero(VisualElement grid, MenuTiles.Spec s) => Add(grid, s, "jm-card--hero");

        static void Half(VisualElement grid, MenuTiles.Spec s) => Add(grid, s, "jm-card--half");

        static void Add(VisualElement grid, MenuTiles.Spec s, string size)
        {
            var style = s.Style;
            s.Style = "";
            var b = MenuTiles.Tile(grid, s);
            b.AddToClassList(size);
            b.AddToClassList("jm-rise");
            if (!string.IsNullOrEmpty(style)) foreach (var c in style.Split(' ')) if (c.Length > 0) b.AddToClassList(c);
        }

        Vehicles.VehicleDefinition Goal()
        {
            if (_progress == null) return null;
            Vehicles.VehicleDefinition best = null;
            foreach (var v in _progress.Fleet.vehicles)
                if (v != null && !_progress.Owns(v.id) && (best == null || v.price < best.price)) best = v;
            return best;
        }

        int Recommend()
        {
            var p = Menu.Player;
            if (p == null) return -1;
            var at = p.Current == PlayerModeController.Mode.Driving && p.Car != null ? p.Car.transform.position
                : p.Walker != null ? p.Walker.transform.position : Vector3.zero;
            return _races.Recommend(at, _progress?.Data);
        }
    }
}
