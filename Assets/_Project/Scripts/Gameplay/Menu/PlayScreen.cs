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
    /// Play (ASTRA §10): Continue, the selected car, one nearby recommended event, the pinned purchase goal and a
    /// small "Go to Sakura Commons". In an event: Restart and Leave instead of the recommendation. Travel only on
    /// an explicit button — opening this tab never moves the player.
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

        public override void Build(VisualElement body)
        {
            var t = new StringBuilder();
            var p = Menu.Player;
            var car = p != null && p.Car != null ? p.Car.Definition : null;
            var balance = _progress != null ? _progress.Wallet.Balance : 0;

            // Hero: what you drive and what you have — the two facts a returning glance looks for.
            Ui.Text(body, p != null && p.Current == PlayerModeController.Mode.Walking ? "PAUSED  ·  ON FOOT" : "PAUSED", "jm-kicker");
            Ui.Text(body, car != null ? car.displayName : "—", "jm-display");
            Ui.Text(body, $"{balance:N0} Sparks", "jm-lede");
            t.AppendLine($"car {car?.displayName} · {balance} Sparks");

            var tiles = Ui.Box(body, "jm-cards");
            // First tile: the next thing to do (an event, or the event / test drive in progress).
            if (_garage != null && _garage.TestDriving)
            {
                var e = Ui.Box(tiles, "jm-card", "jm-card--accent");
                Ui.Text(e, "TEST DRIVE", "jm-kicker");
                Ui.Text(e, $"{Mathf.CeilToInt(_garage.TestDriveLeft)} s left", "jm-card-title");
                Ui.Small(e, $"in the {car?.displayName}");
                Ui.Button(e, "End test drive", () => { Menu.Close(); _garage.EndTestDrive(); });
                t.AppendLine("test drive");
            }
            else if (_races != null && (_races.Current == RaceDirector.State.Running || _races.Current == RaceDirector.State.Countdown))
            {
                var e = Ui.Box(tiles, "jm-card", "jm-card--accent");
                Ui.Text(e, "IN AN EVENT", "jm-kicker");
                Ui.Text(e, _races.Event.title, "jm-card-title");
                var row = Ui.Row(e, "jm-wrap", "jm-gap");
                var id = _races.Event.id;
                Ui.Button(row, "Restart", () => { Menu.Close(); _races.Abort("restarted"); _races.Begin(id); }, "jm-btn--primary");
                Ui.Button(row, "Leave event", () => { Menu.Close(); _races.Abort("left"); }, "jm-btn--ghost");
                t.AppendLine($"in event {_races.Event.title}");
            }
            else if (_races != null)
            {
                var rec = Recommend();
                if (rec >= 0)
                {
                    var ev = _races.Set.events[rec];
                    var e = Ui.Box(tiles, "jm-card", "jm-card--accent");
                    Ui.Text(e, "NEXT EVENT", "jm-kicker");
                    Ui.Text(e, ev.title, "jm-card-title");
                    Ui.Small(e, ev.blurb);
                    var reward = Ui.Text(e, $"+{ev.completion:N0} Sparks  ·  up to +{ev.completion + ev.bonus:N0}", "jm-body", "jm-amber");
                    reward.style.marginTop = 8;
                    Ui.Button(e, "Go to the start", () => { Menu.Close(); _travel.ToEvent(rec); }, "jm-btn--primary");
                    t.AppendLine($"event {ev.title}");
                }
            }

            // Daily challenge: the reason to drive today, and to come back tomorrow.
            var daily = Progress.DailySystem.Instance;
            if (daily != null && daily.Settings != null)
            {
                var c = daily.Challenge;
                var d = Ui.Box(tiles, "jm-card", "jm-card--daily");
                Ui.Text(d, daily.Streak > 1 ? $"DAILY CHALLENGE · DAY {daily.Streak}" : "DAILY CHALLENGE", "jm-kicker");
                Ui.Text(d, string.Format(c.title, c.target), "jm-card-title");
                if (daily.ChallengeDone) Ui.Text(d, $"Done · +{c.reward:N0} Sparks earned", "jm-body", "jm-ok");
                else
                {
                    Ui.Text(d, $"+{c.reward:N0} Sparks", "jm-body", "jm-amber");
                    var dbar = Ui.Box(d, "jm-meter");
                    var dfill = Ui.Box(dbar);
                    dfill.style.width = Length.Percent(Mathf.Clamp01(daily.ChallengeProgress / Mathf.Max(0.001f, c.target)) * 100f);
                }
                var left = daily.Left;
                Ui.Small(d, $"New challenge in {(int)left.TotalHours} h {left.Minutes:00} min");
                t.AppendLine($"daily {string.Format(c.title, c.target)} {(daily.ChallengeDone ? "done" : "")}");
            }

            // Second tile: the pinned purchase goal (ASTRA: purchase progress on Play).
            var goal = Goal();
            if (goal != null)
            {
                var g = Ui.Box(tiles, "jm-card");
                Ui.Text(g, "NEXT CAR", "jm-kicker");
                Ui.Text(g, goal.displayName, "jm-card-title");
                Ui.Text(g, $"{goal.price:N0} Sparks", "jm-body", "jm-amber");
                var bar = Ui.Box(g, "jm-meter");
                var fill = Ui.Box(bar);
                fill.style.width = Length.Percent(Mathf.Clamp01(balance / (float)Mathf.Max(1, goal.price)) * 100f);
                Ui.Small(g, balance >= goal.price ? "You can buy it now — see Cars." : $"{goal.price - balance:N0} Sparks to go");
                t.AppendLine($"goal {goal.displayName}");
            }

            // Third tile: the garage — tuning was there but nobody found it (owner, 2026-10-13).
            if (_garage != null && car != null && !_garage.TestDriving)
            {
                var g = Ui.Box(tiles, "jm-card");
                Ui.Text(g, "GARAGE", "jm-kicker");
                Ui.Text(g, $"Tune your {car.displayName}", "jm-card-title");
                var fitted = 0;
                var state = _progress.Car(car.id);
                foreach (var c in Vehicles.CarTune.All) if (state.tune[c] > 0) fitted++;
                Ui.Small(g, fitted == 0 ? "Engine, brakes, suspension, tyres · paint, rims, kits" : $"{fitted} of 4 parts upgraded · paint, rims, kits");
                Ui.Button(g, "Tune now", () => _garage.Screen.ShowTune(), "jm-btn--primary");
                t.AppendLine("garage tile");
            }

            var foot = Ui.Box(body, "jm-foot");
            Ui.Button(foot, "Go to Sakura Commons", () => { Menu.Close(); _travel.ToCommons(); }, "jm-btn--ghost");
            if (!UiPanel.IsPhone) Ui.Small(foot, "Esc resumes exactly where you are.");
            _text = t.ToString();
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
