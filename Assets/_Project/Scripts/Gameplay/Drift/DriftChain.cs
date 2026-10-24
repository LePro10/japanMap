using System;
using UnityEngine;

namespace JapanMap.Gameplay.Drift
{
    /// <summary>What the chain needs from the car each fixed step.</summary>
    public struct DriftSample
    {
        /// <summary>Planar speed, m/s.</summary>
        public float speed;
        /// <summary>Speed along the nose, m/s — a drift has to move forward.</summary>
        public float forwardSpeed;
        /// <summary>Slip angle, radians, signed by side.</summary>
        public float slip;
        public bool airborne;
        /// <summary>Inside a drift zone (spot bonus).</summary>
        public bool inZone;
    }

    public enum ChainEnd { None, Banked, Crash }

    /// <summary>
    /// The drift chain: points per second from angle and speed, a ×1…×5 multiplier earned by
    /// accumulated drift time, and an open (pending) sum that is only safe once banked. Pure logic,
    /// stepped at the fixed rate so the score does not depend on the frame rate.
    /// </summary>
    public sealed class DriftChain
    {
        readonly DriftSettings _s;
        float _idle, _driftTime, _lastSign, _switchReady;
        bool _scoringNow;

        public DriftChain(DriftSettings settings) => _s = settings;

        /// <summary>Points that are safe.</summary>
        public float Banked { get; private set; }
        /// <summary>Points of the running chain — lost in part on a crash.</summary>
        public float Pending { get; private set; }
        public bool Active { get; private set; }
        /// <summary>Scoring in this very step (for the HUD).</summary>
        public bool Scoring => _scoringNow;
        public int Multiplier { get; private set; } = 1;
        /// <summary>0…1 towards the next multiplier step; 1 at ×5.</summary>
        public float NextStepProgress
        {
            get
            {
                var steps = _s.multiplierSteps;
                var i = Multiplier - 1;
                if (i >= steps.Length) return 1f;
                var from = i == 0 ? 0f : steps[i - 1];
                // Equal steps would divide by zero; the epsilon only matters for such a broken setting.
                return Mathf.Clamp01((_driftTime - from) / Mathf.Max(steps[i] - from, 1e-4f));
            }
        }
        public float DriftTime => _driftTime;
        public bool InZone { get; private set; }
        /// <summary>Seconds of link time left before the chain banks itself.</summary>
        public float LinkLeft => Active ? Mathf.Max(0f, _s.linkGap - _idle) : 0f;

        /// <summary>Raised when a chain ends: reason, points credited, points of the chain before the cut.</summary>
        public event Action<ChainEnd, float, float> Ended;

        /// <summary>Points per second for this state, without multiplier and zone (0 when not a drift).</summary>
        public float Rate(float kmh, float angleDeg)
        {
            if (kmh < _s.minKmh || angleDeg < _s.minAngle || angleDeg > _s.maxAngle) return 0f;
            // Cap equal to reference would divide by zero (NaN rate); the epsilon keeps the factor at 1 there.
            var speed = Mathf.Min(_s.speedCap, 1f + (kmh - _s.refKmh) / Mathf.Max(_s.speedCapKmh - _s.refKmh, 1e-4f) * (_s.speedCap - 1f));
            var angle = Mathf.Min(_s.angleCap, 1f + (angleDeg - _s.refAngle) / Mathf.Max(_s.angleCapDeg - _s.refAngle, 1e-4f) * (_s.angleCap - 1f));
            return _s.baseRate * speed * angle;
        }

        public void Step(float dt, in DriftSample d)
        {
            InZone = d.inZone;
            _switchReady -= dt;
            var angle = Mathf.Abs(d.slip) * Mathf.Rad2Deg;
            var rate = d.airborne || d.forwardSpeed <= 0f ? 0f : Rate(d.speed * 3.6f, angle);
            _scoringNow = rate > 0f;
            if (_scoringNow)
            {
                var sign = Mathf.Sign(d.slip);
                // A clean flick from one side to the other while the chain is alive.
                if (Active && _lastSign != 0f && sign != _lastSign && _switchReady <= 0f)
                {
                    Pending += _s.switchBonus * Multiplier;
                    _switchReady = _s.switchCooldown;
                }
                _lastSign = sign;
                Active = true;
                _idle = 0f;
                _driftTime += dt;
                while (Multiplier <= _s.multiplierSteps.Length && _driftTime >= _s.multiplierSteps[Multiplier - 1]) Multiplier++;
                // The multiplier applies as points are earned, never back over the chain.
                Pending += rate * (d.inZone ? _s.spotBonus : 1f) * Multiplier * dt;
                return;
            }
            if (!Active) return;
            _idle += dt;
            if (_idle >= _s.linkGap) End(ChainEnd.Banked, 1f);
        }

        /// <summary>A body contact that cost <paramref name="lossKmh"/> of speed.</summary>
        public void Contact(float lossKmh)
        {
            if (!Active || lossKmh < _s.contactNoiseKmh) return;
            if (lossKmh >= _s.crashKmh) End(ChainEnd.Crash, _s.crashBankShare);
            else _idle = Mathf.Max(_idle, _s.linkGap - _s.brushGrace);
        }

        /// <summary>Bank the open chain now — event end, respawn, leaving the car.</summary>
        public void Bank()
        {
            if (Active) End(ChainEnd.Banked, 1f);
        }

        public void Reset()
        {
            Banked = Pending = 0f;
            Active = false;
            Multiplier = 1;
            _idle = _driftTime = _lastSign = _switchReady = 0f;
        }

        void End(ChainEnd reason, float share)
        {
            var chain = Pending;
            var credit = chain * share;
            Banked += credit;
            Pending = 0f;
            Active = false;
            Multiplier = 1;
            _idle = _driftTime = _lastSign = 0f;
            Ended?.Invoke(reason, credit, chain);
        }
    }
}
