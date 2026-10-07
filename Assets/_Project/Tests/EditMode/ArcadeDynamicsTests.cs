using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>The pure planar model, no physics: fast checks of the port itself.</summary>
    public class ArcadeDynamicsTests
    {
        static ArcadeTuning Tuning => ScriptableObject.CreateInstance<ArcadeTuning>();

        static ArcadeDynamics Model() => new(new ArcadeSpec(), Tuning, 0.7f);

        static PlanarEnv Flat(float vLong, float vLat = 0f) =>
            new() { vLong = vLong, vLat = vLat, surface = Surface.Asphalt, support = 1f };

        [Test]
        public void Steering_IsMirrorSymmetric_AndRightIsPositiveYaw()
        {
            var right = Model();
            var left = Model();
            PlanarResult r = default, l = default;
            for (var i = 0; i < 60; i++)
            {
                r = right.Step(0.02f, new DriveInput { throttle = 0.5f, steer = 0.6f }, Flat(20f));
                l = left.Step(0.02f, new DriveInput { throttle = 0.5f, steer = -0.6f }, Flat(20f));
            }
            Assert.That(r.yawRate, Is.GreaterThan(0.1f), "steering right must turn right (Unity: positive yaw)");
            Assert.That(l.yawRate, Is.EqualTo(-r.yawRate).Within(1e-5f));
            Assert.That(r.steerAngle, Is.GreaterThan(0f));
        }

        [Test]
        public void LateralSpeed_IsPulledTowardsZero_WhenGripping()
        {
            var m = Model();
            var r = m.Step(0.02f, default, Flat(20f, 1f));
            Assert.That(r.accelLat, Is.LessThan(0f), "slide to the right must be caught by a force to the left");
        }

        [Test]
        public void BrakeAtStandstill_EngagesReverse_UnlessHandbrakeHeld()
        {
            var m = Model();
            for (var i = 0; i < 10; i++) m.Step(0.02f, new DriveInput { brake = 1f }, Flat(0f));
            var reverse = m.Step(0.02f, new DriveInput { brake = 1f }, Flat(0f));
            Assert.That(reverse.accelLong, Is.LessThan(-1f));
            var hold = Model().Step(0.02f, new DriveInput { brake = 1f, handbrake = true }, Flat(0f));
            Assert.That(hold.accelLong, Is.EqualTo(0f).Within(1e-4f));
        }

        [Test]
        public void TopSpeed_FollowsFromPowerAndDrag_LikeLegacyCar()
        {
            // legacy car(): drag = (P/v − m·rollDecel)/v², so the top speed is v by construction.
            var spec = new ArcadeSpec { power = 135000f };
            var v = 205f / 3.6f;
            spec.drag = (spec.power / v - 1180f * spec.rollDecel) / (v * v);
            Assert.That(spec.TopSpeed(1180f) * 3.6f, Is.EqualTo(205f).Within(0.1f));
        }

        [Test]
        public void StuntDoubleTap_WindowIsInclusive()
        {
            var t = Tuning;
            Assert.IsFalse(t.IsStuntDoubleTap(-1f, 0f));
            Assert.IsTrue(t.IsStuntDoubleTap(0f, t.stuntTapWindow));
            Assert.IsFalse(t.IsStuntDoubleTap(0f, t.stuntTapWindow + 0.001f));
        }
    }
}
