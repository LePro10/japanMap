using UnityEngine;

namespace JapanMap.Audio
{
    /// <summary>
    /// Tyres, surface and wind of the player's car (ASTRA §6): rolling per surface by speed, a squeal on asphalt by
    /// actual slip (with a threshold — a small slip angle in every corner must not squeal), water swish, and wind by
    /// speed. Loops from the <see cref="SoundBank"/> ("Roll_Asphalt", "Roll_Gravel", "Roll_Grass", "Roll_Water",
    /// "Skid_Asphalt", "Wind"); all in the Tyres group except wind (World).
    /// </summary>
    public sealed class TyreSound : MonoBehaviour
    {
        public enum Ground { Asphalt, Gravel, Grass, Water }

        static readonly string[] RollNames = { "Roll_Asphalt", "Roll_Gravel", "Roll_Grass", "Roll_Water" };
        readonly AudioSource[] _roll = new AudioSource[4];
        readonly float[] _rollW = new float[4];
        AudioSource _skid, _wind, _scrape;
        float _speed, _slip, _skidEnv, _scrapeEnv;
        Ground _ground;
        bool _air;

        public float SkidLevel => _skid != null ? _skid.volume : 0f;
        public float RollLevel(Ground g) => _roll[(int)g] != null ? _roll[(int)g].volume : 0f;
        public bool Running { get; set; } = true;
        /// <summary>Metal grinding on the road or a wall right now, 0…1 (a lost wheel's hub, a door along a rail — D47).</summary>
        public float Scrape { get; set; }
        public float ScrapeLevel => _scrape != null ? _scrape.volume : 0f;

        void Start()
        {
            for (var i = 0; i < 4; i++) _roll[i] = Loop(RollNames[i]);
            _skid = Loop("Skid_Asphalt");
            _wind = Loop("Wind");
            _scrape = Loop("Scrape_Metal");
        }

        AudioSource Loop(string name)
        {
            var a = gameObject.AddComponent<AudioSource>();
            a.loop = true;
            a.playOnAwake = false;
            a.spatialBlend = 0f;
            a.volume = 0f;
            var bank = Sfx.Bank;
            if (bank != null && bank.TryGet(name, out var e) && e.clip != null)
            {
                a.clip = e.clip;
                a.Play();
            }
            return a;
        }

        /// <summary>This frame's contact: speed m/s, slip 0…1 (max of skid and slip angle), surface, airborne.</summary>
        public void Drive(float speed, float slip, Ground ground, bool airborne)
        {
            _speed = speed;
            _slip = slip;
            _ground = ground;
            _air = airborne;
        }

        void Update()
        {
            var dt = Time.deltaTime;
            var tyres = Running ? SoundMix.Gain(SoundGroup.Tyres) : 0f;
            var bank = Sfx.Bank;
            var onGround = _air ? 0f : 1f;
            var moving = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(1.5f, 9f, _speed));
            for (var i = 0; i < 4; i++)
            {
                _rollW[i] = Mathf.MoveTowards(_rollW[i], (int)_ground == i ? 1f : 0f, dt / 0.08f);
                var level = Level(bank, RollNames[i]);
                _roll[i].volume = _rollW[i] * onGround * Mathf.Clamp01(_speed / 20f) * level * tyres;
                _roll[i].pitch = Mathf.Clamp(0.6f + _speed / 30f, 0.5f, 2f);
            }
            var target = onGround * Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.2f, 0.62f, _slip)) * moving * (_ground == Ground.Asphalt ? 1f : 0.25f);
            _skidEnv = Mathf.MoveTowards(_skidEnv, target, dt / (target > _skidEnv ? 0.05f : 0.12f));
            _skid.volume = _skidEnv * Level(bank, "Skid_Asphalt") * tyres;
            _skid.pitch = Mathf.Clamp(0.85f + _speed / 80f, 0.7f, 1.4f);
            _scrapeEnv = Mathf.MoveTowards(_scrapeEnv, Running ? Mathf.Clamp01(Scrape) : 0f, dt / (Scrape > _scrapeEnv ? 0.03f : 0.15f));
            _scrape.volume = _scrapeEnv * Level(bank, "Scrape_Metal") * tyres;
            _scrape.pitch = Mathf.Clamp(0.75f + _speed / 40f, 0.7f, 1.5f);
            _wind.volume = Running ? Mathf.Clamp01((_speed - 8f) / 45f) * Level(bank, "Wind") * SoundMix.Gain(SoundGroup.World) : 0f;
            _wind.pitch = Mathf.Clamp(0.7f + _speed / 70f, 0.6f, 1.6f);
        }

        static float Level(SoundBank bank, string name) => bank != null && bank.TryGet(name, out var e) ? e.volume : 0f;
    }
}
