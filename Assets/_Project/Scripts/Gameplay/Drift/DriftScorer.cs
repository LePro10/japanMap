using System;
using JapanMap.Gameplay.Economy;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Drift
{
    /// <summary>
    /// Runs the drift chain on the player's car: samples telemetry each fixed step, reads speed lost
    /// to contacts, applies the zone bonus and pays banked chains into the wallet. Runs before the car
    /// (-200 &lt; -100) so the car's last step is complete when it looks.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class DriftScorer : MonoBehaviour
    {
        [SerializeField] DriftSettings settings;
        [SerializeField] DriftZoneSet zones;
        [SerializeField] PlayerModeController player;
        [SerializeField] SparksWallet wallet;
        [SerializeField] VehicleRespawn respawn;

        DriftChain _chain;
        VehicleController _car;
        bool _hit;
        float _windowLeft, _contactRef, _contactLoss;

        public DriftChain Chain => _chain ??= new DriftChain(settings);
        public DriftZoneSet Zones => zones;
        /// <summary>Index into <see cref="Zones"/> of the zone the car is in, else −1.</summary>
        public int Zone { get; private set; } = -1;
        /// <summary>Paying Sparks for banked chains (off during events, which pay their own reward).</summary>
        public bool PaysSparks { get; set; } = true;
        /// <summary>Reason, credited points, chain before the cut — for the HUD.</summary>
        public event Action<ChainEnd, float, float> ChainEnded;
        /// <summary>Last measured contact loss, km/h (diagnostics and tests).</summary>
        public float LastContactKmh { get; private set; }

        public void Configure(DriftSettings s, DriftZoneSet z, PlayerModeController p, SparksWallet w, VehicleRespawn r = null)
        {
            respawn = r;
            settings = s;
            zones = z;
            player = p;
            wallet = w;
            _chain = null;
        }

        void OnEnable()
        {
            Chain.Ended += OnEnded;
            if (respawn != null) respawn.Respawned += Chain.Bank;
        }

        void OnDisable()
        {
            Chain.Ended -= OnEnded;
            if (respawn != null) respawn.Respawned -= Chain.Bank;
        }

        void OnEnded(ChainEnd reason, float credit, float chain)
        {
            if (PaysSparks && wallet != null && credit > 0f) wallet.AddScore(credit, "Drift");
            ChainEnded?.Invoke(reason, credit, chain);
        }

        void FixedUpdate()
        {
            var car = player != null && player.Current == PlayerModeController.Mode.Driving ? player.Car : null;
            if (car != _car)
            {
                // Leaving the car, a new car or a respawn: the open chain is banked, never carried.
                Chain.Bank();
                if (_car != null && _car.TryGetComponent<ContactRelay>(out var old)) old.Touched -= OnTouched;
                _car = car;
                if (_car != null)
                {
                    if (!_car.TryGetComponent<ContactRelay>(out var relay)) relay = _car.gameObject.AddComponent<ContactRelay>();
                    relay.Touched += OnTouched;
                }
            }
            if (_car == null) return;

            if (_hit && _windowLeft <= 0f)
            {
                // The car has not stepped yet: VelocityBeforeStep is from before the contact step. A hit
                // spreads over a few steps (contact offset, bounce), so the loss is read over a window.
                _windowLeft = settings.contactWindow;
                _contactRef = Planar(_car.VelocityBeforeStep);
                _contactLoss = 0f;
            }
            _hit = false;
            if (_windowLeft > 0f)
            {
                _contactLoss = Mathf.Max(_contactLoss, _contactRef - Planar(_car.Body.linearVelocity));
                _windowLeft -= Time.fixedDeltaTime;
                if (_windowLeft <= 0f)
                {
                    LastContactKmh = _contactLoss * 3.6f;
                    Chain.Contact(LastContactKmh);
                }
            }

            var t = _car.Telemetry;
            Zone = zones != null ? zones.IndexAt(_car.transform.position) : -1;
            Chain.Step(Time.fixedDeltaTime, new DriftSample
            {
                speed = t.speed,
                forwardSpeed = t.forwardSpeed,
                slip = t.slip,
                airborne = t.airborne,
                inZone = Zone >= 0,
            });
        }

        void OnTouched(Collision c) => _hit = true;

        static float Planar(Vector3 v) => new Vector2(v.x, v.z).magnitude;
    }
}
