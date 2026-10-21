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
    /// (five records as big numbers with their card pictures, milestones as a stamp book), Events (best medal, best
    /// time per car and parts) and Discoveries (eight regions × three stamps). Tab opens it. Holds the data references.
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
                           $"{r.races} events · {r.wins} won");
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
                // Best values as big numbers (a card picture above when one was taken), then the milestones as stamps.
                var stats = Ui.Row(body, "jm-wrap", "nm-stats");
                foreach (var kind in RecordKeeper.Headline)
                {
                    var tile = Ui.Box(stats, "jm-tile", "nm-stat");
                    tile.style.width = 200;
                    var tex = RecordKeeper.LoadCard(kind);
                    if (tex != null)
                    {
                        _textures.Add(tex);
                        var pic = Ui.Box(tile, "jm-pic");
                        pic.style.width = 180;
                        pic.style.height = 101;
                        pic.style.backgroundImage = new StyleBackground(tex);
                    }
                    var value = RecordKeeper.Value(r, kind);
                    Ui.Text(tile, RecordKeeper.Title(kind).ToUpperInvariant(), "nm-stat__label", "jm-small");
                    var (number, unit) = Split(value > 0f ? RecordKeeper.Format(kind, value) : "—");
                    var line = Ui.Row(tile, "nm-stat__value");
                    line.style.alignItems = Align.FlexEnd;
                    Ui.Text(line, number, "nm-num", "jm-big");
                    Ui.Text(line, unit, "nm-unit", "jm-small").style.marginLeft = 4;
                    var card = d.records.cards.Find(c => c.kind == kind.ToString());
                    if (card != null) Ui.Small(tile, $"{card.car}{(card.place != "" ? " · " + card.place : "")}");
                }

                var e = _progress.Wallet.Settings;
                var got = 0;
                foreach (var m in e.milestones)
                    if (_progress.Claimed($"milestone:{m.kind}:{m.threshold}")) got++;
                Nm.Kicker(body, $"Milestones {got}/{e.milestones.Length}", Jp.Done).style.marginTop = 16;
                var grid = Ui.Row(body, "jm-wrap", "nm-stamps");
                foreach (var m in e.milestones)
                    Stamp(grid, _progress.Claimed($"milestone:{m.kind}:{m.threshold}"), Jp.Done, $"{StampWord(m.kind)} {RecordKeeper.Format(m.kind, m.threshold)}");
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
                Nm.Kicker(body, $"Discoveries {d.discoveries.Count}/{_cards.cards.Length}", Jp.Found);
                foreach (var region in _regions.regions)
                {
                    var known = d.regions.Contains(region.id);
                    var head = Nm.Kicker(body, known ? region.title : "???", known ? Jp.Region(region.title) : "", "nm-region");
                    head.style.marginTop = 12;
                    if (!known) head.AddToClassList("jm-dim");
                    var grid = Ui.Row(body, "jm-wrap", "nm-stamps");
                    foreach (var c in _cards.cards)
                    {
                        if (c.region != region.id) continue;
                        var found = d.discoveries.Contains(c.id);
                        Stamp(grid, found, Jp.Found, found ? c.title : "???");
                        if (found) text.AppendLine($"found {c.title}");
                    }
                }
                text.AppendLine($"Discoveries {d.discoveries.Count}/{_cards.cards.Length}");
            }
            _text = text.ToString();
        }

        static string Clock(float s) => $"{Mathf.FloorToInt(s / 60f)}:{s % 60f:00.0}";
        /// <summary>
        /// One page of the stamp book: a red hanko with its word when earned, a pale ring with "?" when not, the short
        /// name under it.
        /// </summary>
        static void Stamp(VisualElement parent, bool done, string word, string name)
        {
            var cell = Ui.Box(parent, "nm-stamp", done ? "nm-stamp--done" : "nm-stamp--open");
            cell.style.width = 96;
            cell.style.alignItems = Align.Center;
            cell.style.marginRight = 6;
            cell.style.marginBottom = 10;
            var hanko = Ui.Add(cell, new Hanko(done ? word : "", 58f));
            if (!done)
            {
                hanko.Ink = Palette.WashiDim.A(0.4f);
                hanko.style.rotate = new Rotate(new Angle(0f));
                // "?" in the UI face, not the stamp's Japanese atlas (it holds only the Jp words).
                var q = Ui.Text(hanko, "?", "nm-stamp__q", "jm-dim");
                q.pickingMode = PickingMode.Ignore;
                q.style.position = Position.Absolute;
                q.style.left = q.style.right = q.style.top = q.style.bottom = 0;
                q.style.unityTextAlign = TextAnchor.MiddleCenter;
                q.style.fontSize = 24;
            }
            var label = Ui.Text(cell, name, "nm-stamp__name", "jm-small", done ? "jm-body" : "jm-dim");
            label.style.unityTextAlign = TextAnchor.UpperCenter;
            label.style.whiteSpace = WhiteSpace.Normal;
            label.style.marginTop = 4;
        }

        /// <summary>"123 km/h" → ("123", "km/h"): the number big, the unit small beside it.</summary>
        static (string number, string unit) Split(string formatted)
        {
            var i = formatted.LastIndexOf(' ');
            return i < 0 ? (formatted, "") : (formatted.Substring(0, i), formatted.Substring(i + 1));
        }

        /// <summary>One word per record for the stamp names (the long titles wrap to three lines under a stamp).</summary>
        static string StampWord(Economy.MilestoneKind k) => k switch
        {
            Economy.MilestoneKind.TopSpeedKmh => "Speed",
            Economy.MilestoneKind.AirtimeSeconds => "Air",
            Economy.MilestoneKind.JumpMetres => "Jump",
            Economy.MilestoneKind.BankedChain => "Drift",
            _ => "Drive",
        };
    }
}
