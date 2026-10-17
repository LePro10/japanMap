using System;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>
    /// Drive-to-waypoint with the cinematic camera. Lives in Core so the career/tutorial can teach it without
    /// depending on Vehicles; the vehicle side implements it and sets <see cref="AutoDrive.Current"/> at boot.
    /// </summary>
    public interface IAutoDrive
    {
        /// <summary>A waypoint is set and a route to it exists.</summary>
        bool HasDestination { get; }
        /// <summary>The car is currently driving itself.</summary>
        bool IsActive { get; }
        /// <summary>Start (true) or hand control back (false). Starting without a destination does nothing.</summary>
        void SetActive(bool on);
        /// <summary>Raised on every start/stop, including the player taking over by steering.</summary>
        event Action<bool> ActiveChanged;
        /// <summary>The car reached the waypoint while driving itself.</summary>
        event Action Arrived;
    }

    /// <summary>Access point for <see cref="IAutoDrive"/>; null until the vehicle side registers.</summary>
    public static class AutoDrive
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Current = null;

        public static IAutoDrive Current { get; set; }

        public static bool IsActive => Current != null && Current.IsActive;
    }
}
