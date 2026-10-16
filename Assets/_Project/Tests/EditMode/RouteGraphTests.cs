using System.Collections.Generic;
using JapanMap.Gameplay.Map;
using JapanMap.World;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>The navigation route (RouteGraph): along roads through crossings, never over a bridge onto the road below.</summary>
    public class RouteGraphTests
    {
        static RoadNetwork Net(params RoadNetwork.Road[] roads)
        {
            var n = ScriptableObject.CreateInstance<RoadNetwork>();
            n.roads.AddRange(roads);
            return n;
        }

        static RoadNetwork.Road Road(string id, float y, params Vector2[] xz)
        {
            var pts = new Vector3[xz.Length];
            for (var i = 0; i < xz.Length; i++) pts[i] = new Vector3(xz[i].x, y, xz[i].y);
            return new RoadNetwork.Road { id = id, type = "city", width = 8f, points = pts };
        }

        [Test]
        public void Route_TurnsAtTheCrossing_AndAvoidsTheBridge()
        {
            // An east-west road crossing a north-south road at (0, 0); a bridge 7 m up crossing too, ending elsewhere.
            var net = Net(
                Road("ew", 0f, new Vector2(-200f, 0f), new Vector2(200f, 0f)),
                Road("ns", 0f, new Vector2(0f, -200f), new Vector2(0f, 200f)),
                Road("bridge", 7f, new Vector2(-150f, -150f), new Vector2(150f, 150f)));
            var g = new RouteGraph(net);
            var path = new List<Vector3>();
            Assert.IsTrue(g.Find(new Vector3(-190f, 0f, 0f), new Vector3(0f, 0f, 190f), path), "connected by the crossing");
            var length = 0f;
            for (var i = 1; i < path.Count; i++) length += Vector3.Distance(path[i - 1], path[i]);
            Assert.That(length, Is.EqualTo(380f).Within(12f), "along the roads: 190 m east, 190 m north");
            foreach (var p in path) Assert.That(p.y, Is.LessThan(1f), "never up onto the bridge");

            // From the bridge there is no way down: no route (straight line returned).
            Assert.IsFalse(g.Find(new Vector3(-150f, 7f, -150f), new Vector3(0f, 0f, 190f), path));
        }
    }
}
