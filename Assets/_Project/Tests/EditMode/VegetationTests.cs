using System.Linq;
using JapanMap.Editor.Map;
using JapanMap.Editor.Vegetation;
using JapanMap.World;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>Vegetation in Game.unity (Phase 4, D18): instanced renderer, not Terrain trees.</summary>
    public class VegetationTests
    {
        [SetUp]
        public void OpenGameScene() => MapScene.OpenGameScene();

        [Test]
        public void Renderer_HasDataAndInstancedMaterial()
        {
            var r = Object.FindObjectsByType<InstanceRenderer>().FirstOrDefault(x => x.data is VegetationData);
            Assert.IsNotNull(r, "no tree InstanceRenderer — run JapanMap/Vegetation/Import");
            Assert.IsNotNull(r.data);
            Assert.That(r.data.Count, Is.GreaterThan(20000), "forest missing");
            Assert.AreEqual(r.data.Count, r.data.chunks.Sum(c => c.runs.Sum(run => run.count)), "runs do not cover all instances");
            foreach (var p in r.data.prototypes)
            {
                Assert.AreEqual(3, p.lods.Length, p.name);
                Assert.That(p.lods.All(m => m != null), p.name);
                Assert.IsTrue(p.material.enableInstancing, $"{p.name}: instancing off");
                Assert.AreEqual(p.lods.Length - 1, p.lodEnd.Length, p.name);
            }
        }

        /// <summary>Terrain trees drew one call per tree (44 500 measured); they must stay empty.</summary>
        /// <summary>Grass kept clear of standing buildings and ramps (it grew through the Open Bay floor and on Petal Hop until Phase 9).</summary>
        [Test]
        public void Grass_NotInTheOpenBay_NorOnARamp_ButOnTheLawn()
        {
            var t = Terrain.activeTerrain;
            var d = t.terrainData;
            int Grass(float x, float z)
            {
                var r = d.detailResolution;
                var px = Mathf.FloorToInt((x - t.transform.position.x) / d.size.x * r);
                var pz = Mathf.FloorToInt((z - t.transform.position.z) / d.size.z * r);
                return d.GetDetailLayer(px, pz, 1, 1, 0)[0, 0];
            }
            var garage = UnityEditor.AssetDatabase.LoadAssetAtPath<JapanMap.Gameplay.Garage.GarageSettings>("Assets/_Project/Data/Gameplay/GarageSettings.asset");
            Assert.AreEqual(0, Grass(garage.bay.x, garage.bay.z), "grass inside the Open Bay");
            var ramps = UnityEditor.AssetDatabase.LoadAssetAtPath<JapanMap.Gameplay.Stunts.RampSet>(JapanMap.Editor.Content.RampBuilder.Path);
            foreach (var r in ramps.ramps)
            {
                var mid = new Vector3(r.start.x, 0f, r.start.y) + r.Forward * (r.Length * 0.5f);
                Assert.AreEqual(0, Grass(mid.x, mid.z), $"grass on ramp {r.id}");
            }
            Assert.Greater(Grass(530f, -530f), 0, "the Sakura Commons lawn keeps its grass");
        }

        [Test]
        public void Terrain_HasNoTreeInstances()
        {
            foreach (var t in Terrain.activeTerrains)
                Assert.AreEqual(0, t.terrainData.treeInstanceCount, t.name);
        }

        [Test]
        public void NoTree_OnARoad()
        {
            var r = Object.FindObjectsByType<InstanceRenderer>().FirstOrDefault(x => x.data is VegetationData);
            var network = UnityEditor.AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            var hits = 0;
            for (var i = 0; i < r.data.Count; i += 7)
            {
                var p = r.data.positions[i];
                if (network.TryNearest(p, Vector3.forward, 6f, out var q, out _) && Vector2.Distance(new Vector2(p.x, p.z), new Vector2(q.x, q.z)) < 3f) hits++;
            }
            Assert.AreEqual(0, hits, "trees standing on road centre lines");
        }
    }
}
