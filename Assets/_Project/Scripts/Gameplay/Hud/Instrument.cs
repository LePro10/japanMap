using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// The instrument cluster (ASTRA §10 "Driving HUD layouts"): a 180° rpm arc above with a car-specific red segment,
    /// the gear in its centre (flashes once on a shift), large speed below, and a separate blue 100-unit nitro arc on
    /// the outside lower edge — never two look-alike half circles. Drawn with Painter2D (sharp at any scale, no
    /// texture). It shows the gearbox's own gear; it never invents one from speed.
    /// </summary>
    public sealed class Instrument : VisualElement
    {
        static readonly Color Track = new(0.965f, 0.937f, 0.894f, 0.16f);
        static readonly Color Needle = new(0.965f, 0.937f, 0.894f, 0.95f);
        static readonly Color Red = new(0.86f, 0.33f, 0.27f, 0.95f);
        static readonly Color Nitro = new(0.4f, 0.84f, 0.96f, 0.95f);
        static readonly Color NitroTrack = new(0.4f, 0.84f, 0.96f, 0.18f);
        static readonly Color Plate = new(0.024f, 0.078f, 0.1f, 0.62f);

        readonly Label _gear, _speed, _unit;
        float _rpm01, _red01 = 0.85f, _nitro = 1f, _flashUntil;
        bool _boosting;
        string _gearText = "";

        public string GearText => _gearText;
        public string SpeedText => _speed.text;

        public Instrument()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
            _gear = Add(new Label("N"), 0.19f);
            _speed = Add(new Label("0"), 0.34f);
            _unit = Add(new Label("km/h"), 0.07f);
            _unit.style.color = new Color(0.72f, 0.77f, 0.78f);
            RegisterCallback<GeometryChangedEvent>(_ => Layout());
        }

        Label Add(Label l, float size)
        {
            l.pickingMode = PickingMode.Ignore;
            l.style.position = Position.Absolute;
            l.style.left = l.style.right = 0;
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.AddToClassList("jm-hud-text");
            if (size > 0.1f) l.AddToClassList("jm-num"); // gear and speed in the display face, the unit in the text face
            l.style.color = new Color(0.965f, 0.937f, 0.894f);
            l.userData = size;
            Add(l);
            return l;
        }

        void Layout()
        {
            var r = contentRect;
            foreach (var l in new[] { _gear, _speed, _unit })
            {
                var size = (float)l.userData * r.height;
                l.style.fontSize = Mathf.Max(10f, size);
            }
            // Gear in the arc's centre, speed below it, unit under the speed — placed from the fitted centre.
            Fit(r, out var c, out var rad);
            _gear.style.top = c.y - rad * 0.84f;
            _speed.style.top = c.y - rad * 0.36f;
            _unit.style.top = c.y + rad * 0.5f;
            foreach (var l in new[] { _gear, _speed, _unit }) l.style.fontSize = Mathf.Max(11f, (float)l.userData * rad * 2f);
        }

        /// <summary>One frame of the car: rpm, redline and limiter (rpm), gear label, speed text, nitro 0…1.</summary>
        public void Set(float rpm, float redline, float limiter, string gear, string speed, string unit, float nitro, bool boosting)
        {
            var max = Mathf.Max(1000f, Mathf.Ceil(limiter / 1000f) * 1000f);
            var r01 = Mathf.Clamp01(rpm / max);
            var red = Mathf.Clamp01(redline / max);
            if (gear != _gearText)
            {
                if (_gearText != "") _flashUntil = Time.unscaledTime + 0.18f; // flashes once on a shift
                _gearText = gear;
                _gear.text = gear;
            }
            _gear.style.color = Time.unscaledTime < _flashUntil ? new Color(0.95f, 0.77f, 0.42f) : new Color(0.965f, 0.937f, 0.894f);
            if (_speed.text != speed) _speed.text = speed;
            if (_unit.text != unit) _unit.text = unit;
            if (Mathf.Abs(r01 - _rpm01) > 0.002f || Mathf.Abs(red - _red01) > 0.001f || Mathf.Abs(nitro - _nitro) > 0.004f || boosting != _boosting)
            {
                _rpm01 = r01;
                _red01 = red;
                _nitro = nitro;
                _boosting = boosting;
                MarkDirtyRepaint();
            }
        }

        void Draw(MeshGenerationContext ctx)
        {
            var r = contentRect;
            if (r.width < 4f) return;
            var p = ctx.painter2D;
            Fit(r, out var c, out var rad);
            var w = Mathf.Max(4f, rad * 0.13f);

            // Plate behind the numbers: the city is full of bright neon.
            p.fillColor = Plate;
            p.BeginPath();
            p.Arc(c, rad + w, 0f, 360f);
            p.Fill();

            p.lineCap = LineCap.Butt;
            // rpm arc: 180° from left (180°) over the top to right (360°); Painter2D angles run clockwise, 0° = +x.
            Arc(p, c, rad, 180f, 360f, w, Track);
            Arc(p, c, rad, 180f + 180f * _red01, 360f, w, new Color(Red.r, Red.g, Red.b, 0.35f));
            var to = 180f + 180f * _rpm01;
            Arc(p, c, rad, 180f, Mathf.Min(to, 180f + 180f * _red01), w, Needle);
            if (_rpm01 > _red01) Arc(p, c, rad, 180f + 180f * _red01, to, w, Red);

            // Nitro: its own arc outside, along the lower edge (30°…150°, clockwise = below the centre).
            var nr = rad + w * 1.6f;
            var nw = w * 0.6f;
            Arc(p, c, nr, 35f, 145f, nw, NitroTrack);
            if (_nitro > 0.005f) Arc(p, c, nr, 145f - 110f * _nitro, 145f, nw, _boosting ? Color.white : Nitro);
            // Burst threshold (a boost double tap needs a quarter tank): a tick across the arc, white once reached.
            var tick = 145f - 110f * 0.25f;
            Arc(p, c, nr, tick - 1.2f, tick + 1.2f, nw * 1.9f, _nitro >= 0.25f ? new Color(1f, 1f, 1f, 0.9f) : new Color(1f, 1f, 1f, 0.3f));
        }

        /// <summary>Centre and arc radius so the plate (rad + w) and the nitro arc below (rad + 1.9 w) stay inside the
        /// box — the old fixed centre at 56 % drew 20–30 px past the bottom edge.</summary>
        static void Fit(Rect r, out Vector2 c, out float rad)
        {
            const float Below = 1.247f, Above = 1.13f; // outer extent below / above the centre, in arc radii (w = 0.13 rad)
            rad = Mathf.Min((r.width * 0.5f - 2f) / Below, (r.height - 2f) / (Below + Above));
            c = new Vector2(r.width * 0.5f, 1f + Above * rad);
        }

        static void Arc(Painter2D p, Vector2 c, float r, float from, float to, float width, Color color)
        {
            if (to - from < 0.1f) return;
            p.strokeColor = color;
            p.lineWidth = width;
            p.BeginPath();
            p.Arc(c, r, from, to);
            p.Stroke();
        }
    }
}
