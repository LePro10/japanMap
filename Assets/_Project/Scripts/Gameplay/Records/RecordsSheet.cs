using System.Collections.Generic;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Records
{
    /// <summary>
    /// The Records sheet (Tab), ASTRA §10/§11 "Analytics becomes player-readable Records": the five driving records
    /// with their card pictures, the milestones, every event's best medal and best time per car, the discovery album
    /// (eight regions × three). PROVISIONAL look until the menu of Phase 9, where it becomes the Records tab.
    /// </summary>
    public sealed class RecordsSheet : MonoBehaviour
    {
        [SerializeField] PlayerProgress progress;
        [SerializeField] PlayerModeController player;
        [SerializeField] RaceEventSet events;
        [SerializeField] DiscoverySet cards;
        [SerializeField] RegionSet regions;
        [SerializeField] GameplayHud hud;
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] InputActionAsset actions;

        UIDocument _doc;
        VisualElement _root, _body;
        InputAction _toggle;
        readonly List<Texture2D> _textures = new();

        public bool IsOpen { get; private set; }
        /// <summary>Text of the open sheet (tests read what the player reads).</summary>
        public string Text { get; private set; } = "";

        void Awake()
        {
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = panelSettings;
            _doc.sortingOrder = 7;
            if (actions != null) _toggle = actions.FindActionMap("Player", true).FindAction("Records", true);
        }

        void OnEnable()
        {
            _escape.Enable();
            _escape.performed += OnEscape;
            _root = _doc.rootVisualElement;
            _root.Clear();
            _root.style.position = Position.Absolute;
            _root.style.left = _root.style.right = _root.style.top = _root.style.bottom = 40;
            _root.style.backgroundColor = new Color(0.04f, 0.05f, 0.09f, 0.94f);
            _root.style.borderTopLeftRadius = _root.style.borderTopRightRadius = _root.style.borderBottomLeftRadius = _root.style.borderBottomRightRadius = 12;
            _root.style.paddingLeft = _root.style.paddingRight = _root.style.paddingTop = _root.style.paddingBottom = 20;
            _root.style.display = DisplayStyle.None;
            var scroll = new ScrollView();
            scroll.style.flexGrow = 1;
            _root.Add(scroll);
            _body = scroll;
            if (_toggle != null)
            {
                _toggle.Enable();
                _toggle.performed += OnToggle;
            }
        }

        // Esc as an action: a short press between two frames still counts (play scripts, tests).
        readonly InputAction _escape = new("Escape", InputActionType.Button, "<Keyboard>/escape");

        void OnEscape(InputAction.CallbackContext _)
        {
            if (IsOpen) Close();
        }

        void OnDisable()
        {
            _escape.performed -= OnEscape;
            _escape.Disable();
            if (_toggle != null) _toggle.performed -= OnToggle;
        }

        void OnToggle(InputAction.CallbackContext _) => Toggle();

        public void Toggle()
        {
            if (IsOpen) Close();
            else Open();
        }

        public void Open()
        {
            if (IsOpen || player == null || player.Suspended) return; // not over the garage or photo mode
            IsOpen = true;
            player.SetSuspended(true);
            if (hud != null) hud.Hidden = true;
            Fill();
            _root.style.display = DisplayStyle.Flex;
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            _root.style.display = DisplayStyle.None;
            if (hud != null) hud.Hidden = false;
            player.SetSuspended(false);
            foreach (var t in _textures) Destroy(t);
            _textures.Clear();
        }

        void Fill()
        {
            _body.Clear();
            var text = new System.Text.StringBuilder();
            var d = progress.Data;
            var r = d.records;
            Heading("Records", 30);
            Line($"{progress.Wallet.Balance:N0} Sparks  ·  {d.cars.FindAll(c => c.owned).Count}/{progress.Fleet.vehicles.Length} cars  ·  " +
                 $"{r.races} events finished, {r.wins} won  ·  saved: {progress.StoreName}   (Tab / Esc closes)", 16, new Color(0.8f, 0.85f, 0.9f));

            Heading("Driving", 22);
            var tiles = Row();
            foreach (var kind in RecordKeeper.Headline)
            {
                var tile = new VisualElement();
                tile.style.width = 200;
                tile.style.marginRight = 10;
                var pic = new VisualElement();
                pic.style.width = 200;
                pic.style.height = 112;
                pic.style.backgroundColor = new Color(0.12f, 0.13f, 0.18f);
                var tex = RecordKeeper.LoadCard(kind);
                if (tex != null)
                {
                    _textures.Add(tex);
                    pic.style.backgroundImage = new StyleBackground(tex);
                }
                tile.Add(pic);
                var value = RecordKeeper.Value(r, kind);
                var card = d.records.cards.Find(c => c.kind == kind.ToString());
                AddLabel(tile, RecordKeeper.Title(kind), 15, new Color(0.75f, 0.8f, 0.85f));
                AddLabel(tile, value > 0f ? RecordKeeper.Format(kind, value) : "—", 22, Color.white);
                if (card != null) AddLabel(tile, $"{card.car}{(card.place != "" ? " · " + card.place : "")}", 13, new Color(0.7f, 0.72f, 0.78f));
                tiles.Add(tile);
                text.AppendLine($"{RecordKeeper.Title(kind)} {(value > 0f ? RecordKeeper.Format(kind, value) : "-")}");
            }

            Heading("Milestones", 22);
            var e = progress.Wallet.Settings;
            var ms = Row();
            ms.style.flexWrap = Wrap.Wrap;
            var got = 0;
            foreach (var m in e.milestones)
            {
                var done = progress.Claimed($"milestone:{m.kind}:{m.threshold}");
                if (done) got++;
                var l = AddLabel(ms, $"{(done ? "✓" : "○")} {RecordKeeper.Title(m.kind)} {RecordKeeper.Format(m.kind, m.threshold)}", 15,
                    done ? new Color(0.6f, 0.95f, 0.7f) : new Color(0.6f, 0.62f, 0.68f));
                l.style.width = 250;
            }
            text.AppendLine($"Milestones {got}/{e.milestones.Length}");

            Heading("Events", 22);
            foreach (var ev in events.events)
            {
                var rec = d.events.Find(x => x.id == ev.id);
                var medal = rec == null || rec.finishes == 0 ? "not finished"
                    : rec.bestTier switch { 3 => "Gold", 2 => "Silver", 1 => "Bronze", _ => "finished" };
                var bests = "";
                if (rec != null)
                    foreach (var b in rec.bests)
                    {
                        var car = progress.Fleet.Get(b.car);
                        var name = car != null ? car.displayName : b.car;
                        bests += ev.kind == RaceKind.Drift ? $"   {name} ({b.tune}) {b.score:N0} pts" : $"   {name} ({b.tune}) {Clock(b.seconds)}";
                    }
                Line($"{ev.title} · {medal}{(rec != null ? $" · {rec.finishes}× finished" : "")}{bests}", 16, Color.white);
                text.AppendLine($"{ev.title} {medal}{bests}");
            }

            Heading($"Discoveries · {d.discoveries.Count}/{cards.cards.Length}", 22);
            foreach (var region in regions.regions)
            {
                var row = "";
                foreach (var c in cards.cards)
                    if (c.region == region.id) row += d.discoveries.Contains(c.id) ? $"  ✓ {c.title}" : "  ○ ???";
                Line($"{region.title}:{row}", 15, d.regions.Contains(region.id) ? Color.white : new Color(0.55f, 0.57f, 0.62f));
            }
            text.AppendLine($"Discoveries {d.discoveries.Count}/{cards.cards.Length}");
            Text = text.ToString();
        }

        static string Clock(float s) => $"{Mathf.FloorToInt(s / 60f)}:{s % 60f:00.0}";

        VisualElement Row()
        {
            var r = new VisualElement();
            r.style.flexDirection = FlexDirection.Row;
            r.style.marginBottom = 6;
            _body.Add(r);
            return r;
        }

        void Heading(string text, float size)
        {
            var l = AddLabel(_body, text, size, Color.white);
            l.style.unityFontStyleAndWeight = FontStyle.Bold;
            l.style.marginTop = 10;
        }

        void Line(string text, float size, Color color) => AddLabel(_body, text, size, color);

        static Label AddLabel(VisualElement parent, string text, float size, Color color)
        {
            var l = new Label(text);
            l.style.fontSize = size;
            l.style.color = color;
            l.style.whiteSpace = WhiteSpace.Normal;
            parent.Add(l);
            return l;
        }
    }
}
