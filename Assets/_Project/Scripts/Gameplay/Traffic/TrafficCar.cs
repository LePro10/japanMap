using JapanMap.Core;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Traffic
{
    /// <summary>
    /// One NPC car: a full VehicleController body (so the player can shove it, PLAN "wegschiebbar")
    /// driven by the PathFollower along its lane. This adds what the follower lacks: braking for
    /// anything ahead (cars, the walker, pedestrians) and noticing when it is stuck or knocked away.
    /// </summary>
    [DefaultExecutionOrder(-140)] // after PathFollower wrote the input, before the car simulates
    public sealed class TrafficCar : MonoBehaviour
    {
        TrafficSettings _s;
        VehicleController _car;
        PathFollower _pilot;
        float _stuck, _waiting;
        int _mask;
        static readonly RaycastHit[] Hits = new RaycastHit[8];

        public VehicleController Car => _car;
        public Renderer[] BodyRenderers { get; set; } = { };
        public PathFollower Pilot => _pilot;
        public int RoadIndex { get; set; } = -1;
        /// <summary>True when it should be placed anew (stuck, flipped, off its lane for long).</summary>
        public bool Lost => _stuck > _s.stuckSeconds || _waiting > _s.stuckSeconds * 3f || transform.up.y < 0.3f || transform.position.y < -30f;
        public bool Blocked { get; private set; }

        public void Bind(TrafficSettings s, VehicleController car, PathFollower pilot)
        {
            _s = s;
            _car = car;
            _pilot = pilot;
            _mask = LayerMask.GetMask(GameLayers.Vehicle, GameLayers.Walker, GameLayers.Pedestrian);
        }

        public void ResetState() => _stuck = _waiting = 0f;

        void FixedUpdate()
        {
            if (_car == null) return;
            var speed = _car.Telemetry.speed;
            var fwd = transform.forward;
            var gap = _s.gapBase + speed * _s.gapSeconds;
            var half = _car.Definition.bodySize.x * 0.5f;
            var from = transform.position + Vector3.up * 0.8f + fwd * (half - 0.5f);
            Blocked = false;
            var n = Physics.SphereCastNonAlloc(from, 0.9f, fwd, Hits, gap, _mask, QueryTriggerInteraction.Collide);
            for (var i = 0; i < n; i++)
            {
                if (Hits[i].collider.attachedRigidbody == _car.Body) continue;
                Blocked = true;
                break;
            }
            if (Blocked)
            {
                var input = _car.Input;
                input.throttle = 0f;
                input.brake = 1f;
                _car.Input = input;
            }
            // Stuck = slow while nothing blocks it, or far off its lane.
            var off = _pilot != null && _pilot.Offset > 6f;
            _stuck = (speed < 1f && !Blocked) || off ? _stuck + Time.fixedDeltaTime : 0f;
            // Waiting behind a parked car for ever is stuck too, just slower to call it.
            _waiting = Blocked && speed < 1f ? _waiting + Time.fixedDeltaTime : 0f;
        }
    }
}
