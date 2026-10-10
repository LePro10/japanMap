using System;
using UnityEngine;

namespace JapanMap.Audio
{
    public enum SoundGroup { Engine, Tyres, World, Music, UI }

    /// <summary>
    /// The five volume sliders of ASTRA §6/§10 (Engine, Tyres &amp; impacts, World, Music, UI) and the master mute.
    /// Own group gains instead of an AudioMixer: on the web a mixer can only change group volume anyway (Unity
    /// manual "Audio in Web"), and its asset cannot be created from script — D33. Every game sound source asks
    /// <see cref="Gain"/> for its group each frame. Saved per device (PlayerPrefs), not in the progress JSON.
    /// </summary>
    public static class SoundMix
    {
        const string Prefix = "jm.audio.";
        static readonly float[] Defaults = { 0.9f, 0.8f, 0.7f, 0.25f, 0.7f };
        static float[] _volume;
        static bool _muted;
        static float _duck = 1f, _duckUntil;

        public static event Action Changed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _volume = null;
            Changed = null;
            _duck = 1f;
            _duckUntil = 0f;
        }

        static void Load()
        {
            if (_volume != null) return;
            _volume = new float[Defaults.Length];
            for (var i = 0; i < Defaults.Length; i++) _volume[i] = PlayerPrefs.GetFloat(Prefix + (SoundGroup)i, Defaults[i]);
            _muted = PlayerPrefs.GetInt(Prefix + "muted", 0) == 1;
            AudioListener.volume = _muted ? 0f : 1f;
        }

        public static float Volume(SoundGroup g)
        {
            Load();
            return _volume[(int)g];
        }

        public static void SetVolume(SoundGroup g, float v)
        {
            Load();
            _volume[(int)g] = Mathf.Clamp01(v);
            PlayerPrefs.SetFloat(Prefix + g, _volume[(int)g]);
            Changed?.Invoke();
        }

        public static float Default(SoundGroup g) => Defaults[(int)g];

        /// <summary>Master mute, immediate (ASTRA §6).</summary>
        public static bool Muted
        {
            get { Load(); return _muted; }
            set
            {
                Load();
                _muted = value;
                PlayerPrefs.SetInt(Prefix + "muted", value ? 1 : 0);
                AudioListener.volume = value ? 0f : 1f;
                Changed?.Invoke();
            }
        }

        /// <summary>Important event signals duck the music by 6 dB for their duration (ASTRA §6).</summary>
        public static void DuckMusic(float seconds)
        {
            _duck = 0.5f;
            _duckUntil = Mathf.Max(_duckUntil, Time.unscaledTime + seconds);
        }

        /// <summary>Linear gain of a group now (slider × duck for music).</summary>
        public static float Gain(SoundGroup g)
        {
            Load();
            var v = _volume[(int)g];
            if (g == SoundGroup.Music) v *= Time.unscaledTime < _duckUntil ? _duck : 1f;
            return v;
        }
    }
}
