using System;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// What the game can switch on step by step (career / long tutorial, next round). Menus ask by id and show a locked
    /// tile ("Unlocks at …") instead of hiding the feature — the player sees what is coming. New ids go at the end.
    /// </summary>
    public enum FeatureId
    {
        Races, Garage, Tuning, Paint, CarShop, TestDrive, Map, FastTravel, Waypoints, Records, Photo, Daily, Stunts, Nitro,
        AutoDrive,
    }

    /// <summary>Answers "is this feature open yet, and if not, what opens it?" — implemented by the progression system.</summary>
    public interface IUnlockQuery
    {
        bool IsUnlocked(FeatureId id);
        /// <summary>Short reason shown on a locked tile, e.g. "Finish the first drive" (no "Unlocks at" prefix).</summary>
        string Requirement(FeatureId id);
        /// <summary>Something was unlocked (menus rebuild).</summary>
        event Action Changed;
    }

    /// <summary>
    /// The current unlock rules. Default: everything open (today's game). The career system sets <see cref="Query"/>
    /// at boot; UI only reads <see cref="IsUnlocked"/> / <see cref="Hint"/> and listens to <see cref="Changed"/>.
    /// </summary>
    public static class Unlocks
    {
        static IUnlockQuery _query;

        /// <summary>Raised when the rules change or a feature opens.</summary>
        public static event Action Changed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _query = null;
            Changed = null;
        }

        public static IUnlockQuery Query
        {
            get => _query ??= new AllUnlocked();
            set
            {
                if (_query != null) _query.Changed -= Raise;
                _query = value ?? new AllUnlocked();
                _query.Changed += Raise;
                Raise();
            }
        }

        public static bool IsUnlocked(FeatureId id) => Query.IsUnlocked(id);

        /// <summary>"Unlocks: Finish the first drive" — empty when open.</summary>
        public static string Hint(FeatureId id)
        {
            if (Query.IsUnlocked(id)) return "";
            var r = Query.Requirement(id);
            return string.IsNullOrEmpty(r) ? "Locked" : "Unlocks: " + r;
        }

        static void Raise() => Changed?.Invoke();
    }

    /// <summary>Everything open: the game before the career system.</summary>
    public sealed class AllUnlocked : IUnlockQuery
    {
        public bool IsUnlocked(FeatureId id) => true;
        public string Requirement(FeatureId id) => "";
        public event Action Changed { add { } remove { } }
    }
}
