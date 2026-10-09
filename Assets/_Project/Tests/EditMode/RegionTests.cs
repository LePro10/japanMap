using JapanMap.Gameplay.Regions;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>The eight regions (Phase 7.2): every place lies in the region the design names, and the map has no gaps.</summary>
    public class RegionTests
    {
        static RegionSet Set()
        {
            var set = AssetDatabase.LoadAssetAtPath<RegionSet>("Assets/_Project/Data/Gameplay/Regions.asset");
            Assert.IsNotNull(set, "Regions.asset missing — run JapanMap/Content/Setup");
            return set;
        }

        static string At(RegionSet s, float x, float z) => s.regions[s.IndexAt(new Vector3(x, 0f, z))].id;

        [Test]
        public void EightRegions_RestIsLast()
        {
            var s = Set();
            Assert.AreEqual(8, s.regions.Length);
            Assert.IsTrue(s.regions[7].IsRest, "the last region takes every remaining point");
            for (var i = 0; i < 7; i++) Assert.IsFalse(s.regions[i].IsRest, s.regions[i].id);
        }

        [TestCase(550f, -510f, "commons")]
        [TestCase(-620f, -760f, "needle")]
        [TestCase(620f, -120f, "neon")]
        [TestCase(-214f, -140f, "stillwater")]
        [TestCase(-1190f, -360f, "stillwater")]
        [TestCase(-1352f, 1052f, "cinder")]
        [TestCase(820f, 954f, "bellwood")]
        [TestCase(-1236f, -1070f, "longshore")]
        [TestCase(810f, -1158f, "tideglass")]
        public void Places_LieInTheirRegion(float x, float z, string id) => Assert.AreEqual(id, At(Set(), x, z));

        [Test]
        public void EveryRegion_OwnsLand_AndItsLabel()
        {
            var s = Set();
            var counts = new int[s.regions.Length];
            for (var x = -1536f; x <= 1536f; x += 32f)
            for (var z = -1536f; z <= 1536f; z += 32f)
                counts[s.IndexAt(new Vector3(x, 0f, z))]++;
            for (var i = 0; i < counts.Length; i++)
            {
                Assert.Greater(counts[i], 20, $"{s.regions[i].id} owns almost nothing");
                var l = s.regions[i].labelAt;
                Assert.AreEqual(i, s.IndexAt(new Vector3(l.x, 0f, l.y)), $"label of {s.regions[i].id} lies outside it");
            }
        }
    }
}
