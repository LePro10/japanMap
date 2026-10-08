using JapanMap.Core;
using Unity.Cinemachine;
using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// Third-person camera on foot, on Cinemachine's ThirdPersonFollow (it does the arm, the damping
    /// and pulling in at walls). This rig only steers the pivot: mouse / stick / touch turn it, the
    /// walker's step bob and slide dip move it (legacy WalkCamera.ts). The camera heading is handed
    /// to the motor, so "forward" is always where the camera looks.
    /// </summary>
    [DefaultExecutionOrder(-50)]
    public sealed class WalkCameraRig : MonoBehaviour
    {
        [SerializeField] WalkCameraSettings settings;
        [SerializeField] WalkerMotor motor;
        [SerializeField] WalkerInput input;

        Transform _pivot;
        CinemachineCamera _cam;
        CinemachineThirdPersonFollow _follow;
        float _yaw, _pitch, _zoom = 1f;
        bool _live;

        public CinemachineCamera Camera => _cam;
        public float Yaw => _yaw;
        public float Pitch => _pitch;
        public bool Live => _live;

        public void Bind(WalkerMotor m, WalkerInput i)
        {
            motor = m;
            input = i;
        }

        void Awake()
        {
            var main = UnityEngine.Camera.main;
            if (main != null && !main.TryGetComponent<CinemachineBrain>(out _))
            {
                var brain = main.gameObject.AddComponent<CinemachineBrain>();
                brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.Cut, 0f);
            }

            _pivot = new GameObject("WalkPivot").transform;
            _pivot.SetParent(transform, false);
            _cam = new GameObject("WalkCamera").AddComponent<CinemachineCamera>();
            _cam.transform.SetParent(transform, false);
            _cam.Follow = _pivot;
            _follow = _cam.gameObject.AddComponent<CinemachineThirdPersonFollow>();
            _follow.CameraSide = 0.5f;
            _follow.VerticalArmLength = 0f;
            _follow.ShoulderOffset = new Vector3(0f, settings.height - settings.targetHeight, 0f);
            _follow.Damping = Vector3.one * settings.damping;
            _follow.AvoidObstacles.Enabled = true;
            _follow.AvoidObstacles.CollisionFilter = GameLayers.CameraObstacles;
            _follow.AvoidObstacles.CameraRadius = settings.collisionRadius;
            _follow.AvoidObstacles.DampingIntoCollision = 0f;
            _follow.AvoidObstacles.DampingFromCollision = 0.4f;
            _cam.gameObject.AddComponent<CinemachineRotateWithFollowTarget>();
            _cam.Lens.FieldOfView = settings.fov;
            _cam.Lens.NearClipPlane = settings.near;
            _cam.gameObject.SetActive(false);
        }

        /// <summary>Turn the camera on (behind the walker) or off.</summary>
        public void SetLive(bool on)
        {
            _live = on;
            if (on && motor != null)
            {
                _yaw = motor.Yaw;
                _pitch = settings.pitchStart;
                UpdatePivot(0f);
                _cam.PreviousStateIsValid = false;
            }
            _cam.gameObject.SetActive(on);
        }

        void LateUpdate()
        {
            if (!_live || motor == null) return;
            UpdatePivot(Time.deltaTime);
        }

        void UpdatePivot(float dt)
        {
            var s = settings;
            if (input != null)
            {
                var look = input.MouseLook * s.mouseSensitivity + input.TouchLook * s.mouseSensitivity
                           + input.StickLook * (s.stickSpeed * dt);
                _yaw += look.x;
                _pitch = Mathf.Clamp(_pitch + look.y, s.pitchMin, s.pitchMax);
                var z = input.Zoom;
                if (Mathf.Abs(z) > 0.01f) _zoom = Mathf.Clamp(_zoom * (1f - Mathf.Sign(z) * s.zoomStep), s.zoomMin, s.zoomMax);
            }
            motor.CameraHeading = _yaw;

            // Step bob scales with speed; the slide drops the eye with the hips.
            var gait = Mathf.Clamp01(motor.Speed / motor.Settings.walkSpeed) * (motor.Grounded && !motor.Sliding ? 1f : 0f);
            var bob = Mathf.Sin(motor.Cycle * s.bobFreq) * s.bob * gait;
            var dip = s.slideDip * motor.SlideAmount;
            var p = motor.transform.position + Vector3.up * (s.targetHeight + bob - dip);
            // Pitch positive = looking up; Unity's X rotation is positive down.
            _pivot.SetPositionAndRotation(p, Quaternion.Euler(-_pitch, _yaw, 0f));
            _follow.CameraDistance = s.distance * _zoom;
        }
    }
}
