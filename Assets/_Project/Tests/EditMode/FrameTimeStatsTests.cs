using JapanMap.DevTools;
using NUnit.Framework;

namespace JapanMap.Tests
{
    public class FrameTimeStatsTests
    {
        [Test]
        public void Empty_IsZero()
        {
            var s = new FrameTimeStats(4);
            Assert.AreEqual(0f, s.AverageMs);
            Assert.AreEqual(0f, s.WorstMs);
        }

        [Test]
        public void Window_DropsOldestSample()
        {
            var s = new FrameTimeStats(3);
            s.Add(100f); s.Add(10f); s.Add(20f); s.Add(30f);
            Assert.AreEqual(3, s.Count);
            Assert.AreEqual(20f, s.AverageMs, 1e-4f);
            Assert.AreEqual(30f, s.WorstMs);
        }
    }
}
