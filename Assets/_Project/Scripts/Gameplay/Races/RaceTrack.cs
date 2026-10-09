using UnityEngine;

namespace JapanMap.Gameplay.Races
{
    /// <summary>
    /// A race route as a polyline with arc length: point and direction at any distance, the nearest
    /// distance to a position (searched near a hint, so a hairpin's other leg is never taken), and the
    /// signed way between two distances — wrapped on a closed loop. On a circle the difference of two
    /// positions is not the way travelled (legacy lesson 18): <see cref="Delta"/> is.
    /// </summary>
    public sealed class RaceTrack
    {
        readonly Vector3[] _p;
        readonly float[] _s;

        public bool Closed { get; }
        public float Length { get; }
        public float HalfWidth { get; }
        public int Count => _p.Length;

        public RaceTrack(Vector3[] points, bool closed, float width)
        {
            _p = points;
            Closed = closed;
            HalfWidth = width * 0.5f;
            var n = closed ? points.Length + 1 : points.Length;
            _s = new float[n];
            for (var i = 1; i < n; i++) _s[i] = _s[i - 1] + Vector3.Distance(points[i - 1], points[i % points.Length]);
            Length = _s[n - 1];
        }

        public Vector3[] Points => _p;

        /// <summary>Distance into [0, Length) on a loop, clamped on a sprint.</summary>
        public float Wrap(float s)
        {
            if (!Closed) return Mathf.Clamp(s, 0f, Length);
            s %= Length;
            return s < 0f ? s + Length : s;
        }

        /// <summary>Signed way from <paramref name="from"/> to <paramref name="to"/>; on a loop the short way round.</summary>
        public float Delta(float from, float to)
        {
            var d = to - from;
            if (!Closed) return d;
            if (d > Length * 0.5f) d -= Length;
            else if (d < -Length * 0.5f) d += Length;
            return d;
        }

        int Segment(float s)
        {
            s = Wrap(s);
            int lo = 0, hi = _s.Length - 2;
            while (lo < hi)
            {
                var mid = (lo + hi + 1) / 2;
                if (_s[mid] <= s) lo = mid;
                else hi = mid - 1;
            }
            return lo;
        }

        Vector3 P(int i) => _p[((i % _p.Length) + _p.Length) % _p.Length];

        public Vector3 PointAt(float s)
        {
            var i = Segment(s);
            var len = _s[i + 1] - _s[i];
            var t = len > 1e-4f ? (Wrap(s) - _s[i]) / len : 0f;
            return Vector3.Lerp(P(i), P(i + 1), t);
        }

        /// <summary>Flat, normalised direction of travel at s (averaged over ±4 m against kinks).</summary>
        public Vector3 TangentAt(float s)
        {
            var d = PointAt(s + 4f) - PointAt(s - 4f);
            d.y = 0f;
            return d.sqrMagnitude > 1e-6f ? d.normalized : Vector3.forward;
        }

        /// <summary>
        /// Nearest distance along the track to <paramref name="pos"/>, searched within ±window metres of
        /// <paramref name="hint"/> (a full search when hint is negative).
        /// </summary>
        public float Nearest(Vector3 pos, float hint = -1f, float window = 80f)
        {
            int from, to;
            if (hint < 0f) { from = 0; to = _s.Length - 2; }
            else
            {
                from = Segment(hint - window);
                to = from + Mathf.CeilToInt(2f * window / 1.5f) + 2;
                if (!Closed) { from = Mathf.Max(0, Segment(Mathf.Max(0f, hint - window))); to = Mathf.Min(_s.Length - 2, Segment(Mathf.Min(Length, hint + window)) + 1); }
            }
            var best = float.PositiveInfinity;
            var bestS = 0f;
            for (var k = from; k <= to; k++)
            {
                var i = Closed ? ((k % (_s.Length - 1)) + (_s.Length - 1)) % (_s.Length - 1) : k;
                var a = P(i);
                var b = P(i + 1);
                var ab = b - a;
                ab.y = 0f;
                var ap = pos - a;
                ap.y = 0f;
                var t = Mathf.Clamp01(Vector3.Dot(ap, ab) / Mathf.Max(ab.sqrMagnitude, 1e-4f));
                var q = a + ab * t;
                var d = new Vector2(pos.x - q.x, pos.z - q.z).sqrMagnitude;
                if (d < best)
                {
                    best = d;
                    bestS = _s[i] + (_s[i + 1] - _s[i]) * t;
                }
                if (!Closed && i >= _s.Length - 2) break;
            }
            return Wrap(bestS);
        }

        /// <summary>The track's points shifted sideways (right positive) by <paramref name="lane"/> m — an AI line.</summary>
        public Vector3[] Line(float lane)
        {
            var o = new Vector3[_p.Length];
            for (var i = 0; i < _p.Length; i++)
            {
                var d = P(i + 1) - P(i - 1);
                if (!Closed && i == 0) d = P(1) - P(0);
                if (!Closed && i == _p.Length - 1) d = P(i) - P(i - 1);
                d.y = 0f;
                var right = new Vector3(d.z, 0f, -d.x).normalized;
                o[i] = _p[i] + right * lane;
            }
            return o;
        }
    }
}
