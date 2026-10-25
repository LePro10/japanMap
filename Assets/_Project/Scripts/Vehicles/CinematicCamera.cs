using System;
using JapanMap.Core;
using Unity.Cinemachine;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// The camera of auto-drive (D49, "wie Forza Horizon 6"): cuts every 4–8 s between cockpit, nose, side tracking, low
    /// and high long-lens chases, a helicopter orbit, a camera at the roadside the car swishes past and a wheel close-up.
    /// One Cinemachine camera above the player's ones (no new render target, no extra camera); this script poses it. Every
    /// pose is checked before it is shown — never inside walls, terrain or water, the car in sight — and a shot that
    /// loses the car longer than a lamp post would hide it cuts to the next one. Weights, lenses and durations:
    /// <see cref="CinematicCameraSettings"/>.
    /// </summary>
    [DefaultExecutionOrder(-40)] // after CarCameraRig, before the CinemachineBrain reads the pose
    public sealed class CinematicCamera : MonoBehaviour
    {
        CinematicCameraSettings _s;
        CinemachineCamera _cam;
        VehicleController _car;
        Func<float, Vector3> _ahead;
        Transform _eye;
        Action<bool> _showDriver;
        int _shot = -1, _last = -1, _beforeLast = -1;
        float _shotTime, _shotLength, _blocked, _yaw, _side = 1f, _orbit, _seed, _anchorY;
        Vector3 _local, _roadside, _roadDir, _aim;
        bool _showing;
        readonly System.Random _rng = new();

        /// <summary>The car drives itself and the cinematic camera owns the picture (or would, see <see cref="Showing"/>).</summary>
        public bool Running { get; private set; }
        /// <summary>The cinematic picture is on screen (the camera button switches to the player's camera and back).</summary>
        public bool Showing => Running && _showing;
        public CineShot Current => _shot >= 0 ? _s.shots[_shot].kind : CineShot.Cockpit;
        /// <summary>Cuts since <see cref="Begin"/> (tests, diagnostics).</summary>
        public int Cuts { get; private set; }
        /// <summary>Raised on every cut with the new shot.</summary>
        public event Action<CineShot> Cut;
        /// <summary>The car's seat correction from its cockpit data (D51): the cockpit shot sits where the player's cockpit view sits.</summary>
        public Vector3 EyeOffset { get; set; }

        /// <summary>The posed Cinemachine camera (tests, pictures).</summary>
        public Transform CameraTransform => _cam != null ? _cam.transform : null;

        public void Init(CinematicCameraSettings settings, LensSettings lens, Action<bool> showDriver)
        {
            _s = settings;
            _showDriver = showDriver;
            _cam = new GameObject("CinematicCamera").AddComponent<CinemachineCamera>();
            _cam.transform.SetParent(transform, false);
            _cam.Lens = lens;
            _cam.Lens.NearClipPlane = 0.1f;
            _cam.Priority = 50; // above chase and cockpit: the brain picks it while it is enabled
            _cam.gameObject.SetActive(false);
        }

        /// <summary>Starts cutting around <paramref name="car"/>; <paramref name="ahead"/> gives route points ahead (m → world) for roadside shots.</summary>
        public void Begin(VehicleController car, Func<float, Vector3> ahead)
        {
            if (_s == null || car == null) return;
            _car = car;
            _ahead = ahead;
            _eye = VehicleVisuals.FindPrefix(car.transform, "eye");
            Running = true;
            _showing = true;
            Cuts = 0;
            _last = _beforeLast = -1;
            _yaw = Yaw(car.transform.forward);
            var first = Array.FindIndex(_s.shots, x => x.kind == _s.firstShot);
            if (first < 0 || !TryStart(first)) Next();
            Apply();
        }

        public void End()
        {
            if (!Running) return;
            Running = false;
            _shot = -1;
            Apply();
        }

        /// <summary>The camera button while driving itself: the player's camera and back.</summary>
        public void ToggleShowing()
        {
            if (!Running) return;
            _showing = !_showing;
            if (_showing) Next();
            Apply();
        }

        void Apply()
        {
            var on = Showing;
            if (_cam != null && _cam.gameObject.activeSelf != on) _cam.gameObject.SetActive(on);
            _showDriver?.Invoke(!(on && Current == CineShot.Cockpit));
        }

        void LateUpdate()
        {
            if (!Showing) return;
            if (_car == null) { End(); return; }
            var dt = Time.deltaTime;
            if (dt <= 0f) return;
            _shotTime += dt;
            _seed += dt * _s.handheldFrequency;
            _yaw = Mathf.LerpAngle(_yaw, Yaw(Heading()), 1f - Mathf.Exp(-3f * dt));

            var done = _shotTime >= _shotLength;
            if (!done && _s.shots[_shot].kind == CineShot.Roadside)
                done = Vector3.Dot(_car.transform.position - _roadside, _roadDir) > _s.roadsidePassed;
            if (done) { Next(); return; }

            Pose(_shot, dt, out var pos, out var rot);
            if (!Inside(pos) && Sees(pos)) _blocked = 0f;
            else _blocked += dt;
            // In a wall: never shown. Lost sight: a moment's grace (a post, a tree trunk), then cut.
            if (Inside(pos) || _blocked > _s.occlusionGrace) { Next(); return; }
            Show(pos, rot);
        }

        void Show(Vector3 pos, Quaternion rot)
        {
            var s = _s.shots[_shot];
            var k = Mathf.Clamp01(_shotTime / Mathf.Max(0.1f, _shotLength));
            var fov = Mathf.Lerp(s.fov.x, s.fov.y, k * k * (3f - 2f * k));
            // Roadside: the camera stands 60–100 m ahead, so a fixed 34° lens showed a dot for most of the shot; the
            // lens zooms with the distance instead and opens to the shot's wide end as the car swishes past.
            if (s.kind == CineShot.Roadside && _s.roadsideFill > 0f)
                fov = Mathf.Clamp(FramingFov(Vector3.Distance(pos, Focus()), _s.roadsideSubject, _s.roadsideFill), _s.roadsideMinFov, Mathf.Max(s.fov.x, s.fov.y));
            _cam.Lens.FieldOfView = Fit(fov);
            _cam.Lens.NearClipPlane = s.kind == CineShot.Cockpit ? 0.06f : 0.2f;
            // Handheld: slow sway in yaw, pitch and a little roll — less on a long lens, where the same degrees shake the
            // whole frame.
            var h = s.handheld * GameOptions.CameraShake * Mathf.Min(1f, fov / Mathf.Max(1f, s.fov.x));
            var sway = Quaternion.Euler((Mathf.PerlinNoise(_seed, 1.7f) - 0.5f) * 2f * h, (Mathf.PerlinNoise(3.1f, _seed) - 0.5f) * 2f * h, (Mathf.PerlinNoise(_seed * 0.7f, 5.3f) - 0.5f) * h);
            _cam.transform.SetPositionAndRotation(pos, rot * sway);
        }

        /// <summary>Vertical fov, degrees, in which <paramref name="subject"/> m at <paramref name="distance"/> m fills <paramref name="fill"/> of the frame height.</summary>
        public static float FramingFov(float distance, float subject, float fill) =>
            2f * Mathf.Atan(subject / (2f * Mathf.Max(0.1f, distance) * Mathf.Max(0.01f, fill))) * Mathf.Rad2Deg;

        /// <summary>Cuts to a shot of this kind now if its pose is clear (pictures, tests); false if not possible here.</summary>
        public bool Force(CineShot kind)
        {
            if (!Running) return false;
            var i = Array.FindIndex(_s.shots, x => x.kind == kind);
            return i >= 0 && TryStart(i);
        }

        /// <summary>
        /// The shot list's lenses are vertical FOV on 16:9. A narrower screen (a phone upright) keeps most of the width
        /// instead of the height — otherwise a 34° tracking shot became a close-up of a tree.
        /// </summary>
        static float Fit(float fov)
        {
            var cam = Camera.main;
            var aspect = cam != null ? cam.aspect : 16f / 9f;
            if (aspect >= 16f / 9f - 0.01f) return fov;
            var halfH = Mathf.Atan(Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) * (16f / 9f));
            var keepWidth = 2f * Mathf.Atan(Mathf.Tan(halfH) / aspect) * Mathf.Rad2Deg;
            return Mathf.Min(100f, Mathf.Lerp(fov, keepWidth, 0.75f));
        }

        /// <summary>Picks the next shot: weighted, not one of the last two, and only where its first pose is clear.</summary>
        void Next()
        {
            for (var attempt = 0; attempt < 10; attempt++)
            {
                var pick = Pick(attempt >= 6);
                if (pick >= 0 && TryStart(pick)) return;
            }
            // Always possible: the driver's seat.
            TryStart(Mathf.Max(0, Array.FindIndex(_s.shots, x => x.kind == CineShot.Cockpit)), force: true);
        }

        int Pick(bool allowRepeat)
        {
            var total = 0f;
            for (var i = 0; i < _s.shots.Length; i++) if (Eligible(i, allowRepeat)) total += _s.shots[i].weight;
            if (total <= 0f) return -1;
            var r = (float)_rng.NextDouble() * total;
            for (var i = 0; i < _s.shots.Length; i++)
            {
                if (!Eligible(i, allowRepeat)) continue;
                r -= _s.shots[i].weight;
                if (r <= 0f) return i;
            }
            return -1;
        }

        bool Eligible(int i, bool allowRepeat)
        {
            var s = _s.shots[i];
            if (s.weight <= 0f) return false;
            if (!allowRepeat && (i == _shot || i == _last || i == _beforeLast)) return false;
            if (s.kind == CineShot.Roadside && _ahead == null) return false;
            return true;
        }

        bool TryStart(int i, bool force = false)
        {
            var s = _s.shots[i];
            var prevShot = _shot;
            _shot = i;
            _side = s.randomSide && _rng.NextDouble() < 0.5 ? -1f : 1f;
            _shotTime = 0f;
            _blocked = 0f;
            _shotLength = Mathf.Lerp(s.seconds.x, s.seconds.y, (float)_rng.NextDouble());
            _orbit = 0f;
            _anchorY = _car.transform.position.y;
            _local = Mirror(s.offset);
            _aim = Focus();
            if (s.kind == CineShot.Roadside && !PlaceRoadside(s)) { _shot = prevShot; return false; }
            Pose(i, 0f, out var pos, out var rot);
            if (!force && (Inside(pos) || !Sees(pos))) { _shot = prevShot; return false; }
            if (prevShot != i) { _beforeLast = _last; _last = prevShot; }
            Cuts++;
            _cam.PreviousStateIsValid = false; // a hard cut: no damping from the last shot
            Show(pos, rot);
            Apply();
            Cut?.Invoke(s.kind);
            return true;
        }

        /// <summary>Roadside: a spot beside the route ahead with a clear view along the road the car will come down.</summary>
        bool PlaceRoadside(CinematicCameraSettings.Shot s)
        {
            var d = s.offset.z * Mathf.Lerp(0.8f, 1.2f, (float)_rng.NextDouble()) + _car.Telemetry.speed * 1.2f;
            var p = _ahead(d);
            var dir = _ahead(d + 3f) - _ahead(d - 3f);
            dir.y = 0f;
            if (dir.sqrMagnitude < 0.01f) return false;
            _roadDir = dir.normalized;
            var right = new Vector3(_roadDir.z, 0f, -_roadDir.x);
            var at = p + right * (s.offset.x * _side);
            at.y = Ground(at, p.y) + s.offset.y;
            _roadside = at;
            // The car must be visible on its way in: from here, from halfway and from just before the camera.
            return !Inside(at) && Clear(at, _ahead(d * 0.5f) + Vector3.up) && Clear(at, _ahead(Mathf.Max(0f, d - 10f)) + Vector3.up);
        }

        void Pose(int i, float dt, out Vector3 pos, out Quaternion rot)
        {
            var s = _s.shots[i];
            var car = _car.transform;
            var frame = Quaternion.Euler(0f, _yaw, 0f);
            // Off-car shots hang from an anchor whose height is smoothed: a bump shakes the car, not the crane.
            if (dt > 0f) _anchorY = Mathf.Lerp(_anchorY, car.position.y, 1f - Mathf.Exp(-4f * dt));
            var anchor = new Vector3(car.position.x, _anchorY, car.position.z);
            var focus = Focus();
            var lead = Mathf.Clamp(_car.Telemetry.forwardSpeed, 0f, 60f);
            switch (s.kind)
            {
                case CineShot.Cockpit:
                    pos = (_eye != null ? _eye.position : car.TransformPoint(new Vector3(-0.35f, 1.1f, 0f))) + car.rotation * EyeOffset;
                    rot = car.rotation * Quaternion.Euler(4f, 0f, 0f);
                    return;
                case CineShot.Wheel:
                    pos = car.TransformPoint(_local);
                    rot = Quaternion.LookRotation(car.TransformPoint(new Vector3(_local.x * 0.8f, 0.45f, 14f)) - pos, car.up);
                    return;
                case CineShot.Roadside:
                    pos = _roadside;
                    _aim = Vector3.Lerp(_aim, focus + _car.Body.linearVelocity * 0.08f, dt <= 0f ? 1f : 1f - Mathf.Exp(-9f * dt));
                    rot = Quaternion.LookRotation(_aim - pos, Vector3.up);
                    return;
                case CineShot.Helicopter:
                    _orbit += _s.orbitSpeed * dt * _side;
                    var o = Quaternion.Euler(0f, _orbit, 0f) * new Vector3(_local.x, 0f, _local.z);
                    pos = anchor + frame * o + Vector3.up * s.offset.y;
                    break;
                default:
                    pos = anchor + frame * _local;
                    break;
            }
            // Ground and lead: tracking shots aim a little ahead of the car so it drives into the frame.
            pos.y = Mathf.Max(pos.y, Ground(pos, pos.y) + _s.minGroundHeight);
            var leadAim = focus + car.forward * (lead * (s.kind == CineShot.Nose ? 0f : 0.05f));
            _aim = dt <= 0f ? leadAim : Vector3.Lerp(_aim, leadAim, 1f - Mathf.Exp(-(s.damping > 0f ? 1f / s.damping : 30f) * 2f * dt));
            rot = Quaternion.LookRotation(_aim - pos, Vector3.up);
        }

        Vector3 Mirror(Vector3 v) => new(v.x * _side, v.y, v.z);
        Vector3 Focus() => _car.transform.position + Vector3.up * _s.aimHeight;

        Vector3 Heading()
        {
            var v = _car.Body.linearVelocity;
            v.y = 0f;
            return v.sqrMagnitude > 4f ? v : _car.transform.forward;
        }

        static float Yaw(Vector3 f) => Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg;

        // ── clear of the world ─────────────────────────────────────────────────

        static int Obstacles => GameLayers.CameraObstacles;
        static int GroundMask => GameLayers.CameraObstacles | LayerMask.GetMask("Water");

        /// <summary>Inside a wall, a building, the terrain or under water.</summary>
        bool Inside(Vector3 p)
        {
            if (Current == CineShot.Cockpit && _shot >= 0) return false; // in the car's own (vehicle-layer) cabin
            if (Physics.CheckSphere(p, _s.clearance, Obstacles, QueryTriggerInteraction.Ignore)) return true;
            // Below the ground or the water surface right above/below.
            return Physics.Raycast(p + Vector3.up * 40f, Vector3.down, out var hit, 40f, GroundMask, QueryTriggerInteraction.Ignore) && hit.point.y > p.y - 0.05f;
        }

        bool Sees(Vector3 p) => Current == CineShot.Cockpit || Clear(p, Focus());

        bool Clear(Vector3 from, Vector3 to) => !Physics.Linecast(from, to, Obstacles, QueryTriggerInteraction.Ignore);

        static float Ground(Vector3 p, float fallback) =>
            Physics.Raycast(p + Vector3.up * 30f, Vector3.down, out var hit, 80f, GroundMask, QueryTriggerInteraction.Ignore) ? hit.point.y : fallback;

        /// <summary>For tests: is the shown camera pose clear of the world and does it see the car?</summary>
        public bool PoseIsClear(out bool sees)
        {
            sees = true;
            if (!Showing || _cam == null) return true;
            var p = _cam.transform.position;
            sees = Sees(p);
            return !Inside(p);
        }
    }
}
