using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay
{
    /// <summary>
    /// The prompt line ("F  Get in", call messages) and, on touch devices, the buttons both modes share (ASTRA §10):
    /// MENU (48 px, the corner — the touch Escape), CAR (get in / get out), and on foot CALL with the car's distance
    /// beside it. Sizes in CSS px, inside the safe area, mirrored for the left hand.
    /// </summary>
    public sealed class PlayerModeUi : MonoBehaviour
    {
        [SerializeField] PlayerModeController player;
        [SerializeField] PanelSettings panelSettings;
        [Tooltip("Seconds a call message stays.")]
        [SerializeField] float messageSeconds = 3.5f;
        [Tooltip("Desktop key overlay for new players (CrazyGames quality guide: show the controls as a keyboard overlay, "
            + "in gameplay). Shown until the save has this much play time, s; 0 = never.")]
        [SerializeField] float keyHintsUntil = 240f;
        [SerializeField] PlayerProgress progress;

        UIDocument _doc;
        Label _prompt, _distance;
        VisualElement _touch, _call, _car, _carOut, _menu;
        bool _touchSeen;
        bool _wasLocked, _wasWalking;
        float _lockedSince;
        VisualElement _deskMenu, _keys;
        PlayerModeController.Mode? _keysMode;
        bool? _promptInCockpit;

        internal Label PromptLabel => _prompt;
        internal VisualElement MenuButton => _menu;
        internal VisualElement KeyHints => _keys;

        /// <summary>Shows the touch buttons as if the screen had been touched (screenshots of the phone layout).</summary>
        public void ShowTouch() => _touchSeen = true;

        void Awake()
        {
            // Own child: a GameObject holds only one UIDocument, and the Player carries several panels.
            var host = new GameObject("PlayerPromptUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panelSettings);
            _doc.sortingOrder = 2;
        }

        void OnEnable()
        {
            Build();
            UiPanel.Changed += Build;
            GameOptions.Changed += Build;
            _touchSeen = _touchSeen || Application.isMobilePlatform;
        }

        void OnDisable()
        {
            _hKey?.Disable();
            _hKey?.Dispose();
            _hKey = null;
            UiPanel.Changed -= Build;
            GameOptions.Changed -= Build;
        }

        void Build()
        {
            var doc = _doc.rootVisualElement;
            doc.Clear();
            doc.pickingMode = PickingMode.Ignore;
            doc.style.position = Position.Absolute;
            doc.style.left = doc.style.right = doc.style.top = doc.style.bottom = 0;
            var safe = UiPanel.Safe;
            var phone = UiPanel.IsPhone;

            _prompt = new Label { name = "player-prompt", pickingMode = PickingMode.Ignore };
            _prompt.style.position = Position.Absolute;
            _promptInCockpit = null;
            PlacePrompt(false);
            _prompt.style.color = Color.white;
            _prompt.style.fontSize = phone ? 18f : 22f;
            _prompt.style.whiteSpace = WhiteSpace.Normal;
            _prompt.enableRichText = true;
            _prompt.AddToClassList("nm-hud-prompt");
            _prompt.AddToClassList("jm-hud-text");
            doc.Add(_prompt);

            // Desktop: a menu button too. Escape is not enough on the web — in CrazyGames' fullscreen it leaves fullscreen,
            // with the mouse captured it only frees the mouse; neither key press reaches the game (CrazyGames: restricted keys).
            _deskMenu = TouchKit.Tap(doc, 44f, "MENU · Esc", () => GameMenu.Instance?.Escape());
            _deskMenu.name = "desk-menu";
            _deskMenu.style.width = 132f;
            _deskMenu.AddToClassList("nm-deskmenu"); // Hud.uss: ink, paper rim, readable over a bright sky
            Corner(_deskMenu, safe.z + 24f, safe.y + 24f, false);

            // Desktop key overlay for the first minutes, under the prompt line. Filled per mode in Update.
            _keys = new VisualElement { name = "key-hints", pickingMode = PickingMode.Ignore };
            _keys.style.position = Position.Absolute;
            // Clear of the dial (bottom right, ~220 px) and the minimap: narrow windows wrap the keys upwards.
            _keys.style.left = _keys.style.right = 250f;
            _keys.style.bottom = safe.w + 6f;
            _keys.style.flexDirection = FlexDirection.Row;
            _keys.style.flexWrap = Wrap.Wrap;
            _keys.style.justifyContent = Justify.Center;
            _keys.style.alignItems = Align.Center;
            doc.Add(_keys);
            _keysMode = null;

            // K: every key at any time (H calls the car) (owner 2026-10-21: lights, cockpit, auto-drive, repair, photo were never found).
            _allKeys = new VisualElement { name = "all-keys", pickingMode = PickingMode.Ignore };
            _allKeys.AddToClassList("nm-glass");
            _allKeys.AddToClassList("nm-allkeys");
            _allKeys.style.display = DisplayStyle.None;
            doc.Add(_allKeys);

            // Phones upright while driving: a paper note to turn the phone (D55 — the road needs the width); it goes
            // by itself and comes back on the next turn upright.
            _turn = new UI.Ticket { name = "turn-phone", pickingMode = PickingMode.Ignore, Perforation = false };
            _turn.AddToClassList("nm-turnphone");
            UI.Nm.Kicker(_turn, "Best in landscape", UI.Jp.Landscape);
            var tl = new Label("Turn your phone") { pickingMode = PickingMode.Ignore };
            tl.AddToClassList("nm-ticket__title");
            _turn.Add(tl);
            _turn.style.display = DisplayStyle.None;
            doc.Add(_turn);

            _touch = new VisualElement { pickingMode = PickingMode.Ignore };
            _touch.style.position = Position.Absolute;
            _touch.style.left = _touch.style.right = _touch.style.top = _touch.style.bottom = 0;
            doc.Add(_touch);
            var k = GameOptions.ButtonScale;
            var mirror = GameOptions.LeftHanded;
            var outer = (mirror ? safe.x : safe.z) + 12f;
            // MENU: the corner, always (pauses like Escape).
            _menu = TouchKit.Glyph(TouchKit.Tap(_touch, 48f, "MENU", () => GameMenu.Instance?.Escape()), TouchGlyph.Menu);
            _menu.name = "touch-menu";
            // Portrait: the instrument has the corner, the button row sits under it (RESET, CAM, OUT beside MENU).
            var row = safe.y + (UiPanel.IsPortrait ? UiPanel.PortraitButtonRow : 12f);
            Corner(_menu, outer, row, mirror);
            // CAR and CALL above the right-hand group (on foot JUMP/SLIDE, in the car BOOST).
            var bottom = safe.w + (UiPanel.IsPortrait ? 28f : 20f) + 64f * k * 2f + 24f;
            _car = TouchKit.Glyph(TouchKit.Tap(_touch, 56f * k, "CAR", () => player.PressVehicle(), "jm-touch--on"), TouchGlyph.Car);
            _car.name = "touch-car";
            TouchKit.Place(_car, outer + 4f, bottom, rightSide: true, mirror);
            // In the car the right thumb's corner is the instrument and the drive group: get out sits in the top row,
            // beside RESET and CAM.
            _carOut = TouchKit.Glyph(TouchKit.Tap(_touch, 48f, "OUT", () => player.PressVehicle()), TouchGlyph.Out);
            _carOut.name = "touch-out";
            Corner(_carOut, outer + 56f * 3f, row, mirror);
            _call = TouchKit.Glyph(TouchKit.Tap(_touch, 56f * k, "CALL", () => player.PressCall()), TouchGlyph.Call);
            _call.name = "touch-call";
            TouchKit.Place(_call, outer + 4f + 56f * k + 8f, bottom, rightSide: true, mirror);
            _distance = new Label { pickingMode = PickingMode.Ignore };
            _distance.AddToClassList("jm-small");
            _distance.style.position = Position.Absolute;
            _distance.style.width = 56f * k;
            _distance.style.unityTextAlign = TextAnchor.MiddleCenter;
            TouchKit.Place(_distance, outer + 4f + 56f * k + 8f, bottom - 20f, rightSide: true, mirror);
            _touch.Add(_distance);
        }

        VisualElement _allKeys, _turn;
        float _turnUntil;
        bool _wasUpright;
        UnityEngine.InputSystem.InputAction _hKey;
        bool _allShown;

        /// <summary>K toggles the full key list (desktop); it also closes with the menu.</summary>
        void UpdateAllKeys()
        {
            if (_allKeys == null) return;
            if (_hKey == null)
            {
                // A callback, not WasPressedThisFrame: a short press between two frames still counts (as GameMenu's keys).
                _hKey = new UnityEngine.InputSystem.InputAction("AllKeys", UnityEngine.InputSystem.InputActionType.Button, "<Keyboard>/k");
                _hKey.performed += _ => { if (!player.Suspended && !UiPanel.IsPhone) _allShown = !_allShown; };
                _hKey.Enable();
            }
            if (player.Suspended) _allShown = false;
            _allKeys.style.display = _allShown ? DisplayStyle.Flex : DisplayStyle.None;
            if (!_allShown || _allKeys.childCount > 0) return;
            UI.Nm.Kicker(_allKeys, "All keys", UI.Jp.Controls);
            var cols = new VisualElement { pickingMode = PickingMode.Ignore };
            cols.AddToClassList("nm-allkeys__cols");
            _allKeys.Add(cols);
            VisualElement Col()
            {
                var c = new VisualElement { pickingMode = PickingMode.Ignore };
                c.AddToClassList("nm-allkeys__col");
                cols.Add(c);
                return c;
            }
            void Row(VisualElement col, string key, string what) => UI.Nm.Hint(col, key, what).AddToClassList("nm-allkeys__row");
            var drive = Col();
            Row(drive, Key("Drive", "Throttle", "W"), "Gas");
            Row(drive, Key("Drive", "Brake", "S"), "Brake / reverse");
            Row(drive, "A D", "Steer");
            Row(drive, Key("Drive", "Handbrake", "Space"), "Drift");
            Row(drive, Key("Drive", "Boost", "Shift"), "Nitro (twice: burst)");
            Row(drive, Key("Drive", "Respawn", "R"), "Back on the road");
            Row(drive, Key("Drive", "Repair", "T"), "Repair");
            var more = Col();
            Row(more, Key("Drive", "Camera", "C"), "Camera · cockpit");
            Row(more, Key("Drive", "Headlights", "L"), "Lights (twice: high beam)");
            Row(more, Key("Drive", "AutoDrive", "G").Replace("Hold ", ""), "Hold: auto-drive to the waypoint");
            Row(more, Key("Player", "Vehicle", "F"), "Get in / out");
            Row(more, Key("Player", "Map", "M"), "Map");
            Row(more, Key("Player", "Records", "Tab"), "Records");
            Row(more, Key("Player", "Photo", "P"), "Photo mode");
            Row(more, "Esc", "Menu");
        }

        void UpdateTurnHint()
        {
            if (_turn == null) return;
            var upright = UiPanel.IsPortrait && player.Current == PlayerModeController.Mode.Driving && !player.Suspended;
            if (upright && !_wasUpright) _turnUntil = Time.unscaledTime + 5f;
            _wasUpright = upright;
            _turn.style.display = upright && Time.unscaledTime < _turnUntil ? DisplayStyle.Flex : DisplayStyle.None;
        }

        void UpdateKeyHints()
        {
            UpdateAllKeys();
            UpdateTurnHint();
            if (_keys == null) return;
            // Not under the auto-drive letterbox (D49): the picture is the film, the take-over line says what to press.
            var show = !_touchSeen && !UiPanel.IsPhone && !player.Suspended && !Core.AutoDrive.IsActive && progress != null && progress.Data != null
                && progress.Data.playSeconds < keyHintsUntil;
            _keys.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
            if (!show || _keysMode == player.Current) return;
            _keysMode = player.Current;
            _keys.Clear();
            if (player.Current == PlayerModeController.Mode.Walking)
            {
                Hint("W A S D", "walk");
                Hint("Mouse", "look");
                Hint(Key("Walk", "Jump", "Space"), "jump"); // getting in has its own prompt line ("F  Get in")
            }
            else
            {
                Hint(Key("Drive", "Throttle", "W"), "gas");
                Hint(Key("Drive", "Brake", "S"), "brake");
                Hint("A D", "steer");
                Hint(Key("Drive", "Handbrake", "Space"), "drift");
                Hint(Key("Drive", "Boost", "Shift"), "nitro");
                Hint(Key("Drive", "Boost", "Shift") + " ×2", "burst");
                Hint(Key("Player", "Map", "M"), "map");
            }
            Hint("K", "all keys");
        }

        /// <summary>One keycap and its word ("[Space] drift"), Night Meet caps (UI/NightMeet.cs).</summary>
        void Hint(string key, string what) => UI.Nm.Hint(_keys, key, what);

        /// <summary>The key an action is bound to now (Settings → Controls may have moved it).</summary>
        string Key(string map, string action, string fallback)
        {
            var a = player.Actions != null ? player.Actions.FindActionMap(map, false)?.FindAction(action, false) : null;
            if (a == null) return fallback;
            for (var i = 0; i < a.bindings.Count; i++)
                if (!a.bindings[i].isComposite && !a.bindings[i].isPartOfComposite && a.bindings[i].effectivePath.StartsWith("<Keyboard>"))
                    return a.GetBindingDisplayString(i);
            return fallback;
        }

        static void Corner(VisualElement e, float outer, float top, bool mirror)
        {
            e.style.position = Position.Absolute;
            e.style.top = top;
            e.style.right = mirror ? StyleKeyword.Auto : outer;
            e.style.left = mirror ? outer : StyleKeyword.Auto;
        }

        /// <summary>
        /// Where the prompt line sits. From the seat the usual place lies over the instruments and the wheel (D51): there
        /// it moves to the dashboard's dark right corner on a desktop (the screen gauge has stepped aside), up under the
        /// roof on a phone (the pedals take the lower corners).
        /// </summary>
        void PlacePrompt(bool cockpit)
        {
            if (_promptInCockpit == cockpit) return;
            _promptInCockpit = cockpit;
            var safe = UiPanel.Safe;
            var phone = UiPanel.IsPhone;
            var s = _prompt.style;
            s.top = s.bottom = s.left = s.right = StyleKeyword.Auto;
            if (cockpit && !phone)
            {
                s.right = safe.z + 40f;
                s.bottom = safe.w + 64f;
                s.unityTextAlign = TextAnchor.MiddleRight;
                return;
            }
            if (cockpit)
            {
                s.left = s.right = Length.Percent(18);
                s.top = safe.y + UiPanel.Size.y * (UiPanel.IsPortrait ? 0.26f : 0.14f);
                s.unityTextAlign = TextAnchor.MiddleCenter;
                return;
            }
            // Centred between the stick and the dial on phones (full width ran under the dial, UiLayoutProbe).
            s.left = s.right = phone && !UiPanel.IsPortrait ? Length.Percent(22) : 0;
            // Above the touch controls on a phone (they take the lower 140 / 180 px).
            s.bottom = safe.w + (UiPanel.IsPortrait ? 262f : phone ? 150f : 36f);
            s.unityTextAlign = TextAnchor.MiddleCenter;
        }

        void Update()
        {
            if (player == null || _prompt == null) return;
            PlacePrompt(Hud.GameplayHud.CockpitShowsSpeed);
            if (!_touchSeen && Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed) _touchSeen = true;
            // The browser freed the captured mouse (Escape while walking; the key itself never reaches the game): pause as
            // Escape would. Our own releases (menu, photo mode, getting in) happen with something on the UI stack or a mode change.
            var locked = UnityEngine.Cursor.lockState == CursorLockMode.Locked;
            var walkingNow = player.Current == PlayerModeController.Mode.Walking;
            // Only a capture that was really held: a refused request flips back at once (editor without focus, a browser
            // that denies pointer lock) — that opened the menu right after a Travel click (MapTests, Phase 11).
            if (locked && !_wasLocked) _lockedSince = Time.unscaledTime;
            var held = Time.unscaledTime - _lockedSince >= 0.25f;
            if (_wasLocked && !locked && held && _wasWalking && walkingNow && UiStack.Count == 0 && !player.Suspended) GameMenu.Instance?.Open();
            _wasLocked = locked;
            _wasWalking = walkingNow;
            if (_deskMenu != null) _deskMenu.style.display = !_touchSeen && !player.Suspended && !UiPanel.IsPhone ? DisplayStyle.Flex : DisplayStyle.None;
            UpdateKeyHints();
            // A menu or the garage owns the screen: no "F  Get out", no touch buttons.
            if (player.Suspended)
            {
                _prompt.text = "";
                _touch.style.display = DisplayStyle.None;
                return;
            }
            var message = Time.unscaledTime - player.MessageAt < messageSeconds ? player.Message : "";
            var text = Core.AutoDrive.IsActive ? "" : message != "" ? message : player.Prompt;
            // On touch the button is the prompt; drop the key name.
            if (_touchSeen && text.StartsWith("F  "))
                text = (player.Current == PlayerModeController.Mode.Walking ? "Tap CAR to " : "Tap OUT to ") + text.Substring(3).ToLowerInvariant();
            _prompt.text = Hud.GameplayHud.KeyCap(text);

            _touch.style.display = _touchSeen ? DisplayStyle.Flex : DisplayStyle.None;
            var walking = player.Current == PlayerModeController.Mode.Walking;
            _call.style.display = walking ? DisplayStyle.Flex : DisplayStyle.None;
            _distance.style.display = walking ? DisplayStyle.Flex : DisplayStyle.None;
            if (walking) _distance.text = float.IsInfinity(player.CarDistance) ? "" : $"{player.CarDistance:0} m";
            // In the car, OUT only when it can (slow enough).
            _car.style.display = walking ? DisplayStyle.Flex : DisplayStyle.None;
            _carOut.style.display = !walking && player.CanAlight ? DisplayStyle.Flex : DisplayStyle.None;
        }
    }
}
