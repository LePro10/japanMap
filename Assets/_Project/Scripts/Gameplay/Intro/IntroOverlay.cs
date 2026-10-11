using JapanMap.Core.Ui;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Intro
{
    /// <summary>
    /// The intro's screen (prototype IntroOverlay.ts): letterbox, title card, one prompt with its keys, a toast, the
    /// five steps and the skip control. No logic — <see cref="FirstDrive"/> decides what shows when. One action per
    /// prompt: whoever reads "W, Shift and Space" in one box reads none of them. Styles: Game.uss, .jm-intro*.
    /// </summary>
    public sealed class IntroOverlay
    {
        public readonly struct Keys
        {
            public readonly string[] Key;
            public readonly string Touch;
            public Keys(string touch, params string[] key) { Touch = touch; Key = key; }
        }

        public static readonly Keys Gas = new("PAD", "W");
        public static readonly Keys Nitro = new("BOOST", "Shift");
        public static readonly Keys Roll = new("STUNT", "Space", "Space");
        public static readonly Keys Drift = new("DRIFT", "Space");

        static readonly string[] StepNames = { "Drive", "Nitro", "Jump", "Drift", "Home" };

        readonly VisualElement _root, _top, _bottom, _title, _prompt, _keys, _steps, _skipFill, _slow;
        readonly Label _label, _hint, _toast;
        readonly Button _skip;
        float _toastUntil, _hideAt = -1f;

        public bool Touch => Touchscreen.current != null && (UiPanel.IsPhone || Mouse.current == null);

        public IntroOverlay(VisualElement parent, System.Action skip)
        {
            _root = new VisualElement { name = "intro", pickingMode = PickingMode.Ignore };
            _root.AddToClassList("jm-intro");
            _root.AddToClassList("jm-fill");
            parent.Add(_root);

            _top = Bar("jm-intro__bar--top");
            _bottom = Bar("jm-intro__bar--bottom");

            _slow = new VisualElement { pickingMode = PickingMode.Ignore };
            _slow.AddToClassList("jm-intro__slow");
            _slow.Add(new Label("SLOW MOTION") { pickingMode = PickingMode.Ignore });
            _root.Add(_slow);

            _title = new VisualElement { pickingMode = PickingMode.Ignore };
            _title.AddToClassList("jm-intro__title");
            _title.Add(Text("FIRST DRIVE  ·  BLUE HOUR", "jm-intro__kicker"));
            _title.Add(Text(Application.productName.ToUpperInvariant(), "jm-intro__name"));
            _title.Add(Text("An island, a car and a road to the sea.", "jm-intro__sub"));
            _root.Add(_title);

            _prompt = new VisualElement { name = "intro-prompt", pickingMode = PickingMode.Ignore };
            _prompt.AddToClassList("jm-intro__prompt");
            _keys = new VisualElement { pickingMode = PickingMode.Ignore };
            _keys.AddToClassList("jm-intro__keys");
            _prompt.Add(_keys);
            _label = Text("", "jm-intro__label");
            _prompt.Add(_label);
            _hint = Text("", "jm-intro__hint");
            _prompt.Add(_hint);
            _root.Add(_prompt);

            _toast = Text("", "jm-intro__toast");
            _root.Add(_toast);

            _steps = new VisualElement { name = "intro-steps", pickingMode = PickingMode.Ignore };
            _steps.AddToClassList("jm-intro__steps");
            foreach (var s in StepNames)
            {
                var dot = new VisualElement { pickingMode = PickingMode.Ignore };
                dot.AddToClassList("jm-intro__step");
                dot.Add(new Label(s.ToUpperInvariant()) { pickingMode = PickingMode.Ignore });
                _steps.Add(dot);
            }
            _root.Add(_steps);

            _skip = new Button(() => skip()) { text = "", name = "intro-skip" };
            _skip.AddToClassList("jm-intro__skip");
            _skip.Add(new Label(Touch ? "SKIP INTRO" : "HOLD TAB TO SKIP"));
            _skipFill = new VisualElement { pickingMode = PickingMode.Ignore };
            _skipFill.AddToClassList("jm-intro__skipfill");
            _skip.Add(_skipFill);
            _root.Add(_skip);

            _root.schedule.Execute(Tick).Every(50);
            _root.style.display = DisplayStyle.None;
        }

        VisualElement Bar(string cls)
        {
            var b = new VisualElement { pickingMode = PickingMode.Ignore };
            b.AddToClassList("jm-intro__bar");
            b.AddToClassList(cls);
            _root.Add(b);
            return b;
        }

        static Label Text(string text, string cls)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            return l;
        }

        void Tick()
        {
            if (_toast.style.display == DisplayStyle.Flex && Time.unscaledTime > _toastUntil) _toast.style.display = DisplayStyle.None;
            if (_hideAt > 0f && Time.unscaledTime > _hideAt) { _hideAt = -1f; _root.style.display = DisplayStyle.None; }
        }

        public void Show()
        {
            _hideAt = -1f;
            _root.EnableInClassList("jm-phone", UiPanel.IsPhone);
            _root.style.display = DisplayStyle.Flex;
            _skip.style.display = DisplayStyle.Flex;
            Prompt(null, null, null);
            _toast.style.display = DisplayStyle.None;
            Slow(false);
        }

        /// <summary>Gone now, or after <paramref name="delay"/> real seconds (the last toast stays readable).</summary>
        public void Hide(float delay)
        {
            Cinema(false);
            Prompt(null, null, null);
            _skip.style.display = DisplayStyle.None;
            _steps.style.display = DisplayStyle.None;
            Slow(false);
            if (delay <= 0f) _root.style.display = DisplayStyle.None;
            else _hideAt = Time.unscaledTime + delay;
        }

        public void Cinema(bool on)
        {
            _top.EnableInClassList("jm-intro__bar--on", on);
            _bottom.EnableInClassList("jm-intro__bar--on", on);
            _steps.style.display = DisplayStyle.Flex;
        }

        public void Title(bool on) => _title.EnableInClassList("jm-intro__title--on", on);

        public void Slow(bool on) => _slow.EnableInClassList("jm-intro__slow--on", on);

        /// <summary>One action: its keys (or touch button), a label, a hint; null hides the prompt.</summary>
        public void Prompt(Keys? keys, string label, string hint, bool big = false)
        {
            if (keys == null) { _prompt.RemoveFromClassList("jm-intro__prompt--on"); return; }
            _keys.Clear();
            if (Touch) _keys.Add(Text(keys.Value.Touch, "jm-intro__key"));
            else
                for (var i = 0; i < keys.Value.Key.Length; i++)
                {
                    if (i > 0) _keys.Add(Text("+", "jm-intro__plus"));
                    _keys.Add(Text(keys.Value.Key[i], "jm-intro__key"));
                }
            _label.text = label;
            _hint.text = hint ?? "";
            _prompt.EnableInClassList("jm-intro__prompt--big", big);
            _prompt.RemoveFromClassList("jm-intro__prompt--hit");
            _prompt.AddToClassList("jm-intro__prompt--on");
        }

        /// <summary>The player did it: the prompt flashes.</summary>
        public void Hit() => _prompt.AddToClassList("jm-intro__prompt--hit");

        public void Toast(string text, bool gold)
        {
            _toast.text = text;
            _toast.EnableInClassList("jm-intro__toast--gold", gold);
            _toast.style.display = DisplayStyle.Flex;
            _toastUntil = Time.unscaledTime + 2.2f;
        }

        public void Step(int done)
        {
            var i = 0;
            foreach (var s in _steps.Children())
            {
                s.EnableInClassList("jm-intro__step--done", i < done);
                s.EnableInClassList("jm-intro__step--now", i == done);
                i++;
            }
        }

        public void SkipProgress(float share) => _skipFill.style.width = Length.Percent(100f * share);
    }
}
