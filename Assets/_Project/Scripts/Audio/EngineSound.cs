using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Audio
{
    /// <summary>
    /// Loop-crossfade engine (the standard way when the platform has no DSP: Unity's web audio plays, pitches and
    /// fades clips, nothing more). Every frame: rpm picks the two neighbouring steps (equal-power crossfade), load
    /// fades on-load against off-load, each source is pitched to rpm / its recorded rpm. Tuning is audible as
    /// layers, not as a transposition (ASTRA §6): Street adds an intake layer an octave up, Sport a deeper loaded
    /// harmonic an octave down and a stronger lift-off. Gearbox shifts are heard as the load cut and pitch drop
    /// they already are in the rpm/load numbers.
    /// </summary>
    public sealed class EngineSound : MonoBehaviour
    {
        EngineSoundBank _bank;
        AudioSource _idle, _lift, _intake, _deep;
        readonly List<AudioSource> _on = new(), _off = new();
        float _rpm, _load, _throttle, _prevThrottle;
        float _liftCooldown;

        /// <summary>0 stock, 1 Street, 2 Sport engine.</summary>
        public int Tier { get; set; }
        public bool Running { get; set; } = true;
        public EngineSoundBank Bank => _bank;
        /// <summary>Summed linear volume of all engine layers last frame (tests: tuning must be measurable).</summary>
        public float LayerLevel { get; private set; }
        public float IntakeLevel => _intake != null ? _intake.volume : 0f;
        /// <summary>Summed volume of the on-load and the off-load loops (tests: load must be heard).</summary>
        public float OnLevel { get; private set; }
        public float OffLevel { get; private set; }
        /// <summary>Pitch of the loudest loop (tests: pitch follows rpm).</summary>
        public float MainPitch { get; private set; }
        public float DeepLevel => _deep != null ? _deep.volume : 0f;
        [Tooltip("Street intake layer and Sport deep layer, linear share of the main loop.")]
        public Vector2 tierLayers = new(0.22f, 0.3f);
        [Tooltip("Lift-off plays when the throttle closes above this share of the top step rpm.")]
        public float liftRpmShare = 0.55f;

        readonly List<AudioSource> _own = new();

        public void Bind(EngineSoundBank bank)
        {
            // Only our own sources: the tyres and impacts live on the same car (a streamed bank rebinds later, D36).
            foreach (var s in _own) if (s != null) Destroy(s);
            _own.Clear();
            _on.Clear();
            _off.Clear();
            _bank = bank;
            if (bank == null) return;
            _idle = Loop(bank.idle);
            foreach (var s in bank.steps)
            {
                _on.Add(Loop(s.onLoad));
                _off.Add(Loop(s.offLoad));
            }
            _intake = Loop(null);
            _deep = Loop(null);
            _lift = gameObject.AddComponent<AudioSource>();
            _own.Add(_lift);
            _lift.playOnAwake = false;
            _lift.clip = bank.lift;
            _lift.spatialBlend = 0f;
        }

        AudioSource Loop(AudioClip clip)
        {
            var a = gameObject.AddComponent<AudioSource>();
            _own.Add(a);
            a.clip = clip;
            a.loop = true;
            a.playOnAwake = false;
            a.spatialBlend = 0f; // the player's own car: always behind the camera
            a.volume = 0f;
            a.dopplerLevel = 0f;
            if (clip != null) a.Play();
            return a;
        }

        /// <summary>Feeds the engine state of this frame (from the gearbox).</summary>
        public void Drive(float rpm, float load, float throttle)
        {
            _rpm = rpm;
            _load = Mathf.Clamp01(load);
            _throttle = Mathf.Clamp01(throttle);
        }

        void Update()
        {
            if (_bank == null || _bank.steps.Length == 0) return;
            var dt = Time.deltaTime;
            var gain = Running ? _bank.gain * SoundMix.Gain(SoundGroup.Engine) : 0f;
            var steps = _bank.steps;
            var rpm = Mathf.Max(_rpm, _bank.idleRpm * 0.9f);

            // Idle below the first step, then neighbouring steps.
            var idleW = 1f - Mathf.InverseLerp(_bank.idleRpm, steps[0].rpm, rpm);
            int lo = 0, hi = 0;
            var x = 0f;
            if (rpm >= steps[steps.Length - 1].rpm) lo = hi = steps.Length - 1;
            else
                for (var i = 0; i < steps.Length - 1; i++)
                    if (rpm < steps[i + 1].rpm)
                    {
                        lo = i;
                        hi = i + 1;
                        x = Mathf.Clamp01(Mathf.InverseLerp(steps[i].rpm, steps[i + 1].rpm, rpm));
                        break;
                    }
            var wLo = Mathf.Cos(x * Mathf.PI * 0.5f) * (1f - idleW);
            var wHi = Mathf.Sin(x * Mathf.PI * 0.5f) * (1f - idleW);
            var on = Mathf.Sqrt(_load);
            var off = Mathf.Sqrt(1f - _load) * _bank.offGain;

            var level = 0f;
            float onSum = 0f, offSum = 0f, loud = 0f;
            for (var i = 0; i < steps.Length; i++)
            {
                var w = i == lo ? wLo : 0f;
                if (i == hi && hi != lo) w += wHi;
                else if (i == hi) w = 1f - idleW;
                var pitch = Mathf.Clamp(rpm / steps[i].rpm, 0.3f, 3f);
                Set(_on[i], w * on * gain, pitch);
                Set(_off[i], w * off * gain, pitch);
                level += _on[i].volume + _off[i].volume;
                onSum += _on[i].volume;
                offSum += _off[i].volume;
                if (_on[i].volume + _off[i].volume > loud) { loud = _on[i].volume + _off[i].volume; MainPitch = pitch; }
            }
            OnLevel = onSum;
            OffLevel = offSum;
            Set(_idle, idleW * gain, Mathf.Clamp(rpm / _bank.idleRpm, 0.5f, 2f));
            level += _idle.volume;

            // Tuning layers ride on the strongest loaded step.
            var main = wHi > wLo ? hi : lo;
            Layer(_intake, Tier >= 1, steps[main].onLoad, rpm / steps[main].rpm * 2f, tierLayers.x * on * (1f - idleW) * gain);
            Layer(_deep, Tier >= 2, steps[main].onLoad, rpm / steps[main].rpm * 0.5f, tierLayers.y * on * (1f - idleW) * gain);
            level += _intake.volume + _deep.volume;
            LayerLevel = level;

            _liftCooldown -= dt;
            if (Running && _lift.clip != null && _prevThrottle > 0.7f && _throttle < 0.2f && rpm > steps[steps.Length - 1].rpm * liftRpmShare && _liftCooldown <= 0f)
            {
                _lift.volume = gain * (Tier >= 2 ? 1f : Tier == 1 ? 0.8f : 0.6f);
                _lift.Play();
                _liftCooldown = 1.2f;
            }
            _prevThrottle = _throttle;
        }

        static void Set(AudioSource a, float volume, float pitch)
        {
            if (a == null) return;
            a.volume = volume;
            a.pitch = pitch; // positive only on the web — clamped above
        }

        static void Layer(AudioSource a, bool on, AudioClip clip, float pitch, float volume)
        {
            if (a.clip != clip)
            {
                a.clip = clip;
                if (clip != null) a.Play();
            }
            Set(a, on ? volume : 0f, Mathf.Clamp(pitch, 0.3f, 3f));
        }
    }
}
