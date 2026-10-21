using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.UI
{
    public enum Icon
    {
        None, Play, Car, Map, Records, Photo, Settings, Back, Close,
        Wheel, Flag, Circuit, Lantern, Torii, Sheaf, Lighthouse, Diamond, Clue, Spark, Ramp, Drift, Garage,
        Lock, Tune, Daily, Home, Check, Ring,
    }

    /// <summary>
    /// STAND-IN vector icons drawn with Painter2D (no texture download, sharp at every UI scale) until the asset
    /// session delivers an icon set (STATUS). Shapes follow the ASTRA §10 icon list: wheel = Commons/garage,
    /// flag = event, lantern = town, torii = temple, sheaf = fields, lighthouse = coast, diamond = discovery,
    /// hollow question = clue.
    /// </summary>
    public sealed class UiIcon : VisualElement
    {
        Icon _icon;
        Color _color = new(0.965f, 0.937f, 0.894f);

        public UiIcon(Icon icon, float size = 24f)
        {
            _icon = icon;
            pickingMode = PickingMode.Ignore;
            style.width = style.height = size;
            style.flexShrink = 0;
            generateVisualContent += Draw;
        }

        public Icon Kind
        {
            get => _icon;
            set { _icon = value; MarkDirtyRepaint(); }
        }

        public Color Tint
        {
            get => _color;
            set { _color = value; MarkDirtyRepaint(); }
        }

        void Draw(MeshGenerationContext ctx)
        {
            var r = contentRect;
            if (r.width < 1f) return;
            Paint(ctx.painter2D, _icon, r, _color);
        }

        /// <summary>Draws one icon into a rectangle (also used by the map layers).</summary>
        public static void Paint(Painter2D p, Icon icon, Rect r, Color c)
        {
            var s = Mathf.Min(r.width, r.height);
            var o = r.center;
            Vector2 P(float x, float y) => o + new Vector2(x, y) * (s * 0.5f); // −1…1 box, y down
            p.strokeColor = c;
            p.fillColor = c;
            p.lineWidth = Mathf.Max(1.5f, s * 0.09f);
            p.lineJoin = LineJoin.Round;
            p.lineCap = LineCap.Round;

            void Circle(float x, float y, float rad, bool fill)
            {
                p.BeginPath();
                p.Arc(P(x, y), rad * s * 0.5f, 0f, 360f);
                p.ClosePath();
                if (fill) p.Fill(); else p.Stroke();
            }
            void Poly(bool fill, bool close, params float[] xy)
            {
                p.BeginPath();
                p.MoveTo(P(xy[0], xy[1]));
                for (var i = 2; i < xy.Length; i += 2) p.LineTo(P(xy[i], xy[i + 1]));
                if (close) p.ClosePath();
                if (fill) p.Fill(); else p.Stroke();
            }

            switch (icon)
            {
                case Icon.Play: Poly(true, true, -0.5f, -0.7f, 0.7f, 0f, -0.5f, 0.7f); break;
                case Icon.Car:
                    Poly(false, true, -0.85f, 0.25f, -0.85f, -0.05f, -0.45f, -0.15f, -0.25f, -0.5f, 0.35f, -0.5f, 0.6f, -0.15f, 0.85f, -0.05f, 0.85f, 0.25f);
                    Circle(-0.45f, 0.35f, 0.2f, true); Circle(0.45f, 0.35f, 0.2f, true); break;
                case Icon.Map:
                    Poly(false, true, -0.8f, -0.6f, -0.3f, -0.8f, 0.3f, -0.6f, 0.8f, -0.8f, 0.8f, 0.6f, 0.3f, 0.8f, -0.3f, 0.6f, -0.8f, 0.8f);
                    Poly(false, false, -0.3f, -0.8f, -0.3f, 0.6f); Poly(false, false, 0.3f, -0.6f, 0.3f, 0.8f); break;
                case Icon.Records:
                    Poly(false, true, -0.5f, -0.75f, 0.5f, -0.75f, 0.4f, 0f, 0f, 0.2f, -0.4f, 0f);
                    Poly(false, false, 0f, 0.2f, 0f, 0.55f); Poly(false, false, -0.4f, 0.75f, 0.4f, 0.75f);
                    Poly(false, false, -0.5f, -0.55f, -0.8f, -0.55f, -0.65f, -0.15f, -0.42f, -0.12f);
                    Poly(false, false, 0.5f, -0.55f, 0.8f, -0.55f, 0.65f, -0.15f, 0.42f, -0.12f); break;
                case Icon.Photo:
                    Poly(false, true, -0.85f, -0.45f, -0.35f, -0.45f, -0.2f, -0.7f, 0.2f, -0.7f, 0.35f, -0.45f, 0.85f, -0.45f, 0.85f, 0.65f, -0.85f, 0.65f);
                    Circle(0f, 0.1f, 0.33f, false); break;
                case Icon.Settings:
                    Circle(0f, 0f, 0.3f, false);
                    for (var i = 0; i < 8; i++)
                    {
                        var a = i * Mathf.PI / 4f;
                        Poly(false, false, Mathf.Cos(a) * 0.55f, Mathf.Sin(a) * 0.55f, Mathf.Cos(a) * 0.85f, Mathf.Sin(a) * 0.85f);
                    }
                    Circle(0f, 0f, 0.6f, false); break;
                case Icon.Back: Poly(false, false, 0.2f, -0.6f, -0.4f, 0f, 0.2f, 0.6f); Poly(false, false, -0.4f, 0f, 0.7f, 0f); break;
                case Icon.Close: Poly(false, false, -0.55f, -0.55f, 0.55f, 0.55f); Poly(false, false, 0.55f, -0.55f, -0.55f, 0.55f); break;
                case Icon.Wheel:
                case Icon.Garage:
                    Circle(0f, 0f, 0.8f, false); Circle(0f, 0f, 0.2f, true);
                    for (var i = 0; i < 5; i++)
                    {
                        var a = i * Mathf.PI * 2f / 5f - Mathf.PI / 2f;
                        Poly(false, false, Mathf.Cos(a) * 0.2f, Mathf.Sin(a) * 0.2f, Mathf.Cos(a) * 0.75f, Mathf.Sin(a) * 0.75f);
                    }
                    break;
                case Icon.Flag:
                    Poly(false, false, -0.55f, 0.85f, -0.55f, -0.8f);
                    Poly(true, true, -0.55f, -0.8f, 0.7f, -0.5f, -0.55f, -0.15f); break;
                case Icon.Circuit:
                    Poly(false, true, -0.8f, 0.2f, -0.6f, -0.15f, 0.6f, -0.15f, 0.8f, 0.2f);
                    Circle(-0.55f, 0.35f, 0.2f, true); Circle(0.55f, 0.35f, 0.2f, true);
                    Poly(false, false, -0.1f, -0.15f, 0.05f, -0.5f, 0.35f, -0.5f); break;
                case Icon.Lantern:
                    Poly(false, false, 0f, -0.9f, 0f, -0.7f);
                    Poly(true, true, -0.35f, -0.7f, 0.35f, -0.7f, 0.5f, 0f, 0.35f, 0.6f, -0.35f, 0.6f, -0.5f, 0f);
                    Poly(false, false, 0f, 0.6f, 0f, 0.85f); break;
                case Icon.Torii:
                    Poly(false, false, -0.85f, -0.65f, 0.85f, -0.65f);
                    Poly(false, false, -0.65f, -0.35f, 0.65f, -0.35f);
                    Poly(false, false, -0.45f, -0.65f, -0.5f, 0.85f);
                    Poly(false, false, 0.45f, -0.65f, 0.5f, 0.85f); break;
                case Icon.Sheaf:
                    Poly(false, false, 0f, 0.85f, 0f, -0.6f); Poly(false, false, 0f, 0.85f, -0.45f, -0.5f); Poly(false, false, 0f, 0.85f, 0.45f, -0.5f);
                    Poly(false, false, -0.35f, 0.25f, 0.35f, 0.25f); break;
                case Icon.Lighthouse:
                    Poly(true, true, -0.25f, -0.4f, 0.25f, -0.4f, 0.4f, 0.85f, -0.4f, 0.85f);
                    Poly(true, true, -0.2f, -0.75f, 0.2f, -0.75f, 0.2f, -0.5f, -0.2f, -0.5f);
                    Poly(false, false, 0.35f, -0.62f, 0.85f, -0.85f); Poly(false, false, -0.35f, -0.62f, -0.85f, -0.85f); break;
                case Icon.Diamond: Poly(true, true, 0f, -0.85f, 0.65f, 0f, 0f, 0.85f, -0.65f, 0f); break;
                case Icon.Clue:
                    Circle(0f, 0f, 0.8f, false);
                    p.BeginPath();
                    p.Arc(P(0f, -0.25f), s * 0.5f * 0.28f, 180f, 405f);
                    p.LineTo(P(0f, 0.2f));
                    p.Stroke();
                    Circle(0f, 0.48f, 0.07f, true); break;
                case Icon.Spark:
                    Poly(true, true, 0f, -0.9f, 0.22f, -0.22f, 0.9f, 0f, 0.22f, 0.22f, 0f, 0.9f, -0.22f, 0.22f, -0.9f, 0f, -0.22f, -0.22f); break;
                case Icon.Ramp: Poly(true, true, -0.85f, 0.6f, 0.85f, 0.6f, 0.85f, -0.4f); break;
                case Icon.Drift:
                    Poly(false, false, -0.8f, 0.6f, -0.2f, 0.1f, 0.2f, -0.5f, 0.8f, -0.7f);
                    Circle(0.5f, 0.45f, 0.18f, true); break;
                case Icon.Lock:
                    p.BeginPath();
                    p.Arc(P(0f, -0.25f), s * 0.5f * 0.38f, 180f, 360f);
                    p.Stroke();
                    Poly(false, false, -0.38f, -0.25f, -0.38f, 0f); Poly(false, false, 0.38f, -0.25f, 0.38f, 0f);
                    Poly(true, true, -0.62f, 0f, 0.62f, 0f, 0.62f, 0.8f, -0.62f, 0.8f); break;
                case Icon.Tune:
                    // A wrench: jaw ring and handle.
                    Circle(-0.4f, -0.4f, 0.32f, false);
                    Poly(false, false, -0.17f, -0.17f, 0.7f, 0.7f); break;
                case Icon.Daily:
                    Poly(false, true, -0.75f, -0.55f, 0.75f, -0.55f, 0.75f, 0.75f, -0.75f, 0.75f);
                    Poly(false, false, -0.75f, -0.15f, 0.75f, -0.15f);
                    Poly(false, false, -0.4f, -0.8f, -0.4f, -0.4f); Poly(false, false, 0.4f, -0.8f, 0.4f, -0.4f);
                    Circle(0.3f, 0.3f, 0.14f, true); break;
                // Done / not yet (records, career): drawn, because the UI fonts have no ✓ or ○ (boxes in the browser).
                case Icon.Check: Poly(false, false, -0.6f, 0.05f, -0.15f, 0.5f, 0.65f, -0.45f); break;
                case Icon.Ring: Circle(0f, 0f, 0.55f, false); break;
                case Icon.Home:
                    Poly(false, true, -0.75f, -0.05f, 0f, -0.75f, 0.75f, -0.05f);
                    Poly(false, false, -0.55f, -0.2f, -0.55f, 0.75f, 0.55f, 0.75f, 0.55f, -0.2f);
                    Poly(true, true, -0.15f, 0.75f, -0.15f, 0.3f, 0.15f, 0.3f, 0.15f, 0.75f); break;
            }
        }
    }
}
