using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Drift chain and Sparks conversion against the rules of ASTRA §5 / §9.</summary>
    public class DriftChainTests
    {
        const float Dt = 0.02f;
        DriftSettings _s;

        [SetUp]
        public void SetUp() => _s = ScriptableObject.CreateInstance<DriftSettings>();

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_s);

        static DriftSample Drift(float kmh, float deg, bool zone = false) => new()
        {
            speed = kmh / 3.6f, forwardSpeed = kmh / 3.6f, slip = deg * Mathf.Deg2Rad, inZone = zone,
        };

        static void Run(DriftChain c, float seconds, DriftSample d)
        {
            for (var t = 0f; t < seconds - 1e-4f; t += Dt) c.Step(Dt, d);
        }

        [Test]
        public void Rate_IsHundredAtReference_AndCapped()
        {
            var c = new DriftChain(_s);
            Assert.AreEqual(100f, c.Rate(30f, 20f), 0.01f);
            Assert.AreEqual(200f * 1.5f, c.Rate(160f, 65f), 0.01f, "speed cap 2× and angle cap 1.5×");
            Assert.AreEqual(0f, c.Rate(29f, 30f), "below 30 km/h");
            Assert.AreEqual(0f, c.Rate(80f, 11f), "below 12°");
            Assert.AreEqual(0f, c.Rate(80f, 71f), "spinning above 70°");
        }

        [Test]
        public void Multiplier_Steps_At6_18_42_90Seconds()
        {
            var c = new DriftChain(_s);
            var d = Drift(60f, 30f);
            Run(c, 5.9f, d);
            Assert.AreEqual(1, c.Multiplier);
            Run(c, 0.2f, d);
            Assert.AreEqual(2, c.Multiplier, "×2 after 6 s");
            Run(c, 12f, d);
            Assert.AreEqual(3, c.Multiplier, "×3 after 18 s");
            Run(c, 24f, d);
            Assert.AreEqual(4, c.Multiplier, "×4 after 42 s");
            Run(c, 47.8f, d);
            Assert.AreEqual(4, c.Multiplier, "not yet ×5 at 89.9 s");
            Run(c, 0.2f, d);
            Assert.AreEqual(5, c.Multiplier, "×5 after 90 s");
            Run(c, 30f, d);
            Assert.AreEqual(5, c.Multiplier, "capped");
        }

        [Test]
        public void Multiplier_AppliesAsEarned_NotRetroactively()
        {
            var c = new DriftChain(_s);
            Run(c, 6f, Drift(30f, 20f)); // 6 s at 100/s, ×1 → 600
            Assert.AreEqual(600f, c.Pending, 3f);
            Run(c, 1f, Drift(30f, 20f)); // +100 × 2
            Assert.AreEqual(800f, c.Pending, 5f);
        }

        [Test]
        public void Chain_Banks_AfterThreeSecondGap()
        {
            var c = new DriftChain(_s);
            ChainEnd end = ChainEnd.None;
            c.Ended += (r, credit, chain) => end = r;
            Run(c, 2f, Drift(50f, 25f));
            var pending = c.Pending;
            Run(c, 2.9f, Drift(50f, 2f));
            Assert.IsTrue(c.Active, "a 2.9 s straight still links");
            Run(c, 0.2f, Drift(50f, 2f));
            Assert.IsFalse(c.Active);
            Assert.AreEqual(ChainEnd.Banked, end);
            Assert.AreEqual(pending, c.Banked, 0.01f);
            Assert.AreEqual(0f, c.Pending);
        }

        [Test]
        public void Crash_BanksHalf_Brush_CutsGrace()
        {
            var c = new DriftChain(_s);
            Run(c, 3f, Drift(50f, 25f));
            var pending = c.Pending;
            c.Contact(1f);
            Assert.IsTrue(c.Active, "noise below 2 km/h is ignored");
            c.Contact(6f);
            Assert.IsTrue(c.Active, "a brush keeps the chain…");
            Assert.LessOrEqual(c.LinkLeft, 0.5f + 1e-4f, "…but only 0.5 s of link time remains");
            c.Contact(15f);
            Assert.IsFalse(c.Active);
            Assert.AreEqual(pending * 0.5f, c.Banked, 0.01f, "crash banks 50%");
        }

        [Test]
        public void Zone_DoublesBase_AndSwitchAddsBonus()
        {
            var a = new DriftChain(_s);
            var b = new DriftChain(_s);
            Run(a, 2f, Drift(30f, 20f));
            Run(b, 2f, Drift(30f, 20f, zone: true));
            Assert.AreEqual(a.Pending * 2f, b.Pending, 1f);

            var c = new DriftChain(_s);
            Run(c, 1f, Drift(30f, 20f));
            var before = c.Pending;
            c.Step(Dt, Drift(30f, -20f));
            Assert.AreEqual(before + 150f + 100f * Dt, c.Pending, 0.5f, "clean flick +150");
            Run(c, 1f, Drift(30f, 20f));
            var mid = c.Pending;
            c.Step(Dt, Drift(30f, -20f));
            Assert.AreEqual(mid + 100f * Dt, c.Pending, 0.5f, "second flick within 2 s pays nothing extra");
        }

        [Test]
        public void Airborne_OrReversing_DoesNotScore()
        {
            var c = new DriftChain(_s);
            var air = Drift(60f, 30f);
            air.airborne = true;
            Run(c, 1f, air);
            var back = Drift(60f, 30f);
            back.forwardSpeed = -5f;
            Run(c, 1f, back);
            Assert.AreEqual(0f, c.Pending);
            Assert.IsFalse(c.Active);
        }

        [Test]
        public void Wallet_ConvertsHundredToOne_KeepsRemainder_CapsPer90s()
        {
            var e = ScriptableObject.CreateInstance<EconomySettings>();
            e.scorePerSpark = 100f; // the rule, at ASTRA's original rate
            var go = new GameObject("wallet");
            try
            {
                var w = go.AddComponent<SparksWallet>();
                w.Configure(e);
                Assert.AreEqual(2, w.AddScore(250f, "t", 0f));
                Assert.AreEqual(1, w.AddScore(50f, "t", 1f), "remainder 50 + 50 = one more");
                Assert.AreEqual(397, w.AddScore(100000f, "t", 2f), "cap 400 per 90 s");
                Assert.AreEqual(0, w.AddScore(1000f, "t", 50f));
                Assert.Greater(w.AddScore(1000f, "t", 95f), 0, "window rolled on");
            }
            finally
            {
                Object.DestroyImmediate(go);
                Object.DestroyImmediate(e);
            }
        }
    }
}
