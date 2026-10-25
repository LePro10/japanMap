using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>Materials and amounts for <see cref="VehicleEffects"/>. Assets, so the web build keeps their shaders.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Vehicle Effects Settings", fileName = "VehicleEffects")]
    public sealed class VehicleEffectsSettings : ScriptableObject
    {
        public Material skidMaterial;
        public Material smokeMaterial;

        [Header("Skid marks")]
        [Tooltip("Telemetry skid (0…1) from which the tyres mark the road.")]
        public float markFromSkid = 0.3f;
        public float markWidth = 0.24f;
        [Tooltip("Seconds a mark stays.")]
        public float markSeconds = 12f;

        [Header("Smoke and dust")]
        public float smokeRate = 40f;
        [Tooltip("Off-road speed (m/s) at which dust is full.")]
        public float dustFullSpeed = 20f;
        public Color smokeColor = new(0.85f, 0.85f, 0.88f, 1f);
        public Color dustColor = new(0.62f, 0.52f, 0.38f, 1f);

        [Header("Water spray (legacy PARTICLES)")]
        [Tooltip("Drops per second at a rear wheel at 20 m/s in deep water (legacy dropRateAt20 × 1.7 rear).")]
        public float sprayRate = 160f;
        [Tooltip("Extra drops when a wheel breaks the surface.")]
        public int sprayEntryBurst = 22;
        public float sprayLife = 0.5f;
        [Tooltip("Drop radius, m.")]
        public float spraySize = 0.09f;
        [Tooltip("Launch speeds, m/s, plus a share of the car's speed: up, outward, backward (legacy up/out/back).")]
        public Vector3 sprayLaunch = new(2.4f, 3f, 2f);
        public Vector3 sprayLaunchFromSpeed = new(0.26f, 0.5f, 0.42f);
        [Tooltip("Share of the car's velocity a drop keeps.")]
        public float sprayInherit = 0.2f;
        public Color sprayColor = new(0.84f, 0.9f, 0.95f, 0.8f);
        [Tooltip("Fan at the tyre: short, wide, fast-growing puffs per second at 20 m/s (legacy sheetRateAt20 × 1.7).")]
        public float sheetRate = 40f;
        public float sheetLife = 0.2f;
        [Tooltip("Fan puff size at the start and at the end, m (legacy 0.14 → 0.42 radius).")]
        public Vector2 sheetSize = new(0.3f, 0.9f);
        [Tooltip("Mist behind the car (the smoke puffs, tinted) at this share of the smoke rate.")]
        public float mistShare = 0.35f;
        public Color mistColor = new(0.8f, 0.86f, 0.9f, 1f);
        [Tooltip("Spray amount per quality tier: High, Medium, Low (weak devices first).")]
        public float[] sprayTierScale = { 1f, 0.6f, 0.3f };

        [Header("Nitro flames and burst")]
        [Tooltip("Additive particle material (exhaust flame, burst light streaks).")]
        public Material flameMaterial;
        [Tooltip("Additive ring (burst shock wave).")]
        public Material shockMaterial;
        public Color flameCore = new(0.75f, 0.92f, 1f, 1f);
        public Color flameEdge = new(0.25f, 0.55f, 1f, 1f);
        public Color burstFlame = new(1f, 0.62f, 0.25f, 1f);
        [Tooltip("Flame particles per second while boosting / at the burst peak.")]
        public float flameRate = 70f;
        public float burstFlameRate = 260f;
        [Tooltip("Shock ring end size, m.")]
        public float shockSize = 5.5f;
        [Tooltip("Rear light at the burst, intensity at the peak (0 = no light).")]
        public float burstLight = 2.5f;

        [Tooltip("Lamps of the car-lab cars: glass, brake and reversing lights, the player's headlights (D52).")]
        public HeadlightSettings headlights;
    }
}
