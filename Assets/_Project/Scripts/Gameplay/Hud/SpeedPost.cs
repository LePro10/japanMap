using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// Speed you feel on the screen (owner 2026-10-17: "Schlieren und mehr Effekte, dass man die Geschwindigkeit fühlt"):
    /// a global volume on top of the look that blends in with speed — a little chromatic fringe and barrel distortion
    /// at the edges, a darker vignette, and on High a camera motion blur — and punches up in a nitro burst. The overrides
    /// live in an asset (Data/Look/SpeedVolume) so the build keeps their shader variants. Off with Reduced motion.
    /// </summary>
    public sealed class SpeedPost : MonoBehaviour
    {
        PlayerModeController _player;
        Volume _volume;
        MotionBlur _blur;
        float _weight;

        public float Weight => _weight;

        public void Bind(PlayerModeController player, VolumeProfile profile)
        {
            _player = player;
            if (profile == null) return;
            var go = new GameObject("SpeedVolume");
            go.transform.SetParent(transform, false);
            _volume = go.AddComponent<Volume>();
            _volume.isGlobal = true;
            _volume.priority = 50f;
            _volume.sharedProfile = profile;
            _volume.weight = 0f;
            profile.TryGet(out _blur);
        }

        void LateUpdate()
        {
            if (_volume == null) return;
            var car = _player != null && _player.Current == PlayerModeController.Mode.Driving ? _player.Car : null;
            var target = 0f;
            if (car != null && !_player.Suspended && !Core.GameOptions.ReducedMotion)
            {
                var t = car.Telemetry;
                // From about 90 km/h, full at 220; the burst adds its punch on top.
                target = Mathf.Clamp01(Mathf.InverseLerp(25f, 61f, t.speed)) * 0.75f + (t.boosting ? 0.1f : 0f) + t.burst * 0.5f;
            }
            var dt = Time.unscaledDeltaTime;
            _weight = target > _weight ? Mathf.MoveTowards(_weight, target, dt * 4f) : Mathf.MoveTowards(_weight, target, dt * 1.2f);
            _volume.weight = Mathf.Clamp01(_weight);
            // Motion blur only where the GPU has room (High); the rest keep the cheap uber-pass effects.
            if (_blur != null) _blur.active = Core.QualitySystem.Current == "High";
        }
    }
}
