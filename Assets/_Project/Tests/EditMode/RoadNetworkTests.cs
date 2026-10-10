using System.Linq;
using JapanMap.World;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>The carriageway query the pedestrian acceptance test relies on.</summary>
    public class RoadNetworkTests
    {
        static RoadNetwork Straight()
        {
            var n = ScriptableObject.CreateInstance<RoadNetwork>();
            var pts = new Vector3[11];
            for (var i = 0; i <= 10; i++) pts[i] = new Vector3(0f, 10f, i * 2f); // 20 m north, 8 m wide
            n.roads.Add(new RoadNetwork.Road { id = "lane", type = "city", width = 8f, points = pts });
            return n;
        }

        [Test]
        public void CarriagewayAt_InsideBesideAboveAndPastTheEnds()
        {
            var n = Straight();
            Assert.AreEqual("lane", n.CarriagewayAt(new Vector3(3.9f, 10f, 10f)), "inside the half width");
            Assert.IsNull(n.CarriagewayAt(new Vector3(4.1f, 10f, 10f)), "on the pavement beside it");
            Assert.IsNull(n.CarriagewayAt(new Vector3(0f, 16f, 10f)), "on a deck above it");
            Assert.IsNull(n.CarriagewayAt(new Vector3(2f, 10f, 22f)), "past the square end (was round: 2 m off counted)");
            Assert.IsNull(n.CarriagewayAt(new Vector3(2f, 10f, -1f)), "before the start");
            Assert.AreEqual("lane", n.CarriagewayAt(new Vector3(0f, 10f, 19.9f)), "just before the end");
            Object.DestroyImmediate(n);
        }

        [Test]
        public void RoadProfiles_NoDipOrCrestTighterThanTheirType_HeightsBarelyMove()
        {
            // Phase 10: a 46 m dip on the ring at (541, −710) put 2.6 g on the suspension at 120 km/h — the body hit the road.
            var settings = JapanMap.Editor.Map.MapImportSettings.LoadOrCreate();
            var roads = JapanMap.Editor.Map.RoadImporter.Load(settings);
            Assert.That(JapanMap.Editor.Map.RoadProfile.LastMaxChange, Is.LessThan(1.5f), "evening out must not reshape the map");
            var ring = roads.First(r => r.id == "ring");
            Assert.That(JapanMap.Editor.Map.RoadProfile.MaxCurvature(ring), Is.LessThan(1f / 300f * 1.02f), "ring: vertical radius ≥ 300 m");
            var pass = roads.First(r => r.id == "toge");
            Assert.That(JapanMap.Editor.Map.RoadProfile.MaxCurvature(pass, 2), Is.LessThan(1f / 150f * 1.02f), "pass: vertical radius ≥ 150 m");
        }
    }
}
