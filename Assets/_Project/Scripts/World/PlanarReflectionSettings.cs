using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// The mirror of the wet city (legacy PlanarReflection.ts, city.config.ts): Tokyo stands on one flat slab, so a
    /// second camera renders the city mirrored in that plane and the puddles show it — neon, lit windows, lamps.
    /// Screen-space reflection was measured in the prototype to catch only 19 % of the neon (the rest is hidden in
    /// the primary image), so the plane it is.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/World/Planar Reflection Settings")]
    public sealed class PlanarReflectionSettings : ScriptableObject
    {
        [Tooltip("Height of the mirror plane (the city slab top, MapImportSettings.citySlabY), m.")]
        public float planeY = 29.97f;
        [Tooltip("Area the mirror is worth rendering in (x, z centre and half size, m): the slab plus a margin.")]
        public Vector4 region = new(800f, -100f, 620f, 470f);
        [Tooltip("The camera must be lower than this above the plane, m (from high up the puddles are specks).")]
        public float maxCameraHeight = 220f;
        [Tooltip("Render scale of the mirror per quality tier (High, Medium, Low); 0 = off.")]
        public Vector3 scale = new(0.5f, 0.33f, 0f);
        [Tooltip("Longest side of the mirror target, px (legacy: 1280).")]
        public int maxSize = 1280;
        [Tooltip("What the mirror sees, m (the far city is fog anyway).")]
        public float farClip = 600f;
        [Tooltip("Strength of the mirror in the puddles (legacy 0.85).")]
        [Range(0, 1)] public float strength = 0.85f;
        [Tooltip("Ripple distortion of the mirror image, in screen share.")]
        [Range(0, 0.05f)] public float distortion = 0.012f;
        [Tooltip("Layers the mirror renders (everything static and lit; no UI, no water).")]
        public LayerMask layers = ~0;
    }
}
