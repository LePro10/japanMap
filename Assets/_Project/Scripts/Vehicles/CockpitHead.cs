using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// The driver's head in the cockpit view (D51): where it looks and how the body moves it. Pure maths on the car's
    /// telemetry so a test can drive it without a scene. The look turns towards where the car is going (the slide in a
    /// drift, the yaw a moment ahead, the steering into a bend — Assetto Corsa / Forza style), the g-forces lean and
    /// shift the head, and short kicks (shift, landing, kerb, impact) ring out on a damped spring. A road buzz grows with
    /// speed, rough ground and tyre shudder. Shake scales with the player's "Camera shake" option; the look does not.
    /// </summary>
    public sealed class CockpitHead
    {
        public struct Input
        {
            public float speed, vLong, vLat, yawRate, steer, accelLong, accelLat;
            public float drift, wheelspin, burst;
            public Surface surface;
            public bool airborne;
            /// <summary>Summed suspension speed of the wheels this step, m/s (kerbs, bumps).</summary>
            public float bump;
            /// <summary>+1 upshift, −1 downshift, 0 none — in this step.</summary>
            public int shift;
            /// <summary>Vertical touchdown speed, m/s (0 = no landing this step).</summary>
            public float landing;
            /// <summary>Crash Δv, m/s (0 = none this step).</summary>
            public float impact;
        }

        /// <summary>Pitch (+ = down), yaw (+ = right), roll (+ = right ear down), degrees, relative to the seat.</summary>
        public Vector3 Euler;
        /// <summary>Head offset in the car's frame, m.</summary>
        public Vector3 Offset;
        /// <summary>The shaking part of <see cref="Euler"/> (kicks and buzz), degrees — zero with the option off.</summary>
        public Vector3 Shake;
        /// <summary>Pad rumble, 0…1, before any option: high motor = tyres and ground, low motor = hits.</summary>
        public float RumbleHigh, RumbleLow;

        float _yaw, _yawVel;
        Vector3 _lean;
        Vector3 _kick, _kickVel;
        float _t, _buzzEnv, _hit;

        public void Reset()
        {
            Euler = Offset = Shake = _lean = _kick = _kickVel = Vector3.zero;
            _yaw = _yawVel = _buzzEnv = _hit = 0f;
            RumbleHigh = RumbleLow = 0f;
        }

        /// <summary>One frame. <paramref name="shake"/> is the option factor (0 off), <paramref name="look"/> the per-car look share.</summary>
        public void Step(float dt, in Input i, CarCameraSettings s, float shake, float look = 1f, float lean = 1f, float shakeCar = 1f)
        {
            if (dt <= 0f) return;
            dt = Mathf.Min(dt, 0.1f);
            _t += dt;

            // ── look: towards the travel, a little ahead of the yaw, a little into the steering ──
            var moving = Mathf.Clamp01((i.speed - 2f) / 6f);
            var slide = Mathf.Atan2(i.vLat, Mathf.Max(1f, Mathf.Abs(i.vLong))) * Mathf.Rad2Deg; // + = travelling right of the nose
            var target = (slide * s.headDriftLook + i.yawRate * Mathf.Rad2Deg * s.headYawLead + i.steer * s.headSteerLook) * moving * look;
            if (i.vLong < -1f) target = 0f; // reversing: eyes front (look-back is the player's key)
            target = Mathf.Clamp(target, -s.headLookMax, s.headLookMax);
            // Critically damped: smooth in and out of a slide, no overshoot that would read as a wobble.
            var w = s.headLookRate;
            var lookSteps = Mathf.CeilToInt(dt * 120f);
            for (var n = 0; n < lookSteps; n++)
            {
                var hk = dt / lookSteps;
                _yawVel += (w * w * (target - _yaw) - 2f * w * _yawVel) * hk;
                _yaw += _yawVel * hk;
            }

            // ── g-forces: the body leans out of a bend, sinks back under power, dips on the brakes ──
            var k = 1f - Mathf.Exp(-s.headLeanRate * dt);
            var g = new Vector3(
                Mathf.Clamp(i.accelLat / 9.81f, -1.6f, 1.6f),
                0f,
                Mathf.Clamp(i.accelLong / 9.81f, -1.6f, 1.6f));
            if (i.airborne) g = Vector3.zero;
            _lean += (g * lean - _lean) * k;

            // ── kicks: shift, landing, impact, kerbs ──
            var kicks = Vector3.zero;
            if (i.shift > 0) kicks.x -= s.shiftKick;      // the upshift snaps the head back
            else if (i.shift < 0) kicks.x += s.shiftKick * 0.6f;
            if (i.landing > 0.5f) kicks.x += Mathf.Min(s.landingKickMax, i.landing * s.landingKick);
            if (i.impact > 0.5f)
            {
                var hit = Mathf.Min(s.impactKickMax, i.impact * s.impactKick);
                kicks += new Vector3(hit, (Hash(_t) - 0.5f) * hit, (Hash(_t + 3.1f) - 0.5f) * hit * 1.4f);
            }
            if (i.bump > s.bumpFrom) kicks.x += Mathf.Min(s.bumpKickMax, (i.bump - s.bumpFrom) * s.bumpKick) * (Hash(_t * 7f) > 0.5f ? 1f : -1f);
            _kickVel += kicks * (s.kickFrequency * shake * shakeCar);
            _hit = Mathf.Max(_hit * Mathf.Exp(-s.rumbleFade * dt), Mathf.Clamp01(kicks.magnitude / Mathf.Max(1e-3f, s.impactKickMax)));
            // "Camera shake" Off stills the head at once, also a kick still ringing from before the switch.
            if (shake <= 0f) _kick = _kickVel = Vector3.zero;
            // Semi-implicit in steps of at most 1/120 s: one long frame (a hitch, the test runner) made the spring blow up.
            var kw = s.kickFrequency;
            var steps = Mathf.CeilToInt(dt * 120f);
            var h = dt / steps;
            for (var n = 0; n < steps; n++)
            {
                _kickVel += (-kw * kw * _kick - 2f * s.kickDamping * kw * _kickVel) * h;
                _kick += _kickVel * h;
            }

            // ── buzz: speed, ground, tyres ──
            var road = Mathf.Clamp01(Mathf.InverseLerp(s.buzzSpeed.x, s.buzzSpeed.y, i.speed));
            var ground = i.surface == Surface.Gravel ? s.buzzGravel : i.surface == Surface.Terrain ? s.buzzTerrain : 1f;
            var tyres = Mathf.Clamp01(i.drift) * s.buzzDrift + Mathf.Clamp01(i.wheelspin) * s.buzzWheelspin + Mathf.Clamp01(i.burst) * s.buzzBurst;
            var env = i.airborne ? 0f : road * s.buzz * ground + tyres * Mathf.Clamp01(i.speed / 8f);
            _buzzEnv += (env - _buzzEnv) * (1f - Mathf.Exp(-12f * dt));
            var f = s.buzzFrequency * (0.6f + 0.6f * road);
            var amp = _buzzEnv * shake * shakeCar;
            var buzz = new Vector3(Noise(_t * f, 0.3f), Noise(0.7f, _t * f * 1.3f), Noise(_t * f * 0.9f, 5.1f)) * amp;

            Shake = _kick + new Vector3(buzz.x, buzz.y * 0.5f, buzz.z * 0.6f);
            Euler = new Vector3(
                -s.headSurge * _lean.z + _kick.x + buzz.x,
                _yaw + _kick.y + buzz.y * 0.5f,
                s.headRoll * _lean.x + _kick.z + buzz.z * 0.6f); // + = the head tips out of the bend
            Offset = new Vector3(-s.headShift * _lean.x, -s.headSink * Mathf.Abs(_lean.z) * 0.5f, -s.headShift * _lean.z * 0.6f)
                     + new Vector3(0f, buzz.x * 0.004f, 0f);
            RumbleHigh = Mathf.Clamp01(env / Mathf.Max(1e-3f, s.buzz * s.buzzTerrain + s.buzzDrift));
            RumbleLow = _hit;
        }

        static float Noise(float x, float y) => Mathf.PerlinNoise(x, y) * 2f - 1f;
        static float Hash(float x) => Mathf.Repeat(Mathf.Sin(x * 12.9898f) * 43758.547f, 1f);
    }
}
