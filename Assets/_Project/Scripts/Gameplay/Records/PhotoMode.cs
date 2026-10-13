using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Records
{
    /// <summary>
    /// Photo mode (P or the Photo tab), ASTRA §11: the game pauses, a free camera starts at the current view inside a
    /// 100 m / 40 m leash around the player. Desktop: WASD, Space/E up, C/Q down, Shift fast, drag with any mouse
    /// button to look (a trackpad has no comfortable right-drag), wheel = zoom, Enter = capture, Esc = exit. Touch: a movement pad on the left, look by dragging on the right, large Up/Down buttons,
    /// two-finger pinch for the framing (field of view), Capture / Hide UI / Reset camera / Exit in a bottom strip.
    /// A capture renders a PNG without HUD at 2560 px wide (phone 1920; desktop may choose 3840), same framing, and
    /// shows the result: Download PNG (a deliberate tap in the browser), Retake, Return to game. If the large target
    /// cannot be made, the preview stays and "Capture smaller" offers the screen size. No reward; nothing moves.
    /// </summary>
    public sealed class PhotoMode : MonoBehaviour
    {
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerProgress progress;
        [SerializeField] RegionWatch regions;
        [SerializeField] GameplayHud hud;
        [SerializeField] PanelSettings panelSettings;
        [SerializeField] InputActionAsset actions;
        [Tooltip("Leash around the player: horizontal and vertical, m (ASTRA: 100 / 40).")]
        [SerializeField] Vector2 leash = new(100f, 40f);
        [Tooltip("Capture width on desktop and on phones, px (ASTRA: 2560 / 1920); height keeps the screen's framing.")]
        [SerializeField] Vector2Int captureWidth = new(2560, 1920);
        [Tooltip("The explicit large option on desktop, px (ASTRA: 3840).")]
        [SerializeField] int captureWidthLarge = 3840;
        [Tooltip("Camera speed: slowest, fastest (Shift), start value, m/s.")]
        [SerializeField] Vector3 speed = new(2f, 40f, 8f);
        [SerializeField] float lookDegreesPerPixel = 0.15f;
        [Tooltip("Field of view range for the wheel and the pinch, degrees (legacy: 18–90).")]
        [SerializeField] Vector2 fovRange = new(18f, 90f);
        [Tooltip("Field of view change per wheel notch, as a factor.")]
        [SerializeField] float zoomPerNotch = 1.08f;

        UIDocument _doc;
        VisualElement _root, _strip, _pad, _knob, _lookArea, _result, _resultImage, _touchLayer;
        Label _hint, _resultText;
        Button _hide;
        InputAction _toggle, _shoot;
        CinemachineBrain _brain;
        Vector3 _anchor, _startPos;
        Quaternion _startRot;
        float _yaw, _pitch, _speed, _savedScale = 1f, _fov, _startFov, _pinchStart, _fovAtPinch;
        Vector2 _padAxes;
        int _padPointer = -1;
        float _vertical;
        bool _uiHidden;
        readonly Dictionary<int, Vector2> _look = new();
        byte[] _png;
        Texture2D _preview;

        public bool IsOpen { get; private set; }
        public bool ShowingResult => _result != null && _result.style.display == DisplayStyle.Flex;
        /// <summary>Path or file name of the last photo (tests, toast).</summary>
        public string LastPhoto { get; private set; } = "";
        public Vector2Int LastSize { get; private set; }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void JapanMapDownload(string name, byte[] data, int length, string type);
#endif

        void Awake()
        {
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panelSettings);
            _doc.sortingOrder = 8;
            if (actions != null) _toggle = actions.FindActionMap("Player", true).FindAction("Photo", true);
            // Actions, not wasPressedThisFrame: a short press between two frames still counts.
            _shoot = new InputAction("PhotoShoot", InputActionType.Button, "<Keyboard>/enter");
            _shoot.AddBinding("<Keyboard>/numpadEnter");
        }

        void OnEnable()
        {
            Build();
            UiPanel.Changed += Build;
            if (_toggle != null)
            {
                _toggle.Enable();
                _toggle.performed += OnToggle;
            }
            _shoot.Enable();
            _shoot.performed += OnShoot;
        }

        void OnDisable()
        {
            UiPanel.Changed -= Build;
            if (_toggle != null) _toggle.performed -= OnToggle;
            _shoot.performed -= OnShoot;
            _shoot.Disable();
            if (_preview != null) Destroy(_preview);
        }

        void OnShoot(InputAction.CallbackContext _)
        {
            if (IsOpen && !ShowingResult) Capture();
        }

        void OnToggle(InputAction.CallbackContext _)
        {
            if (IsOpen) Close();
            else Open();
        }

        // ── the screen ───────────────────────────────────────────────────────

        void Build()
        {
            var open = IsOpen;
            _root = _doc.rootVisualElement;
            _root.Clear();
            _root.AddToClassList("jm-fill");
            _root.pickingMode = PickingMode.Ignore;
            _root.EnableInClassList("jm-phone", UiPanel.IsPhone);
            var safe = UiPanel.Safe;

            // Touch: look by dragging anywhere that is not a control; pinch = framing.
            _lookArea = Ui.Box(_root, "jm-fill");
            _lookArea.name = "photo-look";
            _lookArea.RegisterCallback<PointerDownEvent>(e => { _look[e.pointerId] = e.position; _lookArea.CapturePointer(e.pointerId); if (_look.Count == 2) { _pinchStart = Pinch(); _fovAtPinch = _fov; } });
            _lookArea.RegisterCallback<PointerMoveEvent>(e =>
            {
                if (!_look.TryGetValue(e.pointerId, out var last) || !IsOpen || ShowingResult) return;
                _look[e.pointerId] = e.position;
                if (_look.Count >= 2)
                {
                    var d = Pinch();
                    if (_pinchStart > 1f && d > 1f) _fov = Mathf.Clamp(_fovAtPinch * _pinchStart / d, fovRange.x, fovRange.y);
                    return;
                }
                // Any pointer drags the view: mouse (any button), pen, finger.
                var delta = (Vector2)e.position - last;
                _yaw += delta.x * lookDegreesPerPixel * 1.4f;
                _pitch = Mathf.Clamp(_pitch + delta.y * lookDegreesPerPixel * 1.4f, -85f, 85f);
            });
            // Wheel up = closer (narrower view), like every photo mode (UI Toolkit: delta.y < 0 is wheel up).
            _lookArea.RegisterCallback<WheelEvent>(e =>
            {
                if (!IsOpen || ShowingResult || Mathf.Abs(e.delta.y) < 0.01f) return;
                _fov = Mathf.Clamp(_fov * (e.delta.y < 0f ? 1f / zoomPerNotch : zoomPerNotch), fovRange.x, fovRange.y);
                e.StopPropagation();
            });
            void Up(int id) { _look.Remove(id); if (_lookArea.HasPointerCapture(id)) _lookArea.ReleasePointer(id); }
            _lookArea.RegisterCallback<PointerUpEvent>(e => Up(e.pointerId));
            _lookArea.RegisterCallback<PointerCancelEvent>(e => Up(e.pointerId));

            _touchLayer = Ui.Box(_root, "jm-fill");
            _touchLayer.pickingMode = PickingMode.Ignore;
            // Movement pad, lower left.
            var padSize = UiPanel.IsPhone ? 128f : 150f;
            _pad = Ui.Box(_touchLayer, "jm-touch");
            _pad.name = "photo-pad";
            _pad.style.width = _pad.style.height = padSize;
            _pad.style.left = 16 + safe.x;
            _pad.style.bottom = (UiPanel.IsPhone ? 84 : 90) + safe.w;
            _knob = Ui.Box(_pad, "jm-touch");
            _knob.pickingMode = PickingMode.Ignore;
            _knob.style.width = _knob.style.height = padSize * 0.42f;
            _knob.style.left = _knob.style.top = padSize * 0.29f;
            _pad.RegisterCallback<PointerDownEvent>(e => { if (_padPointer >= 0) return; _padPointer = e.pointerId; _pad.CapturePointer(e.pointerId); Pad(e.position); e.StopPropagation(); });
            _pad.RegisterCallback<PointerMoveEvent>(e => { if (e.pointerId == _padPointer) Pad(e.position); });
            void PadUp(int id)
            {
                if (id != _padPointer) return;
                _pad.ReleasePointer(id);
                _padPointer = -1;
                _padAxes = Vector2.zero;
                _knob.style.left = _knob.style.top = padSize * 0.29f;
            }
            _pad.RegisterCallback<PointerUpEvent>(e => PadUp(e.pointerId));
            _pad.RegisterCallback<PointerCancelEvent>(e => PadUp(e.pointerId));

            // Up / Down, large, lower right.
            Hold(_touchLayer, "UP", 64f, right: 16 + safe.z, bottom: 164 + safe.w, on => _vertical = on ? 1f : _vertical > 0f ? 0f : _vertical);
            Hold(_touchLayer, "DOWN", 64f, right: 16 + safe.z, bottom: 88 + safe.w, on => _vertical = on ? -1f : _vertical < 0f ? 0f : _vertical);

            // Bottom strip: Capture, Hide UI, Reset camera, Exit.
            _strip = Ui.Row(_root, "jm-wrap");
            _strip.name = "photo-strip";
            _strip.style.position = Position.Absolute;
            _strip.style.left = 0;
            _strip.style.right = 0;
            _strip.style.bottom = 12 + safe.w;
            _strip.style.justifyContent = Justify.Center;
            Ui.Button(_strip, "Capture", Capture, "jm-btn--primary");
            if (!UiPanel.IsPhone) Ui.Button(_strip, $"Capture {captureWidthLarge}", () => Capture(captureWidthLarge));
            _hide = Ui.Button(_strip, "Hide UI", ToggleUi);
            Ui.Button(_strip, UiPanel.IsPhone ? "Reset" : "Reset camera", ResetCamera);
            Ui.Button(_strip, "Exit", Close);

            _hint = new Label(UiPanel.IsPhone ? "Photo · left pad moves · drag to look · pinch to frame" : "Photo  ·  drag to look · WASD move · Space/C up/down · Shift fast · wheel zoom · Enter capture · Esc exit");
            _hint.AddToClassList("jm-small");
            _hint.AddToClassList("jm-plate");
            _hint.style.position = Position.Absolute;
            _hint.style.top = 12 + safe.y;
            _hint.style.alignSelf = Align.Center;
            _hint.style.maxWidth = Length.Percent(92);
            _hint.pickingMode = PickingMode.Ignore;
            _root.Add(_hint);

            // Result: the picture, its size, Download / Retake / Return.
            _result = Ui.Box(_root, "jm-fill", "jm-center");
            _result.style.backgroundColor = new Color(0f, 0f, 0f, 0.6f);
            var panel = Ui.Box(_result, "jm-panel", "jm-sheet");
            panel.style.maxWidth = 900;
            Ui.H2(panel, "Photo");
            _resultImage = Ui.Box(panel, "jm-pic");
            _resultImage.style.height = UiPanel.IsPortrait ? 200 : 300;
            _resultImage.style.marginBottom = 8;
            _resultText = Ui.Small(panel, "");
            var row = Ui.Row(panel, "jm-wrap");
            Ui.Button(row, "Download PNG", Download, "jm-btn--primary");
            Ui.Button(row, "Retake", () => Ui.Show(_result, false));
            Ui.Button(row, "Return to game", Close);
            Ui.Show(_result, false);

            ShowControls(open);
        }

        void ShowControls(bool open)
        {
            _root.style.display = open ? DisplayStyle.Flex : DisplayStyle.None;
            var touch = UiPanel.IsPhone || Touchscreen.current != null;
            Ui.Show(_touchLayer, open && touch && !_uiHidden);
            Ui.Show(_strip, open && !_uiHidden);
            Ui.Show(_hint, open && !_uiHidden);
        }

        void Hold(VisualElement parent, string label, float size, float right, float bottom, Action<bool> changed)
        {
            var b = Ui.Box(parent, "jm-touch");
            b.style.width = b.style.height = size;
            b.style.right = right;
            b.style.bottom = bottom;
            b.Add(new Label(label) { pickingMode = PickingMode.Ignore });
            var pointer = -1;
            b.RegisterCallback<PointerDownEvent>(e => { if (pointer >= 0) return; pointer = e.pointerId; b.CapturePointer(pointer); changed(true); b.AddToClassList("jm-touch--down"); e.StopPropagation(); });
            void Up(int id) { if (id != pointer) return; b.ReleasePointer(id); pointer = -1; changed(false); b.RemoveFromClassList("jm-touch--down"); }
            b.RegisterCallback<PointerUpEvent>(e => Up(e.pointerId));
            b.RegisterCallback<PointerCancelEvent>(e => Up(e.pointerId));
        }

        void Pad(Vector2 pointer)
        {
            var r = _pad.worldBound;
            var off = (pointer - r.center) / (r.width * 0.5f);
            if (off.magnitude > 1f) off.Normalize();
            _padAxes = off.magnitude < 0.12f ? Vector2.zero : new Vector2(off.x, -off.y);
            _knob.style.left = _pad.resolvedStyle.width * (0.29f + off.x * 0.3f);
            _knob.style.top = _pad.resolvedStyle.height * (0.29f + off.y * 0.3f);
        }

        float Pinch()
        {
            var e = _look.Values.GetEnumerator();
            e.MoveNext();
            var a = e.Current;
            e.MoveNext();
            return Vector2.Distance(a, e.Current);
        }

        void ToggleUi()
        {
            _uiHidden = !_uiHidden;
            // A small "Show UI" stays so a finger can bring the controls back.
            _hide.text = _uiHidden ? "Show UI" : "Hide UI";
            ShowControls(true);
            if (_uiHidden)
            {
                Ui.Show(_strip, true);
                foreach (var c in _strip.Children()) Ui.Show(c, c == _hide);
            }
            else foreach (var c in _strip.Children()) Ui.Show(c, true);
        }

        // ── open / close ─────────────────────────────────────────────────────

        public void Open()
        {
            var cam = Camera.main;
            if (IsOpen || cam == null || player == null || player.Suspended) return;
            IsOpen = true;
            _anchor = player.Current == PlayerModeController.Mode.Driving && player.Car != null ? player.Car.transform.position
                : player.Walker != null ? player.Walker.transform.position : cam.transform.position;
            _savedScale = Time.timeScale;
            Time.timeScale = 0f;
            AudioListener.pause = true;
            player.SetSuspended(true);
            // The camera is ours while the game is paused: Cinemachine would hold it at the last shot.
            _brain = cam.GetComponent<CinemachineBrain>();
            if (_brain != null) _brain.enabled = false;
            _startPos = cam.transform.position;
            _startRot = cam.transform.rotation;
            _startFov = _fov = cam.fieldOfView;
            ResetCamera();
            _speed = speed.z;
            _uiHidden = false;
            if (hud != null) hud.Hidden = true;
            ShowControls(true);
            Ui.Show(_result, false);
            UiStack.Push(this, Back); // Esc: result → back to framing; framing → leave
            UnityEngine.Cursor.lockState = CursorLockMode.None;
            UnityEngine.Cursor.visible = true;
        }

        void Back()
        {
            if (ShowingResult)
            {
                Ui.Show(_result, false);
                UiStack.Push(this, Back);
                return;
            }
            Close();
        }

        void ResetCamera()
        {
            var cam = Camera.main;
            if (cam == null) return;
            cam.transform.SetPositionAndRotation(_startPos, _startRot);
            var e = _startRot.eulerAngles;
            _yaw = e.y;
            _pitch = e.x > 180f ? e.x - 360f : e.x;
            _fov = _startFov;
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            UiStack.Pop(this);
            var cam = Camera.main;
            if (cam != null) cam.fieldOfView = _startFov;
            if (_brain != null) _brain.enabled = true;
            Time.timeScale = _savedScale <= 0f ? 1f : _savedScale;
            AudioListener.pause = false;
            if (hud != null) hud.Hidden = false;
            ShowControls(false);
            player.SetSuspended(false);
        }

        void Update()
        {
            if (!IsOpen || ShowingResult) return;
            var kb = Keyboard.current;
            var dt = Time.unscaledDeltaTime;
            var move = new Vector3(_padAxes.x, _vertical, _padAxes.y);
            if (kb != null)
            {
                if (kb.wKey.isPressed) move.z += 1f;
                if (kb.sKey.isPressed) move.z -= 1f;
                if (kb.dKey.isPressed) move.x += 1f;
                if (kb.aKey.isPressed) move.x -= 1f;
                if (kb.eKey.isPressed || kb.spaceKey.isPressed) move.y += 1f;
                if (kb.qKey.isPressed || kb.cKey.isPressed) move.y -= 1f;
            }
            var fast = kb != null && kb.shiftKey.isPressed;
            _speed = fast ? speed.y * 0.5f : speed.z;
            Step(move, dt);
            var cam = Camera.main;
            if (cam != null) cam.fieldOfView = _fov;
        }

        /// <summary>One camera step: move along the view's heading, then hold it inside the leash.</summary>
        public void Step(Vector3 move, float dt)
        {
            var t = Camera.main.transform;
            var rot = Quaternion.Euler(_pitch, _yaw, 0f);
            var flat = Quaternion.Euler(0f, _yaw, 0f);
            var p = t.position + (flat * new Vector3(move.x, 0f, move.z) + Vector3.up * move.y) * _speed * dt;
            var off = p - _anchor;
            var h = new Vector2(off.x, off.z);
            if (h.magnitude > leash.x) h = h.normalized * leash.x;
            off = new Vector3(h.x, Mathf.Clamp(off.y, -leash.y, leash.y), h.y);
            t.SetPositionAndRotation(_anchor + off, rot);
        }

        // ── capture ──────────────────────────────────────────────────────────

        public void Capture() => Capture(Application.isMobilePlatform || UiPanel.IsPhone ? captureWidth.y : captureWidth.x);

        /// <summary>Renders the paused view into a large target (no HUD), keeps the PNG and shows the result.</summary>
        public void Capture(int width)
        {
            var cam = Camera.main;
            if (cam == null) return;
            var height = Mathf.RoundToInt(width * (float)Screen.height / Mathf.Max(1, Screen.width));
            var smaller = width > SystemInfo.maxTextureSize || height > SystemInfo.maxTextureSize;
            // Memory guard (ASTRA: check before allocating): fall back to the screen size if the large one fails.
            if (!smaller)
                try { Shoot(cam, width, height); }
                catch (Exception) { smaller = true; }
            if (smaller)
            {
                width = Screen.width;
                height = Screen.height;
                Shoot(cam, width, height);
            }
            LastSize = new Vector2Int(width, height);
            var name = FileName();
            LastPhoto = name;
#if !UNITY_WEBGL || UNITY_EDITOR
            // Editor and desktop: straight into Captures/Photos; the browser downloads on a deliberate tap.
            var dir = Path.Combine(Application.dataPath, "..", "Captures", "Photos");
            Directory.CreateDirectory(dir);
            LastPhoto = Path.GetFullPath(Path.Combine(dir, name));
            File.WriteAllBytes(LastPhoto, _png);
#endif
            Audio.Sfx.Play("UI_Click");
            _resultImage.style.backgroundImage = new StyleBackground(_preview);
            _resultText.text = $"{width} × {height} px · {_png.Length / 1024:N0} KB{(smaller ? " · smaller: the large size was not available" : "")}"
#if !UNITY_WEBGL || UNITY_EDITOR
                + $"\nSaved: {LastPhoto}"
#endif
                ;
            Ui.Show(_result, true);
            Debug.Log($"[Photo] {name} {width}×{height}, {_png.Length / 1024} KB");
        }

        void Shoot(Camera cam, int width, int height)
        {
            // HDR render + gamma blit: the 8-bit target of before lost the bloom (photos without neon glow).
            if (_preview != null) Destroy(_preview);
            _preview = Core.CameraShot.Render(cam, width, height);
            _preview.name = "Photo (runtime)";
            _png = _preview.EncodeToPNG();
        }

        /// <summary>Hands the PNG to the browser (or saves it again on desktop).</summary>
        public void Download()
        {
            if (_png == null) return;
#if UNITY_WEBGL && !UNITY_EDITOR
            JapanMapDownload(Path.GetFileName(LastPhoto), _png, _png.Length, "image/png");
#else
            File.WriteAllBytes(LastPhoto, _png);
#endif
            if (hud != null) hud.Flash($"Photo saved · {Path.GetFileName(LastPhoto)}");
        }

        /// <summary>Ameagari-Drive_place_car_YYYY-MM-DD_HH-mm-ss.png (ASTRA §11); the prefix is the build's product name.</summary>
        string FileName()
        {
            var place = regions != null && regions.Current >= 0 ? regions.Regions.regions[regions.Current].title : "Japan";
            var car = player.Car != null ? player.Car.Definition.displayName : "onfoot";
            return $"{Clean(Application.productName)}_{Clean(place)}_{Clean(car)}_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.png";
        }

        static string Clean(string s)
        {
            var sb = new System.Text.StringBuilder();
            foreach (var c in s) sb.Append(char.IsLetterOrDigit(c) ? c : c == ' ' || c == '-' ? '-' : '\0');
            return sb.ToString().Replace("\0", "");
        }
    }
}
