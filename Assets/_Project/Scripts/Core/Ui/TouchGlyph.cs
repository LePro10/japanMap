using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Core.Ui
{
    public enum TouchGlyph
    {
        None, Brake, Drift, Boost, Stunt, Gas, Reset, Camera, Auto, Light, Menu, Car, Out, Call, Jump, Slide,
    }

    /// <summary>
    /// Vector symbols for the touch buttons (POLISH C6: symbols instead of words), drawn with Painter2D like UiIcon —
    /// no texture download, sharp at every button scale. Lives in Core because the touch controls of Vehicles and
    /// OnFoot cannot reference the UI module. Shapes in a −1…1 box, y down.
    /// </summary>
    public sealed class TouchGlyphElement : VisualElement
    {
        readonly TouchGlyph _glyph;
        readonly Color _color;

        public TouchGlyph Glyph => _glyph;

        public TouchGlyphElement(TouchGlyph glyph, float size, Color color)
        {
            _glyph = glyph;
            _color = color;
            name = "touch-glyph";
            pickingMode = PickingMode.Ignore;
            style.width = style.height = size;
            style.flexShrink = 0;
            generateVisualContent += ctx => Paint(ctx.painter2D, _glyph, contentRect, _color);
        }

        public static void Paint(Painter2D p, TouchGlyph glyph, Rect r, Color c)
        {
            var s = Mathf.Min(r.width, r.height);
            if (s < 1f) return;
            var o = r.center;
            Vector2 P(float x, float y) => o + new Vector2(x, y) * (s * 0.5f);
            p.strokeColor = c;
            p.fillColor = c;
            p.lineWidth = Mathf.Max(1.5f, s * 0.1f);
            p.lineJoin = LineJoin.Round;
            p.lineCap = LineCap.Round;

            void Ring(float x, float y, float rad, bool fill)
            {
                p.BeginPath();
                p.Arc(P(x, y), rad * s * 0.5f, 0f, 360f);
                p.ClosePath();
                if (fill) p.Fill(); else p.Stroke();
            }
            void Arc(float x, float y, float rad, float from, float to)
            {
                p.BeginPath();
                p.Arc(P(x, y), rad * s * 0.5f, from, to);
                p.Stroke();
            }
            void Poly(bool fill, bool close, params float[] xy)
            {
                p.BeginPath();
                p.MoveTo(P(xy[0], xy[1]));
                for (var i = 2; i < xy.Length; i += 2) p.LineTo(P(xy[i], xy[i + 1]));
                if (close) p.ClosePath();
                if (fill) p.Fill(); else p.Stroke();
            }
            // Open arrowhead at (x, y) pointing along (dx, dy).
            void Head(float x, float y, float dx, float dy)
            {
                var d = new Vector2(dx, dy).normalized;
                var n = new Vector2(-d.y, d.x);
                var b = new Vector2(x, y) - d * 0.32f;
                Poly(false, false, b.x + n.x * 0.26f, b.y + n.y * 0.26f, x, y, b.x - n.x * 0.26f, b.y - n.y * 0.26f);
            }
            // Arrowhead at the end of a clockwise arc (angles in degrees, y down).
            void ArcHead(float x, float y, float rad, float at)
            {
                var a = at * Mathf.Deg2Rad;
                Head(x + Mathf.Cos(a) * rad, y + Mathf.Sin(a) * rad, -Mathf.Sin(a), Mathf.Cos(a));
            }
            void Curve(float x0, float y0, float cx, float cy, float x1, float y1)
            {
                p.BeginPath();
                p.MoveTo(P(x0, y0));
                p.QuadraticCurveTo(P(cx, cy), P(x1, y1));
                p.Stroke();
                Head(x1, y1, x1 - cx, y1 - cy);
            }

            switch (glyph)
            {
                case TouchGlyph.Brake: // the brake warning lamp: ( ! )
                    Ring(0f, 0f, 0.5f, false);
                    Arc(0f, 0f, 0.82f, 135f, 225f);
                    Arc(0f, 0f, 0.82f, -45f, 45f);
                    Poly(false, false, 0f, -0.25f, 0f, 0.06f);
                    Ring(0f, 0.26f, 0.06f, true);
                    break;
                case TouchGlyph.Drift: // a swinging line with skid dashes
                    Curve(-0.65f, 0.7f, -0.65f, -0.35f, 0.6f, -0.55f);
                    Poly(false, false, -0.1f, 0.55f, 0.3f, 0.55f);
                    Poly(false, false, 0.1f, 0.2f, 0.55f, 0.2f);
                    break;
                case TouchGlyph.Boost: // double chevron forward
                    Poly(false, false, -0.55f, 0.05f, 0f, -0.45f, 0.55f, 0.05f);
                    Poly(false, false, -0.55f, 0.55f, 0f, 0.05f, 0.55f, 0.55f);
                    break;
                case TouchGlyph.Stunt: // ramp and the jump over it
                    Poly(true, true, -0.9f, 0.7f, 0f, 0.7f, 0f, 0.15f);
                    Curve(-0.05f, -0.05f, 0.4f, -1.05f, 0.85f, 0.5f);
                    break;
                case TouchGlyph.Gas:
                    Poly(true, true, -0.55f, 0.45f, 0f, -0.55f, 0.55f, 0.45f);
                    break;
                case TouchGlyph.Reset: // circular arrow: back on the road
                    Arc(0f, 0f, 0.6f, 60f, 330f);
                    ArcHead(0f, 0f, 0.6f, 330f);
                    break;
                case TouchGlyph.Camera:
                    Poly(false, true, -0.75f, -0.35f, -0.3f, -0.35f, -0.15f, -0.6f, 0.15f, -0.6f, 0.3f, -0.35f, 0.75f, -0.35f, 0.75f, 0.55f, -0.75f, 0.55f);
                    Ring(0f, 0.1f, 0.27f, false);
                    break;
                case TouchGlyph.Auto: // steering wheel
                    Ring(0f, 0f, 0.7f, false);
                    Ring(0f, 0.05f, 0.17f, true);
                    Poly(false, false, -0.7f, 0f, 0.7f, 0f);
                    Poly(false, false, 0f, 0.05f, 0f, 0.7f);
                    break;
                case TouchGlyph.Light: // headlamp with beams
                    Arc(0.05f, 0f, 0.5f, 90f, 270f);
                    Poly(false, false, 0.05f, -0.5f, 0.05f, 0.5f);
                    Poly(false, false, 0.35f, -0.4f, 0.85f, -0.4f);
                    Poly(false, false, 0.35f, 0f, 0.85f, 0f);
                    Poly(false, false, 0.35f, 0.4f, 0.85f, 0.4f);
                    break;
                case TouchGlyph.Menu:
                    Poly(false, false, -0.6f, -0.45f, 0.6f, -0.45f);
                    Poly(false, false, -0.6f, 0f, 0.6f, 0f);
                    Poly(false, false, -0.6f, 0.45f, 0.6f, 0.45f);
                    break;
                case TouchGlyph.Car:
                    Poly(true, true, -0.85f, 0.25f, -0.85f, -0.05f, -0.45f, -0.15f, -0.25f, -0.5f, 0.35f, -0.5f, 0.6f, -0.15f, 0.85f, -0.05f, 0.85f, 0.25f);
                    Ring(-0.45f, 0.35f, 0.2f, true);
                    Ring(0.45f, 0.35f, 0.2f, true);
                    break;
                case TouchGlyph.Out: // open door, arrow out
                    Poly(false, false, -0.15f, -0.7f, -0.7f, -0.7f, -0.7f, 0.7f, -0.15f, 0.7f);
                    Poly(false, false, -0.3f, 0f, 0.75f, 0f);
                    Head(0.75f, 0f, 1f, 0f);
                    break;
                case TouchGlyph.Call: // signal to the car
                    Ring(0f, 0.55f, 0.13f, true);
                    Arc(0f, 0.55f, 0.5f, 225f, 315f);
                    Arc(0f, 0.55f, 0.9f, 225f, 315f);
                    break;
                case TouchGlyph.Jump:
                    Poly(false, false, 0f, 0.45f, 0f, -0.65f);
                    Head(0f, -0.65f, 0f, -1f);
                    Poly(false, false, -0.6f, 0.75f, 0.6f, 0.75f);
                    break;
                case TouchGlyph.Slide:
                    Curve(-0.6f, -0.65f, -0.6f, 0.4f, 0.75f, 0.4f);
                    break;
            }
        }
    }
}
