using System.IO;
using System.Text;
using JapanMap.Editor.Map;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace JapanMap.Editor
{
    /// <summary>
    /// Render numbers per viewpoint, measured in play mode started from Boot.unity (the real path).
    /// Averages draw calls, SetPass calls, triangles and frame time over a few frames at
    /// each viewpoint and writes Captures/bench-&lt;label&gt;.txt. Editor only: the Web player reports 0
    /// draw calls, and batch mode does not render.
    /// MCP: execute_code JapanMap.Editor.ViewpointBench.Run("label", "start,pass,stadt") — returns at once;
    /// poll for the report file (or "[Bench] done" in the console).
    /// </summary>
    [InitializeOnLoad]
    public static class ViewpointBench
    {
        const string KeyLabel = "JapanMap.Bench.Label";
        const string KeyNames = "JapanMap.Bench.Names";
        const string KeyReturnScene = "JapanMap.Bench.ReturnScene";
        const int WarmupFrames = 60, SettleFrames = 20, SampleFrames = 30;

        public static readonly string[] DefaultViewpoints = { "start", "stadt", "pass", "reisfeld", "tempel", "kueste" };

        static string[] _names;
        static int _index, _frame;
        static double _calls, _setPass, _tris, _ms;
        static StringBuilder _report;

        static ViewpointBench() => EditorApplication.playModeStateChanged += OnPlayModeChanged;

        public static string ReportPath(string label) => $"{Capture.Dir}/bench-{label}.txt";

        public static void Run(string label, string names = null)
        {
            if (EditorApplication.isPlaying) { Debug.LogError("[Bench] already in play mode"); return; }
            SessionState.SetString(KeyLabel, label);
            SessionState.SetString(KeyNames, string.IsNullOrEmpty(names) ? string.Join(",", DefaultViewpoints) : names);
            SessionState.SetString(KeyReturnScene, EditorSceneManager.GetActiveScene().path);
            if (File.Exists(ReportPath(label))) File.Delete(ReportPath(label));
            EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
            EditorSceneManager.OpenScene(ProjectSetup.BootScene, OpenSceneMode.Single);
            EditorApplication.EnterPlaymode();
        }

        static void OnPlayModeChanged(PlayModeStateChange change)
        {
            var label = SessionState.GetString(KeyLabel, "");
            if (string.IsNullOrEmpty(label)) return;
            if (change == PlayModeStateChange.EnteredPlayMode)
            {
                _names = SessionState.GetString(KeyNames, "").Split(',');
                _index = -1;
                _frame = 0;
                _report = new StringBuilder();
                _report.AppendLine($"bench {label} · {System.DateTime.Now:yyyy-MM-dd HH:mm} · {SystemInfo.graphicsDeviceName} · quality {QualitySettings.names[QualitySettings.GetQualityLevel()]}");
                _report.AppendLine($"{"viewpoint",-14} {"drawCalls",9} {"setPass",8} {"tris k",8} {"ms",6}");
                EditorApplication.update += Step;
            }
            else if (change == PlayModeStateChange.EnteredEditMode)
            {
                var scene = SessionState.GetString(KeyReturnScene, "");
                SessionState.EraseString(KeyLabel);
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
            }
        }

        static void Step()
        {
            var cam = Camera.main;
            _frame++;
            if (_index < 0)
            {
                if (_frame < WarmupFrames || cam == null) return;
                Next(cam);
                return;
            }
            if (_frame <= SettleFrames) return;
            if (_frame == SettleFrames + 1 && ViewpointTools.Load().TryGet(_names[_index], out var vp) && Vector3.Distance(cam.transform.position, vp.position) > 1f)
                Debug.LogError($"[Bench] camera is not at viewpoint {_names[_index]} — something else moves it");
            _calls += UnityStats.drawCalls;
            _setPass += UnityStats.setPassCalls;
            _tris += UnityStats.triangles;
            _ms += Time.unscaledDeltaTime * 1000.0;
            if (_frame < SettleFrames + SampleFrames) return;
            const double n = SampleFrames;
            _report.AppendLine($"{_names[_index],-14} {_calls / n,9:F0} {_setPass / n,8:F0} {_tris / n / 1000,8:F0} {_ms / n,6:F1}");
            Next(cam);
        }

        static void Next(Camera cam)
        {
            _index++;
            _frame = 0;
            _calls = _setPass = _tris = _ms = 0;
            if (_index < _names.Length)
            {
                // Since Phase 3 the car camera (Cinemachine) moves the main camera every frame; without
                // this every viewpoint measured the car's view (bench p4-veg: 9 identical rows).
                foreach (var b in cam.GetComponents<Behaviour>())
                    if (b.GetType().Name.Contains("Cinemachine")) b.enabled = false;
                foreach (var rig in Object.FindObjectsByType<JapanMap.Vehicles.CarCameraRig>()) rig.enabled = false;
                ViewpointTools.Load().Apply(_names[_index], cam.transform);
                return;
            }
            EditorApplication.update -= Step;
            var label = SessionState.GetString(KeyLabel, "bench");
            Directory.CreateDirectory(Capture.Dir);
            File.WriteAllText(ReportPath(label), _report.ToString());
            Debug.Log("[Bench] done\n" + _report);
            EditorApplication.ExitPlaymode();
        }
    }
}
