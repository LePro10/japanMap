using System;
using System.Collections.Generic;
using JapanMap.Core.Save;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Progress
{
    /// <summary>One car in the garage: ownership, fitted parts, setup and looks (ASTRA §9 "Exactly what is worth saving").</summary>
    [Serializable]
    public sealed class CarState
    {
        public string id = "";
        public bool owned;
        public CarTune tune;
        public CarSetupMode setup;
        [Tooltip("Applied palette colour; empty = factory livery.")]
        public string paint = "";
        public List<string> paints = new();
        [Tooltip("Fitted rim set (model option 0–2) and the sets bought.")]
        public int wheels;
        public List<int> wheelSets = new();
        [Tooltip("Fitted body kit (model aero option 0–2) and the kits bought.")]
        public int aero;
        public List<int> aeroKits = new();
    }

    /// <summary>A personal best in one event, with the car and parts it was set with (ASTRA §6: records by car and tiers).</summary>
    [Serializable]
    public sealed class BestEntry
    {
        public string car = "";
        public string tune = "";
        public float seconds;
        public float score;
        public int balance;
    }

    [Serializable]
    public sealed class EventRecord
    {
        public string id = "";
        public int runs;
        public int finishes;
        [Tooltip("Best medal tier reached: 0 none, 1 bronze/3rd, 2 silver/2nd, 3 gold/1st.")]
        public int bestTier;
        public List<BestEntry> bests = new();
    }

    /// <summary>Headline driving records (ASTRA §11) and what was set where.</summary>
    [Serializable]
    public sealed class DrivingRecords
    {
        public float topKmh, airtime, jumpMetres, bankedChain, distanceKm;
        public int races, wins;
        public List<RecordCard> cards = new();
    }

    [Serializable]
    public sealed class RecordCard
    {
        public string kind = "";
        public float value;
        public string car = "";
        public string place = "";
        public long at;
    }

    /// <summary>
    /// Everything that survives a reload. JsonUtility-friendly (lists, no dictionaries). Every value is
    /// checked on load, not believed: the store is player-writable and a broken save must not break the game.
    /// </summary>
    [Serializable]
    public sealed class ProgressData
    {
        public const int CurrentVersion = 1;
        /// <summary>Handling/economy balance version; records of another version are not compared silently.</summary>
        public const int CurrentBalance = 1;

        public int version = CurrentVersion;
        public int sparks;
        [Tooltip("One-time rewards already paid (region:x, card:x, medal:x, milestone:x) — no double award after a reload.")]
        public List<string> claims = new();
        public List<string> purchases = new();
        public string selectedCar = "";
        public List<CarState> cars = new();
        public List<string> regions = new();
        public List<string> discoveries = new();
        public List<string> decals = new();
        public List<EventRecord> events = new();
        public DrivingRecords records = new();
        public bool hasLastPosition;
        public Vector3 lastPosition;
        public float lastYaw;
        public float playSeconds;
        public long savedAt;

        public CarState Car(string id, bool create = true)
        {
            foreach (var c in cars) if (c.id == id) return c;
            if (!create) return null;
            var n = new CarState { id = id };
            cars.Add(n);
            return n;
        }

        public EventRecord Event(string id)
        {
            foreach (var e in events) if (e.id == id) return e;
            var n = new EventRecord { id = id };
            events.Add(n);
            return n;
        }

        /// <summary>Repairs whatever a hand-edited or truncated save holds: no NaN, no negatives, no duplicates, tiers 0–2.</summary>
        public void Sanitize(int maxBalance)
        {
            sparks = Mathf.Clamp(sparks, 0, maxBalance);
            claims = Clean(claims);
            purchases = Clean(purchases);
            regions = Clean(regions);
            discoveries = Clean(discoveries);
            decals = Clean(decals);
            selectedCar ??= "";
            cars ??= new List<CarState>();
            cars.RemoveAll(c => c == null || string.IsNullOrEmpty(c.id));
            var seen = new HashSet<string>();
            cars.RemoveAll(c => !seen.Add(c.id));
            foreach (var c in cars)
            {
                foreach (var cat in CarTune.All) c.tune[cat] = c.tune[cat];
                if (!Enum.IsDefined(typeof(CarSetupMode), c.setup)) c.setup = CarSetupMode.Road;
                c.paint ??= "";
                c.paints = Clean(c.paints);
                c.wheelSets = CleanInts(c.wheelSets);
                c.aeroKits = CleanInts(c.aeroKits);
                c.wheels = Mathf.Clamp(c.wheels, 0, 2);
                c.aero = Mathf.Clamp(c.aero, 0, 2);
            }
            events ??= new List<EventRecord>();
            events.RemoveAll(e => e == null || string.IsNullOrEmpty(e.id));
            foreach (var e in events)
            {
                e.runs = Mathf.Max(0, e.runs);
                e.finishes = Mathf.Max(0, e.finishes);
                e.bestTier = Mathf.Clamp(e.bestTier, 0, 3);
                e.bests ??= new List<BestEntry>();
                e.bests.RemoveAll(b => b == null || !Finite(b.seconds) || !Finite(b.score) || b.seconds < 0f || b.seconds > 3600f || b.score < 0f);
            }
            records ??= new DrivingRecords();
            records.topKmh = Plain(records.topKmh, 600f);
            records.airtime = Plain(records.airtime, 60f);
            records.jumpMetres = Plain(records.jumpMetres, 2000f);
            records.bankedChain = Plain(records.bankedChain, 1e9f);
            records.distanceKm = Plain(records.distanceKm, 1e6f);
            records.races = Mathf.Max(0, records.races);
            records.wins = Mathf.Max(0, records.wins);
            records.cards ??= new List<RecordCard>();
            records.cards.RemoveAll(c => c == null || !Finite(c.value));
            if (!Finite(lastPosition.x) || !Finite(lastPosition.y) || !Finite(lastPosition.z) || lastPosition.magnitude > 5000f)
                hasLastPosition = false;
            if (!Finite(lastYaw)) lastYaw = 0f;
            playSeconds = Plain(playSeconds, 1e8f);
        }

        static bool Finite(float v) => !float.IsNaN(v) && !float.IsInfinity(v);
        static float Plain(float v, float max) => Finite(v) ? Mathf.Clamp(v, 0f, max) : 0f;

        static List<string> Clean(List<string> list)
        {
            var o = new List<string>();
            if (list == null) return o;
            foreach (var s in list) if (!string.IsNullOrEmpty(s) && !o.Contains(s)) o.Add(s);
            return o;
        }

        static List<int> CleanInts(List<int> list)
        {
            var o = new List<int>();
            if (list == null) return o;
            foreach (var i in list) if (i >= 0 && i <= 2 && !o.Contains(i)) o.Add(i);
            return o;
        }
    }

    /// <summary>
    /// Reads and writes <see cref="ProgressData"/> as one JSON value. The last good save is kept as a backup;
    /// a save that does not parse is set aside (never overwritten silently) and the backup or a fresh start
    /// is used, so a broken store never stops the game.
    /// </summary>
    public static class ProgressStore
    {
        public const string Key = JapanMap.Core.Save.SaveSync.Key;
        public const string BackupKey = "japanmap.progress.backup";
        public const string CorruptKey = "japanmap.progress.corrupt";

        public enum Source { Fresh, Saved, Backup }

        public static ProgressData Load(ISaveStore store, int maxBalance, out Source source)
        {
            source = Source.Fresh;
            if (TryParse(store, Key, maxBalance, out var data))
            {
                source = Source.Saved;
                return data;
            }
            if (store.TryRead(Key, out var raw) && !string.IsNullOrEmpty(raw))
            {
                store.Write(CorruptKey, raw);
                Debug.LogWarning($"[Save] progress in {store.Name} did not parse — kept as {CorruptKey}, trying the backup");
            }
            if (TryParse(store, BackupKey, maxBalance, out data))
            {
                source = Source.Backup;
                return data;
            }
            return new ProgressData();
        }

        static bool TryParse(ISaveStore store, string key, int maxBalance, out ProgressData data)
        {
            data = null;
            try
            {
                if (!store.TryRead(key, out var raw) || string.IsNullOrWhiteSpace(raw)) return false;
                data = JsonUtility.FromJson<ProgressData>(raw);
                if (data == null || data.version < 1 || data.version > ProgressData.CurrentVersion) return false;
                data.Sanitize(maxBalance);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Save] {key}: {e.Message}");
                data = null;
                return false;
            }
        }

        static bool Parses(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return false;
            try { return JsonUtility.FromJson<ProgressData>(raw)?.version >= 1; }
            catch (Exception) { return false; }
        }

        /// <summary>Writes the save; the previous good one becomes the backup. False if the store failed.</summary>
        public static bool Save(ISaveStore store, ProgressData data)
        {
            try
            {
                data.savedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var json = JsonUtility.ToJson(data);
                // Only a save that parses becomes the backup — never the broken one that was set aside.
                if (store.TryRead(Key, out var previous) && previous != json && Parses(previous))
                    store.Write(BackupKey, previous);
                store.Write(Key, json);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Save] writing to {store.Name} failed: {e.Message}");
                return false;
            }
        }
    }
}
