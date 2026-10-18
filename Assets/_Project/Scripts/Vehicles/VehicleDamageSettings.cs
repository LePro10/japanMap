using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// How a car takes a hit (D47): the impact is the speed change PhysX gave the body (impulse / mass), so a light
    /// and a heavy car dent alike at the same crash. Small things (signs, cones, fences) count only a share of the
    /// approach speed (BreakableSettings.carDamage) — the car drives through them. What is seen counts: dents, scratches,
    /// cracked or broken glass, a bent or lost wheel. No hidden damage: engine and steering stay whole.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Vehicle Damage Settings", fileName = "VehicleDamage")]
    public sealed class VehicleDamageSettings : ScriptableObject
    {
        [Header("Impact (speed change of the car body, m/s)")]
        [Tooltip("Below this nothing dents (a scuff at most).")]
        public float dentFrom = 2.5f;
        [Tooltip("A scuff decal from here (a graze along a wall, a tap).")]
        public float scuffFrom = 1.2f;
        [Tooltip("Crush depth per m/s above dentFrom, m, plus a square term: crumple zones give more the harder the hit " +
                 "(tree at 60 km/h ≈ 0.11 m, wall at 60 ≈ 0.23 m, wall at 110 ≈ 0.7 m).")]
        public float depthPerDeltaV = 0.012f;
        public float depthPerDeltaV2 = 0.0006f;
        [Tooltip("Crush depth of one hit at most, m.")]
        public float maxDepth = 0.85f;
        [Tooltip("Dent radius at no speed and per m/s, m (a wall at 100 km/h crushes the whole front).")]
        public float radiusBase = 0.26f;
        public float radiusPerDeltaV = 0.036f;
        [Tooltip("The dent is no wider than the thing hit plus this, m (a trunk leaves a narrow fold).")]
        public float radiusOverObject = 0.25f;
        [Tooltip("A narrow thing (a trunk, a pole) concentrates the hit: up to this many times deeper than a wall at the same speed change.")]
        public float narrowDepth = 1.5f;
        [Tooltip("Half width below which a thing counts as narrow, m.")]
        public float narrowBelow = 0.6f;
        [Tooltip("Wrinkles (0 = smooth dent, 1 = crumpled sheet).")]
        [Range(0f, 1f)] public float crumple = 0.65f;
        [Tooltip("Total move of any vertex from its modelled place, m.")]
        public float maxDisplacement = 1f;
        [Tooltip("Share of a hit on the underside that counts (landings).")]
        [Range(0f, 1f)] public float undersideShare = 0.2f;
        [Tooltip("Steps a hit gathers its impulse over (the crash is spread over a couple of physics steps).")]
        public int gatherSteps = 3;
        [Tooltip("Main-thread time a frame may spend crumpling the body, ms (the rest waits for the next frame; half of it " +
                 "in the frame of the hit itself).")]
        public float frameBudgetMs = 1f;

        [Header("Hanging bumper")]
        [Tooltip("From this speed change a hit at the front or rear leaves the bumper hanging down at one side, m/s.")]
        public float droopFrom = 16f;
        [Tooltip("How far it hangs at most, m.")]
        public float droopMax = 0.22f;

        [Header("Wheels")]
        [Tooltip("Push at the tyre that bends a wheel, m.")]
        public float wheelBendPush = 0.04f;
        [Tooltip("Push at the tyre that tears it off, m — and the hit must be at least wheelOffDeltaV.")]
        public float wheelOffPush = 0.1f;
        public float wheelOffDeltaV = 20f;
        [Tooltip("Wobble of a bent wheel at most, degrees.")]
        public float maxWobble = 7f;
        [Tooltip("Steering pull per metre of bend (share of full lock), at most maxPull.")]
        public float pullPerBend = 0.7f;
        public float maxPull = 0.07f;
        [Tooltip("A lost wheel pulls the car to its side, share of full lock (front; a rear one half).")]
        public float lostWheelPull = 0.12f;
        [Tooltip("A lost wheel: the hub that is left, radius m, and its friction on the road.")]
        public float hubRadius = 0.12f;
        public float hubFriction = 0.75f;
        public float looseWheelMass = 18f;
        [Tooltip("A loose wheel lies this long before it sinks away (it comes back on repair anyway), s.")]
        public float looseWheelLife = 25f;

        [Header("Glass")]
        public float glassCrackDeltaV = 6f;
        public float glassBreakDeltaV = 13f;
        [Tooltip("A hard hit square on the nose (or tail) cracks the windscreen (rear window) too, Δv m/s — the hit point on the "
            + "bumper is too far away for the crack round it. The pane stays in (laminated): the driver keeps seeing out.")]
        public float windscreenCrackDeltaV = 11f;
        [Tooltip("From here the windscreen crack is a shattered web, Δv m/s.")]
        public float windscreenShatterDeltaV = 19f;

        [Header("Scrapes")]
        [Tooltip("Sliding speed along a wall or on a hub that throws sparks, m/s.")]
        public float scrapeSpeed = 4f;
        [Tooltip("Metres of sliding between two scratch marks.")]
        public float scratchEvery = 1.5f;

        [Header("Look")]
        [Tooltip("Additive streak material for sparks.")]
        public Material sparkMaterial;
        [Tooltip("Lit particle material (vertex colour) for paint flakes, plastic and glass bits.")]
        public Material debrisMaterial;
        [Tooltip("Transparent lit material for scratches and cracks; its texture is drawn at start (no download).")]
        public Material decalMaterial;
        public Color sparkColor = new(1f, 0.72f, 0.32f, 1f);
        public Color plasticColor = new(0.07f, 0.07f, 0.075f, 1f);
        public Color glassColor = new(0.78f, 0.88f, 0.92f, 0.9f);
        [Tooltip("Scratch and crack marks on the car at once (the oldest goes).")]
        public int maxMarks = 24;
        [Tooltip("Sparks per m/s of impact, bits per m/s above dentFrom.")]
        public float sparksPerDeltaV = 2.2f;
        public float bitsPerDeltaV = 0.9f;

        [Header("Quality (share of particles / marks on Medium and Low)")]
        [Range(0f, 1f)] public float mediumEffects = 0.7f;
        [Range(0f, 1f)] public float lowEffects = 0.35f;
        [Tooltip("Bits bounce off the world on High and Medium; on Low they fall through after their life.")]
        public bool collideOnLow;

        public float EffectShare(string tier) => tier == "Low" ? lowEffects : tier == "Medium" ? mediumEffects : 1f;

        /// <summary>Crush depth of a hit of <paramref name="deltaV"/> m/s.</summary>
        public float Depth(float deltaV)
        {
            var x = Mathf.Max(0f, deltaV - dentFrom);
            return Mathf.Min(maxDepth, x * depthPerDeltaV + x * x * depthPerDeltaV2);
        }

        /// <summary>Depth factor for a thing <paramref name="objectHalfWidth"/> m wide each side (1 for a wall).</summary>
        public float Narrow(float objectHalfWidth) => 1f + (narrowDepth - 1f) * Mathf.Clamp01((narrowBelow - objectHalfWidth) / narrowBelow);

        /// <summary>Dent radius of a hit of <paramref name="deltaV"/> m/s against something <paramref name="objectHalfWidth"/> m wide each side.</summary>
        public float Radius(float deltaV, float objectHalfWidth) =>
            Mathf.Min(radiusBase + radiusPerDeltaV * deltaV, objectHalfWidth + radiusOverObject);
    }
}
