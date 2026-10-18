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

        [Test]
        public void Route_ReportsTheRoadWidth_PerPoint()
        {
            // Auto-drive (D49) drives the left lane of wide roads and the middle of narrow ones: it needs the width.
            var wide = Road("wide", 0f, new Vector2(-200f, 0f), new Vector2(0f, 0f));
            var narrow = Road("narrow", 0f, new Vector2(0f, 0f), new Vector2(0f, 200f));
            narrow.width = 4f;
            var g = new RouteGraph(Net(wide, narrow));
            var path = new List<Vector3>();
            var widths = new List<float>();
            Assert.IsTrue(g.Find(new Vector3(-190f, 0f, 0f), new Vector3(0f, 0f, 190f), path, widths));
            Assert.AreEqual(path.Count, widths.Count, "one width per point");
            Assert.AreEqual(8f, widths[1], "starts on the wide road");
            Assert.AreEqual(4f, widths[widths.Count - 2], "ends on the narrow one");
        }

        [Test]
        public void Crossings_AreWhereRoadsMeetAtAnAngle_NotWhereARoadGoesOnUnderANewId()
        {
            // Auto-drive (D49) slows down and takes the middle at crossings; a road continuing as "-2" is no crossing.
            var ew = Road("ew", 0f, new Vector2(-200f, 0f), new Vector2(0f, 0f));
            var ew2 = Road("ew-2", 0f, new Vector2(0f, 0f), new Vector2(200f, 0f));
            var ns = Road("ns", 0f, new Vector2(100f, -200f), new Vector2(100f, 200f));
            var g = new RouteGraph(Net(ew, ew2, ns));
            var path = new List<Vector3>();
            var widths = new List<float>();
            var crossings = new List<Crossing>();
            Assert.IsTrue(g.Find(new Vector3(-190f, 0f, 0f), new Vector3(190f, 0f, 0f), path, widths, crossings));
            Assert.AreEqual(path.Count, crossings.Count);
            for (var i = 0; i < path.Count; i++)
            {
                var atCross = Mathf.Abs(path[i].x - 100f) < 10f;
                var atJoin = Mathf.Abs(path[i].x) < 10f;
                if (crossings[i] != Crossing.None) Assert.IsTrue(atCross, $"only the north-south road crosses (point {path[i]})");
                if (atJoin) Assert.AreEqual(Crossing.None, crossings[i], $"ew → ew-2 is one road (point {path[i]})");
            }
            Assert.IsTrue(crossings.Contains(Crossing.Level), "the level crossing at x = 100 is found");
            Assert.IsFalse(crossings.Contains(Crossing.Step), "no step at a level crossing");

            // The north-south road 1.5 m higher (on an embankment): the same crossing is a stepped one.
            var raised = Road("ns", 1.5f, new Vector2(100f, -200f), new Vector2(100f, 200f));
            g = new RouteGraph(Net(ew, ew2, raised));
            Assert.IsTrue(g.Find(new Vector3(-190f, 0f, 0f), new Vector3(190f, 0f, 0f), path, widths, crossings));
            Assert.IsTrue(crossings.Contains(Crossing.Step), "a crossing with a height step");
        }

        [Test]
        public void Route_GoesRoundACrossingWithAHeightStep_WhenThereIsAWay()
        {
            // A side road starting 1.2 m above the main road (an embankment the car hits) and a level one 10 m beside it;
            // both meet a top road. To the stepped road's far end the route takes the level one and the top road.
            var main = Road("main", 0f, new Vector2(-200f, 0f), new Vector2(200f, 0f));
            var stepped = new RoadNetwork.Road { id = "stepped", type = "city", width = 8f, points = new[] { new Vector3(-50f, 1.2f, 5f), new Vector3(-50f, 1.2f, 200f) } };
            var level = new RoadNetwork.Road { id = "level", type = "city", width = 8f, points = new[] { new Vector3(-40f, 0f, 5f), new Vector3(-40f, 1.2f, 100f), new Vector3(-40f, 1.2f, 200f) } };
            var top = Road("top", 1.2f, new Vector2(-60f, 205f), new Vector2(-30f, 205f));
            var g = new RouteGraph(Net(main, stepped, level, top));
            var path = new List<Vector3>();
            Assert.IsTrue(g.Find(new Vector3(-190f, 0f, 0f), new Vector3(-50f, 1.2f, 190f), path));
            foreach (var p in path)
                if (p.z > 10f && p.z < 150f) Assert.That(p.x, Is.EqualTo(-40f).Within(1f), $"up the level road, not the stepped one ({p})");
        }
    }
}
