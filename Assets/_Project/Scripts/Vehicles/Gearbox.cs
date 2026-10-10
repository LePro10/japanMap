using System;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>One car's gearbox as the player sees and hears it (ASTRA §6 "Sound is part of the car specification").</summary>
    [Serializable]
    public struct GearboxSpec
    {
        [Tooltip("Forward gears (ASTRA §6 table).")]
        public int gears;
        [Tooltip("Idle, rpm (legacy gearbox.config.ts).")]
        public float idle;
        [Tooltip("Redline, rpm (ASTRA §6 table); the HUD's red segment starts here.")]
        public float redline;
        [Tooltip("Fuel cut above the redline, rpm.")]
        public float limiter;
        [Tooltip("Upshift load cut, s (ASTRA §6: road cars 0.14, Skiff 0.22, Meridian 0.10, Ember 0.09, Needle 0.07).")]
        public float shiftTime;
        [Tooltip("Free revving up / down, rpm per s (legacy).")]
        public float revRise, revFall;
        [Tooltip("Gear spacing exponent: gear i tops out at vmax·(i/n)^spread (legacy).")]
        public float spread;
    }

    /// <summary>Shift strategy, shared by all cars: a sporty automatic.</summary>
    [Serializable]
    public struct ShiftStrategy
    {
        [Tooltip("Upshift at this share of redline: light throttle, full throttle (ASTRA: 92 % at full).")]
        public Vector2 up;
        [Tooltip("Downshift below this share: light, full load (ASTRA: 42 % under load).")]
        public Vector2 down;
        [Tooltip("Under braking, drop a gear while the lower one stays below this share (legacy 0.74).")]
        public float brakeDown;
        [Tooltip("Hold a gear at least this long, s — no hunting (ASTRA: 0.5 s).")]
        public float hold;
        [Tooltip("Top gear reaches the top speed slightly below redline (legacy 1.05).")]
        public float topGearMargin;
        [Tooltip("Clutch launch rpm as a share of redline (legacy 0.5).")]
        public float launch;
        [Tooltip("Limiter fuel cut, s (legacy 0.055).")]
        public float limiterCut;

        public static ShiftStrategy Default => new()
        {
            up = new Vector2(0.5f, 0.92f), down = new Vector2(0.26f, 0.42f), brakeDown = 0.74f,
            hold = 0.5f, topGearMargin = 1.05f, launch = 0.5f, limiterCut = 0.055f,
        };
    }

    /// <summary>
    /// The gearbox the player hears and reads on the rev counter — ported from legacy src/game/Gearbox.ts.
    /// It acts on **no force**: the arcade model drives without gears (D15). HUD and sound read the same
    /// gear, rpm and load, so the shown gear changes in the same step as the sound's shift cut.
    /// Gear: −1 = R, 0 = N, 1…n.
    /// </summary>
    public sealed class Gearbox
    {
        GearboxSpec _spec;
        ShiftStrategy _shift;
        float[] _tops = Array.Empty<float>();
        float _throttle, _shiftLeft, _cooldown, _cut;
        bool _cutArmed = true;
        bool _shiftUp;

        public int Gear { get; private set; } = 1;
        public float Rpm { get; private set; }
        /// <summary>0…1 engine load (0 during the upshift cut and the limiter).</summary>
        public float Load { get; private set; }
        public int Shifts { get; private set; }
        public int LimiterHits { get; private set; }
        public bool LastShiftUp => _shiftUp;
        public GearboxSpec Spec => _spec;
        /// <summary>Progress of the running shift, 0 = none.</summary>
        public float Shifting => _shiftLeft > 0f && _spec.shiftTime > 0f ? 1f - _shiftLeft / CurrentShiftTime : 0f;
        float _currentShiftTime;
        float CurrentShiftTime => Mathf.Max(1e-3f, _currentShiftTime);

        public void Configure(GearboxSpec spec, ShiftStrategy shift, float topSpeed)
        {
            _spec = spec;
            _shift = shift;
            var vTop = Mathf.Max(10f, topSpeed) * shift.topGearMargin;
            _tops = new float[Mathf.Max(1, spec.gears)];
            for (var i = 1; i <= _tops.Length; i++) _tops[i - 1] = vTop * Mathf.Pow(i / (float)_tops.Length, spec.spread);
            Reset();
        }

        public void Reset()
        {
            Gear = 1;
            Rpm = _spec.idle;
            Load = 0f;
            _throttle = _shiftLeft = _cooldown = _cut = 0f;
        }

        float WheelRpm(float v, int g) => Mathf.Abs(v) / _tops[Mathf.Clamp(g - 1, 0, _tops.Length - 1)] * _spec.redline;

        /// <summary>Top speed of a gear at redline, m/s (tests).</summary>
        public float GearTop(int g) => _tops[Mathf.Clamp(g - 1, 0, _tops.Length - 1)];

        public void Step(float dt, float forwardSpeed, float throttle, float brake, bool airborne, float wheelspin, float skid)
        {
            if (!(dt > 0f) || _tops.Length == 0) return;
            var s = _spec;
            var v = float.IsFinite(forwardSpeed) ? forwardSpeed : 0f;
            var speed = Mathf.Abs(v);
            var thr = Mathf.Clamp01(throttle);
            var brk = Mathf.Clamp01(brake);
            _throttle += (thr - _throttle) * (1f - Mathf.Exp(-dt / 0.045f));
            var t = _throttle;
            _cooldown = Mathf.Max(0f, _cooldown - dt);

            var reverse = v < -0.5f;
            if (reverse) Gear = -1;
            else if (Gear == -1 && v > -0.2f) Gear = 1;

            if (!reverse && _shiftLeft <= 0f && _cooldown <= 0f && !airborne)
            {
                var g = Mathf.Max(1, Gear);
                var upAt = s.redline * Mathf.Lerp(_shift.up.x, _shift.up.y, t);
                var downAt = s.redline * Mathf.Lerp(_shift.down.x, _shift.down.y, t);
                var here = WheelRpm(v, g);
                if (g < s.gears && here > upAt && brk < 0.1f) Begin(g + 1, true);
                else if (g > 1)
                {
                    var lower = WheelRpm(v, g - 1);
                    var canDrop = lower < s.redline * 0.9f;
                    var lugging = here < downAt && lower < upAt * 0.92f;
                    var braking = brk > 0.3f && lower < s.redline * _shift.brakeDown && speed > 2f;
                    var kickdown = t > 0.92f && here < s.redline * 0.55f && lower < s.redline * 0.82f;
                    if (canDrop && (lugging || braking || kickdown)) Begin(g - 1, false);
                }
            }

            var gear = Gear == -1 ? 1 : Mathf.Max(1, Gear);
            var wheel = WheelRpm(v, gear) * (Gear == -1 ? 1.15f : 1f);
            var spinUp = Mathf.Min(0.55f, Mathf.Max(0f, wheelspin - 1f) * 0.35f) + Mathf.Clamp01(skid) * t * 0.22f;
            wheel *= 1f + (gear <= 3 ? spinUp : spinUp * 0.4f);

            var launchRpm = s.idle + t * (s.redline * _shift.launch - s.idle);
            var clutchSlip = gear == 1 && wheel < launchRpm;
            var shifting = _shiftLeft > 0f;
            var free = airborne || shifting || speed < 0.4f;

            float target;
            var load = t;
            if (shifting)
            {
                _shiftLeft = Mathf.Max(0f, _shiftLeft - dt);
                var p = Shifting;
                if (_shiftUp)
                {
                    // The cut and the pitch drop to the new gear's revs — the audible shift.
                    target = WheelRpm(v, gear);
                    load = p < 0.7f ? 0.04f : t * ((p - 0.7f) / 0.3f);
                }
                else
                {
                    // Blip: revs up to the lower gear's speed.
                    target = WheelRpm(v, gear) * 1.04f;
                    load = p < 0.55f ? Mathf.Max(t, 0.62f) : t;
                }
                if (_shiftLeft <= 0f) _cooldown = _shift.hold;
            }
            else if (free)
            {
                target = s.idle + t * (s.limiter + 60f - s.idle);
                if (speed < 0.4f && !airborne) target = Mathf.Max(target, clutchSlip ? launchRpm : s.idle);
            }
            else if (clutchSlip) target = launchRpm;
            else target = Mathf.Max(s.idle, wheel);

            var rpm = Rpm;
            if (!free && !clutchSlip && !shifting) rpm += (target - rpm) * (1f - Mathf.Exp(-dt / 0.035f));
            else
            {
                var d = target - rpm;
                var rate = d > 0f ? s.revRise * (0.35f + 0.65f * Mathf.Max(load, 0.2f)) : s.revFall;
                rpm += Mathf.Sign(d) * Mathf.Min(Mathf.Abs(d), rate * dt);
            }

            if (_cut > 0f)
            {
                _cut = Mathf.Max(0f, _cut - dt);
                load = 0f;
                // No fuel: the revs only fall during the cut (the step above would have pushed them up again).
                rpm = Rpm - s.revFall * 1.5f * dt;
            }
            else if (rpm >= s.limiter && t > 0.3f && _cutArmed)
            {
                _cut = _shift.limiterCut;
                _cutArmed = false;
                LimiterHits++;
                load = 0f;
            }
            // Re-arm only below the limiter: the engine bounces off it (cut, fire, cut) instead of staying cut — measured
            // in Phase 9: load 0 in every frame at the limiter, the engine went near silent.
            if (rpm < s.limiter - 150f) _cutArmed = true;
            rpm = Mathf.Clamp(rpm, s.idle * 0.92f, s.limiter + 80f);
            Rpm = float.IsFinite(rpm) ? rpm : s.idle;
            Load = Mathf.Clamp01(load);

            if (Gear != -1 && speed < 0.15f && t < 0.05f && brk < 0.05f && !shifting) Gear = 0;
            else if (Gear == 0 && (speed >= 0.15f || t >= 0.05f)) Gear = 1;
        }

        void Begin(int to, bool up)
        {
            Gear = to;
            _shiftUp = up;
            _currentShiftTime = up ? _spec.shiftTime : Mathf.Max(0.12f, _spec.shiftTime * 0.9f);
            _shiftLeft = _currentShiftTime;
            Shifts++;
            Shifted?.Invoke(to, up);
        }

        /// <summary>Raised at the step a shift begins (new gear, up?) — the sound's transient hangs on it.</summary>
        public event Action<int, bool> Shifted;

        public static string Label(int gear) => gear < 0 ? "R" : gear == 0 ? "N" : gear.ToString();
    }
}
