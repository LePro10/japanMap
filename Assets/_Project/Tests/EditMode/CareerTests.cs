using System;
using System.Collections.Generic;
using System.Linq;
using JapanMap.Core;
using JapanMap.Editor.Content;
using JapanMap.Gameplay.Career;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Intro;
using JapanMap.Gameplay.Races;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;

namespace JapanMap.Tests
{
    /// <summary>
    /// The career chain as data (D50, docs/CAREER.md): sound (no dead end, every lockable feature opened once, texts for
    /// keys and touch), state from claims only, the pacing of the first ten minutes, and rewards that fit the simulated
    /// economy — every buy step affordable from what the chain paid so far, the whole career at most two sessions.
    /// </summary>
    public class CareerTests
    {
        static CareerSettings Asset()
        {
            var a = AssetDatabase.LoadAssetAtPath<CareerSettings>("Assets/_Project/Data/Gameplay/Career.asset");
            Assert.NotNull(a, "run JapanMap/Career/Create Or Link Asset");
            return a;
        }

        [Test]
        public void Asset_IsLinkedFromTheIntro_AndHasNoProblems()
        {
            var a = Asset();
            Assert.AreSame(a, AssetDatabase.LoadAssetAtPath<IntroSettings>("Assets/_Project/Data/Gameplay/IntroSettings.asset").career, "FirstDrive builds the career from IntroSettings.career");
            var problems = new CareerChain(a, _ => false).Problems();
            Assert.IsEmpty(problems, string.Join("\n", problems));
            Assert.AreEqual(CareerGoal.IntroDone, a.steps[0].goal, "the first drive is step one");
            foreach (var s in a.steps) StringAssert.DoesNotContain("{", CareerChain.Title(s), $"{s.id}: format left over");
        }

        [Test]
        public void EveryFeature_IsOpenedOnce_OnlyNitroAndStuntsFromTheStart()
        {
            var chain = new CareerChain(Asset(), _ => false);
            var open = new[] { FeatureId.Nitro, FeatureId.Stunts }; // the first drive teaches them in minute one
            foreach (FeatureId f in Enum.GetValues(typeof(FeatureId)))
            {
                if (open.Contains(f)) { Assert.AreEqual(-1, chain.Opener(f), $"{f} is open from the start"); continue; }
                Assert.GreaterOrEqual(chain.Opener(f), 0, $"{f}: no step opens it — locked forever");
                Assert.IsFalse(chain.IsUnlocked(f), $"{f} locked on a new save");
                Assert.IsNotEmpty(chain.Requirement(f));
            }
        }

