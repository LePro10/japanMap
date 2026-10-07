using System.Collections.Generic;
using System.Linq;
using JapanMap.World;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Editor side of <see cref="ViewpointSet"/>: "Go To" for the scene view (and the main camera in
    /// play mode) and a capture per viewpoint into Captures/vp-&lt;name&gt;.png.
    /// Batch: Tools/capture.mjs --viewpoint pass (or --viewpoint all).
    /// </summary>
    public static class ViewpointTools
    {
        public const string AssetPath = "Assets/_Project/Data/Map/Viewpoints.asset";

        public static ViewpointSet Load() =>
            AssetDatabase.LoadAssetAtPath<ViewpointSet>(AssetPath)
            ?? throw new System.IO.FileNotFoundException(AssetPath);

        [MenuItem("JapanMap/Viewpoints/Go To…")]
        static void GoToMenu()
        {
            var menu = new GenericMenu();
            foreach (var v in Load().viewpoints)
            {
                var name = v.name;
                menu.AddItem(new GUIContent(name), false, () => GoTo(name));
            }
            menu.ShowAsContext();
        }

        [MenuItem("JapanMap/Viewpoints/Capture All")]
        static void CaptureAllMenu() => CaptureAll();

        /// <summary>Moves the scene view there; in play mode also the main camera.</summary>
        public static void GoTo(string name)
        {
            var set = Load();
            if (!set.TryGet(name, out var v)) { Debug.LogError($"[Viewpoint] unknown '{name}'"); return; }
            var view = SceneView.lastActiveSceneView;
            if (view != null)
            {
                view.cameraSettings.farClip = 6000f;
                view.LookAtDirect(v.lookAt, v.Rotation, Vector3.Distance(v.position, v.lookAt));
                view.Repaint();
            }
            if (Application.isPlaying && Camera.main != null) set.Apply(name, Camera.main.transform);
            Debug.Log($"[Viewpoint] {name} — {v.note}");
        }

        /// <summary>Renders the scene's main camera from the viewpoint; the camera is put back afterwards.</summary>
        public static string Capture(string name, int width = 1024, int height = 576)
        {
            var cam = Camera.main;
            if (cam == null) { Debug.LogError("[Viewpoint] no main camera"); return null; }
            var t = cam.transform;
            var (pos, rot) = (t.position, t.rotation);
            try
            {
                Load().Apply(name, t);
                return JapanMap.Editor.Capture.Render(cam, $"{JapanMap.Editor.Capture.Dir}/vp-{name}.png", width, height);
            }
            finally { t.SetPositionAndRotation(pos, rot); }
        }

        public static List<string> CaptureAll(int width = 768, int height = 432) =>
            Load().viewpoints.Select(v => Capture(v.name, width, height)).ToList();
    }
}
