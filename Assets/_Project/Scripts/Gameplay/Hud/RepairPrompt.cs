using JapanMap.Core.Ui;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// A small REPAIR pill at the top centre while the player's car is visibly hurt (a real dent, a bent or lost wheel —
    /// not for a scratch: never a nag). A click or tap repairs at once and free, like the key T (D47); respawn, the
    /// garage and a new car repair anyway.
    /// </summary>
    public sealed class RepairPrompt : MonoBehaviour
    {
        PlayerModeController _player;
        UIDocument _doc;
        Button _pill;
        Label _key;
        bool _touch;
        VehicleController _damageCar; // the car _damage belongs to
        VehicleDamage _damage;

        /// <summary>Shown above this much damage (0…1) — or with any bent or lost wheel.</summary>
        public const float ShowFrom = 0.1f;

        public bool Visible => _pill != null && _pill.style.display == DisplayStyle.Flex;
        internal VisualElement Pill => _pill;

        public void Bind(PlayerModeController player, PanelSettings panel)
        {
            _player = player;
            var host = new GameObject("RepairPromptUi");
            host.transform.SetParent(transform, false);
            _doc = host.AddComponent<UIDocument>();
            _doc.panelSettings = UiPanel.Get(panel);
            _doc.sortingOrder = 4;
            Build();
            UiPanel.Changed += Build;
        }

        void OnDestroy() => UiPanel.Changed -= Build;

        void Build()
        {
            if (_doc == null) return;
            var root = _doc.rootVisualElement;
            root.Clear();
            root.pickingMode = PickingMode.Ignore;
            // A Button (clicks, taps, keyboard focus, play-script taps); its default skin replaced inline.
            _pill = new Button(Press) { name = "repair", text = "" };
            var s = _pill.style;
            s.marginLeft = s.marginRight = s.marginTop = s.marginBottom = 0f;
            s.position = Position.Absolute;
            if (UiPanel.IsPortrait)
            {
                // Upright the top centre is only the gap between minimap and instrument (the pill lay on the tacho):
                // right-aligned under the instrument, above the touch button row (UiPanel.PortraitButtonRow).
                s.top = 140f + UiPanel.Safe.y;
                s.right = 12f + UiPanel.Safe.z;
            }
            else
            {
                s.top = 16f + UiPanel.Safe.y;
                s.left = Length.Percent(50);
                s.translate = new Translate(Length.Percent(-50), 0);
            }
            s.flexDirection = FlexDirection.Row;
            s.alignItems = Align.Center;
            s.paddingLeft = s.paddingRight = 16f;
            s.height = 40f;
            s.borderTopLeftRadius = s.borderTopRightRadius = s.borderBottomLeftRadius = s.borderBottomRightRadius = 20f;
            s.backgroundColor = new Color(0.06f, 0.07f, 0.1f, 0.72f);
            s.borderLeftWidth = s.borderRightWidth = s.borderTopWidth = s.borderBottomWidth = 1.5f;
            var gold = new Color(0.95f, 0.77f, 0.42f, 0.95f);
            s.borderLeftColor = s.borderRightColor = s.borderTopColor = s.borderBottomColor = gold;
            var label = new Label("REPAIR");
            label.style.color = gold;
            label.style.fontSize = 17f;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            label.style.letterSpacing = 1.5f;
            label.pickingMode = PickingMode.Ignore;
            _pill.Add(label);
            _key = new Label("T");
            _key.style.marginLeft = 10f;
            _key.style.color = new Color(1f, 1f, 1f, 0.8f);
            _key.style.fontSize = 13f;
            _key.style.paddingLeft = _key.style.paddingRight = 6f;
            _key.style.borderLeftWidth = _key.style.borderRightWidth = _key.style.borderTopWidth = _key.style.borderBottomWidth = 1f;
            _key.style.borderLeftColor = _key.style.borderRightColor = _key.style.borderTopColor = _key.style.borderBottomColor = new Color(1f, 1f, 1f, 0.5f);
            _key.style.borderTopLeftRadius = _key.style.borderTopRightRadius = _key.style.borderBottomLeftRadius = _key.style.borderBottomRightRadius = 4f;
            _key.pickingMode = PickingMode.Ignore;
            _pill.Add(_key);
            _pill.RegisterCallback<PointerDownEvent>(e => _touch |= e.pointerType == "touch", TrickleDown.TrickleDown);
            _pill.style.display = DisplayStyle.None;
            root.Add(_pill);
        }

        /// <summary>The pill's action: repair now (tests press it like a player).</summary>
        public void Press() => _player?.Driver?.PressRepair();

        Intro.FirstDrive _intro;
        bool _introLooked;

        void Update()
        {
            if (_pill == null) return;
            var car = _player != null ? _player.Car : null;
            // GetComponent only when the car changes (respawn, garage, new car), not every frame.
            if (car != _damageCar) { _damageCar = car; _damage = car != null ? car.GetComponent<VehicleDamage>() : null; }
            var damage = _damage;
            // Not during the first drive: its step bar owns the top centre (the pill lay on it, UI audit 2026-10-21).
            if (!_introLooked) { _intro = FindAnyObjectByType<Intro.FirstDrive>(); _introLooked = true; }
            var intro = _intro != null && _intro.Current != Intro.FirstDrive.Beat.Off;
            var show = damage != null && !intro && !_player.Suspended && _player.Current == PlayerModeController.Mode.Driving
                       && (damage.Damage01 >= ShowFrom || damage.BentWheels > 0 || damage.WheelsLost > 0);
            _pill.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
            // The key hint only where there is a keyboard.
            _key.style.display = _touch || Application.isMobilePlatform ? DisplayStyle.None : DisplayStyle.Flex;
        }
    }
}
