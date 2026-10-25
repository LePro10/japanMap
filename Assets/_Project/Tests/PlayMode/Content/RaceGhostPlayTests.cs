using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Races;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// The ghost on the game's path (POLISH E): a finished time trial saves the run; the next start shows it as a
    /// see-through car that drives the route while the player is on it, and it is gone after the event.
    /// </summary>
    [FreshSave]
    public class RaceGhostPlayTests
    {
        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        [UnityTest, Timeout(400000)]
        public IEnumerator TimeTrial_SavesTheRun_NextStartDrivesItsGhost()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            while (SceneManager.GetActiveScene().name != "Game") yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            player.Seat();
            yield return new WaitForSeconds(0.5f);
            var race = Object.FindAnyObjectByType<RaceDirector>();
            race.Autopilot = true;
            var done = false;
            race.Finished += _ => done = true;

            Assert.IsTrue(race.Begin("ring-trial"));
            Assert.IsNull(race.GhostCar, "no ghost before the first finish");
            Time.timeScale = 4f;
            var t0 = Time.time;
            while (!done && Time.time - t0 < 600f) yield return null;
            Time.timeScale = 1f;
            Assert.IsTrue(done && race.Last.completed, "the first run finishes");
            Assert.IsTrue(FreshSaveAttribute.Store.TryRead(RaceGhost.Key("ring-trial"), out var saved), "the run is saved");
            var ghost = RaceGhost.Decode(saved);
            Assert.NotNull(ghost);
            Assert.AreEqual(race.Last.seconds, ghost.seconds, 1e-3f);
            Assert.That(ghost.Duration, Is.GreaterThan(ghost.seconds - 5f), "recorded to the line");
            while (race.Current != RaceDirector.State.Idle) yield return null;

            Assert.IsTrue(race.Begin("ring-trial"));
            Assert.NotNull(race.GhostCar, "the second start shows the ghost");
            Assert.That(race.GhostCar.GetComponentsInChildren<MeshRenderer>(true).Length, Is.GreaterThan(3), "the car's parts");
            Assert.IsEmpty(race.GhostCar.GetComponentsInChildren<Collider>(true), "a ghost has no physics");
            var start = race.GhostCar.transform.position;
            while (race.Current != RaceDirector.State.Running) yield return null;
            Time.timeScale = 4f;
            t0 = Time.time;
            while (Time.time - t0 < 12f) yield return null; // 12 s of the run
            Time.timeScale = 1f;
            var moved = Vector3.Distance(start, race.GhostCar.transform.position);
            Assert.That(moved, Is.GreaterThan(60f), "the ghost drives the route");
            race.Abort("test");
            Assert.IsNull(race.GhostCar, "gone after the event");
        }
    }
}
