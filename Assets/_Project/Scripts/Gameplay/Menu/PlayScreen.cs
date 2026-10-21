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
            t.AppendLine($"car {car?.displayName} · {balance} Sparks");

            // FH-style grid (D55): Resume and the one thing to do next on top, then rows of picture tiles. Locked tiles
            // are not shown; at most one number per tile.
            var top = Ui.Row(body, "nm-tilerow", "nm-tilerow--top");
            var resume = Tile(top, new MenuTiles.Spec
            {
                Name = "tile-resume", Kicker = p != null && p.Current == PlayerModeController.Mode.Walking ? "Paused · on foot" : "Paused",
                Jp = Jp.Paused, Title = "Resume", Value = "Esc", Style = "nm-tile--main", Click = () => Menu.Close(),
            });
            resume.schedule.Execute(() => { if (Menu.IsOpen && Menu.Current == this) resume.Focus(); });
            var rows = Ui.Box(body, "nm-tiles");
            var row = Ui.Row(rows, "nm-tilerow");
            var inRow = 0;
            void Next(MenuTiles.Spec spec)
            {
                if (inRow == 3) { row = Ui.Row(rows, "nm-tilerow"); inRow = 0; }
                var b = Tile(row, spec);
                if (b.style.display != DisplayStyle.None) inRow++;
            }

            if (_garage != null && _garage.TestDriving)
            {
                Tile(top, new MenuTiles.Spec
                {
                    Name = "tile-testdrive", Kicker = "Test drive", Jp = Jp.Race, Title = $"{Mathf.CeilToInt(_garage.TestDriveLeft)} s left",
                    Value = "End test drive", Style = "nm-tile--paper nm-tile--wide", Click = () => { Menu.Close(); _garage.EndTestDrive(); },
                });
                t.AppendLine("test drive");
            }
            else if (_races != null && (_races.Current == RaceDirector.State.Running || _races.Current == RaceDirector.State.Countdown))
            {
                var id = _races.Event.id;
                Tile(top, new MenuTiles.Spec
                {
                    Name = "tile-restart", Kicker = "In an event", Jp = Jp.Race, Title = _races.Event.title, Value = "Restart from the grid",
                    Style = "nm-tile--paper nm-tile--wide", Click = () => { Menu.Close(); _races.Abort("restarted"); _races.Begin(id); },
                });
                Next(new MenuTiles.Spec
                {
                    Name = "tile-leave", Kicker = "Event", Jp = Jp.Race, Title = "Leave event", Value = "Free roam, right here",
                    Click = () => { Menu.Close(); _races.Abort("left"); },
                });
                t.AppendLine($"in event {_races.Event.title}");
            }
            else
            {
                // During the career its goal leads (a paper ticket beside Resume); the next event steps down a row.
                var career = CareerTile(top, t);
                var rec = _races != null ? Recommend() : -1;
                if (rec >= 0)
                {
                    var ev = _races.Set.events[rec];
                    var spec = new MenuTiles.Spec
                    {
                        Name = "tile-event", Kicker = "Next event", Jp = Jp.Race, Title = ev.title, Value = $"+{ev.completion:N0} Sparks",
                        // The tile travels there: with events open but fast travel not yet (career), it waits for fast travel.
                        Feature = Core.Unlocks.IsUnlocked(Core.FeatureId.Races) ? Core.FeatureId.FastTravel : Core.FeatureId.Races,
                        Click = () => { Menu.Close(); _travel.ToEvent(rec); },
                    };
                    if (career) Next(spec);
                    else { spec.Style = "nm-tile--wide"; Tile(top, spec); }
                    t.AppendLine($"event {ev.title}");
                }
            }

            // The garage — tuning was there but nobody found it (owner, 2026-10-13).
            if (_garage != null && car != null && !_garage.TestDriving)
            {
                var fitted = 0;
                var state = _progress.Car(car.id);
                foreach (var c in Vehicles.CarTune.All) if (state.tune[c] > 0) fitted++;
                Next(new MenuTiles.Spec
                {
                    Name = "tile-tune", Kicker = "Garage", Jp = Jp.Tune, Title = $"Tune {car.displayName}",
                    Value = fitted == 0 ? "" : $"{fitted} / 4 parts", Feature = Core.FeatureId.Tuning, Click = () => _garage.Screen.ShowTune(), Car = car,
                });
                t.AppendLine("garage tile");
            }

            // Daily challenge: the reason to drive today, and to come back tomorrow.
            var daily = Progress.DailySystem.Instance;
            if (daily != null && daily.Settings != null)
            {
                var c = daily.Challenge;
                Next(new MenuTiles.Spec
                {
                    Name = "tile-daily", Kicker = daily.Streak > 1 ? $"Daily · day {daily.Streak}" : "Daily", Jp = Jp.Daily,
                    Title = string.Format(c.title, c.target), Value = daily.ChallengeDone ? "Done" : $"+{c.reward:N0} Sparks",
                    Meter = daily.ChallengeDone ? 1f : Mathf.Clamp01(daily.ChallengeProgress / Mathf.Max(0.001f, c.target)),
                    Feature = Core.FeatureId.Daily, Click = () => Menu.Close(),
                });
                t.AppendLine($"daily {string.Format(c.title, c.target)} {(daily.ChallengeDone ? "done" : "")}");
            }

            // Home, with the map's own picture of it.
            var mapArt = Map.MapSystem.Instance != null ? Map.MapSystem.Instance.EnsureBase() : null;
            var home = Next2(new MenuTiles.Spec
            {
                Name = "tile-commons", Kicker = "Fast travel", Jp = Jp.Home, Title = "Sakura Commons", Picture = mapArt,
                Feature = Core.FeatureId.FastTravel, Click = () => { Menu.Close(); _travel.ToCommons(); },
            });
            if (home != null && mapArt != null)
            {
                // The Commons sit at about 68 % / 66 % of the map art (MapArtBaker): zoom in on them.
                var pic = home.Q(className: "nm-tile__pic");
                pic.style.backgroundSize = new BackgroundSize(Length.Percent(600), Length.Percent(600 * 1.78f));
                pic.style.backgroundPositionX = new BackgroundPosition(BackgroundPositionKeyword.Left, Length.Percent(70f));
                pic.style.backgroundPositionY = new BackgroundPosition(BackgroundPositionKeyword.Top, Length.Percent(68f));
            }

            var photo = Menu.Screen<PhotoScreen>();
            if (photo != null)
                Next(new MenuTiles.Spec
                {
                    Name = "tile-photo", Icon = Icon.Photo, Kicker = "Photo mode", Jp = Jp.Photo, Title = "Take a photo", Value = "P",
                    Feature = photo.Feature, Click = () => Menu.Show(photo),
                });

            // The cheapest car not owned yet, with how far there is to go.
            var goal = Goal();
            if (goal != null)
            {
                Next(new MenuTiles.Spec
                {
                    Name = "tile-nextcar", Kicker = "Next car", Jp = Jp.NextCar, Title = goal.displayName,
                    Value = balance >= goal.price ? "Buy it now" : $"{goal.price - balance:N0} Sparks to go",
                    Meter = Mathf.Clamp01(balance / (float)Mathf.Max(1, goal.price)), Feature = Core.FeatureId.CarShop, Car = goal,
                    Click = () => { var cars = Menu.Screen<CarsScreen>(); if (cars != null) Menu.Show(cars); },
                });
                t.AppendLine($"goal {goal.displayName}");
            }
            if (CareerOn)
            {
                // Skip lives here and in the intro, never in the way: a plain text button under the tiles, with a question.
                var skip = Ui.Button(body, "Skip tutorial · unlock everything", ConfirmSkip, "jm-btn", "jm-rise", "nm-quiet");
                skip.name = "career-skip";
            }
            _text = t.ToString();

            Button Next2(MenuTiles.Spec spec)
            {
                if (inRow == 3) { row = Ui.Row(rows, "nm-tilerow"); inRow = 0; }
                var b = Tile(row, spec);
                if (b.style.display != DisplayStyle.None) inRow++;
                return b.style.display != DisplayStyle.None ? b : null;
            }
        }

        static Button Tile(VisualElement parent, MenuTiles.Spec s)
        {
            var b = MenuTiles.Tile(parent, s);
            b.AddToClassList("jm-rise");
            return b;
        }

        static bool CareerOn => Career.CareerSystem.Instance != null && Career.CareerSystem.Instance.Active;

        /// <summary>The career's current goal as the page's hero (one voice leads): chapter, goal, how far, "Show me".</summary>
        bool CareerTile(VisualElement top, StringBuilder t)
        {
            var career = Career.CareerSystem.Instance;
            var step = CareerOn ? career.Chain.Current : null;
            if (step == null) return false;
            var chain = career.Chain;
            chain.Chapter(chain.Index, out var chapter, out var chapters, out _, out _);
            var s = step.Value;
            var b = Tile(top, new MenuTiles.Spec
            {
                Name = "tile-career", Kicker = $"Career · chapter {chapter} of {chapters}", Jp = Jp.Career,
                Title = Career.CareerChain.Title(s), Value = s.reward > 0 ? $"+{s.reward:N0} Sparks" : "",
                Meter = chain.Index / (float)chain.Count, Style = "nm-tile--paper nm-tile--wide", Click = () => Menu.Close(),
            });
            var stamp = new Hanko(Jp.New, 52f);
            stamp.AddToClassList("nm-tile__stamp");
            b.Add(stamp);
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
