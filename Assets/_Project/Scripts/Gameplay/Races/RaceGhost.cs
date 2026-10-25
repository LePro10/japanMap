using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace JapanMap.Gameplay.Races
{
    /// <summary>
    /// A recorded run of the player's car (POLISH E: ghost of the personal best in time trials): pose and route
    /// progress at a fixed rate, the finish time and the car. Saved compact (22 bytes a sample, base64) per event in
    /// the save store — two time trials of ~2 min are ~60 KB, well inside the CrazyGames data limit.
    /// </summary>
    public sealed class RaceGhost
    {
        const byte Version = 1;

        public string car = "";
        public float hz = 10f;
        /// <summary>Finish time of the run, s (with penalties): the one to beat.</summary>
        public float seconds;
        readonly List<Vector3> _pos = new();
        readonly List<Quaternion> _rot = new();
        readonly List<float> _progress = new();

        public int Count => _pos.Count;
        public float Duration => _pos.Count < 2 ? 0f : (_pos.Count - 1) / hz;

        public static string Key(string eventId) => "ghost." + eventId;

        /// <summary>Adds the sample for time Count / hz.</summary>
        public void Add(Vector3 position, Quaternion rotation, float progress)
        {
            _pos.Add(position);
            _rot.Add(rotation);
            _progress.Add(progress);
        }

        /// <summary>Pose at time t, s (clamped to the run).</summary>
        public void Sample(float t, out Vector3 position, out Quaternion rotation)
        {
            if (_pos.Count == 0) { position = default; rotation = Quaternion.identity; return; }
            var f = Mathf.Clamp(t * hz, 0f, _pos.Count - 1);
            var i = Mathf.Min((int)f, _pos.Count - 2);
            if (i < 0) { position = _pos[0]; rotation = _rot[0]; return; }
            var u = f - i;
            position = Vector3.Lerp(_pos[i], _pos[i + 1], u);
            rotation = Quaternion.Slerp(_rot[i], _rot[i + 1], u);
        }

        /// <summary>When the ghost reached this route progress, s; past its end: its duration.</summary>
        public float TimeAt(float progress)
        {
            if (_progress.Count == 0) return 0f;
            // Progress only grows on a clean run, but a respawn can step it back: first sample at or past it.
            int lo = 0, hi = _progress.Count - 1;
            if (_progress[hi] < progress) return Duration;
            while (lo < hi)
            {
                var mid = (lo + hi) / 2;
                if (_progress[mid] < progress) lo = mid + 1; else hi = mid;
            }
            if (lo == 0) return 0f;
            var a = _progress[lo - 1];
            var b = _progress[lo];
            var u = b > a ? (progress - a) / (b - a) : 1f;
            return (lo - 1 + Mathf.Clamp01(u)) / hz;
        }

        public string Encode()
        {
            using var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms))
            {
                w.Write(Version);
                w.Write(car ?? "");
                w.Write(hz);
                w.Write(seconds);
                w.Write(_pos.Count);
                for (var i = 0; i < _pos.Count; i++)
                {
                    w.Write(_pos[i].x); w.Write(_pos[i].y); w.Write(_pos[i].z);
                    var q = _rot[i];
                    if (q.w < 0f) q = new Quaternion(-q.x, -q.y, -q.z, -q.w); // w ≥ 0: three parts carry it
                    w.Write(Pack(q.x)); w.Write(Pack(q.y)); w.Write(Pack(q.z));
                    w.Write(_progress[i]);
                }
            }
            return Convert.ToBase64String(ms.ToArray());
        }

        /// <summary>Null for an empty, broken or newer-format string.</summary>
        public static RaceGhost Decode(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            try
            {
                using var r = new BinaryReader(new MemoryStream(Convert.FromBase64String(text)));
                if (r.ReadByte() != Version) return null;
                var g = new RaceGhost { car = r.ReadString(), hz = r.ReadSingle(), seconds = r.ReadSingle() };
                var n = r.ReadInt32();
                if (n < 0 || n > 100000 || g.hz <= 0f) return null;
                for (var i = 0; i < n; i++)
                {
                    var p = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                    float x = Unpack(r.ReadInt16()), y = Unpack(r.ReadInt16()), z = Unpack(r.ReadInt16());
                    var w = Mathf.Sqrt(Mathf.Max(0f, 1f - x * x - y * y - z * z));
                    g.Add(p, new Quaternion(x, y, z, w), r.ReadSingle());
                }
                return g;
            }
            catch (Exception) { return null; }
        }

        static short Pack(float v) => (short)Mathf.RoundToInt(Mathf.Clamp(v, -1f, 1f) * 32767f);
        static float Unpack(short v) => v / 32767f;
    }
}
