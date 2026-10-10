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
    ///   place x z [yaw] (pictures only: walker to a spot, on the nearest NavMesh) · drive x z [yaw] (car there, player in it)
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
        // tap: a left click at a UI element, through the virtual mouse (the real path, rule 6).
        static Vector2 _tapPos;
        static int _tapPhase; // 2 = press on next push, 1 = release on next push
        static int _scrollLeft; // wheel notches still to send (negative = zoom in)
        static float _mouseUntil;
        static readonly StringBuilder Log = new();
        static int _frames, _frameTotal;
        static float _frameDt, _frameNext;
        static string _frameName;
        static Vector3? _aim;
        static float _clock;
        static int _lastFrame = -1;
        static Vector3 _orbitCentre;
        static float _orbitRadius;
        static int _waitFrom = -1, _loggedIndex = -1;
        static float _waitUntil;
        static InputSettings.EditorInputBehaviorInPlayMode _previousBehaviour;
        static InputSettings.BackgroundBehavior _previousBackground;

        static PlayScript()
        {
            EditorApplication.playModeStateChanged -= OnPlayMode;
            EditorApplication.playModeStateChanged += OnPlayMode;
        }

        /// <summary>Called from Tools/play.mjs in edit mode.</summary>
        public const string AgentSlot = "agentplay.";

        public static string Begin(string script, string outDir)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return "BLOCKED: editor is in play mode";
            Directory.CreateDirectory(outDir);
            var result = Path.Combine(outDir, "result.txt");
            if (File.Exists(result)) File.Delete(result);
            SessionState.SetString(KeyScript, script);
            SessionState.SetString(KeyOut, outDir);
            // Own save slot: a play script never reads or writes the human's progress. Fresh each run unless
            // the script starts with "keepsave" (the save/restart check).
            SessionState.SetString(JapanMap.Core.Save.SaveStores.SlotKey, AgentSlot);
            if (!script.TrimStart().StartsWith("keepsave"))
                foreach (var k in new[] { JapanMap.Gameplay.Progress.ProgressStore.Key, JapanMap.Gameplay.Progress.ProgressStore.BackupKey, JapanMap.Gameplay.Progress.ProgressStore.CorruptKey })
                    PlayerPrefs.DeleteKey(AgentSlot + k);
            EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
            SessionState.SetString(KeyScene, UnityEngine.SceneManagement.SceneManager.GetActiveScene().path);
            EditorSceneManager.OpenScene("Assets/_Project/Scenes/Boot.unity");
            EditorApplication.isPlaying = true;
            return "started";
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredEditMode) SessionState.EraseString(JapanMap.Core.Save.SaveStores.SlotKey);
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
                _aim = null;
                _orbitRadius = 0f;
                _clock = 0f;
                _waitFrom = -1;
                _loggedIndex = -1;
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
                InputSystem.EnableDevice(_kb);
                InputSystem.EnableDevice(_mouse);
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
            // Game time, but it keeps running while the game is paused (photo mode sets timeScale 0 — a "wait"
            // on Time.time never ended there). Under timescale 4 a "wait 1" is still one game second.
            var frame = Time.frameCount;
            if (frame != _lastFrame)
            {
                _clock += Time.timeScale > 0f ? Time.deltaTime : Time.unscaledDeltaTime;
                _lastFrame = frame;
            }
            var now = _clock;
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
                if (_index - 1 != _loggedIndex) Log.AppendLine($"[{now:0.00}] {step}"); // a waiting step logs once
                _loggedIndex = _index - 1;
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
                case "screen":
                    // Game view with the UI Toolkit overlay (HUD) — 'shot' renders the camera only.
                    var screenPath = Path.Combine(SessionState.GetString(KeyOut, Capture.Dir), a[1] + ".png");
                    ScreenCapture.CaptureScreenshot(screenPath);
                    Log.AppendLine($"  screen {screenPath}");
                    // The file is written at the end of a later game frame: wait for it, or the next
                    // command (place, press) is already in the picture.
                    _until = now + 0.3f;
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
                case "waitstunt":
                {
                    // Wait (at most 10 s) until the stunt judge scores something new.
                    var sc = Object.FindAnyObjectByType<JapanMap.Gameplay.Stunts.StuntScorer>();
                    if (sc == null) return true;
                    if (_waitFrom < 0) { _waitFrom = sc.Count; _waitUntil = now + 10f; }
                    if (sc.Count > _waitFrom || now > _waitUntil) { _waitFrom = -1; return true; }
                    _index--; // run this step again next tick
                    return false;
                }
                case "aim":
                    // aim x z: steer the car towards a point with A/D like a player would; "aim off" stops.
                    _aim = a[1] == "off" ? null : new Vector3(F(1), 0f, F(2));
                    if (_aim == null) { Held.Remove(Key.A); Held.Remove(Key.D); }
                    _orbitRadius = 0f;
                    return true;
                case "orbit":
                    // orbit x z r: keep circling that centre anticlockwise at radius r (aims 40° ahead on the circle).
                    _orbitCentre = new Vector3(F(1), 0f, F(2));
                    _orbitRadius = F(3);
                    _aim = _orbitCentre;
                    return true;
                case "race":
                {
                    // race id [auto]: start an event from where the player's car is (auto: the AI drives the player too).
                    var rd = Object.FindAnyObjectByType<JapanMap.Gameplay.Races.RaceDirector>();
                    rd.Autopilot = a.Length > 2 && a[2] == "auto";
                    Log.AppendLine($"  race {a[1]} started={rd.Begin(a[1])}");
                    return true;
                }
                case "pace":
                {
                    // pace kmh: the player's car moves forward at this speed now (setup, like a test's RamAt).
                    var pmp = Object.FindAnyObjectByType<PlayerModeController>();
                    pmp.Car.Body.linearVelocity = pmp.Car.transform.forward * F(1) / 3.6f;
                    return true;
                }
                case "timescale":
                    Time.timeScale = F(1);
                    return true;
                case "drive":
                {
                    // Setup like a fast travel: the player's car at x z facing yaw, the player in it.
                    var pm = Object.FindAnyObjectByType<PlayerModeController>();
                    var yaw = a.Length > 3 ? F(3) : 0f;
                    pm.Car.Place(new Vector3(F(1), 0f, F(2)), yaw, fromAbove: 300f);
                    if (pm.Current == PlayerModeController.Mode.Walking)
                    {
                        pm.Walker.Place(pm.Car.transform.position + pm.Car.transform.right * 2.2f + Vector3.up, yaw);
                        Physics.SyncTransforms();
                        pm.TryBoard();
                    }
                    return true;
                }
                case "nearcar":
                {
                    // For pictures only: walker on the pavement beside traffic car i, looking at it.
                    var ts = Object.FindAnyObjectByType<JapanMap.Gameplay.Traffic.TrafficSystem>();
                    var car = ts.Cars[int.Parse(a[1])];
                    var ahead = car.transform.position + car.transform.forward * 32f + Vector3.up * 30f;
                    if (!Physics.Raycast(ahead, Vector3.down, out var nh, 80f, ~JapanMap.Core.GameLayers.NotGround)) return true;
                    var to = car.transform.position - nh.point;
                    var yaw = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg;
                    var pm = Object.FindAnyObjectByType<PlayerModeController>();
                    pm.Walker.Place(nh.point, yaw);
                    Object.FindAnyObjectByType<JapanMap.OnFoot.WalkCameraRig>().SetLive(true);
                    return true;
                }
                case "ram":
                {
                    // For pictures only: the player's car on the road beside the street lamp nearest to
                    // (x, z), aimed at it at kmh. Board first (press f). Hold w to keep the throttle.
                    var smash = Object.FindAnyObjectByType<JapanMap.Gameplay.Smash.SmashSystem>();
                    var near = new Vector3(F(1), 30f, F(2));
                    JapanMap.Gameplay.Smash.Breakable lamp = null;
                    foreach (var b in smash.Breakables)
                        if (b.name.StartsWith("streetLamp") && !b.Broken && (lamp == null || (b.transform.position - near).sqrMagnitude < (lamp.transform.position - near).sqrMagnitude)) lamp = b;
                    var pm = Object.FindAnyObjectByType<PlayerModeController>();
                    var car = pm.Car;
                    var roads = (JapanMap.World.RoadNetwork)Object.FindAnyObjectByType<JapanMap.Vehicles.VehicleRespawn>().Locator;
                    var c = lamp.transform.position;
                    roads.TryNearest(c, Vector3.forward, 30f, out var road, out var dir);
                    var side = road - c;
                    side.y = 0f;
                    var from = c + side.normalized * 14f - dir * 4f; // from the far lane, almost square on
                    var aim = c - from;
                    aim.y = 0f;
                    car.Place(from, Mathf.Atan2(aim.x, aim.z) * Mathf.Rad2Deg, fromAbove: 3f);
                    car.Body.linearVelocity = aim.normalized * (F(3) / 3.6f);
                    Object.FindAnyObjectByType<JapanMap.Vehicles.CarCameraRig>().Attach(car);
                    return true;
                }
                case "ramtree":
                {
                    // For pictures only: the player's car 14 m from the nearest tree with a trunk, aimed at it, at kmh.
                    var pmt = Object.FindAnyObjectByType<PlayerModeController>();
                    var carT = pmt.Car;
                    JapanMap.World.InstanceRenderer veg = null;
                    foreach (var ir in Object.FindObjectsByType<JapanMap.World.InstanceRenderer>())
                        if (ir.data is JapanMap.World.VegetationData) veg = ir;
                    var best = -1;
                    var bestD = float.MaxValue;
                    var from0 = carT.transform.position;
                    foreach (var chunk in veg.data.chunks)
                    foreach (var run in chunk.runs)
                    {
                        if (veg.data.prototypes[run.prototype].colliderRadius <= 0f) continue;
                        for (var i = run.start; i < run.start + run.count; i++)
                        {
                            var dd = (veg.data.positions[i] - from0).sqrMagnitude;
                            if (dd > 400f && dd < bestD) { bestD = dd; best = i; }
                        }
                    }
                    var treeAt = veg.data.positions[best];
                    var dir = treeAt - from0;
                    dir.y = 0f;
                    dir.Normalize();
                    carT.Place(treeAt - dir * 14f, Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg, fromAbove: 3f);
                    carT.Body.linearVelocity = dir * (F(1) / 3.6f);
                    Object.FindAnyObjectByType<JapanMap.Vehicles.CarCameraRig>().Attach(carT);
                    return true;
                }
                case "view":
                {
                    // Main camera to a named viewpoint, game systems running (like the bench).
                    var cam = Camera.main;
                    foreach (var b in cam.GetComponents<Behaviour>())
                        if (b.GetType().Name.Contains("Cinemachine")) b.enabled = false;
                    Map.ViewpointTools.Load().Apply(a[1], cam.transform);
                    // Life (crowd, traffic, actors) follows the player, not the camera: bring the walker
                    // along, under the camera (out of the picture), so the viewpoint shows a living place.
                    var pmv = Object.FindAnyObjectByType<PlayerModeController>();
                    if (pmv != null && pmv.Current == PlayerModeController.Mode.Walking
                        && Physics.Raycast(cam.transform.position + Vector3.up * 2f, Vector3.down, out var under, 60f, ~JapanMap.Core.GameLayers.NotGround))
                    {
                        pmv.Walker.Place(under.point - cam.transform.forward * 1.5f, cam.transform.eulerAngles.y);
                    }
                    return true;
                }
                case "tier":
                    // Quality tier for the rest of the run (High / Medium / Low), as the player would pick it.
                    JapanMap.Core.QualitySystem.SetTier(a[1], save: false);
                    foreach (var tq in Object.FindObjectsByType<JapanMap.World.TerrainQuality>()) tq.Apply(a[1]);
                    return true;
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
                    var crowdSystem = Object.FindAnyObjectByType<JapanMap.Gameplay.Life.PedestrianCrowd>(FindObjectsInactive.Include);
                    if (crowdSystem != null) crowdSystem.gameObject.SetActive(a[1] == "on");
                    return true;
                case "keepsave":
                    return true; // marker only: Begin kept the agent slot's save
                case "garage":
                {
                    // garage pick id | buy | fit Engine 2 | setup Drift | paint Navy | rims 1 | kit 1 | close — the sheet's own actions.
                    var gs = Object.FindAnyObjectByType<JapanMap.Gameplay.Garage.GarageSystem>();
                    if (gs == null || !gs.IsOpen) { Log.AppendLine("  garage: not open"); return true; }
                    switch (a[1])
                    {
                        case "pick": gs.Pick(a[2]); break;
                        case "buy": gs.Buy(); break;
                        case "fit": gs.Fit((JapanMap.Vehicles.TuneCategory)System.Enum.Parse(typeof(JapanMap.Vehicles.TuneCategory), a[2], true), int.Parse(a[3])); break;
                        case "setup": gs.Setup((JapanMap.Vehicles.CarSetupMode)System.Enum.Parse(typeof(JapanMap.Vehicles.CarSetupMode), a[2], true)); break;
                        case "paint": gs.Paint(a.Length > 2 ? string.Join(" ", a, 2, a.Length - 2) : ""); break;
                        case "rims": gs.Look(false, int.Parse(a[2])); break;
                        case "kit": gs.Look(true, int.Parse(a[2])); break;
                        case "close": gs.Close(); break;
                    }
                    Log.AppendLine($"  garage {a[1]} → '{gs.Status}'");
                    return true;
                }
                case "tap":
                {
                    // tap <button text or name>: clicks the first visible UI Toolkit button with that text.
                    var label = string.Join(" ", a, 1, a.Length - 1);
                    var hit = FindButton(label);
                    if (hit == null) { Log.AppendLine($"  tap: no visible button '{label}'"); return true; }
                    // Screen.* in this editor callback is the editor window, not the Game view: use the panel's own size.
                    var root = hit.panel.visualTree.worldBound;
                    var scale = 1f / JapanMap.Core.Ui.UiPanel.Scale;
                    var c = hit.worldBound.center;
                    _tapPos = new Vector2(c.x * scale, (root.height - c.y) * scale);
                    _tapPhase = 2;
                    Log.AppendLine($"  tap '{label}' at {_tapPos} (element {hit.worldBound}, panel {root}, screen {Screen.width}x{Screen.height})");
                    _until = now + 0.25f;
                    return false;
                }
                case "tapmap":
                {
                    // tapmap <x> <z>: a click on the world map at a world point (opens that pin's card).
                    var menu = Object.FindAnyObjectByType<JapanMap.Gameplay.Menu.GameMenu>();
                    var view = (menu?.Current as JapanMap.Gameplay.Menu.MapScreen)?.View;
                    if (view == null) { Log.AppendLine("  tapmap: the map is not open"); return true; }
                    var local = view.ToLocal(new Vector2(F(1), F(2)));
                    var root = view.panel.visualTree.worldBound;
                    var scale = 1f / JapanMap.Core.Ui.UiPanel.Scale;
                    var c = view.worldBound.position + local;
                    _tapPos = new Vector2(c.x * scale, (root.height - c.y) * scale);
                    _tapPhase = 2;
                    Log.AppendLine($"  tapmap {F(1)} {F(2)} at {_tapPos}");
                    _until = now + 0.3f;
                    return false;
                }
                case "record":
                {
                    // record <seconds> <name>: what the listener hears → <out>/<name>.wav (editor only).
                    var path = Path.Combine(SessionState.GetString(KeyOut, Capture.Dir), a[2] + ".wav");
                    var rec = JapanMap.DevTools.AudioCapture.Begin(Path.GetFullPath(path), F(1));
                    Log.AppendLine(rec != null ? $"  record {F(1)} s → {path}" : "  record: no AudioListener");
                    return true;
                }
                case "scroll":
                    // scroll <n>: n mouse-wheel notches at the last tap position (positive zooms the map in).
                    _scrollLeft = int.Parse(a[1]);
                    _until = now + 0.1f * Mathf.Abs(_scrollLeft) + 0.2f;
                    return false;
                case "gameview":
                    // gameview <w> <h>: the Game view resolution (phone portrait 390 844, landscape 844 390).
                    GameViewSize(int.Parse(a[1]), int.Parse(a[2]));
                    _until = now + 0.5f;
                    return false;
                case "text":
                {
                    // text: what the open menu page says, into the log.
                    var menu = Object.FindAnyObjectByType<JapanMap.Gameplay.Menu.GameMenu>();
                    Log.AppendLine($"  menu open={menu?.IsOpen} page={menu?.Current?.Title} · ui {JapanMap.Core.Ui.UiPanel.Form} size {JapanMap.Core.Ui.UiPanel.Size} scale {JapanMap.Core.Ui.UiPanel.Scale:0.00} screen {Screen.width}x{Screen.height}");
                    if (a.Length > 1 && a[1] == "docs") foreach (var d in Object.FindObjectsByType<UnityEngine.UIElements.UIDocument>())
                        Log.AppendLine($"    doc {d.name}: {(d.panelSettings != null ? d.panelSettings.name + " " + d.panelSettings.scaleMode : "none")} root {d.rootVisualElement?.panel?.visualTree.worldBound}");
                    Log.AppendLine(menu?.Text);
                    return true;
                }
                case "sparks":
                {
                    // sparks n: setup like a loaded save — the balance a returning player would have.
                    var pr = Object.FindAnyObjectByType<JapanMap.Gameplay.Progress.PlayerProgress>();
                    pr.Wallet.Restore(int.Parse(a[1]));
                    return true;
                }
                default:
                    Log.AppendLine("  unknown command");
                    return true;
            }
        }

        static Key ParseKey(string name) => (Key)System.Enum.Parse(typeof(Key), name, true);

        static void PushInput(float now)
        {
            if (_kb == null) return;
            if (_aim.HasValue)
            {
                var pm = Object.FindAnyObjectByType<PlayerModeController>();
                if (pm != null && pm.Car != null)
                {
                    if (_orbitRadius > 0f)
                    {
                        var rel = pm.Car.transform.position - _orbitCentre;
                        var ang = Mathf.Atan2(rel.z, rel.x) + 40f * Mathf.Deg2Rad;
                        _aim = _orbitCentre + new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang)) * _orbitRadius;
                    }
                    var to = _aim.Value - pm.Car.transform.position;
                    to.y = 0f;
                    var err = Vector3.SignedAngle(pm.Car.transform.forward, to, Vector3.up);
                    Held.Remove(Key.A);
                    Held.Remove(Key.D);
                    if (err > 2f) Held.Add(Key.D);
                    else if (err < -2f) Held.Add(Key.A);
                }
            }
            var keys = new Key[Held.Count];
            Held.CopyTo(keys);
            InputSystem.QueueStateEvent(_kb, new KeyboardState(keys));
            var moving = now < _mouseUntil;
            var ms = new MouseState { delta = moving ? _mouseDelta : Vector2.zero, position = _tapPos };
            ms = ms.WithButton(MouseButton.Right, moving);
            if (_scrollLeft != 0) { ms.scroll = new Vector2(0f, _scrollLeft > 0 ? 120f : -120f); _scrollLeft -= System.Math.Sign(_scrollLeft); }
            if (_tapPhase == 2) { ms = ms.WithButton(MouseButton.Left, true); _tapPhase = 1; }
            else if (_tapPhase == 1) _tapPhase = 0;
            InputSystem.QueueStateEvent(_mouse, ms);
        }

        static UnityEngine.UIElements.VisualElement FindButton(string label)
        {
            foreach (var doc in Object.FindObjectsByType<UnityEngine.UIElements.UIDocument>())
            {
                if (doc.rootVisualElement == null || doc.rootVisualElement.resolvedStyle.display == UnityEngine.UIElements.DisplayStyle.None) continue;
                UnityEngine.UIElements.VisualElement found = null;
                UnityEngine.UIElements.UQueryExtensions.Query<UnityEngine.UIElements.Button>(doc.rootVisualElement).ForEach(b =>
                {
                    if (found != null || b.worldBound.width < 1f) return;
                    var text = b.text;
                    if (string.IsNullOrEmpty(text)) { var l = UnityEngine.UIElements.UQueryExtensions.Q<UnityEngine.UIElements.Label>(b); text = l?.text ?? ""; }
                    if (text == label || b.name == label || text.StartsWith(label)) found = b;
                });
                if (found != null) return found;
            }
            return null;
        }

        /// <summary>Sets the Game view to a fixed resolution (adds it as a custom size once).</summary>
        static void GameViewSize(int w, int h)
        {
            var asm = typeof(UnityEditor.Editor).Assembly;
            var sizesType = asm.GetType("UnityEditor.GameViewSizes");
            var single = typeof(ScriptableSingleton<>).MakeGenericType(sizesType).GetProperty("instance").GetValue(null);
            var group = sizesType.GetMethod("GetGroup").Invoke(single, new object[] { (int)UnityEditor.GameViewSizeGroupType.Standalone });
            var groupType = group.GetType();
            var count = (int)groupType.GetMethod("GetTotalCount").Invoke(group, null);
            var index = -1;
            for (var i = 0; i < count; i++)
            {
                var size = groupType.GetMethod("GetGameViewSize").Invoke(group, new object[] { i });
                var st = size.GetType();
                if ((int)st.GetProperty("width").GetValue(size) == w && (int)st.GetProperty("height").GetValue(size) == h) { index = i; break; }
            }
            if (index < 0)
            {
                var sizeType = asm.GetType("UnityEditor.GameViewSize");
                var kind = asm.GetType("UnityEditor.GameViewSizeType");
                var ctor = sizeType.GetConstructor(new[] { kind, typeof(int), typeof(int), typeof(string) });
                var size = ctor.Invoke(new object[] { System.Enum.Parse(kind, "FixedResolution"), w, h, $"{w}x{h}" });
                groupType.GetMethod("AddCustomSize").Invoke(group, new[] { size });
                index = count;
            }
            var gv = EditorWindow.GetWindow(asm.GetType("UnityEditor.GameView"));
            gv.GetType().GetMethod("SizeSelectionCallback", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                ?.Invoke(gv, new object[] { index, null });
            Log.AppendLine($"  gameview {w}x{h} (size {index})");
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
            var prog = Object.FindAnyObjectByType<JapanMap.Gameplay.Progress.PlayerProgress>();
            if (prog != null && prog.Data != null)
            {
                var sel = prog.Data.Car(prog.Data.selectedCar, false);
                var spec = car != null ? car.Spec : null;
                Log.AppendLine(string.Format(CultureInfo.InvariantCulture,
                    "  progress store={0} from={1} sparks={2} selected={3} tune={4} setup={5} paint='{6}' owned=[{7}] saves={8} carPower={9:0} carLatG={10:0.000}",
                    prog.StoreName, prog.LoadedFrom, prog.Data.sparks, prog.Data.selectedCar, sel != null ? sel.tune.Code : "-",
                    sel != null ? sel.setup.ToString() : "-", sel != null ? sel.paint : "",
                    string.Join(",", prog.Data.cars.FindAll(c => c.owned).ConvertAll(c => c.id)), prog.SaveCount,
                    spec != null ? spec.power / 1000f : 0f, spec != null ? spec.latG : 0f));
            }
            var rk = Object.FindAnyObjectByType<JapanMap.Gameplay.Records.RecordKeeper>();
            var ph = Object.FindAnyObjectByType<JapanMap.Gameplay.Records.PhotoMode>();
            if (rk != null && prog != null && prog.Data != null)
            {
                var r = prog.Data.records;
                Log.AppendLine(string.Format(CultureInfo.InvariantCulture,
                    "  records top={0:0.0} air={1:0.00} jump={2:0.0} chain={3:0} km={4:0.00} cards={5} taken={6} photo={7} last='{8}' {9}",
                    r.topKmh, r.airtime, r.jumpMetres, r.bankedChain, r.distanceKm, r.cards.Count, rk.CardsTaken,
                    ph != null && ph.IsOpen, ph != null ? ph.LastPhoto : "", ph != null ? ph.LastSize.ToString() : ""));
            }
            var ca = Object.FindAnyObjectByType<JapanMap.Gameplay.CarAudio>();
            if (ca != null && ca.Engine != null && car != null)
                Log.AppendLine(string.Format(CultureInfo.InvariantCulture,
                    "  sound gear={0} rpm={1:0} load={2:0.00} tier={3} engine={4:0.000} on={5:0.000} off={6:0.000} pitch={7:0.00} skid={8:0.000} running={9} impact='{10}' last='{11}'",
                    JapanMap.Vehicles.Gearbox.Label(car.Gearbox.Gear), car.Gearbox.Rpm, car.Gearbox.Load, ca.Engine.Tier, ca.Engine.LayerLevel, ca.Engine.OnLevel,
                    ca.Engine.OffLevel, ca.Engine.MainPitch, ca.Tyres != null ? ca.Tyres.SkidLevel : 0f, ca.Engine.Running, ca.LastImpact, JapanMap.Audio.Sfx.Last));
            var gsp = Object.FindAnyObjectByType<JapanMap.Gameplay.Garage.GarageSystem>();
            if (gsp != null) Log.AppendLine($"  garage open={gsp.IsOpen} shown={gsp.Shown} status='{gsp.Status}'");
            var drift = Object.FindAnyObjectByType<JapanMap.Gameplay.Drift.DriftScorer>();
            var wallet = Object.FindAnyObjectByType<JapanMap.Gameplay.Economy.SparksWallet>();
            if (drift != null)
            {
                var ch = drift.Chain;
                Log.AppendLine(string.Format(CultureInfo.InvariantCulture,
                    "  drift active={0} pending={1:0} banked={2:0} mult={3} driftTime={4:0.0} zone={5} slipDeg={6:0} sparks={7}",
                    ch.Active, ch.Pending, ch.Banked, ch.Multiplier, ch.DriftTime, drift.Zone,
                    car != null ? Mathf.Abs(car.Telemetry.slip) * Mathf.Rad2Deg : 0f, wallet != null ? wallet.Balance : 0));
            }
            var regionWatch = Object.FindAnyObjectByType<JapanMap.Gameplay.Regions.RegionWatch>();
            if (regionWatch != null && regionWatch.Regions != null)
                Log.AppendLine($"  region current={(regionWatch.Current >= 0 ? regionWatch.Regions.regions[regionWatch.Current].id : "-")} explored=[{string.Join(",", regionWatch.Explored)}]");
            var disc = Object.FindAnyObjectByType<JapanMap.Gameplay.Discovery.DiscoverySystem>();
            if (disc != null)
            {
                var from = p.Current == PlayerModeController.Mode.Driving && car != null ? car.transform.position : w.transform.position;
                var nearest = "";
                var nd = float.PositiveInfinity;
                foreach (var c in disc.Set.cards)
                {
                    var d = new Vector2(c.position.x - from.x, c.position.y - from.z).magnitude;
                    if (d < nd) { nd = d; nearest = c.id; }
                }
                Log.AppendLine(string.Format(CultureInfo.InvariantCulture, "  discovery prompt='{0}' found=[{1}] nearest={2} {3:0.0} m",
                    disc.Prompt, string.Join(",", disc.Found), nearest, nd));
            }
            var stunts = Object.FindAnyObjectByType<JapanMap.Gameplay.Stunts.StuntScorer>();
            if (stunts != null)
                Log.AppendLine(string.Format(CultureInfo.InvariantCulture, "  stunts count={0} last='{1}' points={2} dist={3:0.0} air={4:0.00}s inAir={5} landing='{6}'",
                    stunts.Count, stunts.Last.title, stunts.Last.points, stunts.Last.distance, stunts.Last.airtime, stunts.Judge.InAir, stunts.Judge.LastLanding) + $" hit='{stunts.LastHit}'");
            var raceDir = Object.FindAnyObjectByType<JapanMap.Gameplay.Races.RaceDirector>();
            if (raceDir != null && raceDir.Current != JapanMap.Gameplay.Races.RaceDirector.State.Idle)
                foreach (var e in raceDir.Entrants)
                    Log.AppendLine(string.Format(CultureInfo.InvariantCulture, "  racer {0} at {1:0} m pos {2} kmh {3:0} rescues {4}",
                        e.name, e.progress.Progress, e.car.transform.position.ToString("0"), e.car.Telemetry.speed * 3.6f, e.rescues));
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
            var shops = Object.FindAnyObjectByType<JapanMap.Gameplay.Life.ShopInteriors>();
            if (shops != null)
                foreach (var r in shops.GetComponentsInChildren<MeshRenderer>())
                    Log.AppendLine($"  shop {r.transform.parent.name} bounds {r.bounds.center:F1} size {r.bounds.size:F1} visible={r.isVisible}");
            var actorsSystem = Object.FindAnyObjectByType<JapanMap.Gameplay.Life.PlaceActors>();
            if (actorsSystem != null)
            {
                Log.AppendLine($"  actors {actorsSystem.Active}/{actorsSystem.Count} active");
                foreach (Transform t in actorsSystem.transform)
                    if (t.gameObject.activeSelf && w != null && Vector3.Distance(t.position, w.transform.position) < 60f)
                        Log.AppendLine($"    {t.name} at {t.position:F1} renderer={(t.GetComponentInChildren<Renderer>()?.enabled.ToString() ?? "none")}");
            }
            var smashSystem = Object.FindAnyObjectByType<JapanMap.Gameplay.Smash.SmashSystem>();
            if (smashSystem != null) Log.AppendLine($"  smash breaks={smashSystem.Breaks} trees={smashSystem.TreesBroken} pieces={smashSystem.LivePieces} worst={smashSystem.WorstBreakMs:0.00}ms");
            var traffic = Object.FindAnyObjectByType<JapanMap.Gameplay.Traffic.TrafficSystem>();
            if (traffic != null)
            {
                var sb = new StringBuilder();
                foreach (var c in traffic.Cars)
                {
                    if (!c.gameObject.activeSelf) { sb.Append(" [off]"); continue; }
                    var road = c.RoadIndex >= 0 ? traffic.Roads.roads[c.RoadIndex].id : "-";
                    sb.Append(string.Format(CultureInfo.InvariantCulture, " [{0} {1:0}km/h off {2:0.0}{3}]", road, c.Car.Telemetry.speed * 3.6f, c.Pilot.Offset, c.Blocked ? " blocked" : ""));
                }
                Log.AppendLine("  traffic" + sb);
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
