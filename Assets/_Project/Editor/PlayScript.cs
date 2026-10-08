using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using JapanMap.Gameplay;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace JapanMap.Editor
{
    /// <summary>
    /// Plays the real game from Boot.unity and drives it like a player: virtual keyboard and mouse
    /// through the Input System (the game's own actions), waits in game time, renders the main
    /// camera at chosen moments. For before/after images and short image sequences of anything
    /// that moves. Started by Tools/play.mjs; writes &lt;out&gt;/result.txt when done, then stops play.
    /// Commands, separated by ';':
    ///   wait 1.5 · hold w leftShift · release w · press f · mouse dx dy seconds (right button held)
    ///   shot name · frames name count interval · probe (player state into the result)
    ///   place x z [yaw] (pictures only: walker to a spot, on the nearest NavMesh)
    /// </summary>
    [InitializeOnLoad]
    public static class PlayScript
    {
        const string KeyScript = "JapanMap.PlayScript.script";
        const string KeyOut = "JapanMap.PlayScript.out";
        const string KeyScene = "JapanMap.PlayScript.scene";

        static List<string> _steps;
        static int _index;
        static float _until = -1f;
        static Keyboard _kb;
        static Mouse _mouse;
        static readonly HashSet<Key> Held = new();
        static Vector2 _mouseDelta;
        static float _mouseUntil;
        static readonly StringBuilder Log = new();
        static int _frames, _frameTotal;
        static float _frameDt, _frameNext;
        static string _frameName;
        static InputSettings.EditorInputBehaviorInPlayMode _previousBehaviour;
        static InputSettings.BackgroundBehavior _previousBackground;

        static PlayScript()
        {
            EditorApplication.playModeStateChanged -= OnPlayMode;
            EditorApplication.playModeStateChanged += OnPlayMode;
        }

        /// <summary>Called from Tools/play.mjs in edit mode.</summary>
        public static string Begin(string script, string outDir)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return "BLOCKED: editor is in play mode";
            Directory.CreateDirectory(outDir);
            var result = Path.Combine(outDir, "result.txt");
            if (File.Exists(result)) File.Delete(result);
            SessionState.SetString(KeyScript, script);
            SessionState.SetString(KeyOut, outDir);
            EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
            SessionState.SetString(KeyScene, UnityEngine.SceneManagement.SceneManager.GetActiveScene().path);
            EditorSceneManager.OpenScene("Assets/_Project/Scenes/Boot.unity");
            EditorApplication.isPlaying = true;
            return "started";
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredEditMode && SessionState.GetString(KeyScene, "") != "")
            {
                // Back to the scene the agent had open (the other tools expect Game.unity).
                var scene = SessionState.GetString(KeyScene, "");
                SessionState.EraseString(KeyScene);
                if (File.Exists(scene)) EditorSceneManager.OpenScene(scene);
                return;
            }
            if (change == PlayModeStateChange.EnteredPlayMode && SessionState.GetString(KeyScript, "") != "")
            {
                _steps = new List<string>(SessionState.GetString(KeyScript, "").Split(';'));
                SessionState.EraseString(KeyScript);
                _index = 0;
                _until = -1f;
                Held.Clear();
                Log.Clear();
                _frames = 0;
                _previousBehaviour = InputSystem.settings.editorInputBehaviorInPlayMode;
                // Without this the virtual keyboard only counts while the Game view has focus.
                InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
                // …and without this a keyboard is reset and disabled while Unity is not the front app.
                _previousBackground = InputSystem.settings.backgroundBehavior;
                InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
                _kb = InputSystem.AddDevice<Keyboard>("PlayScriptKeyboard");
                _mouse = InputSystem.AddDevice<Mouse>("PlayScriptMouse");
                EditorApplication.update += Tick;
            }
            else if (change == PlayModeStateChange.ExitingPlayMode && _steps != null)
            {
                Finish("stopped");
            }
        }

        static void Tick()
        {
            if (!EditorApplication.isPlaying || _steps == null) return;
            var now = Time.time;
            PushInput(now);
            if (_frames > 0)
            {
                if (now >= _frameNext)
                {
                    Shot($"{_frameName}-{_frameTotal - _frames + 1:00}");
                    _frames--;
                    _frameNext = now + _frameDt;
                }
                return;
            }
            if (now < _until) return;
            while (_index < _steps.Count)
            {
                var step = _steps[_index++].Trim();
                if (step.Length == 0) continue;
                Log.AppendLine($"[{now:0.00}] {step}");
                if (!Run(step, now)) return; // the step waits
            }
            Finish("done");
            EditorApplication.isPlaying = false;
        }

        static bool Run(string step, float now)
        {
            var a = step.Split(' ', System.StringSplitOptions.RemoveEmptyEntries);
            float F(int i) => float.Parse(a[i], CultureInfo.InvariantCulture);
            switch (a[0])
            {
                case "wait":
                    _until = now + F(1);
                    return false;
                case "hold":
                    for (var i = 1; i < a.Length; i++) Held.Add(ParseKey(a[i]));
                    return true;
                case "release":
                    for (var i = 1; i < a.Length; i++) Held.Remove(ParseKey(a[i]));
                    return true;
                case "press":
                    var k = ParseKey(a[1]);
                    Held.Add(k);
                    PushInput(now);
                    InputSystem.Update();
                    Held.Remove(k);
                    _until = now + 0.1f; // let the game see the key go down
                    return false;
                case "mouse":
                    _mouseDelta = new Vector2(F(1), F(2));
                    _mouseUntil = now + F(3);
                    _until = _mouseUntil;
                    return false;
                case "shot":
                    Shot(a[1]);
                    return true;
                case "frames":
                    _frameName = a[1];
                    _frames = _frameTotal = int.Parse(a[2]);
                    _frameDt = F(3);
                    _frameNext = now;
                    return false;
                case "place":
                {
                    // For pictures only: put the walker somewhere (tests of behaviour use the real paths).
                    var pm = Object.FindAnyObjectByType<PlayerModeController>();
                    var at = new Vector3(F(1), 600f, F(2));
                    if (Physics.Raycast(at, Vector3.down, out var g, 1200f, ~JapanMap.Core.GameLayers.NotGround)) at = g.point;
                    if (UnityEngine.AI.NavMesh.SamplePosition(at, out var nh, 30f, 1)) at = nh.position;
                    pm.Walker.Place(at, a.Length > 3 ? F(3) : 0f);
                    pm.Walker.CameraHeading = a.Length > 3 ? F(3) : 0f;
                    var rig = Object.FindAnyObjectByType<JapanMap.OnFoot.WalkCameraRig>();
                    rig.SetLive(true);
                    return true;
                }
                case "probe":
                    Probe();
                    return true;
                case "stats":
                    // Last Game-view frame (the Game view must be open and visible).
                    Log.AppendLine(string.Format(CultureInfo.InvariantCulture, "  stats drawCalls={0} setPass={1} tris={2:0}k frame={3:0.0}ms",
                        UnityStats.drawCalls, UnityStats.setPassCalls, UnityStats.triangles / 1000f, UnityStats.frameTime * 1000f));
                    return true;
                case "crowd":
                    // crowd on|off: switch the pedestrians for an A/B measurement.
                    var c = Object.FindAnyObjectByType<JapanMap.Gameplay.Life.PedestrianCrowd>(FindObjectsInactive.Include);
                    if (c != null) c.gameObject.SetActive(a[1] == "on");
                    return true;
                default:
                    Log.AppendLine("  unknown command");
                    return true;
            }
        }

        static Key ParseKey(string name) => (Key)System.Enum.Parse(typeof(Key), name, true);

        static void PushInput(float now)
        {
            if (_kb == null) return;
            var keys = new Key[Held.Count];
            Held.CopyTo(keys);
            InputSystem.QueueStateEvent(_kb, new KeyboardState(keys));
            var moving = now < _mouseUntil;
            var ms = new MouseState { delta = moving ? _mouseDelta : Vector2.zero };
            ms = ms.WithButton(MouseButton.Right, moving);
            InputSystem.QueueStateEvent(_mouse, ms);
        }

        static void Shot(string name)
        {
            var path = Path.Combine(SessionState.GetString(KeyOut, Capture.Dir), name + ".png");
            Capture.Render(Camera.main, path, 960, 540);
            Log.AppendLine($"  shot {path}");
        }

        static void Probe()
        {
            var p = Object.FindAnyObjectByType<PlayerModeController>();
            if (p == null) { Log.AppendLine("  probe: no PlayerModeController"); return; }
            var w = p.Walker;
            var car = p.Car;
            Log.AppendLine(string.Format(CultureInfo.InvariantCulture,
                "  probe mode={0} walker={1} speed={2:0.00} grounded={3} sliding={4} car={5} carKmh={6:0.0} carDist={7:0.00} prompt='{8}' msg='{9}'",
                p.Current, w != null && w.gameObject.activeInHierarchy ? w.transform.position.ToString("0.00") : "-",
                w != null ? w.Speed : 0f, w != null && w.Grounded, w != null && w.Sliding,
                car != null ? car.transform.position.ToString("0.00") : "-", car != null ? car.Body.linearVelocity.magnitude * 3.6f : 0f,
                p.CarDistance, p.Prompt, p.Message));
            var crowd = Object.FindAnyObjectByType<JapanMap.Gameplay.Life.PedestrianCrowd>();
            if (crowd != null)
            {
                int active = 0, walking = 0, knocked = 0;
                var nearest = float.PositiveInfinity;
                foreach (var q in crowd.People)
                {
                    if (!q.gameObject.activeSelf) continue;
                    active++;
                    if (q.Current == JapanMap.Gameplay.Life.Pedestrian.State.Walking) walking++;
                    if (q.Knocked) knocked++;
                    if (w != null) nearest = Mathf.Min(nearest, Vector3.Distance(q.transform.position, w.transform.position));
                }
                Log.AppendLine($"  crowd {active}/{crowd.People.Count} active, {walking} walking, {knocked} knocked, nearest {nearest:0.0} m");
            }
        }

        static void Finish(string how)
        {
            if (_steps == null) return;
            EditorApplication.update -= Tick;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (_mouse != null) InputSystem.RemoveDevice(_mouse);
            _kb = null;
            _mouse = null;
            InputSystem.settings.editorInputBehaviorInPlayMode = _previousBehaviour;
            InputSystem.settings.backgroundBehavior = _previousBackground;
            _steps = null;
            Log.AppendLine(how);
            var outDir = SessionState.GetString(KeyOut, Capture.Dir);
            File.WriteAllText(Path.Combine(outDir, "result.txt"), Log.ToString());
        }
    }
}
