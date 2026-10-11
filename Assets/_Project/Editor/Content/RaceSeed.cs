using JapanMap.Gameplay.Races;
using UnityEditor;
using UnityEngine;
using K = JapanMap.Gameplay.Races.RaceKind;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// First fill of Data/Gameplay/RaceEvents.asset: the six prototype events (legacy events.config.ts,
    /// whole roads; legacy rivalVehicle touge/gt/offroad → fleet hachi/rotor/yama) with ASTRA §8 payouts,
    /// and the two Needle circuit events of the ASTRA catalogue. Runs only when the asset is missing.
    /// </summary>
    public static class RaceSeed
    {
        public const string Path = ContentSetup.Dir + "/RaceEvents.asset";

        static RaceEventSet.Event E(string id, string title, string blurb, K kind, string road, bool reverse, int laps, int rivals,
            string rivalCar, int checkpoints, int completion, int bonus, string note) => new()
        {
            id = id, title = title, blurb = blurb, kind = kind, road = road, reverse = reverse, laps = laps, rivals = rivals,
            rivalCar = rivalCar, checkpointsPerLap = checkpoints, completion = completion, bonus = bonus, note = note, loanCar = "",
        };

        public static RaceEventSet LoadOrCreate()
        {
            var set = AssetDatabase.LoadAssetAtPath<RaceEventSet>(Path);
            if (set != null) return set;
            set = ScriptableObject.CreateInstance<RaceEventSet>();
            var trial = E("ring-trial", "Ring Time Trial", "One lap, no rivals, no excuses.", K.TimeTrial, "ring", false, 1, 0, "", 12, 850, 100,
                "Legacy ring-trial; ASTRA E06: 850 + 100 for the benchmark (Kite 250 s; per-car table in Phase 8), 50 within 10 %.");
            trial.medals = new Vector3(250f, 0f, 0f);
            trial.startOffset = 2990f; // the far side of the ring: its own marker
            var driftRun = E("toge-drift", "Tōge Drift Run", "Score as much as you can on the way down. Bank it at the bottom.", K.Drift, "toge", true, 1, 0, "", 8, 600, 300,
                "Legacy touge-drift; ASTRA E07: finish within 240 s, 600 + 100/200/300 for bronze/silver/gold at 15k/35k/70k.");
            driftRun.medals = new Vector3(15000f, 35000f, 70000f);
            driftRun.timeLimit = 240f;
            driftRun.startOffset = 60f; // below the descent's grid
            var openSeat = E("open-seat", "Open Seat", "One lap of the Needle in the Hanami S26, on loan.", K.TimeTrial, "needle-circuit", false, 1, 0, "", 6, 300, 100,
                "ASTRA E14: one lap in a stock Needle 01 (fleet hanami), benchmark 70 s, lesser bonus to 77 s.");
            openSeat.loanCar = "hanami";
            openSeat.medals = new Vector3(70f, 0f, 0f);
            openSeat.startOffset = 1080f;
            set.events = new[]
            {
                E("coast-loop", "Coast Loop", "One lap of the ring road. Sea on one side, rice fields on the other.", K.Race, "ring", false, 1, 3, "hachi", 12, 650, 200,
                    "Legacy coast-loop (ring, 1 lap). ASTRA E02 moves it to a Harbour Outer Road that is not built; the ring stays."),
                E("toge-descent", "Tōge Descent", "Four tight hairpins, forest bends and a downhill finish.", K.Race, "toge", true, 1, 3, "hachi", 8, 700, 200,
                    "Legacy touge-descent; ASTRA E03 Cinder Descent."),
                E("neon-circuit", "Neon Circuit", "Two laps through the city block. Tight, wet, lit.", K.Race, "stadt", false, 2, 3, "rotor", 6, 550, 150,
                    "Legacy neon-circuit (2 laps of 1.5 km); ASTRA E04 asks 3 laps of 0.9 km — same distance."),
                E("toge-climb", "Tōge Climb", "The same four hairpins, uphill. Bring torque.", K.Race, "toge", false, 1, 3, "yama", 8, 750, 200,
                    "Legacy touge-climb; ASTRA E05 Cinder Climb."),
                trial,
                driftRun,
                E("needle-sprint", "Needle Sprint", "Two laps of the Needle circuit: the long straight, the prepared surface.", K.Race, "needle-circuit", false, 2, 3, "rotor", 6, 600, 200,
                    "ASTRA E13: full circuit, two laps."),
                openSeat,
            };
            set.rivals = new[]
            {
                new RaceEventSet.Rival { name = "Mina", gripShare = 0.48f, maxKmh = 135f, lookAheadSeconds = 0.55f, lane = -0.35f, paint = new Color(0.78f, 0.06f, 0.18f) },
                new RaceEventSet.Rival { name = "Joss", gripShare = 0.54f, maxKmh = 150f, lookAheadSeconds = 0.45f, lane = 0.35f, paint = new Color(0.12f, 0.56f, 0.84f) },
                new RaceEventSet.Rival { name = "Ren", gripShare = 0.51f, maxKmh = 160f, lookAheadSeconds = 0.5f, lane = 0f, paint = new Color(0.88f, 0.7f, 0f) },
            };
            AssetDatabase.CreateAsset(set, Path);
            return set;
        }
    }
}
