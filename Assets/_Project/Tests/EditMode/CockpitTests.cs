using System.Linq;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// The cockpit per car (D51): every car has its seat; from that seat the road shows over the bonnet and the point 15 m
    /// ahead is not hidden by the car (rays against the model's triangles); the head looks into a drift, leans with the
    /// forces, and "Camera shake" off means no shake at all; a phone held upright keeps a wide enough view.
    /// </summary>
    public class CockpitTests
    {
        static CarCameraSettings Camera => AssetDatabase.LoadAssetAtPath<CarCameraSettings>(AssetDatabase.GUIDToAssetPath(AssetDatabase.FindAssets("t:CarCameraSettings").First()));
        static VehicleFleet Fleet => AssetDatabase.LoadAssetAtPath<VehicleFleet>(AssetDatabase.GUIDToAssetPath(AssetDatabase.FindAssets("t:VehicleFleet").First()));

        [Test]
        public void EveryCar_HasItsOwnSeat_AndTheFormulaCarItsYoke()
        {
            var cockpits = Camera.cockpits;
            Assert.NotNull(cockpits, "the car camera links the cockpit settings");
            foreach (var car in Fleet.vehicles)
            {
                var spec = cockpits.For(car.id);
                Assert.AreEqual(car.id, spec.carId, $"{car.id} has an entry, not the fallback");
                Assert.That(spec.fov, Is.InRange(45f, 70f), $"{car.id} field of view");
                Assert.That(spec.pitch, Is.InRange(-2f, 8f), $"{car.id} look down");
            }
            var formula = Fleet.vehicles.First(v => v.category == VehicleCategory.Track && v.id == "hanami");
            var f = cockpits.For(formula.id);
            Assert.AreEqual(CockpitWheel.Formula, f.wheel, "a formula yoke");
            Assert.AreEqual(CockpitCluster.OnWheel, f.cluster, "with its display on the wheel");
            Assert.Less(f.eyeOffset.y, -0.1f, "sitting low (the model's eye is above the helmet)");
            Assert.That(f.wheelMax, Is.LessThanOrEqualTo(90f), "a formula wheel barely turns");
            var road = Fleet.vehicles.Where(v => v.id != "hanami").Select(v => cockpits.For(v.id)).ToArray();
            Assert.Greater(road.Select(s => s.cluster).Distinct().Count(), 1, "analog and digital instruments by the car's age");
            Assert.Greater(road.Select(s => s.wheel).Distinct().Count(), 1, "round and sport wheels");
        }

        [Test]
        public void FromEverySeat_TheRoadShows_AndFifteenMetresAheadIsClear()
        {
            var cockpits = Camera.cockpits;
            var report = new System.Text.StringBuilder();
            foreach (var car in Fleet.vehicles)
            {
                var spec = cockpits.For(car.id);
                var inst = (GameObject)Object.Instantiate(car.EditorModel);
                try
                {
                    var eyeNode = VehicleVisuals.FindPrefix(inst.transform, "eye");
                    Assert.NotNull(eyeNode, $"{car.id} has an eye node");
                    // As in the game: a built wheel replaces the model's, the model's is lowered; the driver is hidden from the seat.
                    var wheel = VehicleVisuals.FindPrefix(inst.transform, "steering_wheel");
                    if (spec.wheel != CockpitWheel.Model) wheel.gameObject.SetActive(false);
                    else wheel.position += inst.transform.rotation * spec.wheelOffset;
                    var driver = VehicleVisuals.FindPrefix(inst.transform, "driver");
                    if (driver != null) driver.gameObject.SetActive(false);
                    var view = new CockpitView(inst.transform);
                    Assert.Greater(view.Triangles, 10000, $"{car.id}: the body is readable");
                    var eye = eyeNode.position + inst.transform.rotation * spec.eyeOffset;
                    // A formula car's halo pillar stands on the centre line (as in every F1 onboard): the road either side of it.
                    var sides = spec.wheel == CockpitWheel.Formula ? new[] { -1.2f, 1.2f } : new[] { 0f };
                    var from = sides.Max(x => view.GroundFrom(inst.transform, eye + inst.transform.right * x * 0.1f));
                    report.Append($" {car.id} {from:0.0} m;");
                    foreach (var x in sides)
                    {
                        var ahead = eye + inst.transform.forward * 15f + inst.transform.right * x;
                        ahead.y = inst.transform.position.y;
                        Assert.IsFalse(view.Hidden(eye, ahead), $"{car.id}: the road 15 m ahead ({x:+0.0;-0.0;0} m) is hidden");
                    }
                    Assert.LessOrEqual(from, 12f, $"{car.id}: the road shows only from {from:0.0} m");
                }
                finally { Object.DestroyImmediate(inst); }
            }
            Debug.Log("[Cockpit] road from:" + report);
        }

        static CockpitHead.Input Driving(float speed, float slideDeg = 0f) => new()
        {
            speed = speed,
            vLong = speed * Mathf.Cos(slideDeg * Mathf.Deg2Rad),
            vLat = speed * Mathf.Sin(slideDeg * Mathf.Deg2Rad),
        };

        [Test]
        public void Drift_TheHeadTurnsTowardsTheTravel_NotTheNose()
        {
            var s = Camera;
            foreach (var side in new[] { -1f, 1f })
            {
                var head = new CockpitHead();
                // Sliding at 35° to one side while the nose swings the other way (counter-steer, yaw into the bend).
                var i = Driving(20f, 35f * side);
                i.yawRate = -0.6f * side;
                i.steer = -15f * side;
                i.drift = 1f;
                for (var k = 0; k < 90; k++) head.Step(1f / 60f, i, s, 1f);
                Assert.That(head.Euler.y * side, Is.GreaterThan(10f), $"looks into the slide ({head.Euler.y:0.0}°)");
                Assert.That(Mathf.Abs(head.Euler.y), Is.LessThanOrEqualTo(s.headLookMax + 0.5f), "within the limit");
                // Out of the slide the eyes come back to the nose.
                var straight = Driving(20f);
                for (var k = 0; k < 120; k++) head.Step(1f / 60f, straight, s, 1f);
                Assert.That(Mathf.Abs(head.Euler.y), Is.LessThan(1f), "eyes front again");
            }
        }

        [Test]
        public void GForces_LeanOutOfTheBend_PressBackUnderPower()
        {
            var head = new CockpitHead();
            var i = Driving(25f);
            i.accelLat = 9f; // a right-hander
            i.accelLong = 5f;
            for (var k = 0; k < 60; k++) head.Step(1f / 60f, i, Camera, 0f);
            Assert.Less(head.Offset.x, -0.01f, "the head moves out of the bend (left)");
            Assert.Less(head.Euler.x, -0.5f, "pressed back: looks a little up");
            Assert.Greater(head.Euler.z, 1f, "the head tips out of the bend");
        }

        [Test]
        public void CameraShakeOff_NoShakeAtAll_OnMeansKicksAndBuzz()
        {
            var s = Camera;
            float Run(float shake)
            {
                var head = new CockpitHead();
                var max = 0f;
                for (var k = 0; k < 120; k++)
                {
                    var i = Driving(45f);
                    i.surface = Surface.Gravel;
                    i.drift = 0.8f;
                    if (k == 10) i.impact = 9f;
                    if (k == 30) i.landing = 6f;
                    if (k == 50) i.shift = 1;
                    if (k % 7 == 0) i.bump = 3f;
                    head.Step(1f / 60f, i, s, shake);
                    max = Mathf.Max(max, head.Shake.magnitude);
                }
                return max;
            }
            Assert.AreEqual(0f, Run(0f), "Camera shake Off: not a tremble");
            var low = Run(1f);
            Assert.Greater(low, 0.5f, "Low: hits and gravel shake the head");
            Assert.Greater(Run(2f), low * 1.5f, "Full shakes more");
        }

        [Test]
        public void LongFrames_DoNotBlowTheSpringsUp()
        {
            var head = new CockpitHead();
            var i = Driving(30f);
            i.impact = 12f;
            head.Step(1f / 60f, i, Camera, 2f);
            var calm = Driving(30f);
            for (var k = 0; k < 40; k++) head.Step(k % 2 == 0 ? 0.25f : 0.07f, calm, Camera, 2f);
            Assert.Less(head.Shake.magnitude, 0.5f, "the kick rang out, a hitch did not make it grow");
        }

        [Test]
        public void Rumble_FollowsHitsAndTyres_EvenWithCameraShakeOff()
        {
            var head = new CockpitHead();
            var i = Driving(30f);
            i.impact = 10f;
            head.Step(1f / 60f, i, Camera, 0f);
            Assert.Greater(head.RumbleLow, 0.5f, "a crash thumps the pad (its own option, not the camera's)");
            i = Driving(30f);
            i.drift = 1f;
            for (var k = 0; k < 30; k++) head.Step(1f / 60f, i, Camera, 0f);
            Assert.Greater(head.RumbleHigh, 0.2f, "a drift buzzes");
            Assert.Less(head.RumbleLow, 0.1f, "the thump faded");
        }

        [Test]
        public void PhoneUpright_KeepsAWideEnoughView()
        {
            var landscape = CarCameraRig.CockpitFov(56f, 74f, 16f / 9f);
            Assert.AreEqual(56f, landscape, 0.01f, "landscape keeps the car's own lens");
            var portrait = CarCameraRig.CockpitFov(56f, 74f, 390f / 844f);
            var horizontal = 2f * Mathf.Atan(Mathf.Tan(portrait * 0.5f * Mathf.Deg2Rad) * (390f / 844f)) * Mathf.Rad2Deg;
            Assert.That(horizontal, Is.GreaterThanOrEqualTo(73.9f).Or.Matches<float>(_ => portrait >= 99.9f), "upright: at least the minimum width (or the cap)");
            Assert.LessOrEqual(portrait, 100f, "never a fisheye");
        }

        [Test]
        public void WheelMeshes_AreBuilt_WithThreeParts()
        {
            foreach (var kind in new[] { CockpitWheel.Round, CockpitWheel.Sport, CockpitWheel.Formula })
            {
                var m = CockpitWheelMesh.Build(kind, 0.36f);
                Assert.AreEqual(3, m.subMeshCount, $"{kind}: grip, trim, accent");
                for (var i = 0; i < 3; i++) Assert.Greater(m.GetIndexCount(i), 0, $"{kind} part {i}");
                Assert.Less(m.vertexCount, 6000, $"{kind}: light enough for the web");
                Assert.That(m.bounds.size.x, Is.InRange(0.25f, 0.45f), $"{kind}: wheel sized");
                Object.DestroyImmediate(m);
            }
        }
    }
}
