using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// Converts banked drift/stunt score into Sparks: a fixed rate, the remainder carried, and a rolling
    /// cap so circling in the hub is never the fastest progress (ASTRA §9). Pure logic, shared by the
    /// wallet and the economy simulation, so the table uses exactly the game's rule.
    /// </summary>
    public sealed class ScoreSparkBank
    {
        readonly Queue<(float at, int sparks)> _recent = new();
        float _remainder;

        /// <summary>Sparks paid for this score at time <paramref name="now"/> (cap applied).</summary>
        public int Convert(EconomySettings s, float score, float now)
        {
            while (_recent.Count > 0 && now - _recent.Peek().at > s.scoreCapWindow) _recent.Dequeue();
            var used = 0;
            foreach (var r in _recent) used += r.sparks;
            _remainder += score / s.scorePerSpark;
            var whole = Mathf.FloorToInt(_remainder);
            _remainder -= whole;
            var paid = Mathf.Min(whole, Mathf.Max(0, s.scoreSparkCap - used));
            if (paid > 0) _recent.Enqueue((now, paid));
            return Mathf.Max(0, paid);
        }
    }
}
