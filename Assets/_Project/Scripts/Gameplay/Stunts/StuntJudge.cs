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
        /// <summary>Roof direction, world (zero = unknown: no roll or flip judged).</summary>
        public Vector3 up;
        /// <summary>Body velocity, world.</summary>
        public Vector3 velocity;
        public bool airborne;
        public int groundedWheels;
        public bool stuntMode;
        /// <summary>The body hit something in this step.</summary>
        public bool bodyHit;
        /// <summary>Ramp whose lip is within reach (−1: none).</summary>
        public int rampAtLip;
        /// <summary>The car did a stunt hop in this step (a jump from it pays only its tricks).</summary>
        public bool hop;
        /// <summary>The air trick the car is turning (from the dynamics; None between tricks).</summary>
        public JapanMap.Vehicles.AirTrick airTrick;
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
        float _airTime, _airYaw, _airRoll, _airFlip, _settleTime, _sinceTouch;
        Vector3 _takeoff, _touchAt, _lastFwd, _lastFwd3, _lastUp;
        int _ramp = -1;
        bool _dirtyLanding, _rebound, _fromHop;
        float _sinceHop = 99f;

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
            _sinceHop = d.hop ? 0f : _sinceHop + dt;
            // A hop is a new take-off: an earlier landing that never settled (a wheel hanging on rough grass) ends here.
            if (d.hop) _inAir = _touched = false;

            // ── Air ──────────────────────────────────────────────────────────
            // Off again after a mere bump (a hop on a rough run-up just before the lip): that is a new
            // jump from here, not the bump's rebound — else the take-off sits before the ramp.
            if (d.airborne && _touched && _airTime < _s.minAirtime) _inAir = _touched = false;
            if (d.airborne && !_inAir && !_touched)
            {
                _inAir = true;
                _done.Clear();
                _lastTrick = JapanMap.Vehicles.AirTrick.None;
                _airTime = _airYaw = _airRoll = _airFlip = 0f;
                _fromHop = _sinceHop < 0.3f;
                _lastFwd3 = d.forward;
                _lastUp = d.up;
                _takeoff = d.position;
                _ramp = d.rampAtLip;
                _lastFwd = fwd;
                _spinning = false; // a jump ends any ground spin
            }
            if (_inAir)
            {
                if (d.airborne)
                {
                    // A trick counts when it finishes in the air (its turn left to do reached zero).
                    if (_lastTrick != JapanMap.Vehicles.AirTrick.None && d.airTrick != _lastTrick) _done.Add(_lastTrick);
                    _lastTrick = d.airTrick;
                    _airTime += dt;
                    if (d.up != Vector3.zero && _lastUp != Vector3.zero)
                    {
                        // The step's rotation split into the body's own axes: yaw about the roof, roll about the
                        // nose, flip about the cross axis (a flip turned the flat heading round and read as a 180).
                        var now = Quaternion.LookRotation(d.forward, d.up);
                        (now * Quaternion.Inverse(Quaternion.LookRotation(_lastFwd3, _lastUp))).ToAngleAxis(out var ang, out var axis);
                        if (ang > 180f) ang -= 360f;
                        var w = axis * ang;
                        // Yaw about the world's vertical (a corkscrew spins round it while the body rolls).
                        _airYaw += Vector3.Dot(w, Vector3.up);
                        _airRoll += Vector3.Dot(w, d.forward);
                        _airFlip += Vector3.Dot(w, Vector3.Cross(d.up, d.forward));
                    }
                    else _airYaw += Vector3.SignedAngle(_lastFwd, fwd, Vector3.up);
                    _lastFwd = fwd;
                    _lastUp = d.up;
                    _lastFwd3 = d.forward;
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
            if (_done.Count > 0) { ScoreTricks(dist); return; }
            // Off a ramp every metre pays; a hop from flat ground pays only for what is done in the air.
            var points = _fromHop ? 0 : Mathf.RoundToInt(dist * _s.pointsPerMetre);
            var tricks = new System.Collections.Generic.List<string>();
            var key = "jump";
            if (In(turned, _s.range360)) { points += _s.pointsAir360; tricks.Add("Air 360"); key = "air360"; }
            else if (In(turned, _s.range180)) { points += _s.pointsAir180; tricks.Add("Air 180"); key = "air180"; }
            // Whole rolls and flips, each one paid (a double roll is two).
            var rolls = Mathf.FloorToInt((Mathf.Abs(_airRoll) + 360f - _s.fullTurn) / 360f);
            var flips = Mathf.FloorToInt((Mathf.Abs(_airFlip) + 360f - _s.fullTurn) / 360f);
            if (rolls > 0) { points += rolls * _s.pointsRoll; tricks.Add(_fromHop ? (rolls > 1 ? $"{rolls}× Kickflip" : "Kickflip") : rolls > 1 ? $"{rolls}× Barrel roll" : "Barrel roll"); key += "+roll" + rolls; }
            if (flips > 0) { points += flips * _s.pointsFlip; tricks.Add(flips > 1 ? $"{flips}× {(_airFlip < 0 ? "Backflip" : "Frontflip")}" : _airFlip < 0 ? "Backflip" : "Frontflip"); key += "+flip" + flips; }
            LastLanding += $", roll {_airRoll:0}°, flip {_airFlip:0}°{(_fromHop ? ", from a hop" : "")}";
            if (points <= 0) { LastLanding += " — a hop"; return; }
            // A spin and a roll together is the corkscrew; two or more tricks in one jump pay a combo bonus.
            if (tricks.Count == 2 && tricks[0] == "Air 360" && tricks[1].EndsWith("Barrel roll")) { tricks.Clear(); tricks.Add("Corkscrew"); }
            if (tricks.Count >= 2)
            {
                points = Mathf.RoundToInt(points * _s.comboBonus);
                tricks[0] = "Combo · " + tricks[0];
                key += "+combo";
            }
            var title = tricks.Count > 0 ? $"{string.Join(" + ", tricks)} · {dist:0} m" : $"Jump {dist:0} m";
            Emit(key, title, points, _ramp, dist, _airTime);
        }

        readonly System.Collections.Generic.List<JapanMap.Vehicles.AirTrick> _done = new();
        JapanMap.Vehicles.AirTrick _lastTrick;

        /// <summary>The tricks the car itself finished in the air, by name — the body's measured turns blur when two
        /// axes turn at once (a corkscrew read as 300° and 296°).</summary>
        void ScoreTricks(float dist)
        {
            var points = _fromHop ? 0 : Mathf.RoundToInt(dist * _s.pointsPerMetre);
            var names = new System.Collections.Generic.List<string>();
            var key = "tricks";
            foreach (var kind in new[] { JapanMap.Vehicles.AirTrick.Roll, JapanMap.Vehicles.AirTrick.Backflip, JapanMap.Vehicles.AirTrick.Frontflip,
                         JapanMap.Vehicles.AirTrick.Helicopter, JapanMap.Vehicles.AirTrick.Corkscrew })
            {
                var n = _done.FindAll(x => x == kind).Count;
                if (n == 0) continue;
                var each = kind switch
                {
                    JapanMap.Vehicles.AirTrick.Roll => _s.pointsRoll,
                    JapanMap.Vehicles.AirTrick.Helicopter => _s.pointsAir360,
                    JapanMap.Vehicles.AirTrick.Corkscrew => _s.pointsCorkscrew,
                    _ => _s.pointsFlip,
                };
                points += n * each;
                var name = kind switch
                {
                    JapanMap.Vehicles.AirTrick.Roll => _fromHop ? "Kickflip" : "Barrel roll",
                    JapanMap.Vehicles.AirTrick.Helicopter => "Helicopter",
                    _ => kind.ToString(),
                };
                names.Add(n > 1 ? $"{n}× {name}" : name);
                key += "+" + kind + n;
            }
            if (_done.Count >= 2)
            {
                points = Mathf.RoundToInt(points * _s.comboBonus);
                names[0] = "Combo · " + names[0];
            }
            LastLanding += $", tricks {string.Join(" ", _done)}";
            Emit(key, $"{string.Join(" + ", names)} · {dist:0} m", points, _ramp, dist, _airTime);
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
