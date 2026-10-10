using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Core.Save
{
    /// <summary>What a save copy holds, for the "Choose progress" sheet (read straight from the JSON).</summary>
    [Serializable]
    public sealed class SaveSummary
    {
        [Serializable]
        public sealed class CarHead
        {
            public string id = "";
            public bool owned;
        }

        public int sparks;
        public float playSeconds;
        public long savedAt;
        public List<CarHead> cars = new();
        public List<string> discoveries = new();

        public int Cars => cars.FindAll(c => c.owned).Count;

        /// <summary>Worth asking about: a minute of play or anything earned. A fresh copy is never offered.</summary>
        public bool Meaningful => playSeconds >= 60f || sparks > 0 || Cars > 1 || discoveries.Count > 0;

        public static SaveSummary Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JsonUtility.FromJson<SaveSummary>(json); }
            catch (Exception) { return null; }
        }

        public string Saved => savedAt <= 0 ? "unknown" : DateTimeOffset.FromUnixTimeSeconds(savedAt).ToLocalTime().ToString("d MMM yyyy, HH:mm");
        public string Played => playSeconds < 3600f ? $"{Mathf.FloorToInt(playSeconds / 60f)} min" : $"{playSeconds / 3600f:0.0} h";
    }

    /// <summary>Two copies of the progress that disagree (ASTRA §9 "Choose progress").</summary>
    public sealed class SaveConflict
    {
        public string DeviceJson, AccountJson;
        public SaveSummary Device, Account;
        /// <summary>Who the account copy belongs to ("guest" or the portal user).</summary>
        public string Owner;
    }

    /// <summary>
    /// Keeps the account copy (CrazyGames data module) and a copy on this device in step, and finds the moments they
    /// disagree: a login onto an account that already has progress (the portal would otherwise silently replace the
    /// guest's), or a session that fell back to this device ("sync pending"). Every account save is mirrored here with
    /// its owner; ASTRA §9: "Logging in never resets a guest's progress without showing that choice", choosing does not
    /// sum wallets, and the copy not chosen stays as a recovery copy. While a choice is pending nothing is saved.
    /// </summary>
    public static class SaveSync
    {
        public const string Key = "japanmap.progress.v1";
        public const string OwnerKey = "japanmap.progress.owner";
        public const string RecoveryKey = "japanmap.progress.recovery";

        static ISaveStore _device, _account;

        public static SaveConflict Pending { get; private set; }
        /// <summary>A conflict was found (at boot or after a login).</summary>
        public static event Action<SaveConflict> ConflictRaised;
        /// <summary>A copy was chosen and written: the game reloads its progress.</summary>
        public static event Action Resolved;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _device = _account = null;
            Pending = null;
            ConflictRaised = null;
            Resolved = null;
        }

        /// <summary>
        /// Compares the account copy with the device copy. The account empty → the device copy moves up silently
        /// (first visit with the SDK, or a guest's first login onto a fresh account). Both there and different, the
        /// device copy meaningful, and not simply an older copy of the same owner → a conflict to show.
        /// </summary>
        public static SaveConflict Reconcile(ISaveStore device, ISaveStore account, string owner)
        {
            _device = device;
            _account = account;
            Pending = null;
            device.TryRead(Key, out var d);
            if (!account.TryRead(Key, out var a) || string.IsNullOrWhiteSpace(a))
            {
                if (SaveSummary.Parse(d) != null)
                {
                    account.Write(Key, d);
                    device.Write(OwnerKey, owner);
                    Debug.Log($"[Save] account copy empty — progress from this device moved up ({owner})");
                }
                return null;
            }
            if (string.IsNullOrWhiteSpace(d) || d == a) return null;
            var sd = SaveSummary.Parse(d);
            var sa = SaveSummary.Parse(a);
            if (sd == null || sa == null || !sd.Meaningful) return null;
            device.TryRead(OwnerKey, out var o);
            if (o == owner && sa.savedAt >= sd.savedAt) return null; // the same player's newer copy from another device
            Pending = new SaveConflict { DeviceJson = d, AccountJson = a, Device = sd, Account = sa, Owner = owner };
            Debug.Log($"[Save] two copies disagree (device {o ?? "local"} {sd.sparks} Sparks/{sd.Played}, account {owner} {sa.sparks} Sparks/{sa.Played}) — Choose progress");
            ConflictRaised?.Invoke(Pending);
            return Pending;
        }

        /// <summary>
        /// Keeps one copy whole (no sums, no rewards paid again); the other becomes the recovery copy in the account.
        /// </summary>
        public static void Resolve(bool keepAccount)
        {
            var c = Pending;
            if (c == null) return;
            var chosen = keepAccount ? c.AccountJson : c.DeviceJson;
            var other = keepAccount ? c.DeviceJson : c.AccountJson;
            _account.Write(Key, chosen);
            _account.Write(RecoveryKey, other);
            Mirror(chosen, c.Owner);
            Pending = null;
            Debug.Log($"[Save] kept the {(keepAccount ? "account" : "device")} copy; the other is the recovery copy");
            Resolved?.Invoke();
        }

        /// <summary>The recovery copy, if one was set aside.</summary>
        public static SaveSummary Recovery(ISaveStore store) =>
            store.TryRead(RecoveryKey, out var r) ? SaveSummary.Parse(r) : null;

        /// <summary>Swaps the current progress and the recovery copy (Settings → Progress).</summary>
        public static bool SwapRecovery(ISaveStore store)
        {
            if (!store.TryRead(RecoveryKey, out var r) || SaveSummary.Parse(r) == null) return false;
            store.TryRead(Key, out var cur);
            store.Write(Key, r);
            if (!string.IsNullOrWhiteSpace(cur)) store.Write(RecoveryKey, cur);
            if (_device != null && !ReferenceEquals(store, _device)) _device.Write(Key, r);
            Resolved?.Invoke();
            return true;
        }

        /// <summary>The account save as it is written, copied to this device with its owner.</summary>
        public static void Mirror(string json, string owner)
        {
            if (_device == null) return;
            _device.Write(Key, json);
            _device.Write(OwnerKey, owner);
        }
    }

    /// <summary>
    /// The account store with every write of the progress mirrored to this device (<see cref="SaveSync"/>), so a
    /// later login or a fallback session can be compared with it.
    /// </summary>
    public sealed class MirroredStore : ISaveStore
    {
        readonly ISaveStore _account;
        public string Owner;

        public MirroredStore(ISaveStore account, string owner)
        {
            _account = account;
            Owner = owner;
        }

        public string Name => _account.Name;
        public bool TryRead(string key, out string value) => _account.TryRead(key, out value);

        public void Write(string key, string value)
        {
            _account.Write(key, value);
            if (key == SaveSync.Key) SaveSync.Mirror(value, Owner);
        }

        public void Delete(string key) => _account.Delete(key);
    }
}
