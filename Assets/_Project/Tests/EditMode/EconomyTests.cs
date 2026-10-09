using System.IO;
using System.Linq;
using JapanMap.Editor.Content;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Races;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// The simulated economy (Phase 8.1): ordinary ten-minute sessions land in ASTRA's 2 400–3 600, drift alone
    /// approaches it under the cap, no event pays an outlier per minute, the first car is reachable after the
    /// first session — and docs/ECONOMY.md is what the data says today.
    /// </summary>
    public class EconomyTests
    {
        [Test]
        public void OrdinarySessions_LandInAstraBand()
        {
            var sim = EconomySeed.Sim();
            var e = ContentSetup.Asset<EconomySettings>("EconomySettings");
            var profiles = sim.Profiles();
            Assert.GreaterOrEqual(profiles.Count(p => p.ordinary), 2);
            foreach (var p in profiles.Where(p => p.ordinary))
                Assert.That(p.sparks, Is.InRange(e.sessionBand.x, e.sessionBand.y), p.name);
            foreach (var p in profiles.Where(p => p.approach))
                Assert.That(p.sparks, Is.InRange(sim.ApproachFloor, sim.DriftCeiling), $"{p.name}: close to the band, never above the cap");
        }

        [Test]
        public void NoEvent_PaysAnOutlierPerMinute()
        {
            var sim = EconomySeed.Sim();
            var e = ContentSetup.Asset<EconomySettings>("EconomySettings");
            var rates = sim.EventRates();
            var median = rates.Select(r => r.PerMinute).OrderBy(x => x).ElementAt(rates.Count / 2);
            foreach (var r in rates)
            {
                Assert.Greater(r.seconds, 0f, $"{r.id}: no measured typicalSeconds");
                Assert.LessOrEqual(r.PerMinute, median * e.outlierFactor, r.id);
                Assert.GreaterOrEqual(r.PerMinute, median / e.outlierFactor, r.id);
            }
        }

        [Test]
        public void FirstSession_BuysTheCheapestCar_EveryCarHasAPrice()
        {
            var sim = EconomySeed.Sim();
            var first = sim.Profiles().First(p => p.name == "Erste Sitzung");
            var fleet = AssetDatabase<VehicleFleet>(JapanMap.Editor.Vehicles.FleetSeed.FleetPath);
            var paid = fleet.vehicles.Where(v => v.price > 0).OrderBy(v => v.price).ToList();
            Assert.AreEqual(fleet.vehicles.Length - 1, paid.Count, "exactly one starter car is free");
            Assert.AreEqual(0, fleet.Default.price, "the starter is the free one");
            Assert.GreaterOrEqual(first.sparks + first.oneTime, paid[0].price);
        }

        [Test]
        public void Table_IsCurrent()
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), EconomySeed.TablePath);
            Assert.IsTrue(File.Exists(path), "run JapanMap/Economy/Write Table");
            Assert.AreEqual(EconomySeed.Sim().Markdown().Replace("\r", ""), File.ReadAllText(path).Replace("\r", ""),
                "data changed: run JapanMap/Economy/Write Table and commit docs/ECONOMY.md");
        }

        [Test]
        public void Sim_UsesTheGamesBankRule()
        {
            // The table's drift money runs through the same bank as the wallet: a capped flood pays the cap.
            var e = ScriptableObject.CreateInstance<EconomySettings>();
            try
            {
                var bank = new ScoreSparkBank();
                Assert.AreEqual(e.scoreSparkCap, bank.Convert(e, 1e7f, 0f));
                Assert.AreEqual(0, bank.Convert(e, 1e7f, e.scoreCapWindow - 1f));
            }
            finally { Object.DestroyImmediate(e); }
        }

        static T AssetDatabase<T>(string path) where T : Object => UnityEditor.AssetDatabase.LoadAssetAtPath<T>(path);
    }
}
