using System;
using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// The daily hook (2026-10-13): the bonus is paid once a day and grows with the streak (and restarts after a gap);
    /// the challenge is the same for everyone on a day, counts progress and pays once.
    /// </summary>
    [FreshSave]
    public class DailyTests
    {
        [TearDown]
        public void TearDown()
        {
            DailySystem.Now = () => DateTime.Now;
            if (Bootstrapper.Instance != null) UnityEngine.Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        [UnityTest, Timeout(60000)]
        public IEnumerator Bonus_OncePerDay_StreakGrows_GapResets_ChallengePaysOnce()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var daily = UnityEngine.Object.FindAnyObjectByType<DailySystem>();
            var progress = UnityEngine.Object.FindAnyObjectByType<PlayerProgress>();
            Assert.NotNull(daily, "DailySystem in the Game scene");
            var rewards = daily.Settings.streakRewards;

            var day = new DateTime(2026, 10, 13, 12, 0, 0);
            DailySystem.Now = () => day;
            progress.Data.dailyDay = "";
            var before = progress.Wallet.Balance;
            Assert.IsTrue(daily.CheckBonus(), "first visit of the day pays");
            Assert.AreEqual(before + rewards[0], progress.Wallet.Balance);
            Assert.AreEqual(1, daily.Streak);
            Assert.IsFalse(UnityEngine.Object.FindAnyObjectByType<GameplayHud>().BannerShown, "the toast names the reward: no second '+Sparks · Daily drive' line");
            Assert.IsFalse(daily.CheckBonus(), "only once a day");

            day = day.AddDays(1);
            before = progress.Wallet.Balance;
            Assert.IsTrue(daily.CheckBonus());
            Assert.AreEqual(2, daily.Streak, "the next day continues the streak");
            Assert.AreEqual(before + rewards[1], progress.Wallet.Balance);

            day = day.AddDays(3);
            Assert.IsTrue(daily.CheckBonus());
            Assert.AreEqual(1, daily.Streak, "a gap starts over");

            // Same challenge for the same date, from the date alone.
            Assert.AreEqual(DailySystem.Index("2026-10-17", 7), DailySystem.Index("2026-10-17", 7));
            yield return null; // Update resets the challenge for the new day
            var c = daily.Challenge;
            before = progress.Wallet.Balance;
            daily.Report(c.target * 0.5f, max: true);
            Assert.IsFalse(daily.ChallengeDone);
            daily.Report(c.target, max: true);
            Assert.IsTrue(daily.ChallengeDone, "reaching the target completes it");
            Assert.AreEqual(before + c.reward, progress.Wallet.Balance, "pays the reward");
            daily.Report(c.target * 2f, max: true);
            Assert.AreEqual(before + c.reward, progress.Wallet.Balance, "pays once");
            StringAssert.Contains("Daily challenge complete", UnityEngine.Object.FindAnyObjectByType<GameplayHud>().LastToast);
        }
    }
}
