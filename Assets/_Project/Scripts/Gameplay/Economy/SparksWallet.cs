using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// The player's Sparks for this session. Scores convert at a fixed rate with a rolling cap, so
    /// circling in the hub is never the fastest progress. PROVISIONAL: not saved until Phase 8.
    /// </summary>
    public sealed class SparksWallet : MonoBehaviour
    {
        [SerializeField] EconomySettings settings;

        readonly Queue<(float at, int sparks)> _recent = new();
        float _remainder;

        public EconomySettings Settings => settings;
        public int Balance { get; private set; }
        /// <summary>amount, reason — for the HUD.</summary>
        public event Action<int, string> Earned;

        public void Configure(EconomySettings s) => settings = s;

        public void Add(int amount, string reason)
        {
            if (amount <= 0) return;
            Balance += amount;
            Earned?.Invoke(amount, reason);
        }

        /// <summary>Converts banked drift/stunt score; returns the Sparks actually paid (cap applied).</summary>
        public int AddScore(float score, string reason) => AddScore(score, reason, Time.time);

        public int AddScore(float score, string reason, float now)
        {
            while (_recent.Count > 0 && now - _recent.Peek().at > settings.scoreCapWindow) _recent.Dequeue();
            var used = 0;
            foreach (var r in _recent) used += r.sparks;
            _remainder += score / settings.scorePerSpark;
            var whole = Mathf.FloorToInt(_remainder);
            _remainder -= whole;
            var paid = Mathf.Min(whole, Mathf.Max(0, settings.scoreSparkCap - used));
            if (paid <= 0) return 0;
            _recent.Enqueue((now, paid));
            Add(paid, reason);
            return paid;
        }
    }
}
