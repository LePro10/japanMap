using System;
using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Map;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// The driving and walking HUD (ASTRA §10 "Driving HUD layouts"), four groups: navigation (north-up minimap with
    /// the region name), car instruments (rpm arc, gear, speed, nitro arc), the temporary skill score (drift chain at
    /// 20 % height) and activity status (race lines, test drive). Sparks show for 2 s when earned, not permanently.
    /// Layouts per form factor at ASTRA's reference sizes: desktop 190 px map lower left / 220 × 180 instrument lower
    /// right; phone landscape 112 px map top left / 144 × 118 instrument right, 138 px above the bottom; phone portrait
    /// map top left / 132 × 112 instrument top right, strips between y 140 and 220. During an event the region,
    /// discovery and purchase notices wait until the result has gone (ASTRA: "after the finish line").
    /// </summary>
    public sealed class GameplayHud : MonoBehaviour
    {
        [Tooltip("Speed post-processing (chromatic fringe, distortion, vignette, motion blur on High) — SpeedPost.")]
        [SerializeField] UnityEngine.Rendering.VolumeProfile speedProfile;
        [Tooltip("The route tape on the road (RouteGuide, shader JapanMap/GuideLine).")]
        [SerializeField] Material guideMaterial;
        [Tooltip("Cockpit view: the cluster screen (unlit) and the windscreen head-up display (additive) — CockpitDisplay.")]
        [SerializeField] Material cockpitScreen;
        [SerializeField] Material cockpitHud;
        [Tooltip("Auto-drive to the waypoint (D49): pace, lane, traffic, takeover, letterbox — AutoDriver.")]
        [SerializeField] AutoDriveSettings autoDrive;
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] DriftScorer drift;
        [SerializeField] SparksWallet wallet;
        [SerializeField] PlayerModeController player;
        [SerializeField] MapSystem map;
        [Tooltip("Seconds a toast stays (ASTRA §3: 2.5 s).")]
        [SerializeField] float toastSeconds = 2.5f;
        [Tooltip("Seconds the result of a chain stays.")]
        [SerializeField] float chainResultSeconds = 1.8f;
        [Tooltip("Seconds the balance shows after Sparks were earned (ASTRA §10: 2 s).")]
        [SerializeField] float sparksSeconds = 2f;
        [Tooltip("Minimap width in metres: in the car, on foot, and above fastKmh (ASTRA: 480 / 160 / 700).")]
        [SerializeField] Vector3 minimapSpan = new(480f, 160f, 700f);
        [SerializeField] float fastKmh = 180f;

        UIDocument _doc;
        VisualElement _root, _nav, _driftBox, _bar, _barFill, _useButton, _sheet, _sheetButtons, _arrow;
        Label _goal;
        string _goalTitle = "";
        Vector2? _goalAt;
        Label _regionJp;
        VisualElement _toastRow;
        UI.Hanko _toastStamp;
        Label _saved, _points, _mult, _spot, _result, _sparks, _toast, _banner, _prompt, _hint, _stunt, _race, _count, _region, _sheetTitle, _sheetBody;
        Instrument _instrument;
        SpeedLines _lines;
        Label _burstTag;
        float _burstShown;
        MapView _minimap;
        readonly List<MapPin> _pins = new();
        float _savedUntil, _resultUntil, _toastUntil, _bannerUntil, _sparksUntil, _span;
        bool _touchSeen, _held;
        string _activity = "", _raceLines = "";
        readonly Queue<string> _toasts = new();
        readonly Dictionary<object, string> _prompts = new();
        FormFactor _builtFor;

        static readonly Color Gold = new(0.95f, 0.77f, 0.42f);
        static readonly Color Rose = new(0.91f, 0.66f, 0.75f);

        internal Label Points => _points;
        internal Label Result => _result;
        internal Label Toast => _toast;
        internal Label Sparks => _sparks;
        public Instrument Instrument => _instrument;
        /// <summary>The cockpit view has its own speed display on the dashboard: the HUD gauge steps aside.</summary>
        public static bool CockpitShowsSpeed { get; set; }
        public SpeedLines Lines => _lines;
        /// <summary>The HUD's root: full-screen layers of other systems (the intro) live here.</summary>
        public VisualElement Root => _root;
        public MapView Minimap => _minimap;
        /// <summary>Last toast shown or queued (tests, play scripts).</summary>
        public string LastToast { get; private set; } = "";
        /// <summary>Text of the event card / result sheet ("" = none).</summary>
        public string SheetText { get; private set; } = "";

        public void Configure(PanelSettings panel, DriftScorer d, SparksWallet w)
        {
            panelSettings = panel;
            drift = d;
            wallet = w;
        }

        void Awake()
        {
            gameObject.AddComponent<SpeedPost>().Bind(player, speedProfile);
            gameObject.AddComponent<RouteGuide>().Bind(player, map, this, guideMaterial);
            gameObject.AddComponent<CockpitDisplay>().Bind(player, panelSettings, null, cockpitScreen, cockpitHud);
            gameObject.AddComponent<RepairPrompt>().Bind(player, panelSettings); // D47: free repair, only while hurt
            gameObject.AddComponent<AutoDriver>().Bind(autoDrive != null ? autoDrive : ScriptableObject.CreateInstance<AutoDriveSettings>(), player, map, this, panelSettings);
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panelSettings);
            _doc.sortingOrder = 3;
        }

        void OnEnable()
        {
            Build();
            UiPanel.Changed += OnLayout;
            QualitySystem.TierChanged += OnTier;
            if (drift != null) drift.ChainEnded += OnChainEnded;
            if (wallet != null) wallet.Earned += OnEarned;
        }

        void OnDisable()
        {
            UiPanel.Changed -= OnLayout;
            QualitySystem.TierChanged -= OnTier;
            if (drift != null) drift.ChainEnded -= OnChainEnded;
            if (wallet != null) wallet.Earned -= OnEarned;
        }

        void OnTier(string tier) { if (_root != null) UI.Nm.Tier(_root, tier); }

        void OnLayout()
        {
            if (_builtFor != UiPanel.Form) Build();
            else Place();
        }

        // ── build ─────────────────────────────────────────────────────────────

        void Build()
        {
            _builtFor = UiPanel.Form;
            var hidden = _root != null && _root.style.display == DisplayStyle.None;
            var doc = _doc.rootVisualElement;
            doc.Clear();
            doc.pickingMode = PickingMode.Ignore;
            Fill(doc);
            _root = new VisualElement { pickingMode = PickingMode.Ignore, name = "hud" };
            Fill(_root);
            UI.Nm.Tier(_root, QualitySystem.Current); // Low: no telop shadows (an extra text pass each)
            doc.Add(_root);
            var phone = UiPanel.IsPhone;
            var k = phone ? 0.62f : 1f; // phone type scale; touch targets keep their size elsewhere
            // Speed streaks first: behind every other HUD element.
            _lines = new SpeedLines { name = "speed-lines" };
            _root.Add(_lines);

            // Navigation: the minimap and the region name.
            _nav = Box(_root);
            if (map != null)
            {
                _minimap = new MapView(map.Roads, map.Regions, map.Bounds, map.EnsureBase()) { name = "minimap" };
                map.ArtLoaded -= OnMapArt;
                map.ArtLoaded += OnMapArt;
                // A tap on the minimap opens the world map (ASTRA §10: "M, minimap tap").
                _minimap.RegisterCallback<PointerDownEvent>(e =>
                {
                    Menu.GameMenu.Instance?.Open<Menu.MapScreen>();
                    e.StopPropagation();
                });
                // A see-through ring like FH6 (docs/refs): the world shows around the roads, a thin paper rim.
                _minimap.AddToClassList("nm-minimap");
                _nav.Add(_minimap);
            }
            var regionRow = new VisualElement { pickingMode = PickingMode.Ignore };
            regionRow.AddToClassList("nm-region-row");
            _nav.Add(regionRow);
            _region = Text(regionRow, 18f * k, Color.white);
            _region.AddToClassList("nm-region-row__en");
            _regionJp = Text(regionRow, 12f * k, UI.Palette.Momo);
            _regionJp.AddToClassList("nm-region-row__jp");
            _regionJp.AddToClassList("nm-jp");

            _instrument = new Instrument { name = "instrument" };
            _instrument.style.position = Position.Absolute;
            _root.Add(_instrument);

            // Score: one large number and multiplier at 20 % height, a thin progress line, one reason.
            _driftBox = Box(_root);
            _driftBox.style.left = _driftBox.style.right = 0;
            _driftBox.style.alignItems = Align.Center;
            var plate = new VisualElement { pickingMode = PickingMode.Ignore };
            plate.AddToClassList("nm-score");
            plate.style.alignItems = Align.Center;
            _driftBox.Add(plate);
            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.FlexEnd;
            plate.Add(row);
            _points = Text(row, 54f * k, Color.white);
            _mult = Text(row, 40f * k, Gold);
            _mult.style.marginLeft = 14;
            _points.AddToClassList("jm-num");
            _mult.AddToClassList("jm-num");
            _points.AddToClassList("nm-score__points");
            _mult.AddToClassList("nm-score__mult");
            _bar = new VisualElement { pickingMode = PickingMode.Ignore };
            _bar.style.width = 220 * k;
            _bar.style.height = 6;
            _bar.style.marginTop = 4;
            _bar.style.backgroundColor = new Color(1f, 1f, 1f, 0.2f);
            _barFill = new VisualElement { pickingMode = PickingMode.Ignore };
            _barFill.style.height = Length.Percent(100);
            _barFill.style.backgroundColor = UI.Palette.Momo;
            _bar.Add(_barFill);
            plate.Add(_bar);
            _spot = Text(plate, 22f * k, Color.white);
            _spot.AddToClassList("nm-score__spot");
            _spot.text = "SPOT BONUS ×2";
            _result = Text(Box(_root), 34f * k, Color.white);
            _result.parent.style.left = _result.parent.style.right = 0;
            _result.parent.style.alignItems = Align.Center;
            _result.AddToClassList("jm-num");
            _result.AddToClassList("nm-score__result");

            // Sparks: top right, only for a moment after earning.
            var sparksBox = Box(_root);
            sparksBox.style.alignItems = Align.FlexEnd;
            _sparks = Text(sparksBox, 30f * k, Color.white);
            _sparks.AddToClassList("jm-num");
            _sparks.AddToClassList("nm-hud-sparks");
            _saved = Text(sparksBox, 13f, UI.Palette.WashiDim);
            _saved.AddToClassList("nm-hud-saved");
            _saved.style.display = DisplayStyle.None;
            sparksBox.name = "sparks";

            var toastBox = Box(_root);
            toastBox.name = "toasts";
            toastBox.style.left = toastBox.style.right = 0;
            toastBox.style.alignItems = Align.Center;
            // One notice lane: an ink strip with a hanko when the notice is a find, a record or a done goal.
            _toastRow = new VisualElement { pickingMode = PickingMode.Ignore, name = "toast-row" };
            _toastRow.AddToClassList("nm-toast");
            toastBox.Add(_toastRow);
            _toastStamp = new UI.Hanko(UI.Jp.Found, phone ? 30f : 44f);
            _toastStamp.AddToClassList("nm-toast__stamp");
            _toastRow.Add(_toastStamp);
            _toast = Text(_toastRow, 22f * k, Color.white);
            _toast.AddToClassList("nm-toast__text");
            _toast.style.whiteSpace = WhiteSpace.Normal;
            _toastRow.style.display = DisplayStyle.None;
            _banner = Text(toastBox, 18f * k, Color.white);
            _banner.AddToClassList("nm-banner");

            var promptBox = Box(_root);
            promptBox.name = "prompt";
            promptBox.style.left = promptBox.style.right = 0;
            promptBox.style.alignItems = Align.Center;
            _hint = Text(promptBox, 20f * k, Color.white);
            _hint.AddToClassList("nm-hud-hint");
            _hint.style.display = DisplayStyle.None;
            _prompt = Text(promptBox, 22f * k, Color.white);
            _prompt.AddToClassList("nm-hud-prompt");
            _prompt.style.display = DisplayStyle.None;

            _race = Text(Box(_root), 24f * k, Color.white);
            _race.parent.name = "activity";
            _race.style.unityTextAlign = TextAnchor.UpperLeft;
            _race.AddToClassList("nm-hud-race");
            _race.style.display = DisplayStyle.None;

            // Next checkpoint direction: just above the car's forward sightline.
            _arrow = new VisualElement { pickingMode = PickingMode.Ignore, name = "arrow" };
            _arrow.style.position = Position.Absolute;
            _arrow.style.width = _arrow.style.height = 56 * (phone ? 0.8f : 1f); // 44 was easy to miss (human, 2026-10-11)
            _arrow.generateVisualContent += DrawArrow;
            _arrow.style.display = DisplayStyle.None;
            _root.Add(_arrow);
            // What the arrow points at, for as long as it points: the "Next: …" toast alone was gone before players
            // read it (human, 2026-10-11: "seh ich fast nicht").
            _goal = Text(_root, 22f * k, Color.white);
            _goal.name = "goal";
            _goal.AddToClassList("nm-hud-goal");
            _goal.style.position = Position.Absolute;
            _goal.style.display = DisplayStyle.None;

            var mid = Box(_root);
            mid.name = "middle";
            mid.style.left = mid.style.right = 0;
            mid.style.alignItems = Align.Center;
            _count = Text(mid, 150f * k, Color.white);
            _count.AddToClassList("jm-num");
            _count.AddToClassList("nm-count");
            _count.style.display = DisplayStyle.None;

            var burstBox = Box(_root);
            burstBox.name = "burst";
            burstBox.style.left = burstBox.style.right = 0;
            burstBox.style.top = Length.Percent(phone ? 18f : 22f);
            burstBox.style.alignItems = Align.Center;
            _burstTag = Text(burstBox, 64f * k, Color.white);
            _burstTag.text = "BURST!!";
            _burstTag.AddToClassList("jm-num");
            _burstTag.AddToClassList("nm-telop-hud");
            _burstTag.AddToClassList("nm-telop-hud--sora");
            _burstTag.style.display = DisplayStyle.None;

            _stunt = Text(Box(_root), 26f * k, Color.white);
            _stunt.text = "STUNT";
            _stunt.parent.name = "stunt";
            _stunt.AddToClassList("jm-num");
            _stunt.AddToClassList("nm-hud-stunt");
            _stunt.style.display = DisplayStyle.None;

            // Event card / result sheet with real buttons (ASTRA: Start / Back, Retry / Free drive).
            _sheet = new VisualElement { name = "sheet" };
            _sheet.AddToClassList("jm-panel");
            _sheet.AddToClassList("nm-sheet");
            _sheet.style.position = Position.Absolute;
            _sheetTitle = new Label { name = "sheet-title" };
            _sheetTitle.AddToClassList("jm-h2");
            _sheet.Add(_sheetTitle);
            // Result hero (ShowResult): medal, the big number, the reward counting up.
            _hero = new VisualElement { name = "result-hero", pickingMode = PickingMode.Ignore };
            _hero.AddToClassList("jm-result");
            // The place or medal as a big red stamp (金 銀 銅, 完 = finished), the medal's name under it.
            var stampBox = new VisualElement { pickingMode = PickingMode.Ignore };
            stampBox.AddToClassList("jm-medal");
            _stamp = new UI.Hanko(UI.Jp.Finish, phone ? 72f : 112f);
            stampBox.Add(_stamp);
            _medal = new Label { pickingMode = PickingMode.Ignore };
            _medal.AddToClassList("jm-medal__name");
            stampBox.Add(_medal);
            _hero.Add(stampBox);
            var heroText = new VisualElement { pickingMode = PickingMode.Ignore };
            heroText.AddToClassList("jm-result__text");
            _heroMain = new Label { pickingMode = PickingMode.Ignore };
            _heroMain.AddToClassList("jm-result__main");
            heroText.Add(_heroMain);
            _heroReward = new Label { pickingMode = PickingMode.Ignore };
            _heroReward.AddToClassList("jm-result__reward");
            heroText.Add(_heroReward);
            _hero.Add(heroText);
            _hero.style.display = DisplayStyle.None;
            _sheet.Add(_hero);
            _sheetBody = new Label { enableRichText = true };
            _sheetBody.AddToClassList("jm-body");
            _sheet.Add(_sheetBody);
            _sheetButtons = new VisualElement();
            _sheetButtons.AddToClassList("jm-row");
            _sheetButtons.AddToClassList("jm-wrap");
            _sheetButtons.style.marginTop = 10;
            _sheet.Add(_sheetButtons);
            _sheet.style.display = DisplayStyle.None;
            _root.Add(_sheet);

            _useButton = new VisualElement { name = "use" };
            _useButton.AddToClassList("jm-touch");
            _useButton.style.width = _useButton.style.height = 64;
            _useButton.style.backgroundColor = new Color(0.95f, 0.77f, 0.42f, 0.45f);
            var useLabel = new Label("USE") { pickingMode = PickingMode.Ignore };
            _useButton.Add(useLabel);
            _useButton.RegisterCallback<PointerDownEvent>(e =>
            {
                UsePressed?.Invoke();
                e.StopPropagation();
            });
            _useButton.style.display = DisplayStyle.None;
            _root.Add(_useButton);
            _touchSeen = _touchSeen || Application.isMobilePlatform;

            Place();
            if (hidden) _root.style.display = DisplayStyle.None;
            // A rebuild (rotation, window size) keeps what was shown.
            RefreshPrompt();
            _race.text = "";
            RefreshActivity();
            var count = _countText; _countText = null; SetCountdown(count ?? "");
            var hint = _hintText; _hintText = null; SetHint(hint ?? "");
            SetStuntTag(_stuntOn);
            SetTarget(_target);
            if (_sheetArgs.title != null) ShowSheet(_sheetArgs.title, _sheetArgs.body, _sheetArgs.buttons);
        }

        string _countText, _hintText;
        bool _stuntOn;
        (string title, string body, (string label, Action action)[] buttons) _sheetArgs;

        /// <summary>Positions every group for the form factor, inside the safe area.</summary>
        void Place()
        {
            var safe = UiPanel.Safe;
            var form = UiPanel.Form;
            var size = UiPanel.Size;
            float L(float v) => v + safe.x;
            float T(float v) => v + safe.y;
            float R(float v) => v + safe.z;
            float B(float v) => v + safe.w;
            float map, ix, iy;
            switch (form)
            {
                case FormFactor.PhoneLandscape:
                    map = 112f; ix = 144f; iy = 118f;
                    Pos(_nav, left: L(12), top: T(12));
                    Pos(_instrument, right: R(12), bottom: B(138));
                    Pos(_race.parent, left: L(136), top: T(12));
                    Pos(_driftBox, top: T(size.y * 0.16f));
                    Pos(_result.parent, top: T(size.y * 0.16f + 58f));
                    Pos(_sparks.parent, right: R(12), top: T(66)); // under the touch button row
                    Pos(_toast.parent, top: T(size.y * 0.36f));
                    Pos(_prompt.parent, bottom: B(150));
                    Pos(_stunt.parent, left: L(136), top: T(62));
                    Pos(_count.parent, top: T(size.y * 0.25f));
                    Pos(_sheet, top: T(40));
                    Pos(_useButton, right: R(170), bottom: B(150));
                    break;
                case FormFactor.PhonePortrait:
                    map = 112f; ix = 132f; iy = 112f;
                    Pos(_nav, left: L(12), top: T(12));
                    Pos(_instrument, right: R(12), top: T(12));
                    // One column, top down (UI audit 2026-10-21: race lines lay on Sparks and the button row): map and
                    // instrument · region name · Sparks · touch button row (UiPanel.PortraitButtonRow, ~52 px) · race
                    // lines left, stunt right · drift score · toasts.
                    var below = UiPanel.PortraitButtonRow + 64f;
                    Pos(_sparks.parent, left: L(12), top: T(150)); // under the region name; the right has the button row
                    Pos(_race.parent, left: L(12), top: T(below));
                    Pos(_stunt.parent, right: R(12), top: T(below));
                    Pos(_driftBox, top: T(below + 120f));
                    Pos(_result.parent, top: T(below + 120f));
                    Pos(_toast.parent, top: T(below + 190f));
                    Pos(_prompt.parent, bottom: B(300)); // above the touch controls and the player prompt
                    Pos(_count.parent, top: T(size.y * 0.3f));
                    Pos(_sheet, top: T(150));
                    Pos(_useButton, right: R(16), bottom: B(250)); // above CALL / CAR
                    break;
                default:
                    map = 190f; ix = 220f; iy = 180f;
                    // With touch (a tablet, a touch laptop) the lower corners belong to the pad and the buttons: the map
                    // and the instrument go up, the race lines beside the map (else a finger on the pad hit the minimap).
                    if (_touchSeen)
                    {
                        Pos(_nav, left: L(24), top: T(24));
                        Pos(_instrument, right: R(24), top: T(80));
                        Pos(_race.parent, left: L(24 + 190 + 16), top: T(24));
                    }
                    else
                    {
                        Pos(_nav, left: L(24), bottom: B(24));
                        Pos(_instrument, right: R(24), bottom: B(24));
                        Pos(_race.parent, left: L(24), top: T(24));
                    }
                    Pos(_driftBox, top: T(size.y * 0.2f - 30f));
                    Pos(_result.parent, top: T(size.y * 0.2f - 20f));
                    Pos(_sparks.parent, right: R(32), top: T(_touchSeen ? 24 : 84)); // under the desktop MENU button
                    Pos(_toast.parent, top: T(size.y * 0.32f));
                    Pos(_prompt.parent, bottom: B(110));
                    Pos(_stunt.parent, left: L(24), bottom: B(260));
                    Pos(_count.parent, top: T(size.y * 0.28f));
                    Pos(_sheet, top: T(size.y * 0.22f));
                    Pos(_useButton, right: R(280), bottom: B(40));
                    break;
            }
            // The sheet: centred, ASTRA widths (desktop 560 px, phone 60 % / portrait 92 %).
            var sheetW = form == FormFactor.Desktop ? 560f : size.x * (form == FormFactor.PhonePortrait ? 0.92f : 0.6f);
            _sheet.style.width = sheetW;
            _sheet.style.left = (size.x - sheetW) * 0.5f;
            if (_minimap != null) _minimap.style.width = _minimap.style.height = map;
            _region.style.width = map;
            _instrument.style.width = ix;
            _instrument.style.height = iy;
        }

        static void Pos(VisualElement e, float? left = null, float? top = null, float? right = null, float? bottom = null)
        {
            e.style.left = left.HasValue ? left.Value : StyleKeyword.Auto;
            e.style.top = top.HasValue ? top.Value : StyleKeyword.Auto;
            e.style.right = right.HasValue ? right.Value : StyleKeyword.Auto;
            e.style.bottom = bottom.HasValue ? bottom.Value : StyleKeyword.Auto;
            // Centred groups span the width.
            if (!left.HasValue && !right.HasValue && e.style.position == Position.Absolute && e.name != "sheet") { e.style.left = 0; e.style.right = 0; }
        }

        // ── API (unchanged for the game systems) ──────────────────────────────

        /// <summary>Name the waypoint at <paramref name="at"/> under the arrow until it is reached or replaced.</summary>
        public void SetGoal(string title, Vector2 at)
        {
            _goalTitle = title ?? "";
            _goalAt = at;
        }

        /// <summary>Text under the arrow ("" = hidden) — tests.</summary>
        public string GoalLabel => _goal != null && _goal.style.display == DisplayStyle.Flex ? _goal.text : "";

        /// <summary>
        /// A skill moment (stunt landed) as a telop at the score's place, not in the notice lane (D55: telop for skill
        /// only, the lane for information). Also kept as the last toast for callers that read it.
        /// </summary>
        public void ShowSkill(string text)
        {
            LastToast = text;
            if (_result == null) return;
            _result.text = text;
            _resultUntil = Time.time + chainResultSeconds;
            Pop(_result, 1.5f);
        }

        /// <summary>Show a message now, replacing the current one (puzzle feedback).</summary>
        public void Flash(string text)
        {
            LastToast = text;
            ShowToastNow(text);
            _toastUntil = Time.time + toastSeconds;
        }

        /// <summary>
        /// Context action of the moment ("E  Inspect …") from one source; "" withdraws it. Several sources may ask;
        /// the first one in asking order shows, and only that one may act on Use (<see cref="PromptOwner"/>).
        /// </summary>
        public void SetPrompt(object source, string text)
        {
            if (string.IsNullOrEmpty(text)) _prompts.Remove(source);
            else _prompts[source] = text;
            RefreshPrompt();
        }

        void RefreshPrompt()
        {
            if (_prompt == null) return;
            PromptOwner = null;
            var shown = "";
            foreach (var kv in _prompts) { PromptOwner = kv.Key; shown = kv.Value; break; }
            // On touch the USE button is the prompt; drop the key name.
            _prompt.text = KeyCap(_touchSeen && shown.StartsWith("E  ") ? shown.Substring(3) : shown);
            _prompt.style.display = shown != "" ? DisplayStyle.Flex : DisplayStyle.None;
            _useButton.style.display = _touchSeen && shown != "" ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>"F  Get out" → the key as a paper cap, then the action (rich text: the mark is the cap's paper).</summary>
        internal static string KeyCap(string prompt)
        {
            var i = prompt.IndexOf("  ", System.StringComparison.Ordinal);
            if (i <= 0 || i > 12) return prompt;
            return $"<mark=#f5efe4F0><color=#17121f> {prompt.Substring(0, i)} </color></mark>  {prompt.Substring(i + 2)}";
        }

        /// <summary>The prompt as the player reads it, without the key cap's markup (tests).</summary>
        public string PromptText => _prompt == null ? "" : System.Text.RegularExpressions.Regex.Replace(_prompt.text, "<[^>]+>", "").Trim();

        /// <summary>Shows the touch USE button as if the screen had been touched (screenshots of the phone layout).</summary>
        public void ShowTouch()
        {
            _touchSeen = true;
            RefreshPrompt();
            Place();
        }

        /// <summary>Who owns the prompt shown now (null: none).</summary>
        public object PromptOwner { get; private set; }

        /// <summary>Plain text panel (legacy callers); "" hides it.</summary>
        public void ShowPanel(string text)
        {
            if (string.IsNullOrEmpty(text)) { HideSheet(); return; }
            var nl = text.IndexOf('\n');
            ShowSheet(nl > 0 ? text.Substring(0, nl).Replace("<b>", "").Replace("</b>", "") : text, nl > 0 ? text.Substring(nl + 1) : "");
        }

        /// <summary>
        /// Event card or result sheet: title, body, and buttons (label, action). Buttons are touch targets; the first
        /// is the primary one.
        /// </summary>
        public void ShowSheet(string title, string body, params (string label, Action action)[] buttons)
        {
            if (_hero != null) _hero.style.display = DisplayStyle.None;
            _sheet?.RemoveFromClassList("nm-sheet--result");
            if (_sheetBody != null) _sheetBody.style.display = DisplayStyle.Flex;
            _sheetBody?.RemoveFromClassList("jm-small");
            ShowSheetCore(title, body, buttons);
        }

        /// <summary>
        /// The result of an event as a moment, not a text block (owner 2026-10-13, ASTRA §10 "medal, personal best,
        /// reward breakdown"): medal badge, the time or score large, the Sparks counting up; body and buttons below.
        /// <paramref name="tier"/>: 3 gold, 2 silver, 1 bronze, 0 none.
        /// </summary>
        public void ShowResult(string title, string medal, int tier, string main, int sparks, string body, params (string label, Action action)[] buttons)
        {
            ShowSheetCore(title, body, buttons);
            if (_hero == null) return;
            _hero.style.display = DisplayStyle.Flex;
            _sheetBody.AddToClassList("jm-small"); // the hero says it large; the line below is the detail
            _medal.text = medal.ToUpperInvariant();
            // A place ("4th") stamps 四位; a medal 金 銀 銅; anything else 完 (finished).
            var place = medal.Length >= 3 && char.IsDigit(medal[0]) && int.TryParse(medal.Substring(0, medal.Length - 2), out var n) ? n : 0;
            _stamp.Word = place > 0 ? UI.Jp.Place(place) : tier >= 3 ? UI.Jp.Gold : tier == 2 ? UI.Jp.Silver : tier == 1 ? UI.Jp.Bronze : UI.Jp.Finish;
            // The hero says it all large; the line below repeated it (UI audit 2026-10-21). SheetText keeps it for tests.
            _sheetBody.style.display = DisplayStyle.None;
            _stamp.Stamp(Core.GameOptions.ReducedMotion);
            _sheet.AddToClassList("nm-sheet--result");
            _heroMain.text = main;
            // Count the reward up over a second (real time: the result can show while the game is slowed).
            _countFrom = Time.unscaledTime;
            _countTo = sparks;
            _heroReward.text = sparks > 0 ? "+0 Sparks" : "";
            if (sparks > 0) Audio.Sfx.Play("Bell_Sparks", 0.5f);
        }

        float _countFrom;
        int _countTo;
        VisualElement _hero;
        Label _medal, _heroMain, _heroReward;
        UI.Hanko _stamp;

        void TickResult()
        {
            if (_hero == null || _hero.style.display != DisplayStyle.Flex || _countTo <= 0) return;
            var t = Mathf.Clamp01((Time.unscaledTime - _countFrom) / 1.1f);
            var shown = Mathf.RoundToInt(_countTo * (1f - (1f - t) * (1f - t)));
            var text = $"+{shown:N0} Sparks";
            if (_heroReward.text != text) _heroReward.text = text;
        }

        void ShowSheetCore(string title, string body, (string label, Action action)[] buttons)
        {
            if (_sheet == null) return;
            _sheetTitle.text = title;
            _sheetBody.text = body;
            _sheetButtons.Clear();
            for (var i = 0; i < buttons.Length; i++)
            {
                var b = buttons[i];
                Ui.Button(_sheetButtons, b.label, b.action, i == 0 ? "jm-btn--primary" : "jm-btn");
            }
            _sheet.style.display = DisplayStyle.Flex;
            SheetText = $"{title}\n{body}";
            _sheetArgs = (title, body, buttons);
        }

        /// <summary>Adds a button to the open sheet (a rewarded offer on the result). Ignored when no sheet is open.</summary>
        public void AddSheetButton(string label, Action action)
        {
            if (_sheetArgs.title == null) return;
            var list = new System.Collections.Generic.List<(string, Action)>(_sheetArgs.buttons) { (label, action) };
            ShowSheetCore(_sheetArgs.title, _sheetArgs.body, list.ToArray());
        }

        /// <summary>The open sheet with another body and without the button <paramref name="drop"/> (offer answered).</summary>
        public void ReviseSheet(string body, string drop)
        {
            if (_sheetArgs.title == null) return;
            var list = new System.Collections.Generic.List<(string label, Action action)>(_sheetArgs.buttons);
            list.RemoveAll(b => b.label == drop);
            ShowSheetCore(_sheetArgs.title, body, list.ToArray());
        }

        /// <summary>Body of the open sheet ("" when none).</summary>
        public string SheetBody => _sheetArgs.title == null ? "" : _sheetArgs.body;

        public void HideSheet()
        {
            if (_sheet == null) return;
            _sheet.style.display = DisplayStyle.None;
            SheetText = "";
            _sheetArgs = default;
        }

        /// <summary>Race lines (position, lap, time) top left; "" hides them.</summary>
        public void SetRaceInfo(string text)
        {
            _raceLines = text ?? "";
            RefreshActivity();
        }

        /// <summary>Activity line (test drive countdown) with the race lines; "" hides it.</summary>
        public void SetActivity(string text)
        {
            _activity = text ?? "";
            RefreshActivity();
        }

        void RefreshActivity()
        {
            if (_race == null) return;
            var text = _activity != "" && _raceLines != "" ? _activity + "\n" + _raceLines : _activity + _raceLines;
            if (_race.text == text) return;
            _race.text = text;
            _race.style.display = text != "" ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>3 – 2 – 1 – GO, big in the middle; "" hides it.</summary>
        public void SetCountdown(string text)
        {
            if (_count == null || _countText == text) return;
            _countText = text;
            _count.text = text;
            _count.style.display = text != "" ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>Hint line above the prompt (ramp speed); "" hides it.</summary>
        public void SetHint(string text)
        {
            if (_hint == null || _hintText == text) return;
            _hintText = text;
            _hint.text = text;
            _hint.style.display = text != "" ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>The small orange STUNT tag while Stunt mode is armed (ASTRA §5).</summary>
        public void SetStuntTag(bool on)
        {
            _stuntOn = on;
            if (_stunt != null) _stunt.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
        }

        /// <summary>Direction to the next checkpoint (world position), null hides the arrow.</summary>
        public void SetTarget(Vector3? target)
        {
            _target = target;
            if (_arrow != null) _arrow.style.display = target.HasValue ? DisplayStyle.Flex : DisplayStyle.None;
        }

        Vector3? _target;
        /// <summary>The race checkpoint the arrow points at (null outside events).</summary>
        public Vector3? Target => _target;

        /// <summary>The small "Saved" line under the balance for a moment; names the store when it is only this device.</summary>
        public void ShowSaved(string store)
        {
            if (_saved == null) return;
            _saved.text = store == "CrazyGames" || UiPanel.IsPhone ? "Saved" : "Saved on this device"; // no ✓: not in the font
            _saved.style.display = DisplayStyle.Flex;
            _savedUntil = Time.unscaledTime + 1.6f;
        }

        public string SavedText => _saved != null && _saved.style.display == DisplayStyle.Flex ? _saved.text : "";

        /// <summary>Hides the whole HUD while a menu owns the screen.</summary>
        public bool Hidden
        {
            get => _root != null && _root.style.display == DisplayStyle.None;
            set { if (_root != null) _root.style.display = value ? DisplayStyle.None : DisplayStyle.Flex; }
        }

        /// <summary>
        /// Notices wait (region explored, discovery, purchase) — during an event until its result has gone
        /// (ASTRA §10). Queued toasts show after.
        /// </summary>
        public bool HoldNotices
        {
            get => _held;
            set
            {
                // A toast already on screen goes back to the front of the queue: it lay on the countdown's "3" (UI audit
                // 2026-10-21) because holding only stopped the next one.
                if (value && !_held && _toast != null && _toast.text != "")
                {
                    var rest = _toasts.ToArray();
                    _toasts.Clear();
                    _toasts.Enqueue(_toast.text);
                    foreach (var t in rest) _toasts.Enqueue(t);
                    ShowToastNow("");
                    _toastUntil = 0f;
                }
                if (value) _bannerUntil = 0f;
                _held = value;
            }
        }

        /// <summary>Touch USE button pressed.</summary>
        public event Action UsePressed;

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
            Pop(_result, 1.3f);
        }

        /// <summary>
        /// A short "pop": the element starts larger (or smaller) and eases to its size — every reward and every step of
        /// the chain is felt, not just read (ASTRA "juice"; there was no motion in the HUD at all).
        /// </summary>
        public static void Pop(VisualElement e, float from = 0.82f)
        {
            if (e == null) return;
            e.AddToClassList("jm-anim");
            e.style.transitionDuration = new StyleList<TimeValue>(new System.Collections.Generic.List<TimeValue> { new(0f) });
            e.style.scale = new Scale(new Vector3(from, from, 1f));
            e.schedule.Execute(() =>
            {
                e.style.transitionDuration = StyleKeyword.Null;
                e.style.scale = new Scale(Vector3.one);
            });
        }

        void OnMapArt(Texture2D art) => _minimap?.SetBase(art);

        /// <summary>The notice lane now: text, and a hanko when the notice is a find, a record or a done goal.</summary>
        void ShowToastNow(string text)
        {
            if (_toast == null) return;
            _toast.text = text;
            _toastRow.style.display = text != "" ? DisplayStyle.Flex : DisplayStyle.None;
            if (text == "") return;
            var l = text.ToLowerInvariant();
            var word = l.Contains("explored") || l.Contains("discover") || l.Contains("found") ? UI.Jp.Found
                : l.Contains("record") || l.Contains("milestone") || l.Contains("best") ? UI.Jp.Best
                : l.Contains("complete") || l.Contains("done") || l.Contains("unlocked") ? UI.Jp.Done
                : l.Contains("daily") ? UI.Jp.Daily : "";
            _toastStamp.style.display = word != "" ? DisplayStyle.Flex : DisplayStyle.None;
            if (word == "") return;
            _toastStamp.Word = word;
            _toastStamp.Stamp(Core.GameOptions.ReducedMotion);
        }

        void OnEarned(int amount, string reason)
        {
            _sparksUntil = Time.unscaledTime + sparksSeconds;
            Audio.Sfx.Play("Bell_Sparks", 0.6f);
            // A toast that already names the reward (region, discovery) needs no second line.
            if (_held || _toasts.Count > 0 || Time.time < _toastUntil) return;
            _banner.text = $"+{amount} Sparks · {reason}";
            _bannerUntil = Time.time + toastSeconds;
        }

        void Update()
        {
            if (_root == null) return;
            if (_saved != null && _savedUntil > 0f && Time.unscaledTime >= _savedUntil)
            {
                _saved.style.display = DisplayStyle.None;
                _savedUntil = 0f;
            }
            if (!_touchSeen && UnityEngine.InputSystem.Touchscreen.current != null
                && UnityEngine.InputSystem.Touchscreen.current.primaryTouch.press.isPressed)
            {
                _touchSeen = true;
                RefreshPrompt();
                Place();
            }
            UpdateDrift();
            TickResult();
            UpdateCar();
            UpdateMap();
            if (wallet != null)
            {
                _sparks.text = $"{wallet.Balance:N0} Sparks";
                var show = Time.unscaledTime < _sparksUntil || _savedUntil > 0f;
                _sparks.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
            }

            if (Time.time >= _toastUntil)
            {
                var next = !_held && _toasts.Count > 0 ? _toasts.Dequeue() : "";
                ShowToastNow(next);
                if (next != "") { _toastUntil = Time.time + toastSeconds; Pop(_toastRow); }
            }
            _banner.style.display = Time.time < _bannerUntil ? DisplayStyle.Flex : DisplayStyle.None;
        }

        void UpdateDrift()
        {
            if (drift == null) return;
            var c = drift.Chain;
            var showChain = c.Active && c.Pending >= 1f;
            _driftBox.style.display = showChain ? DisplayStyle.Flex : DisplayStyle.None;
            if (showChain)
            {
                _points.text = c.Pending.ToString("N0");
                var mult = $"×{c.Multiplier}";
                if (_mult.text != mult) { _mult.text = mult; Pop(_mult, 1.5f); }
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

        void UpdateCar()
        {
            var car = player != null && player.Current == PlayerModeController.Mode.Driving ? player.Car : null;
            // On foot: no rpm, speed or nitro (ASTRA §10).
            _instrument.style.display = car != null && !CockpitShowsSpeed ? DisplayStyle.Flex : DisplayStyle.None;
            if (car == null)
            {
                _arrow.style.display = _goal.style.display = DisplayStyle.None;
                _lines.Tick(0f, 0f, false, Time.deltaTime);
                _burstTag.style.display = DisplayStyle.None;
                return;
            }
            var g = car.Gearbox;
            var t = car.Telemetry;
            _lines.Tick(Mathf.InverseLerp(26f, 62f, t.speed), t.burst, t.boosting, Time.deltaTime);
            // "NITRO BURST" pops at the kick and fades with the burst.
            if (t.burst > 0.97f && _burstShown <= 0f) { _burstTag.style.display = DisplayStyle.Flex; Pop(_burstTag, 1.6f); }
            _burstShown = t.burst;
            _burstTag.style.opacity = Mathf.Clamp01(t.burst * 1.6f);
            if (t.burst <= 0f) _burstTag.style.display = DisplayStyle.None;
            _instrument.Set(g.Rpm, g.Spec.redline, g.Spec.limiter, Vehicles.Gearbox.Label(g.Gear), GameOptions.Speed(t.speed), GameOptions.SpeedUnit, t.boost, t.boosting);
            // The race checkpoint, else the player's waypoint (cleared on arrival).
            Vector3? aim = _target;
            if (!aim.HasValue && map != null && map.Waypoint.HasValue)
            {
                var w = map.Waypoint.Value;
                var p = car.transform.position;
                // Auto-drive (D49) owns its waypoint: it clears it when the car has stopped there.
                if (new Vector2(w.x - p.x, w.y - p.z).magnitude < 30f && !AutoDrive.IsActive) map.Waypoint = null;
                else aim = new Vector3(w.x, p.y, w.y);
            }
            // The label belongs to the waypoint, not to race checkpoints (the race panel names those).
            var labelled = !_target.HasValue && aim.HasValue;
            if (labelled)
            {
                var flat = new Vector2(aim.Value.x - car.transform.position.x, aim.Value.z - car.transform.position.z);
                var named = _goalAt.HasValue && map.Waypoint == _goalAt && _goalTitle != "";
                var text = named ? $"{_goalTitle} · {GameOptions.Distance(flat.magnitude)}" : GameOptions.Distance(flat.magnitude);
                if (_goal.text != text) _goal.text = text;
            }
            _goal.style.display = labelled ? DisplayStyle.Flex : DisplayStyle.None;
            if (aim.HasValue)
            {
                var cam = Camera.main;
                var to = aim.Value - car.transform.position;
                var fwd = cam != null ? cam.transform.forward : car.transform.forward;
                var ang = Vector3.SignedAngle(new Vector3(fwd.x, 0f, fwd.z), new Vector3(to.x, 0f, to.z), Vector3.up);
                _arrow.style.rotate = new Rotate(new Angle(ang, AngleUnit.Degree));
                var size = UiPanel.Size;
                _arrow.style.left = size.x * 0.5f - _arrow.resolvedStyle.width * 0.5f;
                _arrow.style.top = size.y * (UiPanel.IsPortrait ? 0.42f : 0.36f);
                _arrow.style.display = DisplayStyle.Flex;
                if (labelled)
                {
                    _goal.style.left = 0;
                    _goal.style.right = 0;
                    _goal.style.top = size.y * (UiPanel.IsPortrait ? 0.42f : 0.36f) + _arrow.resolvedStyle.height + 6f;
                }
            }
            else _arrow.style.display = DisplayStyle.None;
        }

        void UpdateMap()
        {
            if (_minimap == null || map == null) return;
            var driving = map.Driving;
            var kmh = driving && player.Car != null ? player.Car.Telemetry.speed * 3.6f : 0f;
            var target = !driving ? minimapSpan.y : Mathf.Lerp(minimapSpan.x, minimapSpan.z, Mathf.InverseLerp(fastKmh - 40f, fastKmh, kmh));
            _span = _span <= 0f ? target : Mathf.Lerp(_span, target, 1f - Mathf.Exp(-Time.unscaledDeltaTime * 2f)); // expands smoothly
            var p = map.PlayerPosition;
            _minimap.Look(new Vector2(p.x, p.z), _span);
            map.CollectPins(_pins, MapFilter.All, minimap: true);
            _minimap.SetPins(_pins);
            var guide = RouteGuide.Instance;
            if (guide != null) _minimap.SetRoute(guide.Path, guide.Version);
            var rw = map.RegionWatch;
            if (rw != null && rw.Current >= 0)
            {
                var title = rw.Regions.regions[rw.Current].title;
                if (_region.text != title) { _region.text = title.ToUpperInvariant(); _regionJp.text = UI.Jp.Region(title); }
            }
        }

        void DrawArrow(MeshGenerationContext ctx)
        {
            var r = _arrow.contentRect;
            var p = ctx.painter2D;
            var c = r.center;
            var s = r.width * 0.5f;
            p.fillColor = new Color(0.4f, 0.84f, 0.96f, 0.95f);
            p.strokeColor = new Color(0.02f, 0.08f, 0.1f, 0.8f);
            p.lineWidth = 2f;
            p.BeginPath();
            p.MoveTo(c + new Vector2(0f, -s));
            p.LineTo(c + new Vector2(s * 0.75f, s * 0.7f));
            p.LineTo(c + new Vector2(0f, s * 0.35f));
            p.LineTo(c + new Vector2(-s * 0.75f, s * 0.7f));
            p.ClosePath();
            p.Fill();
            p.Stroke();
        }

        static void Fill(VisualElement e)
        {
            e.style.position = Position.Absolute;
            e.style.left = e.style.right = e.style.top = e.style.bottom = 0;
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
            l.AddToClassList("jm-hud-text"); // Barlow SemiBold (Game.uss), not a synthesized bold
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.style.textShadow = new TextShadow { offset = new Vector2(0f, 2f), blurRadius = 6f, color = new Color(0f, 0f, 0f, 0.8f) };
            parent.Add(l);
            return l;
        }
    }
}
