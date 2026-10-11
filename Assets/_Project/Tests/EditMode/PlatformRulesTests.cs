using JapanMap.Core.Save;
using JapanMap.Gameplay.Economy;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Phase 10.1: the rewarded-ad pacing of ASTRA §12 and the save reconciliation behind "Choose progress" (§9).
    /// </summary>
    public class PlatformRulesTests
    {
        AdSettings _s;

        [SetUp]
        public void SetUp() => _s = ScriptableObject.CreateInstance<AdSettings>();

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_s);

        [Test]
        public void ResultBonus_NeedsLongEvent_FirstVisitWait_FiveMinuteGap_ThreePerHalfHour()
        {
            var p = new AdPolicy(_s);
            Assert.IsFalse(p.CanOfferResultBonus(120f, 200f), "not in the first five minutes of play");
            Assert.IsFalse(p.CanOfferResultBonus(30f, 900f), "events under 45 s get no offer");
            Assert.IsTrue(p.CanOfferResultBonus(45f, 900f));
            p.ResultWatched();
            p.Active += 4 * 60f;
            Assert.IsFalse(p.CanOfferResultBonus(60f, 900f), "one rewarded ad per five active minutes");
            p.Active += 60f;
            Assert.IsTrue(p.CanOfferResultBonus(60f, 900f));
            p.ResultWatched();
            p.Active += 5 * 60f;
            p.ResultWatched();
            p.Active += 5 * 60f;
            Assert.IsFalse(p.CanOfferResultBonus(60f, 900f), "three per rolling 30 active minutes");
            p.Active += 15 * 60f + 1f; // the first has left the window
            Assert.IsTrue(p.CanOfferResultBonus(60f, 900f));
        }

        [Test]
        public void LoanAd_TwentyMinutes_AndSharesTheFiveMinuteGap()
        {
            var p = new AdPolicy(_s);
            Assert.IsTrue(p.CanOfferLoanAd(900f));
            p.LoanWatched();
            p.Active += 10 * 60f;
            Assert.IsFalse(p.CanOfferLoanAd(900f), "one loan ad per 20 active minutes");
            Assert.IsTrue(p.CanOfferResultBonus(60f, 900f), "the result bonus only waits five minutes");
            p.ResultWatched();
            p.Active += 10 * 60f;
            Assert.IsTrue(p.CanOfferLoanAd(900f));
        }

        [Test]
        public void Midgame_NotInTheFirstThreeMinutes_ThreeMinuteGap_AlsoAfterARewardedAd_AndSwitchable()
        {
            var p = new AdPolicy(_s);
            p.Active = 2 * 60f;
            Assert.IsFalse(p.CanShowMidgame, "the first minutes decide whether a player stays");
            p.Active = 3 * 60f;
            Assert.IsTrue(p.CanShowMidgame);
            p.MidgameAsked();
            p.Active += 2 * 60f;
            Assert.IsFalse(p.CanShowMidgame, "one midgame per three active minutes");
            p.Active += 60f;
            Assert.IsTrue(p.CanShowMidgame);
            p.ResultWatched();
            Assert.IsFalse(p.CanShowMidgame, "no midgame right after a rewarded ad");
            p.Active += 3 * 60f;
            Assert.IsTrue(p.CanShowMidgame);
            _s.midgame = false;
            Assert.IsFalse(p.CanShowMidgame, "the data switch turns them off");
        }

        static string Json(int sparks, float play, long at, string owned = "hachi") =>
            $"{{\"version\":1,\"sparks\":{sparks},\"playSeconds\":{play},\"savedAt\":{at},\"cars\":[{{\"id\":\"{owned}\",\"owned\":true}}]}}";

        [Test]
        public void Reconcile_EmptyAccount_TakesTheDeviceCopy_Silently()
        {
            var device = new MemoryStore();
            var account = new MemoryStore();
            device.Write(SaveSync.Key, Json(500, 900, 100));
            Assert.IsNull(SaveSync.Reconcile(device, account, "guest"));
            Assert.AreEqual(device.Data[SaveSync.Key], account.Data[SaveSync.Key], "guest progress moved into the account");
            Assert.AreEqual("guest", device.Data[SaveSync.OwnerKey]);
        }

        [Test]
        public void Reconcile_LoginOntoAnAccountWithProgress_AsksAndKeepsTheOtherAsRecovery()
        {
            var device = new MemoryStore();
            var account = new MemoryStore();
            var guest = Json(500, 900, 200);
            var acc = Json(9000, 7200, 100, "mame");
            device.Write(SaveSync.Key, guest);
            device.Write(SaveSync.OwnerKey, "guest");
            account.Write(SaveSync.Key, acc);
            var mirrored = new MirroredStore(account, "user:1");
            var c = SaveSync.Reconcile(device, mirrored, "user:1");
            Assert.NotNull(c, "a login never replaces a guest's progress unasked");
            Assert.AreEqual(500, c.Device.sparks);
            Assert.AreEqual(9000, c.Account.sparks);
            Assert.AreEqual(1, c.Account.Cars);

            SaveSync.Resolve(keepAccount: false);
            Assert.IsNull(SaveSync.Pending);
            Assert.AreEqual(guest, account.Data[SaveSync.Key], "the chosen copy, whole — no sums");
            Assert.AreEqual(acc, account.Data[SaveSync.RecoveryKey], "the other copy stays as recovery");
            Assert.AreEqual("user:1", device.Data[SaveSync.OwnerKey]);
            Assert.AreEqual(9000, SaveSync.Recovery(account).sparks);

            Assert.IsTrue(SaveSync.SwapRecovery(account));
            Assert.AreEqual(acc, account.Data[SaveSync.Key], "the recovery copy can be taken back");
            Assert.AreEqual(guest, account.Data[SaveSync.RecoveryKey]);
        }

        [Test]
        public void Reconcile_NoQuestion_ForTheSameCopy_AFreshGuest_OrAnOlderCopyOfTheSamePlayer()
        {
            var device = new MemoryStore();
            var account = new MemoryStore();
            account.Write(SaveSync.Key, Json(9000, 7200, 300));
            device.Write(SaveSync.Key, Json(0, 20, 50));
            Assert.IsNull(SaveSync.Reconcile(device, account, "user:1"), "a fresh guest copy is not worth a question");
            device.Write(SaveSync.Key, Json(400, 900, 200));
            device.Write(SaveSync.OwnerKey, "user:1");
            Assert.IsNull(SaveSync.Reconcile(device, account, "user:1"), "the same player's newer account copy wins");
            device.Write(SaveSync.Key, Json(400, 900, 400));
            Assert.NotNull(SaveSync.Reconcile(device, account, "user:1"), "a newer copy left on this device (sync pending) asks");
        }
    }
}
