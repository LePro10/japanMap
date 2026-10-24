using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// The instrument cluster, "Night Meet" (D55, after the FH6 references in docs/refs): no plate — a thin 225° rpm arc
    /// from lower left over the top to the right with a tick and number per 1000 rpm, the car's red zone in momo pink,
    /// the gear in a ring in the middle (flashes once on a shift), and the speed as a big italic number in the open lower
    /// right with the unit over it. Nitro is a thin sora bar under the number with the burst mark at a quarter.
    /// Drawn with Painter2D (sharp at any scale, no texture). It shows the gearbox's own gear; it never invents one.
    /// </summary>
    public sealed class Instrument : VisualElement
    {
        static readonly Color Paper = new(0.961f, 0.937f, 0.894f, 0.95f);
        static readonly Color Track = new(0.961f, 0.937f, 0.894f, 0.22f);
        static readonly Color Shade = new(0.07f, 0.055f, 0.12f, 0.45f);
        static readonly Color Red = new(1f, 0.18f, 0.48f, 1f);
        static readonly Color Nitro = new(0.55f, 0.59f, 1f, 1f);
        static readonly Color NitroTrack = new(0.55f, 0.59f, 1f, 0.22f);
        const float From = 135f, Sweep = 225f; // Painter2D: clockwise, 0° = +x, y down

        readonly Label _gear, _speed, _unit;
        readonly Label[] _ticks = new Label[12];
        float _rpm01, _red01 = 0.85f, _nitro = 1f, _flashUntil, _max = 8000f;
        bool _boosting;
        string _gearText = "", _unitRaw;

        public string GearText => _gearText;
        public string SpeedText => _speed.text;

        public Instrument()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
            for (var i = 0; i < _ticks.Length; i++)
            {
                _ticks[i] = Add(new Label(i.ToString()), "jm-instrument__tick");
                _ticks[i].style.position = Position.Absolute;
            }
            _gear = Add(new Label("N"), "jm-instrument__gear");
            _speed = Add(new Label("0"), "jm-instrument__speed");
            _unit = Add(new Label("km/h"), "jm-instrument__unit");
            RegisterCallback<GeometryChangedEvent>(_ => Layout());
        }

        Label Add(Label l, string cls)
        {
            l.pickingMode = PickingMode.Ignore;
            l.style.position = Position.Absolute;
            l.AddToClassList("jm-hud-text");
            l.AddToClassList(cls);
            Add(l);
            return l;
        }

        void Layout()
        {
            var r = contentRect;
            if (r.width < 4f) return;
            Fit(r, out var c, out var rad);
            var gs = rad * 0.5f;
            _gear.style.left = c.x - gs * 0.5f;
            _gear.style.top = c.y - gs * 0.5f;
            _gear.style.width = _gear.style.height = gs;
            _gear.style.fontSize = gs * 0.62f;
            _speed.style.right = 0;
            _speed.style.bottom = rad * 0.08f;
            _speed.style.fontSize = rad * 1.02f;
            _unit.style.right = rad * 0.06f;
            _unit.style.bottom = rad * 1.02f;
            _unit.style.fontSize = Mathf.Max(10f, rad * 0.15f);
            PlaceTicks(c, rad);
        }

        void PlaceTicks(Vector2 c, float rad)
        {
            var n = Mathf.Clamp(Mathf.RoundToInt(_max / 1000f), 1, _ticks.Length - 1);
            var fs = Mathf.Max(9f, rad * 0.15f);
            for (var i = 0; i < _ticks.Length; i++)
            {
                var on = i <= n;
                _ticks[i].style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
                if (!on) continue;
                var a = (From + Sweep * i / n) * Mathf.Deg2Rad;
                var at = c + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * rad * 0.74f;
                _ticks[i].text = i.ToString();
                _ticks[i].style.fontSize = fs;
                _ticks[i].style.left = at.x - fs * 0.5f;
                _ticks[i].style.top = at.y - fs * 0.62f;
                _ticks[i].style.width = fs;
                _ticks[i].EnableInClassList("jm-instrument__tick--red", i / (float)n >= _red01 - 0.001f);
            }
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
            _gear.EnableInClassList("jm-instrument__gear--flash", Time.unscaledTime < _flashUntil);
            if (_speed.text != speed) _speed.text = speed;
            // Upper-casing allocates: only when the unit itself changes (it is a constant per setting).
            if (unit != _unitRaw) { _unitRaw = unit; _unit.text = unit.ToUpperInvariant(); }
            if (!Mathf.Approximately(max, _max) || Mathf.Abs(red - _red01) > 0.001f)
            {
                _max = max;
                _red01 = red;
                Fit(contentRect, out var c, out var rad);
                PlaceTicks(c, rad);
                MarkDirtyRepaint();
            }
            if (Mathf.Abs(r01 - _rpm01) > 0.002f || Mathf.Abs(nitro - _nitro) > 0.004f || boosting != _boosting)
            {
                _rpm01 = r01;
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
            var w = Mathf.Max(2f, rad * 0.035f);
            p.lineCap = LineCap.Butt;
            // A faint dark band under the arc: readable over bright neon without a plate.
            Arc(p, c, rad, From, From + Sweep, w * 5f, Shade);
            Arc(p, c, rad, From, From + Sweep, w, Track);
            var red = From + Sweep * _red01;
            Arc(p, c, rad - w * 1.5f, red, From + Sweep, w * 3.2f, new Color(Red.r, Red.g, Red.b, 0.55f));
            var to = From + Sweep * _rpm01;
            Arc(p, c, rad, From, Mathf.Min(to, red), w * 2.2f, Paper);
            if (to > red) Arc(p, c, rad, red, to, w * 2.6f, Red);
            // Ticks: one per 1000 rpm, inwards.
            var n = Mathf.Clamp(Mathf.RoundToInt(_max / 1000f), 1, _ticks.Length - 1);
            p.lineWidth = Mathf.Max(1.5f, w * 0.9f);
            for (var i = 0; i <= n; i++)
            {
                var a = (From + Sweep * i / n) * Mathf.Deg2Rad;
                var d = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                p.strokeColor = i / (float)n >= _red01 - 0.001f ? Red : Paper;
                p.BeginPath();
                p.MoveTo(c + d * (rad - w * 0.5f));
                p.LineTo(c + d * (rad - w * 4.5f));
                p.Stroke();
            }
            // Needle: a short bright line at the rpm.
            var na = to * Mathf.Deg2Rad;
            var nd = new Vector2(Mathf.Cos(na), Mathf.Sin(na));
            p.strokeColor = to > red ? Red : Color.white;
            p.lineWidth = Mathf.Max(2f, w * 1.6f);
            p.BeginPath();
            p.MoveTo(c + nd * (rad * 0.56f));
            p.LineTo(c + nd * (rad + w * 2f));
            p.Stroke();
            // Gear ring.
            p.strokeColor = Paper;
            p.lineWidth = Mathf.Max(1.5f, w);
            p.BeginPath();
            p.Arc(c, rad * 0.25f, 0f, 360f);
            p.Stroke();
            // Nitro: a thin bar under the speed, burst mark at a quarter.
            var bw = r.width * 0.62f;
            var x0 = r.width - bw;
            var y = r.height - Mathf.Max(3f, w * 1.5f);
            var bh = Mathf.Max(3f, w * 1.4f);
            Bar(p, x0, y, bw, bh, NitroTrack);
            if (_nitro > 0.005f) Bar(p, x0, y, bw * _nitro, bh, _boosting ? Color.white : Nitro);
            Bar(p, x0 + bw * 0.25f - 1f, y - bh * 0.5f, 2f, bh * 2f, _nitro >= 0.25f ? Color.white : new Color(1f, 1f, 1f, 0.35f));
        }

        static void Bar(Painter2D p, float x, float y, float w, float h, Color color)
        {
            if (w < 0.5f) return;
            p.fillColor = color;
            p.BeginPath();
            p.MoveTo(new Vector2(x, y));
            p.LineTo(new Vector2(x + w, y));
            p.LineTo(new Vector2(x + w, y + h));
            p.LineTo(new Vector2(x, y + h));
            p.ClosePath();
            p.Fill();
        }

        /// <summary>Arc centre and radius: the arc sits in the upper left of the box, the speed in the open lower right.</summary>
        static void Fit(Rect r, out Vector2 c, out float rad)
        {
            rad = Mathf.Min(r.width * 0.36f, r.height * 0.42f);
            c = new Vector2(rad * 1.12f, rad * 1.1f);
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
