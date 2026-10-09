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
                case "screen":
                    // Game view with the UI Toolkit overlay (HUD) — 'shot' renders the camera only.
                    var screenPath = Path.Combine(SessionState.GetString(KeyOut, Capture.Dir), a[1] + ".png");
                    ScreenCapture.CaptureScreenshot(screenPath);
                    Log.AppendLine($"  screen {screenPath}");
                    return true;
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
                    foreach (var ir in Object.FindObjectsByType<JapanMap.World.InstanceRenderer>(FindObjectsSortMode.None))
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
                    foreach (var tq in Object.FindObjectsByType<JapanMap.World.TerrainQuality>(FindObjectsSortMode.None)) tq.Apply(a[1]);
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
