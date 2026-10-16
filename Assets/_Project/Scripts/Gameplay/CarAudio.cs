using System.Collections.Generic;
using JapanMap.Audio;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Smash;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay
{
    /// <summary>
    /// Connects the game to its sound (ASTRA §6): the player's car gets an engine from its bank, driven by the
    /// gearbox's own rpm and load (so a shift is heard in the same step the HUD shows it), with the fitted engine
    /// tier as audible layers; tyres by surface and actual slip; impacts by speed into the surface (a glancing scrape
    /// is quiet, a head-on hit hard); one suspension thump on a landing; a breath on nitro; breakables by material;
    /// a bell for a discovery. While a menu or the garage holds the player, the car is silent.
    /// </summary>
    public sealed class CarAudio : MonoBehaviour
    {
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerProgress progress;
        [SerializeField] DiscoverySystem discoveries;
        [SerializeField] EngineSoundBank[] banks = System.Array.Empty<EngineSoundBank>();
        [Tooltip("Impact speed into the surface for a soft / mid / hard hit, m/s.")]
        [SerializeField] Vector3 impactSpeeds = new(2.5f, 7f, 14f);
        [Tooltip("Vertical speed at touchdown that thumps, m/s.")]
        [SerializeField] float landingSpeed = 3f;

        VehicleController _car;
        EngineSound _engine;
        TyreSound _tyres;
        ContactRelay _contacts;
        bool _wasAirborne, _wasBoosting;
        float _lastBurst;
        float _airVy, _lastImpact;

        public EngineSound Engine => _engine;
        public TyreSound Tyres => _tyres;
        public string LastImpact { get; private set; } = "";

        void OnEnable()
        {
            if (spawner != null) spawner.Spawned += Bind;
            if (discoveries != null) discoveries.CardFound += OnFound;
            SmashSystem.Broke += OnBroke;
        }

        void OnDisable()
        {
            if (spawner != null) spawner.Spawned -= Bind;
            if (discoveries != null) discoveries.CardFound -= OnFound;
            SmashSystem.Broke -= OnBroke;
        }

        void Start()
        {
            if (spawner != null && spawner.Current != null) Bind(spawner.Current);
        }

        // Banks not in the start download (every car but the starter, D36) arrive by address "engine/<id>".
        readonly System.Collections.Generic.Dictionary<string, EngineSoundBank> _streamed = new();
        readonly System.Collections.Generic.HashSet<string> _asked = new();

        /// <summary>The car's bank; while a streamed one is on its way, the first bank stands in and the right one follows.</summary>
        EngineSoundBank BankFor(string carId)
        {
            foreach (var b in banks) if (b != null && b.carId == carId) return b;
            if (_streamed.TryGetValue(carId, out var got)) return got;
            RequestBank(carId);
            if (_streamed.TryGetValue(carId, out got)) return got; // the editor answers at once
            return banks.Length > 0 ? banks[0] : null;
        }

        public static string BankAddress(string carId) => "engine/" + carId;

        void RequestBank(string carId)
        {
            if (!_asked.Add(carId)) return;
            var op = UnityEngine.AddressableAssets.Addressables.LoadAssetAsync<EngineSoundBank>(BankAddress(carId));
            op.Completed += h =>
            {
                if (h.Status != UnityEngine.ResourceManagement.AsyncOperations.AsyncOperationStatus.Succeeded)
                {
                    Debug.LogWarning($"[Content] engine bank {carId} failed");
                    _asked.Remove(carId);
                    return;
                }
                _streamed[carId] = h.Result;
                if (_car != null && _engine != null && _car.Definition.id == carId) _engine.Bind(h.Result);
            };
            if (Application.isEditor && CarModels.EditorSync) op.WaitForCompletion();
        }

        /// <summary>Starts the download of a car's sound (the background loader, the garage).</summary>
        public void Prefetch(string carId)
        {
            foreach (var b in banks) if (b != null && b.carId == carId) return;
            RequestBank(carId);
        }

        void Bind(VehicleController car)
        {
            _car = car;
            if (car == null) return;
            _engine = car.gameObject.AddComponent<EngineSound>();
            _engine.Bind(BankFor(car.Definition.id));
            _tyres = car.gameObject.AddComponent<TyreSound>();
            _contacts = car.gameObject.AddComponent<ContactRelay>();
            _contacts.Touched += OnContact;
            _wasAirborne = false;
        }

        void OnFound(int index, int total) => Sfx.Play("Bell_Discovery");

        void OnBroke(string kind, Vector3 at, float speed)
        {
            var name = kind switch { "tree" => "Break_Tree", "post" => "Break_Rail", "vending" => "Break_Barrel", "cone" => "Break_Cone", _ => "Break_Wood" };
            Sfx.Play(name, Mathf.Clamp01(0.4f + speed / 25f), at);
        }

        void OnContact(Collision c)
        {
            if (_car == null || c.contactCount == 0) return;
            if (c.rigidbody != null && c.rigidbody.gameObject.layer == LayerMask.NameToLayer("Debris")) return;
            // Speed into the surface, not along it: a scrape along a wall is not a crash (ASTRA: by speed and angle).
            var n = c.GetContact(0).normal;
            var into = Mathf.Abs(Vector3.Dot(c.relativeVelocity, n));
            if (into < impactSpeeds.x || Time.time - _lastImpact < 0.25f) return;
            _lastImpact = Time.time;
            var name = into >= impactSpeeds.z ? "Impact_Car_Hard" : into >= impactSpeeds.y ? "Impact_Car_Mid" : "Impact_Car_Soft";
            LastImpact = name;
            Sfx.Play(name, Mathf.Clamp01(into / impactSpeeds.z), c.GetContact(0).point);
        }

        void Update()
        {
            if (_car == null || _engine == null) return;
            var held = player != null && (player.Suspended || player.Current != PlayerModeController.Mode.Driving);
            // On foot the parked car idles quietly beside the player; under a menu it is silent.
            var g = _car.Gearbox;
            var t = _car.Telemetry;
            _engine.Running = player == null || !player.Suspended;
            _engine.Drive(g.Rpm, g.Load, held ? 0f : _car.Input.throttle);
            _engine.Tier = progress != null && progress.Owns(_car.Definition.id) ? progress.Car(_car.Definition.id).tune[TuneCategory.Engine] : 0;
            _tyres.Running = _engine.Running;
            var slip = Mathf.Max(t.skid, Mathf.Abs(t.slip) * 1.7f, t.wheelspin > 1f ? Mathf.Min(1f, (t.wheelspin - 1f) * 1.1f) * 0.9f : 0f);
            var ground = t.surface switch { Surface.Gravel => TyreSound.Ground.Gravel, Surface.Terrain => TyreSound.Ground.Grass, Surface.Water => TyreSound.Ground.Water, _ => TyreSound.Ground.Asphalt };
            _tyres.Drive(t.speed, slip, ground, t.airborne);

            var vy = _car.Body.linearVelocity.y;
            if (t.airborne) _airVy = Mathf.Min(_airVy, vy);
            else if (_wasAirborne)
            {
                // One suspension thump on a landing, not a crash alarm (ASTRA §6).
                if (-_airVy > landingSpeed) Sfx.Play("Land_Thump", Mathf.Clamp01(-_airVy / 10f), _car.transform.position);
                if (ground == TyreSound.Ground.Water) Sfx.Play("Splash", 1f, _car.transform.position);
                _airVy = 0f;
            }
            _wasAirborne = t.airborne;
            // A breath when the nitro opens (quiet: it is tapped often), a whump for the burst.
            if (t.boosting && !_wasBoosting) Sfx.Play("Whoosh_Up", 0.35f);
            _wasBoosting = t.boosting;
            if (t.burst > 0.97f && _lastBurst <= 0f) Sfx.Play("Boost_Burst", 0.6f + 0.4f * t.burstCharge);
            _lastBurst = t.burst;
        }
    }
}
