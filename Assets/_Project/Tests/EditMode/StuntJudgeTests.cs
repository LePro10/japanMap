using System.Collections.Generic;
using JapanMap.Gameplay.Stunts;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Stunt judge (Phase 7.4) against ASTRA §5: jumps, air and ground spins, clean landings, repeats.</summary>
    public class StuntJudgeTests
    {
        const float Dt = 0.02f;
        StuntSettings _s;
        StuntJudge _j;
        List<StuntResult> _got;
        Vector3 _pos;
        float _heading;

        [SetUp]
        public void SetUp()
        {
            _s = ScriptableObject.CreateInstance<StuntSettings>();
            _j = new StuntJudge(_s);
            _got = new List<StuntResult>();
            _j.Scored += r => _got.Add(r);
            _pos = Vector3.zero;
            _heading = 0f;
        }

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_s);

        /// <summary>Moves along +z at <paramref name="speed"/> m/s while the nose turns at <paramref name="yawRate"/> °/s.</summary>
        void Run(float seconds, float speed, bool air, float yawRate = 0f, bool stunt = false, bool hit = false, int ramp = -1, int wheels = 4)
        {
            for (var t = 0f; t < seconds - 1e-4f; t += Dt)
            {
                _pos += Vector3.forward * speed * Dt;
                _heading += yawRate * Dt;
                _j.Step(Dt, new StuntSample
                {
                    position = _pos,
                    forward = Quaternion.Euler(0f, _heading, 0f) * Vector3.forward,
                    velocity = Vector3.forward * speed,
                    airborne = air,
                    groundedWheels = air ? 0 : wheels,
                    stuntMode = stunt,
                    bodyHit = hit,
                    rampAtLip = ramp,
                });
            }
        }

        [Test]
        public void StraightJump_ScoresDistance_AfterASettledLanding()
        {
            Run(1f, 20f, false);
            Run(0.8f, 20f, true, ramp: 2);
            Assert.IsEmpty(_got, "not before the landing settles");
            Run(0.6f, 20f, false);
            Assert.AreEqual(1, _got.Count);
            Assert.AreEqual(16f, _got[0].distance, 0.5f);
            Assert.AreEqual(160, _got[0].points, 5);
            Assert.AreEqual(2, _got[0].ramp);
        }

        [Test]
        public void Bump_Sideways_OrHitLanding_DoNotScore()
        {
            Run(0.3f, 20f, true);
            Run(0.6f, 20f, false);
            Assert.IsEmpty(_got, "0.3 s is a bump");

            Run(0.8f, 20f, true, yawRate: 112.5f); // lands 90° across the travel
            Run(0.6f, 20f, false);
            Assert.IsEmpty(_got, "sideways landing");

            _heading = 0f;
            Run(0.8f, 20f, true);
            Run(0.1f, 20f, false);
            Run(0.1f, 20f, false, hit: true);
            Run(0.6f, 20f, false);
            Assert.IsEmpty(_got, "body hit right after touchdown");
        }

        [Test]
        public void HopJustBeforeTheLip_StartsANewJumpAtTheLip()
        {
            Run(1f, 20f, false);
            Run(0.1f, 20f, true);           // a bump on the run-up…
            Run(0.2f, 20f, false);          // …0.2 s on the ground (not settled)…
            var lip = _pos;
            Run(0.8f, 20f, true, ramp: 4);  // …then the real take-off at the lip
            Run(0.6f, 20f, false);
            Assert.AreEqual(1, _got.Count);
            Assert.AreEqual(4, _got[0].ramp, "the take-off belongs to the ramp");
            Assert.AreEqual(16f, _got[0].distance, 0.6f, $"measured from the lip at {lip.z:0}");
        }

        [Test]
        public void Air360_Adds800()
        {
            Run(1.2f, 20f, true, yawRate: 300f); // 360°
            Run(0.6f, 20f, false);
            Assert.AreEqual(1, _got.Count);
            StringAssert.StartsWith("Air 360", _got[0].title);
            Assert.AreEqual(800 + 240, _got[0].points, 5);
        }

        [Test]
        public void Ground360_OnlyInStuntMode()
        {
            Run(1f, 14f, false, yawRate: 360f);
            Run(0.5f, 6f, false);
            Assert.IsEmpty(_got, "no stunt mode, no stunt");

            _heading = 0f;
            Run(1f, 14f, false, yawRate: 360f, stunt: true); // 50 km/h entry
            Run(0.5f, 6f, false, stunt: true);                // ends at 21.6 km/h ≥ 25 %
            Assert.AreEqual(1, _got.Count);
            Assert.AreEqual("Ground 360", _got[0].title);
            Assert.AreEqual(600, _got[0].points);
        }

        [Test]
        public void Ground180_NeedsSpeedAtEntryAndExit()
        {
            Run(0.5f, 8f, false, yawRate: 360f, stunt: true); // 29 km/h entry: too slow
            Run(0.5f, 8f, false, stunt: true);
            Assert.IsEmpty(_got);
            Run(0.5f, 12f, false, yawRate: 360f, stunt: true); // 180° at 43 km/h
            Run(0.5f, 7f, false, stunt: true);                 // exit 25 km/h
            Assert.AreEqual(1, _got.Count);
            Assert.AreEqual("Ground 180", _got[0].title);
        }

        [Test]
        public void SameJumpAtSameRamp_PaysHalf_UntilFarOrAnotherRamp()
        {
            void Jump(int ramp)
            {
                Run(0.8f, 20f, true, ramp: ramp);
                Run(0.6f, 20f, false);
            }
            Jump(1);
            Jump(1);
            Assert.IsTrue(_got[1].repeat);
            Assert.AreEqual(Mathf.RoundToInt(_got[0].points * 0.5f), _got[1].points, 1);
            Jump(3);
            Jump(1);
            Assert.IsFalse(_got[3].repeat, "another ramp in between");
            Run(11f, 20f, false); // 220 m
            Jump(1);
            Assert.IsFalse(_got[4].repeat, "200 m driven");
        }
    }
}
