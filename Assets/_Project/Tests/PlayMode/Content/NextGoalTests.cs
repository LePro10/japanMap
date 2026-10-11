using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Map;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Phase 11/3: a new player is pointed at the nearest event without a medal after a short drive (CrazyGames: "set
    /// clear goals"); a player with two finished events is not, and a waypoint the player set is never replaced.
    /// </summary>
    [FreshSave]
    public class NextGoalTests
    {
        [TearDown]
        public void TearDown()
        {
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        public enum Start { New, TwoEventsDone, OwnWaypoint }

        [UnityTest, Timeout(90000)]
        public IEnumerator Guide_PointsNewPlayersAtTheNextEvent([Values] Start start)
        {
            if (start == Start.TwoEventsDone)
                ProgressStore.Save(FreshSaveAttribute.Store, new ProgressData
                {
                    events = new List<EventRecord> { new() { id = "a", runs = 1, finishes = 1 }, new() { id = "b", runs = 1, finishes = 1 } },
                });
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var guide = Object.FindAnyObjectByType<NextGoalGuide>();
            var map = Object.FindAnyObjectByType<MapSystem>();
            var races = Object.FindAnyObjectByType<RaceDirector>();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            Assert.NotNull(guide, "NextGoalGuide in Game.unity (ContentSetup)");
            // 25 s of driving in the game; one second here.
            typeof(NextGoalGuide).GetField("afterDriving", BindingFlags.NonPublic | BindingFlags.Instance).SetValue(guide, 1f);
            var own = new Vector2(100f, 100f);
            if (start == Start.OwnWaypoint) map.Waypoint = own;

            player.PressVehicle();
            for (var w = 0f; player.Current != PlayerModeController.Mode.Driving && w < 5f; w += Time.unscaledDeltaTime) yield return null;
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual("", guide.LastGoal, "free driving first");
            yield return new WaitForSeconds(1.5f);

            switch (start)
            {
                case Start.New:
                    Assert.IsTrue(map.Waypoint.HasValue, "the next event became the waypoint");
                    var nearest = float.MaxValue;
                    foreach (var (at, _) in races.Markers) nearest = Mathf.Min(nearest, Vector2.Distance(map.Waypoint.Value, new Vector2(at.x, at.z)));
                    Assert.Less(nearest, 0.1f, "on an event start");
                    StringAssert.AreNotEqualIgnoringCase("", guide.LastGoal);
                    break;
                case Start.TwoEventsDone:
                    Assert.IsFalse(map.Waypoint.HasValue, "two finished events: the player knows the way");
                    break;
                case Start.OwnWaypoint:
                    Assert.AreEqual(own, map.Waypoint, "the player's own waypoint stays");
                    break;
            }
        }
    }
}
