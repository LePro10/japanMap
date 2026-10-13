using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// Floating labels over places in the world ("TUNE · Open Bay", the event starts): players do not read the map,
    /// they follow what they see (legacy Sakura Commons markers). Each system adds its pins; this draws them in the
    /// HUD, projected every frame, faded by distance, hidden behind the camera, when close enough for the prompt to
    /// take over, and whenever the HUD is hidden (photo mode, garage, menu).
    /// </summary>
    public sealed class WorldPins : MonoBehaviour
    {
        [SerializeField] GameplayHud hud;
        [Tooltip("Pins show between these distances, m (closer: the context prompt speaks).")]
        [SerializeField] Vector2 range = new(7f, 260f);
        [Tooltip("Fully visible inside this distance, m; fades out to range.y.")]
        [SerializeField] float solidUntil = 140f;
        [Tooltip("Height of the label above the pin's point, m.")]
        [SerializeField] float lift = 4.5f;

        public static WorldPins Instance { get; private set; }

        sealed class Pin
        {
            public object Owner;
            public Vector3 At;
            public string Title, Sub;
            public Color Color;
            public bool Visible = true;
            public VisualElement Box;
            public Label Distance;
        }

        readonly List<Pin> _pins = new();
        VisualElement _layer;

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        /// <summary>Adds a pin; returns a handle for <see cref="SetVisible"/> / <see cref="Remove"/>.</summary>
        public object Add(object owner, Vector3 at, string title, string sub, Color color)
        {
            var p = new Pin { Owner = owner, At = at, Title = title, Sub = sub, Color = color };
            _pins.Add(p);
            if (_layer != null) Build(p);
            return p;
        }

        public void SetVisible(object handle, bool visible)
        {
            if (handle is Pin p) p.Visible = visible;
        }

        public void RemoveAll(object owner)
        {
            for (var i = _pins.Count - 1; i >= 0; i--)
                if (_pins[i].Owner == owner) { _pins[i].Box?.RemoveFromHierarchy(); _pins.RemoveAt(i); }
        }

        /// <summary>Pin count, layer state (play scripts).</summary>
        public string Debug => $"count={_pins.Count} layer={(_layer != null && _layer.panel != null)} hudHidden={(hud != null && hud.Hidden)}";

        /// <summary>Titles of the pins on screen now (tests).</summary>
        public IEnumerable<string> Shown()
        {
            foreach (var p in _pins)
                if (p.Box != null && p.Box.style.display == DisplayStyle.Flex) yield return p.Title;
        }

        void EnsureLayer()
        {
            if (hud == null || hud.Root == null) return;
            if (_layer != null && _layer.parent == hud.Root) return;
            _layer = new VisualElement { name = "world-pins", pickingMode = PickingMode.Ignore };
            _layer.AddToClassList("jm-fill");
            hud.Root.Insert(0, _layer); // under every other HUD element
            foreach (var p in _pins) Build(p);
        }

        void Build(Pin p)
        {
            var box = new VisualElement { pickingMode = PickingMode.Ignore };
            box.AddToClassList("jm-pin");
            // A 0 × 0 anchor moved by translate (no layout pass per frame); the content hangs above it, centred.
            var inner = new VisualElement { pickingMode = PickingMode.Ignore };
            inner.AddToClassList("jm-pin__inner");
            box.Add(inner);
            var plate = new VisualElement { pickingMode = PickingMode.Ignore };
            plate.AddToClassList("jm-pin__plate");
            plate.style.borderLeftColor = p.Color;
            var title = new Label(p.Title) { pickingMode = PickingMode.Ignore };
            title.AddToClassList("jm-pin__title");
            plate.Add(title);
            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.AddToClassList("jm-row");
            if (!string.IsNullOrEmpty(p.Sub))
            {
                var sub = new Label(p.Sub) { pickingMode = PickingMode.Ignore };
                sub.AddToClassList("jm-pin__sub");
                row.Add(sub);
            }
            p.Distance = new Label("") { pickingMode = PickingMode.Ignore };
            p.Distance.AddToClassList("jm-pin__dist");
            row.Add(p.Distance);
            plate.Add(row);
            inner.Add(plate);
            var stem = new VisualElement { pickingMode = PickingMode.Ignore };
            stem.AddToClassList("jm-pin__stem");
            stem.style.backgroundColor = p.Color;
            inner.Add(stem);
            var dot = new VisualElement { pickingMode = PickingMode.Ignore };
            dot.AddToClassList("jm-pin__dot");
            dot.style.backgroundColor = p.Color;
            inner.Add(dot);
            box.style.display = DisplayStyle.None;
            p.Box = box;
            _layer.Add(box);
        }

        void LateUpdate()
        {
            EnsureLayer();
            if (_layer == null) return;
            var cam = Camera.main;
            var hidden = cam == null || hud.Hidden;
            var camPos = cam != null ? cam.transform.position : Vector3.zero;
            foreach (var p in _pins)
            {
                if (p.Box == null) continue;
                var show = !hidden && p.Visible;
                Vector3 sp = default;
                float d = 0f;
                if (show)
                {
                    d = new Vector2(p.At.x - camPos.x, p.At.z - camPos.z).magnitude;
                    show = d >= range.x && d <= range.y;
                }
                if (show)
                {
                    sp = cam.WorldToScreenPoint(p.At + Vector3.up * lift);
                    show = sp.z > 0.5f;
                }
                if (!show)
                {
                    if (p.Box.style.display != DisplayStyle.None) p.Box.style.display = DisplayStyle.None;
                    continue;
                }
                var panelPos = RuntimePanelUtils.ScreenToPanel(_layer.panel, new Vector2(sp.x, Screen.height - sp.y));
                p.Box.style.display = DisplayStyle.Flex;
                // Anchor: the dot's centre sits on the point; the box grows upwards from there.
                p.Box.style.translate = new Translate(panelPos.x, panelPos.y);
                var fade = d <= solidUntil ? 1f : Mathf.Clamp01(1f - (d - solidUntil) / Mathf.Max(1f, range.y - solidUntil));
                p.Box.style.opacity = fade;
                var scale = Mathf.Lerp(1f, 0.78f, Mathf.InverseLerp(20f, range.y, d));
                p.Box.style.scale = new Scale(new Vector3(scale, scale, 1f)); // around the anchor (transform-origin 0 0)
                var text = $"{Mathf.RoundToInt(d / 5f) * 5} m";
                if (p.Distance.text != text) p.Distance.text = text;
            }
        }
    }
}
