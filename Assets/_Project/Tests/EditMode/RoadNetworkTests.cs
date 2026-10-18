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
            // Up to 1.5 m only where a road meets another at about its level (D54: needle-pit-exit left the approach 2.45 m
            // apart), plus where the mouth's edge is evened out again (needle-pit-exit 1.61 m).
            Assert.That(JapanMap.Editor.Map.RoadProfile.LastMaxChange, Is.LessThan(1.75f), "evening out must not reshape the map");
            var ring = roads.First(r => r.id == "ring");
            Assert.That(JapanMap.Editor.Map.RoadProfile.MaxCurvature(ring), Is.LessThan(1f / 300f * 1.02f), "ring: vertical radius ≥ 300 m");
            var pass = roads.First(r => r.id == "toge");
            // Its first stations lie on the ring (D54: they take its height): the turn-off crest there is 1/39 m — at turning
            // speed (≤ 45 km/h) under 0.4 g — so the mouth is left out.
            Assert.That(JapanMap.Editor.Map.RoadProfile.MaxCurvature(pass, 4), Is.LessThan(1f / 150f * 1.02f), "pass: vertical radius ≥ 150 m");
        }

        /// <summary>A straight legacy road in Three coordinates: from (x0, z0) along (dx, dz), 2 m stations, height y0 + grade·s.</summary>
        static JapanMap.Editor.Map.LegacySource.Road Legacy(string id, float x0, float z0, float dx, float dz, float length, float width, float y0, float grade = 0f)
        {
            var n = Mathf.RoundToInt(length / 2f) + 1;
            var c = new float[n * 3];
            var w = new float[n];
            for (var i = 0; i < n; i++)
            {
                c[i * 3] = x0 + dx * i * 2f;
                c[i * 3 + 1] = y0 + grade * i * 2f;
                c[i * 3 + 2] = z0 + dz * i * 2f;
                w[i] = width;
            }
            return new JapanMap.Editor.Map.LegacySource.Road { id = id, type = "city", centerline = c, widths = w, length = length };
        }

        [Test]
        public void SideRoad_FallingAwayFromTheMainRoad_MeetsItsSurfaceAndIsNotCutShort()
        {
            // west-works-03-2 left hill-steps-west's centreline at 13.7 %: 0.6 m below its flat edge, then cut 4 m too short
            // (the trim took the falling end for a ramp across the main road) — a 1.3 m kerb (D49, D54).
            var settings = JapanMap.Editor.Map.MapImportSettings.LoadOrCreate();
            var main = Legacy("main", -100f, 0f, 1f, 0f, 200f, 9f, 10f);
            var side = Legacy("side", 0f, 0f, 0f, 1f, 100f, 9f, 10f, -0.137f);
            var roads = JapanMap.Editor.Map.RoadProfile.Smooth(new System.Collections.Generic.List<JapanMap.Editor.Map.LegacySource.Road> { main, side }, settings);
            var c = side.centerline;
            var shoulder = settings.roadTypes.First(t => t.type == "city").shoulder;
            for (var i = 0; i * 2f <= 4.5f + shoulder; i++)
                Assert.That(c[i * 3 + 1], Is.EqualTo(10f).Within(0.01f), $"on the main road's surface at {i * 2} m");
            for (var i = 1; i < c.Length / 3; i++)
                Assert.That(Mathf.Abs(c[i * 3 + 1] - c[i * 3 - 2]) / 2f, Is.LessThan(0.137f + 0.08f), $"grade at {i * 2} m stays drivable");
            Assert.That(c[(c.Length / 3 - 1) * 3 + 1], Is.EqualTo(10f - 0.137f * 100f).Within(0.01f), "far end as the data");
            for (var i = 0; i < main.centerline.Length / 3; i++) Assert.That(main.centerline[i * 3 + 1], Is.EqualTo(10f).Within(1e-4f), "the main road stays");
            JapanMap.Editor.Map.RoadImporter.ResolveTrims(roads);
            Assert.That(side.trimStart, Is.EqualTo(4f).Within(0.01f), "cut to half a metre inside the main road's edge");
        }

        [Test]
        public void Corner_WhereOnlyEndsMeet_OneKeepsItsEnd()
        {
            // east-lantern-05/-08/-10 all ended in one point and all were cut back: bare ground 0.9 m deep in the middle.
            var wide = Legacy("wide", 0f, 0f, 1f, 0f, 100f, 12f, 10f);
            var north = Legacy("north", 0f, 0f, 0f, 1f, 60f, 9f, 10f);
            var west = Legacy("west", 0f, 0f, -1f, 0f, 80f, 9f, 10f);
            JapanMap.Editor.Map.RoadImporter.ResolveTrims(new System.Collections.Generic.List<JapanMap.Editor.Map.LegacySource.Road> { wide, north, west });
            Assert.AreEqual(0f, wide.trimStart, "the widest keeps its end: it covers the corner");
            Assert.That(north.trimStart, Is.LessThanOrEqualTo(6f - 0.5f), "the others end inside it, never short of it");
            Assert.AreEqual(0f, west.trimStart, "going on from the widest's end: nothing of it to cut back to");
        }
    }
}
