using System.Collections;
using JapanMap.Core;
using JapanMap.Core.Save;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Intro;
using JapanMap.Gameplay.Progress;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// The first drive (human, 2026-10-11: "Wo ist unser Intro mit den Jumps hin?"): a new player boots into a rolling
    /// car, jumps the coast kicker in slow motion, lands for Sparks; skipping is remembered; a returning player gets none.
    /// </summary>
    [FreshSave]
    public class IntroTests
    {
        [TearDown]
        public void TearDown()
        {
            FirstDrive.RunInEditor = false;
            Time.timeScale = 1f;
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator Boot()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 20; f++) yield return null;
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator NewPlayer_RollsIntoTheJump_SlowMotion_LandsForSparks_SkipIsRemembered()
        {
            FirstDrive.RunInEditor = true;
            yield return Boot();
            var intro = Object.FindAnyObjectByType<FirstDrive>();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.NotNull(intro, "FirstDrive in Game.unity (ContentSetup)");
            Assert.AreNotEqual(FirstDrive.Beat.Off, intro.Current, "a new player starts in the intro");
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current, "in the car, not on foot");
            Assert.Greater(player.Car.Telemetry.speed, 20f, "rolling start (~95 km/h)");

            var slowest = 1f;
            for (var w = 0f; intro.Current != FirstDrive.Beat.Landed && intro.Current != FirstDrive.Beat.Drift && w < 25f; w += Time.unscaledDeltaTime)
            {
                if (intro.Current == FirstDrive.Beat.Air) slowest = Mathf.Min(slowest, Time.timeScale);
                yield return null;
            }
            Assert.Less(slowest, 0.5f, "the jump plays in slow motion (the assist carries an idle player over the ramp)");
            Assert.AreEqual(FirstDrive.Beat.Landed, intro.Current, "landed after the jump");
            Assert.GreaterOrEqual(intro.Earned, 500, "a landing pays");
            for (var w = 0f; Time.timeScale < 0.99f && w < 2f; w += Time.unscaledDeltaTime) yield return null;
            Assert.AreEqual(1f, Time.timeScale, 0.01f, "real time after the landing");

            intro.Skip();
            Assert.AreEqual(FirstDrive.Beat.Off, intro.Current);
            Assert.AreEqual(1f, Time.timeScale);
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            Assert.Contains(FirstDrive.Claim, progress.Data.claims, "seen: never again");
        }

        [UnityTest, Timeout(60000)]
        public IEnumerator ReturningPlayer_GetsNoIntro()
        {
            ProgressStore.Save(FreshSaveAttribute.Store, new ProgressData { claims = { FirstDrive.Claim } });
            FirstDrive.RunInEditor = true;
            yield return Boot();
            Assert.AreEqual(FirstDrive.Beat.Off, Object.FindAnyObjectByType<FirstDrive>().Current);
        }
    }
}
