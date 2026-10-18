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
    /// Settings (ASTRA §10): Controls (steering, chase distance, camera shake, key bindings, touch), Audio (five
    /// sliders, master mute), Graphics (quality tier), Accessibility (UI scale, units, reduced motion), Progress
    /// (save status). Values are always visible and apply at once; per device (<see cref="GameOptions"/>).
    /// Key rebinding uses the Input System's interactive rebinding; Escape cancels a capture.
    /// </summary>
    public sealed class SettingsScreen : MenuScreen
    {
        static readonly string[] Pages = { "Controls", "Audio", "Graphics", "Accessibility", "Progress" };
        readonly InputActionAsset _actions;
        readonly PlayerProgress _progress;
        int _page;
        string _text = "";
        InputActionRebindingExtensions.RebindingOperation _rebind;

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

        float _cancelledAt = -1f;

        // Escape during a key capture cancels the capture, not the menu.
        public override bool Back() => _rebind != null || Time.unscaledTime - _cancelledAt < 0.25f;

        public override void Closed()
        {
            _rebind?.Cancel();
            _rebind = null;
        }

        public override void Build(VisualElement body)
        {
            var t = new StringBuilder();
            Ui.H1(body, "Settings");
            var tabs = Ui.Row(body, "jm-wrap");
            for (var i = 0; i < Pages.Length; i++)
            {
                var index = i;
                Ui.On(Ui.Button(tabs, Pages[i], () => { _page = index; Menu.Rebuild(); }), _page == i);
            }
            var page = Ui.Box(body, "jm-panel");
            switch (_page)
            {
                case 0: Controls(page, t); break;
                case 1: Sound(page, t); break;
                case 2: Graphics(page, t); break;
                case 3: Access(page, t); break;
                default: Progress(page, t); break;
            }
            _text = t.ToString();
        }

        void Controls(VisualElement p, StringBuilder t)
        {
            Ui.SliderRow(p, "Steering", 50f, 150f, GameOptions.Steering * 100f, v => $"{v:0} %", v => GameOptions.Steering = Mathf.Round(v) / 100f);
            Ui.SliderRow(p, "Chase distance", 4f, 8f, GameOptions.ChaseDistance, v => $"{v:0.0} m", v => GameOptions.ChaseDistance = v);
            Ui.ChoiceRow(p, "Camera shake", new[] { "Off", "Low", "Full" }, GameOptions.CameraShake, i => GameOptions.CameraShake = i);
            Ui.ChoiceRow(p, "Controller vibration", new[] { "Off", "On" }, GameOptions.Vibration ? 1 : 0, i => GameOptions.Vibration = i == 1);
            Ui.ChoiceRow(p, "Touch throttle", new[] { "Auto", "Pedal" }, GameOptions.AutoThrottle ? 0 : 1, i => GameOptions.AutoThrottle = i == 0);
            Ui.ChoiceRow(p, "Touch hand", new[] { "Right", "Left" }, GameOptions.LeftHanded ? 1 : 0, i => GameOptions.LeftHanded = i == 1);
            Ui.SliderRow(p, "Touch buttons", 100f, 140f, GameOptions.ButtonScale * 100f, v => $"{v:0} %", v => GameOptions.ButtonScale = Mathf.Round(v) / 100f);
            t.AppendLine($"Steering {GameOptions.Steering * 100f:0} %");
            t.AppendLine($"Chase distance {GameOptions.ChaseDistance:0.0} m");

            Ui.H2(p, "Keys");
            Ui.Small(p, "Select an action, then press the new key. Esc cancels. A key used twice is swapped.");
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
            foreach (SoundGroup g in System.Enum.GetValues(typeof(SoundGroup)))
            {
                var group = g;
                var title = g == SoundGroup.Tyres ? "Tyres & impacts" : g.ToString();
                Ui.SliderRow(p, title, 0f, 100f, SoundMix.Volume(g) * 100f, v => $"{v:0} %", v => SoundMix.SetVolume(group, v / 100f));
                t.AppendLine($"{title} {SoundMix.Volume(g) * 100f:0} %");
            }
            Ui.ChoiceRow(p, "All sound", new[] { "On", "Muted" }, SoundMix.Muted ? 1 : 0, i => SoundMix.Muted = i == 1);
            Ui.Small(p, "Sounds are stand-ins until the recordings arrive.");
        }

        void Graphics(VisualElement p, StringBuilder t)
        {
            var names = QualitySystem.Tiers;
            var options = new[] { QualitySystem.Auto }.Concat(names).ToArray();
            var current = QualitySystem.IsAuto ? 0 : 1 + System.Array.IndexOf(names, QualitySystem.Current);
            Ui.ChoiceRow(p, "Quality", options, current, i =>
            {
                if (i == 0) QualitySystem.Recalibrate();
                else QualitySystem.SetTier(names[i - 1]);
                Menu.Rebuild();
            });
            var state = !QualitySystem.IsAuto ? $"{QualitySystem.Current}, chosen by you."
                : QualitySystem.Settled ? $"Auto: {QualitySystem.Current}{(QualitySystem.MeasuredFps > 0 ? $" ({QualitySystem.MeasuredFps:0} fps measured)" : "")}."
                : $"Auto: {QualitySystem.Current} for now — measured after a few seconds of driving.";
            Ui.Small(p, state + " High: shadows and long view distance. Low: for phones and Chromebooks.");
            Ui.Button(p, "Recalibrate", () => { QualitySystem.Recalibrate(); Menu.Rebuild(); });
            t.AppendLine($"Quality {(QualitySystem.IsAuto ? "Auto " : "")}{QualitySystem.Current}");
        }

        void Access(VisualElement p, StringBuilder t)
        {
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

        void Progress(VisualElement p, StringBuilder t)
        {
            if (_progress == null) return;
            var store = _progress.StoreName;
            var platform = GamePlatform.Current;
            var user = platform.User;
            if (store == "CrazyGames")
                Ui.Text(p, user != null ? $"Saved to your CrazyGames account ({user.Name})." : "Saved in this browser as a guest.");
            else Ui.Text(p, $"Saved on this device ({store}).");
            Ui.Small(p, $"{_progress.SaveCount} saves this session. Progress saves after purchases, rewards, discoveries and parking.");
            t.AppendLine($"store {store}");
            if (user == null && platform.AccountsAvailable)
            {
                Ui.Button(p, "Log in to keep progress on every device", () => platform.LogIn(_ => Menu.Rebuild()));
                t.AppendLine("login offered");
            }
            if (SaveSync.Pending != null)
            {
                Ui.Button(p, "Choose progress", () => ShowChoice(Menu), "jm-btn--primary");
                t.AppendLine("choice pending");
            }
            var recovery = SaveSync.Recovery(SaveStores.Current);
            if (recovery != null)
            {
                Ui.H2(p, "Recovery copy");
                Ui.Small(p, Describe(recovery));
                Ui.Button(p, "Switch to the recovery copy", () =>
                {
                    var sheet = Menu.Sheet("Switch progress?", out var close);
                    Ui.Text(sheet, "The progress you play now becomes the recovery copy. Nothing is added together.");
                    var row = Ui.Row(sheet, "jm-wrap");
                    Ui.Button(row, "Switch", () => { close(); Menu.Close(); SaveSync.SwapRecovery(SaveStores.Current); }, "jm-btn--primary");
                    Ui.Button(row, "Cancel", close);
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
            if (settings != null) settings._page = 4; // Progress
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
