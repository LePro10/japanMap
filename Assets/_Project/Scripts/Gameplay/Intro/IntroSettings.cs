using UnityEngine;

namespace JapanMap.Gameplay.Intro
{
    /// <summary>
    /// "First Drive" (prototype intro.config.ts, ported 2026-10-11): a new player starts in a rolling car on the coast,
    /// learns one action per prompt — gas, nitro, the jump in slow motion, a barrel roll, a drift — and drives home to
    /// Sakura Commons with enough Sparks for a first buy. Values are the prototype's, measured there; see PLAYER.md.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Intro Settings", fileName = "IntroSettings")]
    public sealed class IntroSettings : ScriptableObject
    {
        [Header("Line")]
        [Tooltip("Ramp of the jump (Ramps.asset): the coast kicker, 330 m from Sakura Commons.")]
        public string rampId = "coast-kicker";
        [Tooltip("Start this far before the lip, m: long enough for the title and two prompts.")]
        public float runUp = 150f;
        [Tooltip("Rolling start, m/s (~95 km/h): standing still at the start of an intro is dead.")]
        public float startSpeed = 26.5f;

        [Header("Slow motion")]
        [Tooltip("Share of real time while airborne.")]
        public float airSlow = 0.16f;
        [Tooltip("Share of real time during the roll (faster, so the turn plays out).")]
        public float rollSlow = 0.5f;
        [Tooltip("Real seconds the slow motion waits for the roll.")]
        public float airWait = 2.8f;
        [Tooltip("Ease of the time scale, 1/s (8 → 90 % in 0.29 s).")]
        public float slowRate = 8f;

        [Header("Beats (real seconds / metres before the lip)")]
        public float titleSeconds = 2.6f;
        [Tooltip("Ask for nitro from here, m before the lip.")]
        public float nitroAt = 95f;
        [Tooltip("Nitro fires by itself from here if the player did not find it — the ramp needs the speed.")]
        public float autoNitroAt = 40f;
        [Tooltip("Without a jump the nitro step moves on after this long (missed the ramp).")]
        public float nitroStall = 7f;
        [Tooltip("After landing the car is braked to this when the player does nothing, m/s (~65 km/h: drift speed).")]
        public float turnSpeed = 18f;
        public float driftHold = 0.7f;
        public float driftTimeout = 14f;
        [Tooltip("Home counts as reached within this distance of Sakura Commons, m.")]
        public float homeRadius = 35f;

        [Header("Run-up assist")]
        public float assistCross = 0.09f;
        public float assistHeading = 1.5f;
        public float assistMax = 0.55f;
        [Tooltip("Share of the player's own steering on the run-up: enough to feel it, too little to miss the ramp.")]
        public float playerSteer = 0.35f;

        [Header("Rewards (Sparks) — together enough for a first part")]
        public int rewardLanding = 500;
        public int rewardRoll = 500;
        public int rewardDrift = 500;
        public int rewardHome = 1500;

        [Tooltip("Hold Tab this long to skip, s.")]
        public float skipHold = 0.9f;
    }
}
