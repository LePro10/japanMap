using UnityEngine;

namespace JapanMap.Gameplay.Discovery
{
    public enum PuzzleStep { Wrong, Progress, Solved }

    /// <summary>The state of one sequence or rhythm puzzle. Pure logic; free retries, no penalty.</summary>
    public sealed class DiscoveryPuzzle
    {
        readonly DiscoverySet.Card _card;
        int _done;
        float _last = float.NegativeInfinity;

        public DiscoveryPuzzle(in DiscoverySet.Card card) => _card = card;

        public int Done => _done;

        public void Reset()
        {
            _done = 0;
            _last = float.NegativeInfinity;
        }

        /// <summary>Button <paramref name="index"/> pressed (sequence) or the token pressed (rhythm, index ignored) at time <paramref name="now"/>.</summary>
        public PuzzleStep Press(int index, float now)
        {
            if (_card.trigger == DiscoverySet.Trigger.Sequence)
            {
                if (_card.answer[_done] != index)
                {
                    // A wrong press may be the start of a new try.
                    _done = _card.answer[0] == index ? 1 : 0;
                    return PuzzleStep.Wrong;
                }
                _done++;
                return _done == _card.answer.Length ? Finish() : PuzzleStep.Progress;
            }

            if (_done > 0)
            {
                var gap = _card.gaps[_done - 1];
                var dt = now - _last;
                if (dt < gap.x || dt > gap.y)
                {
                    // Out of time: this press starts a new try.
                    _done = 1;
                    _last = now;
                    return PuzzleStep.Wrong;
                }
            }
            _done++;
            _last = now;
            return _done == _card.gaps.Length + 1 ? Finish() : PuzzleStep.Progress;
        }

        PuzzleStep Finish()
        {
            Reset();
            return PuzzleStep.Solved;
        }
    }
}
