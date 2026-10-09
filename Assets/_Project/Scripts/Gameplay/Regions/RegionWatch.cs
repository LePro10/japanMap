using System;
using System.Collections.Generic;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using UnityEngine;

namespace JapanMap.Gameplay.Regions
{
    /// <summary>
    /// "Region explored": stay 1.5 s on the ground in a region and move at least 4 m inside it, then the
    /// region counts once, pays its Sparks and shows a toast. Airborne time freezes the count (a jump
    /// across a region does not discover it). Legacy game/regionExplore.ts RegionWatch, ASTRA §3.
    /// The explored set is saved (PlayerProgress).
    /// </summary>
    public sealed class RegionWatch : MonoBehaviour
    {
        [SerializeField] RegionSet regions;
        [SerializeField] PlayerModeController player;
        [SerializeField] SparksWallet wallet;
        [SerializeField] GameplayHud hud;
        [Tooltip("Saved progress: explored regions survive a reload and pay once (claim region:id).")]
        [SerializeField] PlayerProgress progress;

        readonly HashSet<string> _explored = new();
        int _current = -1;
        float _dwell, _moved;
        Vector3 _entry;

        public RegionSet Regions => regions;
        public int Current => _current;
        public IReadOnlyCollection<string> Explored => _explored;
        /// <summary>Region index, explored count — for HUD, map and tests.</summary>
        public event Action<int, int> RegionExplored;

        void Start()
        {
            if (progress != null && progress.Data != null)
                foreach (var id in progress.Data.regions) _explored.Add(id);
        }

        void Update()
        {
            if (regions == null || player == null) return;
            if (!TryPose(out var p, out var airborne)) return;
            // In the air: freeze, do not reset — landing in the same region continues.
            if (airborne) return;
            var i = regions.IndexAt(p);
            if (i != _current)
            {
                _current = i;
                _dwell = _moved = 0f;
                _entry = p;
                return;
            }
            var id = regions.regions[i].id;
            if (_explored.Contains(id)) return;
            _moved = Mathf.Max(_moved, new Vector2(p.x - _entry.x, p.z - _entry.z).magnitude);
            _dwell += Time.deltaTime;
            if (_dwell < regions.dwellSeconds || _moved < regions.moveMetres) return;
            Explore(i);
        }

        bool TryPose(out Vector3 p, out bool airborne)
        {
            if (player.Current == PlayerModeController.Mode.Driving && player.Car != null)
            {
                p = player.Car.transform.position;
                airborne = player.Car.Telemetry.airborne;
                return true;
            }
            var w = player.Walker;
            if (w != null && w.gameObject.activeInHierarchy)
            {
                p = w.transform.position;
                airborne = !w.Grounded;
                return true;
            }
            p = default;
            airborne = false;
            return false;
        }

        void Explore(int i)
        {
            var r = regions.regions[i];
            _explored.Add(r.id);
            var total = regions.regions.Length;
            var reward = wallet != null ? wallet.Settings.regionReward : 0;
            // Toast first: the HUD then knows the reward is already named and shows no second line.
            if (hud != null) hud.ShowToast($"{r.title} explored · {_explored.Count}/{total} regions · +{reward} Sparks");
            if (progress != null) progress.Data.regions.Add(r.id); // before the grant: the grant saves
            Pay($"region:{r.id}", reward, r.title);
            if (_explored.Count == total && wallet != null)
            {
                if (hud != null) hud.ShowToast($"All {total} regions explored · +{wallet.Settings.allRegionsReward} Sparks");
                Pay("regions:all", wallet.Settings.allRegionsReward, "All regions");
            }
            RegionExplored?.Invoke(i, _explored.Count);
        }

        /// <summary>Through the progress (once per claim, saved) when there is one, else straight into the wallet.</summary>
        void Pay(string claim, int sparks, string reason)
        {
            if (progress != null) progress.Grant(claim, sparks, reason);
            else if (wallet != null) wallet.Add(sparks, reason);
        }
    }
}
