using JapanMap.Core;
using Unity.Cinemachine;
using Unity.Cinemachine.TargetTracking;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Chase and cockpit cameras on Cinemachine. The chase camera follows a pivot this rig steers:
    /// the heading blends towards the direction of travel (a drift shows the car's flank, legacy
    /// CHASE_CAMERA.velocityBlend), the stick orbits and recentres, look-back turns it round.
    /// Cinemachine does the follow damping, the de-occlusion and the cut between the two modes.
    /// Built at runtime so the editor capture tools keep a plain Main Camera.
    /// </summary>
    [DefaultExecutionOrder(-50)]
    public sealed class CarCameraRig : MonoBehaviour
    {
        public enum Mode { Chase, Cockpit }

        [SerializeField] CarCameraSettings settings;
        [SerializeField] PlayerCarSpawner spawner;
        [SerializeField] DriverInput driver;

        VehicleController _car;
        Transform _pivot, _lookAt, _eye;
        CinemachineCamera _chase, _cockpit;
        CinemachineFollow _follow;
        float _heading, _orbit, _zoom = 1f, _fov;
        GameObject _hideInCockpit;
        bool _live = true;

        public Mode Current { get; private set; } = Mode.Chase;
        public CinemachineCamera Chase => _chase;

        void Awake()
        {
            var cam = Camera.main;
            if (cam != null && !cam.TryGetComponent<CinemachineBrain>(out var brain))
            {
                brain = cam.gameObject.AddComponent<CinemachineBrain>();
                brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.Cut, 0f);
            }

            _pivot = new GameObject("ChasePivot").transform;
            _pivot.SetParent(transform, false);
            _lookAt = new GameObject("ChaseLookAt").transform;
            _lookAt.SetParent(_pivot, false);

            _chase = new GameObject("ChaseCamera").AddComponent<CinemachineCamera>();
            _chase.transform.SetParent(transform, false);
            _chase.Follow = _pivot;
            _chase.LookAt = _lookAt;
            _follow = _chase.gameObject.AddComponent<CinemachineFollow>();
            _follow.TrackerSettings.BindingMode = BindingMode.LockToTargetWithWorldUp;
            _follow.TrackerSettings.PositionDamping = Vector3.one * settings.positionDamping;
            _follow.TrackerSettings.RotationDamping = Vector3.zero;
            _chase.gameObject.AddComponent<CinemachineHardLookAt>();
            var deocc = _chase.gameObject.AddComponent<CinemachineDeoccluder>();
            deocc.CollideAgainst = GameLayers.CameraObstacles;
            deocc.MinimumDistanceFromTarget = 1.5f;
            deocc.AvoidObstacles.Enabled = true;
            deocc.AvoidObstacles.CameraRadius = 0.3f;
            deocc.AvoidObstacles.Strategy = CinemachineDeoccluder.ObstacleAvoidance.ResolutionStrategy.PullCameraForward;
            _chase.Lens.FieldOfView = _fov = settings.fov;
            _chase.Lens.NearClipPlane = 0.3f;

            _cockpit = new GameObject("CockpitCamera").AddComponent<CinemachineCamera>();
            _cockpit.Lens.FieldOfView = settings.cockpitFov;
            _cockpit.Lens.NearClipPlane = settings.cockpitNear;
            _cockpit.gameObject.SetActive(false);

            if (spawner != null) spawner.Spawned += Attach;
            if (driver != null) driver.CameraPressed += Toggle;
        }

        void OnDestroy()
        {
            if (spawner != null) spawner.Spawned -= Attach;
            if (driver != null) driver.CameraPressed -= Toggle;
        }

        void Start()
        {
            if (spawner != null && spawner.Current != null) Attach(spawner.Current);
        }

        public void Attach(VehicleController car)
        {
            _car = car;
            _heading = Mathf.Atan2(car.transform.forward.x, car.transform.forward.z);
            _orbit = 0f;
            _eye = VehicleVisuals.FindPrefix(car.transform, "eye");
            var driverModel = VehicleVisuals.FindPrefix(car.transform, "driver");
            _hideInCockpit = driverModel != null ? driverModel.gameObject : null;
            _cockpit.transform.SetParent(_eye != null ? _eye : car.transform, false);
            _cockpit.transform.localPosition = _eye != null ? Vector3.zero : new Vector3(0f, 1.1f, 0f);
            UpdatePivot(0f, snap: true);
            _chase.PreviousStateIsValid = false;
            ApplyMode();
        }

        public void Toggle()
        {
            Current = Current == Mode.Chase ? Mode.Cockpit : Mode.Chase;
            ApplyMode();
        }

        /// <summary>Off while the player is on foot; on again snaps behind the car.</summary>
        public void SetLive(bool on)
        {
            _live = on;
            if (on && _car != null)
            {
                UpdatePivot(0f, snap: true);
                _chase.PreviousStateIsValid = false;
            }
            ApplyMode();
        }

        void ApplyMode()
        {
            var cockpit = Current == Mode.Cockpit;
            _cockpit.gameObject.SetActive(_live && cockpit);
            _chase.gameObject.SetActive(_live && !cockpit);
            if (_hideInCockpit != null) _hideInCockpit.SetActive(_live && !cockpit); // an empty seat while the player walks
        }

        void LateUpdate()
        {
            if (_car == null || !_live) return;
            UpdatePivot(Time.deltaTime, snap: false);
            UpdateCockpit();
        }

        void UpdatePivot(float dt, bool snap)
        {
            var s = settings;
            var t = _car.Telemetry;
            var carT = _car.transform;
            var nose = Mathf.Atan2(carT.forward.x, carT.forward.z);
            var v = _car.Body.linearVelocity;
            var target = nose;
            var flat = new Vector2(v.x, v.z);
            if (flat.magnitude > 1f && t.forwardSpeed > 0f)
            {
                // In a drift the camera swings towards where the car is going, not where it points.
                var travel = Mathf.Atan2(flat.x, flat.y);
                var blend = s.velocityBlend * Mathf.Clamp01(flat.magnitude / s.velocityBlendSpeed);
                target = nose + Mathf.DeltaAngle(nose * Mathf.Rad2Deg, travel * Mathf.Rad2Deg) * Mathf.Deg2Rad * blend;
            }
            _heading = snap ? target : _heading + Mathf.DeltaAngle(_heading * Mathf.Rad2Deg, target * Mathf.Rad2Deg) * Mathf.Deg2Rad * (1f - Mathf.Exp(-s.headingRate * dt));

            // Stick orbit, recentres when released. Look-back is a half turn on top.
            var look = driver != null ? driver.Look : Vector2.zero;
            if (Mathf.Abs(look.x) > 0.1f) _orbit += look.x * s.orbitSpeed * dt;
            else _orbit *= Mathf.Exp(-s.recenterRate * 4f * dt);
            var zoomInput = driver != null ? driver.Zoom : 0f;
            if (Mathf.Abs(zoomInput) > 0.01f) _zoom = Mathf.Clamp(_zoom * (1f - Mathf.Sign(zoomInput) * s.zoomStep), s.zoomMin, s.zoomMax);
            var back = driver != null && driver.LookBackHeld ? Mathf.PI : 0f;

            _pivot.SetPositionAndRotation(carT.position, Quaternion.Euler(0f, (_heading + _orbit + back) * Mathf.Rad2Deg, 0f));
            var speed = t.speed;
            var fast = Mathf.Clamp01(speed / s.fovSpeed);
            // Settings "chase distance" 4–8 m, default 6 (ASTRA): scales the whole offset around the data's own distance.
            var chase = Core.GameOptions.ChaseDistance / 6f;
            _follow.FollowOffset = new Vector3(0f, s.height, -(s.distance + s.distanceFast * fast)) * (_zoom * chase);
            var ahead = Mathf.Min(s.lookAheadMax, Mathf.Max(0f, t.forwardSpeed) * s.lookAhead);
            _lookAt.localPosition = new Vector3(0f, s.targetHeight, back > 0f ? -ahead : ahead);

            var fovTarget = Mathf.Lerp(s.fov, s.fovFast, fast) + (t.boosting ? s.fovBoost : 0f);
            _fov = snap ? fovTarget : _fov + (fovTarget - _fov) * (1f - Mathf.Exp(-s.fovRate * dt));
            _chase.Lens.FieldOfView = _fov;
        }

        void UpdateCockpit()
        {
            if (Current != Mode.Cockpit) return;
            var s = settings;
            var t = _car.Telemetry;
            // Turn the head into the slide so a drift stays readable from inside.
            var yaw = t.slip * s.cockpitDriftLook * Mathf.Rad2Deg;
            var back = driver != null && driver.LookBackHeld ? 180f : 0f;
            _cockpit.transform.rotation = _car.transform.rotation * Quaternion.Euler(-s.cockpitLookPitch * Mathf.Rad2Deg, yaw + back, 0f);
            _cockpit.Lens.FieldOfView = s.cockpitFov + (t.boosting ? s.cockpitFovBoost : 0f);
        }
    }
}
