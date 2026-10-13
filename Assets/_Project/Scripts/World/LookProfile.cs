using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// The whole mood ("blue hour after rain") as data: sun, sky, ambient, fog, post-processing and
    /// wet surfaces. Editor menu "JapanMap/Look/Apply" writes it into Game.unity; the asset is the truth.
    /// Legacy reference: lighting.config.ts / atmosphere.config.ts (sun azimuth 126°, warm key light
    /// #ffb27a against a cool sky, blue-grey ground fog #8fa6bd).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/World/Look Profile", fileName = "Look")]
    public sealed class LookProfile : ScriptableObject
    {
        [Header("Sun (key light)")]
        [Tooltip("Degrees above the horizon. Legacy measured 2.2° from the HDRI; higher keeps terrain readable with realtime shadows.")]
        public float sunElevation = 7f;
        [Tooltip("Compass direction towards the sun, degrees clockwise from +Z (Unity north).")]
        public float sunAzimuth = 126f;
        public Color sunColor = new(1f, 0.70f, 0.48f);
        public float sunIntensity = 1.6f;
        [Range(0, 1)] public float shadowStrength = 0.75f;

        [Header("Sky (Skybox/Procedural)")]
        public Color skyTint = new(0.36f, 0.45f, 0.62f);
        public Color skyGround = new(0.22f, 0.24f, 0.28f);
        [Range(0, 5)] public float atmosphereThickness = 1.35f;
        [Range(0, 8)] public float skyExposure = 0.9f;
        [Range(0, 1)] public float sunSize = 0.015f;
        [Range(1, 10)] public float sunSizeConvergence = 8f;

        [Header("Blue hour sky (JapanMap/Blue Hour Sky)")]
        public Color skyZenith = new(0.10f, 0.18f, 0.38f);
        public Color skyHorizon = new(0.55f, 0.62f, 0.74f);
        [Range(0.5f, 8)] public float skyHorizonSharpness = 2.6f;
        [Range(0, 4)] public float sunGlow = 1.1f;
        [Range(1, 64)] public float sunGlowWidth = 7f;
        public Color cloudShadow = new(0.30f, 0.35f, 0.46f);
        public Color cloudLit = new(1.0f, 0.72f, 0.58f);
        [Range(0, 1)] public float cloudCover = 0.48f;
        [Range(0.01f, 0.5f)] public float cloudSoftness = 0.2f;
        public float cloudScale = 1.6f;
        public float cloudSpeed = 0.004f;

        [Header("Ambient (trilight; cool sky against the warm sun)")]
        public Color ambientSky = new(0.36f, 0.43f, 0.58f);
        public Color ambientEquator = new(0.30f, 0.32f, 0.38f);
        public Color ambientGround = new(0.12f, 0.12f, 0.13f);
        [Tooltip("Strength of sky reflections on wet/glossy surfaces.")]
        [Range(0, 2)] public float reflectionIntensity = 1f;

        [Header("Fog (exponential squared)")]
        public Color fogColor = new(0.50f, 0.58f, 0.68f);
        public float fogDensity = 0.0016f;

        [Header("Post-processing")]
        public float postExposure = 0.2f;
        [Range(-100, 100)] public float contrast = 12f;
        [Range(-100, 100)] public float saturation = -8f;
        [Range(-100, 100)] public float whiteBalanceTemperature = -8f;
        [Range(-100, 100)] public float whiteBalanceTint = 0f;
        public float bloomThreshold = 1.0f;
        public float bloomIntensity = 0.6f;
        [Range(0, 1)] public float bloomScatter = 0.65f;
        [Tooltip("Brightest value bloom takes in. Unclamped, the sun disk (HDR) flooded half the screen when driving towards it.")]
        public float bloomClamp = 6f;
        [Range(0, 1)] public float vignette = 0.22f;
        public Color shadowsTint = new(0.92f, 0.97f, 1.08f, 0f);

        [Header("Wet surfaces")]
        [Range(0, 1)] public float wetAsphaltSmoothness = 0.72f;
        [Range(0, 1)] public float wetConcreteSmoothness = 0.6f;
        [Tooltip("Asphalt normal map strength between the puddles (1 = texture as authored).")]
        [Range(0, 2)] public float asphaltNormal = 0.6f;
        [Tooltip("Albedo multiplier of the wet film on every paved surface.")]
        [Range(0.3f, 1)] public float wetDarken = 0.8f;
        [Header("Puddles (legacy road_puddles: roughness 0.045, flat normal, albedo × 0.42)")]
        [Range(0, 1)] public float puddleCover = 0.32f;
        [Tooltip("Puddle cover on the city slab and concrete (flat, more water stands).")]
        [Range(0, 1)] public float puddleCoverCity = 0.4f;
        [Range(0.005f, 0.3f)] public float puddleSoftness = 0.04f;
        [Range(0, 1)] public float puddleSmoothness = 0.96f;
        [Range(0, 1)] public float puddleDarken = 0.45f;
        [Range(0, 1)] public float puddleEdgeBias = 0.25f;
        [Tooltip("Size of the puddle patches and of their ragged edges, m.")]
        public Vector2 puddleScale = new(17f, 3f);
        [Header("Road paint and shoulder")]
        public Color markColor = new(0.82f, 0.82f, 0.78f);
        public float markWidth = 0.15f;
        public float markInset = 0.3f;
        [Tooltip("Centre line: dash and gap length, m.")]
        public Vector2 dash = new(3f, 5f);
        [Range(0, 1)] public float markWear = 0.6f;
        public Color shoulderTint = new(0.62f, 0.56f, 0.48f);
        [Range(0, 1)] public float shoulderSmoothness = 0.25f;

        /// <summary>Unit vector from the scene towards the sun.</summary>
        public Vector3 TowardsSun()
        {
            var e = sunElevation * Mathf.Deg2Rad;
            var a = sunAzimuth * Mathf.Deg2Rad;
            return new Vector3(Mathf.Sin(a) * Mathf.Cos(e), Mathf.Sin(e), Mathf.Cos(a) * Mathf.Cos(e));
        }

        /// <summary>Rotation for a directional light shining from the sun.</summary>
        public Quaternion SunRotation() => Quaternion.LookRotation(-TowardsSun(), Vector3.up);
    }
}
