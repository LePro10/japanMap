using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// A drivable car on Unity physics: Rigidbody + four raycast springs carry the body, PhysX does
    /// collisions, and <see cref="ArcadeDynamics"/> supplies the planar feel (D15). The car root sits on
    /// the ground plane at rest (model convention: ground = y 0, forward = +Z).
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    [DefaultExecutionOrder(-100)]
    public sealed class VehicleController : MonoBehaviour
    {
        public const int WheelCount = 4;

        [SerializeField] VehicleDefinition definition;
        [SerializeField] ArcadeTuning tuning;
        [Tooltip("Layers the wheels stand on.")]
        [SerializeField] LayerMask groundMask = ~0;

        /// <summary>Set by the player input, AI or a test before each physics step.</summary>
        public DriveInput Input;

        Rigidbody _rb;
        ArcadeDynamics _dyn;
        BoxCollider _body;
        readonly Wheel[] _wheels = new Wheel[WheelCount];
        float _prevAirPitch, _prevAirRoll;
        bool _built;

        public VehicleDefinition Definition => definition;
        public ArcadeTuning Tuning => tuning;
        public Rigidbody Body => _rb;
        public ArcadeDynamics Dynamics => _dyn;
        public VehicleTelemetry Telemetry { get; private set; }
        public Wheel[] Wheels => _wheels;

        /// <summary>One suspension corner. Positions are local to the car root.</summary>
        public struct Wheel
        {
            public Vector3 local;     // wheel centre at static ride height
            public bool front;
            public float stiffness, damping, cap;
            public bool grounded;
            public float compression; // from the spring's natural length, m
            public float load;        // N
            public Vector3 contact, normal;
            public Collider hitCollider;
            public int hitTriangle;
        }

        /// <summary>Build with explicit data — used by spawners and tests before the first step.</summary>
        public void Configure(VehicleDefinition def, ArcadeTuning arcadeTuning)
        {
            definition = def;
            tuning = arcadeTuning;
            _built = false;
            Build();
        }

        void Awake()
        {
            if (definition != null && tuning != null) Build();
        }

        void Build()
        {
            if (_built) return;
            _built = true;
            var def = definition;
            _rb = GetComponent<Rigidbody>();
            _rb.mass = def.mass;
            _rb.linearDamping = 0f;
            _rb.angularDamping = 0.05f;
            _rb.interpolation = RigidbodyInterpolation.Interpolate;
            // Speculative: contacts ahead of the motion. ContinuousDynamic missed a 6 m landing (PhysX only sweeps
            // moves longer than the body, a 21 cm step went 9 cm into the ground).
            _rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            _rb.maxAngularVelocity = 20f;
            // Own layer: the wheels must not stand on this or another car's body, nor on water planes.
            var vehicleLayer = LayerMask.NameToLayer("Vehicle");
            if (vehicleLayer >= 0) gameObject.layer = vehicleLayer;
            groundMask &= ~(LayerMask.GetMask("Vehicle", "Water", "UI") | Physics.IgnoreRaycastLayer);

            // Body box: from the clearance up to the roof. Zero friction so a car slides along a wall
            // or a guardrail instead of sticking to it.
            _body = GetComponent<BoxCollider>();
            if (_body == null) _body = gameObject.AddComponent<BoxCollider>();
            var size = def.bodySize;
            _body.size = new Vector3(size.y, size.z - def.clearance, size.x);
            _body.center = new Vector3(0f, (size.z + def.clearance) * 0.5f, def.bodyCenterZ);
            _body.sharedMaterial = BodyMaterial;

            // Wheels from the model when linked, else from wheelbase and weight split. The centre of
            // mass sits where the axle loads split as frontWeight says.
            var frontZ = def.wheelbase * (1f - def.frontWeight);
            var rearZ = -def.wheelbase * def.frontWeight;
            var halfTrack = Mathf.Max(0.5f, size.y * 0.5f - def.wheelRadius * 0.6f);
            var fromModel = def.wheelPositions != null && def.wheelPositions.Length == WheelCount;
            if (fromModel)
            {
                frontZ = (def.wheelPositions[0].z + def.wheelPositions[1].z) * 0.5f;
                rearZ = (def.wheelPositions[2].z + def.wheelPositions[3].z) * 0.5f;
            }
            var f = def.springFrequency;
            for (var i = 0; i < WheelCount; i++)
            {
                var front = i < 2;
                var share = (front ? def.frontWeight : 1f - def.frontWeight) * 0.5f;
                _wheels[i] = new Wheel
                {
                    local = fromModel
                        ? new Vector3(def.wheelPositions[i].x, def.wheelRadius, def.wheelPositions[i].z)
                        : new Vector3(i % 2 == 0 ? -halfTrack : halfTrack, def.wheelRadius, front ? frontZ : rearZ),
                    front = front,
                    stiffness = def.mass * f * f * share,
                    damping = 2f * def.mass * f * def.dampingRatio * share,
                    cap = def.mass * ArcadeTuning.Gravity * def.maxLoadFactor * share,
                };
            }
            var comZ = rearZ + (frontZ - rearZ) * def.frontWeight;
            // Inertia from the body box, recomputed now that the collider exists (a Rigidbody built
            // before its collider keeps a near-zero tensor and spins wildly on every spring kick).
            _rb.ResetInertiaTensor();
            _rb.centerOfMass = new Vector3(0f, def.cgHeight * tuning.physicsComHeightShare, comZ);

            _dyn = new ArcadeDynamics(def.arcade, tuning, def.dirtGrip, def.crawlShare, def.driveRetain);
            _dyn.SetChassis(def.wheelbase, def.mass);
        }

        static PhysicsMaterial _bodyMaterial;
        static PhysicsMaterial BodyMaterial => _bodyMaterial != null
            ? _bodyMaterial
            : _bodyMaterial = new PhysicsMaterial("VehicleBody")
            {
                dynamicFriction = 0f,
                staticFriction = 0f,
                bounciness = 0.05f,
                frictionCombine = PhysicsMaterialCombine.Minimum,
                bounceCombine = PhysicsMaterialCombine.Minimum,
            };

        /// <summary>
        /// Put the car down at rest on the ground below <paramref name="position"/>, facing heading
        /// (degrees). The ground probe starts <paramref name="fromAbove"/> metres up — small on a road
        /// point (so a viaduct above does not catch it), large for a free drop.
        /// </summary>
        public void Place(Vector3 position, float headingDegrees, float fromAbove = 50f)
        {
            Build();
            var rotation = Quaternion.Euler(0f, headingDegrees, 0f);
            var ground = position.y;
            _body.enabled = false; // a probe from above must not land on our own roof
            if (gameObject.scene.GetPhysicsScene().Raycast(position + Vector3.up * fromAbove, Vector3.down, out var hit,
                    fromAbove + 100f, groundMask, QueryTriggerInteraction.Ignore))
                ground = hit.point.y;
            _body.enabled = true;
            var pos = new Vector3(position.x, ground, position.z);
            transform.SetPositionAndRotation(pos, rotation);
            _rb.position = pos;
            _rb.rotation = rotation;
            _rb.linearVelocity = Vector3.zero;
            _rb.angularVelocity = Vector3.zero;
            _dyn.Reset();
            _prevAirPitch = _prevAirRoll = 0f;
            Input = default;
            Physics.SyncTransforms();
        }

        void FixedUpdate()
        {
            if (!_built) return;
            Simulate(Time.fixedDeltaTime);
        }

        /// <summary>
        /// One driving step: springs, then the planar model, then forces. Called from FixedUpdate;
        /// tests call it directly before Physics.Simulate so a bench runs thousands of steps per frame.
        /// </summary>
        public void Simulate(float dt)
        {
            var def = definition;
            var up = transform.up;
            // The car's own physics scene: the game's default one, or an isolated bench scene in tests.
            var physics = gameObject.scene.GetPhysicsScene();

            // ── Springs ───────────────────────────────────────────────────────
            var s0 = def.StaticCompression;
            var reach = def.travel + def.wheelRadius;
            var normalSum = Vector3.zero;
            var grounded = 0;
            var bestLoad = -1f;
            var bestWheel = -1;
            for (var i = 0; i < WheelCount; i++)
            {
                ref var w = ref _wheels[i];
                // The ray starts where the bump stop begins and ends where the spring is unloaded.
                var origin = transform.TransformPoint(w.local + Vector3.up * (def.travel - s0));
                w.grounded = false;
                w.load = 0f;
                w.compression = 0f;
                w.hitCollider = null;
                if (!physics.Raycast(origin, -up, out var hit, reach, groundMask, QueryTriggerInteraction.Ignore)) continue;
                if (hit.rigidbody == _rb) continue;
                var x = reach - hit.distance;
                var over = Mathf.Max(0f, x - def.travel);
                var pointVel = _rb.GetPointVelocity(hit.point);
                // Damping measures motion through the ground plane, not world vertical (legacy P21:
                // world vertical crushed the springs on climbs).
                var spring = w.stiffness * x + w.stiffness * def.bumpStopFactor * over - w.damping * Vector3.Dot(pointVel, hit.normal);
                var force = Mathf.Min(w.cap, Mathf.Max(0f, spring));
                _rb.AddForceAtPosition(hit.normal * force, hit.point, ForceMode.Force);
                w.grounded = true;
                w.compression = x;
                w.load = force;
                w.contact = hit.point;
                w.normal = hit.normal;
                w.hitCollider = hit.collider;
                w.hitTriangle = hit.triangleIndex;
                normalSum += hit.normal;
                grounded++;
                if (force > bestLoad)
                {
                    bestLoad = force;
                    bestWheel = i;
                }
            }

            var airborne = grounded == 0;
            var n = airborne ? up : normalSum.normalized;
            var fwd = Vector3.ProjectOnPlane(transform.forward, n).normalized;
            var right = Vector3.Cross(n, fwd);
            var v = _rb.linearVelocity;
            var surface = airborne ? Surface.Asphalt : SurfaceOf(_wheels[bestWheel]);

            var env = new PlanarEnv
            {
                vLong = Vector3.Dot(v, fwd),
                vLat = Vector3.Dot(v, right),
                surface = surface,
                circuit = 0f,
                waterDepth = 0f,
                airborne = airborne,
                support = airborne ? 0f : tuning.SlopeSupport(n.y),
                // What gravity actually does along forward once the springs carry the normal part.
                slopeAccel = airborne ? 0f : -ArcadeTuning.Gravity * fwd.y,
            };

            // The body owns the yaw rate: a wall hit may have changed it since the last step.
            var w0 = _rb.angularVelocity;
            _dyn.YawRate = Vector3.Dot(w0, n);
            var r = _dyn.Step(dt, Input, env);

            _rb.AddForce(fwd * r.accelLong + right * r.accelLat, ForceMode.Acceleration);
            var w1 = w0 + n * (r.yawRate - Vector3.Dot(w0, n));
            if (airborne)
            {
                // Air control adds to the momentum the car took off with instead of replacing it.
                w1 += transform.right * -(r.pitchRate - _prevAirPitch) + transform.forward * -(r.rollRate - _prevAirRoll);
            }
            _prevAirPitch = r.pitchRate;
            _prevAirRoll = r.rollRate;
            _rb.angularVelocity = w1;

            Telemetry = new VehicleTelemetry
            {
                speed = Mathf.Sqrt(env.vLong * env.vLong + env.vLat * env.vLat),
                forwardSpeed = env.vLong,
                lateralSpeed = env.vLat,
                slip = r.slip,
                drift = r.drift,
                skid = r.skid,
                wheelspin = r.wheelspin,
                boost = r.boost,
                boosting = r.boosting,
                steerAngle = r.steerAngle,
                yawRate = r.yawRate,
                airborne = airborne,
                groundedWheels = grounded,
                surface = surface,
                support = env.support,
                accelLong = r.accelLong,
                accelLat = r.accelLat,
                stunt = r.stunt,
                spin = r.spin,
                trick = r.trick,
            };
        }

        /// <summary>
        /// Surface under a wheel: road meshes carry asphalt in sub-mesh 0 and gravel in sub-mesh 1
        /// (RoadImporter); everything else that is not water counts as open ground.
        /// </summary>
        Surface SurfaceOf(in Wheel w)
        {
            var c = w.hitCollider;
            if (c == null) return Surface.Asphalt;
            if (c is TerrainCollider) return Surface.Terrain;
            if (c.gameObject.layer == WaterLayer) return Surface.Water;
            if (c is MeshCollider mc && mc.sharedMesh != null && mc.sharedMesh.subMeshCount > 1 && w.hitTriangle >= 0)
            {
                var gravel = mc.sharedMesh.GetSubMesh(1);
                var tri = w.hitTriangle * 3;
                return tri >= gravel.indexStart && tri < gravel.indexStart + gravel.indexCount ? Surface.Gravel : Surface.Asphalt;
            }
            return Surface.Asphalt;
        }

        static int _waterLayer = -2;
        static int WaterLayer => _waterLayer != -2 ? _waterLayer : _waterLayer = LayerMask.NameToLayer("Water");
    }

    /// <summary>Read-only state after the last physics step — HUD, camera, sound, effects, tests.</summary>
    public struct VehicleTelemetry
    {
        public float speed, forwardSpeed, lateralSpeed;
        public float slip, drift, skid, wheelspin;
        public float boost;
        public bool boosting;
        public float steerAngle, yawRate;
        public bool airborne;
        public int groundedWheels;
        public Surface surface;
        public float support;
        public float accelLong, accelLat;
        public float stunt, spin, trick;
    }
}
