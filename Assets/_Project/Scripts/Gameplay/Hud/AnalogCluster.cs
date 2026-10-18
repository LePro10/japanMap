using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// Two round dials for the older cars' dashboards (D51): rev counter left with its red zone, speedometer right, the
    /// gear between them. Drawn with Painter2D into the cockpit's panel texture — sharp, no texture download.
    /// </summary>
    public sealed class AnalogCluster : VisualElement
    {
        static readonly Color Face = new(0.03f, 0.035f, 0.04f, 1f);
        static readonly Color Ring = new(0.42f, 0.44f, 0.46f, 1f);
        static readonly Color Tick = new(0.93f, 0.9f, 0.84f, 1f);
        static readonly Color Red = new(0.9f, 0.25f, 0.18f, 1f);
        static readonly Color Needle = new(1f, 0.45f, 0.12f, 1f);
        const float Sweep = 270f, Start = 135f; // degrees, clockwise from +X (y down): lower left over the top to lower right

        readonly Label _gear, _speed, _unit;
        float _rpm01, _red01 = 0.85f, _speed01, _maxSpeed = 240f;

        public AnalogCluster()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
            _gear = MakeLabel(54f, Tick);
            _speed = MakeLabel(22f, Tick);
            _unit = MakeLabel(14f, new Color(0.7f, 0.72f, 0.72f));
            RegisterCallback<GeometryChangedEvent>(_ => Layout());
        }

        Label MakeLabel(float size, Color c)
        {
            var l = new Label { pickingMode = PickingMode.Ignore };
            l.style.position = Position.Absolute;
            l.style.fontSize = size;
            l.style.color = c;
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.AddToClassList("jm-hud-text");
            if (size > 20f) l.AddToClassList("jm-num");
            Add(l);
            return l;
        }

        void Layout()
        {
            var r = contentRect;
            Place(_gear, r.width * 0.5f, r.height * 0.5f, 80f, 60f);
            Place(_speed, r.width * 0.75f, r.height * 0.78f, 80f, 26f);
            Place(_unit, r.width * 0.75f, r.height * 0.9f, 80f, 18f);
        }

        static void Place(Label l, float cx, float cy, float w, float h)
        {
            l.style.left = cx - w * 0.5f;
            l.style.top = cy - h * 0.5f;
            l.style.width = w;
            l.style.height = h;
        }

        /// <param name="maxSpeed">Top of the speed dial in the shown unit.</param>
        public void Set(float rpm, float redline, float limiter, string gear, float speedShown, string speedText, string unit, float maxSpeed)
        {
            var top = Mathf.Max(1000f, Mathf.Ceil(limiter / 1000f) * 1000f);
            var rpm01 = Mathf.Clamp01(rpm / top);
            var red01 = Mathf.Clamp01(redline / top);
            _maxSpeed = Mathf.Max(60f, maxSpeed);
            var sp01 = Mathf.Clamp01(speedShown / _maxSpeed);
            if (Mathf.Abs(rpm01 - _rpm01) > 0.002f || Mathf.Abs(sp01 - _speed01) > 0.002f || red01 != _red01)
            {
                _rpm01 = rpm01;
                _speed01 = sp01;
                _red01 = red01;
                MarkDirtyRepaint();
            }
            if (_gear.text != gear) _gear.text = gear;
            if (_speed.text != speedText) _speed.text = speedText;
            if (_unit.text != unit) _unit.text = unit;
        }

        void Draw(MeshGenerationContext ctx)
        {
            var r = contentRect;
            var rad = Mathf.Min(r.width * 0.25f, r.height * 0.5f) * 0.92f;
            Dial(ctx.painter2D, new Vector2(r.width * 0.25f, r.height * 0.5f), rad, _rpm01, _red01, 8);
            Dial(ctx.painter2D, new Vector2(r.width * 0.75f, r.height * 0.5f), rad, _speed01, 2f, Mathf.RoundToInt(_maxSpeed / 20f));
        }

        static void Dial(Painter2D p, Vector2 c, float rad, float value01, float red01, int majors)
        {
            p.fillColor = Face;
            p.BeginPath();
            p.Arc(c, rad, 0f, 360f);
            p.Fill();
            p.strokeColor = Ring;
            p.lineWidth = rad * 0.05f;
            p.BeginPath();
            p.Arc(c, rad, 0f, 360f);
            p.Stroke();
            if (red01 < 1f)
            {
                p.strokeColor = Red;
                p.lineWidth = rad * 0.09f;
                p.BeginPath();
                p.Arc(c, rad * 0.84f, Start + Sweep * red01, Start + Sweep);
                p.Stroke();
            }
            p.strokeColor = Tick;
            var ticks = majors * 2;
            for (var i = 0; i <= ticks; i++)
            {
                var a = (Start + Sweep * i / ticks) * Mathf.Deg2Rad;
                var d = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                var major = i % 2 == 0;
                p.lineWidth = major ? rad * 0.045f : rad * 0.025f;
                p.BeginPath();
                p.MoveTo(c + d * rad * (major ? 0.72f : 0.8f));
                p.LineTo(c + d * rad * 0.9f);
                p.Stroke();
            }
            var na = (Start + Sweep * value01) * Mathf.Deg2Rad;
            var nd = new Vector2(Mathf.Cos(na), Mathf.Sin(na));
            p.strokeColor = Needle;
            p.lineWidth = rad * 0.05f;
            p.lineCap = LineCap.Round;
            p.BeginPath();
            p.MoveTo(c - nd * rad * 0.12f);
            p.LineTo(c + nd * rad * 0.86f);
            p.Stroke();
            p.fillColor = Ring;
            p.BeginPath();
            p.Arc(c, rad * 0.08f, 0f, 360f);
            p.Fill();
        }
    }
}
