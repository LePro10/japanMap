using System;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>The kinds of shot the cinematic camera cuts between while the car drives itself (D49).</summary>
    public enum CineShot
    {
        /// <summary>Driver's eye, looking down the road.</summary>
        Cockpit,
        /// <summary>Ahead of the car, low, looking back at it — the car drives at the lens.</summary>
        Nose,
        /// <summary>Beside the car at its speed, a long lens: the tracking shot of every car advert.</summary>
        Side,
        /// <summary>Behind, near the road, a long lens: the car shimmers ahead.</summary>
        LowChase,
        /// <summary>High behind, a very long lens: the road and the land ahead.</summary>
        WideChase,
        /// <summary>A slow orbit from high up.</summary>
        Helicopter,
        /// <summary>A camera standing at the roadside ahead; the car comes towards it and swishes past.</summary>
        Roadside,
        /// <summary>Low at the rear wheel, looking forward along the flank.</summary>
        Wheel,
    }

    /// <summary>
    /// The shot list of the cinematic camera: what it may show, how often (weight), how long, with which lens. Offsets are
    /// in the car's frame (x right, y up, z forward); <see cref="Shot.randomSide"/> mirrors x per shot. Roadside: z is the
    /// distance ahead along the route, x the step off the road. Helicopter: x/z start the orbit, y its height.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Cinematic Camera Settings", fileName = "CinematicCameraSettings")]
    public sealed class CinematicCameraSettings : ScriptableObject
    {
        [Serializable]
        public struct Shot
        {
            public CineShot kind;
            [Tooltip("Relative chance among the shots that fit here.")]
            public float weight;
            [Tooltip("How long the shot holds, s (min, max).")]
            public Vector2 seconds;
            [Tooltip("Field of view at the start and the end of the shot, degrees: a slow push-in or pull-out.")]
            public Vector2 fov;
            public Vector3 offset;
            [Tooltip("Position damping, s (0 = rigid on the car).")]
            public float damping;
            [Tooltip("Handheld sway, degrees.")]
            public float handheld;
            public bool randomSide;
        }

        public Shot[] shots =
        {
            new() { kind = CineShot.Cockpit, weight = 0.9f, seconds = new Vector2(4f, 6f), fov = new Vector2(62f, 58f), damping = 0f, handheld = 0.35f },
            new() { kind = CineShot.Nose, weight = 1f, seconds = new Vector2(4f, 6f), fov = new Vector2(40f, 34f), offset = new Vector3(0.6f, 0.75f, 8f), damping = 0.25f, handheld = 0.5f, randomSide = true },
            new() { kind = CineShot.Side, weight = 1.3f, seconds = new Vector2(4.5f, 7f), fov = new Vector2(38f, 32f), offset = new Vector3(6f, 0.9f, 0.6f), damping = 0.35f, handheld = 0.6f, randomSide = true },
            new() { kind = CineShot.LowChase, weight = 1f, seconds = new Vector2(5f, 7f), fov = new Vector2(30f, 26f), offset = new Vector3(0.8f, 0.8f, -13f), damping = 0.45f, handheld = 0.7f, randomSide = true },
            new() { kind = CineShot.WideChase, weight = 0.8f, seconds = new Vector2(5f, 8f), fov = new Vector2(26f, 22f), offset = new Vector3(0f, 9f, -30f), damping = 0.8f, handheld = 0.5f },
            new() { kind = CineShot.Helicopter, weight = 1f, seconds = new Vector2(6f, 8f), fov = new Vector2(34f, 30f), offset = new Vector3(22f, 28f, -26f), damping = 1.2f, handheld = 0.8f, randomSide = true },
            new() { kind = CineShot.Roadside, weight = 1.5f, seconds = new Vector2(4f, 7f), fov = new Vector2(34f, 46f), offset = new Vector3(6.5f, 1f, 60f), damping = 0f, handheld = 0.4f, randomSide = true },
            new() { kind = CineShot.Wheel, weight = 0.7f, seconds = new Vector2(3.5f, 5f), fov = new Vector2(56f, 52f), offset = new Vector3(1.3f, 0.38f, -2.2f), damping = 0f, handheld = 0.25f, randomSide = true },
        };

        [Tooltip("The first shot after auto-drive starts (an establishing look at car and road).")]
        public CineShot firstShot = CineShot.Helicopter;
        [Tooltip("The camera keeps this far from walls, terrain and buildings, m.")]
        public float clearance = 0.4f;
        [Tooltip("A shot may lose sight of the car this long (a lamp post) before it cuts, s.")]
        public float occlusionGrace = 0.25f;
        [Tooltip("The camera never sits lower than this above the ground, m.")]
        public float minGroundHeight = 0.3f;
        [Tooltip("Helicopter orbit speed, degrees/s.")]
        public float orbitSpeed = 7f;
        [Tooltip("Roadside: the shot ends this far after the car passed the camera, m.")]
        public float roadsidePassed = 30f;
        [Tooltip("Roadside: the lens follows the distance so the car (≈ roadsideSubject tall) fills this share of the frame height — a long lens far off, the shot's wide fov as it passes. 0 = the shot's own fov over time.")]
        public float roadsideFill = 0.2f;
        [Tooltip("Roadside: the car's size for that framing, m (about its height).")]
        public float roadsideSubject = 1.4f;
        [Tooltip("Roadside: the longest lens, vertical degrees.")]
        public float roadsideMinFov = 4.5f;
        [Tooltip("Handheld sway frequency, Hz.")]
        public float handheldFrequency = 0.35f;
        [Tooltip("Where the lens aims above the car's origin, m.")]
        public float aimHeight = 0.75f;
    }
}
