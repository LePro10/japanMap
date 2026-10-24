using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Drives a car along a polyline (road centreline) through the same <see cref="DriveInput"/> a player
    /// produces: pure-pursuit steering towards a point ahead, target speed from the curvature ahead.
    /// Used by the acceptance drives now; the seed of AI rivals later.
    /// </summary>
    [DefaultExecutionOrder(-150)]
    public sealed class PathFollower : MonoBehaviour
    {
        public VehicleController car;
        public Vector3[] path;
        public bool closed;
        [Tooltip("Share of the car's grip used in bends.")]
        public float gripShare = 0.5f;
        public float maxSpeedKmh = 110f;
        [Tooltip("Look-ahead distance = max(min, speed × seconds).")]
        public float lookAheadMin = 7f;
        public float lookAheadSeconds = 0.5f;
        [Tooltip("Open paths: brake to a stop at the last point instead of rolling past it (auto-drive arrival).")]
        public bool stopAtEnd;
        [Tooltip("Braking used for bends and the stop at the end, m/s².")]
        public float braking = 6f;
        [Tooltip("Slow down while the point ahead is far off the nose (a turn from standstill, a U-turn): a tight turn, not a wide arc over the verge.")]
        public bool slowForHeading;
        [Tooltip("Drive this far left (+) or right (−) of the polyline, m: a lane on a centreline path.")]
        public float lateral;
        /// <summary>Speed limit at each path point, m/s (null = none): crossings, the planner brakes for them like for bends.</summary>
        [System.NonSerialized] public float[] pointLimit;
        /// <summary>Extra speed limit from outside (traffic ahead), m/s; infinity = none. Reset by nobody — the owner sets it each step.</summary>
        [System.NonSerialized] public float speedCap = float.PositiveInfinity;

        int _segment;
        /// <summary>Distance driven along the path since Begin, m.</summary>
        public float Travelled { get; private set; }
        public float Length { get; private set; }
        /// <summary>Horizontal distance from the centreline at the last step, m.</summary>
        public float Offset { get; private set; }
        public bool Finished { get; private set; }
        /// <summary>Speed the planner allowed at the last step, m/s.</summary>
        public float TargetSpeed { get; private set; }

        float[] _cum;
        float _lastS;
        // Understeer memory: a car that ran wide at full lock takes bends slower for a while.
        float _grip = 1f, _lastOffset;
        // Stuck against something with the throttle open: reverse out instead of waiting.
        float _stuckFor, _reverseFor, _lastSteer;

        /// <summary>Three-point turns made (slowForHeading; diagnostics, tests).</summary>
        public int Turns { get; private set; }
        /// <summary>Times this driver reversed out of a stuck spot (diagnostics, tests).</summary>
        public int Unsticks { get; private set; }
        /// <summary>Arc length of the car's closest point on the path, m (open paths: Length − Position is what is left).</summary>
        public float Position => _lastS;
        /// <summary>Path point <paramref name="distance"/> m ahead of the car, lane offset included (cameras, tests).</summary>
        public Vector3 Ahead(float distance) => path == null ? Vector3.zero : PointAhead(_segment, _along, distance);

        public void Begin(VehicleController target, Vector3[] points, bool loop, int startSegment = 0)
        {
            car = target;
            path = points;
            closed = loop;
            _segment = startSegment;
            var n = loop ? points.Length + 1 : points.Length;
            _cum = new float[n];
            for (var i = 1; i < n; i++) _cum[i] = _cum[i - 1] + Vector3.Distance(points[(i - 1) % points.Length], points[i % points.Length]);
            Length = _cum[n - 1];
            Travelled = 0f;
            _lastS = _cum[startSegment];
            Finished = false;
            _grip = 1f;
            _stuckFor = _reverseFor = 0f;
            // Per-run counters and memory: a reused follower must not carry the last path's values.
            Offset = _lastOffset = 0f;
            Turns = Unsticks = 0;
        }

        int Segments => closed ? path.Length : path.Length - 1;
        Vector3 P(int i) => path[((i % path.Length) + path.Length) % path.Length];

        void FixedUpdate()
        {
            if (car == null || path == null || Finished) return;
            var pos = car.transform.position;

            // Advance the segment while the car is past its end (search a few ahead only).
            for (var k = 0; k < 8; k++)
            {
                var a = P(_segment);
                var b = P(_segment + 1);
                var ab = b - a;
                var t = Vector3.Dot(pos - a, ab) / Mathf.Max(ab.sqrMagnitude, 1e-4f);
                if (t < 1f) break;
                _segment++;
                if (!closed && _segment >= Segments)
                {
                    Finished = true;
                    car.Input = new DriveInput { brake = 1f };
                    return;
                }
            }
            var s0 = P(_segment);
            var s1 = P(_segment + 1);
            var seg = s1 - s0;
            var along = Mathf.Clamp01(Vector3.Dot(pos - s0, seg) / Mathf.Max(seg.sqrMagnitude, 1e-4f));
            _along = along;
            var onLine = s0 + seg * along;
            if (lateral != 0f) onLine += Left(seg) * lateral;
            Offset = new Vector2(pos.x - onLine.x, pos.z - onLine.z).magnitude;
            // Progress: arc length of the closest point, unwrapped across the lap seam.
            var here = _cum[_segment % path.Length] + seg.magnitude * along;
            var ds = here - _lastS;
            if (closed && ds < -Length * 0.5f) ds += Length;
            if (closed && ds > Length * 0.5f) ds -= Length;
            Travelled += ds;
            _lastS = here;

            var speed = car.Telemetry.speed;
            var target = PointAhead(_segment, along, Mathf.Max(lookAheadMin, speed * lookAheadSeconds));
            var local = car.transform.InverseTransformPoint(target);
            // Pure pursuit: the yaw rate that puts the car on the arc through the target point, divided
            // by the yaw rate the arcade model gives at full lock at this speed (its steering is a share
            // of that, ArcadeDynamics.YawTarget) — so the input is what the car actually needs.
            var lookSq = Mathf.Max(local.x * local.x + local.z * local.z, 1f);
            var v = Mathf.Max(speed, 2f);
            var yawNeeded = 2f * v * local.x / lookSq;
            // The live (tuned) spec the car drives with, not the stock one: the prediction must match the physics.
            var spec = car.Spec;
            var lockAngle = spec.steerAngle / (1f + v / spec.steerFalloff);
            var kinMax = v * Mathf.Tan(lockAngle) / car.Definition.wheelbase;
            var cap = spec.latG * ArcadeTuning.Gravity / Mathf.Max(v, car.Tuning.yawCapSpeed);
            var steer = Mathf.Clamp(yawNeeded / Mathf.Max(Mathf.Min(kinMax, cap), 0.05f), -1f, 1f);

            // Running wide at full lock: the bend is too fast for this car here (measured on the pass:
            // heavy cars at 40 km/h in a hairpin, steering ±1, line offset 1 → 4 m, then the rock face).
            var dt = Time.fixedDeltaTime;
            // Only when moving: at a standstill (a turn from rest) "running wide" made the target negative and the car froze.
            var wide = Mathf.Abs(steer) > 0.95f && Offset > 1.2f && Offset > _lastOffset && speed > 3f;
            _grip = wide ? Mathf.Max(0.45f, _grip - 1.5f * dt) : Mathf.Min(1f, _grip + 0.05f * dt);
            _lastOffset = Offset;

            // Slowest bend within the braking distance decides the target speed.
            var latA = spec.latG * ArcadeTuning.Gravity * gripShare * _grip;
            var vMax = maxSpeedKmh / 3.6f;
            var horizon = Mathf.Max(30f, speed * speed / (2f * braking));
            // From the car itself: a bend that has already begun must count (starting at 10 m let a hairpin through at 56 km/h).
            for (var d = 0f; d <= horizon; d += 5f)
            {
                var c = Curvature(_segment, along, d);
                var vBend = c > 1e-4f ? Mathf.Sqrt(latA / c) : vMax;
                if (pointLimit != null) vBend = Mathf.Min(vBend, LimitAt(here + d));
                // v² = vBend² + 2·a·d: how fast we may be now to make it at 6 m/s² braking.
                vMax = Mathf.Min(vMax, Mathf.Sqrt(vBend * vBend + 2f * braking * d));
            }
            if (stopAtEnd && !closed)
            {
                // Arrive: the speed from which the remaining distance is a comfortable stop (2 m short of the point).
                var left = Mathf.Max(0f, Length - here - 2f);
                vMax = Mathf.Min(vMax, Mathf.Sqrt(2f * braking * 0.6f * left));
            }
            vMax = Mathf.Min(vMax, speedCap);
            if (wide) vMax = Mathf.Min(vMax, speed - 3f); // brake now, a tighter arc follows
            if (slowForHeading)
            {
                // 30° off the nose: 12 m/s; 90° and more: walking pace with full lock.
                var off = Mathf.Abs(Mathf.Atan2(local.x, local.z)) * Mathf.Rad2Deg;
                if (off > 30f) vMax = Mathf.Min(vMax, Mathf.Lerp(12f, 3.5f, (off - 30f) / 60f));
                // Behind: pure pursuit circles round a point behind the car (its arc never closes) — full lock towards it.
                if (local.z < 0f) steer = local.x >= 0f ? 1f : -1f;
                // The way on is behind: a three-point turn — back up with the wheels the other way, then forward. A circle
                // at full lock needs 11 m and the road has 9 (auto-drive out of the Commons, round over the grass).
                if (off > 115f && speed < 3f && _reverseFor <= 0f)
                {
                    _reverseFor = 1.4f;
                    _lastSteer = Mathf.Sign(local.x);
                    Turns++;
                }
            }
            TargetSpeed = vMax;
            // No steering in the air: the arcade air control would yaw the car into a bad landing.
            if (car.Telemetry.airborne) steer = 0f;

            if (_reverseFor > 0f)
            {
                // Back out with the wheels turned the other way, then try again.
                _reverseFor -= dt;
                car.Input = new DriveInput { brake = 1f, steer = -_lastSteer };
                return;
            }
            _stuckFor = !car.HoldStill && speed < 1f && car.Input.throttle > 0.5f ? _stuckFor + dt : 0f;
            if (_stuckFor > 1.2f)
            {
                _stuckFor = 0f;
                _reverseFor = 1.5f;
                _lastSteer = Mathf.Sign(steer);
                Unsticks++;
            }

            var e = vMax - car.Telemetry.forwardSpeed;
            car.Input = e > 0f
                ? new DriveInput { throttle = Mathf.Clamp01(e * 0.6f), steer = steer }
                : new DriveInput { brake = Mathf.Clamp01(-e * 0.3f), steer = steer };
        }

        float _along;

        /// <summary>The point limit at arc length <paramref name="s"/> (the nearer point of its segment).</summary>
        float LimitAt(float s)
        {
            if (pointLimit == null || pointLimit.Length == 0 || _cum == null) return float.PositiveInfinity;
            if (closed && Length > 0f) s = Mathf.Repeat(s, Length);
            var lo = 0;
            var hi = Mathf.Min(_cum.Length, pointLimit.Length) - 1;
            if (s >= _cum[hi]) return pointLimit[hi];
            while (hi - lo > 1)
            {
                var mid = (lo + hi) / 2;
                if (_cum[mid] <= s) lo = mid; else hi = mid;
            }
            return Mathf.Min(pointLimit[lo], pointLimit[hi]);
        }

        /// <summary>Horizontal left of a direction (lane offset; Japan drives on the left).</summary>
        static Vector3 Left(Vector3 dir)
        {
            dir.y = 0f;
            var n = dir.sqrMagnitude > 1e-6f ? dir.normalized : Vector3.forward;
            return new Vector3(-n.z, 0f, n.x);
        }

        Vector3 PointAhead(int segment, float along, float distance)
        {
            var p = PointOnLine(segment, along, distance, out var dir);
            return lateral != 0f ? p + Left(dir) * lateral : p;
        }

        Vector3 PointOnLine(int segment, float along, float distance, out Vector3 dir)
        {
            var a = P(segment);
            var b = P(segment + 1);
            var rest = Vector3.Distance(a, b) * (1f - along);
            var cur = Vector3.Lerp(a, b, along);
            var s = segment;
            while (distance > rest)
            {
                distance -= rest;
                s++;
                if (!closed && s >= Segments)
                {
                    dir = P(Segments) - P(Segments - 1);
                    return P(Segments);
                }
                cur = P(s);
                rest = Vector3.Distance(P(s), P(s + 1));
            }
            dir = P(s + 1) - P(s);
            return cur + (P(s + 1) - cur).normalized * distance;
        }

        /// <summary>Curvature (1/m) around the point <paramref name="d"/> metres ahead, from three points 6 m apart.</summary>
        float Curvature(int segment, float along, float d)
        {
            var p0 = PointAhead(segment, along, Mathf.Max(0f, d - 6f));
            var p1 = PointAhead(segment, along, d);
            var p2 = PointAhead(segment, along, d + 6f);
            var a = new Vector2(p1.x - p0.x, p1.z - p0.z);
            var b = new Vector2(p2.x - p1.x, p2.z - p1.z);
            var turn = Mathf.Abs(Vector2.SignedAngle(a, b)) * Mathf.Deg2Rad;
            var len = (a.magnitude + b.magnitude) * 0.5f;
            return len > 0.1f ? turn / len : 0f;
        }
    }
}
