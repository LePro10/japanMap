using System.Linq;
using JapanMap.Gameplay.Smash;
using JapanMap.World;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Breaking things apart (D47) without the game: every tree a car can fell and every post that kinks has a readable
    /// mesh (else the cut silently falls back to the old tip-over), and the cutter gives a stump and a top with the
    /// trunk where it is, and planks for a bench.
    /// </summary>
    public class SmashCutTests
    {
        static InstanceData Data(string name) => AssetDatabase.LoadAssetAtPath<InstanceData>(name == "TokyoInstances" ? "Assets/_Project/Data/Places/TokyoInstances.asset" : $"Assets/_Project/Data/World/{name}.asset");

        [Test]
        public void EveryBreakableMesh_IsReadable()
        {
            var unreadable = Data("VegetationInstances").prototypes
                .Where(p => p.colliderRadius > 0f && p.lods != null && p.lods.Length > 0 && !p.lods[0].isReadable)
                .Select(p => p.name).ToList();
            Assert.That(unreadable, Is.Empty, "trees with a trunk collider must be readable (LibraryModelRules.Breakable)");
            var posts = Data("TokyoInstances").prototypes
                .Where(p => p.name.Contains("StreetLight") || p.name.Contains("Bench"))
                .Where(p => !p.lods[0].isReadable).Select(p => p.name).ToList();
            Assert.That(posts, Is.Empty, "lamps and benches must be readable");
        }

        [Test]
        public void Tree_CutAtTheBumper_GivesStumpAndTop()
        {
            var sakura = Data("VegetationInstances").prototypes.First(p => p.name == "Lib_Tree_Sakura_Bloom").lods[0];
            Assert.IsTrue(MeshCutter.TryCut(sakura, 0.5f, true, new Vector2(0.1f, 0.5f), out var cut), "the cherry cuts");
            Assert.That(cut.below.bounds.max.y, Is.InRange(0.45f, 0.95f), "the stump ends at the cut (plus its splinters)");
            // (The top shares the tree's vertex list, so look at what its faces use, not its bounds.)
            Assert.That(LowestUsed(cut.above, sakura.subMeshCount), Is.InRange(0.45f, 0.55f), "the top's bark starts at the cut");
            Assert.That(cut.above.bounds.max.y, Is.EqualTo(sakura.bounds.max.y).Within(0.01f), "the top keeps the crown");
            Assert.That(cut.radius, Is.InRange(0.1f, 0.6f), "a trunk's radius at the cut");
            Assert.That(new Vector2(cut.centre.x, cut.centre.z).magnitude, Is.LessThan(0.5f), "the trunk is near the model's foot");
            Assert.That(cut.below.subMeshCount, Is.EqualTo(sakura.subMeshCount + 1), "an extra sub-mesh of fresh wood");
        }

        static float LowestUsed(Mesh m, int subMeshes)
        {
            // The cut pieces are uploaded GPU-only; in the editor a copy still reads.
            var v = new System.Collections.Generic.List<Vector3>();
            var min = float.MaxValue;
            var copy = Object.Instantiate(m);
            copy.GetVertices(v);
            for (var s = 0; s < subMeshes; s++)
                foreach (var i in copy.GetTriangles(s)) min = Mathf.Min(min, v[i].y);
            Object.DestroyImmediate(copy);
            return min;
        }

        [Test]
        public void LowPolyTrunk_StillLeavesAStump()
        {
            // The cedar's trunk has one ring of faces from the root to the first branches: faces are clipped at the cut.
            var sugi = Data("VegetationInstances").prototypes.First(p => p.name == "Lib_Tree_Sugi").lods[0];
            Assert.IsTrue(MeshCutter.TryCut(sugi, 0.6f, false, default, out var cut));
            Assert.That(cut.below.vertexCount, Is.GreaterThan(20), "a stump with faces");
            Assert.That(cut.below.bounds.max.y, Is.EqualTo(0.6f).Within(0.02f), "ending exactly at the cut");
        }

        [Test]
        public void Bench_BurstsIntoPlanks()
        {
            var bench = Data("TokyoInstances").prototypes.First(p => p.name.Contains("Bench")).lods[0];
            Assert.IsTrue(MeshCutter.TrySlices(bench, 3, out var planks), "the bench slices");
            Assert.That(planks.Length, Is.InRange(2, 3));
            Assert.That(planks.Sum(m => m.bounds.size.x), Is.GreaterThan(bench.bounds.size.x * 0.8f), "together as long as the bench");
        }
    }
}
