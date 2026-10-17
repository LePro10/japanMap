using System;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Stunts
{
    /// <summary>
    /// Runs the stunt judge on the player's car, pays scored stunts into the wallet (same cap as drift),
    /// shows them, the STUNT tag and the recommended speed on the approach to a ramp.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class StuntScorer : MonoBehaviour
    {
        [SerializeField] StuntSettings settings;
        [SerializeField] RampSet ramps;
        [SerializeField] PlayerModeController player;
        [SerializeField] DriverInput driver;
        [SerializeField] SparksWallet wallet;
        [SerializeField] GameplayHud hud;

        StuntJudge _judge;
        VehicleController _car;
        bool _hit;

        public StuntJudge Judge => _judge ??= new StuntJudge(settings);
        public RampSet Ramps => ramps;
        /// <summary>Paying Sparks for stunts (off during events, which pay their own reward).</summary>
        public bool PaysSparks { get; set; } = true;
        public StuntResult Last { get; private set; }
        public int Count { get; private set; }
        public event Action<StuntResult> Scored;

        void OnEnable() => Judge.Scored += OnScored;
        void OnDisable() => Judge.Scored -= OnScored;

        void OnScored(StuntResult r)
        {
            Last = r;
            Count++;
            if (PaysSparks && wallet != null) wallet.AddScore(r.points, r.title);
            if (hud != null) hud.Flash($"{r.title}  +{r.points:N0}{(r.repeat ? "  (repeat)" : "")}");
            Scored?.Invoke(r);
        }

        void FixedUpdate()
        {
            var car = player != null && player.Current == PlayerModeController.Mode.Driving ? player.Car : null;
            if (car != _car)
            {
                if (_car != null && _car.TryGetComponent<ContactRelay>(out var old)) old.Touched -= OnTouched;
                _car = car;
                if (_car != null)
                {
                    if (!_car.TryGetComponent<ContactRelay>(out var relay)) relay = _car.gameObject.AddComponent<ContactRelay>();
                    relay.Touched += OnTouched;
                }
            }
            if (_car == null) return;
            var t = _car.Telemetry;
            Judge.Step(Time.fixedDeltaTime, new StuntSample
            {
                position = _car.transform.position,
                forward = _car.transform.forward,
                up = _car.transform.up,
                hop = t.hop,
                airTrick = t.airTrick,
                velocity = _car.Body.linearVelocity,
                airborne = t.airborne,
                groundedWheels = t.groundedWheels,
                stuntMode = driver != null && driver.StuntArmed,
                bodyHit = _hit,
                rampAtLip = ramps != null ? ramps.AtLip(_car.transform.position) : -1,
            });
            _hit = false;
        }

        /// <summary>Last body contact: collider name and normal (diagnostics, play scripts).</summary>
        public string LastHit { get; private set; } = "";

        void OnTouched(Collision c)
        {
            LastHit = $"{c.collider.name} n={(c.contactCount > 0 ? c.GetContact(0).normal : Vector3.zero):F2} v={c.relativeVelocity.magnitude * 3.6f:0} km/h";
            // The ground under a landing is no "hit": only contacts that push sideways or backwards count.
            var n = c.contactCount > 0 ? c.GetContact(0).normal : Vector3.up;
            if (n.y < 0.7f) _hit = true;
        }

        void Update()
        {
            if (hud == null) return;
            hud.SetStuntTag(_car != null && driver != null && driver.StuntArmed);
            hud.SetHint(_car != null ? RampHint(_car) : "");
        }

        /// <summary>"Petal Hop · 55–75 km/h" while driving towards a ramp in its lane.</summary>
        string RampHint(VehicleController car)
        {
            if (ramps == null || car.Telemetry.airborne) return "";
            var p = car.transform.position;
            foreach (var r in ramps.ramps)
            {
                var f = r.Forward;
                var d = p - new Vector3(r.start.x, p.y, r.start.y);
                var along = Vector3.Dot(d, f);
                var side = Vector3.Dot(d, new Vector3(f.z, 0f, -f.x));
                if (along < -ramps.hintDistance || along > 0f || Mathf.Abs(side) > r.width) continue;
                if (Vector3.Dot(car.transform.forward, f) < 0.7f) continue;
                return $"{r.title} · {r.speedHint}";
            }
            return "";
        }
    }
}
