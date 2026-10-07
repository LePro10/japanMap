using System.Collections.Generic;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using static JapanMap.Tests.Vehicles.VehicleProbes;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// The legacy benches as limits, for every car of the fleet. Reference numbers are the
    /// prototype's (SourceData/bench/legacy-*.txt), keyed by the legacy fleet id (D16).
    /// </summary>
    public class VehicleBenchTests
    {
        // legacy id → 0–100 s, top km/h, brake m (fleet.mts); handbrake drift peak ° (arcade.mts);
        // terrain 20° km/h after 20 s (hill.mts).
        static readonly Dictionary<string, (float hundred, float top, float brake, float drift, float hill)> Legacy = new()
        {
            ["touge"] = (7.18f, 205, 37.9f, 42.3f, 58),
            ["pip"] = (10.48f, 160, 38.9f, 20.5f, 34),
            ["truck"] = (12.00f, 150, 45.9f, 27.1f, 36),
            ["offroad"] = (8.78f, 180, 44.9f, 25.5f, 66),
            ["torrent"] = (5.58f, 225, 34.9f, 31.8f, 83),
            ["ribbon"] = (5.78f, 235, 36.9f, 57.2f, 70),
            ["meridian"] = (4.68f, 270, 36.0f, 31.2f, 87),
            ["morrow"] = (4.88f, 265, 40.0f, 51.5f, 81),
            ["gt"] = (3.90f, 295, 31.0f, 33.2f, 108),
            ["needle"] = (3.30f, 305, 27.1f, 25.4f, 125),
        };

        public static IEnumerable<string> Cars()
        {
            var fleet = VehicleBenchReport.LoadFleet();
            foreach (var v in fleet.vehicles) yield return v.id;
        }

        [OneTimeSetUp]
        public void Load() => Fleet = VehicleBenchReport.LoadFleet();

        static (float hundred, float top, float brake, float drift, float hill) Ref(string id) => Legacy[Fleet.Get(id).legacyId];
        static float Score => Fleet.tuning.driftScoreAngle * Mathf.Rad2Deg;

        [Test, TestCaseSource(nameof(Cars))]
        public void ZeroToHundred_AndTopSpeed_MatchThePrototype(string id)
        {
            var a = Acceleration(id);
            Assert.That(a.hundred, Is.EqualTo(Ref(id).hundred).Within(10).Percent, "0–100 s");
            Assert.That(a.top, Is.EqualTo(Ref(id).top).Within(3).Percent, "top speed km/h");
            Assert.That(a.offset, Is.LessThan(0.1f), "straight line drifts sideways (m over 90 s)");
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void BrakingFromHundred_MatchesThePrototype(string id)
        {
            Assert.That(Braking(id).metres, Is.EqualTo(Ref(id).brake).Within(10).Percent);
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void Steering_IsMirrorSymmetric(string id)
        {
            var s = Symmetry(id);
            Assert.That(Mathf.Abs(s.right), Is.GreaterThan(5f), "steering does nothing");
            Assert.That(s.right + s.left, Is.EqualTo(0f).Within(0.05f), $"right {s.right:F2} m, left {s.left:F2} m");
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void Coasting_FallsMonotonically(string id)
        {
            var c = Coast(id);
            Assert.AreEqual(0, c.rises, $"speed rose {c.rises}× while coasting (max {c.maxRise:E1} m/s) — the model makes energy");
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void SteerResponse_IsProportional(string id)
        {
            var r = SteerResponse(id, 90f);
            for (var i = 1; i < r.Length; i++)
                Assert.That(r[i], Is.GreaterThan(r[i - 1]), $"yaw rate must grow with the input: {string.Join(" ", r)}");
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void CleanCorner_DoesNotDriftUnasked(string id)
        {
            Assert.That(CleanCorner(id), Is.LessThan(Score), "drifts with half lock and a bang-bang throttle at 90 km/h");
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void ThrottleInABend_DoesNotOpenADriftWithoutHandbrake(string id)
        {
            Assert.That(Drift(id, 70f, false, 0.85f, 1f).peak, Is.LessThan(Score * 1.4f));
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void HandbrakeDrift_OpensHoldsAndCatches(string id)
        {
            var d = Drift(id, 80f, true, 0.8f, 0.6f);
            Assert.That(d.peak, Is.EqualTo(Ref(id).drift).Within(15).Percent, "peak slip °");
            Assert.IsFalse(d.spun, "spun beyond the drift range");
            Assert.That(d.catchTime, Is.GreaterThanOrEqualTo(0f), "never straightens after letting go");
            Assert.That(d.catchTime, Is.LessThan(1.5f));
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void HandbrakeTap_ThenSteer_OpensTheDrift(string id)
        {
            Assert.That(TapThenSteer(id), Is.GreaterThan(Score));
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void HandbrakeOnTheStraight_DoesNotTurnIntoTheLastBend(string id)
        {
            Assert.That(HandbrakeOnStraight(id), Is.LessThan(12f));
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void Slope20_OnOpenGround_IsClimbable(string id)
        {
            var h = Hill(id, VehicleRig.Ground.Terrain, 20f);
            Assert.That(h.climbed, Is.GreaterThan(1f), "does not get up a 20° slope");
            // PhysX applies the full g·sin θ, the prototype g·sin θ·cos θ: allow 15 % less.
            Assert.That(h.kmh, Is.GreaterThan(Ref(id).hill * 0.85f));
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void LandingFromSixMetres_DoesNotSink(string id)
        {
            var l = Landing(id);
            Assert.That(l.lowestUnderside, Is.GreaterThan(-0.05f), "body went into the ground");
            Assert.That(l.restError, Is.LessThan(0.05f), "does not come back to its ride height");
            Assert.IsTrue(l.upright, "not standing on four wheels after landing");
        }

        [Test, TestCaseSource(nameof(Cars))]
        public void Wall_CarSlidesAlong_DoesNotStick(string id)
        {
            var w = Wall(id);
            Assert.That(w.kmh, Is.GreaterThan(40f), "stuck to the wall");
            Assert.That(w.along, Is.GreaterThan(60f));
        }

        // ── Stunt mode (legacy probes were Kite S only → Hachi 86) ─────────

        [Test]
        public void Stunt_SingleTapDrifts_ButNo360()
        {
            var s = SingleTap("hachi");
            Assert.That(s.slip, Is.GreaterThan(Score));
            Assert.That(s.yaw, Is.LessThan(180f));
        }

        [Test]
        public void Stunt_HeldHandbrake_Makes180In1s_And360In2s()
        {
            var one = HeldSpin("hachi", 1f);
            Assert.That(one, Is.InRange(120f, 270f), "1 s");
            Assert.That(HeldSpin("hachi", 2.2f), Is.GreaterThanOrEqualTo(330f), "2.2 s");
        }

        [Test]
        public void Stunt_DoubleTapInADrift_Turns360ByMotion()
        {
            Assert.That(Trick360("hachi"), Is.GreaterThanOrEqualTo(300f));
        }

        [Test]
        public void Stunt_CleanCorner_DoesNotDrift()
        {
            Assert.That(CleanCorner("hachi", stunt: true), Is.LessThan(Score));
        }
    }
}
