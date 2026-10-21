using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.UI
{
    /// <summary>
    /// The "Night Meet" palette (D55): night violet, washi paper, momo pink for action and selection, sora for
    /// information, mikan for passes and stunts, shu only for hanko stamps. The same values as Data/UI/Game.uss :root —
    /// for what C# draws itself (Painter2D shapes, map, tints).
    /// </summary>
    public static class Palette
    {
        public static readonly Color Yoru = Hex(0x120e1e);
        public static readonly Color Yoru2 = Hex(0x1e1830);
        public static readonly Color Washi = Hex(0xf5efe4);
        public static readonly Color WashiDim = Hex(0xa49cb8);
        public static readonly Color Sumi = Hex(0x17121f);
        public static readonly Color Momo = Hex(0xff2e7a);
        public static readonly Color Sora = Hex(0x8c97ff);
        public static readonly Color Mikan = Hex(0xff9a3c);
        public static readonly Color Shu = Hex(0xe8402a);
        public static readonly Color Ok = Hex(0x8fd18a);

        public static Color Hex(int rgb, float a = 1f) => new(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, a);
        public static Color A(this Color c, float a) => new(c.r, c.g, c.b, a);
    }

    /// <summary>
    /// A kippu (train ticket): washi paper with a round notch in each side and an optional dashed perforation. Holds a
    /// goal — "from → to", the reward like a fare. Drawn (no texture): sharp at every UI scale. Class nm-ticket.
    /// </summary>
    public sealed class Ticket : VisualElement
    {
        float _notchY = -1f;
        Color _paper = Palette.Washi;

        /// <summary>Notch and perforation height in px from the top; negative = middle.</summary>
        public float NotchY { get => _notchY; set { _notchY = value; MarkDirtyRepaint(); } }
        public bool Perforation { get; set; } = true;
        public Color Paper { get => _paper; set { _paper = value; MarkDirtyRepaint(); } }

        public Ticket()
        {
            AddToClassList("nm-ticket");
            generateVisualContent += Draw;
        }

        void Draw(MeshGenerationContext ctx)
        {
            var r = contentRect;
            var w = layout.width;
            var h = layout.height;
            if (w < 8f || h < 8f) return;
            var p = ctx.painter2D;
            var cr = Mathf.Min(8f, h * 0.2f);
            var nr = Mathf.Min(9f, h * 0.18f);
            var ny = _notchY < 0f ? h * 0.5f : Mathf.Clamp(_notchY, nr + cr, h - nr - cr);
            p.fillColor = _paper;
            p.BeginPath();
            p.MoveTo(new Vector2(cr, 0f));
            p.LineTo(new Vector2(w - cr, 0f));
            p.Arc(new Vector2(w - cr, cr), cr, 270f, 360f);
            p.LineTo(new Vector2(w, ny - nr));
            p.Arc(new Vector2(w, ny), nr, 270f, 90f, ArcDirection.CounterClockwise);
            p.LineTo(new Vector2(w, h - cr));
            p.Arc(new Vector2(w - cr, h - cr), cr, 0f, 90f);
            p.LineTo(new Vector2(cr, h));
            p.Arc(new Vector2(cr, h - cr), cr, 90f, 180f);
            p.LineTo(new Vector2(0f, ny + nr));
            p.Arc(new Vector2(0f, ny), nr, 90f, -90f, ArcDirection.CounterClockwise);
            p.LineTo(new Vector2(0f, cr));
            p.Arc(new Vector2(cr, cr), cr, 180f, 270f);
            p.ClosePath();
            p.Fill();
            if (!Perforation) return;
            p.strokeColor = Palette.Sumi.A(0.28f);
            p.lineWidth = 1.5f;
            for (var x = nr + 6f; x < w - nr - 6f; x += 9f)
            {
                p.BeginPath();
                p.MoveTo(new Vector2(x, ny));
                p.LineTo(new Vector2(Mathf.Min(x + 4.5f, w - nr - 6f), ny));
                p.Stroke();
            }
        }
    }

    /// <summary>
    /// A hanko: a round red seal with a double ring and a word (発見 found, 済 done, 新 new, 記録 record, 1位 …),
    /// turned a little as a hand would press it. <see cref="Stamp"/> presses it in: big and clear, then down with a jolt.
    /// Class nm-hanko (Data/UI/Game.uss).
    /// </summary>
    public sealed class Hanko : VisualElement
    {
        readonly Label _word;
        Color _ink = Palette.Shu;

        public string Word { get => _word.text; set => _word.text = value; }
        public Color Ink { get => _ink; set { _ink = value; _word.style.color = value; MarkDirtyRepaint(); } }

        public Hanko(string word, float size = 56f)
        {
            AddToClassList("nm-hanko");
            style.width = style.height = size;
            style.rotate = new Rotate(new Angle(-12f));
            pickingMode = PickingMode.Ignore;
            _word = new Label(word) { pickingMode = PickingMode.Ignore };
            _word.AddToClassList("nm-hanko__word");
            _word.style.fontSize = size * (word.Length > 1 ? 0.3f : 0.46f);
            Add(_word);
            generateVisualContent += Draw;
        }

        void Draw(MeshGenerationContext ctx)
        {
            var s = Mathf.Min(layout.width, layout.height);
            if (s < 4f) return;
            var p = ctx.painter2D;
            var c = new Vector2(layout.width * 0.5f, layout.height * 0.5f);
            p.strokeColor = _ink;
            p.lineWidth = Mathf.Max(1.5f, s * 0.06f);
            p.BeginPath();
            p.Arc(c, s * 0.5f - p.lineWidth * 0.5f, 0f, 360f);
            p.Stroke();
            p.lineWidth = Mathf.Max(1f, s * 0.025f);
            p.BeginPath();
            p.Arc(c, s * 0.5f - s * 0.13f, 0f, 360f);
            p.Stroke();
        }

        /// <summary>Press the stamp in (0.22 s; reduced motion: it just appears).</summary>
        public void Stamp(bool calm = false)
        {
            if (calm) return;
            AddToClassList("nm-hanko--pre");
            schedule.Execute(() => RemoveFromClassList("nm-hanko--pre")).ExecuteLater(30);
        }
    }

    /// <summary>A filled parallelogram (tab underline, stat bars, stripes): <see cref="Lean"/> px to the right at the top.</summary>
    public sealed class Slant : VisualElement
    {
        Color _fill = Palette.Momo;
        float _lean = 6f;

        public Color Fill { get => _fill; set { _fill = value; MarkDirtyRepaint(); } }
        public float Lean { get => _lean; set { _lean = value; MarkDirtyRepaint(); } }

        public Slant()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += ctx =>
            {
                var w = layout.width;
                var h = layout.height;
                if (w < 1f || h < 1f) return;
                var l = Mathf.Min(_lean, w);
                var p = ctx.painter2D;
                p.fillColor = _fill;
                p.BeginPath();
                p.MoveTo(new Vector2(l, 0f));
                p.LineTo(new Vector2(w, 0f));
                p.LineTo(new Vector2(w - l, h));
                p.LineTo(new Vector2(0f, h));
                p.ClosePath();
                p.Fill();
            };
        }
    }

    /// <summary>Builders for the Night Meet pieces (styles in Data/UI/Game.uss, classes nm-*).</summary>
    public static class Nm
    {
        /// <summary>A key cap ("F", "Esc", "↑↓"): paper on ink.</summary>
        public static Label Key(VisualElement parent, string key, params string[] classes)
        {
            var l = Ui.Add(parent, new Label(key) { pickingMode = PickingMode.Ignore }, "nm-key");
            foreach (var c in classes) l.AddToClassList(c);
            return l;
        }

        /// <summary>A key cap and what it does, side by side.</summary>
        public static VisualElement Hint(VisualElement parent, string key, string what)
        {
            var row = Ui.Row(parent, "nm-hint");
            row.pickingMode = PickingMode.Ignore;
            Key(row, key);
            Ui.Text(row, what, "nm-hint__label").pickingMode = PickingMode.Ignore;
            return row;
        }

        /// <summary>A variety-TV caption (telop): thick italic type with a pink outline, for skill only (drift, stunt, burst).</summary>
        public static VisualElement Telop(VisualElement parent, string text, string sub = "")
        {
            var box = Ui.Box(parent, "nm-telop");
            box.pickingMode = PickingMode.Ignore;
            Ui.Text(box, text, "nm-telop__main").pickingMode = PickingMode.Ignore;
            var s = Ui.Text(box, sub, "nm-telop__sub");
            s.pickingMode = PickingMode.Ignore;
            Ui.Show(s, !string.IsNullOrEmpty(sub));
            return box;
        }

        /// <summary>Kicker line: a small English caps line with its Japanese word after it.</summary>
        public static VisualElement Kicker(VisualElement parent, string english, string japanese = "", params string[] classes)
        {
            var row = Ui.Row(parent, "nm-kicker");
            foreach (var c in classes) row.AddToClassList(c);
            row.pickingMode = PickingMode.Ignore;
            Ui.Text(row, english.ToUpperInvariant(), "nm-kicker__en").pickingMode = PickingMode.Ignore;
            if (!string.IsNullOrEmpty(japanese)) Ui.Text(row, japanese, "nm-kicker__jp").pickingMode = PickingMode.Ignore;
            return row;
        }

        /// <summary>A giant outlined Japanese word behind a page (ガレージ, マップ …), shifted a little per page.</summary>
        public static Label Superword(VisualElement parent, string japanese)
        {
            var l = Ui.Add(parent, new Label(japanese) { pickingMode = PickingMode.Ignore }, "nm-superword");
            return l;
        }

        /// <summary>The page's quality tier as a class (nm-low: no blur, no outlines that cost a pass).</summary>
        public static void Tier(VisualElement root, string tier) => root.EnableInClassList("nm-low", tier == "Low");

        static Texture2D _fadeUp, _fadeLeft;

        /// <summary>Ink rising from the bottom (tile pictures: the text sits on it). White, tinted in USS.</summary>
        public static Texture2D FadeUp()
        {
            if (_fadeUp != null) return _fadeUp;
            _fadeUp = new Texture2D(1, 64, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "NmFadeUp" };
            for (var y = 0; y < 64; y++) _fadeUp.SetPixel(0, y, new Color(1f, 1f, 1f, 1f - Ui.Smooth(0f, 0.85f, y / 63f)));
            _fadeUp.Apply();
            return _fadeUp;
        }

        /// <summary>Night from the left edge to clear at <paramref name="clearAt"/> of the width (menu pages over the car).</summary>
        public static Texture2D FadeLeft(float clearAt = 0.62f)
        {
            if (_fadeLeft != null) return _fadeLeft;
            const int w = 256;
            _fadeLeft = new Texture2D(w, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "NmFadeLeft" };
            for (var x = 0; x < w; x++)
            {
                var t = x / (float)(w - 1);
                _fadeLeft.SetPixel(x, 0, Palette.Yoru.A(Mathf.Lerp(0.94f, 0f, Ui.Smooth(0.34f, clearAt, t))));
            }
            _fadeLeft.Apply();
            return _fadeLeft;
        }

        /// <summary>All buttons below <paramref name="root"/> (focus targets).</summary>
        public static List<Button> Buttons(VisualElement root) => root.Query<Button>().ToList();
    }
}
