using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Core.Save
{
    /// <summary>Where progress is kept: a key/value text store (CrazyGames data module, PlayerPrefs, memory).</summary>
    public interface ISaveStore
    {
        /// <summary>For the HUD and logs ("CrazyGames", "This device").</summary>
        string Name { get; }
        bool TryRead(string key, out string value);
        void Write(string key, string value);
        void Delete(string key);
    }

    /// <summary>
    /// The store the game saves to. Starts as the local fallback; the Platform module swaps in the
    /// CrazyGames data module once its SDK is up (before the game scene loads, see Bootstrapper gates).
    /// </summary>
    public static class SaveStores
    {
        static ISaveStore _current;

        public static ISaveStore Current
        {
            get => _current ??= new PlayerPrefsStore(EditorSlot());
            set => _current = value;
        }

        /// <summary>Editor key prefix for agent play scripts, so they never touch the human's own save (SessionState "JapanMap.SaveSlot").</summary>
        public const string SlotKey = "JapanMap.SaveSlot";

        static string EditorSlot()
        {
#if UNITY_EDITOR
            return UnityEditor.SessionState.GetString(SlotKey, "");
#else
            return "";
#endif
        }

        // Domain reload may be disabled: a test's memory store must not leak into the next play session.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => _current = null;
    }

    /// <summary>Unity's PlayerPrefs — on the web the browser's IndexedDB, on this device only.</summary>
    public sealed class PlayerPrefsStore : ISaveStore
    {
        readonly string _prefix;

        public PlayerPrefsStore(string prefix = "") => _prefix = prefix ?? "";

        public string Name => "This device";

        public bool TryRead(string key, out string value)
        {
            key = _prefix + key;
            value = PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null;
            return value != null;
        }

        public void Write(string key, string value)
        {
            PlayerPrefs.SetString(_prefix + key, value);
            PlayerPrefs.Save();
        }

        public void Delete(string key)
        {
            PlayerPrefs.DeleteKey(_prefix + key);
            PlayerPrefs.Save();
        }
    }

    /// <summary>For tests: a store that lives as long as the object.</summary>
    public sealed class MemoryStore : ISaveStore
    {
        public readonly Dictionary<string, string> Data = new();
        public string Name => "Memory";
        public bool TryRead(string key, out string value) => Data.TryGetValue(key, out value);
        public void Write(string key, string value) => Data[key] = value;
        public void Delete(string key) => Data.Remove(key);
    }
}
