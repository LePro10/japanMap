using Unity.Cinemachine;
using UnityEngine;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// While the pause menu is open the camera slowly circles the player's car (or the walker), framed right of the
    /// menu rail — the car is the hero of the pause screen, as in racing games, instead of a dimmed frozen frame
    /// (owner: the UI was "gottlos", 2026-10-13). Runs on unscaled time (the game is paused); hands the camera back to
    /// Cinemachine exactly where it was on close. Not in the garage (its own camera) or photo mode.
    /// </summary>
    public sealed class MenuCamera : MonoBehaviour
    {
        [SerializeField] GameMenu menu;
        [SerializeField] PlayerModeController player;
        [SerializeField] Garage.GarageSystem garage;
        [Tooltip("Orbit distance and height above the subject's centre, m (car; on foot × 0.45).")]
        [SerializeField] Vector2 orbit = new(7.6f, 1.6f);
        [Tooltip("Degrees per second around the subject.")]
        [SerializeField] float spin = 6f;
        [Tooltip("The subject sits this far right of the screen centre (share of the distance), clear of the rail.")]
        [SerializeField] float frameRight = 0.34f;
        [Tooltip("Seconds to glide from the game camera into the orbit.")]
        [SerializeField] float blend = 0.7f;

        CinemachineBrain _brain;
        bool _active;
        Vector3 _fromPos;
        Quaternion _fromRot;
        float _fov, _yaw, _t;

        public bool Active => _active;

        void OnEnable()
        {
            if (menu != null) menu.OpenChanged += OnMenu;
        }

        void OnDisable()
        {
            if (menu != null) menu.OpenChanged -= OnMenu;
            if (_active) Stop();
        }

        void OnMenu(bool open)
        {
            if (open && !_active && Wanted()) Begin();
            else if (!open && _active) Stop();
        }

        bool Wanted()
        {
            if (player == null || Camera.main == null) return false;
            if (garage != null && garage.IsOpen) return false;
            return Subject(out _, out _);
        }

        bool Subject(out Vector3 centre, out float scale)
        {
            centre = default;
            scale = 1f;
            if (player.Current == PlayerModeController.Mode.Driving && player.Car != null)
            {
                centre = player.Car.transform.position + Vector3.up * 0.7f;
                return true;
            }
            if (player.Walker != null && player.Walker.gameObject.activeInHierarchy)
            {
                centre = player.Walker.transform.position + Vector3.up * 0.9f;
                scale = 0.45f;
                return true;
            }
            return false;
        }

        void Begin()
        {
            var cam = Camera.main;
            _brain = cam.GetComponent<CinemachineBrain>();
            if (_brain != null) _brain.enabled = false;
            _fromPos = cam.transform.position;
            _fromRot = cam.transform.rotation;
            _fov = cam.fieldOfView;
            Subject(out var centre, out _);
            var away = _fromPos - centre;
            _yaw = Mathf.Atan2(away.x, away.z) * Mathf.Rad2Deg;
            _t = 0f;
            _active = true;
        }

        void Stop()
        {
            _active = false;
            var cam = Camera.main;
            if (cam != null)
            {
                cam.transform.SetPositionAndRotation(_fromPos, _fromRot);
                cam.fieldOfView = _fov;
            }
            if (_brain != null) _brain.enabled = true;
        }

        void LateUpdate()
        {
            if (!_active) return;
            var cam = Camera.main;
            // Garage or photo mode took over the menu: give the camera back.
            if (cam == null || (garage != null && garage.IsOpen) || !Subject(out var centre, out var scale)) { Stop(); return; }
            var dt = Time.unscaledDeltaTime;
            _t += dt;
            _yaw += spin * dt;
            var dist = orbit.x * scale;
            var rot = Quaternion.Euler(12f, _yaw + 180f, 0f);
            var pos = centre - rot * Vector3.forward * dist + Vector3.up * (orbit.y * scale - 0.7f * scale);
            // Keep the camera out of the ground and walls (a wall behind the car: come closer).
            if (Physics.Linecast(centre, pos, out var hit, Core.GameLayers.CameraObstacles, QueryTriggerInteraction.Ignore))
                pos = hit.point + (centre - pos).normalized * 0.4f;
            var right = rot * Vector3.right;
            // Look left of the subject so it sits right of centre, clear of the menu rail.
            var look = Quaternion.LookRotation(centre - right * (dist * frameRight) - pos, Vector3.up);
            var k = blend <= 0f ? 1f : Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(_t / blend));
            cam.transform.SetPositionAndRotation(Vector3.Lerp(_fromPos, pos, k), Quaternion.Slerp(_fromRot, look, k));
            cam.fieldOfView = Mathf.Lerp(_fov, 48f, k);
        }
    }
}
