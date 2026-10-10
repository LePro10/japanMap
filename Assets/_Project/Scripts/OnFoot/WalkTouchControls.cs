using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// On-screen controls on foot (UI Toolkit, D05; same look as DriveTouchControls): stick on the
    /// left (pushed to the rim = run), drag anywhere on the right half to look, JUMP and SLIDE on
    /// the right. Each control tracks its own finger. Shown on mobile and after the first touch.
    /// </summary>
    public sealed class WalkTouchControls : MonoBehaviour
    {
        [SerializeField] WalkerInput input;
        [Tooltip("Shared panel settings (Data/UI/HudPanel.asset).")]
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] float stickRadius = 110f;
        [SerializeField] float deadZone = 0.12f;
        [Tooltip("Look drag multiplier against mouse pixels.")]
        [SerializeField] float lookScale = 1.6f;
        [SerializeField] bool forceVisible;

        UIDocument _doc;
        VisualElement _root, _stickBase, _knob, _lookPad;
        Vector2 _axes, _lookDelta, _lookLast;
        bool _jump, _slide, _revealed, _suppressed;
        int _stickPointer = -1, _lookPointer = -1;
        Vector2 _stickCenter;

        public bool Visible => _root != null && _root.style.display == DisplayStyle.Flex;

        /// <summary>Hidden while the player drives, without forgetting that this is a touch device.</summary>
        public bool Suppressed
        {
            get => _suppressed;
            set
            {
                _suppressed = value;
                if (value && input != null) input.SetTouch(Vector2.zero, Vector2.zero, false, false);
                Refresh();
            }
        }

        public WalkerInput Input
        {
            get => input;
            set => input = value;
        }

        void Awake()
        {
            // Own child: a GameObject holds only one UIDocument, and the Player carries several panels.
            var host = new GameObject("WalkTouchUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = Core.Ui.UiPanel.Get(panelSettings);
            _doc.sortingOrder = 1;
        }

        void OnEnable()
        {
            Build(_doc.rootVisualElement);
            Core.Ui.UiPanel.Changed += Rebuild;
            Core.GameOptions.Changed += Rebuild;
            SetVisible(_revealed || forceVisible || Application.isMobilePlatform);
        }

        // A rebuild (rotation, options) keeps the hidden/shown state — once both pads showed in the car.
        void Rebuild()
        {
            Build(_doc.rootVisualElement);
            Refresh();
        }

        void OnDisable()
        {
            Core.Ui.UiPanel.Changed -= Rebuild;
            Core.GameOptions.Changed -= Rebuild;
            if (input != null) input.SetTouch(Vector2.zero, Vector2.zero, false, false);
        }

        public void SetVisible(bool on)
        {
            _revealed = on;
            Refresh();
        }

        void Refresh()
        {
            if (_root != null) _root.style.display = _revealed && !_suppressed ? DisplayStyle.Flex : DisplayStyle.None;
        }

        void Update()
        {
            if (!_revealed && Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed) SetVisible(true);
            if (!Visible || input == null) return;
            input.SetTouch(_axes, _lookDelta * lookScale, _jump, _slide);
            _lookDelta = Vector2.zero;
        }

        void Build(VisualElement doc)
        {
            doc.Clear();
            doc.style.position = Position.Absolute;
            doc.style.left = doc.style.right = doc.style.top = doc.style.bottom = 0;
            _root = new VisualElement { name = "walk-touch", pickingMode = PickingMode.Ignore };
            Fill(_root);
            doc.Add(_root);

            // Look pad first, so the buttons on top of it win their touches.
            _lookPad = new VisualElement { name = "look-pad" };
            _lookPad.style.position = Position.Absolute;
            _lookPad.style.right = _lookPad.style.top = _lookPad.style.bottom = 0;
            _lookPad.style.width = Length.Percent(55);
            _lookPad.RegisterCallback<PointerDownEvent>(e =>
            {
                if (_lookPointer >= 0) return;
                _lookPointer = e.pointerId;
                _lookPad.CapturePointer(e.pointerId);
                _lookLast = e.position;
            });
            _lookPad.RegisterCallback<PointerMoveEvent>(e =>
            {
                if (e.pointerId != _lookPointer) return;
                var p = (Vector2)e.position;
                // UI y grows downwards; dragging up looks up.
                _lookDelta += new Vector2(p.x - _lookLast.x, _lookLast.y - p.y);
                _lookLast = p;
            });
            void LookUp(int id)
            {
                if (id != _lookPointer) return;
                _lookPad.ReleasePointer(id);
                _lookPointer = -1;
            }
            _lookPad.RegisterCallback<PointerUpEvent>(e => LookUp(e.pointerId));
            _lookPad.RegisterCallback<PointerCancelEvent>(e => LookUp(e.pointerId));
            _root.Add(_lookPad);

            // ASTRA §10 sizes in CSS px (the drive pad's 128 px, 56–64 px buttons), mirrored for the left hand.
            var k = Core.GameOptions.ButtonScale;
            var mirror = Core.GameOptions.LeftHanded;
            var safe = Core.Ui.UiPanel.Safe;
            var bottom = safe.w + (Core.Ui.UiPanel.IsPortrait ? 28f : 20f);
            stickRadius = 64f * k;
            var d = stickRadius * 2f;
            _stickBase = Circle(d, new Color(1f, 1f, 1f, 0.12f), new Color(1f, 1f, 1f, 0.35f));
            Core.Ui.TouchKit.Place(_stickBase, (mirror ? safe.z : safe.x) + 16f, bottom, rightSide: false, mirror);
            _knob = Circle(d * 0.42f, new Color(1f, 1f, 1f, 0.45f), new Color(1f, 1f, 1f, 0.7f));
            _knob.pickingMode = PickingMode.Ignore;
            _stickBase.Add(_knob);
            CenterKnob();
            _stickBase.RegisterCallback<PointerDownEvent>(e =>
            {
                if (_stickPointer >= 0) return;
                _stickPointer = e.pointerId;
                _stickBase.CapturePointer(e.pointerId);
                _stickCenter = _stickBase.worldBound.center;
                MoveStick(e.position);
            });
            _stickBase.RegisterCallback<PointerMoveEvent>(e =>
            {
                if (e.pointerId == _stickPointer) MoveStick(e.position);
            });
            _stickBase.RegisterCallback<PointerUpEvent>(e => ReleaseStick(e.pointerId));
            _stickBase.RegisterCallback<PointerCancelEvent>(e => ReleaseStick(e.pointerId));
            _root.Add(_stickBase);

            var outer = (mirror ? safe.x : safe.z) + 16f;
            var jump = Button("JUMP", 64f * k, new Color(0.3f, 0.75f, 0.5f, 0.45f), on => _jump = on);
            Core.Ui.TouchKit.Place(jump, outer, bottom, rightSide: true, mirror);
            var slide = Button("SLIDE", 56f * k, new Color(0.95f, 0.45f, 0.2f, 0.45f), on => _slide = on);
            Core.Ui.TouchKit.Place(slide, outer + 64f * k + 8f * k, bottom, rightSide: true, mirror);
            _lookPad.style.right = mirror ? StyleKeyword.Auto : 0;
            _lookPad.style.left = mirror ? 0 : StyleKeyword.Auto;
        }

        static void Fill(VisualElement e)
        {
            e.style.position = Position.Absolute;
            e.style.left = e.style.right = e.style.top = e.style.bottom = 0;
        }

        static VisualElement Circle(float size, Color fill, Color border)
        {
            var c = new VisualElement();
            c.style.position = Position.Absolute;
            c.style.width = c.style.height = size;
            c.style.backgroundColor = fill;
            c.style.borderTopLeftRadius = c.style.borderTopRightRadius =
                c.style.borderBottomLeftRadius = c.style.borderBottomRightRadius = size / 2f;
            c.style.borderTopWidth = c.style.borderBottomWidth = c.style.borderLeftWidth = c.style.borderRightWidth = 3;
            c.style.borderTopColor = c.style.borderBottomColor = c.style.borderLeftColor = c.style.borderRightColor = border;
            return c;
        }

        VisualElement Button(string label, float size, Color fill, System.Action<bool> changed)
        {
            var b = Circle(size, fill, new Color(1f, 1f, 1f, 0.6f));
            var text = new Label(label) { pickingMode = PickingMode.Ignore };
            text.style.flexGrow = 1;
            text.style.unityTextAlign = TextAnchor.MiddleCenter;
            text.style.color = Color.white;
            text.style.fontSize = size * 0.22f;
            text.style.unityFontStyleAndWeight = FontStyle.Bold;
            b.Add(text);
            var pointer = -1;
            b.RegisterCallback<PointerDownEvent>(e =>
            {
                if (pointer >= 0) return;
                pointer = e.pointerId;
                b.CapturePointer(e.pointerId);
                b.style.opacity = 0.7f;
                changed(true);
                e.StopPropagation();
            });
            void Up(int id)
            {
                if (id != pointer) return;
                b.ReleasePointer(id);
                pointer = -1;
                b.style.opacity = 1f;
                changed(false);
            }
            b.RegisterCallback<PointerUpEvent>(e => Up(e.pointerId));
            b.RegisterCallback<PointerCancelEvent>(e => Up(e.pointerId));
            _root.Add(b);
            return b;
        }

        void MoveStick(Vector2 pointer)
        {
            var scale = _stickBase.worldBound.width / (stickRadius * 2f);
            var offset = (pointer - _stickCenter) / (stickRadius * scale);
            if (offset.magnitude > 1f) offset.Normalize();
            var axes = new Vector2(offset.x, -offset.y);
            _axes = axes.magnitude < deadZone ? Vector2.zero : axes;
            var r = stickRadius;
            _knob.style.left = r + offset.x * r * 0.75f - _knob.resolvedStyle.width / 2f;
            _knob.style.top = r + offset.y * r * 0.75f - _knob.resolvedStyle.height / 2f;
        }

        void ReleaseStick(int id)
        {
            if (id != _stickPointer) return;
            _stickBase.ReleasePointer(id);
            _stickPointer = -1;
            _axes = Vector2.zero;
            CenterKnob();
        }

        void CenterKnob()
        {
            var k = stickRadius * 2f * 0.42f;
            _knob.style.left = stickRadius - k / 2f;
            _knob.style.top = stickRadius - k / 2f;
        }
    }
}
