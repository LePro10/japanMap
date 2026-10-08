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
    }
}
