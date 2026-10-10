using UnityEngine;

namespace JapanMap.Gameplay.Map
{
    /// <summary>
    /// A postcard of a place for a clue card (ASTRA §10 "actual place crop"): one render from a camera a little way
    /// off the spot, with the game camera's settings (look, post-processing). Rendered on demand in the paused menu;
    /// costs no download. The caller destroys the texture.
    /// </summary>
    public static class Postcard
    {
        public static Texture2D Render(Vector2 at, float ground, float yaw, int width = 384, int height = 216)
        {
            var main = Camera.main;
            if (main == null) return null;
            var go = new GameObject("PostcardCamera");
            var cam = go.AddComponent<Camera>();
            cam.CopyFrom(main);
            cam.enabled = false;
            var spot = new Vector3(at.x, ground + 1.2f, at.y);
            // From in front of the spot, a few metres up: the shape to look for, with its surroundings.
            var back = Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
            go.transform.position = spot + back * 18f + Vector3.up * 6f;
            go.transform.LookAt(spot);
            cam.fieldOfView = 50f;
            var rt = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32);
            var active = RenderTexture.active;
            Texture2D tex;
            try
            {
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;
                tex = new Texture2D(width, height, TextureFormat.RGB24, false) { name = "Postcard (runtime)" };
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply(false, true);
            }
            finally
            {
                cam.targetTexture = null;
                RenderTexture.active = active;
                RenderTexture.ReleaseTemporary(rt);
                Object.Destroy(go);
            }
            return tex;
        }
    }
}
