using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Menu;
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

        UIDocument _doc;
        Label _prompt, _distance;
        VisualElement _touch, _call, _car, _carOut, _menu;
        bool _touchSeen;
        bool _wasLocked, _wasWalking;
        float _lockedSince;
        VisualElement _deskMenu;

        internal Label PromptLabel => _prompt;
        internal VisualElement MenuButton => _menu;

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
            _prompt.style.left = _prompt.style.right = 0;
            // Above the touch controls on a phone (they take the lower 140 / 180 px).
            _prompt.style.bottom = safe.w + (UiPanel.IsPortrait ? 262f : phone ? 150f : 36f);
            _prompt.style.unityTextAlign = TextAnchor.MiddleCenter;
            _prompt.style.color = Color.white;
            _prompt.style.fontSize = phone ? 18f : 26f;
            _prompt.style.unityFontStyleAndWeight = FontStyle.Bold;
            _prompt.style.whiteSpace = WhiteSpace.Normal;
            _prompt.style.textShadow = new TextShadow { offset = new Vector2(0f, 2f), blurRadius = 6f, color = new Color(0f, 0f, 0f, 0.8f) };
            doc.Add(_prompt);

            // Desktop: a menu button too. Escape is not enough on the web — in CrazyGames' fullscreen it leaves fullscreen,
            // with the mouse captured it only frees the mouse; neither key press reaches the game (CrazyGames: restricted keys).
            _deskMenu = TouchKit.Tap(doc, 44f, "MENU · Esc", () => GameMenu.Instance?.Escape());
            _deskMenu.name = "desk-menu";
            _deskMenu.style.width = 132f;
            // Readable over a bright sky: the dark panel colour of the menu, not the see-through touch style.
            _deskMenu.style.backgroundColor = new Color(0.04f, 0.12f, 0.14f, 0.82f);
            _deskMenu.style.borderTopColor = _deskMenu.style.borderBottomColor = _deskMenu.style.borderLeftColor =
                _deskMenu.style.borderRightColor = new Color(0.95f, 0.78f, 0.45f, 0.9f);
            foreach (var l in _deskMenu.Query<Label>().ToList())
            {
                l.style.color = Color.white;
                l.style.fontSize = 16f;
                l.style.unityFontStyleAndWeight = FontStyle.Bold;
            }
            Corner(_deskMenu, safe.z + 24f, safe.y + 24f, false);

            _touch = new VisualElement { pickingMode = PickingMode.Ignore };
            _touch.style.position = Position.Absolute;
            _touch.style.left = _touch.style.right = _touch.style.top = _touch.style.bottom = 0;
            doc.Add(_touch);
            var k = GameOptions.ButtonScale;
            var mirror = GameOptions.LeftHanded;
            var outer = (mirror ? safe.x : safe.z) + 12f;
            // MENU: the corner, always (pauses like Escape).
            _menu = TouchKit.Tap(_touch, 48f, "MENU", () => GameMenu.Instance?.Escape());
            _menu.name = "touch-menu";
            // Portrait: the instrument has the corner, the button row sits under it (RESET, CAM, OUT beside MENU).
            var row = safe.y + (UiPanel.IsPortrait ? 136f : 12f);
            Corner(_menu, outer, row, mirror);
            // CAR and CALL above the right-hand group (on foot JUMP/SLIDE, in the car BOOST).
            var bottom = safe.w + (UiPanel.IsPortrait ? 28f : 20f) + 64f * k * 2f + 24f;
            _car = TouchKit.Tap(_touch, 56f * k, "CAR", () => player.PressVehicle(), "jm-touch--on");
            _car.name = "touch-car";
            TouchKit.Place(_car, outer + 4f, bottom, rightSide: true, mirror);
            // In the car the right thumb's corner is the instrument and the drive group: get out sits in the top row,
            // beside RESET and CAM.
            _carOut = TouchKit.Tap(_touch, 48f, "OUT", () => player.PressVehicle());
            _carOut.name = "touch-out";
            Corner(_carOut, outer + 56f * 3f, row, mirror);
            _call = TouchKit.Tap(_touch, 56f * k, "CALL", () => player.PressCall());
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

        static void Corner(VisualElement e, float outer, float top, bool mirror)
        {
            e.style.position = Position.Absolute;
            e.style.top = top;
            e.style.right = mirror ? StyleKeyword.Auto : outer;
            e.style.left = mirror ? outer : StyleKeyword.Auto;
        }

        void Update()
        {
            if (player == null || _prompt == null) return;
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
            // A menu or the garage owns the screen: no "F  Get out", no touch buttons.
            if (player.Suspended)
            {
                _prompt.text = "";
                _touch.style.display = DisplayStyle.None;
                return;
            }
            var message = Time.unscaledTime - player.MessageAt < messageSeconds ? player.Message : "";
            var text = message != "" ? message : player.Prompt;
            // On touch the button is the prompt; drop the key name.
            if (_touchSeen && text.StartsWith("F  "))
                text = (player.Current == PlayerModeController.Mode.Walking ? "Tap CAR to " : "Tap OUT to ") + text.Substring(3).ToLowerInvariant();
            _prompt.text = text;

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
