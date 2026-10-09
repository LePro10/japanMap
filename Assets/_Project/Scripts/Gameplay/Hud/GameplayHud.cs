using System.Collections.Generic;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// Game-content HUD: drift chain (points, ×1…×5 with progress to the next step, SPOT BONUS),
    /// Sparks balance and a queue of short toasts (region explored, discovery). PROVISIONAL until the
    /// HUD of Phase 9; UI Toolkit built in code like the other runtime panels (D05).
    /// </summary>
    public sealed class GameplayHud : MonoBehaviour
    {
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] DriftScorer drift;
        [SerializeField] SparksWallet wallet;
        [Tooltip("Seconds a toast stays (ASTRA §3: 2.5 s).")]
        [SerializeField] float toastSeconds = 2.5f;
        [Tooltip("Seconds the result of a chain stays.")]
        [SerializeField] float chainResultSeconds = 1.8f;

        UIDocument _doc;
        VisualElement _driftBox, _bar, _barFill;
        Label _points, _mult, _spot, _result, _sparks, _toast, _banner, _prompt, _hint, _stunt;
        VisualElement _useButton;
        bool _touchSeen;
        float _resultUntil, _toastUntil, _bannerUntil;
        readonly Queue<string> _toasts = new();

        static readonly Color Gold = new(1f, 0.82f, 0.35f);
        static readonly Color Rose = new(1f, 0.55f, 0.7f);

        internal Label Points => _points;
        internal Label Result => _result;
        internal Label Toast => _toast;
        internal Label Sparks => _sparks;
        /// <summary>Last toast shown or queued (tests, play scripts).</summary>
        public string LastToast { get; private set; } = "";

        public void Configure(PanelSettings panel, DriftScorer d, SparksWallet w)
        {
            panelSettings = panel;
            drift = d;
            wallet = w;
        }

        void Awake()
        {
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = panelSettings;
            _doc.sortingOrder = 3;
        }

        void OnEnable()
        {
            var root = _doc.rootVisualElement;
            root.Clear();
            root.pickingMode = PickingMode.Ignore;
            Fill(root);

            _driftBox = Box(root);
            _driftBox.style.top = 70;
            _driftBox.style.left = _driftBox.style.right = 0;
            _driftBox.style.alignItems = Align.Center;
            _driftBox.style.alignSelf = Align.Center;
            var plate = new VisualElement { pickingMode = PickingMode.Ignore };
            // Dark plate: the bowl and the city are full of bright neon behind the numbers.
            plate.style.alignItems = Align.Center;
            plate.style.backgroundColor = new Color(0.03f, 0.04f, 0.08f, 0.55f);
            plate.style.paddingLeft = plate.style.paddingRight = 22;
            plate.style.paddingTop = plate.style.paddingBottom = 6;
            plate.style.borderTopLeftRadius = plate.style.borderTopRightRadius = plate.style.borderBottomLeftRadius = plate.style.borderBottomRightRadius = 12;
            _driftBox.Add(plate);
            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.FlexEnd;
            plate.Add(row);
            _points = Text(row, 54, Color.white);
            _mult = Text(row, 40, Gold);
            _mult.style.marginLeft = 14;
            _bar = new VisualElement { pickingMode = PickingMode.Ignore };
            _bar.style.width = 220;
            _bar.style.height = 6;
            _bar.style.marginTop = 4;
            _bar.style.backgroundColor = new Color(1f, 1f, 1f, 0.2f);
            _barFill = new VisualElement { pickingMode = PickingMode.Ignore };
            _barFill.style.height = Length.Percent(100);
            _barFill.style.backgroundColor = Gold;
            _bar.Add(_barFill);
            plate.Add(_bar);
            _spot = Text(plate, 22, Rose);
            _spot.text = "SPOT BONUS ×2";
            _result = Text(Box(root), 34, Color.white);
            _result.parent.style.top = 70;
            _result.parent.style.left = _result.parent.style.right = 0;
            _result.parent.style.alignItems = Align.Center;

            _sparks = Text(Box(root), 30, Gold);
            _sparks.parent.style.top = 24;
            _sparks.parent.style.right = 40;

            var toastBox = Box(root);
            toastBox.style.top = 190;
            toastBox.style.left = toastBox.style.right = 0;
            toastBox.style.alignItems = Align.Center;
            _toast = Text(toastBox, 30, Color.white);
            Plate(_toast);
            _banner = Text(toastBox, 24, Gold);

            var promptBox = Box(root);
            promptBox.style.bottom = 96;
            promptBox.style.left = promptBox.style.right = 0;
            promptBox.style.alignItems = Align.Center;
            _hint = Text(promptBox, 26, Gold);
            _hint.style.display = DisplayStyle.None;
            _prompt = Text(promptBox, 28, Color.white);
            _prompt.style.display = DisplayStyle.None;

            _stunt = Text(Box(root), 24, new Color(1f, 0.55f, 0.15f));
            _stunt.text = "STUNT";
            _stunt.parent.style.top = 24;
            _stunt.parent.style.left = 40;
            Plate(_stunt);
            _stunt.style.display = DisplayStyle.None;

            _useButton = new VisualElement();
            _useButton.style.position = Position.Absolute;
            _useButton.style.width = _useButton.style.height = 96;
            _useButton.style.right = 460;
            _useButton.style.top = 40;
            _useButton.style.backgroundColor = new Color(1f, 0.68f, 0.25f, 0.45f);
            _useButton.style.borderTopLeftRadius = _useButton.style.borderTopRightRadius = _useButton.style.borderBottomLeftRadius = _useButton.style.borderBottomRightRadius = 48;
            var useLabel = Text(_useButton, 22, Color.white);
            useLabel.text = "USE";
            useLabel.style.flexGrow = 1;
            _useButton.RegisterCallback<PointerDownEvent>(e =>
            {
                UsePressed?.Invoke();
                e.StopPropagation();
            });
            _useButton.style.display = DisplayStyle.None;
            root.Add(_useButton);
            _touchSeen = Application.isMobilePlatform;

            if (drift != null) drift.ChainEnded += OnChainEnded;
            if (wallet != null) wallet.Earned += OnEarned;
        }

        void OnDisable()
        {
            if (drift != null) drift.ChainEnded -= OnChainEnded;
            if (wallet != null) wallet.Earned -= OnEarned;
        }

        /// <summary>Show a message now, replacing the current one (puzzle feedback).</summary>
        public void Flash(string text)
        {
            LastToast = text;
            _toast.text = text;
            _toast.style.display = DisplayStyle.Flex;
            _toastUntil = Time.time + toastSeconds;
        }

        /// <summary>Context action of the moment ("E  Inspect …"); "" hides it.</summary>
        public void SetPrompt(string text)
        {
            if (_prompt == null) return;
            // On touch the USE button is the prompt; drop the key name.
            _prompt.text = _touchSeen && text.StartsWith("E  ") ? text.Substring(3) : text;
            _prompt.style.display = text != "" ? DisplayStyle.Flex : DisplayStyle.None;
            _useButton.style.display = _touchSeen && text != "" ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>Hint line above the prompt (ramp speed); "" hides it.</summary>
        public void SetHint(string text)
        {
            if (_hint == null || _hint.text == text) return;
            _hint.text = text;
            _hint.style.display = text != "" ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>The small orange STUNT tag while Stunt mode is armed (ASTRA §5).</summary>
        public void SetStuntTag(bool on)
        {
            if (_stunt != null) _stunt.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>Touch USE button pressed.</summary>
        public event System.Action UsePressed;

        /// <summary>Queue a short message (region explored, discovery found).</summary>
        public void ShowToast(string text)
        {
            LastToast = text;
            _toasts.Enqueue(text);
        }

        void OnChainEnded(ChainEnd reason, float credit, float chain)
        {
            if (chain < 1f) return;
            _result.text = reason == ChainEnd.Crash
                ? $"CRASH  +{credit:N0}  <size=70%>(half of {chain:N0})</size>"
                : $"+{credit:N0}";
            _result.style.color = reason == ChainEnd.Crash ? new Color(1f, 0.45f, 0.4f) : new Color(0.6f, 1f, 0.65f);
            _resultUntil = Time.time + chainResultSeconds;
        }

        void OnEarned(int amount, string reason)
        {
            // A toast that already names the reward (region, discovery) needs no second line.
            if (_toasts.Count > 0 || Time.time < _toastUntil) return;
            _banner.text = $"+{amount} Sparks · {reason}";
            _bannerUntil = Time.time + toastSeconds;
        }

        void Update()
        {
            if (!_touchSeen && UnityEngine.InputSystem.Touchscreen.current != null
                && UnityEngine.InputSystem.Touchscreen.current.primaryTouch.press.isPressed) _touchSeen = true;
            if (drift != null)
            {
                var c = drift.Chain;
                var showChain = c.Active && c.Pending >= 1f;
                _driftBox.style.display = showChain ? DisplayStyle.Flex : DisplayStyle.None;
                if (showChain)
                {
                    _points.text = c.Pending.ToString("N0");
                    _mult.text = $"×{c.Multiplier}";
                    _barFill.style.width = Length.Percent(c.NextStepProgress * 100f);

                    // Fading link time: the chain is still alive but about to bank.
                    _points.style.opacity = c.Scoring ? 1f : 0.55f;
                }
                _spot.style.display = drift.Zone >= 0 ? DisplayStyle.Flex : DisplayStyle.None;
                if (drift.Zone >= 0 && !showChain) _driftBox.style.display = DisplayStyle.Flex;
                _points.style.display = _mult.style.display = showChain ? DisplayStyle.Flex : DisplayStyle.None;
                _bar.style.display = showChain && c.Multiplier < 5 ? DisplayStyle.Flex : DisplayStyle.None;
                _result.parent.style.display = !showChain && Time.time < _resultUntil ? DisplayStyle.Flex : DisplayStyle.None;
            }
            if (wallet != null) _sparks.text = $"{wallet.Balance:N0} Sparks";

            if (Time.time >= _toastUntil)
            {
                _toast.text = _toasts.Count > 0 ? _toasts.Dequeue() : "";
                if (_toast.text != "") _toastUntil = Time.time + toastSeconds;
                _toast.style.display = _toast.text != "" ? DisplayStyle.Flex : DisplayStyle.None;
            }
            _banner.style.display = Time.time < _bannerUntil ? DisplayStyle.Flex : DisplayStyle.None;
        }

        static void Fill(VisualElement e)
        {
            e.style.position = Position.Absolute;
            e.style.left = e.style.right = e.style.top = e.style.bottom = 0;
        }

        static void Plate(VisualElement e)
        {
            e.style.backgroundColor = new Color(0.03f, 0.04f, 0.08f, 0.55f);
            e.style.paddingLeft = e.style.paddingRight = 22;
            e.style.paddingTop = e.style.paddingBottom = 6;
            e.style.borderTopLeftRadius = e.style.borderTopRightRadius = e.style.borderBottomLeftRadius = e.style.borderBottomRightRadius = 12;
        }

        static VisualElement Box(VisualElement parent)
        {
            var b = new VisualElement { pickingMode = PickingMode.Ignore };
            b.style.position = Position.Absolute;
            parent.Add(b);
            return b;
        }

        static Label Text(VisualElement parent, float size, Color color)
        {
            var l = new Label { pickingMode = PickingMode.Ignore, enableRichText = true };
            l.style.fontSize = size;
            l.style.color = color;
            l.style.unityFontStyleAndWeight = FontStyle.Bold;
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.style.textShadow = new TextShadow { offset = new Vector2(0f, 2f), blurRadius = 6f, color = new Color(0f, 0f, 0f, 0.8f) };
            parent.Add(l);
            return l;
        }
    }
}