        [Test]
        public void State_IsTheClaims_InOrder_AndDoneOpensAll()
        {
            var a = Asset();
            var claims = new HashSet<string>();
            var chain = new CareerChain(a, claims.Contains);
            Assert.AreEqual(0, chain.Index);
            Assert.IsFalse(chain.IsUnlocked(FeatureId.Garage));
            Assert.AreEqual("Finish the first drive", chain.Requirement(FeatureId.Garage));
            var raised = 0;
            Unlocks.Query = chain;
            Unlocks.Changed += () => raised++;
            try
            {
                Assert.AreEqual("Unlocks: Finish the first drive", Unlocks.Hint(FeatureId.Garage));
                claims.Add(CareerChain.Claim(a.steps[0]));
                chain.Raise();
                Assert.AreEqual(1, raised, "menus hear about it");
                Assert.AreEqual(1, chain.Index);
                Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Garage));
                Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Tuning));
                Assert.IsFalse(Unlocks.IsUnlocked(FeatureId.Map));
                // A step done out of order (a save from another version) does not skip the one before it.
                claims.Add(CareerChain.Claim(a.steps[3]));
                Assert.AreEqual(1, chain.Index);
                claims.Add(CareerChain.Done);
                Assert.IsTrue(chain.Complete);
                foreach (FeatureId f in Enum.GetValues(typeof(FeatureId))) Assert.IsTrue(Unlocks.IsUnlocked(f), f.ToString());
            }
            finally { Unlocks.Query = null; }
        }

        [Test]
        public void Chapters_NumberThemselves()
        {
            var a = Asset();
            var chain = new CareerChain(a, _ => false);
            chain.Chapter(0, out var c0, out var count, out var first0, out var size0);
            Assert.AreEqual(1, c0);
            Assert.AreEqual(0, first0);
            Assert.AreEqual(1, size0, "First Drive is one step");
            chain.Chapter(2, out var c2, out _, out var first2, out var size2);
            Assert.AreEqual(2, c2);
            Assert.AreEqual(1, first2);
            Assert.AreEqual(3, size2, "Open Bay: bay, upgrade, paint");
            Assert.AreEqual(a.steps.Select(s => s.chapter).Distinct().Count(), count);
        }

        [Test]
        public void FirstTenMinutes_SomethingNewEvery90Seconds()
        {
            var t = 0f;
            foreach (var s in Asset().steps)
            {
                if (t > EconomySim.Session) break;
                // An event is one long thing on purpose (its checkpoints, countdown and result are the rhythm there).
                if (s.goal != CareerGoal.FinishEvents && s.goal != CareerGoal.MedalTier)
                    Assert.LessOrEqual(s.typicalSeconds, 90f, $"{s.id}: longer than 90 s without a new thing");
                Assert.Greater(s.typicalSeconds, 0f, $"{s.id}: no estimate (docs/CAREER.md, the economy table)");
                t += s.typicalSeconds;
            }
            var total = Asset().steps.Sum(s => s.typicalSeconds);
            Assert.That(total / 60f, Is.InRange(20f, 45f), "a long first session, not an afternoon");
        }

        /// <summary>
        /// Without the starter fund: the intro's own Sparks plus the chain's rewards (and the first race's completion pay)
        /// buy the cheapest part, a colour and the cheapest car at their steps. The fund is the net for a skipped intro.
        /// </summary>
        [Test]
        public void BuySteps_AreAffordable_FromWhatTheChainPaid()
        {
            var a = Asset();
            var intro = AssetDatabase.LoadAssetAtPath<IntroSettings>("Assets/_Project/Data/Gameplay/IntroSettings.asset");
            var tuning = EconomySeed.Tuning();
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(JapanMap.Editor.Vehicles.FleetSeed.FleetPath);
            var events = RaceSeed.LoadOrCreate();
            var balance = intro.rewardLanding + intro.rewardRoll + intro.rewardDrift + intro.rewardHome;
            foreach (var s in a.steps)
            {
                var price = s.goal switch
                {
                    CareerGoal.BuyTune => CarTune.All.Min(c => tuning.Price(c, 1)),
                    CareerGoal.BuyPaint => tuning.paintPrice,
                    CareerGoal.OwnCars => fleet.vehicles.Where(v => v.price > 0).Min(v => v.price),
                    _ => 0,
                };
                if (price > 0)
                {
                    Assert.IsTrue(s.fund, $"{s.id}: a buy step tops up (never a dead end)");
                    Assert.GreaterOrEqual(balance, price, $"{s.id}: {balance} Sparks by then, costs {price}");
                    balance -= price;
                }
                if (s.goal == CareerGoal.FinishEvents && s.amount <= 1f) balance += events.events.Min(e => e.completion);
                balance += s.reward;
            }
        }

        [Test]
        public void Rewards_FitTheEconomy()
        {
            var a = Asset();
            var e = ContentSetup.Asset<EconomySettings>("EconomySettings");
            var chain = new CareerChain(a, _ => false);
            Assert.LessOrEqual(chain.TotalReward(), 2 * e.sessionUnit, "the career pays at most two ordinary sessions");
            var smallestEvent = RaceSeed.LoadOrCreate().events.Min(x => x.completion);
            foreach (var s in a.steps) Assert.LessOrEqual(s.reward, smallestEvent, $"{s.id}: a step pays more than finishing an event");
            Assert.That(a.skipSparks, Is.InRange(1, e.sessionUnit * 1.5f), "skipping is not a shortcut to money");
            Assert.AreEqual(chain.TotalReward(), EconomySeed.Sim().CareerTotal(), "the economy table counts the career");
        }
    }
}
