using JapanMap.Gameplay.Races;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>The time-trial ghost survives the save string, plays back smoothly and tells the gap by route progress.</summary>
    public class RaceGhostTests
    {
        static RaceGhost Straight(int n, float kmh = 72f)
        {
            var g = new RaceGhost { car = "hachi", hz = 10f, seconds = 12.3f };
            for (var i = 0; i < n; i++)
            {
                var d = i / g.hz * kmh / 3.6f;
                g.Add(new Vector3(1000f + d, 120.5f, -800f), Quaternion.Euler(-3f, 90f + i, 1.5f), d);
            }
            return g;
        }

        [Test]
        public void Encode_Decode_KeepsTheRun()
        {
            var a = Straight(300);
            var text = a.Encode();
            var b = RaceGhost.Decode(text);
            Assert.NotNull(b);
            Assert.AreEqual("hachi", b.car);
            Assert.AreEqual(a.Count, b.Count);
            Assert.AreEqual(a.seconds, b.seconds);
            Assert.AreEqual(a.Duration, b.Duration, 1e-4f);
            for (var t = 0f; t < a.Duration; t += 1.37f)
            {
                a.Sample(t, out var pa, out var ra);
                b.Sample(t, out var pb, out var rb);
                Assert.That(Vector3.Distance(pa, pb), Is.LessThan(1e-3f), $"position at {t} s");
                Assert.That(Quaternion.Angle(ra, rb), Is.LessThan(0.1f), $"rotation at {t} s");
            }
            // 300 samples (30 s): ~6.6 kB in base64 — two-minute trials stay far under the platform's data limit.
            Assert.That(text.Length, Is.LessThan(300 * 22 * 4 / 3 + 64));
        }

        [Test]
        public void Sample_InterpolatesBetweenSamples_AndClampsAtTheEnds()
        {
            var g = Straight(11);
            g.Sample(0.05f, out var mid, out _);
            Assert.AreEqual(1000f + 1f, mid.x, 1e-3f, "half way between the first two samples (20 m/s)");
            g.Sample(-5f, out var before, out _);
            Assert.AreEqual(1000f, before.x, 1e-4f);
            g.Sample(99f, out var after, out _);
            Assert.AreEqual(1000f + 20f, after.x, 1e-3f);
        }

        [Test]
        public void TimeAt_FindsWhenTheGhostWasThere()
        {
            var g = Straight(101); // 20 m/s for 10 s
            Assert.AreEqual(0f, g.TimeAt(-4f), 1e-4f, "on the grid behind the line");
            Assert.AreEqual(2.5f, g.TimeAt(50f), 1e-3f);
            Assert.AreEqual(g.Duration, g.TimeAt(500f), 1e-4f, "past its finish");
        }

        [Test]
        public void Decode_RejectsBrokenStrings()
        {
            Assert.IsNull(RaceGhost.Decode(null));
            Assert.IsNull(RaceGhost.Decode("not base64!"));
            Assert.IsNull(RaceGhost.Decode(System.Convert.ToBase64String(new byte[] { 9, 1, 2 })), "newer format");
            var cut = Straight(20).Encode();
            Assert.IsNull(RaceGhost.Decode(System.Convert.ToBase64String(System.Convert.FromBase64String(cut)[..40])), "truncated");
        }
    }
}
