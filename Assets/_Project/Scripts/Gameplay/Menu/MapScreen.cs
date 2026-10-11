using System.Collections.Generic;
using System.Text;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Map;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// The world map (ASTRA §10): the whole island in an aspect-preserving square, eight tinted regions, the real road
    /// hierarchy, the player, filters Events / Places / Discoveries / All, and one info card. Mouse drag / wheel or
    /// one-finger pan / two-finger pinch move the view — moving the view never teleports. A tap on an icon opens its
    /// card (event: Go to the start; travel point: Travel, after its region is discovered; clue: hint, a postcard of
    /// the place and an 80 m search circle); a tap on empty land shows the region and can set a waypoint.
    /// </summary>
    public sealed class MapScreen : MenuScreen
    {
        static readonly string[] FilterNames = { "All", "Events", "Places", "Discoveries" };
        readonly MapSystem _map;
        readonly Travel _travel;
        readonly List<MapPin> _pins = new();
        readonly Dictionary<int, Vector2> _pointers = new();
        MapView _view;
        VisualElement _card;
        MapFilter _filter = MapFilter.All;
        Vector2 _centre;
        float _span = -1f, _pinchStart, _spanStart;
        Vector2 _downAt;
        bool _dragged;
        string _selected = "";
        Texture2D _postcard;
        string _text = "";

        public MapScreen(MapSystem map, Travel travel)
        {
            _map = map;
            _travel = travel;
        }

        public override string Title => "Map";
        public override Icon Icon => Icon.Map;
        public override string Text => _text;
        public MapView View => _view;
        public string Selected => _selected;

        public override bool Back()
        {
            // Back clears the selection before it closes the map (ASTRA).
            if (_selected == "") return false;
            Select("");
            return true;
        }

        public override void Closed()
        {
            _selected = "";
            FreePostcard();
        }

        void FreePostcard()
        {
            if (_postcard != null) Object.Destroy(_postcard);
            _postcard = null;
        }

        public override void Build(VisualElement body)
        {
            if (_map == null) { Ui.H1(body, "Map"); return; }
            var head = Ui.Row(body, "jm-wrap");
            Ui.H1(head, "Map");
            for (var i = 0; i < FilterNames.Length; i++)
            {
                var f = (MapFilter)i;
                Ui.On(Ui.Button(head, FilterNames[i], () => { _filter = f; Refresh(); Menu.Rebuild(); }), _filter == f);
            }
            Ui.Button(head, "Me", () => { var p = _map.PlayerPosition; _centre = new Vector2(p.x, p.z); Apply(); });
            if (_travel != null) Ui.Button(head, "Go to Sakura Commons", () => { Menu.Close(); _travel.ToCommons(); });

            var cols = Ui.Box(body, "jm-cols");
            var side = UiPanel.Size;
            // A tall desktop window (a tablet held upright: 820 × 1180 is not a phone) stacks the card under the map like
            // a phone in portrait; side by side the card was squeezed to a strip and Travel could not be pressed (Phase 11).
            var stacked = UiPanel.IsPortrait || side.y > side.x;
            if (stacked) cols.style.flexDirection = FlexDirection.Column;
            // The square frame: as large as the page allows, never squeezed.
            var square = UiPanel.IsPortrait ? side.x - 24f
                : stacked ? Mathf.Min(side.x - 300f, side.y * 0.55f)
                : Mathf.Min(side.y - (UiPanel.IsPhone ? 90f : 150f), side.x * 0.62f);
            _view = new MapView(_map.Roads, _map.Regions, _map.Bounds, _map.EnsureBase()) { name = "worldmap" };
            _view.style.width = _view.style.height = square;
            _view.style.flexShrink = 0;
            _view.style.borderTopLeftRadius = _view.style.borderTopRightRadius = _view.style.borderBottomLeftRadius = _view.style.borderBottomRightRadius = 10;
            cols.Add(_view);
            _card = Ui.Box(cols, "jm-col");
            _card.style.marginLeft = stacked ? 0 : 16;
            _card.style.marginTop = stacked ? 12 : 0;
            // Stacked, the column's flex basis 0 left the card one line high with its text spilling out.
            if (stacked) { _card.style.flexGrow = 0; _card.style.flexShrink = 0; _card.style.flexBasis = StyleKeyword.Auto; }
            if (_span < 0f)
            {
                _span = _map.Bounds.width;
                _centre = _map.Bounds.center;
            }
            RegisterInput(_view);
            Refresh();
            _view.RegisterCallback<GeometryChangedEvent>(_ => Apply());
            FillCard();
        }

        void Refresh()
        {
            if (_view == null) return;
            _map.CollectPins(_pins, _filter, minimap: false);
            // Region names as pins without icon would clutter; the selected clue gets its search circle.
            for (var i = 0; i < _pins.Count; i++)
                if (_pins[i].id == _selected && _selected.StartsWith("clue:"))
                {
                    var p = _pins[i];
                    p.circle = _map.ClueRadius;
                    _pins[i] = p;
                }
            _view.SetPins(_pins);
            Apply();
        }

        void Apply()
        {
            if (_view == null) return;
            _span = Mathf.Clamp(_span, 150f, _map.Bounds.width * 1.1f);
            _view.Look(_centre, _span);
        }

        public override void Update()
        {
            // The player arrow moves in real time; menu time is paused, so only the pins need it.
            if (_view != null && Time.frameCount % 15 == 0) Refresh();
        }

        // ── input: drag, wheel, pinch, tap ────────────────────────────────────

        void RegisterInput(VisualElement e)
        {
            e.RegisterCallback<PointerDownEvent>(ev =>
            {
                _pointers[ev.pointerId] = ev.localPosition;
                e.CapturePointer(ev.pointerId);
                if (_pointers.Count == 1) { _downAt = ev.localPosition; _dragged = false; }
                if (_pointers.Count == 2) { _pinchStart = PinchDistance(); _spanStart = _span; _dragged = true; }
            });
            e.RegisterCallback<PointerMoveEvent>(ev =>
            {
                if (!_pointers.TryGetValue(ev.pointerId, out var last)) return;
                var now = (Vector2)ev.localPosition;
                _pointers[ev.pointerId] = now;
                if (_pointers.Count >= 2)
                {
                    var d = PinchDistance();
                    if (_pinchStart > 1f && d > 1f) _span = _spanStart * _pinchStart / d;
                    Apply();
                    return;
                }
                if ((now - _downAt).sqrMagnitude > 64f) _dragged = true;
                if (!_dragged) return;
                var k = _view.PixelsPerMetre;
                _centre += new Vector2(-(now.x - last.x), now.y - last.y) / k;
                Apply();
            });
            void Up(int id, Vector2 at)
            {
                if (!_pointers.ContainsKey(id)) return;
                _pointers.Remove(id);
                if (e.HasPointerCapture(id)) e.ReleasePointer(id);
                if (_pointers.Count == 0 && !_dragged) Tap(at);
            }
            e.RegisterCallback<PointerUpEvent>(ev => Up(ev.pointerId, ev.localPosition));
            e.RegisterCallback<PointerCancelEvent>(ev => { _pointers.Remove(ev.pointerId); });
            e.RegisterCallback<WheelEvent>(ev =>
            {
                // Zoom about the pointer: the point under it stays put.
                var before = _view.ToWorld(ev.localMousePosition);
                _span *= ev.delta.y > 0f ? 1.18f : 1f / 1.18f;
                Apply();
                var after = _view.ToWorld(ev.localMousePosition);
                _centre += before - after;
                Apply();
                ev.StopPropagation();
            });
        }

        float PinchDistance()
        {
            var e = _pointers.Values.GetEnumerator();
            e.MoveNext();
            var a = e.Current;
            e.MoveNext();
            return Vector2.Distance(a, e.Current);
        }

        void Tap(Vector2 local)
        {
            Audio.Sfx.Play("UI_Click");
            if (_view.PinAt(local, UiPanel.IsPhone ? 26f : 18f, out var pin)) Select(pin.id);
            else
            {
                var w = _view.ToWorld(local);
                Select($"land:{w.x:0}:{w.y:0}");
            }
        }

        /// <summary>Selects a pin by id ("event:3", "travel:commons", "clue:5", "land:x:z", "" = none) and fills its card.</summary>
        public void Select(string id)
        {
            _selected = id ?? "";
            FreePostcard();
            Refresh();
            FillCard();
        }

        // ── the info card ────────────────────────────────────────────────────

        void FillCard()
        {
            if (_card == null) return;
            _card.Clear();
            var t = new StringBuilder();
            var panel = Ui.Box(_card, "jm-panel");
            var parts = _selected.Split(':');
            switch (parts[0])
            {
                case "event": EventCard(panel, int.Parse(parts[1]), t); break;
                case "travel": TravelCard(panel, parts[1], t); break;
                case "clue":
                case "card": DiscoveryCard(panel, int.Parse(parts[1]), parts[0] == "card", t); break;
                case "garage":
                    Ui.Text(panel, "Open Bay garage", "jm-h2");
                    Ui.Small(panel, "Cars, tuning and paint in Sakura Commons. Drive up to the door and press E.");
                    Ui.Button(panel, "Go to Sakura Commons", () => { Menu.Close(); _travel.ToCommons(); }, "jm-btn--primary");
                    t.AppendLine("garage");
                    break;
                case "land": LandCard(panel, new Vector2(float.Parse(parts[1]), float.Parse(parts[2])), t); break;
                default:
                    Ui.Text(panel, RegionTitle(_map.PlayerPosition), "jm-h2");
                    Ui.Small(panel, "Tap a flag for its event, a place for travel, a question mark for a clue — or land to set a waypoint. Drag to move, wheel or pinch to zoom.");
                    t.AppendLine("map overview");
                    break;
            }
            var kinds = new SortedDictionary<string, int>();
            foreach (var pin in _pins)
            {
                var k = string.IsNullOrEmpty(pin.id) ? "player" : pin.id.Split(':')[0];
                kinds[k] = kinds.TryGetValue(k, out var n) ? n + 1 : 1;
            }
            var list = new StringBuilder();
            foreach (var kv in kinds) list.Append($"{kv.Key} {kv.Value} · ");
            _text = $"{_selected}\n{t}pins: {list}";
        }

        string RegionTitle(Vector3 p)
        {
            var set = _map.Regions;
            return set != null ? set.regions[set.IndexAt(p)].title : "";
        }

        bool Explored(string region)
        {
            var w = _map.RegionWatch;
            if (w == null) return true;
            foreach (var e in w.Explored) if (e == region) return true;
            return false;
        }

        void EventCard(VisualElement p, int index, StringBuilder t)
        {
            var races = _map.Races;
            var e = races.Set.events[index];
            Ui.Text(p, e.title, "jm-h2");
            Ui.Small(p, e.blurb);
            var kind = e.kind == RaceKind.Drift ? "Drift score" : e.kind == RaceKind.TimeTrial ? "Time trial" : $"Race · {e.rivals} rivals";
            Ui.Text(p, $"{kind} · {(e.laps > 1 ? $"{e.laps} laps" : "one run")}");
            Ui.Text(p, $"Finish {e.completion} Sparks · up to +{e.bonus}", "jm-body", "jm-amber");
            var rec = _map.Progress != null ? _map.Progress.Data.events.Find(x => x.id == e.id) : null;
            Ui.Small(p, rec == null || rec.finishes == 0 ? "Not finished yet." : $"Best medal: {(rec.bestTier switch { 3 => "Gold", 2 => "Silver", 1 => "Bronze", _ => "—" })} · {rec.finishes}× finished");
            var running = races.Current == RaceDirector.State.Running || races.Current == RaceDirector.State.Countdown;
            var row = Ui.Row(p, "jm-wrap");
            row.style.marginTop = 8;
            Ui.Button(row, running ? "Leave event and go" : "Go to the start", () =>
            {
                if (running) races.Abort("travelled");
                Menu.Close();
                _travel.ToEvent(index);
            }, "jm-btn--primary");
            Ui.Button(row, "Set waypoint", () => SetWaypoint(index));
            t.AppendLine($"event {e.title}");
        }

        void SetWaypoint(int eventIndex)
        {
            foreach (var (at, i) in _map.Races.Markers)
                if (i == eventIndex) { _map.Waypoint = new Vector2(at.x, at.z); break; }
            Refresh();
        }

        void TravelCard(VisualElement p, string id, StringBuilder t)
        {
            foreach (var point in _travel.Points.points)
            {
                if (point.id != id) continue;
                var open = _travel.Unlocked(point);
                Ui.Text(p, point.title, "jm-h2");
                Ui.Small(p, open ? "Free travel — you arrive in your car on the road." : "Discover this region first: drive there once and travel opens.");
                var b = Ui.Button(p, "Travel", () => { Menu.Close(); _travel.To(id); }, "jm-btn--primary");
                b.SetEnabled(open);
                Ui.Button(p, "Set waypoint", () => { _map.Waypoint = point.at; Refresh(); });
                t.AppendLine($"travel {point.title} {(open ? "open" : "locked")}");
            }
        }

        void DiscoveryCard(VisualElement p, int index, bool found, StringBuilder t)
        {
            var c = _map.Discoveries.Set.cards[index];
            Ui.Text(p, found ? c.title : "A clue", "jm-h2");
            if (!found) Ui.Text(p, c.hint, "jm-body", "jm-sakura");
            // The postcard: a real view of the place, rendered now — no downloaded photo.
            _postcard ??= Postcard.Render(c.position, c.ground, c.yaw);
            if (_postcard != null)
            {
                var pic = Ui.Box(p, "jm-pic");
                pic.style.height = 160;
                pic.style.marginTop = 8;
                pic.style.marginBottom = 8;
                pic.style.backgroundImage = new StyleBackground(_postcard);
            }
            Ui.Small(p, found ? "Found — in your album (Records → Discoveries)." : $"Somewhere inside the {_map.ClueRadius:0} m circle. Look for the shape on the postcard.");
            if (!found) Ui.Button(p, "Set waypoint", () => { _map.Waypoint = _map.ClueCentre(c); Refresh(); }, "jm-btn--primary");
            t.AppendLine(found ? $"found {c.title}" : $"clue {c.hint} circle {_map.ClueRadius}");
        }

        void LandCard(VisualElement p, Vector2 at, StringBuilder t)
        {
            var set = _map.Regions;
            var region = set.regions[set.IndexAt(new Vector3(at.x, 0f, at.y))];
            var known = Explored(region.id);
            Ui.Text(p, region.title, "jm-h2");
            Ui.Small(p, $"{region.detail} · {(known ? "explored" : "not explored yet")}");
            var cards = 0;
            var found = 0;
            if (_map.Discoveries != null)
                foreach (var c in _map.Discoveries.Set.cards)
                {
                    if (c.region != region.id) continue;
                    cards++;
                    foreach (var f in _map.Discoveries.Found) if (f == c.id) found++;
                }
            Ui.Text(p, $"Discoveries {found}/{cards}", "jm-body", "jm-sakura");
            // A selected empty point can be a waypoint but not a teleport (ASTRA).
            Ui.Button(p, "Set waypoint here", () => { _map.Waypoint = at; Refresh(); }, "jm-btn--primary");
            if (_map.Waypoint.HasValue) Ui.Button(p, "Clear waypoint", () => { _map.Waypoint = null; Refresh(); });
            t.AppendLine($"region {region.title} {(known ? "explored" : "unexplored")} {found}/{cards}");
        }
    }
}
