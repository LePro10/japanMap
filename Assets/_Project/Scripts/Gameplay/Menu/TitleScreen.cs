using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Core.Platform;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Intro;
using JapanMap.UI;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// The title (D48): the first picture after the page's loading screen is the real world at blue hour — the camera
    /// drifts slowly around the player's car — with the name and one big START GAME (new player) or CONTINUE (a save),
    /// plus Settings. START into the intro: a diagonal wipe hides the jump to the coast; CONTINUE: the camera flies from
    /// the title shot into the chase camera and the car is drivable at once. No gameplayStart while it shows (it sits
    /// on the <see cref="UiStack"/>), and the first click also unlocks the browser's audio. Keyboard (↑↓ Enter), mouse,
    /// gamepad (d-pad, A / Start) and touch. Once per session. Styles: Data/UI/Title.uss.
    /// </summary>
    [DefaultExecutionOrder(1000)] // after the CinemachineBrain: the fly-in overrides its output
    public sealed class TitleScreen : MonoBehaviour
    {
        public enum State { Waiting, Shown, Starting, Done }

        /// <summary>The editor and its tests start without a title unless a test asks for it (like the intro).</summary>
        public static bool RunInEditor;
        static bool _shownThisSession;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            RunInEditor = false;
            _shownThisSession = false;
        }

        /// <summary>Tests boot several times in one play session: each may see the title again.</summary>
        internal static void ResetSession() => _shownThisSession = false;

        GameMenu _menu;
        FirstDrive _intro;
        IntroSettings _set;
        UIDocument _doc;
        VisualElement _root, _block, _wipe;
        Button _start, _settings;
        readonly List<Button> _buttons = new();
        InputAction _up, _down, _submit;
        CinemachineBrain _brain;
        Vector3 _fromPos;
        Quaternion _fromRot;
        float _fromFov, _t, _yaw, _savedFov;
        bool _intoIntro, _covered;

        public State Current { get; private set; } = State.Waiting;
        public bool Continue { get; private set; }
        public Button StartButton => _start;
        public Button SettingsButton => _settings;
        public VisualElement Root => _root;
        public static TitleScreen Instance { get; private set; }

        /// <summary>Built by the menu (it owns the theme, the panel and the player); no scene object needed.</summary>
        public static TitleScreen Create(GameMenu menu)
        {
            // Not under the menu: a UIDocument below another one is nested into it (and hidden with the closed menu).
            var go = new GameObject("Title");
            UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(go, menu.gameObject.scene);
            go.SetActive(false);
            var t = go.AddComponent<TitleScreen>();
            t._menu = menu;
            t._intro = FindAnyObjectByType<FirstDrive>();
            t._set = t._intro != null ? t._intro.Settings : null;
            // A new game scene (boot, a test, a save swap) starts undecided: the intro and gameplayStart wait for the title.
            StartFlow.Current = StartFlow.Phase.Loading;
            go.SetActive(true);
            return t;
        }

        void Awake()
        {
            Instance = this;
            _up = new InputAction("TitleUp", InputActionType.Button);
            foreach (var b in new[] { "<Keyboard>/upArrow", "<Keyboard>/w", "<Gamepad>/dpad/up", "<Gamepad>/leftStick/up" }) _up.AddBinding(b);
            _down = new InputAction("TitleDown", InputActionType.Button);
            foreach (var b in new[] { "<Keyboard>/downArrow", "<Keyboard>/s", "<Gamepad>/dpad/down", "<Gamepad>/leftStick/down" }) _down.AddBinding(b);
            _submit = new InputAction("TitleSubmit", InputActionType.Button);
            foreach (var b in new[] { "<Keyboard>/enter", "<Keyboard>/numpadEnter", "<Keyboard>/space", "<Gamepad>/buttonSouth", "<Gamepad>/start" }) _submit.AddBinding(b);
        }

        void OnEnable()
        {
            _up.performed += OnUp;
            _down.performed += OnDown;
            _submit.performed += OnSubmit;
            _up.Enable();
            _down.Enable();
            _submit.Enable();
        }

        void OnDisable()
        {
            _up.performed -= OnUp;
            _down.performed -= OnDown;
            _submit.performed -= OnSubmit;
            _up.Disable();
            _down.Disable();
            _submit.Disable();
            if (Current == State.Shown || Current == State.Starting) Finish();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        bool Wanted()
        {
            if (_shownThisSession || _menu == null || _menu.Player == null || _menu.Player.Car == null) return false;
            var url = Application.absoluteURL ?? "";
            if (url.Contains("title=off")) return false;
            if (url.Contains("title=on")) return true;
            if (Application.isEditor && !RunInEditor) return false;
            return _set == null || _set.titleScreen;
        }

        void Update()
        {
            if (Current == State.Waiting)
            {
                if (!GamePlatform.WorldReady) return;
                if (Wanted()) Show();
                else
                {
                    Current = State.Done;
                    StartFlow.Current = StartFlow.Phase.Playing;
                }
                return;
            }
            if (Current == State.Shown)
            {
                // The menu (Settings) closes into the title: the HUD it showed again stays hidden here.
                if (!_menu.IsOpen && _menu.Hud != null && !_menu.Hud.Hidden) _menu.Hud.Hidden = true;
                _root.EnableInClassList("jm-phone", UiPanel.IsPhone);
                _root.EnableInClassList("jm-portrait", UiPanel.IsPortrait);
                _root.EnableInClassList("jm-touch", Touch);
            }
        }

        static bool Touch => Touchscreen.current != null && (UiPanel.IsPhone || Mouse.current == null);
        bool Inputs => Current == State.Shown && !_menu.IsOpen;

        // ── show ────────────────────────────────────────────────────────────────────────────────────────

        void Show()
        {
            _shownThisSession = true;
            var progress = _menu.Progress;
            var saved = progress != null && progress.Data != null && (progress.Resumed || progress.Data.playSeconds > 30f || progress.Data.claims.Count > 0);
            Continue = saved && (_intro == null || !_intro.WillRun);
            Build();
            var player = _menu.Player;
            player.SetSuspended(true);
            if (_menu.Hud != null) _menu.Hud.Hidden = true;
            UiStack.Push(this, Hold);
            UnityEngine.Cursor.lockState = CursorLockMode.None;
            UnityEngine.Cursor.visible = true;
            BeginCamera();
            Current = State.Shown;
            StartFlow.Current = StartFlow.Phase.Title;
            // Next frame: from display none a transition has no start value (the staggered reveal).
            _root.schedule.Execute(() => _root.AddToClassList("jm-title--in")).ExecuteLater(30);
            _start.Focus();
            Debug.Log($"[Title] shown · {(Continue ? "continue" : "start game")}");
        }

        /// <summary>Back from Settings: the focus returns where it was.</summary>
        public void Refocus()
        {
            if (Current == State.Shown) _settings?.Focus();
        }

        // Escape on the title: nothing to go back to (Esc also leaves the portal's fullscreen).
        void Hold() => UiStack.Push(this, Hold);

        void Build()
        {
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(_menu.Panel);
            _doc.sortingOrder = 30;
            _root = _doc.rootVisualElement;
            if (_menu.Theme != null) _root.styleSheets.Add(_menu.Theme);
            _root.AddToClassList("jm-fill");
            _root.AddToClassList("jm-title");
            _root.EnableInClassList("jm-calm", GameOptions.ReducedMotion || QualitySystem.Current == "Low");
            // Arrows and Enter are ours (OnUp/OnDown/OnSubmit): UI Toolkit's event system would move and press a second time.
            _root.RegisterCallback<NavigationMoveEvent>(e => { e.StopPropagation(); _root.focusController?.IgnoreEvent(e); }, TrickleDown.TrickleDown);
            _root.RegisterCallback<NavigationSubmitEvent>(e => { e.StopPropagation(); _root.focusController?.IgnoreEvent(e); }, TrickleDown.TrickleDown);
            var safe = UiPanel.Safe;
            _root.style.paddingLeft = safe.x;
            _root.style.paddingTop = safe.y;
            _root.style.paddingRight = safe.z;
            _root.style.paddingBottom = safe.w;

            var shade = Ui.Box(_root, "jm-fill", "jm-title__shade");
            shade.pickingMode = PickingMode.Ignore;
            shade.style.backgroundImage = new StyleBackground(Shade());
            var bottom = Ui.Box(_root, "jm-title__floor");
            bottom.pickingMode = PickingMode.Ignore;
            bottom.style.backgroundImage = new StyleBackground(Floor());

            // Neon light streaks drifting through the frame: motion, at no cost (four quads).
            var streaks = Ui.Box(_root, "jm-fill", "jm-title__streaks");
            streaks.pickingMode = PickingMode.Ignore;
            var calm = _root.ClassListContains("jm-calm");
            for (var i = 0; i < 4; i++)
            {
                var s = Ui.Box(streaks, "jm-title__streak", $"jm-title__streak--{i}");
                s.pickingMode = PickingMode.Ignore;
                s.style.backgroundImage = new StyleBackground(Streak());
                if (calm) continue;
                // Run, jump back unseen, run again: each on its own beat so the four never line up.
                var period = 3600 + 900 * i;
                var streak = s;
                s.schedule.Execute(() =>
                {
                    streak.RemoveFromClassList("jm-title__streak--go");
                    streak.schedule.Execute(() => streak.AddToClassList("jm-title__streak--go")).ExecuteLater(40);
                }).Every(period).StartingIn(400 + 700 * i);
            }

            _block = Ui.Box(_root, "jm-title__block");
            var kicker = Ui.Text(_block, "OPEN-WORLD DRIVING  ·  JAPAN", "jm-title__kicker");
            kicker.pickingMode = PickingMode.Ignore;
            // The name letter by letter: each rises in with a small delay (the logo reveal the page's loader began).
            var name = Application.productName.ToUpperInvariant();
            var space = name.IndexOf(' ');
            var first = space > 0 ? name[..space] : name;
            var second = space > 0 ? name[(space + 1)..] : "";
            var logo = Ui.Row(_block, "jm-title__logo");
            logo.name = "title-name";
            logo.pickingMode = PickingMode.Ignore;
            for (var i = 0; i < first.Length; i++)
            {
                var l = Ui.Text(logo, first[i].ToString(), "jm-title__letter");
                l.pickingMode = PickingMode.Ignore;
                l.style.transitionDelay = new List<TimeValue> { new(0.12f + 0.045f * i, TimeUnit.Second) };
            }
            if (second.Length > 0)
            {
                var row = Ui.Row(_block, "jm-title__second");
                row.pickingMode = PickingMode.Ignore;
                Ui.Box(row, "jm-title__rule").pickingMode = PickingMode.Ignore;
                Ui.Text(row, second, "jm-title__word").pickingMode = PickingMode.Ignore;
            }
            Ui.Text(_block, "Blue hour after the rain. An island, a car and a road to the sea.", "jm-title__sub").pickingMode = PickingMode.Ignore;

            var list = Ui.Box(_block, "jm-title__menu");
            list.name = "title-menu";
            _buttons.Clear();
            _start = Entry(list, Continue ? "CONTINUE" : "START GAME", Continue ? Summary() : "Your first drive starts on the coast", Begin, primary: true);
            _start.name = "title-start";
            _settings = Entry(list, "SETTINGS", "Sound, controls, graphics", OpenSettings, primary: false);
            _settings.name = "title-settings";
            // A new player may skip the whole tutorial (career, D50): a second press confirms (no dialog over the title).
            var career = Career.CareerSystem.Instance;
            if (!Continue && career != null && career.Active)
            {
                _skip = Entry(list, "SKIP TUTORIAL", "Unlock everything, start with Sparks", SkipTutorial, primary: false);
                _skip.name = "title-skip";
            }

            var foot = Ui.Row(_root, "jm-title__foot");
            foot.name = "title-foot";
            foot.pickingMode = PickingMode.Ignore;
            Hint(foot, "↑↓", "Choose");
            Hint(foot, "Enter", "Select");
            var tag = Ui.Text(_root, $"v{Application.version}", "jm-title__tag");
            tag.name = "title-tag";
            tag.pickingMode = PickingMode.Ignore;

            _wipe = Ui.Box(_root, "jm-title__wipe");
            _wipe.pickingMode = PickingMode.Ignore;
            Ui.Box(_wipe, "jm-title__wipe-edge").pickingMode = PickingMode.Ignore;
            var wipeSeconds = _set != null ? _set.wipeSeconds : 0.38f;
            _wipe.style.transitionDuration = new List<TimeValue> { new(wipeSeconds, TimeUnit.Second) };
        }

        static void Hint(VisualElement row, string key, string what)
        {
            var h = Ui.Row(row, "jm-title__hint");
            h.pickingMode = PickingMode.Ignore;
            Ui.Text(h, key, "jm-keyhint").pickingMode = PickingMode.Ignore;
            Ui.Text(h, what, "jm-title__hint-label").pickingMode = PickingMode.Ignore;
        }

        string Summary()
        {
            var p = _menu.Progress;
            var car = _menu.Player != null && _menu.Player.Car != null ? _menu.Player.Car.Definition.displayName : "";
            if (p == null || p.Data == null) return car;
            var minutes = Mathf.Max(1, Mathf.RoundToInt(p.Data.playSeconds / 60f));
            return $"{car}  ·  {p.Wallet.Balance:N0} Sparks  ·  {(minutes >= 60 ? $"{minutes / 60} h {minutes % 60:00} min" : $"{minutes} min")} played";
        }

        Button Entry(VisualElement list, string title, string meta, System.Action click, bool primary)
        {
            var b = new Button(() =>
            {
                if (!Inputs) return;
                click();
            }) { text = "" };
            b.AddToClassList("jm-title__btn");
            b.AddToClassList(primary ? "jm-title__btn--primary" : "jm-title__btn--minor");
            Ui.Box(b, "jm-title__btn-bar").pickingMode = PickingMode.Ignore;
            var text = Ui.Box(b, "jm-title__btn-text");
            text.pickingMode = PickingMode.Ignore;
            Ui.Text(text, title, "jm-title__btn-label").pickingMode = PickingMode.Ignore;
            if (!string.IsNullOrEmpty(meta)) Ui.Text(text, meta, "jm-title__btn-meta").pickingMode = PickingMode.Ignore;
            var arrow = new UiIcon(Icon.Play, 18f);
            arrow.AddToClassList("jm-title__btn-arrow");
            b.Add(arrow);
            // The mouse moves the focus too: one highlighted entry, whatever the device (as in console menus).
            b.RegisterCallback<PointerEnterEvent>(_ => { if (Inputs && _root.panel.focusController.focusedElement != b) { b.Focus(); Tick(); } });
            list.Add(b);
            _buttons.Add(b);
            return b;
        }

        static void Tick() => Audio.Sfx.Play("UI_Click", 0.35f);

        void OnUp(InputAction.CallbackContext _) => Step(-1);
        void OnDown(InputAction.CallbackContext _) => Step(1);

        void Step(int dir)
        {
            if (!Inputs || _buttons.Count == 0) return;
            var i = _buttons.IndexOf(_root.panel?.focusController?.focusedElement as Button);
            i = i < 0 ? 0 : (i + dir + _buttons.Count) % _buttons.Count;
            _buttons[i].Focus();
            Tick();
        }

        void OnSubmit(InputAction.CallbackContext _)
        {
            if (!Inputs) return;
            var b = _root.panel?.focusController?.focusedElement as Button;
            if (b == _settings) OpenSettings();
            else if (b != null && b == _skip) SkipTutorial();
            else Begin();
        }

        Button _skip;
        bool _skipArmed;

        /// <summary>SKIP TUTORIAL: the first press asks, the second skips the career and starts like a returning player.</summary>
        public void SkipTutorial()
        {
            var career = Career.CareerSystem.Instance;
            if (Current != State.Shown || _skip == null || career == null) return;
            var label = _skip.Q<Label>(className: "jm-title__btn-label");
            var meta = _skip.Q<Label>(className: "jm-title__btn-meta");
            if (!_skipArmed)
            {
                _skipArmed = true;
                Tick();
                if (label != null) label.text = "SKIP TUTORIAL?";
                if (meta != null) meta.text = $"Press again: all unlocked, +{career.Settings.skipSparks:N0} Sparks";
                return;
            }
            career.Skip();
            Begin(); // the first drive is marked seen: CONTINUE's fly-in, the car is drivable at once
        }

        void OpenSettings()
        {
            Audio.Sfx.Play("UI_Click");
            _menu.OpenFromTitle();
        }

        // ── start ───────────────────────────────────────────────────────────────────────────────────────

        /// <summary>START GAME / CONTINUE (button, Enter, A, tap).</summary>
        public void Begin()
        {
            if (Current != State.Shown) return;
            Audio.Sfx.Play("UI_Click");
            Audio.Sfx.Play("Whoosh_Up", 0.6f);
            Current = State.Starting;
            StartFlow.Current = StartFlow.Phase.Starting;
            _intoIntro = _intro != null && _intro.WillRun;
            _t = 0f;
            _covered = false;
            _root.AddToClassList("jm-title--out");
            if (_intoIntro)
            {
                _wipe.AddToClassList("jm-title__wipe--armed");
                _wipe.schedule.Execute(() => _wipe.AddToClassList("jm-title__wipe--cover")).ExecuteLater(1);
                Debug.Log("[Title] start game → wipe into the first drive");
            }
            else
            {
                // Continue: hand the car back now (the player may drive during the flight), the camera follows; the HUD
                // comes once the title column has slid away (no dial under fading type).
                Release(hud: false);
                _fromPos = Camera.main != null ? Camera.main.transform.position : Vector3.zero;
                _fromRot = Camera.main != null ? Camera.main.transform.rotation : Quaternion.identity;
                _fromFov = Camera.main != null ? Camera.main.fieldOfView : 60f;
                if (_brain != null) _brain.enabled = true;
                Debug.Log("[Title] continue → fly-in");
            }
        }

        /// <summary>Gameplay takes over: off the stack (gameplayStart follows), car and HUD back.</summary>
        void Release(bool hud = true)
        {
            UiStack.Pop(this);
            if (_menu == null) return;
            if (_menu.Player != null) _menu.Player.SetSuspended(false);
            if (hud && _menu.Hud != null) _menu.Hud.Hidden = false;
        }

        void Finish()
        {
            if (UiStack.Contains(this)) Release();
            else if (_menu != null && _menu.Hud != null && !_menu.IsOpen) _menu.Hud.Hidden = false;
            if (_brain != null) _brain.enabled = true;
            var cam = Camera.main;
            if (cam != null && _savedFov > 0f) cam.fieldOfView = _savedFov;
            if (_root != null) _root.style.display = DisplayStyle.None;
            Current = State.Done;
            StartFlow.Current = StartFlow.Phase.Playing;
            Debug.Log("[Title] done");
        }

        // ── camera ──────────────────────────────────────────────────────────────────────────────────────

        void BeginCamera()
        {
            var cam = Camera.main;
            if (cam == null) return;
            _brain = cam.GetComponent<CinemachineBrain>();
            if (_brain != null) _brain.enabled = false;
            _savedFov = cam.fieldOfView;
            var car = _menu.Player.Car.transform;
            // Start three-quarter front: the car's face, then the drift reveals its side.
            _yaw = car.eulerAngles.y + 35f;
            _t = 0f;
        }

        Vector3 TitlePose(out Quaternion rot, out float fov)
        {
            var cam = Camera.main;
            var car = _menu.Player.Car.transform;
            var centre = car.position + Vector3.up * 0.7f;
            var period = _set != null ? Mathf.Max(5f, _set.titleDollyPeriod) : 40f;
            var near = _set != null ? _set.titleDistance : new Vector2(11f, 8f);
            var calm = GameOptions.ReducedMotion;
            var breathe = calm ? 0f : 0.5f - 0.5f * Mathf.Cos(Time.unscaledTime * Mathf.PI * 2f / period);
            var dist = Mathf.Lerp(near.x, near.y, breathe);
            fov = _set != null ? _set.titleFov : 34f;
            // Upright phones see a third of the width: farther and wider, or the car fills and leaves the frame.
            if (UiPanel.IsPortrait) { dist *= 1.35f; fov *= 1.6f; }
            // A little above the roof, looking down a few degrees: the car stands on its road, not on the horizon.
            var orbit = Quaternion.Euler(-4f, _yaw, 0f);
            var pos = centre + orbit * Vector3.forward * dist + Vector3.up * ((_set != null ? _set.titleHeight : 1.6f) - 0.7f);
            if (Physics.Linecast(centre, pos, out var hit, GameLayers.CameraObstacles, QueryTriggerInteraction.Ignore))
                pos = hit.point + (centre - pos).normalized * 0.4f;
            var aspect = cam != null ? cam.aspect : 16f / 9f;
            var halfW = Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) * aspect;
            var toCar = centre - pos;
            var right = Vector3.Cross(Vector3.up, toCar.normalized);
            // Landscape: the car right of the title column; portrait: above the buttons, centred.
            var shiftX = UiPanel.IsPortrait ? 0f : (_set != null ? _set.titleFrameRight : 0.42f) * halfW;
            var shiftY = UiPanel.IsPortrait ? 0.35f * Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) : 0f;
            var look = centre - right * (toCar.magnitude * shiftX) - Vector3.up * (toCar.magnitude * shiftY);
            rot = Quaternion.LookRotation(look - pos, Vector3.up);
            return pos;
        }

        void LateUpdate()
        {
            if (Current != State.Shown && Current != State.Starting) return;
            var cam = Camera.main;
            if (cam == null || _menu == null || _menu.Player == null || _menu.Player.Car == null) { if (Current == State.Starting) Finish(); return; }
            var dt = Time.unscaledDeltaTime;
            if (!GameOptions.ReducedMotion) _yaw += (_set != null ? _set.titleSpin : 2.5f) * dt;

            if (Current == State.Shown || (_intoIntro && !_covered))
            {
                var pos = TitlePose(out var rot, out var fov);
                cam.transform.SetPositionAndRotation(pos, rot);
                cam.fieldOfView = fov;
            }
            if (Current != State.Starting) return;
            _t += dt;
            if (_intoIntro)
            {
                var half = _set != null ? _set.wipeSeconds : 0.38f;
                if (!_covered && _t >= half)
                {
                    // Under the wipe: the car goes to the coast (the intro places it), the chase camera takes over.
                    _covered = true;
                    Release();
                    if (_brain != null) _brain.enabled = true;
                    if (_savedFov > 0f) cam.fieldOfView = _savedFov;
                    _block.style.display = DisplayStyle.None;
                    StartFlow.Current = StartFlow.Phase.Playing; // FirstDrive begins on its next Update
                    _wipe.AddToClassList("jm-title__wipe--reveal");
                }
                if (_t >= half * 2.4f) Finish();
                return;
            }
            if (_t > 0.35f && _menu.Hud != null && _menu.Hud.Hidden && !_menu.IsOpen) _menu.Hud.Hidden = false;
            // Continue: from the title shot into whatever the chase camera shows now (it follows a moving car).
            var fly = _set != null ? Mathf.Max(0.05f, _set.flyInSeconds) : 1.4f;
            var k = Mathf.Clamp01(_t / fly);
            var e = k * k * k * (k * (6f * k - 15f) + 10f); // smootherstep: no jolt at either end
            cam.transform.SetPositionAndRotation(Vector3.Lerp(_fromPos, cam.transform.position, e), Quaternion.Slerp(_fromRot, cam.transform.rotation, e));
            cam.fieldOfView = Mathf.Lerp(_fromFov, _savedFov > 0f ? _savedFov : cam.fieldOfView, e);
            if (k >= 1f) Finish();
        }

        // ── backdrop textures ───────────────────────────────────────────────────────────────────────────

        static Texture2D _shade, _floor, _streak;

        /// <summary>A light trail: clear tail, bright head (tinted per streak in USS).</summary>
        static Texture2D Streak()
        {
            if (_streak != null) return _streak;
            const int w = 128;
            _streak = new Texture2D(w, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "TitleStreak" };
            for (var x = 0; x < w; x++)
            {
                var t = x / (float)(w - 1);
                var a = t < 0.9f ? Mathf.Pow(t / 0.9f, 2.2f) : Mathf.Lerp(1f, 0f, (t - 0.9f) / 0.1f);
                _streak.SetPixel(x, 0, new Color(1f, 1f, 1f, a));
            }
            _streak.Apply();
            return _streak;
        }

        /// <summary>Ink from the left edge to 55 % of the width: the title column reads on any picture.</summary>
        internal static Texture2D Shade()
        {
            if (_shade != null) return _shade;
            const int w = 256;
            _shade = new Texture2D(w, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "TitleShade" };
            for (var x = 0; x < w; x++)
            {
                var t = x / (float)(w - 1);
                _shade.SetPixel(x, 0, new Color(0.012f, 0.035f, 0.06f, Mathf.Lerp(0.78f, 0f, Ui.Smooth(0.05f, 0.58f, t))));
            }
            _shade.Apply();
            return _shade;
        }

        /// <summary>A dark floor under the hints, clear above.</summary>
        static Texture2D Floor()
        {
            if (_floor != null) return _floor;
            const int h = 64;
            _floor = new Texture2D(1, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "TitleFloor" };
            for (var y = 0; y < h; y++) _floor.SetPixel(0, y, new Color(0.012f, 0.035f, 0.06f, Mathf.Lerp(0.85f, 0f, y / (float)(h - 1))));
            _floor.Apply();
            return _floor;
        }
    }
}
