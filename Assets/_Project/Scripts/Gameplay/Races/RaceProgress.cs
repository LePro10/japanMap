using UnityEngine;

namespace JapanMap.Gameplay.Races
{
    /// <summary>
    /// One entrant's way along a <see cref="RaceTrack"/>: progress is the travelled distance summed from
    /// signed steps (never a difference of positions), checkpoints fall in order (one skipped point is
    /// forgiven when the next is reached, as in the prototype) and a lap only counts after all its
    /// checkpoints. Pure logic.
    /// </summary>
    public sealed class RaceProgress
    {
        readonly RaceTrack _track;
        readonly float _start, _distance, _reach;
        readonly int _perLap, _laps;
        float _arc;
        bool _placed;

        public RaceProgress(RaceTrack track, float startArc, int laps, int checkpointsPerLap, float reach)
        {
            _track = track;
            _start = startArc;
            _laps = Mathf.Max(1, laps);
            _perLap = Mathf.Max(2, checkpointsPerLap);
            _reach = reach;
            // A loop runs whole laps from the line; a sprint runs from the start to 15 m before the end.
            _distance = track.Closed ? track.Length * _laps : track.Length - 15f - startArc;
        }

        /// <summary>Metres driven from the start line (negative on the grid behind it).</summary>
        public float Progress { get; private set; }
        public float Arc => _arc;
        public float Distance => _distance;
        /// <summary>Checkpoints passed in total (all laps).</summary>
        public int Passed { get; private set; }
        public int TotalCheckpoints => _perLap * (_track.Closed ? _laps : 1);
        /// <summary>Laps completed (loops only).</summary>
        public int Laps => _track.Closed ? Mathf.Min(_laps, Mathf.Max(0, Mathf.Min(Passed / _perLap, Mathf.FloorToInt((Progress + 0.01f) / _track.Length)))) : 0;
        public bool Finished { get; private set; }
        public float FinishTime { get; private set; }

        /// <summary>Progress along the route of checkpoint k (0-based, over all laps).</summary>
        public float CheckpointProgress(int k)
        {
            var lap = k / _perLap;
            var i = k % _perLap + 1;
            var span = _track.Closed ? _track.Length : _distance;
            // The last point of a lap sits on the line itself (progress = lap length).
            return lap * span + span * i / _perLap;
        }

        /// <summary>World position of checkpoint k.</summary>
        public Vector3 CheckpointPoint(int k) => _track.PointAt(_start + CheckpointProgress(k));

        public void Update(Vector3 position, float time)
        {
            if (!_placed)
            {
                _arc = _track.Nearest(position, _start, 120f);
                Progress = _track.Delta(_start, _arc);
                if (!_track.Closed) Progress = _arc - _start;
                _placed = true;
            }
            else
            {
                var arc = _track.Nearest(position, _arc);
                Progress += _track.Delta(_arc, arc);
                _arc = arc;
            }
            if (Finished) return;

            for (var look = 0; look < 2 && Passed + look < TotalCheckpoints; look++)
            {
                var k = Passed + look;
                var p = CheckpointPoint(k);
                // In reach and really there in progress (not across a hairpin or on the grid of lap 1).
                if (new Vector2(p.x - position.x, p.z - position.z).magnitude <= _reach
                    && Progress >= CheckpointProgress(k) - _reach * 2f)
                {
                    Passed = k + 1;
                    break;
                }
            }
            if (Passed >= TotalCheckpoints && Progress >= _distance)
            {
                Finished = true;
                FinishTime = time;
            }
        }

        /// <summary>Standings order: finished before running, earlier finish first, then more progress.</summary>
        public bool IsAheadOf(RaceProgress other)
        {
            if (Finished != other.Finished) return Finished;
            return Finished ? FinishTime < other.FinishTime : Progress > other.Progress;
        }
    }
}
