using System;
using System.IO;
using System.Runtime.InteropServices;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Regions;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Records
{
    /// <summary>
    /// Photo mode (P), ASTRA §11: the game pauses, a free camera starts at the current view and stays within a
    /// 100 m horizontal / 40 m vertical leash around the player. WASD move, Q/E down/up, right-drag look, wheel
    /// changes the speed, Enter saves a PNG without HUD at 2560 px wide (1920 on phones, same framing), Esc or P
    /// leaves. No reward, and nothing in the world moves or is discovered while it is open.
    /// PROVISIONAL: desktop controls only; touch controls come with the UI of Phase 9.
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
        [Tooltip("Camera speed range, m/s (mouse wheel), and the start value.")]
        [SerializeField] Vector3 speed = new(2f, 40f, 8f);
        [SerializeField] float lookDegreesPerPixel = 0.15f;

        UIDocument _doc;
        Label _hint;
        InputAction _toggle, _shoot, _back;
        CinemachineBrain _brain;
        Vector3 _anchor;
        float _yaw, _pitch, _speed, _savedScale = 1f;

        public bool IsOpen { get; private set; }
        /// <summary>Path or file name of the last photo (tests, toast).</summary>
        public string LastPhoto { get; private set; } = "";
        public Vector2Int LastSize { get; private set; }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void JapanMapDownload(string name, byte[] data, int length, string type);
#endif

        void Awake()
        {
            _doc = gameObject.AddComponent<UIDocument>();
            _doc.panelSettings = panelSettings;
            _doc.sortingOrder = 8;
            if (actions != null) _toggle = actions.FindActionMap("Player", true).FindAction("Photo", true);
            // Actions, not wasPressedThisFrame: a short press between two frames still counts.
            _shoot = new InputAction("PhotoShoot", InputActionType.Button, "<Keyboard>/enter");
            _shoot.AddBinding("<Keyboard>/numpadEnter");
            _back = new InputAction("PhotoBack", InputActionType.Button, "<Keyboard>/escape");
        }

        void OnEnable()
        {
            var root = _doc.rootVisualElement;
            root.Clear();
            root.pickingMode = PickingMode.Ignore;
            _hint = new Label("Photo mode   ·   WASD move · Q/E down/up · right-drag look · wheel speed · Enter save photo · Esc/P back");
            _hint.style.position = Position.Absolute;
            _hint.style.bottom = 24;
            _hint.style.left = _hint.style.right = 0;
            _hint.style.unityTextAlign = TextAnchor.MiddleCenter;
            _hint.style.fontSize = 18;
            _hint.style.color = Color.white;
            _hint.style.backgroundColor = new Color(0f, 0f, 0f, 0.45f);
            _hint.style.paddingTop = _hint.style.paddingBottom = 6;
            _hint.style.display = DisplayStyle.None;
            root.Add(_hint);
            if (_toggle != null)
            {
                _toggle.Enable();
                _toggle.performed += OnToggle;
            }
            _shoot.Enable();
            _shoot.performed += OnShoot;
            _back.Enable();
            _back.performed += OnBack;
        }

        void OnDisable()
        {
            if (_toggle != null) _toggle.performed -= OnToggle;
            _shoot.performed -= OnShoot;
            _shoot.Disable();
            _back.performed -= OnBack;
            _back.Disable();
        }

        void OnShoot(InputAction.CallbackContext _)
        {
            if (IsOpen) Capture();
        }

        void OnBack(InputAction.CallbackContext _)
        {
            if (IsOpen) Close();
        }

        void OnToggle(InputAction.CallbackContext _)
        {
            if (IsOpen) Close();
            else Open();
        }

        public void Open()
        {
            var cam = Camera.main;
            if (IsOpen || cam == null || player == null || player.Suspended) return;
            IsOpen = true;
            _anchor = player.Current == PlayerModeController.Mode.Driving && player.Car != null ? player.Car.transform.position
                : player.Walker != null ? player.Walker.transform.position : cam.transform.position;
            _savedScale = Time.timeScale;
            Time.timeScale = 0f;
            player.SetSuspended(true);
            // The camera is ours while the game is paused: Cinemachine would hold it at the last shot.
            _brain = cam.GetComponent<CinemachineBrain>();
            if (_brain != null) _brain.enabled = false;
            var e = cam.transform.eulerAngles;
            _yaw = e.y;
            _pitch = e.x > 180f ? e.x - 360f : e.x;
            _speed = speed.z;
            if (hud != null) hud.Hidden = true;
            _hint.style.display = DisplayStyle.Flex;
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            _hint.style.display = DisplayStyle.None;
            if (_brain != null) _brain.enabled = true;
            Time.timeScale = _savedScale;
            if (hud != null) hud.Hidden = false;
            player.SetSuspended(false);
        }

        void Update()
        {
            if (!IsOpen) return;
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            var dt = Time.unscaledDeltaTime;
            if (mouse != null)
            {
                if (mouse.rightButton.isPressed)
                {
                    var d = mouse.delta.ReadValue();
                    _yaw += d.x * lookDegreesPerPixel;
                    _pitch = Mathf.Clamp(_pitch - d.y * lookDegreesPerPixel, -85f, 85f);
                }
                var wheel = mouse.scroll.ReadValue().y;
                if (Mathf.Abs(wheel) > 0.01f) _speed = Mathf.Clamp(_speed * (wheel > 0f ? 1.2f : 1f / 1.2f), speed.x, speed.y);
            }
            var move = Vector3.zero;
            if (kb != null)
            {
                if (kb.wKey.isPressed) move.z += 1f;
                if (kb.sKey.isPressed) move.z -= 1f;
                if (kb.dKey.isPressed) move.x += 1f;
                if (kb.aKey.isPressed) move.x -= 1f;
                if (kb.eKey.isPressed) move.y += 1f;
                if (kb.qKey.isPressed) move.y -= 1f;
            }
            Step(move, dt);
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

        /// <summary>Renders the paused view into a large target (no HUD) and saves it as a PNG.</summary>
        public void Capture()
        {
            var cam = Camera.main;
            var width = Application.isMobilePlatform ? captureWidth.y : captureWidth.x;
            var height = Mathf.RoundToInt(width * (float)Screen.height / Mathf.Max(1, Screen.width));
            // Memory guard (ASTRA: check before allocating): fall back to the screen size if the large one fails.
            RenderTexture rt;
            try { rt = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32); }
            catch (Exception)
            {
                width = Screen.width;
                height = Screen.height;
                rt = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32);
            }
            var old = cam.targetTexture;
            var active = RenderTexture.active;
            byte[] png;
            try
            {
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;
                var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();
                png = tex.EncodeToPNG();
                Destroy(tex);
            }
            finally
            {
                cam.targetTexture = old;
                RenderTexture.active = active;
                RenderTexture.ReleaseTemporary(rt);
            }
            var name = FileName();
            LastSize = new Vector2Int(width, height);
#if UNITY_WEBGL && !UNITY_EDITOR
            JapanMapDownload(name, png, png.Length, "image/png");
            LastPhoto = name;
#else
            var dir = Path.Combine(Application.dataPath, "..", "Captures", "Photos");
            Directory.CreateDirectory(dir);
            LastPhoto = Path.GetFullPath(Path.Combine(dir, name));
            File.WriteAllBytes(LastPhoto, png);
#endif
            if (hud != null) hud.Flash($"Photo saved · {name}");
            Debug.Log($"[Photo] {name} {width}×{height}, {png.Length / 1024} KB");
        }

        /// <summary>japanMap_place_car_YYYY-MM-DD_HH-mm-ss.png (ASTRA §11).</summary>
        string FileName()
        {
            var place = regions != null && regions.Current >= 0 ? regions.Regions.regions[regions.Current].title : "Japan";
            var car = player.Car != null ? player.Car.Definition.displayName : "onfoot";
            return $"japanMap_{Clean(place)}_{Clean(car)}_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.png";
        }

        static string Clean(string s)
        {
            var sb = new System.Text.StringBuilder();
            foreach (var c in s) sb.Append(char.IsLetterOrDigit(c) ? c : c == ' ' || c == '-' ? '-' : '\0');
            return sb.ToString().Replace("\0", "");
        }
    }
}
