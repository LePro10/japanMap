using JapanMap.Vehicles;
using UnityEngine;
using static JapanMap.Tests.Vehicles.VehicleRig;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// The legacy bench probes, one function each, same inputs and phases as in
    /// tools/bench/fleet.mts, arcade.mts and hill.mts. Angles in degrees, speeds km/h.
    /// </summary>
    public static class VehicleProbes
    {
        public static VehicleFleet Fleet;
        const float Deg = Mathf.Rad2Deg;

        static VehicleRig Rig(string id, Ground g = Ground.Asphalt, float slope = 0f) =>
            new(Fleet.Get(id), Fleet.tuning, g, slope);

        // ── fleet.mts ───────────────────────────────────────────────────────

        /// <summary>0–100 km/h in s (−1 = never) and top speed after 90 s full throttle; straight-line drift in m.</summary>
        public static (float hundred, float top, float offset) Acceleration(string id)
        {
            using var r = Rig(id);
            var hundred = -1f;
            var n = Steps(90f);
            for (var i = 0; i < n; i++)
            {
                r.Step(Cmd(throttle: 1));
                if (hundred < 0 && r.Kmh >= 100f) hundred = r.Time;
            }
            return (hundred, r.Kmh, Mathf.Abs(r.Position.x));
        }

        /// <summary>Braking distance and time from 100 km/h.</summary>
        public static (float metres, float seconds) Braking(string id)
        {
            using var r = Rig(id);
            var guard = 0;
            while (r.T.forwardSpeed < 27.78f && guard++ < 10000) r.Step(Cmd(throttle: 1));
            var from = r.Position.z;
            var t0 = r.Time;
            guard = 0;
            while (r.T.forwardSpeed > 0.5f && guard++ < 10000) r.Step(Cmd(brake: 1));
            return (r.Position.z - from, r.Time - t0);
        }

        /// <summary>5 s throttle, then 3 s full lock right and left: lateral offsets must mirror.</summary>
        public static (float right, float left) Symmetry(string id)
        {
            var x = new float[2];
            var s = new[] { 1f, -1f };
            for (var k = 0; k < 2; k++)
            {
                using var r = Rig(id);
                r.Run(5f, Cmd(throttle: 1));
                r.Run(3f, Cmd(throttle: 1, steer: s[k]));
                x[k] = r.Position.x;
            }
            return (x[0], x[1]);
        }

        /// <summary>Coast from 15 s of full throttle: speed must fall monotonically.</summary>
        public static (int rises, float maxRise, float toHalf, float from) Coast(string id)
        {
            using var r = Rig(id);
            r.Run(15f, Cmd(throttle: 1));
            var from = r.T.speed;
            r.Run(1f, Cmd());
            var prev = r.T.speed;
            int rises = 0;
            float maxRise = 0f, toHalf = 0f;
            var n = Steps(60f);
            for (var i = 0; i < n; i++)
            {
                r.Step(Cmd());
                var s = r.T.speed;
                if (s > prev + 1e-4f)
                {
                    rises++;
                    maxRise = Mathf.Max(maxRise, s - prev);
                }
                if (toHalf == 0f && s < from * 0.5f) toHalf = i * Dt;
                prev = s;
            }
            return (rises, maxRise, toHalf, from * 3.6f);
        }

        /// <summary>Steady yaw rate (°/s) for steering 0.2…1.0 at a held speed.</summary>
        public static float[] SteerResponse(string id, float kmh)
        {
            var steers = new[] { 0.2f, 0.4f, 0.6f, 0.8f, 1f };
            var outp = new float[steers.Length];
            for (var k = 0; k < steers.Length; k++)
            {
                using var r = Rig(id);
                var guard = 0;
                while (r.T.forwardSpeed < kmh / 3.6f * 0.99f && guard++ < 10000) r.Step(Cmd(throttle: 1));
                var s = steers[k];
                r.Run(5f, () => r.HoldSmooth(kmh, s));
                var yaw = 0f;
                var prev = r.Yaw;
                var n = Steps(2f);
                for (var i = 0; i < n; i++)
                {
                    r.Step(r.HoldSmooth(kmh, s));
                    yaw += Mathf.DeltaAngle(prev * Deg, r.Yaw * Deg);
                    prev = r.Yaw;
                }
                outp[k] = Mathf.Abs(yaw) / 2f;
            }
            return outp;
        }

        // ── arcade.mts ──────────────────────────────────────────────────────

        public struct DriftRun
        {
            public float peak, held, speed, catchTime;
            public bool spun;
        }

        /// <summary>Open a drift (0.6 s), hold it (2.5 s), let go (5 s) — in one run, phases build on each other.</summary>
        public static DriftRun Drift(string id, float entryKmh, bool handbrake, float steer, float throttle)
        {
            using var r = Rig(id);
            r.AccelerateTo(entryKmh);
            var maxAngle = Fleet.tuning.driftMaxAngle;
            float peak = 0f;
            var spun = false;
            r.Run(0.6f, () =>
            {
                peak = Mathf.Max(peak, Mathf.Abs(r.T.slip));
                return Cmd(throttle: throttle, steer: steer, handbrake: handbrake);
            });
            peak = Mathf.Max(peak, Mathf.Abs(r.T.slip));
            var n = Steps(2.5f);
            for (var i = 0; i < n; i++)
            {
                r.Step(Cmd(throttle: Mathf.Max(throttle, r.HoldBang(entryKmh)), steer: steer));
                var slip = Mathf.Abs(r.T.slip);
                peak = Mathf.Max(peak, slip);
                if (slip > maxAngle) spun = true;
            }
            var held = Mathf.Abs(r.T.slip);
            var catchTime = -1f;
            n = Steps(5f);
            for (var i = 0; i < n; i++)
            {
                r.Step(Cmd());
                if (catchTime < 0 && Mathf.Abs(r.T.slip) < 0.175f) catchTime = i * Dt;
            }
            return new DriftRun { peak = peak * Deg, held = held * Deg, spun = spun, speed = r.Kmh, catchTime = catchTime };
        }

        /// <summary>Tap the handbrake (0.1 s), then steer: the arm window must open the drift. Peak slip °.</summary>
        public static float TapThenSteer(string id)
        {
            using var r = Rig(id);
            r.AccelerateTo(80f);
            r.Run(0.1f, Cmd(throttle: 0.6f, handbrake: true));
            var peak = 0f;
            r.Run(1.5f, () =>
            {
                peak = Mathf.Max(peak, Mathf.Abs(r.T.slip));
                return Cmd(throttle: 0.6f, steer: 1);
            });
            return peak * Deg;
        }

        /// <summary>After a bend, handbrake without steering must not turn into the last direction. Residual yaw °.</summary>
        public static float HandbrakeOnStraight(string id)
        {
            using var r = Rig(id);
            r.AccelerateTo(80f);
            r.Run(0.75f, Cmd(throttle: 0.5f, steer: 1));
            var yaw = 0f;
            var prev = r.Yaw;
            r.Run(1f, () =>
            {
                yaw += Mathf.DeltaAngle(prev * Deg, r.Yaw * Deg);
                prev = r.Yaw;
                return Cmd(throttle: 0.5f, handbrake: true);
            });
            yaw += Mathf.DeltaAngle(prev * Deg, r.Yaw * Deg);
            return Mathf.Abs(yaw);
        }

        /// <summary>Half lock at 90 km/h with a bang-bang throttle: no drift nobody asked for. Peak slip °.</summary>
        public static float CleanCorner(string id, bool stunt = false)
        {
            using var r = Rig(id);
            r.AccelerateTo(90f);
            var peak = 0f;
            r.Run(4f, () =>
            {
                peak = Mathf.Max(peak, Mathf.Abs(r.T.slip));
                return Cmd(throttle: r.HoldBang(90f), steer: 0.5f, stunt: stunt);
            });
            return peak * Deg;
        }

        /// <summary>Nitro from 120 km/h for 10 s: speed gained and burn time.</summary>
        public static (float gain, float seconds) Nitro(string id)
        {
            using var r = Rig(id);
            r.AccelerateTo(120f);
            var before = r.Kmh;
            var burn = 0f;
            r.Run(10f, () =>
            {
                if (r.T.boosting) burn += Dt;
                return Cmd(throttle: 1, boost: true);
            });
            return (r.Kmh - before, burn);
        }

        /// <summary>Distance from standstill in 12 s full throttle on a surface, m.</summary>
        public static float SurfaceRun(string id, Ground g)
        {
            using var r = Rig(id, g);
            var start = r.Position;
            r.Run(12f, Cmd(throttle: 1));
            var d = r.Position - start;
            return new Vector2(d.x, d.z).magnitude;
        }

        // ── hill.mts ────────────────────────────────────────────────────────

        /// <summary>20 s full throttle from rest up a slope: final speed km/h (negative = slid back) and height gained.</summary>
        public static (float kmh, float climbed) Hill(string id, Ground g, float slopeDeg)
        {
            using var r = Rig(id, g, slopeDeg);
            var y0 = r.Position.y;
            r.Run(20f, Cmd(throttle: 1));
            return (r.T.forwardSpeed * 3.6f, r.Position.y - y0);
        }

        // ── Stunt (arcade.mts, Kite S / Hachi only) ─────────────────────────

        /// <summary>Accumulated |yaw| in degrees over a run, plus the peak slip in degrees.</summary>
        static (float yaw, float slip) IntegrateYaw(VehicleRig r, DriveInput input, float seconds)
        {
            float yaw = 0f, slip = 0f;
            var prev = r.Yaw * Deg;
            var n = Steps(seconds);
            for (var i = 0; i < n; i++)
            {
                r.Step(input);
                var now = r.Yaw * Deg;
                yaw += Mathf.DeltaAngle(prev, now);
                prev = now;
                slip = Mathf.Max(slip, Mathf.Abs(r.T.slip) * Deg);
            }
            return (Mathf.Abs(yaw), slip);
        }

        /// <summary>Handbrake + full lock at 80 km/h, stunt off, for 1.2 s: drifts but no 360.</summary>
        public static (float yaw, float slip) SingleTap(string id)
        {
            using var r = Rig(id);
            r.AccelerateTo(80f);
            return IntegrateYaw(r, Cmd(throttle: 0.7f, steer: 1, handbrake: true), 1.2f);
        }

        /// <summary>Stunt mode, handbrake + lock held: yaw after the given seconds.</summary>
        public static float HeldSpin(string id, float seconds)
        {
            using var r = Rig(id);
            r.AccelerateTo(80f);
            return IntegrateYaw(r, Cmd(throttle: 0.7f, steer: 1, handbrake: true, stunt: true), seconds).yaw;
        }

        /// <summary>Double tap inside a drift: the trick pulse turns a 360 by motion, handbrake released.</summary>
        public static float Trick360(string id)
        {
            using var r = Rig(id);
            r.AccelerateTo(80f);
            IntegrateYaw(r, Cmd(throttle: 0.7f, steer: 1, handbrake: true), 0.4f);
            r.Step(Cmd(throttle: 0.7f, steer: 1, handbrake: true, stunt: true, trick: true));
            return IntegrateYaw(r, Cmd(throttle: 0.7f, steer: 1, stunt: true), 1.5f).yaw;
        }

        // ── New in Unity: landing and walls ────────────────────────────────

        /// <summary>
        /// Drop from 6 m: lowest point of the body underside relative to the ground (must stay ≥ 0 —
        /// "no sinking"), rest height error after 3 s, and whether it stands upright on four wheels.
        /// </summary>
        public static (float lowestUnderside, float restError, bool upright) Landing(string id)
        {
            using var r = Rig(id);
            var def = Fleet.Get(id);
            r.Car.transform.position = new Vector3(0f, 6f, 0f);
            r.Car.Body.position = new Vector3(0f, 6f, 0f);
            Physics.SyncTransforms();
            var lowest = float.MaxValue;
            var n = Steps(3f);
            for (var i = 0; i < n; i++)
            {
                r.Step(default);
                var t = r.Car.transform;
                // Lowest corner of the body box underside.
                var box = r.Car.GetComponent<BoxCollider>();
                for (var cx = -1; cx <= 1; cx += 2)
                for (var cz = -1; cz <= 1; cz += 2)
                {
                    var p = t.TransformPoint(box.center + new Vector3(cx * box.size.x, -box.size.y, cz * box.size.z) * 0.5f);
                    lowest = Mathf.Min(lowest, p.y);
                }
            }
            return (lowest, Mathf.Abs(r.Position.y), r.Car.transform.up.y > 0.98f && r.T.groundedWheels == 4);
        }

        /// <summary>
        /// Run into a wall at 25° and 80 km/h with throttle held: the car must slide along it, not stick.
        /// Returns the speed 3 s after first contact and the distance covered along the wall.
        /// </summary>
        public static (float kmh, float along) Wall(string id)
        {
            using var r = Rig(id);
            var wall = new GameObject("Wall");
            UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(wall, r.Car.gameObject.scene);
            var box = wall.AddComponent<BoxCollider>();
            box.size = new Vector3(1f, 3f, 4000f);
            wall.transform.position = new Vector3(14f, 1.5f, 1000f);
            r.Car.Place(new Vector3(0f, 0f, -200f), 0f);
            r.AccelerateTo(80f);
            // Turn towards the wall by placing the car at the same speed with a 25° heading.
            var v = r.Car.Body.linearVelocity.magnitude;
            var start = r.Position;
            r.Car.Place(new Vector3(0f, 0f, start.z), 25f);
            r.Car.Body.linearVelocity = Quaternion.Euler(0f, 25f, 0f) * Vector3.forward * v;
            var z0 = r.Position.z;
            var contactAt = -1f;
            var guard = 0;
            while (guard++ < Steps(10f))
            {
                r.Step(Cmd(throttle: 1));
                if (contactAt < 0 && r.Position.x > 14f - 0.5f - Def(id).bodySize.y * 0.5f - 0.3f) contactAt = r.Time;
                if (contactAt >= 0 && r.Time - contactAt >= 3f) break;
            }
            return (r.Kmh, r.Position.z - z0);
        }

        static VehicleDefinition Def(string id) => Fleet.Get(id);
    }
}
