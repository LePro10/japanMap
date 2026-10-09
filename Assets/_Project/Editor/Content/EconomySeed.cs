using System.IO;
using JapanMap.Editor.Vehicles;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Races;
using JapanMap.Vehicles;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// Economy data and its simulated table: dealer prices on the cars, the Tuning asset, measured event
    /// times, and docs/ECONOMY.md written by <see cref="EconomySim"/>.
    /// </summary>
    public static class EconomySeed
    {
        public const string TuningPath = "Assets/_Project/Data/Vehicles/Tuning.asset";
        public const string TablePath = "docs/ECONOMY.md";

        /// <summary>
        /// ASTRA §6 prices by legacy role (D16 pairing). Pip 650 was the reward of E01 Sakura Starter, which is
        /// not built: until it is, Mame K is the cheapest buy, priced below one session (DECISIONS D29).
        /// </summary>
        static readonly (string legacy, int price, string paint)[] Prices =
        {
            ("touge", 0, "Cloud"), ("pip", 2400, "Jade"), ("truck", 3600, "Persimmon"), ("offroad", 9000, "Sand"),
            ("torrent", 15000, "Deep Teal"), ("ribbon", 18000, "Plum"), ("meridian", 27000, "Navy"),
            ("morrow", 30000, "Amber"), ("gt", 42000, "Rose"), ("needle", 54000, "Silver"),
        };

        /// <summary>GO to finish with the autopilot in Hachi 86, Phase 7 gate runs 2026-10-09 (Logs/Editor.log "[Race] … finished").</summary>
        static readonly (string id, float seconds)[] Measured =
        {
            ("coast-loop", 237.5f), ("toge-descent", 186.6f), ("neon-circuit", 123.1f), ("toge-climb", 206.2f),
            ("ring-trial", 228.0f), ("toge-drift", 174.3f), ("needle-sprint", 139.4f), ("open-seat", 61.5f),
        };

        [MenuItem("JapanMap/Economy/Seed Prices And Times")]
        public static string Seed()
        {
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath);
            var n = 0;
            foreach (var v in fleet.vehicles)
                foreach (var p in Prices)
                    if (v.legacyId == p.legacy)
                    {
                        v.price = p.price;
                        v.factoryPaint = p.paint;
                        EditorUtility.SetDirty(v);
                        n++;
                    }
            var events = RaceSeed.LoadOrCreate();
            for (var i = 0; i < events.events.Length; i++)
                foreach (var m in Measured)
                    if (events.events[i].id == m.id) events.events[i].typicalSeconds = m.seconds;
            Rebalance(events, ContentSetup.Asset<EconomySettings>("EconomySettings"));
            EditorUtility.SetDirty(events);
            Tuning();
            AssetDatabase.SaveAssets();
            return $"[Economy] {n} prices, {Measured.Length} event times";
        }

        /// <summary>
        /// Event payouts by time (D29): an ordinary result pays eventSparksPerSecond × the event's cycle, split
        /// into a completion base and a bonus so that the ordinary result (2nd: 65 %, time trial: half,
        /// drift silver: two thirds of the bonus) lands on it. Rounded to 10.
        /// </summary>
        public static void Rebalance(RaceEventSet events, EconomySettings e)
        {
            var sim = new EconomySim(e, null, events, null, null);
            for (var i = 0; i < events.events.Length; i++)
            {
                var ev = events.events[i];
                var ordinary = e.eventSparksPerSecond * sim.Rate(ev).cycle;
                var share = ev.kind == RaceKind.Race ? 0.65f : ev.kind == RaceKind.TimeTrial ? 0.5f : 2f / 3f;
                var completion = ordinary * e.completionShare;
                var bonus = (ordinary - completion) / share;
                events.events[i].completion = Mathf.RoundToInt(completion / 10f) * 10;
                events.events[i].bonus = Mathf.RoundToInt(bonus / 10f) * 10;
            }
        }

        /// <summary>
        /// Ring Time Trial benchmark per car from Captures/ring-bench.json (RingBenchmarkReport: autopilot in every car)
        /// × 1.1, rounded — the rule that gave the Hachi 86 its 250 s (228 s measured).
        /// </summary>
        [MenuItem("JapanMap/Economy/Seed Ring Benchmarks")]
        public static string SeedRingBenchmarks()
        {
            var json = File.ReadAllText(Path.Combine(Directory.GetCurrentDirectory(), "Captures/ring-bench.json"));
            var list = new System.Collections.Generic.List<RaceEventSet.CarTime>();
            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(json,
                         "\"car\":\"(\\w+)\",\"seconds\":([0-9.]+),\"completed\":true"))
                list.Add(new RaceEventSet.CarTime
                {
                    car = m.Groups[1].Value,
                    seconds = Mathf.Round(float.Parse(m.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture) * 1.1f),
                });
            var events = RaceSeed.LoadOrCreate();
            for (var i = 0; i < events.events.Length; i++)
                if (events.events[i].id == "ring-trial") events.events[i].benchByCar = list.ToArray();
            EditorUtility.SetDirty(events);
            AssetDatabase.SaveAssets();
            var text = string.Join(", ", list.ConvertAll(c => $"{c.car} {c.seconds:0}"));
            Debug.Log("[Economy] ring benchmarks: " + text);
            return text;
        }

        public static TuningSettings Tuning()
        {
            var t = AssetDatabase.LoadAssetAtPath<TuningSettings>(TuningPath);
            if (t != null) return t;
            t = ScriptableObject.CreateInstance<TuningSettings>();
            AssetDatabase.CreateAsset(t, TuningPath);
            return t;
        }

        public static EconomySim Sim() => new(
            ContentSetup.Asset<EconomySettings>("EconomySettings"),
            ContentSetup.Asset<DriftSettings>("DriftSettings"),
            RaceSeed.LoadOrCreate(),
            AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetSeed.FleetPath),
            Tuning());

        [MenuItem("JapanMap/Economy/Write Table")]
        public static string WriteTable()
        {
            var md = Sim().Markdown();
            File.WriteAllText(Path.Combine(Directory.GetCurrentDirectory(), TablePath), md);
            return md;
        }
    }
}
