using System;
using UnityEngine;

namespace JapanMap.Gameplay.Stunts
{
    /// <summary>One fixed step of what the judge needs from the car.</summary>
    public struct StuntSample
    {
        public Vector3 position;
        /// <summary>Nose direction, world.</summary>
        public Vector3 forward;
        /// <summary>Body velocity, world.</summary>
        public Vector3 velocity;
        public bool airborne;
        public int groundedWheels;
        public bool stuntMode;
        /// <summary>The body hit something in this step.</summary>
        public bool bodyHit;
        /// <summary>Ramp whose lip is within reach (−1: none).</summary>
        public int rampAtLip;
    }

    /// <summary>A scored stunt: title for the HUD, points after the repeat rule, jump data.</summary>
    public struct StuntResult
    {
        public string title;
        public int points;
        public float distance, airtime;
        public int ramp;
        public bool repeat;
    }

    /// <summary>
    /// Judges jumps and spins from fixed-step samples (ASTRA §5): air time and distance from take-off to a
    /// settled, clean, straight-enough landing; air 180/360 from the yaw turned in the air; ground 180/360
    /// in Stunt mode from a spin's total turn and exit speed. Pure logic.
    /// </summary>
    public sealed class StuntJudge
    {
        readonly StuntSettings _s;

        // Air
        bool _inAir, _touched;
        float _airTime, _airYaw, _settleTime, _sinceTouch;
        Vector3 _takeoff, _touchAt, _lastFwd;
        int _ramp = -1;
        bool _dirtyLanding, _rebound;

        // Ground spin
        bool _spinning;
        float _spinYaw, _spinEntry, _calm;

        // Repeats
        string _lastKey = "";
        float _travelSince;
        Vector3 _lastPos;
        bool _hasLast;

        public StuntJudge(StuntSettings settings) => _s = settings;

        public event Action<StuntResult> Scored;
        public bool InAir => _inAir;
        /// <summary>Last landing, judged or not, with the reason (diagnostics, play scripts).</summary>
        public string LastLanding { get; private set; } = "";
        public float AirTime => _airTime;

        public void Step(float dt, in StuntSample d)
        {
            var fwd = Flat(d.forward).normalized;
            if (_hasLast) _travelSince += Flat(d.position - _lastPos).magnitude;
            _lastPos = d.position;
            _hasLast = true;

            // ── Air ──────────────────────────────────────────────────────────
            // Off again after a mere bump (a hop on a rough run-up just before the lip): that is a new
            // jump from here, not the bump's rebound — else the take-off sits before the ramp.
            if (d.airborne && _touched && _airTime < _s.minAirtime) _inAir = _touched = false;
            if (d.airborne && !_inAir && !_touched)
            {
                _inAir = true;
                _airTime = _airYaw = 0f;
                _takeoff = d.position;
                _ramp = d.rampAtLip;
                _lastFwd = fwd;
                _spinning = false; // a jump ends any ground spin
            }
            if (_inAir)
            {
                if (d.airborne)
                {
                    _airTime += dt;
                    _airYaw += Vector3.SignedAngle(_lastFwd, fwd, Vector3.up);
                    _lastFwd = fwd;
                }
                else if (!_touched)
                {
                    _touched = true;
                    _touchAt = d.position;
                    _settleTime = _sinceTouch = 0f;
                    _dirtyLanding = _rebound = false;
                }
            }
            if (_touched)
            {
                _sinceTouch += dt;
                if (d.bodyHit) _dirtyLanding = true;
                // Bounced back into the air before settling: still the same jump.
                // Settled = wheels down for a while; on rough grass one wheel often hangs, so three count,
                // and only leaving the ground again resets it.
                if (d.airborne) { _settleTime = 0f; _rebound = true; }
                else
                {
                    // Distance runs to the last touchdown of a bouncing landing.
                    if (_rebound) { _touchAt = d.position; _rebound = false; }
                    if (d.groundedWheels >= 3) _settleTime += dt;
                }
                if (_settleTime >= _s.settle && _sinceTouch >= _s.cleanAfter) Land(d, fwd);
                return;
            }

            // ── Ground spin ──────────────────────────────────────────────────
            if (d.airborne) return;
            var speedKmh = Flat(d.velocity).magnitude * 3.6f;
            var yawRate = _hasLast && dt > 0f ? Vector3.SignedAngle(_lastFwd == Vector3.zero ? fwd : _lastFwd, fwd, Vector3.up) / dt * Mathf.Deg2Rad : 0f;
            _lastFwd = fwd;
            if (!_spinning)
            {
                if (d.stuntMode && Mathf.Abs(yawRate) > _s.spinStartRate && speedKmh >= _s.spinMinKmh)
                {
                    _spinning = true;
                    _spinYaw = yawRate * dt * Mathf.Rad2Deg;
                    _spinEntry = speedKmh;
                    _calm = 0f;
                }
                return;
            }
            _spinYaw += yawRate * dt * Mathf.Rad2Deg;
            _calm = Mathf.Abs(yawRate) < _s.spinEndRate ? _calm + dt : 0f;
            if (_calm < 0.25f && !d.bodyHit) return;
            _spinning = false;
            if (d.bodyHit) return;
            var turned = Mathf.Abs(_spinYaw);
            if (In(turned, _s.range360) && speedKmh >= _spinEntry * _s.keep360) Emit("g360", "Ground 360", _s.points360, -1, 0f, 0f);
            else if (In(turned, _s.range180) && speedKmh >= _s.end180Kmh) Emit("g180", "Ground 180", _s.points180, -1, 0f, 0f);
        }

        void Land(in StuntSample d, Vector3 fwd)
        {
            _inAir = _touched = false;
            var dist = Flat(_touchAt - _takeoff).magnitude;
            LastLanding = $"air {_airTime:0.00} s, {dist:0.0} m, yaw {_airYaw:0}° from ({_takeoff.x:0}, {_takeoff.z:0})";
            if (_airTime < _s.minAirtime) { LastLanding += " — a bump"; return; }
            if (_dirtyLanding) { LastLanding += " — body hit"; return; }
            // Straight enough: the nose (or the tail, driving on in reverse) within the limit of the travel.
            var v = Flat(d.velocity);
            if (v.sqrMagnitude > 1f)
            {
                var a = Vector3.Angle(fwd, v);
                if (Mathf.Min(a, 180f - a) > _s.landingMaxAngle) { LastLanding += $" — landed {a:0}° off"; return; }
            }
            var turned = Mathf.Abs(_airYaw);
            var points = Mathf.RoundToInt(dist * _s.pointsPerMetre);
            var title = $"Jump {dist:0} m";
            var key = "jump";
            if (In(turned, _s.range360)) { points += _s.pointsAir360; title = $"Air 360 · {dist:0} m"; key = "air360"; }
            else if (In(turned, _s.range180)) { points += _s.pointsAir180; title = $"Air 180 · {dist:0} m"; key = "air180"; }
            Emit(key, title, points, _ramp, dist, _airTime);
        }

        void Emit(string trick, string title, int points, int ramp, float dist, float airtime)
        {
            var key = trick + "@" + ramp;
            var repeat = key == _lastKey && _travelSince < _s.freshDistance;
            if (repeat) points = Mathf.RoundToInt(points * _s.repeatShare);
            _lastKey = key;
            _travelSince = 0f;
            Scored?.Invoke(new StuntResult { title = title, points = points, distance = dist, airtime = airtime, ramp = ramp, repeat = repeat });
        }

        static bool In(float v, Vector2 range) => v >= range.x && v <= range.y;
        static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
    }
}
