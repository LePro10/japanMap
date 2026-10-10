using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Audio
{
    /// <summary>
    /// Plays the named sounds of a <see cref="SoundBank"/>: pooled one-shots (2D or at a world point), the local
    /// world ambience around the listener, and the optional music bed with gaps. One per scene; static entry
    /// points so game systems need only a name. UI sounds keep playing while the game is paused (ESC pauses
    /// AudioListener), everything else pauses with it.
    /// </summary>
    public sealed class Sfx : MonoBehaviour
    {
        [SerializeField] SoundBank bank;
        [Tooltip("Pooled one-shot voices.")]
        [SerializeField] int voices = 12;

        static Sfx _instance;
        readonly List<AudioSource> _pool = new();
        readonly List<(AudioSource source, SoundGroup group, float volume)> _playing = new();
        AudioSource[] _ambience;
        float[] _nextAmbience;
        AudioSource _music;
        float _nextMusic;
        int _next;
        // Own random numbers: sound must never draw from UnityEngine.Random — that moved the traffic and the crowd and
        // made the ring acceptance drive nondeterministic (Phase 9; legacy lesson 13: display never drives simulation).
        static readonly System.Random Rng = new(9);
        static float R(float a, float b) => a + (float)Rng.NextDouble() * (b - a);

        /// <summary>Last sound played (tests, play scripts).</summary>
        public static string Last { get; private set; } = "";
        public static int Played { get; private set; }
        public static SoundBank Bank => _instance != null ? _instance.bank : null;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _instance = null;
            Last = "";
            Played = 0;
        }

        public void Configure(SoundBank b) => bank = b;

        void Awake()
        {
            _instance = this;
            for (var i = 0; i < voices; i++)
            {
                var a = gameObject.AddComponent<AudioSource>();
                a.playOnAwake = false;
                _pool.Add(a);
            }
            if (bank == null) return;
            _ambience = new AudioSource[bank.ambience.Length];
            _nextAmbience = new float[bank.ambience.Length];
            for (var i = 0; i < bank.ambience.Length; i++)
            {
                var a = gameObject.AddComponent<AudioSource>();
                a.playOnAwake = false;
                a.clip = bank.ambience[i].clip;
                a.loop = bank.ambience[i].loop;
                a.volume = 0f;
                if (a.loop && a.clip != null) a.Play();
                _ambience[i] = a;
                _nextAmbience[i] = R(3f, 10f);
            }
            _music = gameObject.AddComponent<AudioSource>();
            _music.playOnAwake = false;
            _music.ignoreListenerPause = true;
            _nextMusic = R(4f, 10f);
        }

        void OnDestroy()
        {
            if (_instance == this) _instance = null;
        }

        /// <summary>Plays a named sound; <paramref name="strength"/> scales its level (impacts by speed).</summary>
        public static void Play(string name, float strength = 1f, Vector3? at = null)
        {
            if (_instance == null || _instance.bank == null || !_instance.bank.TryGet(name, out var e)) return;
            Last = name;
            Played++;
            if (e.clip == null) return;
            var s = _instance.Voice();
            s.clip = e.clip;
            s.pitch = 1f + R(-e.pitchJitter, e.pitchJitter);
            s.ignoreListenerPause = e.group == SoundGroup.UI;
            s.spatialBlend = at.HasValue ? 0.8f : 0f;
            if (at.HasValue) s.transform.position = at.Value;
            var v = Mathf.Clamp01(strength) * e.volume;
            s.volume = v * SoundMix.Gain(e.group);
            s.Play();
            _instance._playing.Add((s, e.group, v));
            if (name.StartsWith("Bell_") || name.StartsWith("Countdown_")) SoundMix.DuckMusic(e.clip.length);
        }

        AudioSource Voice()
        {
            // Oldest voice first; a free one if there is one.
            for (var i = 0; i < _pool.Count; i++)
            {
                var a = _pool[(_next + i) % _pool.Count];
                if (a.isPlaying) continue;
                _next = (_next + i + 1) % _pool.Count;
                return a;
            }
            var v = _pool[_next];
            _next = (_next + 1) % _pool.Count;
            return v;
        }

        void Update()
        {
            for (var i = _playing.Count - 1; i >= 0; i--)
            {
                var (s, g, v) = _playing[i];
                if (!s.isPlaying) { _playing.RemoveAt(i); continue; }
                s.volume = v * SoundMix.Gain(g);
            }
            if (bank == null) return;
            var listener = Camera.main != null ? Camera.main.transform.position : Vector3.zero;
            var world = SoundMix.Gain(SoundGroup.World);
            var dt = Time.deltaTime;
            for (var i = 0; i < _ambience.Length; i++)
            {
                var z = bank.ambience[i];
                var d = Vector2.Distance(new Vector2(listener.x, listener.z), z.at);
                var near = 1f - Mathf.InverseLerp(z.radius * 0.6f, z.radius, d);
                var a = _ambience[i];
                if (z.loop) a.volume = near * z.volume * world;
                else if (near > 0f && z.clip != null)
                {
                    _nextAmbience[i] -= dt;
                    if (_nextAmbience[i] <= 0f)
                    {
                        a.volume = near * z.volume * world;
                        a.Play();
                        _nextAmbience[i] = R(z.gap.x, z.gap.y) + z.clip.length;
                    }
                }
            }
            if (bank.music.Length > 0)
            {
                _music.volume = SoundMix.Gain(SoundGroup.Music);
                if (!_music.isPlaying)
                {
                    _nextMusic -= Time.unscaledDeltaTime;
                    if (_nextMusic <= 0f)
                    {
                        _music.clip = bank.music[Rng.Next(bank.music.Length)];
                        if (_music.clip != null) _music.Play();
                        _nextMusic = R(bank.musicGap.x, bank.musicGap.y);
                    }
                }
            }
        }
    }
}
