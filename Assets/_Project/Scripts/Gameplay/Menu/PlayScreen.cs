using System.Text;
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
            Ui.H1(body, "Paused");
            var p = Menu.Player;
            var car = p != null && p.Car != null ? p.Car.Definition : null;
            var balance = _progress != null ? _progress.Wallet.Balance : 0;
            var cols = Ui.Box(body, "jm-cols");
            var left = Ui.Box(cols, "jm-col");
            var right = Ui.Box(cols, "jm-col");

            var carCard = Ui.Box(left, "jm-panel");
            Ui.Small(carCard, p != null && p.Current == PlayerModeController.Mode.Walking ? "On foot · your car" : "Driving");
            Ui.Text(carCard, car != null ? car.displayName : "—", "jm-h1");
            Ui.Text(carCard, $"{balance:N0} Sparks", "jm-body", "jm-amber");
            t.AppendLine($"car {car?.displayName} · {balance} Sparks");

            // Pinned goal: the cheapest car not owned yet (ASTRA: purchase progress on Play).
            var goal = Goal();
            if (goal != null)
            {
                var g = Ui.Box(left, "jm-panel");
                g.style.marginTop = 12;
                Ui.Small(g, "Next car");
                Ui.Text(g, $"{goal.displayName} · {goal.price:N0} Sparks", "jm-h2");
                var bar = Ui.Box(g);
                bar.style.height = 8;
                bar.style.backgroundColor = new Color(1f, 1f, 1f, 0.12f);
                bar.style.borderTopLeftRadius = bar.style.borderTopRightRadius = bar.style.borderBottomLeftRadius = bar.style.borderBottomRightRadius = 4;
                var fill = Ui.Box(bar);
                fill.style.height = Length.Percent(100);
                fill.style.width = Length.Percent(Mathf.Clamp01(balance / (float)Mathf.Max(1, goal.price)) * 100f);
                fill.style.backgroundColor = new Color(0.95f, 0.77f, 0.42f);
                Ui.Small(g, balance >= goal.price ? "You can buy it now — Cars." : $"{goal.price - balance:N0} Sparks to go");
                t.AppendLine($"goal {goal.displayName}");
            }

            if (_garage != null && _garage.TestDriving)
            {
                var e = Ui.Box(right, "jm-panel");
                Ui.Small(e, "Test drive");
                Ui.Text(e, $"{Mathf.CeilToInt(_garage.TestDriveLeft)} s left in the {car?.displayName}", "jm-h2");
                Ui.Button(e, "End test drive", () => { Menu.Close(); _garage.EndTestDrive(); });
                t.AppendLine("test drive");
            }
            else if (_races != null && (_races.Current == RaceDirector.State.Running || _races.Current == RaceDirector.State.Countdown))
            {
                var e = Ui.Box(right, "jm-panel");
                Ui.Small(e, "In an event");
                Ui.Text(e, _races.Event.title, "jm-h2");
                var row = Ui.Row(e, "jm-wrap");
                var id = _races.Event.id;
                Ui.Button(row, "Restart event", () => { Menu.Close(); _races.Abort("restarted"); _races.Begin(id); });
                Ui.Button(row, "Leave event", () => { Menu.Close(); _races.Abort("left"); });
                t.AppendLine($"in event {_races.Event.title}");
            }
            else if (_races != null)
            {
                var rec = Recommend();
                if (rec >= 0)
                {
                    var ev = _races.Set.events[rec];
                    var e = Ui.Box(right, "jm-panel");
                    Ui.Small(e, "Nearby event");
                    Ui.Text(e, ev.title, "jm-h2");
                    Ui.Small(e, ev.blurb);
                    var reward = Ui.Text(e, $"Finish {ev.completion} Sparks · up to +{ev.bonus}", "jm-body", "jm-amber");
                    reward.style.marginTop = 6;
                    Ui.Button(e, "Go to the start", () => { Menu.Close(); _travel.ToEvent(rec); });
                    t.AppendLine($"event {ev.title}");
                }
            }
            var small = Ui.Row(right, "jm-wrap");
            small.style.marginTop = 12;
            Ui.Button(small, "Go to Sakura Commons", () => { Menu.Close(); _travel.ToCommons(); });
            Ui.Small(right, "Esc / Continue resumes exactly where you are.");
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

        /// <summary>Nearest event without a medal yet, else the nearest one.</summary>
        int Recommend()
        {
            var p = Menu.Player;
            if (p == null) return -1;
            var at = p.Current == PlayerModeController.Mode.Driving && p.Car != null ? p.Car.transform.position
                : p.Walker != null ? p.Walker.transform.position : Vector3.zero;
            var best = -1;
            var bestD = float.MaxValue;
            foreach (var (pos, index) in _races.Markers)
            {
                var ev = _races.Set.events[index];
                var rec = _progress?.Data.events.Find(x => x.id == ev.id);
                var d = Vector3.Distance(pos, at) + (rec != null && rec.bestTier > 0 ? 5000f : 0f);
                if (d < bestD) { bestD = d; best = index; }
            }
            return best;
        }
    }
}
