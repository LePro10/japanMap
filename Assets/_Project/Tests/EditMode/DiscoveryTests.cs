using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.Editor.Map;
using JapanMap.Editor.Places;
using JapanMap.Gameplay.Discovery;
using JapanMap.Gameplay.Regions;
using JapanMap.World;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Discoveries (Phase 7.3): 24 cards, three per region and inside it; every token and button stands
    /// on dry, walkable ground beside the road, not inside a building; the puzzles accept the hinted
    /// answer and free retries.
    /// </summary>
    public class DiscoveryTests
    {
        static DiscoverySet Set()
        {
            var set = AssetDatabase.LoadAssetAtPath<DiscoverySet>("Assets/_Project/Data/Gameplay/Discoveries.asset");
            Assert.IsNotNull(set, "Discoveries.asset missing — run JapanMap/Content/Setup");
            return set;
        }

        [Test]
        public void TwentyFour_ThreePerRegion_EachInItsRegion()
        {
            var set = Set();
            var regions = AssetDatabase.LoadAssetAtPath<RegionSet>("Assets/_Project/Data/Gameplay/Regions.asset");
            Assert.AreEqual(24, set.cards.Length);
            var per = new Dictionary<string, int>();
            var ids = new HashSet<string>();
            foreach (var c in set.cards)
            {
                Assert.IsTrue(ids.Add(c.id), $"duplicate {c.id}");
                per[c.region] = per.TryGetValue(c.region, out var n) ? n + 1 : 1;
                var at = regions.regions[regions.IndexAt(new Vector3(c.position.x, 0f, c.position.y))].id;
                Assert.AreEqual(c.region, at, $"{c.id} {c.title} lies in {at}");
            }
            Assert.AreEqual(8, per.Count);
            foreach (var kv in per) Assert.AreEqual(3, kv.Value, kv.Key);
        }

        [Test]
        public void EveryTokenAndButton_StandsOnDryWalkableGround_BesideTheRoad()
        {
            MapScene.OpenGameScene();
            var set = Set();
            var roads = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            var mask = ~GameLayers.NotGround;
            var bad = new List<string>();
            var water = WaterColliders(out var temp);
            try
            {
            foreach (var c in set.cards)
            {
                var spots = new List<Vector3> { new(c.position.x, 0f, c.position.y) };
                for (var b = 0; b < c.buttons.Length; b++) spots.Add(set.ButtonPosition(c, b));
                for (var k = 0; k < spots.Count; k++)
                {
                    var q = spots[k];
                    var g = PlaceImporter.Ground(q);
                    if (!Physics.Raycast(new Vector3(q.x, g + 4f, q.z), Vector3.down, out var hit, 10f, mask, QueryTriggerInteraction.Ignore)) { bad.Add($"{c.id}: no ground"); continue; }
                    var s = hit.point;
                    if (s.y < 0.5f) bad.Add($"{c.id}: in the water ({s.y:F1} m)");
                    foreach (var w in water)
                        if (w.bounds.Contains(new Vector3(s.x, w.bounds.center.y, s.z))
                            && w.Raycast(new Ray(s + Vector3.up * 10f, Vector3.down), out var wet, 20f) && wet.point.y > s.y - 0.02f)
                            bad.Add($"{c.id}: under {w.name} water ({wet.point.y - s.y:F2} m)");
                    var road = roads.CarriagewayAt(s, 0.8f, 3f);
                    if (road != null) bad.Add($"{c.id}: on the road {road}");
                    foreach (var h in Physics.OverlapCapsule(s + Vector3.up * 0.7f, s + Vector3.up * 1.6f, 0.45f, mask, QueryTriggerInteraction.Ignore)) bad.Add($"{c.id}: inside {h.name}");
                    var slope = Vector3.Angle(hit.normal, Vector3.up);
                    if (slope > 28f) bad.Add($"{c.id}: slope {slope:F0}°");
                    // Buttons are found by a short ray from the card's ground (DiscoverySystem.Ground).
                    if (Mathf.Abs(s.y - c.ground) > 3.5f) bad.Add($"{c.id}: button {k} {s.y - c.ground:F1} m off the card's ground");
                    if (k == 0 && Mathf.Abs(c.ground - g) > 0.05f) bad.Add($"{c.id}: stored ground {c.ground:F1} ≠ {g:F1} — run Content/Setup");
                }
            }
            }
            finally
            {
                foreach (var t in temp) Object.DestroyImmediate(t);
            }
            Assert.IsEmpty(bad, string.Join("\n", bad));
        }

        /// <summary>Sea, paddy and river surfaces as colliders (in the editor they have none; never saved).</summary>
        static List<Collider> WaterColliders(out List<Collider> temp)
        {
            temp = new List<Collider>();
            var all = new List<Collider>();
            var root = GameObject.Find("World/Water");
            if (root == null) return all;
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>())
            {
                var c = mf.GetComponent<Collider>();
                if (c == null)
                {
                    var mc = mf.gameObject.AddComponent<MeshCollider>();
                    mc.sharedMesh = mf.sharedMesh;
                    c = mc;
                    temp.Add(c);
                }
                all.Add(c);
            }
            return all;
        }

        [Test]
        public void Puzzles_SolveWithTheHint_AndForgiveMistakes()
        {
            var set = Set();
            foreach (var c in set.cards)
            {
                if (c.trigger == DiscoverySet.Trigger.Sequence)
                {
                    var p = new DiscoveryPuzzle(c);
                    var wrong = (c.answer[0] + 1) % c.buttons.Length;
                    Assert.AreEqual(PuzzleStep.Wrong, p.Press(wrong, 0f), c.id);
                    for (var i = 0; i < c.answer.Length - 1; i++) Assert.AreEqual(PuzzleStep.Progress, p.Press(c.answer[i], 1f + i), c.id);
                    Assert.AreEqual(PuzzleStep.Solved, p.Press(c.answer[^1], 9f), c.id);
                    Assert.IsFalse(string.IsNullOrEmpty(c.hint), $"{c.id} needs a hint");
                }
                else if (c.trigger == DiscoverySet.Trigger.Rhythm)
                {
                    var p = new DiscoveryPuzzle(c);
                    var t = 10f;
                    p.Press(-1, t);
                    Assert.AreEqual(PuzzleStep.Wrong, p.Press(-1, t + c.gaps[0].y + 1f), $"{c.id}: too slow starts over");
                    t += c.gaps[0].y + 1f;
                    for (var i = 0; i < c.gaps.Length; i++)
                    {
                        t += (c.gaps[i].x + c.gaps[i].y) * 0.5f;
                        var step = p.Press(-1, t);
                        Assert.AreEqual(i == c.gaps.Length - 1 ? PuzzleStep.Solved : PuzzleStep.Progress, step, $"{c.id} press {i + 2}");
                    }
                }
            }
        }
    }
}
