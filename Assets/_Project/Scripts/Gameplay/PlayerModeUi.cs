using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay
{
    /// <summary>
    /// Minimal prompt line ("F  Get in", call messages) and, on touch devices, CAR and CALL buttons.
    /// PROVISIONAL until the HUD of Phase 9; UI Toolkit like the touch controls (D05).
    /// </summary>
    public sealed class PlayerModeUi : MonoBehaviour
    {
        [SerializeField] PlayerModeController player;
        [SerializeField] PanelSettings panelSettings;
        [Tooltip("Seconds a call message stays.")]
        [SerializeField] float messageSeconds = 3.5f;

        UIDocument _doc;
        Label _prompt;
        VisualElement _touch, _call;
        bool _touchSeen;

        internal Label PromptLabel => _prompt;

        void Awake()
        {
            // Own child: a GameObject holds only one UIDocument, and the Player carries several panels.
            var host = new GameObject("PlayerPromptUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = panelSettings;
            _doc.sortingOrder = 2;
        }

        void OnEnable()
        {
            var doc = _doc.rootVisualElement;
            doc.Clear();
            doc.pickingMode = PickingMode.Ignore;
            doc.style.position = Position.Absolute;
            doc.style.left = doc.style.right = doc.style.top = doc.style.bottom = 0;

            _prompt = new Label { name = "player-prompt", pickingMode = PickingMode.Ignore };
            _prompt.style.position = Position.Absolute;
            _prompt.style.left = _prompt.style.right = 0;
            _prompt.style.bottom = 36;
            _prompt.style.unityTextAlign = TextAnchor.MiddleCenter;
            _prompt.style.color = Color.white;
            _prompt.style.fontSize = 30;
            _prompt.style.unityFontStyleAndWeight = FontStyle.Bold;
            _prompt.style.textShadow = new TextShadow { offset = new Vector2(0f, 2f), blurRadius = 6f, color = new Color(0f, 0f, 0f, 0.8f) };
            doc.Add(_prompt);

            _touch = new VisualElement { pickingMode = PickingMode.Ignore };
            _touch.style.position = Position.Absolute;
            _touch.style.left = _touch.style.right = _touch.style.top = _touch.style.bottom = 0;
            doc.Add(_touch);
            var car = Round("CAR", 96, new Color(1f, 0.85f, 0.4f, 0.4f), () => player.PressVehicle());
            car.style.right = 240;
            car.style.top = 40;
            _call = Round("CALL", 84, new Color(1f, 1f, 1f, 0.25f), () => player.PressCall());
            _call.style.right = 350;
            _call.style.top = 40;
            _touchSeen = Application.isMobilePlatform;
        }

        VisualElement Round(string label, float size, Color fill, System.Action pressed)
        {
            var b = new VisualElement();
            b.style.position = Position.Absolute;
            b.style.width = b.style.height = size;
            b.style.backgroundColor = fill;
            b.style.borderTopLeftRadius = b.style.borderTopRightRadius = b.style.borderBottomLeftRadius = b.style.borderBottomRightRadius = size / 2f;
            b.style.borderTopWidth = b.style.borderBottomWidth = b.style.borderLeftWidth = b.style.borderRightWidth = 3;
            b.style.borderTopColor = b.style.borderBottomColor = b.style.borderLeftColor = b.style.borderRightColor = new Color(1f, 1f, 1f, 0.6f);
            var t = new Label(label) { pickingMode = PickingMode.Ignore };
            t.style.flexGrow = 1;
            t.style.unityTextAlign = TextAnchor.MiddleCenter;
            t.style.color = Color.white;
            t.style.fontSize = size * 0.22f;
            t.style.unityFontStyleAndWeight = FontStyle.Bold;
            b.Add(t);
            b.RegisterCallback<PointerDownEvent>(e =>
            {
                pressed();
                e.StopPropagation();
            });
            _touch.Add(b);
            return b;
        }

        void Update()
        {
            if (player == null || _prompt == null) return;
            // A menu scene (garage) owns the screen: no "F  Get out", no touch driving buttons.
            if (player.Suspended)
            {
                _prompt.text = "";
                _touch.style.display = DisplayStyle.None;
                return;
            }
            var message = Time.unscaledTime - player.MessageAt < messageSeconds ? player.Message : "";
            var text = message != "" ? message : player.Prompt;
            // On touch the button is the prompt; drop the key name.
            if (_touchSeen && text.StartsWith("F  ")) text = "Tap CAR to " + text.Substring(3).ToLowerInvariant();
            _prompt.text = text;

            if (!_touchSeen && Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed) _touchSeen = true;
            _touch.style.display = _touchSeen ? DisplayStyle.Flex : DisplayStyle.None;
            _call.style.display = player.Current == PlayerModeController.Mode.Walking ? DisplayStyle.Flex : DisplayStyle.None;
        }
    }
}
