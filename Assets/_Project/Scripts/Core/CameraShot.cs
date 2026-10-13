using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// A camera picture as the player sees it. Rendered into an 8-bit target, URP left the bloom out (neon without glow,
    /// found 2026-10-13); rendered into an HDR target it keeps the whole post stack, and one GPU blit into an sRGB target
    /// does the gamma. Used by photo mode and the editor captures, so both match the game view.
    /// </summary>
    public static class CameraShot
    {
        /// <summary>Renders <paramref name="cam"/> at width × height into a new RGB24 texture (caller destroys it).</summary>
        public static Texture2D Render(Camera cam, int width, int height)
        {
            var hdrFormat = SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBHalf) ? RenderTextureFormat.ARGBHalf : RenderTextureFormat.ARGB32;
            var hdr = RenderTexture.GetTemporary(width, height, 24, hdrFormat, RenderTextureReadWrite.Linear);
            var ldr = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            var oldTarget = cam.targetTexture;
            var oldActive = RenderTexture.active;
            var image = new Texture2D(width, height, TextureFormat.RGB24, false) { name = "CameraShot" };
            try
            {
                cam.targetTexture = hdr;
                cam.Render();
                cam.targetTexture = oldTarget;
                Graphics.Blit(hdr, ldr); // linear → sRGB on write
                RenderTexture.active = ldr;
                image.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                image.Apply();
            }
            finally
            {
                cam.targetTexture = oldTarget;
                RenderTexture.active = oldActive;
                RenderTexture.ReleaseTemporary(hdr);
                RenderTexture.ReleaseTemporary(ldr);
            }
            return image;
        }
    }
}
