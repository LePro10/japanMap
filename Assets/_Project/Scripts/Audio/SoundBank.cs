using System;
using UnityEngine;

namespace JapanMap.Audio
{
    /// <summary>
    /// Every non-engine sound of the game by name, with its group and level: tyre and wind loops, one-shots
    /// (impacts, breakables, bells, countdown, UI), world ambience and music. Clips may be empty — a missing clip is
    /// silent, never an error, so the asset session can fill them one by one (STATUS lists what is missing).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Audio/Sound Bank")]
    public sealed class SoundBank : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            public string name;
            public SoundGroup group;
            public AudioClip clip;
            [Range(0f, 2f)] public float volume;
            [Tooltip("Random pitch spread ± (two hits never sound the same).")]
            [Range(0f, 0.3f)] public float pitchJitter;
        }

        [Serializable]
        public struct Ambience
        {
            public string name;
            [Tooltip("Centre, Unity x/z, and radius, m: full level inside 60 % of it, silent outside.")]
            public Vector2 at;
            public float radius;
            [Tooltip("Looping bed, or a one-shot repeated with the gap below (bell, birds).")]
            public AudioClip clip;
            public bool loop;
            [Tooltip("Gap between repeats of a one-shot, s (min, max).")]
            public Vector2 gap;
            [Range(0f, 1f)] public float volume;
        }

        public Entry[] entries = Array.Empty<Entry>();
        public Ambience[] ambience = Array.Empty<Ambience>();
        [Tooltip("Music phrases (one quiet instrumental bed, ASTRA §6); one plays, then a gap.")]
        public AudioClip[] music = Array.Empty<AudioClip>();
        [Tooltip("Gap between music phrases, s (ASTRA: 20–40).")]
        public Vector2 musicGap = new(20f, 40f);

        public bool TryGet(string name, out Entry e)
        {
            foreach (var x in entries)
                if (x.name == name)
                {
                    e = x;
                    return true;
                }
            e = default;
            return false;
        }
    }
}
