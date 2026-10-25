using System;
using UnityEngine;

namespace JapanMap.Gameplay.Races
{
    public enum RaceKind { Race, TimeTrial, Drift }

    /// <summary>
    /// The event catalogue: legacy config/events.config.ts (the six prototype events, routes on whole
    /// roads) with ASTRA_PLAN.md §8 payouts, plus the Needle circuit events of the catalogue. Rival
    /// drivers with their personalities (ASTRA: Mina, Joss, Ren).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Race Events")]
    public sealed class RaceEventSet : ScriptableObject
    {
        [Serializable]
        public struct Event
        {
            public string id;
            public string title;
            [TextArea] public string blurb;
            public RaceKind kind;
            [Tooltip("Road id in the road network; the route is the whole road.")]
            public string road;
            public bool reverse;
            [Tooltip("Start this far along the route (loops: from the road's first point; sprints: after sprintStart), m — keeps two events' markers apart.")]
            public float startOffset;
            public int laps;
            public int rivals;
            [Tooltip("Fleet id of the rivals' car (legacy rivalVehicle mapped onto the fleet).")]
            public string rivalCar;
            [Tooltip("Car the player gets for this event (empty: own car). ASTRA E14 loans the Needle 01.")]
            public string loanCar;
            public int checkpointsPerLap;
            [Tooltip("Sparks for finishing, at any place (ASTRA §8).")]
            public int completion;
            [Tooltip("Placement / medal bonus maximum; places pay 100/65/35/0 % (ASTRA).")]
            public int bonus;
            [Tooltip("Drift: bronze/silver/gold score. Time trial: benchmark seconds in x (cars without their own).")]
            public Vector3 medals;
            [Tooltip("Time trial: benchmark per car (autopilot time × 1.1, measured — RingBenchmarkReport); a car not listed uses medals.x.")]
            public CarTime[] benchByCar;
            [Tooltip("Drift: time limit, s (ASTRA E07: 240).")]
            public float timeLimit;
            [Tooltip("Typical time from GO to the finish, s — measured with the autopilot in the default car; the economy table uses it.")]
            public float typicalSeconds;
            [TextArea] public string note;
        }

        [Serializable]
        public struct CarTime
        {
            public string car;
            public float seconds;
        }

        /// <summary>Time-trial benchmark for this car (ASTRA: records compare by car).</summary>
        public static float Benchmark(in Event e, string carId)
        {
            if (e.benchByCar != null)
                foreach (var b in e.benchByCar)
                    if (b.car == carId && b.seconds > 0f) return b.seconds;
            return e.medals.x;
        }

        [Serializable]
        public struct Rival
        {
            public string name;
            [Tooltip("Share of the car's grip used in bends — lower brakes earlier.")]
            [Range(0.3f, 0.8f)] public float gripShare;
            [Tooltip("Speed cap of this driver, km/h.")]
            public float maxKmh;
            [Tooltip("Look-ahead time: longer is smoother and wider.")]
            public float lookAheadSeconds;
            [Tooltip("Side of the road the driver keeps, share of the half width (right positive).")]
            [Range(-0.6f, 0.6f)] public float lane;
            public Color paint;
        }

        public Event[] events = Array.Empty<Event>();
        public Rival[] rivals = Array.Empty<Rival>();

        [Header("Running")]
        [Tooltip("Countdown before GO, s (ASTRA: 3–2–1–GO over 3 s; legacy 3.2).")]
        public float countdown = 3f;
        [Tooltip("Checkpoint reach beyond the half width, m (legacy CHECKPOINT_SLACK 14).")]
        public float checkpointSlack = 14f;
        [Tooltip("Grid: row spacing and first row behind the line, m.")]
        public float gridRow = 9f;
        public float gridFirst = 7f;
        [Tooltip("A sprint starts this far into its road, m (room for the grid).")]
        public float sprintStart = 40f;
        [Tooltip("Rescue an entrant that made less than this way in rescueSeconds (legacy RESCUE 3 m / 5 s).")]
        public float rescueMetres = 3f;
        public float rescueSeconds = 5f;
        [Tooltip("An AI car slows to the car ahead in its lane within this distance, m.")]
        public float followGap = 18f;
        [Tooltip("Rubber band: over this gap to the player, m, a rival gets its full push or brake (legacy catchUp.ts).")]
        public float bandRange = 120f;
        [Tooltip("Rubber band: speed cap change at full gap (+ behind the player, − ahead), share.")]
        public float bandSpeed = 0.16f;
        [Tooltip("Rubber band: grip share change in bends at full gap.")]
        public float bandGrip = 0.12f;
        [Tooltip("Recover (R) in an event adds this, s (ASTRA §5).")]
        public float recoverPenalty = 3f;
        [Tooltip("Join: marker radius and speed below which the event can be joined (ASTRA: 12 m, 15 km/h).")]
        public float joinRadius = 12f;
        public float joinKmh = 15f;
        [Tooltip("Event beacons are drawn within this distance of the camera, m (ASTRA: readable from 50 m).")]
        public float beaconDistance = 600f;
        [Tooltip("Leaving the route this far for the abort time ends the event, m / s.")]
        public float abortDistance = 150f;
        public float abortSeconds = 10f;

        [Header("Ghost (POLISH E: the personal best in time trials)")]
        [Tooltip("Time trials record the player's run and show the best one as a see-through car.")]
        public bool ghostInTimeTrials = true;
        [Tooltip("Samples per second of a recorded run (22 bytes each in the save).")]
        public float ghostHz = 10f;
        [Tooltip("See-through material of the ghost car (URP Unlit, transparent); tinted with ghostColor.")]
        public Material ghostMaterial;
        public Color ghostColor = new(0.55f, 0.85f, 1f, 1f);
        [Tooltip("Ghost opacity.")]
        [Range(0f, 1f)] public float ghostAlpha = 0.35f;
        [Tooltip("The ghost fades out from this distance to the player's car down to that one, m (no flicker when overlapping).")]
        public Vector2 ghostFade = new(3f, 9f);

        public Event? Find(string id)
        {
            foreach (var e in events) if (e.id == id) return e;
            return null;
        }
    }
}
