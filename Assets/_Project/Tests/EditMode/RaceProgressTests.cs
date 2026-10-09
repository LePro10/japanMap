using System.Collections.Generic;
using JapanMap.Gameplay.Races;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Race progress (Phase 7.5): lap counting at the seam of a loop, checkpoint order, sprint finish.</summary>
    public class RaceProgressTests
    {
        /// <summary>A loop of radius 100 m, 2 m spacing, starting at (100, 0, 0) and running counter-clockwise seen from above.</summary>
        static RaceTrack Loop()
        {
            var pts = new List<Vector3>();
            for (var a = 0f; a < 360f; a += 360f / 314f)
                pts.Add(new Vector3(Mathf.Cos(a * Mathf.Deg2Rad) * 100f, 0f, Mathf.Sin(a * Mathf.Deg2Rad) * 100f));
            return new RaceTrack(pts.ToArray(), true, 10f);
        }

        static Vector3 OnLoop(float s) => new(Mathf.Cos(s / 100f) * 100f, 0f, Mathf.Sin(s / 100f) * 100f);

        [Test]
        public void Delta_WrapsAtTheSeam()
        {
            var t = Loop();
            Assert.AreEqual(628.3f, t.Length, 0.5f);
            Assert.AreEqual(10f, t.Delta(t.Length - 5f, 5f), 0.01f, "forward over the seam");
            Assert.AreEqual(-10f, t.Delta(5f, t.Length - 5f), 0.01f, "backward over the seam");
        }

        [Test]
        public void Laps_CountExactlyWhenCrossingTheLine_FromAGridBehindIt()
        {
            var t = Loop();
            var p = new RaceProgress(t, 0f, 2, 6, 19f);
            var laps = new List<(float progress, int laps)>();
            var last = 0;
            // Grid 20 m behind the line, then two full laps in 1 m steps.
            for (var s = -20f; s <= 2f * t.Length + 10f; s += 1f)
            {
                p.Update(OnLoop(s), s);
                if (p.Laps != last) { laps.Add((p.Progress, p.Laps)); last = p.Laps; }
            }
            Assert.AreEqual(2, laps.Count, string.Join(", ", laps));
            Assert.AreEqual(t.Length, laps[0].progress, 1.5f, "lap 1 counted at the line");
            Assert.AreEqual(2f * t.Length, laps[1].progress, 1.5f, "lap 2 counted at the line");
            Assert.IsTrue(p.Finished);
        }

        [Test]
        public void RockingOverTheSeam_CountsNothingTwice()
        {
            var t = Loop();
            var p = new RaceProgress(t, 0f, 3, 6, 19f);
            for (var s = 0f; s < t.Length - 3f; s += 1f) p.Update(OnLoop(s), s);
            // Back and forth across the line five times.
            for (var k = 0; k < 5; k++)
            {
                for (var s = t.Length - 3f; s < t.Length + 3f; s += 0.5f) p.Update(OnLoop(s), 0f);
                for (var s = t.Length + 3f; s > t.Length - 3f; s -= 0.5f) p.Update(OnLoop(s), 0f);
            }
            Assert.AreEqual(0, p.Laps, "still before the line");
            p.Update(OnLoop(t.Length + 3f), 0f);
            Assert.AreEqual(1, p.Laps);
        }

        [Test]
        public void ReversingThroughTheLine_DoesNotCountALap()
        {
            var t = Loop();
            var p = new RaceProgress(t, 0f, 2, 6, 19f);
            for (var s = 0f; s >= -40f; s -= 1f) p.Update(OnLoop(s), 0f);
            Assert.AreEqual(0, p.Laps);
            Assert.AreEqual(-40f, p.Progress, 1f);
        }

        [Test]
        public void ShortcutAcrossTheMiddle_MissesCheckpoints_AndDoesNotFinish()
        {
            var t = Loop();
            var p = new RaceProgress(t, 0f, 1, 6, 19f);
            for (var s = 0f; s <= 120f; s += 1f) p.Update(OnLoop(s), s);
            // Straight across the infield to just before the line.
            var from = OnLoop(120f);
            var to = OnLoop(t.Length - 10f);
            for (var u = 0f; u <= 1f; u += 0.01f) p.Update(Vector3.Lerp(from, to, u), 200f);
            for (var s = t.Length - 10f; s <= t.Length + 20f; s += 1f) p.Update(OnLoop(s), 300f);
            Assert.IsFalse(p.Finished, $"passed {p.Passed}/{p.TotalCheckpoints}");
        }

        [Test]
        public void Sprint_FinishesNearTheEnd_AfterAllCheckpoints()
        {
            var pts = new List<Vector3>();
            for (var z = 0f; z <= 1000f; z += 2f) pts.Add(new Vector3(0f, 0f, z));
            var t = new RaceTrack(pts.ToArray(), false, 8f);
            var p = new RaceProgress(t, 30f, 1, 8, 18f);
            for (var z = 10f; z < 980f; z += 1f) p.Update(new Vector3(0.5f, 0f, z), z);
            Assert.IsFalse(p.Finished);
            for (var z = 980f; z <= 990f; z += 1f) p.Update(new Vector3(0.5f, 0f, z), z);
            Assert.IsTrue(p.Finished);
            Assert.AreEqual(985f, p.FinishTime, 1.5f, "finish at length − 15 m");
        }
    }
}
