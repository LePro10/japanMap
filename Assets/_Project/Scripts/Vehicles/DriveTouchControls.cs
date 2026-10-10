using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// On-screen driving controls for phones and tablets (UI Toolkit, D05): a stick on the left
    /// (sideways = steer, up = throttle, down = brake/reverse — the legacy TouchControls layout) and
    /// handbrake and nitro on the right, respawn and camera small at the top. Each control tracks its
    /// own pointer, so steering and handbrake work at the same time. Shown on mobile and after the
    /// first touch; feeds <see cref="DriverInput.SetTouch"/>.
    /// </summary>
    public sealed class DriveTouchControls : MonoBehaviour
    {
        [SerializeField] DriverInput driver;
        [Tooltip("Shared panel settings (Data/UI/HudPanel.asset).")]
        [SerializeField] PanelSettings panelSettings;
        [Tooltip("Stick radius in reference pixels (1080 p).")]
        [SerializeField] float stickRadius = 110f;
        [Tooltip("Stick travel below which nothing happens (share of radius).")]
        [SerializeField] float deadZone = 0.12f;
        [SerializeField] bool forceVisible;

        UIDocument _doc;
        VisualElement _root, _stickBase, _knob;
        Vector2 _axes;
        bool _handbrake, _boost;
        int _stickPointer = -1;
        Vector2 _stickCenter;

        internal VisualElement Stick => _stickBase;
        internal VisualElement DriftButton { get; private set; }
        internal Vector2 Axes => _axes;
        bool _revealed, _suppressed;

        public bool Visible => _root != null && _root.style.display == DisplayStyle.Flex;

        /// <summary>Hidden while the player is on foot, without forgetting that this is a touch device.</summary>
        public bool Suppressed
        {
            get => _suppressed;
            set
            {
                _suppressed = value;
                if (value && driver != null) driver.SetTouch(Vector2.zero, false, false);
                Refresh();
            }
        }

        void Awake()
        {
            // Own child: a GameObject holds only one UIDocument, and the Player carries several panels.
            var host = new GameObject("DriveTouchUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = Core.Ui.UiPanel.Get(panelSettings);
        }

        void OnEnable()
        {
            Build(_doc.rootVisualElement);
            SetVisible(_revealed || forceVisible || Application.isMobilePlatform);
        }

        void Update()
        {
            // A touch anywhere reveals the controls (touch laptops, tablets in a desktop browser).
            if (!_revealed && Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed) SetVisible(true);
            if (Visible && driver != null) driver.SetTouch(_axes, _handbrake, _boost);
        }

        void OnDisable()
        {
            if (driver != null) driver.SetTouch(Vector2.zero, false, false);
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

        void Build(VisualElement doc)
        {
            doc.Clear();
            // The document root has no height of its own; without this, bottom-anchored controls sit off screen.
            doc.style.position = Position.Absolute;
            doc.style.left = doc.style.right = doc.style.top = doc.style.bottom = 0;
            _root = new VisualElement { name = "drive-touch", pickingMode = PickingMode.Ignore };
            _root.style.position = Position.Absolute;
            _root.style.left = _root.style.right = _root.style.top = _root.style.bottom = 0;
            doc.Add(_root);

            // ── Stick ─────────────────────────────────────────────────────────
            var d = stickRadius * 2f;
            _stickBase = Circle(d, new Color(1f, 1f, 1f, 0.12f), new Color(1f, 1f, 1f, 0.35f));
            _stickBase.style.left = 90;
            _stickBase.style.bottom = 90;
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

            // ── Buttons ───────────────────────────────────────────────────────
            var drift = Button("DRIFT", 190, new Color(0.95f, 0.45f, 0.2f, 0.45f), on => _handbrake = on);
            DriftButton = drift;
            drift.style.right = 80;
            drift.style.bottom = 80;
            var nitro = Button("NITRO", 140, new Color(0.3f, 0.7f, 1f, 0.45f), on => _boost = on);
            nitro.style.right = 300;
            nitro.style.bottom = 60;
            var respawn = Button("RESET", 84, new Color(1f, 1f, 1f, 0.25f), on => { if (on) driver?.PressRespawn(); });
            respawn.style.right = 40;
            respawn.style.top = 40;
            var cam = Button("CAM", 84, new Color(1f, 1f, 1f, 0.25f), on => { if (on) driver?.PressCamera(); });
            cam.style.right = 140;
            cam.style.top = 40;
        }

        VisualElement Circle(float size, Color fill, Color border)
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
            // UI y grows downwards; up on the screen is throttle.
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
