using System.Collections.Generic;
using JapanMap.Core.Ui;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Career
{
    /// <summary>
    /// The career on screen: one goal card in the top left (chapter, goal, how, a live meter, the chapter's steps as
    /// dots) that ticks off with a check and its Sparks, then slides the next goal in; and a banner in the upper middle
    /// for what just opened ("UNLOCKED · Open Bay"), a new chapter, or the end. Banners queue — one voice at a time.
    /// No logic: <see cref="CareerSystem"/> says what shows. Styles: Data/UI/Career.uss (.jm-career*).
    /// </summary>
    public sealed class CareerOverlay
    {
        public struct Banner
        {
            public string kicker, title, body;
            public Icon icon;
            public bool gold;
            public string sound;
        }

        readonly VisualElement _root, _card, _check, _meter, _fill, _dots, _banner, _bannerIcon;
        readonly Label _kicker, _title, _hint, _reward, _count, _bKicker, _bTitle, _bBody;
        readonly Queue<Banner> _queue = new();
        float _bannerUntil, _notBefore;
        readonly float _bannerSeconds;
        bool _visible = true, _hasGoal;

        public static bool Touch => Touchscreen.current != null && (UiPanel.IsPhone || Mouse.current == null);
        /// <summary>Goal text on the card (tests read what the player reads).</summary>
        public string Goal => _hasGoal ? _title.text : "";
        public string LastBanner { get; private set; } = "";
        public bool CardShown => _hasGoal && _visible;
        public VisualElement Root => _root;

        public CareerOverlay(VisualElement parent, float bannerSeconds)
        {
            _bannerSeconds = bannerSeconds;
            _root = new VisualElement { name = "career", pickingMode = PickingMode.Ignore };
            _root.AddToClassList("jm-career");
            _root.AddToClassList("jm-fill");
            parent.Add(_root);

            _card = Box(_root, "jm-career__card");
            _card.name = "career-card";
            var head = Box(_card, "jm-career__head");
            _kicker = Text(head, "", "jm-career__kicker");
            _count = Text(head, "", "jm-career__count");
            var row = Box(_card, "jm-career__row");
            _check = Box(row, "jm-career__check");
            var tick = new UiIcon(Icon.Check, 14f) { Tint = new Color(0.02f, 0.08f, 0.1f) }; // the font has no ✓
            tick.AddToClassList("jm-career__tick");
            _check.Add(tick);
            _title = Text(row, "", "jm-career__title");
            _reward = Text(row, "", "jm-career__reward");
            _hint = Text(_card, "", "jm-career__hint");
            _meter = Box(_card, "jm-career__meter");
            _fill = Box(_meter, "jm-career__fill");
            _dots = Box(_card, "jm-career__dots");

            _banner = Box(_root, "jm-career__banner");
            _banner.name = "career-banner";
            Box(_banner, "jm-career__banner-edge");
            var bHead = Box(_banner, "jm-career__banner-head");
            _bannerIcon = Box(bHead, "jm-career__banner-icon");
            _bKicker = Text(bHead, "", "jm-career__banner-kicker");
            _bTitle = Text(_banner, "", "jm-career__banner-title");
            _bBody = Text(_banner, "", "jm-career__banner-body");

            _card.AddToClassList("jm-career__card--out");
            _root.schedule.Execute(Tick).Every(50);
        }

        static VisualElement Box(VisualElement parent, string cls)
        {
            var b = new VisualElement { pickingMode = PickingMode.Ignore };
            b.AddToClassList(cls);
            parent.Add(b);
            return b;
        }

        static Label Text(VisualElement parent, string text, string cls)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            parent.Add(l);
            return l;
        }

        /// <summary>A new goal slides in. <paramref name="done"/>/<paramref name="size"/> are this chapter's steps.</summary>
        public void Show(string kicker, string count, string goal, string hint, int reward, int done, int size)
        {
            _hasGoal = true;
            _kicker.text = kicker;
            _count.text = count;
            _title.text = goal;
            _hint.text = hint ?? "";
            _hint.style.display = string.IsNullOrEmpty(hint) ? DisplayStyle.None : DisplayStyle.Flex;
            _reward.text = reward > 0 ? $"+{reward:N0}" : "";
            _card.RemoveFromClassList("jm-career__card--done");
            Meter(-1f);
            _dots.Clear();
            for (var i = 0; i < size; i++)
            {
                var d = Box(_dots, "jm-career__dot");
                d.EnableInClassList("jm-career__dot--done", i < done);
                d.EnableInClassList("jm-career__dot--now", i == done);
            }
            // Out (no transition) → in: the card rises in from the left each time.
            _card.AddToClassList("jm-career__card--out");
            _card.schedule.Execute(() => _card.RemoveFromClassList("jm-career__card--out")).ExecuteLater(30);
        }

        /// <summary>0…1 fills the bar under the goal; negative hides it.</summary>
        public void Meter(float share, string label = null)
        {
            _meter.style.display = share < 0f ? DisplayStyle.None : DisplayStyle.Flex;
            if (share >= 0f) _fill.style.width = Length.Percent(Mathf.Clamp01(share) * 100f);
            if (label != null) _count.text = label;
        }

        /// <summary>Ticked off: the check fills, the reward glows; the system brings the next goal after a moment.</summary>
        public void Done()
        {
            _card.AddToClassList("jm-career__card--done");
            Meter(_meter.style.display == DisplayStyle.Flex ? 1f : -1f);
            foreach (var d in _dots.Children())
                if (d.ClassListContains("jm-career__dot--now")) d.AddToClassList("jm-career__dot--done");
            Hud.GameplayHud.Pop(_check, 1.6f);
            Hud.GameplayHud.Pop(_reward, 1.4f);
        }

        public void Hide()
        {
            _hasGoal = false;
            _card.AddToClassList("jm-career__card--out");
        }

        /// <summary>The card steps aside (event, intro, photo); banners wait meanwhile.</summary>
        public void Visible(bool on)
        {
            if (_visible == on) return;
            _visible = on;
            _root.EnableInClassList("jm-career--away", !on);
        }

        /// <summary>
        /// The HUD builds a new root when the form factor changes (rotation, a forced form): the overlay follows it, or it
        /// would hang off the old tree, invisible, with its scheduler stopped. Called every frame by the owner.
        /// </summary>
        public void Attach(VisualElement host)
        {
            if (host != null && _root.parent != host) host.Add(_root);
        }

        /// <summary>The card dims (a drift on a phone runs under it); the goal stays readable.</summary>
        public void Quiet(bool on) => _card.EnableInClassList("jm-career__card--quiet", on && _hasGoal);

        public void Queue(Banner b) => _queue.Enqueue(b);

        /// <summary>No banner before this real time (the intro's last words stay readable).</summary>
        public void Wait(float seconds) => _notBefore = Mathf.Max(_notBefore, Time.unscaledTime + seconds);

        public int Pending => _queue.Count + (_banner.ClassListContains("jm-career__banner--on") ? 1 : 0);

        void Tick()
        {
            _root.EnableInClassList("jm-phone", UiPanel.IsPhone);
            _root.EnableInClassList("jm-portrait", UiPanel.IsPortrait);
            Place();
            var now = Time.unscaledTime;
            if (_banner.ClassListContains("jm-career__banner--on") && now > _bannerUntil) _banner.RemoveFromClassList("jm-career__banner--on");
            if (_banner.ClassListContains("jm-career__banner--on") || _queue.Count == 0 || now < _notBefore || !_visible) return;
            // A short gap between two banners: each one is its own moment.
            if (now < _bannerUntil + 0.35f) return;
            var b = _queue.Dequeue();
            _bKicker.text = b.kicker;
            _bTitle.text = b.title;
            _bBody.text = b.body ?? "";
            _bBody.style.display = string.IsNullOrEmpty(b.body) ? DisplayStyle.None : DisplayStyle.Flex;
            _bannerIcon.Clear();
            if (b.icon != Icon.None) _bannerIcon.Add(new UiIcon(b.icon, 22f));
            _banner.EnableInClassList("jm-career__banner--gold", b.gold);
            _banner.AddToClassList("jm-career__banner--on");
            _bannerUntil = now + _bannerSeconds;
            LastBanner = $"{b.kicker} {b.title}";
            if (!string.IsNullOrEmpty(b.sound)) Audio.Sfx.Play(b.sound);
            Debug.Log($"[Career] banner {LastBanner}");
        }

        // Clear of the HUD groups per form factor (GameplayHud.Place): desktop top left (race lines only in events, when
        // the card is away), phones beside / under the minimap.
        void Place()
        {
            var safe = UiPanel.Safe;
            var s = _card.style;
            switch (UiPanel.Form)
            {
                case FormFactor.PhoneLandscape:
                    s.left = safe.x + 136f; s.top = safe.y + 12f; s.width = 260f;
                    break;
                case FormFactor.PhonePortrait:
                    s.left = safe.x + 12f; s.top = safe.y + UiPanel.PortraitButtonRow + 64f; s.width = Mathf.Min(260f, UiPanel.Size.x * 0.62f);
                    break;
                default:
                    // With touch the minimap moves to the top left (GameplayHud): the card goes beside it.
                    s.left = safe.x + (Touch ? 230f : 24f); s.top = safe.y + 24f; s.width = 340f;
                    break;
            }
        }
    }
}
