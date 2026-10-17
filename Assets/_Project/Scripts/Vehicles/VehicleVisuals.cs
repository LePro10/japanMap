using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Moves the car-lab model (node layout: ArtSource/cars/README.legacy.md): wheels spin, steer and
    /// follow their springs, the body (body_root) rolls and pitches with the accelerations — that roll
    /// is visual only, as in the prototype (physics keeps a low centre of mass, D15).
    /// </summary>
    public sealed class VehicleVisuals : MonoBehaviour
    {
        static readonly string[] WheelNames = { "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR" };

        VehicleController _car;
        Transform _body;
        Quaternion _bodyRest;
        readonly Transform[] _wheel = new Transform[4];
        readonly Transform[] _spin = new Transform[4];
        readonly Vector3[] _wheelRest = new Vector3[4];
        readonly float[] _spinAngle = new float[4];
        readonly float[] _wobble = new float[4];
        readonly bool[] _detached = new bool[4];
        readonly Transform[] _wheelParent = new Transform[4];
        readonly Quaternion[] _wheelRestRot = new Quaternion[4];
        float _roll, _pitch;

        public Transform BodyRoot => _body;
        public Transform Wheel(int i) => _wheel[i];

        /// <summary>A bent wheel wobbles as it turns (degrees of tilt, 0 = true).</summary>
        public void SetWobble(int i, float degrees) => _wobble[i] = degrees;

        /// <summary>The wheel leaves the car (D47): its node stops following the spring; the caller re-parents it.</summary>
        public Transform Detach(int i)
        {
            if (_wheel[i] == null || _detached[i]) return null;
            _detached[i] = true;
            return _wheel[i];
        }

        /// <summary>Back on its hub, as modelled.</summary>
        public void Reattach(int i)
        {
            if (_wheel[i] == null) return;
            _detached[i] = false;
            _wobble[i] = 0f;
            _wheel[i].SetParent(_wheelParent[i], false);
            _wheel[i].localPosition = _wheelRest[i];
            _wheel[i].localRotation = _wheelRestRot[i];
        }

        public void Bind(VehicleController car, Transform model)
        {
            _car = car;
            foreach (var t in model.GetComponentsInChildren<Transform>(true))
                if (IsTuningOption(t)) t.gameObject.SetActive(false);
            _body = Find(model, "body_root");
            if (_body != null) _bodyRest = _body.localRotation;
            for (var i = 0; i < 4; i++)
            {
                _wheel[i] = Find(model, WheelNames[i]);
                if (_wheel[i] == null) continue;
                _wheelRest[i] = _wheel[i].localPosition;
                _wheelRestRot[i] = _wheel[i].localRotation;
                _wheelParent[i] = _wheel[i].parent;
                _spin[i] = Find(_wheel[i], "spin_" + WheelNames[i].Substring(6));
            }
        }

        static Transform Find(Transform root, string name) => FindPrefix(root, name);

        /// <summary>Node by name, ignoring Blender's ".002" duplicate suffix.</summary>
        public static Transform FindPrefix(Transform root, string name)
        {
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
                if (t.name == name || t.name.StartsWith(name + ".")) return t;
            return null;
        }

        /// <summary>Car-lab tuning slots: option 0 is the stock part, _o1/_o2 are upgrades.</summary>
        public static bool IsTuningOption(Transform t) => t.name.EndsWith("_o1") || t.name.EndsWith("_o2");

        void LateUpdate()
        {
            if (_car == null) return;
            var def = _car.Definition;
            var t = _car.Telemetry;
            var dt = Time.deltaTime;
            var s0 = def.StaticCompression;

            for (var i = 0; i < 4; i++)
            {
                if (_wheel[i] == null || _detached[i]) continue;
                var w = _car.Wheels[i];
                // Spring travel relative to the static ride height; a wheel in the air hangs down.
                var lift = w.grounded ? Mathf.Clamp(w.compression - s0, -def.travel, def.travel) : -s0;
                _wheel[i].localPosition = _wheelRest[i] + Vector3.up * lift;
                var steer = i < 2 ? Quaternion.Euler(0f, t.steerAngle * Mathf.Rad2Deg, 0f) : Quaternion.identity;
                if (_spin[i] != null)
                {
                    // Handbrake locks the rear wheels.
                    var locked = i >= 2 && _car.Input.handbrake;
                    if (!locked) _spinAngle[i] += t.forwardSpeed / def.wheelRadius * Mathf.Rad2Deg * dt;
                    _spin[i].localRotation = Quaternion.Euler(_spinAngle[i] % 360f, 0f, 0f);
                }
                // A bent rim: the wheel plane tilts about an axis that turns with the wheel — it wobbles.
                if (_wobble[i] > 0f)
                {
                    var a = _spinAngle[i] * Mathf.Deg2Rad;
                    steer *= Quaternion.AngleAxis(_wobble[i], new Vector3(0f, Mathf.Cos(a), Mathf.Sin(a)));
                }
                _wheel[i].localRotation = steer;
            }

            if (_body != null)
            {
                // Lean out of the bend and squat/dive with the throttle and brake (legacy attitude model).
                var g = ArcadeTuning.Gravity;
                var rollTarget = t.airborne ? 0f : Mathf.Clamp(t.accelLat / g * def.rollPerLateralG, -0.16f, 0.16f);
                var pitchTarget = t.airborne ? 0f : Mathf.Clamp(-t.accelLong / g * def.pitchPerLongitudinalG, -0.13f, 0.13f);
                var k = 1f - Mathf.Exp(-7f * dt);
                _roll += (rollTarget - _roll) * k;
                _pitch += (pitchTarget - _pitch) * k;
                _body.localRotation = _bodyRest * Quaternion.Euler(_pitch * Mathf.Rad2Deg, 0f, _roll * Mathf.Rad2Deg);
            }
        }
    }
}
