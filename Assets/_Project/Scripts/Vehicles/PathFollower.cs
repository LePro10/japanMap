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
            var onLine = s0 + seg * along;
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
            var spec = car.Definition.arcade;
            var lockAngle = spec.steerAngle / (1f + v / spec.steerFalloff);
            var kinMax = v * Mathf.Tan(lockAngle) / car.Definition.wheelbase;
            var cap = spec.latG * ArcadeTuning.Gravity / Mathf.Max(v, car.Tuning.yawCapSpeed);
            var steer = Mathf.Clamp(yawNeeded / Mathf.Max(Mathf.Min(kinMax, cap), 0.05f), -1f, 1f);

            // Slowest bend within the braking distance decides the target speed.
            var latA = car.Definition.arcade.latG * ArcadeTuning.Gravity * gripShare;
            var vMax = maxSpeedKmh / 3.6f;
            var horizon = Mathf.Max(30f, speed * speed / (2f * 6f));
            // From the car itself: a bend that has already begun must count (starting at 10 m let a hairpin through at 56 km/h).
            for (var d = 0f; d <= horizon; d += 5f)
            {
                var c = Curvature(_segment, along, d);
                var vBend = c > 1e-4f ? Mathf.Sqrt(latA / c) : vMax;
                // v² = vBend² + 2·a·d: how fast we may be now to make it at 6 m/s² braking.
                vMax = Mathf.Min(vMax, Mathf.Sqrt(vBend * vBend + 2f * 6f * d));
            }
            TargetSpeed = vMax;
            // No steering in the air: the arcade air control would yaw the car into a bad landing.
            if (car.Telemetry.airborne) steer = 0f;
            var e = vMax - car.Telemetry.forwardSpeed;
            car.Input = e > 0f
                ? new DriveInput { throttle = Mathf.Clamp01(e * 0.6f), steer = steer }
                : new DriveInput { brake = Mathf.Clamp01(-e * 0.3f), steer = steer };
        }

        Vector3 PointAhead(int segment, float along, float distance)
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
                if (!closed && s >= Segments) return P(Segments);
                cur = P(s);
                rest = Vector3.Distance(P(s), P(s + 1));
            }
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
