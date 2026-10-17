using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.UI
{
    /// <summary>
    /// Small builders for the game's UI Toolkit screens — every screen uses the same classes from
    /// Data/UI/Game.uss (theme of ASTRA §10), so a look change happens in one stylesheet.
    /// </summary>
    public static class Ui
    {
        public static T Add<T>(VisualElement parent, T child, params string[] classes) where T : VisualElement
        {
            foreach (var c in classes) child.AddToClassList(c);
            parent?.Add(child);
            return child;
        }

        public static VisualElement Box(VisualElement parent, params string[] classes) => Add(parent, new VisualElement(), classes);

        public static VisualElement Row(VisualElement parent, params string[] classes)
        {
            var r = Box(parent, classes);
            r.AddToClassList("jm-row");
            return r;
        }

        public static Label Text(VisualElement parent, string text, params string[] classes)
        {
            var l = Add(parent, new Label(text) { enableRichText = true }, classes);
            if (classes.Length == 0) l.AddToClassList("jm-body");
            return l;
        }

        public static Label H1(VisualElement parent, string text) => Text(parent, text, "jm-h1");
        public static Label H2(VisualElement parent, string text) => Text(parent, text, "jm-h2");
        public static Label Small(VisualElement parent, string text) => Text(parent, text, "jm-small");

        /// <summary>A 48 px button; the click is also the touch tap (UI Toolkit Clickable).</summary>
        public static Button Button(VisualElement parent, string text, Action click, params string[] classes)
        {
            var b = Add(parent, new Button(() =>
            {
                Clicked?.Invoke();
                click?.Invoke();
            }) { text = text }, classes);
            b.AddToClassList("jm-btn");
            return b;
        }

        /// <summary>Raised on every button click (UI tick sound).</summary>
        public static event Action Clicked;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Clicked = null;

        public static void On(VisualElement e, bool on, string cls = "jm-btn--on") => e.EnableInClassList(cls, on);

        public static void Show(VisualElement e, bool on) => e.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;

        public static bool Shown(VisualElement e) => e != null && e.resolvedStyle.display != DisplayStyle.None && e.style.display != DisplayStyle.None;

        /// <summary>Label · slider · value, one settings row (values always visible, ASTRA §10).</summary>
        public static Slider SliderRow(VisualElement parent, string title, float min, float max, float value, Func<float, string> format, Action<float> changed)
        {
            var row = Row(parent, "jm-setting");
            Text(row, title);
            var s = Add(row, new Slider(min, max) { value = value });
            var v = Text(row, format(value), "jm-value");
            s.RegisterValueChangedCallback(e =>
            {
                v.text = format(e.newValue);
                changed(e.newValue);
            });
            return s;
        }

        /// <summary>Label · a row of choice buttons, the current one marked.</summary>
        public static void ChoiceRow(VisualElement parent, string title, string[] options, int current, Action<int> picked)
        {
            var row = Row(parent, "jm-setting");
            Text(row, title);
            var group = Row(row, "jm-wrap", "jm-grow");
            var buttons = new Button[options.Length];
            for (var i = 0; i < options.Length; i++)
            {
                var index = i;
                buttons[i] = Button(group, options[i], () =>
                {
                    for (var k = 0; k < buttons.Length; k++) On(buttons[k], k == index);
                    picked(index);
                });
                buttons[i].style.marginBottom = 4;
                On(buttons[i], i == current);
            }
        }

        /// <summary>
        /// GLSL smoothstep: 0 below <paramref name="edge0"/>, 1 above <paramref name="edge1"/>. Not Mathf.SmoothStep — that
        /// one interpolates between its first two arguments, and the menu fade never went clear over the car (D48).
        /// </summary>
        public static float Smooth(float edge0, float edge1, float x)
        {
            var t = Mathf.Clamp01((x - edge0) / (edge1 - edge0));
            return t * t * (3f - 2f * t);
        }

        public static VisualElement Spacer(VisualElement parent, float height)
        {
            var s = Box(parent);
            s.style.height = height;
            s.style.flexShrink = 0;
            return s;
        }
    }
}
