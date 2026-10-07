using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace JapanMap.Editor
{
    /// <summary>
    /// Renders the main camera of a scene into a PNG under Captures/. Works without a focused
    /// window or Game view because it renders into its own RenderTexture.
    /// Batch:  Unity -batchmode -quit -executeMethod JapanMap.Editor.Capture.Batch
    ///         [-jmScene Assets/.../Game.unity] [-jmOut Captures/x.png] [-jmWidth 1024] [-jmHeight 576]
    ///         [-jmViewpoint name|all] (→ Captures/vp-&lt;name&gt;.png, see Map.ViewpointTools)
    /// Editor: menu JapanMap/Capture Main Camera (current scene, also in play mode).
    /// </summary>
    public static class Capture
    {
        public const string Dir = "Captures";

        public static void Batch()
        {
            var scenePath = BatchArgs.Get("jmScene", ProjectSetup.GameScene);
            var name = Path.GetFileNameWithoutExtension(scenePath);
            var output = BatchArgs.Get("jmOut", $"{Dir}/{name}.png");
            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var viewpoint = BatchArgs.Get("jmViewpoint", null);
            if (viewpoint != null)
            {
                var w = BatchArgs.GetInt("jmWidth", 1024);
                var h = BatchArgs.GetInt("jmHeight", 576);
                var written = viewpoint == "all"
                    ? Map.ViewpointTools.CaptureAll(w, h)
                    : new System.Collections.Generic.List<string> { Map.ViewpointTools.Capture(viewpoint, w, h) };
                if (written.Contains(null)) EditorApplication.Exit(1);
                return;
            }
            var path = Render(Camera.main, output, BatchArgs.GetInt("jmWidth", 1024), BatchArgs.GetInt("jmHeight", 576));
            if (path == null) EditorApplication.Exit(1);
        }

        [MenuItem("JapanMap/Capture Main Camera")]
        public static void FromMenu()
        {
            // An unsaved scene has an empty name; without the fallback the file would be ".png".
            var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name;
            Render(Camera.main, $"{Dir}/{(string.IsNullOrEmpty(scene) ? "untitled" : scene)}.png", 1024, 576);
        }

        /// <summary>Returns the written path, or null (with an error in the console) on failure.</summary>
        public static string Render(Camera camera, string output, int width, int height)
        {
            if (camera == null)
            {
                Debug.LogError("[Capture] no camera tagged MainCamera in the scene");
                return null;
            }

            var rt = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            var previousTarget = camera.targetTexture;
            var previousActive = RenderTexture.active;
            var image = new Texture2D(width, height, TextureFormat.RGB24, false);
            try
            {
                camera.targetTexture = rt;
                camera.Render();
                RenderTexture.active = rt;
                image.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                image.Apply();
            }
            finally
            {
                camera.targetTexture = previousTarget;
                RenderTexture.active = previousActive;
                RenderTexture.ReleaseTemporary(rt);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));
            File.WriteAllBytes(output, image.EncodeToPNG());
            var stats = Measure(image);
            Object.DestroyImmediate(image);
            Debug.Log($"[Capture] {output} {width}x{height} meanLuma={stats.mean:F3} nonBlack={stats.nonBlack:F3}");
            return output;
        }

        /// <summary>Mean luminance and share of non-black pixels — catches empty or cropped frames.</summary>
        static (float mean, float nonBlack) Measure(Texture2D image)
        {
            var px = image.GetPixels32();
            double sum = 0;
            var lit = 0;
            foreach (var p in px)
            {
                var l = (0.2126f * p.r + 0.7152f * p.g + 0.0722f * p.b) / 255f;
                sum += l;
                if (p.r + p.g + p.b > 6) lit++;
            }
            return ((float)(sum / px.Length), (float)lit / px.Length);
        }
    }
}
