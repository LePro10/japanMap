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
        /// <summary>The page keeps to the left so the car can be seen on the right (MenuCamera).</summary>
        public virtual bool Narrow => false;
    }

    /// <summary>
    /// The menu (ASTRA §10): Escape pauses **everything** (time, physics, sound — UI sounds excepted) and opens it.
    /// Desktop: 184 px left rail with the six destinations and a large Continue at the bottom; phone: Continue above
    /// a bottom row of six icon tabs. The world stays visible behind; Back returns one level, closing the root
    /// resumes. Tab opens Records, M opens the Map, P photo mode. UI Toolkit, theme Data/UI/Game.uss (D05).
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
        VisualElement _root, _rail, _tabs, _content, _body;
        Button _continue;
        readonly List<MenuScreen> _screens = new();
        readonly List<VisualElement> _tabButtons = new();
        InputAction _menu, _records, _map, _prevTab, _nextTab;
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
            BuildShell();
            _menu.Enable();
            _menu.performed += OnMenuKey;
            _prevTab.Enable();
            _prevTab.performed += OnPrevTab;
            _nextTab.Enable();
            _nextTab.performed += OnNextTab;
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
            if (_records != null) _records.performed -= OnRecordsKey;
            if (_map != null) _map.performed -= OnMapKey;
            UiPanel.Changed -= OnLayout;
            if (IsOpen) Close();
        }

        void OnDestroy()
        {
            Core.Save.SaveSync.ConflictRaised -= OnConflict;
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
                OpenChanged?.Invoke(true);
            }
            Show(screen ?? Current ?? (_screens.Count > 0 ? _screens[0] : null));
        }

        bool _suspendedByMe, _paused;
        /// <summary>The garage opens the menu while it holds the player itself.</summary>
        public bool AllowOverSuspended { get; set; }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
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
            if (hud != null) hud.Hidden = false;
            if (_suspendedByMe && player != null) player.SetSuspended(false);
            _suspendedByMe = false;
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
            if (Current != null && Current != screen) Current.Closed();
            Current = screen;
            // Pages that leave the right side to the car (MenuCamera); the map and lists need the whole width.
            _root.EnableInClassList("jm-page--narrow", screen is PlayScreen || screen.Narrow);
            for (var i = 0; i < _screens.Count; i++) Ui.On(_tabButtons[i], _screens[i] == screen, "jm-tab--on");
            Rebuild();
        }

        /// <summary>Rebuilds the current page (after a purchase, a setting change).</summary>
        public void Rebuild()
        {
            if (_body == null || Current == null) return;
            _root.EnableInClassList("jm-page--narrow", Current is PlayScreen || Current.Narrow);
            _body.Clear();
            Current.Build(_body);
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
            _root.Clear();
            var safe = UiPanel.Safe;
            _root.style.paddingLeft = safe.x;
            _root.style.paddingTop = safe.y;
            _root.style.paddingRight = safe.z;
            _root.style.paddingBottom = safe.w;
            var shell = Ui.Box(_root, "jm-shell");
            _rail = Ui.Box(shell, "jm-rail");
            _content = Ui.Box(shell, "jm-content");
            var scroll = new ScrollView(ScrollViewMode.Vertical) { horizontalScrollerVisibility = ScrollerVisibility.Hidden };
            scroll.style.flexGrow = 1;
            _content.Add(scroll);
            _body = scroll.contentContainer;

            _continue = Ui.Button(null, "Resume", Close, "jm-btn--primary", "jm-continue");
            _tabs = Ui.Box(null, "jm-tabs");
            _tabButtons.Clear();
            foreach (var s in _screens)
            {
                var screen = s;
                var tab = new Button(() => { Audio.Sfx.Play("UI_Click"); Show(screen); }) { name = "tab-" + s.Title.ToLowerInvariant() };
                tab.text = "";
                tab.AddToClassList("jm-tab");
                tab.Add(new UiIcon(s.Icon, UiPanel.IsPhone ? 22f : 24f));
                tab.Add(new Label((UiPanel.IsPhone ? s.Short : s.Title).ToUpperInvariant()) { pickingMode = PickingMode.Ignore });
                _tabs.Add(tab);
                _tabButtons.Add(tab);
            }
            if (UiPanel.IsPortrait)
            {
                _rail.Add(_continue);
                _rail.Add(_tabs);
            }
            else
            {
                if (!UiPanel.IsPhone)
                {
                    Ui.Text(_rail, Application.productName.ToUpperInvariant(), "jm-brand");
                    Ui.Text(_rail, "BLUE HOUR AFTER THE RAIN", "jm-brand-sub");
                }
                // Resume first: it is what most players open the menu for (and where their eye starts).
                _rail.Add(_continue);
                _rail.Add(_tabs);
            }
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

        static Texture2D _backdrop;

        /// <summary>Horizontal fade: 92 % ink under the rail and text, 30 % at the right edge.</summary>
        static Texture2D Backdrop()
        {
            if (_backdrop != null) return _backdrop;
            const int w = 256;
            _backdrop = new Texture2D(w, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "MenuBackdrop" };
            for (var x = 0; x < w; x++)
            {
                var t = x / (float)(w - 1);
                var a = Mathf.Lerp(0.92f, 0.3f, Mathf.SmoothStep(0.25f, 0.95f, t));
                _backdrop.SetPixel(x, 0, new Color(0.012f, 0.035f, 0.05f, a));
            }
            _backdrop.Apply();
            return _backdrop;
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
