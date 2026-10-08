using JapanMap.OnFoot;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// The walker's gait against the prototype's measured numbers (legacy tools/bench/walker.mts):
    /// walk 4.4, run 7.5, jump apex ~1.04 m, slide entry from a run 8.58 m/s and ~1.2 s to the end.
    /// On a flat test floor, stepped directly at 60 Hz.
    /// </summary>
    public class WalkerMotorTests
    {
        const float Dt = 1f / 60f;
        GameObject _floor, _walkerGo;
        WalkerMotor _m;
        WalkerSettings _s;

        [SetUp]
        public void SetUp()
        {
            _floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _floor.transform.position = new Vector3(0f, -0.5f + 1000f, 0f);
            _floor.transform.localScale = new Vector3(400f, 1f, 400f);
            _s = ScriptableObject.CreateInstance<WalkerSettings>();
            _walkerGo = new GameObject("TestWalker");
            _walkerGo.SetActive(false);
            _walkerGo.AddComponent<CharacterController>();
            _m = _walkerGo.AddComponent<WalkerMotor>();
            _m.Configure(_s);
            _m.enabled = false; // stepped by the test, not by Update
            _walkerGo.SetActive(true);
            _m.Place(new Vector3(0f, 1000f, -150f), 0f);
            Physics.SyncTransforms();
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_walkerGo);
            Object.DestroyImmediate(_floor);
            Object.DestroyImmediate(_s);
        }

        void Run(float seconds, WalkInput input, System.Action each = null)
        {
            for (var t = 0f; t < seconds; t += Dt)
            {
                var jump = input.jump;
                _m.Input = input;
                input.jump = false;
                _m.Step(Dt);
                each?.Invoke();
                if (jump) input.jump = false;
            }
        }

        [Test]
        public void Walk_And_Run_Reach_ThePrototypeSpeeds()
        {
            Run(1.5f, new WalkInput { move = Vector2.up });
            Assert.That(_m.Speed, Is.EqualTo(_s.walkSpeed).Within(0.05f), "walk speed");
            Assert.IsTrue(_m.Grounded, "walker must stay on the floor");
            Run(1.5f, new WalkInput { move = Vector2.up, sprint = true });
            Assert.That(_m.Speed, Is.EqualTo(_s.runSpeed).Within(0.05f), "run speed");
            Assert.That(_walkerGo.transform.position.z, Is.GreaterThan(-150f + 15f), "forward is camera forward (+Z at heading 0)");
            Run(1f, default);
            Assert.That(_m.Speed, Is.LessThan(0.05f), "coasts to a stop within a second");
        }

        [Test]
        public void Jump_ReachesAboutOneMetre_AndLands()
        {
            var floorY = _walkerGo.transform.position.y;
            var apex = floorY;
            Run(0.05f, default);
            Run(1.2f, new WalkInput { jump = true }, () => apex = Mathf.Max(apex, _walkerGo.transform.position.y));
            Assert.That(apex - floorY, Is.InRange(0.95f, 1.1f), "apex (legacy measured 1.04 m)");
            Assert.IsTrue(_m.Grounded, "lands again");
            Assert.That(_walkerGo.transform.position.y, Is.EqualTo(floorY).Within(0.05f));
        }

        [Test]
        public void Slide_FromARun_KeepsMomentum_ThenStandsUp()
        {
            Run(1.5f, new WalkInput { move = Vector2.up, sprint = true });
            var input = new WalkInput { move = Vector2.up, sprint = true, slide = true };
            _m.Input = input;
            _m.Step(Dt);
            Assert.IsTrue(_m.Sliding, "slide starts from a run");
            Assert.That(_m.Speed, Is.EqualTo(_s.runSpeed + _s.slideBoost).Within(0.15f), "entry kick (legacy 7.50 → 8.58)");
            var cc = _walkerGo.GetComponent<CharacterController>();
            Assert.That(cc.height, Is.LessThan(_s.height * 0.7f), "capsule crouches");
            var time = 0f;
            while (_m.Sliding && time < 4f)
            {
                _m.Input = input;
                _m.Step(Dt);
                time += Dt;
            }
            Assert.That(time, Is.InRange(0.8f, 1.6f), "slide length on flat ground (legacy 1.20 s)");
            Assert.That(cc.height, Is.EqualTo(_s.height).Within(0.01f), "stands up again");
        }

        [Test]
        public void Slide_NotFromAWalk()
        {
            Run(1.5f, new WalkInput { move = Vector2.up });
            Run(0.3f, new WalkInput { move = Vector2.up, slide = true });
            Assert.IsFalse(_m.Sliding, "walking pace is below slideEnterSpeed");
        }

        [Test]
        public void Kerb_IsStepped_Wall_Blocks()
        {
            var kerb = GameObject.CreatePrimitive(PrimitiveType.Cube);
            kerb.transform.position = new Vector3(0f, 1000f + 0.075f, -140f + 10f);
            kerb.transform.localScale = new Vector3(20f, 0.15f, 20f);
            var wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            wall.transform.position = new Vector3(0f, 1000f + 1.5f, -110f);
            wall.transform.localScale = new Vector3(20f, 3f, 1f);
            Physics.SyncTransforms();
            try
            {
                Run(4f, new WalkInput { move = Vector2.up });
                Assert.That(_walkerGo.transform.position.y, Is.EqualTo(1000.15f).Within(0.05f), "on top of the kerb");
                Run(6f, new WalkInput { move = Vector2.up });
                Assert.That(_walkerGo.transform.position.z, Is.LessThan(-110f - 0.5f + 0.01f), "wall stops the walker");
                Assert.That(_m.Speed, Is.LessThan(1f), "no speed piles up against the wall");
            }
            finally
            {
                Object.DestroyImmediate(kerb);
                Object.DestroyImmediate(wall);
            }
        }
    }
}
