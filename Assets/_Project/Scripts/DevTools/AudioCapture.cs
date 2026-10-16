using System.IO;
using UnityEngine;

namespace JapanMap.DevTools
{
    /// <summary>
    /// Records what the AudioListener hears into a 16-bit WAV (editor and desktop only; the web player has no audio
    /// filter callback). For listening to a scripted drive without a browser: play.mjs "record 15 name".
    /// </summary>
    public sealed class AudioCapture : MonoBehaviour
    {
        readonly System.Collections.Generic.List<float> _data = new();
        int _channels = 2, _rate;
        float _until;
        string _path;
        bool _recording;
        readonly object _lock = new();

        public bool Recording => _recording;

        public static AudioCapture Begin(string path, float seconds)
        {
            var listener = FindAnyObjectByType<AudioListener>();
            if (listener == null) return null;
            var c = listener.gameObject.GetComponent<AudioCapture>();
            if (c == null) c = listener.gameObject.AddComponent<AudioCapture>(); // Unity fake-null defeats ??
            c._path = path;
            c._rate = AudioSettings.outputSampleRate;
            c._until = Time.unscaledTime + seconds;
            lock (c._lock) c._data.Clear();
            c._recording = true;
            return c;
        }

        void OnAudioFilterRead(float[] data, int channels)
        {
            if (!_recording) return;
            _channels = channels;
            lock (_lock) _data.AddRange(data);
        }

        void Update()
        {
            if (!_recording || Time.unscaledTime < _until) return;
            _recording = false;
            float[] samples;
            lock (_lock) samples = _data.ToArray();
            Write(_path, samples, _channels, _rate);
            Debug.Log($"[AudioCapture] {samples.Length / Mathf.Max(1, _channels) / (float)_rate:0.0} s → {_path}");
        }

        static void Write(string path, float[] s, int channels, int rate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            using var w = new BinaryWriter(File.Create(path));
            w.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
            w.Write(36 + s.Length * 2);
            w.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));
            w.Write(16); w.Write((short)1); w.Write((short)channels); w.Write(rate); w.Write(rate * channels * 2); w.Write((short)(channels * 2)); w.Write((short)16);
            w.Write(System.Text.Encoding.ASCII.GetBytes("data"));
            w.Write(s.Length * 2);
            foreach (var v in s) w.Write((short)(Mathf.Clamp(v, -1f, 1f) * 32767f));
        }
    }
}
