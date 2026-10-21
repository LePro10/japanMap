using System.Linq;
using System.Text;
using JapanMap.Audio;
using JapanMap.Core;
using JapanMap.Core.Platform;
using JapanMap.Core.Save;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Progress;
using JapanMap.UI;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Settings (ASTRA §10, tidied D55): three tabs — Controls (steering, camera, shake; vibration only with a gamepad,
    /// the touch rows only on touch devices; "Change keys" opens the key list as its own level), Display (quality first,
    /// UI scale, units, reduced motion) and Sound (master, five groups). The save line sits at the foot of every page.
    /// Values are always visible and apply at once; per device (<see cref="GameOptions"/>).
    /// Key rebinding uses the Input System's interactive rebinding; Escape cancels a capture.
    /// </summary>
    public sealed class SettingsScreen : MenuScreen
    {
        public static readonly string[] Pages = { "Controls", "Display", "Sound" };
        readonly InputActionAsset _actions;
        readonly PlayerProgress _progress;
        int _page;
        bool _keys;
        string _text = "";
        InputActionRebindingExtensions.RebindingOperation _rebind;

        // Camera presets over GameOptions.ChaseDistance (4–8 m): three words instead of a metre slider nobody reads.
        static readonly string[] CameraNames = { "Near", "Mid", "Far" };
        static readonly float[] CameraDistances = { 4.5f, 6f, 7.5f };

        // Rebindable actions (ASTRA §10 list; Map/Menu/Photo keys stay fixed so the player can never lock themselves out).
        static readonly (string map, string action, string label)[] Keys =
        {
            ("Drive", "Throttle", "Throttle"), ("Drive", "Brake", "Brake / reverse"), ("Drive", "Handbrake", "Handbrake / drift"),
            ("Drive", "Boost", "Boost"), ("Drive", "Respawn", "Recover"), ("Drive", "Camera", "Camera"), ("Drive", "Headlights", "Headlights"),
            ("Player", "Vehicle", "Enter / exit car"), ("Player", "Use", "Use"), ("Player", "CallCar", "Call car"),
            ("Walk", "Jump", "Jump"), ("Walk", "Sprint", "Run"), ("Walk", "Slide", "Slide"),
        };

        public SettingsScreen(InputActionAsset actions, PlayerProgress progress)
        {
            _actions = actions;
            _progress = progress;
        }

        public override string Title => "Settings";
        public override Icon Icon => Icon.Settings;
        public override string Text => _text;

        /// <summary>The tab shown (0 Controls, 1 Display, 2 Sound).</summary>
        public int Page => _page;
        /// <summary>The key list ("Change keys") is open.</summary>
        public bool KeysOpen => _keys;

        /// <summary>Shows a tab (or the key list) — pictures of every page (UiShots).</summary>
        public void ShowPage(int page, bool keys = false)
        {
            _page = Mathf.Clamp(page, 0, Pages.Length - 1);
            _keys = keys;
            Menu?.Rebuild();
        }

        /// <summary>Touch rows only where there is touch: a desktop player never needs "Touch hand".</summary>
        public static bool HasTouch => Touchscreen.current != null || UiPanel.IsPhone;

        float _cancelledAt = -1f;

        // Escape during a key capture cancels the capture, not the menu; on the key list it goes back to Controls.
        public override bool Back()
        {
            if (_rebind != null || Time.unscaledTime - _cancelledAt < 0.25f) return true;
            if (!_keys) return false;
            _keys = false;
            Menu.Rebuild();
            return true;
        }

        public override void Closed()
        {
            _rebind?.Cancel();
            _rebind = null;
            _keys = false;
        }

        public override void Build(VisualElement body)
        {
            var t = new StringBuilder();
            if (_keys)
            {
                var head = Ui.Row(body, "jm-wrap");
                Ui.Button(head, "‹ Back", () => Back()).name = "settings-keys-back";
                Ui.H1(head, "Keys");
                t.AppendLine("page Keys");
                KeyList(Ui.Box(body, "jm-panel"), t);
            }
            else
            {
                Ui.H1(body, "Settings");
                var tabs = Ui.Row(body, "jm-wrap", "nm-tabs");
                for (var i = 0; i < Pages.Length; i++)
                {
                    var index = i;
                    // A holder per tab: a child inside the button would stop it measuring its text (clipped label).
                    var holder = Ui.Box(tabs, "nm-tab__holder");
                    var tab = Ui.Button(holder, Pages[i], () => { _page = index; Menu.Rebuild(); }, "nm-tab");
                    tab.name = "settings-tab-" + Pages[i].ToLowerInvariant();
                    Ui.On(tab, _page == i);
                    if (_page == i) Underline(holder);
                }
                t.AppendLine("tabs " + string.Join(" ", Pages));
                t.AppendLine("page " + Pages[_page]);
                var page = Ui.Box(body, "jm-panel");
                switch (_page)
                {
                    case 0: Controls(page, t); break;
                    case 1: Display(page, t); break;
                    default: Sound(page, t); break;
                }
            }
            Saved(body, t);
            _text = t.ToString();
        }

        /// <summary>The slanted pink bar under the open tab (the same stroke as the menu's tab marker).</summary>
        static void Underline(VisualElement holder)
        {
            var bar = Ui.Add(holder, new Slant { Lean = 4f }, "nm-tab__bar");
            bar.style.position = Position.Absolute;
            bar.style.left = 6;
            bar.style.right = 6;
            bar.style.bottom = 2;
            bar.style.height = 4;
        }

        void Controls(VisualElement p, StringBuilder t)
        {
            Ui.SliderRow(p, "Steering", 50f, 150f, GameOptions.Steering * 100f, v => $"{v:0} %", v => GameOptions.Steering = Mathf.Round(v) / 100f);
            var cam = NearestCamera(GameOptions.ChaseDistance);
            Ui.ChoiceRow(p, "Camera", CameraNames, cam, i => GameOptions.ChaseDistance = CameraDistances[i]);
            Ui.ChoiceRow(p, "Camera shake", new[] { "Off", "Low", "Full" }, GameOptions.CameraShake, i => GameOptions.CameraShake = i);
            t.AppendLine($"Steering {GameOptions.Steering * 100f:0} %");
            t.AppendLine($"Camera {CameraNames[cam]}");
            if (Gamepad.current != null)
            {
                Ui.ChoiceRow(p, "Controller vibration", new[] { "Off", "On" }, GameOptions.Vibration ? 1 : 0, i => GameOptions.Vibration = i == 1);
                t.AppendLine($"Controller vibration {(GameOptions.Vibration ? "On" : "Off")}");
            }
            if (HasTouch)
            {
                Ui.ChoiceRow(p, "Touch throttle", new[] { "Auto", "Pedal" }, GameOptions.AutoThrottle ? 0 : 1, i => GameOptions.AutoThrottle = i == 0);
                Ui.ChoiceRow(p, "Touch hand", new[] { "Right", "Left" }, GameOptions.LeftHanded ? 1 : 0, i => GameOptions.LeftHanded = i == 1);
                Ui.SliderRow(p, "Touch buttons", 100f, 140f, GameOptions.ButtonScale * 100f, v => $"{v:0} %", v => GameOptions.ButtonScale = Mathf.Round(v) / 100f);
                t.AppendLine($"Touch throttle {(GameOptions.AutoThrottle ? "Auto" : "Pedal")}");
                t.AppendLine($"Touch buttons {GameOptions.ButtonScale * 100f:0} %");
            }
            if (!UiPanel.IsPhone)
            {
                var keys = Ui.Button(p, "Change keys", () => { _keys = true; Menu.Rebuild(); }, "jm-btn--wide");
                keys.name = "settings-keys";
                t.AppendLine("Change keys");
            }
        }

        /// <summary>The preset closest to the saved distance (older saves hold any value from the old 4–8 m slider).</summary>
        public static int NearestCamera(float distance)
        {
            var best = 0;
            for (var i = 1; i < CameraDistances.Length; i++)
                if (Mathf.Abs(CameraDistances[i] - distance) < Mathf.Abs(CameraDistances[best] - distance)) best = i;
            return best;
        }

        void KeyList(VisualElement p, StringBuilder t)
        {
            Ui.Small(p, "Pick an action, then press the new key. Esc cancels.");
            foreach (var (map, name, label) in Keys)
            {
                var action = _actions?.FindActionMap(map, false)?.FindAction(name, false);
                if (action == null) continue;
                var index = KeyboardBinding(action);
                if (index < 0) continue;
                var row = Ui.Row(p, "jm-setting");
                Ui.Text(row, label);
                var shown = action.GetBindingDisplayString(index);
                Ui.Button(row, shown, () => Rebind(action, index), "jm-btn--wide");
                t.AppendLine($"{label} {shown}");
            }
            Ui.Button(p, "Restore default keys", () =>
            {
                _actions.RemoveAllBindingOverrides();
                GameOptions.Bindings = "";
                Menu.Rebuild();
            });
        }

        static int KeyboardBinding(InputAction a)
        {
            for (var i = 0; i < a.bindings.Count; i++)
            {
                var b = a.bindings[i];
                if (b.isComposite) continue;
                if (b.effectivePath.StartsWith("<Keyboard>")) return i;
            }
            return -1;
        }

        void Rebind(InputAction action, int index)
        {
            _rebind?.Cancel();
            var was = action.enabled;
            action.Disable();
            var old = action.bindings[index].effectivePath;
            _rebind = action.PerformInteractiveRebinding(index)
                .WithControlsHavingToMatchPath("<Keyboard>")
                .WithCancelingThrough("<Keyboard>/escape")
                .OnComplete(op =>
                {
                    op.Dispose();
                    _rebind = null;
                    SwapConflicts(action, index, old);
                    if (was) action.Enable();
                    GameOptions.Bindings = _actions.SaveBindingOverridesAsJson();
                    Menu.Rebuild();
                })
                .OnCancel(op =>
                {
                    _cancelledAt = Time.unscaledTime;
                    op.Dispose();
                    _rebind = null;
                    if (was) action.Enable();
                    Menu.Rebuild();
                })
                .Start();
        }

        /// <summary>Explicit swap (ASTRA: never one key on two driving actions): the action that had the new key gets the old one.</summary>
        void SwapConflicts(InputAction changed, int index, string old)
        {
            var now = changed.bindings[index].effectivePath;
            foreach (var (map, name, _) in Keys)
            {
                var other = _actions.FindActionMap(map, false)?.FindAction(name, false);
                if (other == null || other == changed || other.actionMap != changed.actionMap) continue;
                for (var i = 0; i < other.bindings.Count; i++)
                    if (other.bindings[i].effectivePath == now) other.ApplyBindingOverride(i, old);
            }
        }

        void Sound(VisualElement p, StringBuilder t)
        {
            Ui.ChoiceRow(p, "All sound", new[] { "On", "Muted" }, SoundMix.Muted ? 1 : 0, i => SoundMix.Muted = i == 1);
            t.AppendLine($"All sound {(SoundMix.Muted ? "Muted" : "On")}");
            foreach (SoundGroup g in System.Enum.GetValues(typeof(SoundGroup)))
            {
                var group = g;
                var title = g == SoundGroup.Tyres ? "Tyres & impacts" : g.ToString();
                Ui.SliderRow(p, title, 0f, 100f, SoundMix.Volume(g) * 100f, v => $"{v:0} %", v => SoundMix.SetVolume(group, v / 100f));
                t.AppendLine($"{title} {SoundMix.Volume(g) * 100f:0} %");
            }
        }

        void Display(VisualElement p, StringBuilder t)
        {
            var names = QualitySystem.Tiers;
            var options = new[] { QualitySystem.Auto }.Concat(names).ToArray();
            var current = QualitySystem.IsAuto ? 0 : 1 + System.Array.IndexOf(names, QualitySystem.Current);
            // Auto measures anew on every tap (it replaces the old "Recalibrate" button).
            Ui.ChoiceRow(p, "Quality", options, current, i =>
            {
                if (i == 0) QualitySystem.Recalibrate();
                else QualitySystem.SetTier(names[i - 1]);
                Menu.Rebuild();
            });
            var state = !QualitySystem.IsAuto ? $"{QualitySystem.Current} · chosen by you"
                : QualitySystem.Settled ? $"Auto · {QualitySystem.Current}{(QualitySystem.MeasuredFps > 0 ? $" · {QualitySystem.MeasuredFps:0} fps" : "")}"
                : $"Auto · {QualitySystem.Current} · measuring while you drive";
            Ui.Small(p, state);
            t.AppendLine($"Quality {(QualitySystem.IsAuto ? "Auto " : "")}{QualitySystem.Current}");

            var labels = new[] { "90 %", "100 %", "115 %", "130 %" };
            Ui.ChoiceRow(p, "UI scale", labels, GameOptions.UiScale, i =>
            {
                GameOptions.UiScale = i;
                UiPanel.UserScale = UiPanel.Scales[i];
            });
            Ui.ChoiceRow(p, "Speed unit", new[] { "km/h", "mph" }, GameOptions.Mph ? 1 : 0, i => GameOptions.Mph = i == 1);
            Ui.ChoiceRow(p, "Reduced motion", new[] { "Off", "On" }, GameOptions.ReducedMotion ? 1 : 0, i => GameOptions.ReducedMotion = i == 1);
            t.AppendLine($"UI scale {labels[GameOptions.UiScale]} · {GameOptions.SpeedUnit}");
        }

        /// <summary>
        /// One line at the foot of every page: where progress is saved, and only the buttons that can do something now
        /// (log in, choose between two copies, the recovery copy).
        /// </summary>
        void Saved(VisualElement body, StringBuilder t)
        {
            if (_progress == null) return;
            var store = _progress.StoreName;
            var platform = GamePlatform.Current;
            var user = platform.User;
            var row = Ui.Row(body, "jm-wrap", "nm-save");
            row.style.alignItems = Align.Center;
            row.style.marginTop = 10;
            var where = store == "CrazyGames"
                ? user != null ? $"Saved to your CrazyGames account · {user.Name}" : "Saved in this browser as a guest"
                : "Saved on this device";
            Ui.Small(row, where).style.marginRight = 12;
            t.AppendLine($"store {store}");
            if (user == null && platform.AccountsAvailable)
            {
                Ui.Button(row, "Log in", () => platform.LogIn(_ => Menu.Rebuild()));
                t.AppendLine("login offered");
            }
            if (SaveSync.Pending != null)
            {
                Ui.Button(row, "Choose progress", () => ShowChoice(Menu), "jm-btn--primary");
                t.AppendLine("choice pending");
            }
            var recovery = SaveSync.Recovery(SaveStores.Current);
            if (recovery != null)
            {
                Ui.Button(row, "Recovery copy", () =>
                {
                    var sheet = Menu.Sheet("Recovery copy", out var close);
                    Ui.Text(sheet, Describe(recovery));
                    Ui.Small(sheet, "Switching makes the progress you play now the recovery copy. Nothing is added together.");
                    var buttons = Ui.Row(sheet, "jm-wrap");
                    Ui.Button(buttons, "Switch", () => { close(); Menu.Close(); SaveSync.SwapRecovery(SaveStores.Current); }, "jm-btn--primary");
                    Ui.Button(buttons, "Cancel", close);
                });
                t.AppendLine("recovery copy");
            }
        }

        static string Describe(SaveSummary s) =>
            $"{s.Cars} car{(s.Cars == 1 ? "" : "s")} · {s.sparks:N0} Sparks · {s.Played} played · saved {s.Saved}";

        /// <summary>
        /// "Choose progress" (ASTRA §9/§10): the two copies side by side — cars, balance, playtime, date — and two clearly
        /// named choices. The chosen copy is kept whole (no sums, no rewards again); the other stays as recovery copy.
        /// </summary>
        public static void ShowChoice(GameMenu menu)
        {
            var c = SaveSync.Pending;
            if (c == null || menu == null) return;
            var settings = menu.Screen<SettingsScreen>();
            if (settings != null) settings._keys = false; // the save line with "Choose progress" is on every tab
            menu.Open(settings);
            var account = GamePlatform.Current.User != null ? "Your account" : "This browser";
            var sheet = menu.Sheet("Choose progress", out var close);
            Ui.Text(sheet, "There are two saved games. Pick the one to keep playing — the other is kept as a recovery copy.");
            var row = Ui.Row(sheet, "jm-wrap");
            void Card(string title, SaveSummary s, bool keepAccount)
            {
                var card = Ui.Box(row, "jm-panel");
                card.style.minWidth = 200;
                Ui.H2(card, title);
                Ui.Text(card, $"{s.Cars} car{(s.Cars == 1 ? "" : "s")} · {s.sparks:N0} Sparks");
                Ui.Small(card, $"{s.Played} played · saved {s.Saved}");
                Ui.Button(card, keepAccount ? $"Keep {account.ToLowerInvariant()}" : "Keep this device", () =>
                {
                    close();
                    menu.Close();
                    SaveSync.Resolve(keepAccount);
                }, "jm-btn--primary");
            }
            Card(account, c.Account, true);
            Card("This device", c.Device, false);
        }
    }
}
