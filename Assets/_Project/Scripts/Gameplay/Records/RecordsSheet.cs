using System.Collections.Generic;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Records
{
    /// <summary>
    /// The Records tab of the menu (ASTRA §10/§11 "Analytics becomes player-readable Records"): sub-tabs Driving
    /// (five records with their card pictures, distance, milestones), Events (best medal, best time per car and
    /// parts) and Discoveries (eight regions × three). Tab opens it. Holds the data references for its page.
    /// </summary>
    public sealed class RecordsSheet : MonoBehaviour
    {
        [SerializeField] PlayerProgress progress;
        [SerializeField] PlayerModeController player;
        [SerializeField] RaceEventSet events;
        [SerializeField] DiscoverySet cards;
        [SerializeField] RegionSet regions;

        RecordsScreen _screen;

        public bool IsOpen => GameMenu.Instance != null && GameMenu.Instance.IsOpen && GameMenu.Instance.Current == Screen;
        /// <summary>Text of the open page (tests read what the player reads).</summary>
        public string Text => _screen?.Text ?? "";

        public RecordsScreen Screen => _screen ??= new RecordsScreen(progress, events, cards, regions);

        public void Toggle()
        {
            if (IsOpen) Close();
            else Open();
        }

        public void Open() => GameMenu.Instance?.Open(Screen);

        public void Close()
        {
            if (IsOpen) GameMenu.Instance.Close();
        }
    }

    public sealed class RecordsScreen : MenuScreen
    {
        static readonly string[] Tabs = { "Driving", "Events", "Discoveries" };
        readonly PlayerProgress _progress;
        readonly RaceEventSet _events;
        readonly DiscoverySet _cards;
        readonly RegionSet _regions;
        readonly List<Texture2D> _textures = new();
        int _tab;
        string _text = "";

        public RecordsScreen(PlayerProgress progress, RaceEventSet events, DiscoverySet cards, RegionSet regions)
        {
            _progress = progress;
            _events = events;
            _cards = cards;
            _regions = regions;
        }

        public override string Title => "Records";
        public override Icon Icon => Icon.Records;
        public override string Text => _text;

        public override void Closed()
        {
            foreach (var t in _textures) Object.Destroy(t);
            _textures.Clear();
        }

        public override void Build(VisualElement body)
        {
            Closed();
            var d = _progress.Data;
            var r = d.records;
            var text = new System.Text.StringBuilder();
            Ui.H1(body, "Records");
            Ui.Small(body, $"{_progress.Wallet.Balance:N0} Sparks  ·  {d.cars.FindAll(c => c.owned).Count}/{_progress.Fleet.vehicles.Length} cars  ·  " +
                           $"{r.races} events finished, {r.wins} won  ·  saved: {_progress.StoreName}");
            var tabs = Ui.Row(body, "jm-wrap");
            tabs.style.marginTop = 10;
            for (var i = 0; i < Tabs.Length; i++)
            {
                var index = i;
                var b = Ui.Button(tabs, Tabs[i], () => { _tab = index; Menu.Rebuild(); });
                Ui.On(b, i == _tab);
            }

            // The driving records always go into the text (tests and the screen reader read all of them).
            foreach (var kind in RecordKeeper.Headline)
            {
                var value = RecordKeeper.Value(r, kind);
                text.AppendLine($"{RecordKeeper.Title(kind)} {(value > 0f ? RecordKeeper.Format(kind, value) : "-")}");
            }

            if (_tab == 0)
            {
                Ui.H2(body, "Driving");
                var tiles = Ui.Row(body, "jm-wrap");
                foreach (var kind in RecordKeeper.Headline)
                {
                    var tile = Ui.Box(tiles, "jm-tile");
                    tile.style.width = 200;
                    var pic = Ui.Box(tile, "jm-pic");
                    pic.style.width = 180;
                    pic.style.height = 101;
                    var tex = RecordKeeper.LoadCard(kind);
                    if (tex != null)
                    {
                        _textures.Add(tex);
                        pic.style.backgroundImage = new StyleBackground(tex);
                    }
                    var value = RecordKeeper.Value(r, kind);
                    var card = d.records.cards.Find(c => c.kind == kind.ToString());
                    Ui.Small(tile, RecordKeeper.Title(kind));
                    Ui.Text(tile, value > 0f ? RecordKeeper.Format(kind, value) : "—", "jm-h2");
                    if (card != null) Ui.Small(tile, $"{card.car}{(card.place != "" ? " · " + card.place : "")}");
                }

                Ui.H2(body, "Milestones");
                var e = _progress.Wallet.Settings;
                var ms = Ui.Row(body, "jm-wrap");
                var got = 0;
                foreach (var m in e.milestones)
                {
                    var done = _progress.Claimed($"milestone:{m.kind}:{m.threshold}");
                    if (done) got++;
                    var l = Ui.Text(ms, $"{(done ? "✓" : "○")} {RecordKeeper.Title(m.kind)} {RecordKeeper.Format(m.kind, m.threshold)}", done ? "jm-ok" : "jm-dim");
                    l.style.width = 250;
                    l.style.minHeight = 28;
                }
                text.AppendLine($"Milestones {got}/{e.milestones.Length}");
            }
            else if (_tab == 1)
            {
                Ui.H2(body, "Events");
                foreach (var ev in _events.events)
                {
                    var rec = d.events.Find(x => x.id == ev.id);
                    var medal = rec == null || rec.finishes == 0 ? "not finished"
                        : rec.bestTier switch { 3 => "Gold", 2 => "Silver", 1 => "Bronze", _ => "finished" };
                    var panel = Ui.Box(body, "jm-panel");
                    panel.style.marginBottom = 8;
                    Ui.Text(panel, $"<b>{ev.title}</b>  ·  {medal}{(rec != null ? $" · {rec.finishes}× finished" : "")}");
                    var bests = "";
                    if (rec != null)
                        foreach (var b in rec.bests)
                        {
                            var car = _progress.Fleet.Get(b.car);
                            var name = car != null ? car.displayName : b.car;
                            var line = ev.kind == RaceKind.Drift ? $"{name} ({b.tune}) {b.score:N0} pts" : $"{name} ({b.tune}) {Clock(b.seconds)}";
                            Ui.Small(panel, line);
                            bests += "   " + line;
                        }
                    text.AppendLine($"{ev.title} {medal}{bests}");
                }
            }
            else
            {
                Ui.H2(body, $"Discoveries · {d.discoveries.Count}/{_cards.cards.Length}");
                foreach (var region in _regions.regions)
                {
                    var known = d.regions.Contains(region.id);
                    var row = Ui.Row(body, "jm-wrap");
                    var title = Ui.Text(row, region.title, known ? "jm-body" : "jm-dim");
                    title.style.width = 200;
                    foreach (var c in _cards.cards)
                    {
                        if (c.region != region.id) continue;
                        var found = d.discoveries.Contains(c.id);
                        var chip = Ui.Text(row, found ? "✓ " + c.title : "○ ???", found ? "jm-sakura" : "jm-dim");
                        chip.style.width = 220;
                    }
                }
                text.AppendLine($"Discoveries {d.discoveries.Count}/{_cards.cards.Length}");
            }
            _text = text.ToString();
        }

        static string Clock(float s) => $"{Mathf.FloorToInt(s / 60f)}:{s % 60f:00.0}";
    }
}
