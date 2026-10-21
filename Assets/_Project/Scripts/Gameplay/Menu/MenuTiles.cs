using System;
using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.UI;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// The menu's big tiles (D48): one button per destination — icon, kicker, title, a line, an optional meter and a
    /// call to action — that lifts and glows when focused (mouse, keys, pad), rises in staggered when a page opens, and
    /// can be locked by the career (<see cref="Unlocks"/>): padlock, dimmed, "Unlocks: …", a click only shakes it.
    /// Styles: Data/UI/Menu.uss (.jm-card*; .jm-tile stays the car-card look).
    /// </summary>
    public static class MenuTiles
    {
        public sealed class Spec
        {
            public string Name;
            public Icon Icon = Icon.None;
            public string Kicker = "";
            public string Title = "";
            public string Body = "";
            /// <summary>Reward or price line (gold).</summary>
            public string Value = "";
            /// <summary>0…1 shows a meter; negative = none.</summary>
            public float Meter = -1f;
            public string Note = "";
            /// <summary>Call to action at the bottom right, e.g. "Go to the start".</summary>
            public string Action = "";
            /// <summary>Extra class: "jm-card--hero", "jm-card--accent", "jm-card--daily" …</summary>
            public string Style = "";
            public FeatureId? Feature;
            public Action Click;
            /// <summary>A car whose Open Bay photo fills the tile's right side (CarPortraits; arrives when taken).</summary>
            public Vehicles.VehicleDefinition Car;
        }

        /// <summary>A tile as one button: the whole surface is the target (48 px rule holds everywhere).</summary>
        public static Button Tile(VisualElement parent, Spec s)
        {
            var b = new Button { text = "" };
            if (!string.IsNullOrEmpty(s.Name)) b.name = s.Name;
            b.AddToClassList("jm-card");
            if (!string.IsNullOrEmpty(s.Style)) b.AddToClassList(s.Style);
            if (s.Car != null)
            {
                // The car's own photo behind the right half, fading into the tile: the tile shows what it is about.
                b.AddToClassList("jm-card--pic");
                var pic = Ui.Box(b, "jm-card__pic");
                var tex = Garage.CarPortraits.Get(s.Car, got => pic.style.backgroundImage = new StyleBackground(got));
                if (tex != null) pic.style.backgroundImage = new StyleBackground(tex);
                Ui.Box(b, "jm-card__picfade").style.backgroundImage = new StyleBackground(Fade());
            }
            Ui.Box(b, "jm-card__edge"); // the neon line that lights up on focus
            var head = Ui.Row(b, "jm-card__head");
            if (s.Icon != Icon.None)
            {
                var icon = new UiIcon(s.Icon, 22f);
                icon.AddToClassList("jm-card__icon");
                head.Add(icon);
            }
            Ui.Text(head, s.Kicker, "jm-card__kicker");
            Ui.Text(b, s.Title, "jm-card__title");
            if (!string.IsNullOrEmpty(s.Body)) Ui.Text(b, s.Body, "jm-card__body");
            if (!string.IsNullOrEmpty(s.Value)) Ui.Text(b, s.Value, "jm-card__value");
            if (s.Meter >= 0f)
            {
                var meter = Ui.Box(b, "jm-card__meter");
                var fill = Ui.Box(meter);
                fill.style.width = Length.Percent(UnityEngine.Mathf.Clamp01(s.Meter) * 100f);
            }
            if (!string.IsNullOrEmpty(s.Note)) Ui.Text(b, s.Note, "jm-card__note");
            Ui.Box(b, "jm-grow");
            if (!string.IsNullOrEmpty(s.Action))
            {
                var cta = Ui.Row(b, "jm-card__cta");
                Ui.Text(cta, s.Action.ToUpperInvariant(), "jm-card__cta-label");
                var arrow = new UiIcon(Icon.Play, 12f);
                arrow.AddToClassList("jm-card__cta-arrow");
                cta.Add(arrow);
            }
            foreach (var c in b.Query<VisualElement>().ToList()) if (c != b) c.pickingMode = PickingMode.Ignore;
            b.clickable = new Clickable(() =>
            {
                if (s.Feature.HasValue && !Unlocks.IsUnlocked(s.Feature.Value)) { Deny(b, s.Feature.Value); return; }
                Audio.Sfx.Play("UI_Click");
                s.Click?.Invoke();
            });
            if (s.Feature.HasValue) Lock(b, s.Feature.Value);
            parent?.Add(b);
            return b;
        }

        /// <summary>Marks a button locked when its feature is not open yet; its click then only says why.</summary>
        public static void Gate(Button b, FeatureId feature)
        {
            if (Unlocks.IsUnlocked(feature)) return;
            b.clickable = new Clickable(() => Deny(b, feature));
            Lock(b, feature);
        }

        static void Lock(VisualElement b, FeatureId feature)
        {
            if (Unlocks.IsUnlocked(feature)) return;
            b.AddToClassList("jm-locked");
            if (b is Button plain && plain.ClassListContains("jm-btn"))
            {
                // A text button keeps its label; the padlock sits in its left padding and a click says why (Deny). The hint
                // in the label made it so long that the row squeezed it to one letter per line (UI audit 2026-10-21).
                plain.tooltip = Unlocks.Hint(feature);
                // The label moves into a child: a Button with children is measured by them, not by its text, so the
                // padlock child alone made it ~50 px wide and the text ran out of (or wrapped inside) it.
                var caption = new Label(plain.text) { pickingMode = PickingMode.Ignore };
                plain.text = "";
                plain.Add(caption);
                var small = new UiIcon(Icon.Lock, 13f);
                small.AddToClassList("jm-lock-icon");
                plain.Add(small);
                return;
            }
            var badge = Ui.Row(b, "jm-lock");
            badge.pickingMode = PickingMode.Ignore;
            var icon = new UiIcon(Icon.Lock, 14f);
            badge.Add(icon);
            var label = Ui.Text(badge, Unlocks.Hint(feature), "jm-lock__label");
            label.pickingMode = PickingMode.Ignore;
        }

        static UnityEngine.Texture2D _fade;

        /// <summary>White, opaque on the left to clear on the right; tinted to the tile's colour in USS.</summary>
        static UnityEngine.Texture2D Fade()
        {
            if (_fade != null) return _fade;
            const int w = 64;
            _fade = new UnityEngine.Texture2D(w, 1, UnityEngine.TextureFormat.RGBA32, false) { wrapMode = UnityEngine.TextureWrapMode.Clamp, name = "TileFade" };
            for (var x = 0; x < w; x++) _fade.SetPixel(x, 0, new UnityEngine.Color(1f, 1f, 1f, 1f - Ui.Smooth(0.35f, 1f, x / (float)(w - 1))));
            _fade.Apply();
            return _fade;
        }

        /// <summary>Last locked feature someone tried (tests read it).</summary>
        public static FeatureId? LastDenied { get; private set; }

        /// <summary>A locked target: a short shake and a dull tick — no dialog in the way.</summary>
        public static void Deny(VisualElement b, FeatureId feature)
        {
            LastDenied = feature;
            Audio.Sfx.Play("UI_Click", 0.45f);
            // Two nudges (USS has no keyframes: a class on, off, on, off).
            b.RemoveFromClassList("jm-shake");
            for (var k = 0; k < 4; k++)
            {
                var on = k % 2 == 0;
                b.schedule.Execute(() => b.EnableInClassList("jm-shake", on)).ExecuteLater(1 + 70 * k);
            }
            GameMenu.Instance?.Notice(Unlocks.Hint(feature));
        }

        /// <summary>
        /// The page's tiles rise in one after another (40 ms apart, 260 ms each, the last one in by ~0.5 s); input is
        /// never blocked meanwhile. Reduced motion: no stagger.
        /// </summary>
        public static void Stagger(VisualElement page)
        {
            var tiles = page.Query<VisualElement>(className: "jm-rise").ToList();
            if (GameOptions.ReducedMotion) return;
            var i = 0;
            foreach (var t in tiles)
            {
                t.AddToClassList("jm-rise--pre");
                var delay = 30 + 40 * Math.Min(i++, 8);
                t.schedule.Execute(() => t.RemoveFromClassList("jm-rise--pre")).ExecuteLater(delay);
            }
        }

        /// <summary>Every focusable target on a page, for directional moves.</summary>
        public static List<VisualElement> Targets(VisualElement root)
        {
            var list = new List<VisualElement>();
            root.Query<VisualElement>().ForEach(e =>
            {
                if (e.focusable && e.canGrabFocus && e.enabledInHierarchy && e.resolvedStyle.display != DisplayStyle.None
                    && e.worldBound.width > 1f && (e is Button || e is Slider || e is Toggle)) list.Add(e);
            });
            return list;
        }
    }
}
