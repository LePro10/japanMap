using JapanMap.Core;
using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>What the player wants this frame: move stick (x = right, y = forward), run, slide, jump.</summary>
    public struct WalkInput
    {
        public Vector2 move;
        public bool sprint;
        public bool slide;
        /// <summary>Edge: set on the frame the jump button went down, consumed by the motor.</summary>
        public bool jump;
    }

    /// <summary>
    /// The player's body on foot. Unity's CharacterController does collision, steps and slopes (D22);
    /// this adds the gait of the prototype on top: camera-relative walk/run with acceleration,
    /// coyote jump with buffer, and the Fortnite-like slide that keeps momentum and feeds on hills
    /// (behaviour of legacy Walker.ts, numbers in <see cref="WalkerSettings"/>).
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class WalkerMotor : MonoBehaviour
    {
        [SerializeField] WalkerSettings settings;

        CharacterController _cc;
        Vector3 _velocity; // horizontal part used, y kept separately in _vy
        float _vy, _coyote, _jumpBuffer, _slideTime, _airTime;
        Vector3 _normal = Vector3.up;
        Vector3 _wish;
        int _groundMask;

        /// <summary>Set by the input each frame; the motor clears the jump edge after using it.</summary>
        [System.NonSerialized] public WalkInput Input;
        /// <summary>Heading of the camera, degrees: "forward" on the stick is where the camera looks.</summary>
        public float CameraHeading;

        public WalkerSettings Settings => settings;
        public float Yaw { get; private set; }
        public bool Grounded { get; private set; } = true;
        public bool Jumping { get; private set; }
        public bool Sliding { get; private set; }
        public float Speed => new Vector2(_velocity.x, _velocity.z).magnitude;
        public Vector3 Velocity => new(_velocity.x, _vy, _velocity.z);
        public Vector3 GroundNormal => _normal;
        /// <summary>Distance walked, m — drives step bob and the stand-in's limbs.</summary>
        public float Cycle { get; private set; }
        /// <summary>0…1, how far the body leans into the run / slide.</summary>
        public float Lean { get; private set; }
        /// <summary>0…1, eased slide pose.</summary>
        public float SlideAmount { get; private set; }

        public void Configure(WalkerSettings s)
        {
            settings = s;
            ApplyShape(false);
        }

        void Awake()
        {
            _cc = GetComponent<CharacterController>();
            _groundMask = ~GameLayers.NotGround;
            if (GameLayers.Layer(GameLayers.Walker) >= 0) gameObject.layer = GameLayers.Layer(GameLayers.Walker);
            if (settings != null) ApplyShape(false);
        }

        void ApplyShape(bool crouched)
        {
            _cc ??= GetComponent<CharacterController>();
            var h = settings.height * (crouched ? settings.slideCrouch : 1f);
            _cc.height = h;
            _cc.radius = settings.radius;
            _cc.center = new Vector3(0f, h * 0.5f + _cc.skinWidth, 0f);
            _cc.stepOffset = Mathf.Min(settings.stepHeight, h - 2f * settings.radius);
            _cc.slopeLimit = settings.slopeLimit;
            _cc.minMoveDistance = 0f;
        }

        /// <summary>Stand at <paramref name="position"/> (feet) facing <paramref name="yawDegrees"/>, at rest.</summary>
        public void Place(Vector3 position, float yawDegrees)
        {
            _cc ??= GetComponent<CharacterController>();
            _cc.enabled = false;
            transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yawDegrees, 0f));
            _cc.enabled = true;
            Physics.SyncTransforms();
            Yaw = yawDegrees;
            _velocity = Vector3.zero;
            _vy = 0f;
            Grounded = true;
            Jumping = Sliding = false;
            _coyote = settings.coyote;
            _jumpBuffer = _slideTime = _airTime = 0f;
            Cycle = Lean = SlideAmount = 0f;
            Input = default;
            ApplyShape(false);
        }

        void Update()
        {
            if (Time.deltaTime > 0f) Step(Mathf.Min(Time.deltaTime, 0.05f));
        }

        /// <summary>One step. Called from Update; tests call it directly.</summary>
        public void Step(float dt)
        {
            var s = settings;
            var input = Input;
            Input.jump = false;

            var wishLen = Mathf.Min(1f, input.move.magnitude);
            var sprint = input.sprint && wishLen > 0.15f;
            var maxSpeed = sprint ? s.runSpeed : s.walkSpeed;
            var heading = Quaternion.Euler(0f, CameraHeading, 0f);
            _wish = heading * new Vector3(input.move.x, 0f, input.move.y);
            _wish.y = 0f;
            var wishMag = _wish.magnitude;
            _wish = wishMag > 1e-6f ? _wish / wishMag * (wishLen * maxSpeed) : Vector3.zero;

            _jumpBuffer = input.jump ? s.jumpBuffer : Mathf.Max(0f, _jumpBuffer - dt);
            _coyote = Grounded ? s.coyote : Mathf.Max(0f, _coyote - dt);
            if (_jumpBuffer > 0f && _coyote > 0f && !Jumping)
            {
                _vy = s.jumpSpeed;
                Grounded = false;
                Jumping = true;
                SetSliding(false);
                _jumpBuffer = _coyote = 0f;
            }

            SampleGround();
            UpdateSlide(dt, input.slide, wishMag);

            if (Sliding && Grounded) SlideMove(dt, wishMag);
            else
            {
                var accel = Grounded ? s.accel : s.accel * s.airControl;
                var brake = Grounded ? s.brake : s.brake * 0.15f;
                if (wishMag > 1e-6f)
                {
                    var k = Mathf.Min(1f, accel * dt);
                    _velocity.x += (_wish.x - _velocity.x) * k;
                    _velocity.z += (_wish.z - _velocity.z) * k;
                }
                else
                {
                    var damp = Mathf.Exp(-brake * dt);
                    _velocity.x *= damp;
                    _velocity.z *= damp;
                }
            }

            if (wishMag > 0.15f && !Sliding) TurnToward(Mathf.Atan2(_wish.x, _wish.z) * Mathf.Rad2Deg, dt, s.turnRate);
            else if (Sliding && Speed > 0.4f) TurnToward(Mathf.Atan2(_velocity.x, _velocity.z) * Mathf.Rad2Deg, dt, 14f);

            _vy -= s.gravity * dt;
            // Too steep to stand: slide off outwards instead of sticking to the face (legacy #confineTerrain).
            var steep = Grounded && _normal.y < Mathf.Cos(s.slopeLimit * Mathf.Deg2Rad);
            if (steep)
            {
                _velocity.x += _normal.x * 8f * dt;
                _velocity.z += _normal.z * 8f * dt;
            }

            var wasGrounded = Grounded;
            var move = new Vector3(_velocity.x, _vy, _velocity.z) * dt;
            // Follow the ground down slopes and kerbs instead of hopping off them.
            var stick = wasGrounded && !Jumping && _vy <= 0f;
            if (stick) move.y -= s.stepHeight;
            var before = transform.position;
            var flags = _cc.Move(move);
            var moved = transform.position - before;

            if ((flags & CollisionFlags.Sides) != 0 && dt > 0f)
            {
                // A wall took part of the step: keep only what was actually moved, so speed does not
                // pile up against it (and a release does not shoot the body off the wall).
                var actual = new Vector3(moved.x, 0f, moved.z) / dt;
                if (actual.sqrMagnitude < new Vector3(_velocity.x, 0f, _velocity.z).sqrMagnitude)
                {
                    _velocity.x = actual.x;
                    _velocity.z = actual.z;
                }
            }

            var below = (flags & CollisionFlags.Below) != 0;
            if (stick && !below)
            {
                // Nothing within a step below: we walked off an edge. Undo the stick, fall from here.
                _cc.Move(Vector3.up * s.stepHeight);
            }
            if (below)
            {
                if (_vy < 0f) _vy = 0f;
                Grounded = true;
                Jumping = false;
                _airTime = 0f;
            }
            else
            {
                Grounded = false;
                _airTime += dt;
                if (!Jumping && _airTime > 0.1f) SetSliding(false);
            }
            if ((flags & CollisionFlags.Above) != 0 && _vy > 0f) _vy = 0f;

            transform.rotation = Quaternion.Euler(0f, Yaw, 0f);

            var spd = Speed;
            Cycle += spd * dt;
            var targetLean = Sliding ? 1f : wishMag > 0.15f ? Mathf.Min(1f, spd / s.runSpeed) : 0f;
            Lean += (targetLean - Lean) * (1f - Mathf.Exp(-8f * dt));
            SlideAmount += ((Sliding ? 1f : 0f) - SlideAmount) * (1f - Mathf.Exp(-14f * dt));
        }

        void SampleGround()
        {
            var origin = transform.position + Vector3.up * 0.5f;
            _normal = Physics.Raycast(origin, Vector3.down, out var hit, 0.5f + settings.stepHeight + 0.2f, _groundMask, QueryTriggerInteraction.Ignore)
                ? hit.normal
                : Vector3.up;
        }

        void SetSliding(bool on)
        {
            if (Sliding == on) return;
            Sliding = on;
            _slideTime = 0f;
            ApplyShape(on);
        }

        // Entering and leaving the slide (legacy Walker.#updateSlide).
        void UpdateSlide(float dt, bool want, float wishMag)
        {
            var s = settings;
            var downhill = new Vector2(_normal.x, _normal.z);
            var tilt = downhill.magnitude;
            var down = tilt > 1e-5f ? downhill / tilt : Vector2.zero;
            var speed = Speed;
            var alongDown = speed > 0.4f ? (_velocity.x * down.x + _velocity.z * down.y) / speed : 0f;
            var goingDown = tilt > 0.14f && alongDown > 0.18f;

            if (Sliding)
            {
                _slideTime += dt;
                var tooSlow = speed < s.slideExitSpeed && _slideTime > s.slideMinTime && !goingDown;
                var released = !want && _slideTime > s.slideMinTime;
                if (tooSlow || released || _airTime > 0.1f) SetSliding(false);
                return;
            }
            if (!want || !Grounded) return;

            var canFlat = speed >= s.slideEnterSpeed;
            var canHill = goingDown || (tilt > 0.14f && wishMag > 0.15f && alongDown >= 0f);
            if (!canFlat && !canHill) return;

            SetSliding(true);
            if (speed < 0.4f && tilt > 0.14f)
            {
                var takeoff = s.slideEnterSpeed * 0.45f;
                _velocity.x = down.x * takeoff;
                _velocity.z = down.y * takeoff;
            }
            else if (speed > 0.4f)
            {
                var k = Mathf.Min(speed + s.slideBoost, s.slideMaxSpeed) / speed;
                _velocity.x *= k;
                _velocity.z *= k;
            }
        }

        // Momentum, hill and friction while sliding (legacy Walker.#slideMove).
        void SlideMove(float dt, float wishMag)
        {
            var s = settings;
            // Gravity feeds only the ground plane; y stays on the ground.
            _velocity.x += _normal.x * s.gravity * _normal.y * dt;
            _velocity.z += _normal.z * s.gravity * _normal.y * dt;

            var speed = Speed;
            var wishLen = new Vector2(_wish.x, _wish.z).magnitude;
            if (speed > 0.4f && wishMag > 0.15f && wishLen > 1e-6f)
            {
                var wx = _wish.x / wishLen;
                var wz = _wish.z / wishLen;
                var align = (_velocity.x * wx + _velocity.z * wz) / speed;
                if (align < -0.25f)
                {
                    // Pulling back brakes the slide instead of turning it round.
                    var slower = Mathf.Max(0f, speed - 6f * -align * dt);
                    _velocity.x *= slower / speed;
                    _velocity.z *= slower / speed;
                }
                else
                {
                    var blend = 1f - Mathf.Exp(-s.slideSteer * dt);
                    var dx = _velocity.x / speed + (wx - _velocity.x / speed) * blend;
                    var dz = _velocity.z / speed + (wz - _velocity.z / speed) * blend;
                    var len = Mathf.Sqrt(dx * dx + dz * dz);
                    if (len < 1e-6f) len = 1f;
                    _velocity.x = dx / len * speed;
                    _velocity.z = dz / len * speed;
                }
            }

            speed = Speed;
            var tilt = new Vector2(_normal.x, _normal.z).magnitude;
            var hill = 0f;
            if (tilt > 1e-5f && speed > 0.2f) hill = (_velocity.x * _normal.x + _velocity.z * _normal.z) / tilt / speed;
            var friction = s.slideFriction * (1f - s.slideHillRelief * Mathf.Max(0f, hill));
            if (hill < 0f) friction += s.slideUphillBrake * -hill;
            var next = Mathf.Min(Mathf.Max(0f, speed - friction * dt), s.slideMaxSpeed);
            if (speed > 1e-6f)
            {
                _velocity.x *= next / speed;
                _velocity.z *= next / speed;
            }
            else _velocity.x = _velocity.z = 0f;
        }

        void TurnToward(float target, float dt, float rate)
        {
            Yaw += Mathf.DeltaAngle(Yaw, target) * (1f - Mathf.Exp(-rate * dt));
        }

        /// <summary>An outside push (a car, a pedestrian), m/s, added to the walker's velocity.</summary>
        public void Push(Vector3 impulse)
        {
            _velocity.x += impulse.x;
            _velocity.z += impulse.z;
            if (impulse.y > 0f)
            {
                _vy = Mathf.Max(_vy, impulse.y);
                Grounded = false;
                Jumping = true;
            }
        }
    }
}
