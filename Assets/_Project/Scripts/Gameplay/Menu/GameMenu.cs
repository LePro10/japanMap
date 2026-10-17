using System;
using System.Collections.Generic;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Records;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>One page of the menu (Play, Cars, Map, Records, Photo, Settings).</summary>
    public abstract class MenuScreen
    {
        public abstract string Title { get; }
        public virtual string Short => Title;
        public abstract Icon Icon { get; }
        public GameMenu Menu { get; internal set; }
        /// <summary>Builds the page into an empty body; called on every visit.</summary>
        public abstract void Build(VisualElement body);
        /// <summary>One level back inside the page (detail → list). False = nothing to go back to.</summary>
        public virtual bool Back() => false;
        public virtual void Closed() { }
        /// <summary>Visible text of the page (tests read what the player reads).</summary>
        public virtual string Text => "";
        /// <summary>Tab does not open a page but an action (Photo).</summary>
        public virtual bool Action => false;
        public virtual void Update() { }
        /// <summary>The page keeps to a glass column on the left so the car can be seen on the right (MenuCamera).
        /// Every page but the map (owner 2026-10-17: "das Menü überdeckt das Auto").</summary>
        public virtual bool Narrow => true;
        /// <summary>The career can lock the whole tab (padlock on the tab, "Unlocks: …" on a click). Null = always open.</summary>
        public virtual Core.FeatureId? Feature => Title == "Records" ? Core.FeatureId.Records : null;
    }

    /// <summary>
    /// The menu (ASTRA §10, redone D48): Escape pauses **everything** (time, physics, sound — UI sounds excepted) and
    /// opens it. Desktop: one top bar — name · Q tabs E with a sliding marker · Sparks · Resume — the page as a column of
    /// big tiles on the left, the car turning on the right (MenuCamera), key hints at the foot. Phone: Resume above a
    /// bottom row of icon tabs. Pages slide in from the side they come from, tiles rise in staggered; arrows / d-pad
    /// move the focus between tiles (A / Enter selects), Q / E or the shoulders switch tabs. Locked tabs and tiles
    /// (<see cref="Core.Unlocks"/>) show a padlock. Back returns one level, closing the root resumes. Tab opens
    /// Records, M the Map, P photo mode. UI Toolkit, theme Data/UI/Game.uss + Menu.uss (D05).
    /// </summary>
    [DefaultExecutionOrder(100)]
    public sealed class GameMenu : MonoBehaviour
    {
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] StyleSheet theme;
        [SerializeField] PlayerModeController player;
        [SerializeField] GameplayHud hud;
        [SerializeField] InputActionAsset actions;
        [Header("Pages")]
        [SerializeField] Progress.PlayerProgress progress;
        [SerializeField] Races.RaceDirector races;
        [SerializeField] Travel travel;
        [SerializeField] Garage.GarageSystem garage;
        [SerializeField] RecordsSheet records;
        [SerializeField] PhotoMode photo;
        [SerializeField] Regions.RegionWatch regions;
        [SerializeField] Map.MapSystem map;

        UIDocument _doc;
        VisualElement _root, _rail, _tabs, _content, _body, _marker, _page;
        Label _notice;
        Button _continue;
        int _shownIndex = -1;
        readonly List<MenuScreen> _screens = new();
        readonly List<VisualElement> _tabButtons = new();
        InputAction _menu, _records, _map, _prevTab, _nextTab, _submit;
        readonly InputAction[] _nav = new InputAction[4];
        static readonly Vector2[] NavDirs = { Vector2.down, Vector2.up, Vector2.left, Vector2.right }; // panel y is down
        bool _ownSubmit;
        float _savedScale = 1f;
        FormFactor _builtFor;
        bool _builtTall;

        public bool IsOpen { get; private set; }
        public MenuScreen Current { get; private set; }
        public IReadOnlyList<MenuScreen> Screens => _screens;
        public StyleSheet Theme => theme;
        public PanelSettings Panel => panelSettings;
        public PlayerModeController Player => player;
        public GameplayHud Hud => hud;
        public Progress.PlayerProgress Progress => progress;
        public TitleScreen Title { get; private set; }
        public VisualElement Root => _root;
        /// <summary>Text of the open page.</summary>
        public string Text => IsOpen && Current != null ? Current.Text : "";
        public event Action<bool> OpenChanged;

        public static GameMenu Instance { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = null;

        public void Add(MenuScreen screen)
        {
            screen.Menu = this;
            _screens.Add(screen);
            if (_root != null) BuildShell();
        }

        public T Screen<T>() where T : MenuScreen => _screens.Find(s => s is T) as T;

        void Awake()
        {
            Instance = this;
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panelSettings);
            _doc.sortingOrder = 20;
            // Actions so a short press between two frames counts (play scripts, tests).
            _menu = new InputAction("Menu", InputActionType.Button, "<Keyboard>/escape");
            _menu.AddBinding("<Gamepad>/start");
            // Actions too: a press between two frames still counts.
            _prevTab = new InputAction("MenuPrevTab", InputActionType.Button, "<Keyboard>/q");
            _prevTab.AddBinding("<Gamepad>/leftShoulder");
            _nextTab = new InputAction("MenuNextTab", InputActionType.Button, "<Keyboard>/e");
            _nextTab.AddBinding("<Gamepad>/rightShoulder");
            // Own focus moves (arrows, d-pad, stick) and select (Enter, A): UI Toolkit's default ring is linear and its
            // event system is suppressed on the root, so one press moves exactly once — also where it sends nothing.
            var navKeys = new[] { new[] { "<Keyboard>/upArrow", "<Gamepad>/dpad/up", "<Gamepad>/leftStick/up" },
                new[] { "<Keyboard>/downArrow", "<Gamepad>/dpad/down", "<Gamepad>/leftStick/down" },
                new[] { "<Keyboard>/leftArrow", "<Gamepad>/dpad/left", "<Gamepad>/leftStick/left" },
                new[] { "<Keyboard>/rightArrow", "<Gamepad>/dpad/right", "<Gamepad>/leftStick/right" } };
            for (var i = 0; i < 4; i++)
            {
                _nav[i] = new InputAction($"MenuNav{i}", InputActionType.Button);
                foreach (var b in navKeys[i]) _nav[i].AddBinding(b);
            }
            _submit = new InputAction("MenuSubmit", InputActionType.Button, "<Keyboard>/enter");
            _submit.AddBinding("<Keyboard>/numpadEnter");
            _submit.AddBinding("<Gamepad>/buttonSouth");
            UiPanel.UserScale = UiPanel.Scales[Core.GameOptions.UiScale];
            Ui.Clicked += () => Audio.Sfx.Play("UI_Click");
            if (actions != null)
            {
                // Saved key bindings (Settings → Controls) before anything reads the actions.
                if (!string.IsNullOrEmpty(Core.GameOptions.Bindings))
                    try { actions.LoadBindingOverridesFromJson(Core.GameOptions.Bindings); }
                    catch (Exception e) { Debug.LogWarning($"[Menu] saved key bindings ignored: {e.Message}"); }
                var map = actions.FindActionMap("Player", true);
                _records = map.FindAction("Records", false);
                _map = map.FindAction("Map", false);
            }
        }

        void Start()
        {
            // The six destinations in ASTRA order: Play, Cars, Map, Records, Photo, Settings.
            Add(new PlayScreen(progress, races, travel, garage));
            if (garage != null) Add(garage.Screen);
            Add(new MapScreen(map, travel));
            if (records != null) Add(records.Screen);
            if (photo != null) Add(new PhotoScreen(photo));
            Add(new SettingsScreen(actions, progress));
            // Two saves disagree (found at boot or after a login): the choice comes first (ASTRA §9).
            Core.Save.SaveSync.ConflictRaised += OnConflict;
            if (Core.Save.SaveSync.Pending != null) OnConflict(Core.Save.SaveSync.Pending);
            Core.Unlocks.Changed += OnUnlocks;
            // The title is the first picture once the world is ready (it decides itself whether it shows).
            Title = TitleScreen.Create(this);
        }

        void OnUnlocks()
        {
            if (_root == null) return;
            BuildShell();
        }

        void OnConflict(Core.Save.SaveConflict _) => SettingsScreen.ShowChoice(this);

        void OnEnable()
        {
            _root = _doc.rootVisualElement;
            _root.Clear();
            if (theme != null) _root.styleSheets.Add(theme);
            _root.AddToClassList("jm-fill");
            _root.AddToClassList("jm-menu");
            // Dark behind the rail and the text, clear on the right where the car turns (MenuCamera).
            _root.style.backgroundImage = new StyleBackground(Backdrop());
            _root.style.display = DisplayStyle.None;
            // Arrows / d-pad / stick: from tile to tile by position, not tree order (UI Toolkit's own ring is linear).
            _root.RegisterCallback<NavigationMoveEvent>(OnNavigate, TrickleDown.TrickleDown);
            _root.RegisterCallback<NavigationSubmitEvent>(OnNavigateSubmit, TrickleDown.TrickleDown);
            BuildShell();
            _menu.Enable();
            _menu.performed += OnMenuKey;
            _prevTab.Enable();
            _prevTab.performed += OnPrevTab;
            _nextTab.Enable();
            _nextTab.performed += OnNextTab;
            for (var i = 0; i < 4; i++) { _nav[i].Enable(); _nav[i].performed += OnNav; }
            _submit.Enable();
            _submit.performed += OnSubmit;
            if (_records != null) { _records.Enable(); _records.performed += OnRecordsKey; }
            if (_map != null) { _map.Enable(); _map.performed += OnMapKey; }
            UiPanel.Changed += OnLayout;
        }

        void OnDisable()
        {
            _menu.performed -= OnMenuKey;
            _menu.Disable();
            _prevTab.performed -= OnPrevTab;
            _prevTab.Disable();
            _nextTab.performed -= OnNextTab;
            _nextTab.Disable();
            for (var i = 0; i < 4; i++) { _nav[i].performed -= OnNav; _nav[i].Disable(); }
            _submit.performed -= OnSubmit;
            _submit.Disable();
            if (_records != null) _records.performed -= OnRecordsKey;
            if (_map != null) _map.performed -= OnMapKey;
            UiPanel.Changed -= OnLayout;
            if (IsOpen) Close();
        }

        void OnDestroy()
        {
            Core.Save.SaveSync.ConflictRaised -= OnConflict;
            Core.Unlocks.Changed -= OnUnlocks;
            if (Instance == this) Instance = null;
            // The scene's UI goes with the menu: no close action of a destroyed overlay may stay on the stack.
            UiStack.Clear();
        }

        void OnMenuKey(InputAction.CallbackContext _) => Escape();
        void OnPrevTab(InputAction.CallbackContext _) => StepTab(-1);
        void OnNextTab(InputAction.CallbackContext _) => StepTab(1);
        void OnRecordsKey(InputAction.CallbackContext _) => Toggle<RecordsScreen>();
        void OnMapKey(InputAction.CallbackContext _) => Toggle<MapScreen>();

        void Toggle<T>() where T : MenuScreen
        {
            if (IsOpen && Current is T) Close();
            else if (UiStack.Count == 0 || IsOpen) Open<T>();
        }

        /// <summary>Escape: closes the top overlay or page level; with nothing open, opens the menu.</summary>
        public void Escape()
        {
            if (UiStack.Count > 0 && !ReferenceEquals(UiStack.Top, this)) { UiStack.Back(); return; }
            if (!IsOpen) { Open(); return; }
            if (Current != null && Current.Back()) return;
            Close();
        }

        void OnLayout()
        {
            if (_builtFor != UiPanel.Form) BuildShell();
            // A tablet turned while a page is open: pages that lay out by the window's shape (the map) build again.
            else if (IsOpen && _builtTall != UiPanel.Size.y > UiPanel.Size.x) Rebuild();
            _builtTall = UiPanel.Size.y > UiPanel.Size.x;
        }

        public void Open<T>() where T : MenuScreen
        {
            var s = Screen<T>();
            if (s != null) Open(s);
        }

        /// <summary>Escape while the menu is open without pause (garage): now it pauses too.</summary>
        public bool Paused => IsOpen && _paused;

        /// <summary>Opens the menu on a page. <paramref name="pause"/> false: the world runs on behind it (the Open Bay is a
        /// place in the world, entered with E — only Escape pauses everything).</summary>
        public void Open(MenuScreen screen = null, bool pause = true)
        {
            if (player != null && player.Suspended && !IsOpen && !AllowOverSuspended) return; // photo mode, garage own the screen
            if (!IsOpen)
            {
                IsOpen = true;
                _paused = pause;
                if (pause)
                {
                    _savedScale = Time.timeScale;
                    Time.timeScale = 0f;
                    AudioListener.pause = true;
                }
                if (player != null && !player.Suspended) { player.SetSuspended(true); _suspendedByMe = true; }
                if (hud != null) hud.Hidden = true;
                _root.style.display = DisplayStyle.Flex;
                _root.RemoveFromClassList("jm-menu--in");
                // Next frame: from display none a transition has no start value.
                _root.schedule.Execute(() => _root.AddToClassList("jm-menu--in"));
                UnityEngine.Cursor.lockState = CursorLockMode.None;
                UnityEngine.Cursor.visible = true;
                UiStack.Push(this, Close);
                Audio.Sfx.Play("UI_Click", 0.7f);
                OpenChanged?.Invoke(true);
            }
            Show(screen ?? Current ?? (_screens.Count > 0 ? _screens[0] : null));
        }

        /// <summary>Settings over the title: only that page, Back returns to the title (no tabs, no Sparks).</summary>
        public void OpenFromTitle()
        {
            var settings = Screen<SettingsScreen>();
            if (settings == null) return;
            _fromTitle = true;
            _root.AddToClassList("jm-menu--title");
            if (_continue != null) _continue.text = "Back";
            AllowOverSuspended = true;
            Open(settings, pause: false);
            AllowOverSuspended = false;
        }

        bool _fromTitle;
        /// <summary>The menu shows over the title (Settings only).</summary>
        public bool FromTitle => _fromTitle;

        bool _suspendedByMe, _paused;
        /// <summary>The garage opens the menu while it holds the player itself.</summary>
        public bool AllowOverSuspended { get; set; }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            _shownIndex = -1;
            Current?.Closed();
            _root.style.display = DisplayStyle.None;
            _root.RemoveFromClassList("jm-menu--in");
            UiStack.Pop(this);
            if (_paused)
            {
                Time.timeScale = _savedScale <= 0f ? 1f : _savedScale;
                AudioListener.pause = false;
            }
            _paused = false;
            if (hud != null && !_fromTitle) hud.Hidden = false;
            if (_suspendedByMe && player != null) player.SetSuspended(false);
            _suspendedByMe = false;
            if (_fromTitle)
            {
                _fromTitle = false;
                _root.RemoveFromClassList("jm-menu--title");
                if (_continue != null) _continue.text = "Resume";
                Title?.Refocus();
            }
            Audio.Sfx.Play("UI_Click", 0.5f);
            OpenChanged?.Invoke(false);
        }

        public void Show(MenuScreen screen)
        {
            if (screen == null) return;
            if (screen.Action)
            {
                Close();
                screen.Build(null);
                return;
            }
            if (screen.Feature.HasValue && !Core.Unlocks.IsUnlocked(screen.Feature.Value))
            {
                var tab = _tabButtons[_screens.IndexOf(screen)];
                MenuTiles.Deny(tab, screen.Feature.Value);
                if (Current != null && Current != screen) return;
                screen = _screens[0]; // opened straight onto a locked page (M for a locked map): Play instead
            }
            var index = _screens.IndexOf(screen);
            var changed = Current != screen;
            if (Current != null && changed) Current.Closed();
            Current = screen;
            // Pages that leave the right side to the car (MenuCamera); the map and lists need the whole width.
            SetPageWidth(screen);
            for (var i = 0; i < _screens.Count; i++) Ui.On(_tabButtons[i], _screens[i] == screen, "jm-tab--on");
            MoveMarker();
            Rebuild();
            if (changed && _page != null)
            {
                // From the side the tab lies on (Q left, E right), as the eye expects; first open rises from below.
                var cls = _shownIndex < 0 ? "jm-page--from-below" : index > _shownIndex ? "jm-page--from-right" : "jm-page--from-left";
                if (!Core.GameOptions.ReducedMotion)
                {
                    _page.AddToClassList(cls);
                    _page.schedule.Execute(() => _page.RemoveFromClassList(cls)).ExecuteLater(16);
                }
            }
            _shownIndex = index;
        }

        /// <summary>The sliding line under the open tab (desktop top bar).</summary>
        void MoveMarker()
        {
            if (_marker == null || Current == null) return;
            var i = _screens.IndexOf(Current);
            if (i < 0 || i >= _tabButtons.Count) return;
            var tab = _tabButtons[i];
            void Place()
            {
                var w = tab.layout.width;
                if (w < 1f) return;
                _marker.style.left = tab.layout.x + 14f;
                _marker.style.width = w - 28f;
            }
            Place();
            // Fresh shell: the tabs have no layout yet.
            tab.RegisterCallback<GeometryChangedEvent>(_ => { if (Current != null && _tabButtons.IndexOf(tab) == _screens.IndexOf(Current)) Place(); });
        }

        /// <summary>A short line over the menu (locked tab, no ad): goes by itself.</summary>
        public void Notice(string text)
        {
            if (_notice == null || string.IsNullOrEmpty(text)) return;
            _notice.text = text;
            _notice.AddToClassList("jm-notice--on");
            _notice.schedule.Execute(() => _notice.RemoveFromClassList("jm-notice--on")).ExecuteLater(2200);
            NoticeText = text;
        }

        /// <summary>Last notice shown (tests).</summary>
        public string NoticeText { get; private set; } = "";

        /// <summary>
        /// Directional focus: the nearest target whose centre lies in the pressed direction, weighting sideways distance
        /// double — so ↓ from a half tile goes to the tile below, not the one diagonally across.
        /// </summary>
        void OnNavigate(NavigationMoveEvent e)
        {
            // ←→ on a slider change its value (UI Toolkit's own handling); every other move is ours (OnNav).
            var slider = _root.panel?.focusController?.focusedElement is Slider;
            if (slider && (e.direction == NavigationMoveEvent.Direction.Left || e.direction == NavigationMoveEvent.Direction.Right)) return;
            e.StopPropagation();
            _root.focusController?.IgnoreEvent(e);
        }

        void OnNavigateSubmit(NavigationSubmitEvent e)
        {
            if (_ownSubmit) return;
            e.StopPropagation(); // Enter / A select through OnSubmit, once
            _root.focusController?.IgnoreEvent(e);
        }

        void OnNav(InputAction.CallbackContext c)
        {
            if (!IsOpen || _root.panel?.focusController?.focusedElement is TextField) return;
            var dir = NavDirs[System.Array.IndexOf(_nav, c.action)];
            if (dir.x != 0f && _root.panel?.focusController?.focusedElement is Slider) return;
            if (Move(dir)) Audio.Sfx.Play("UI_Click", 0.3f);
        }

        void OnSubmit(InputAction.CallbackContext _)
        {
            if (!IsOpen || !(_root.panel?.focusController?.focusedElement is Button b) || !b.enabledInHierarchy) return;
            // The button's own path (Clickable answers a submit), so locks and sounds behave as on a click.
            _ownSubmit = true;
            using (var e = NavigationSubmitEvent.GetPooled())
            {
                e.target = b;
                b.SendEvent(e);
            }
            _ownSubmit = false;
        }

        /// <summary>Moves the focus one step (y down is +). False when nothing lies that way.</summary>
        public bool Move(Vector2 dir)
        {
            var targets = MenuTiles.Targets(_root);
            if (targets.Count == 0) return false;
            var from = _root.panel?.focusController?.focusedElement as VisualElement;
            if (from == null || !targets.Contains(from))
            {
                (_body != null ? MenuTiles.Targets(_body).Find(_ => true) ?? targets[0] : targets[0]).Focus();
                return true;
            }
            var a = from.worldBound.center;
            VisualElement best = null;
            var bestScore = float.MaxValue;
            foreach (var t in targets)
            {
                if (t == from) continue;
                var d = t.worldBound.center - a;
                var along = Vector2.Dot(d, dir);
                if (along < 4f) continue;
                var side = Mathf.Abs(dir.x != 0f ? d.y : d.x);
                var score = along + 2f * side;
                if (score < bestScore) { bestScore = score; best = t; }
            }
            if (best == null) return false;
            best.Focus();
            if (best.parent != null) (best.GetFirstAncestorOfType<ScrollView>())?.ScrollTo(best);
            return true;
        }

        /// <summary>Rebuilds the current page (after a purchase, a setting change).</summary>
        public void Rebuild()
        {
            if (_body == null || Current == null) return;
            SetPageWidth(Current);
            RefreshSparks();
            _body.Clear();
            Current.Build(_body);
            MenuTiles.Stagger(_body);
        }

        Label _sparks;

        void SetPageWidth(MenuScreen screen)
        {
            var narrow = screen is PlayScreen || screen.Narrow;
            _root.EnableInClassList("jm-page--narrow", narrow);
            _root.EnableInClassList("jm-page--wide", !narrow);
            // Narrow: dark only behind the column, the right half clear for the car. Wide (map): evenly dark.
            // Phones upright: clear at the top (the car's window), ink from where the page starts.
            _root.style.backgroundImage = new StyleBackground(narrow && UiPanel.IsPortrait ? BackdropTall() : Backdrop(narrow && !UiPanel.IsPortrait));
        }

        /// <summary>Share of the screen width the open page covers from the left (0 = none, 1 = all) — MenuCamera puts
        /// the car in the middle of what is left.</summary>
        public float CoveredShare
        {
            get
            {
                if (!IsOpen || _content == null || Current == null) return 0f;
                if (!(Current is PlayScreen || Current.Narrow)) return 1f;
                if (UiPanel.IsPortrait) return 0f; // phones upright: the page is below, the car above
                var w = _root.resolvedStyle.width;
                return w > 1f ? Mathf.Clamp01(_content.worldBound.xMax / w) : 0.45f;
            }
        }

        void RefreshSparks()
        {
            if (_sparks != null && progress != null) _sparks.text = $"{progress.Wallet.Balance:N0} Sparks";
        }

        void BuildShell()
        {
            if (_root == null) return;
            _builtFor = UiPanel.Form;
            _builtTall = UiPanel.Size.y > UiPanel.Size.x;
            _root.EnableInClassList("jm-phone", UiPanel.IsPhone);
            _root.EnableInClassList("jm-portrait", UiPanel.IsPortrait);
            _root.EnableInClassList("jm-landscape", UiPanel.Form == FormFactor.PhoneLandscape);
            _root.EnableInClassList("jm-desktop", !UiPanel.IsPhone);
            _root.EnableInClassList("jm-calm", Core.GameOptions.ReducedMotion);
            _root.Clear();
            var safe = UiPanel.Safe;
            _root.style.paddingLeft = safe.x;
            _root.style.paddingTop = safe.y;
            _root.style.paddingRight = safe.z;
            _root.style.paddingBottom = safe.w;
            _sparks = null;
            _marker = null;
            var shell = Ui.Box(_root, "jm-shell");
            _rail = Ui.Box(shell, "jm-rail");
            _content = Ui.Box(shell, "jm-content");
            // The page slides as one (the scroll view inside keeps its own position).
            _page = Ui.Box(_content, "jm-pagewrap");
            var scroll = new ScrollView(ScrollViewMode.Vertical) { horizontalScrollerVisibility = ScrollerVisibility.Hidden };
            scroll.style.flexGrow = 1;
            _page.Add(scroll);
            _body = scroll.contentContainer;

            _continue = Ui.Button(null, _fromTitle ? "Back" : "Resume", Close, "jm-btn--primary", "jm-continue");
            _continue.name = "menu-resume";
            _tabs = Ui.Box(null, "jm-tabs");
            _tabButtons.Clear();
            foreach (var s in _screens)
            {
                var screen = s;
                var tab = new Button(() => { Audio.Sfx.Play("UI_Click"); Show(screen); }) { name = "tab-" + s.Title.ToLowerInvariant() };
                tab.text = "";
                tab.AddToClassList("jm-tab");
                tab.Add(new UiIcon(s.Icon, UiPanel.IsPhone ? 22f : 22f));
                tab.Add(new Label((UiPanel.IsPhone ? s.Short : s.Title).ToUpperInvariant()) { pickingMode = PickingMode.Ignore });
                if (s.Feature.HasValue && !Core.Unlocks.IsUnlocked(s.Feature.Value))
                {
                    tab.AddToClassList("jm-tab--locked");
                    var lockIcon = new UiIcon(Icon.Lock, 12f);
                    lockIcon.AddToClassList("jm-tab__lock");
                    tab.Add(lockIcon);
                }
                _tabs.Add(tab);
                _tabButtons.Add(tab);
            }
            if (UiPanel.IsPhone)
            {
                // Resume first: it is what most players open the menu for (and where their eye starts).
                _rail.Add(_continue);
                _rail.Add(_tabs);
            }
            else
            {
                // Desktop top bar: name · Q tabs E · Sparks · Resume — every destination visible in one line,
                // nothing over the car.
                var brand = Ui.Box(_rail, "jm-brandbox");
                Ui.Text(brand, Application.productName.ToUpperInvariant(), "jm-brand");
                Ui.Text(brand, "BLUE HOUR AFTER THE RAIN", "jm-brand-sub");
                var tabRow = Ui.Row(_rail, "jm-tabrow");
                Ui.Text(tabRow, "Q", "jm-keyhint", "jm-keyhint--tab");
                var track = Ui.Box(tabRow, "jm-tabtrack");
                track.Add(_tabs);
                _marker = Ui.Box(track, "jm-tabmarker");
                _marker.pickingMode = PickingMode.Ignore;
                Ui.Text(tabRow, "E", "jm-keyhint", "jm-keyhint--tab");
                Ui.Box(_rail).style.flexGrow = 1;
                var chip = Ui.Row(_rail, "jm-sparkchip");
                var spark = new UiIcon(Icon.Spark, 16f);
                spark.Tint = new Color(1f, 0.82f, 0.4f);
                chip.Add(spark);
                _sparks = Ui.Text(chip, "", "jm-sparks");
                RefreshSparks();
                _rail.Add(_continue);
                Ui.Text(_rail, "Esc", "jm-keyhint");
                // Foot: what the keys and pad do here (FH-style legend).
                var foot = Ui.Row(_root, "jm-legend");
                foot.pickingMode = PickingMode.Ignore;
                void Key(string k, string what)
                {
                    var h = Ui.Row(foot, "jm-legend__item");
                    Ui.Text(h, k, "jm-keyhint");
                    Ui.Text(h, what, "jm-legend__label");
                }
                Key("Q  E", "Switch tab");
                Key("↑ ↓ ← →", "Move");
                Key("Enter", "Select");
                Key("Esc", _fromTitle ? "Back" : "Resume");
            }
            _notice = Ui.Text(_root, "", "jm-notice");
            _notice.pickingMode = PickingMode.Ignore;
            if (Current != null) Show(Current);
        }

        void Update()
        {
            if (IsOpen) Current?.Update();
        }

        /// <summary>Q / E (and the shoulder buttons) step through the tabs, as in every racing game's menu.</summary>
        void StepTab(int step)
        {
            if (!IsOpen || _screens.Count == 0) return;
            if (garage != null && garage.IsOpen) return; // E drives out of the Open Bay there
            if (_root.panel?.focusController?.focusedElement is TextField) return;
            {
                var i = _screens.IndexOf(Current);
                for (var n = 0; n < _screens.Count; n++)
                {
                    i = (i + step + _screens.Count) % _screens.Count;
                    if (!_screens[i].Action) break; // Photo is an action, not a page
                }
                Audio.Sfx.Play("UI_Click");
                Show(_screens[i]);
            }
        }

        static Texture2D _backdrop, _backdropWide, _backdropTall;

        /// <summary>Vertical fade for phones upright: clear over the top fifth, 75 % ink below a third (row 0 = bottom).</summary>
        internal static Texture2D BackdropTall()
        {
            if (_backdropTall != null) return _backdropTall;
            const int h = 128;
            _backdropTall = new Texture2D(1, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "MenuBackdropTall" };
            for (var y = 0; y < h; y++)
            {
                var fromTop = 1f - y / (float)(h - 1);
                _backdropTall.SetPixel(0, y, new Color(0.01f, 0.03f, 0.05f, Mathf.Lerp(0f, 0.75f, Ui.Smooth(0.18f, 0.34f, fromTop))));
            }
            _backdropTall.Apply();
            return _backdropTall;
        }

        /// <summary>Horizontal fade. Narrow pages: 60 % ink behind the column, clear from 58 % of the width (the car).
        /// Wide pages: 72 % everywhere.</summary>
        internal static Texture2D Backdrop(bool narrow = true)
        {
            if (narrow && _backdrop != null) return _backdrop;
            if (!narrow && _backdropWide != null) return _backdropWide;
            const int w = 256;
            var tex = new Texture2D(w, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = narrow ? "MenuBackdrop" : "MenuBackdropWide" };
            for (var x = 0; x < w; x++)
            {
                var t = x / (float)(w - 1);
                var a = narrow ? Mathf.Lerp(0.62f, 0f, Ui.Smooth(0.3f, 0.58f, t)) : 0.72f;
                tex.SetPixel(x, 0, new Color(0.01f, 0.03f, 0.05f, a));
            }
            tex.Apply();
            return narrow ? _backdrop = tex : _backdropWide = tex;
        }

        // ── shared bits for the pages ──────────────────────────────────────────

        /// <summary>A sheet over the open page (purchase, confirmation): Back closes it.</summary>
        public VisualElement Sheet(string title, out Action close)
        {
            var dim = Ui.Box(_root, "jm-fill", "jm-center");
            dim.style.backgroundColor = new Color(0f, 0f, 0f, 0.5f);
            var sheet = Ui.Box(dim, "jm-panel", "jm-sheet");
            Ui.H1(sheet, title);
            var owner = new object();
            void Close()
            {
                dim.RemoveFromHierarchy();
                UiStack.Pop(owner);
            }
            UiStack.Push(owner, Close);
            close = Close;
            return sheet;
        }
    }
}
