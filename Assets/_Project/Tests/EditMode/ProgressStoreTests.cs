using JapanMap.Core.Save;
using JapanMap.Gameplay.Progress;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JapanMap.Tests
{
    /// <summary>
    /// The save on its own (Phase 8.3): everything ASTRA §9 lists comes back; a save that does not parse is set
    /// aside and the backup or a fresh start is used; hand-edited nonsense is repaired, never believed.
    /// </summary>
    public class ProgressStoreTests
    {
        const int Max = 9_999_999;

        static ProgressData Sample()
        {
            var d = new ProgressData { sparks = 4321, selectedCar = "mame" };
            d.claims.Add("region:commons");
            d.purchases.Add("car:mame");
            var c = d.Car("mame");
            c.owned = true;
            c.tune = new CarTune { engine = 2, brakes = 1 };
            c.setup = CarSetupMode.Drift;
            c.paint = "Navy";
            c.paints.Add("Navy");
            c.wheels = 1;
            c.wheelSets.Add(1);
            d.regions.Add("commons");
            d.discoveries.Add("SC1");
            d.decals.Add("Petal Stripe");
            var e = d.Event("open-seat");
            e.finishes = 1;
            e.bestTier = 3;
            e.bests.Add(new BestEntry { car = "hanami", tune = "loan", seconds = 61.5f, balance = 1 });
            d.records.topKmh = 212f;
            d.hasLastPosition = true;
            d.lastPosition = new Vector3(560f, 26f, -500f);
            d.lastYaw = 90f;
            return d;
        }

        [Test]
        public void SaveThenLoad_BringsEverythingBack()
        {
            var store = new MemoryStore();
            Assert.IsTrue(ProgressStore.Save(store, Sample()));
            var d = ProgressStore.Load(store, Max, out var from);
            Assert.AreEqual(ProgressStore.Source.Saved, from);
            Assert.AreEqual(4321, d.sparks);
            Assert.AreEqual("mame", d.selectedCar);
            CollectionAssert.AreEqual(new[] { "region:commons" }, d.claims);
            var c = d.Car("mame", false);
            Assert.IsTrue(c.owned);
            Assert.AreEqual("E2 B1 S0 T0", c.tune.Code);
            Assert.AreEqual(CarSetupMode.Drift, c.setup);
            Assert.AreEqual("Navy", c.paint);
            Assert.AreEqual(1, c.wheels);
            CollectionAssert.AreEqual(new[] { "commons" }, d.regions);
            CollectionAssert.AreEqual(new[] { "SC1" }, d.discoveries);
            CollectionAssert.AreEqual(new[] { "Petal Stripe" }, d.decals);
            Assert.AreEqual(3, d.Event("open-seat").bestTier);
            Assert.AreEqual(61.5f, d.Event("open-seat").bests[0].seconds);
            Assert.AreEqual(212f, d.records.topKmh);
            Assert.IsTrue(d.hasLastPosition);
            Assert.AreEqual(new Vector3(560f, 26f, -500f), d.lastPosition);
        }

        [Test]
        public void BrokenSave_IsSetAside_BackupIsUsed()
        {
            var store = new MemoryStore();
            ProgressStore.Save(store, new ProgressData { sparks = 100 });
            ProgressStore.Save(store, new ProgressData { sparks = 200 }); // the 100 save becomes the backup
            store.Write(ProgressStore.Key, "{\"version\":1,\"sparks\":3"); // truncated write
            LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("did not parse"));
            var d = ProgressStore.Load(store, Max, out var from);
            Assert.AreEqual(ProgressStore.Source.Backup, from);
            Assert.AreEqual(100, d.sparks);
            Assert.IsTrue(store.TryRead(ProgressStore.CorruptKey, out var kept));
            StringAssert.StartsWith("{\"version\":1", kept, "the broken save is kept, not overwritten silently");

            // The next save must not turn the broken text into the backup.
            ProgressStore.Save(store, d);
            Assert.IsTrue(store.TryRead(ProgressStore.BackupKey, out var backup));
            Assert.AreNotEqual(kept, backup);
        }

        [Test]
        public void GarbageEverywhere_StartsFresh_WithoutThrowing()
        {
            var store = new MemoryStore();
            store.Write(ProgressStore.Key, "not json at all <<<");
            store.Write(ProgressStore.BackupKey, "");
            LogAssert.ignoreFailingMessages = true;
            var d = ProgressStore.Load(store, Max, out var from);
            LogAssert.ignoreFailingMessages = false;
            Assert.AreEqual(ProgressStore.Source.Fresh, from);
            Assert.AreEqual(0, d.sparks);
            Assert.IsNotNull(d.records);
            Assert.IsNotNull(d.cars);
        }

        [Test]
        public void SaveFromANewerGame_IsNotMisread()
        {
            var store = new MemoryStore();
            store.Write(ProgressStore.Key, "{\"version\":99,\"sparks\":5000}");
            LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("did not parse"));
            var d = ProgressStore.Load(store, Max, out var from);
            Assert.AreEqual(ProgressStore.Source.Fresh, from);
            Assert.AreEqual(0, d.sparks);
        }

        [Test]
        public void HandEditedNonsense_IsRepaired()
        {
            var store = new MemoryStore();
            var json = JsonUtility.ToJson(Sample())
                .Replace("\"sparks\":4321", "\"sparks\":-50")
                .Replace("\"engine\":2", "\"engine\":7")
                .Replace("\"topKmh\":212.0", "\"topKmh\":1e30");
            json = json.Replace("\"claims\":[\"region:commons\"]", "\"claims\":[\"region:commons\",\"region:commons\",\"\"]");
            store.Write(ProgressStore.Key, json);
            var d = ProgressStore.Load(store, Max, out _);
            Assert.AreEqual(0, d.sparks, "negative balance");
            Assert.AreEqual(2, d.Car("mame", false).tune.engine, "tier above Sport");
            Assert.LessOrEqual(d.records.topKmh, 600f, "impossible record");
            CollectionAssert.AreEqual(new[] { "region:commons" }, d.claims, "duplicates and empty ids");
        }
    }
}
