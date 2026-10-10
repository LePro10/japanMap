using System.Collections.Generic;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// The heard/shown gearbox (ASTRA §6): automatic upshift near 92 % of redline at full throttle, a gear held at
    /// least 0.5 s (no hunting), a load cut and pitch drop on each upshift, R when rolling back, N at rest, and each
    /// car's gears/redline/shift cut from the ASTRA table.
    /// </summary>
    public class GearboxTests
    {
        static readonly Dictionary<string, (int gears, float redline, float shift)> Astra = new()
        {
            { "touge", (5, 7000f, 0.14f) }, { "pip", (5, 6500f, 0.14f) }, { "truck", (4, 6000f, 0.22f) }, { "offroad", (5, 5500f, 0.14f) },
            { "torrent", (6, 7500f, 0.14f) }, { "ribbon", (6, 7200f, 0.14f) }, { "meridian", (7, 6800f, 0.10f) }, { "morrow", (6, 6500f, 0.14f) },
            { "gt", (7, 8500f, 0.09f) }, { "needle", (6, 10500f, 0.07f) },
        };

        static GearboxSpec Hachi => new() { gears = 5, idle = 850f, redline = 7000f, limiter = 7300f, shiftTime = 0.14f, revRise = 11000f, revFall = 5200f, spread = 0.72f };

        [Test]
        public void EveryCar_HasItsAstraGearbox()
        {
            var seen = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:JapanMap.Vehicles.VehicleDefinition", new[] { "Assets/_Project/Data/Vehicles" }))
            {
                var v = AssetDatabase.LoadAssetAtPath<VehicleDefinition>(AssetDatabase.GUIDToAssetPath(guid));
                Assert.IsTrue(Astra.TryGetValue(v.legacyId, out var a), v.id);
                Assert.AreEqual(a.gears, v.gearbox.gears, $"{v.id} gears");
                Assert.AreEqual(a.redline, v.gearbox.redline, 1f, $"{v.id} redline");
                Assert.AreEqual(a.shift, v.gearbox.shiftTime, 1e-3f, $"{v.id} shift cut");
                Assert.Greater(v.gearbox.limiter, v.gearbox.redline, $"{v.id} limiter above redline");
                Assert.IsNotEmpty(v.blurb, $"{v.id} showroom line");
                seen++;
            }
            Assert.AreEqual(10, seen);
        }

        [Test]
        public void FullThrottle_UpshiftsNearRedline_HoldsEachGear_CutsLoadAndDropsRevs()
        {
            var g = new Gearbox();
            g.Configure(Hachi, ShiftStrategy.Default, 57f);
            const float dt = 1f / 60f;
            var v = 0f;
            var lastShift = -1f;
            var maxRpmBefore = 0f;
            var shifts = 0;
            for (var t = 0f; t < 30f && g.Gear < 5; t += dt)
            {
                var before = g.Gear;
                var rpm = g.Rpm;
                g.Step(dt, v, 1f, 0f, false, 1f, 0f);
                if (g.Gear > before && before >= 1)
                {
                    shifts++;
                    Assert.GreaterOrEqual(rpm, 7000f * 0.88f, $"upshift {before}→{g.Gear} at {rpm:0} rpm, near 92 % of redline");
                    Assert.LessOrEqual(rpm, 7300f + 80f, "never past the limiter");
                    if (lastShift >= 0f) Assert.GreaterOrEqual(t - lastShift, 0.5f, "a gear is held at least 0.5 s");
                    lastShift = t;
                    // During the cut: load drops, revs fall towards the new gear.
                    g.Step(dt, v, 1f, 0f, false, 1f, 0f);
                    Assert.Less(g.Load, 0.1f, "load cut on the upshift");
                    var cutRpm = g.Rpm;
                    for (var k = 0; k < 4; k++) g.Step(dt, v, 1f, 0f, false, 1f, 0f);
                    Assert.Less(g.Rpm, cutRpm, "revs drop after the upshift");
                }
                maxRpmBefore = Mathf.Max(maxRpmBefore, rpm);
                v += 4f * dt; // ~0.4 g
            }
            Assert.AreEqual(4, shifts, "1→5 is four upshifts");
            Assert.AreEqual(5, g.Gear);
        }

        [Test]
        public void Reverse_Neutral_AndPartThrottle()
        {
            var g = new Gearbox();
            g.Configure(Hachi, ShiftStrategy.Default, 57f);
            for (var i = 0; i < 30; i++) g.Step(1f / 60f, 0f, 0f, 0f, false, 1f, 0f);
            Assert.AreEqual("N", Gearbox.Label(g.Gear), "at rest without throttle: N");
            for (var i = 0; i < 30; i++) g.Step(1f / 60f, -2f, 0f, 1f, false, 1f, 0f);
            Assert.AreEqual("R", Gearbox.Label(g.Gear), "rolling back: R");
            // Light throttle shifts early: revs stay low (a calm drive is quiet).
            g.Reset();
            var v = 0f;
            var peak = 0f;
            for (var t = 0f; t < 20f; t += 1f / 60f)
            {
                g.Step(1f / 60f, v, 0.25f, 0f, false, 1f, 0f);
                if (g.Gear >= 2) peak = Mathf.Max(peak, g.Rpm);
                v = Mathf.Min(v + 1.5f / 60f, 20f);
            }
            Assert.Less(peak, 7000f * 0.7f, "part throttle shifts well below redline");
        }
    }
}
