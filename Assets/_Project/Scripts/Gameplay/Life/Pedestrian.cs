using JapanMap.Core;
using JapanMap.OnFoot;
using UnityEngine;
using UnityEngine.AI;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// One pedestrian: a NavMeshAgent that wanders the pavement it stands on (the NavMesh has no
    /// carriageways, D23), a trigger capsule a car can hit, and a stand-in figure. A hit above walking
    /// pace turns the body into a plain Rigidbody thrown with the car (legacy CityPedestrians #knock:
    /// "bei Vollgas fliegen sie fast"); after lying a while the person stands up on the nearest pavement.
    /// </summary>
    public sealed class Pedestrian : MonoBehaviour
    {
        public enum State { Walking, Paused, Knocked, Standing }

        PedestrianSettings _s;
        NavMeshAgent _agent;
        Rigidbody _rb;
        CapsuleCollider _body;
        StandInFigure _figure;
        Transform _pose;
        float _pauseUntil, _downFor, _knockedFor, _cycle;
        bool _fixedSpot;

        Renderer _renderer;

        public State Current { get; private set; } = State.Walking;
        /// <summary>False when someone else poses the figure (a place actor at work).</summary>
        public bool OwnPose { get; set; } = true;
        public NavMeshAgent Agent => _agent;
        public bool Knocked => Current == State.Knocked;
        /// <summary>Hits since spawn (tests, later scoring).</summary>
        public int Hits { get; private set; }

        public static Pedestrian Build(Transform parent, PedestrianSettings s, Material skin, Material top, Material bottom, float speed)
        {
            var go = new GameObject("Pedestrian");
            go.SetActive(false); // the agent attaches when the crowd places it on the NavMesh
            go.layer = GameLayers.Layer(GameLayers.Pedestrian);
            go.transform.SetParent(parent, false);
            var p = go.AddComponent<Pedestrian>();
            p._s = s;
            p._rb = go.AddComponent<Rigidbody>();
            p._rb.isKinematic = true;
            p._rb.mass = s.mass;
            p._rb.interpolation = RigidbodyInterpolation.Interpolate;
            p._rb.angularDamping = 1.5f; // a lying capsule would roll on for ever
            p._rb.linearDamping = 0.1f;
            p._body = go.AddComponent<CapsuleCollider>();
            p._body.radius = s.radius;
            p._body.height = s.height;
            p._body.center = new Vector3(0f, s.height * 0.5f, 0f);
            p._body.isTrigger = true;
            p._agent = go.AddComponent<NavMeshAgent>();
            p._agent.radius = s.radius;
            p._agent.height = s.height;
            p._agent.speed = speed;
            p._agent.acceleration = 4f;
            p._agent.angularSpeed = 300f;
            p._agent.stoppingDistance = 0.3f;
            p._agent.obstacleAvoidanceType = ObstacleAvoidanceType.LowQualityObstacleAvoidance;
            p._agent.areaMask = 1 << 0; // Walkable only
            p._pose = new GameObject("Pose").transform;
            p._pose.SetParent(go.transform, false);
            p._figure = StandInFigure.Build(p._pose, s.height, skin, top, bottom);
            p._renderer = p._figure.GetComponent<Renderer>();
            return p;
        }

        /// <summary>Stand at a NavMesh point and start wandering (or stay, for a fixed actor).</summary>
        public void Spawn(Vector3 onNavMesh, float yaw, bool stay = false)
        {
            _fixedSpot = stay;
            EndKnock();
            _agent.Warp(onNavMesh);
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            Current = stay ? State.Standing : State.Paused;
            _pauseUntil = Time.time + Random.value * _s.maxPause;
            _agent.isStopped = stay;
        }

        void Update()
        {
            switch (Current)
            {
                case State.Knocked:
                    UpdateKnocked();
                    break;
                case State.Paused:
                    if (Time.time >= _pauseUntil && _agent.isOnNavMesh) NewTarget();
                    break;
                case State.Walking:
                    if (!_agent.pathPending && _agent.remainingDistance <= _agent.stoppingDistance + 0.1f)
                    {
                        Current = State.Paused;
                        _pauseUntil = Time.time + Random.value * _s.maxPause;
                    }
                    break;
            }

            if (Current != State.Knocked && OwnPose)
            {
                var v = _agent.velocity.magnitude;
                _cycle += v * Time.deltaTime;
                _figure.Pose(_cycle, Mathf.Clamp01(v / 2.6f), 0f, 0f, false);
            }
        }

        public void CastShadows(bool on)
        {
            var mode = on ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            if (_renderer.shadowCastingMode != mode) _renderer.shadowCastingMode = mode;
        }

        void NewTarget()
        {
            for (var i = 0; i < 4; i++)
            {
                var r = Random.insideUnitCircle * _s.wanderRadius;
                var p = transform.position + new Vector3(r.x, 0f, r.y);
                if (!NavMesh.SamplePosition(p, out var hit, 4f, _agent.areaMask)) continue;
                if (!_agent.SetDestination(hit.position)) continue;
                Current = State.Walking;
                return;
            }
            _pauseUntil = Time.time + 1f;
        }

        void OnTriggerEnter(Collider other)
        {
            if (Current == State.Knocked) return;
            var car = other.attachedRigidbody;
            if (car == null || car.gameObject.layer != GameLayers.Layer(GameLayers.Vehicle)) return;
            var v = car.linearVelocity;
            var speed = new Vector2(v.x, v.z).magnitude;
            if (speed < _s.hitMinSpeed) return;
            Knock(v, speed);
            car.linearVelocity *= _s.hitDrag;
        }

        /// <summary>Thrown by a car moving at <paramref name="carVelocity"/>.</summary>
        public void Knock(Vector3 carVelocity, float speed)
        {
            Hits++;
            Current = State.Knocked;
            _downFor = _knockedFor = 0f;
            _agent.enabled = false;
            _body.isTrigger = false;
            _rb.isKinematic = false;
            _rb.linearVelocity = new Vector3(carVelocity.x * _s.carry, _s.launchUp + speed * _s.launchUpPerSpeed, carVelocity.z * _s.carry);
            var side = Vector3.Cross(Vector3.up, new Vector3(carVelocity.x, 0f, carVelocity.z).normalized);
            _rb.angularVelocity = side * (_s.spin + speed * _s.spinPerSpeed) * (Random.value < 0.5f ? -1f : 1f);
            _figure.Pose(_cycle, 0f, 0f, 0f, true);
        }

        void UpdateKnocked()
        {
            // Lying counts down; a body still flying does not. Never longer than three times the down time.
            _knockedFor += Time.deltaTime;
            if (_rb.linearVelocity.sqrMagnitude < 1f) _downFor += Time.deltaTime;
            if (_downFor < _s.downTime && _knockedFor < _s.downTime * 3f && transform.position.y > -50f) return;
            // Stand up on the nearest pavement — never on the road where the body landed.
            if (NavMesh.SamplePosition(transform.position, out var hit, 30f, 1 << 0)) Spawn(hit.position, transform.eulerAngles.y, _fixedSpot);
            else gameObject.SetActive(false);
        }

        void EndKnock()
        {
            _rb.isKinematic = true;
            _body.isTrigger = true;
            _agent.enabled = true;
            transform.rotation = Quaternion.Euler(0f, transform.eulerAngles.y, 0f);
        }
    }
}
