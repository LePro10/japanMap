using System;
using UnityEngine;

namespace JapanMap.Audio
{
    /// <summary>
    /// The engine loops of one car: idle, and per rpm step one loop under load and one off load, recorded at a
    /// known rpm. <see cref="EngineSound"/> crossfades the two neighbouring steps and pitches them to the
    /// current rpm. STAND-IN clips come from the prototype's synthesizer (Tools/legacy-export/render-audio.mts)
    /// until recordings replace them; the bank layout stays.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Audio/Engine Sound Bank")]
    public sealed class EngineSoundBank : ScriptableObject
    {
        [Serializable]
        public struct Step
        {
            [Tooltip("Rpm the two loops were recorded at.")]
            public float rpm;
            public AudioClip onLoad, offLoad;
        }

        public string carId;
        public AudioClip idle;
        public float idleRpm = 850f;
        public Step[] steps = Array.Empty<Step>();
        [Tooltip("Lift-off at high revs (blow-off, overrun) — played once when the throttle closes above liftRpmShare.")]
        public AudioClip lift;
        [Tooltip("Overall level of this car (loudness match between cars).")]
        [Range(0f, 2f)] public float gain = 1f;
        [Tooltip("Off-load loops relative to on-load.")]
        [Range(0f, 2f)] public float offGain = 1.4f;
    }
}
