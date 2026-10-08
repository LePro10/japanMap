using UnityEngine;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// Pedestrians: how many, how they walk, how they fly when hit. Defaults from legacy
    /// CityPedestrians.ts (COUNT, FAR/NEAR/POP, HIT_*, DOWN_TIME) unless noted.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Life/Pedestrian Settings", fileName = "PedestrianSettings")]
    public sealed class PedestrianSettings : ScriptableObject
    {
        [Header("Count (legacy high 90 / low 36 for the city alone; ours follow the player everywhere)")]
        public int countHigh = 48;
        public int countLow = 24;

        [Header("Where (legacy: people are where the player is)")]
        [Tooltip("Farther than this from the player, a pedestrian is moved to a new spot, m.")]
        public float far = 160f;
        [Tooltip("New spots lie within this distance, m.")]
        public float near = 110f;
        [Tooltip("…and never closer than this, so nobody appears in front of the camera, m.")]
        public float pop = 35f;
        [Tooltip("Next wander target within this radius, m.")]
        public float wanderRadius = 35f;
        [Tooltip("Pause at a target, s (random up to this).")]
        public float maxPause = 4f;

        [Tooltip("Only pedestrians this close to the player cast shadows, m (each shadow is a draw call per cascade; measured +150 at sakura-hof on High).")]
        public float shadowDistance = 30f;

        [Header("Walk")]
        [Tooltip("Walking speed range, m/s (legacy 1.05 + 0…0.5).")]
        public Vector2 speed = new(1.05f, 1.55f);
        public float height = 1.68f;
        public float radius = 0.3f;

        [Header("Hit (legacy HIT_MIN_SPEED / HIT_DRAG / DOWN_TIME)")]
        [Tooltip("Below this car speed nobody is thrown, m/s.")]
        public float hitMinSpeed = 2.5f;
        [Tooltip("Car speed factor per hit: a little physical bump, not a wall.")]
        public float hitDrag = 0.95f;
        [Tooltip("Upward launch: base + share of car speed, m/s (legacy 1.5 + 0.28·v).")]
        public float launchUp = 1.5f;
        public float launchUpPerSpeed = 0.28f;
        [Tooltip("Share of the car's velocity the body takes along.")]
        public float carry = 1.05f;
        [Tooltip("Tumble, rad/s: base + share of car speed (legacy 4 + 0.3·v).")]
        public float spin = 4f;
        public float spinPerSpeed = 0.3f;
        [Tooltip("Lying time before standing up again, s.")]
        public float downTime = 3.5f;
        public float mass = 70f;
    }
}
