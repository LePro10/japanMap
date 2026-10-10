using System.Collections;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Races;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Phase 7 acceptance: every event driven from start to finish AI against AI (the player's car on
    /// autopilot), without a stuck car (no rescue), laps counted at the seam. Plus the join path:
    /// stop at a marker, E shows the card, E starts the countdown with every car held.
    /// </summary>
    [FreshSave]
    public class RaceAcceptanceTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        static readonly string[] Ids = { "coast-loop", "toge-descent", "neon-circuit", "toge-climb", "ring-trial", "toge-drift", "needle-sprint", "open-seat" };

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _kb = InputSystem.AddDevice<Keyboard>("TestKeyboard");
            InputSystem.EnableDevice(_kb);
        }

        [TearDown]
        public void TearDown()
        {
            Time.timeScale = 1f;
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_kb, new KeyboardState(keys));
            InputSystem.Update();
        }

        IEnumerator Tap(Key key)
        {
            Press(key);
            yield return null;
            Press();
            yield return null;
        }

        static IEnumerator BootGame()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;
        }

        IEnumerator BootInCar()
        {
            yield return BootGame();
            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(PlayerModeController.Mode.Driving, Object.FindAnyObjectByType<PlayerModeController>().Current);
        }

        [UnityTest, Timeout(900000)]
        public IEnumerator Event_AiAgainstAi_StartToFinish_NoStuckCar([ValueSource(nameof(Ids))] string id)
        {
            yield return BootInCar();
            var race = Object.FindAnyObjectByType<RaceDirector>();
            race.Autopilot = true;
            Assert.IsTrue(race.Begin(id), $"{id} did not start");
            var ev = race.Event;
            Assert.AreEqual(RaceDirector.State.Countdown, race.Current);

            // The grid holds during the countdown.
            var p0 = new Vector3[race.Entrants.Count];
            for (var i = 0; i < p0.Length; i++) p0[i] = race.Entrants[i].car.transform.position;
            yield return new WaitForSeconds(race.Set.countdown * 0.8f);
            for (var i = 0; i < p0.Length; i++)
                Assert.Less(Vector3.Distance(p0[i], race.Entrants[i].car.transform.position), 0.3f, $"{race.Entrants[i].name} crept during the countdown");

            Time.timeScale = 4f;
            var finished = false;
            race.Finished += _ => finished = true;
            var limit = race.Track.Length * Mathf.Max(1, ev.laps) / 8f + 60f; // ≥ 29 km/h average
            var start = Time.time;
            var lapsSeen = 0;
            var lapProgress = new System.Collections.Generic.List<float>();
            void Look()
            {
                var me = race.Entrants.Count > 0 ? race.Entrants[race.Entrants.Count - 1] : null;
                if (me != null && me.progress.Laps != lapsSeen)
                {
                    lapsSeen = me.progress.Laps;
                    lapProgress.Add(me.progress.Progress);
                }
            }
            while (!finished && race.Current != RaceDirector.State.Idle && Time.time - start < limit)
            {
                Look();
                yield return new WaitForFixedUpdate();
            }
            Look(); // the last lap is counted in the finishing step
            Time.timeScale = 1f;
            var r = race.Last;
            var lines = new System.Text.StringBuilder();
            foreach (var e in race.Entrants)
                lines.Append($"\n  {e.name}: {(e.progress.Finished ? $"finished {e.progress.FinishTime:0.0} s" : $"at {e.progress.Progress:0} / {e.progress.Distance:0} m")}, rescues {e.rescues}");
            Debug.Log($"[RaceAcceptance] {id}: {(finished ? $"{r.medal} {r.seconds:0.0} s, +{r.sparks} Sparks" : "NOT FINISHED")}, rescues {race.Rescues}, laps at {string.Join(", ", lapProgress)}{lines}");

            Assert.IsTrue(finished, $"{id} did not finish in {limit:0} s{lines}");
            Assert.IsTrue(r.completed, $"{id}: {r.medal}");
            if (ev.kind == RaceKind.Race)
            {
                var me = race.Entrants[race.Entrants.Count - 1];
                var ahead = 0;
                foreach (var e in race.Entrants) if (e != me && e.progress.Finished && e.progress.FinishTime < me.progress.FinishTime) ahead++;
                Assert.AreEqual(ahead + 1, r.place, "place = rivals over the line before the player + 1");
            }
            Assert.AreEqual(0, race.Rescues, $"{id}: a car got stuck{lines}");
            var unsticks = 0;
            foreach (var e in race.Entrants) if (e.pilot != null) unsticks += e.pilot.Unsticks;
            Assert.AreEqual(0, unsticks, $"{id}: a car had to reverse out of a stuck spot{lines}");
            if (race.Track.Closed)
            {
                Assert.AreEqual(ev.laps, lapProgress.Count, "one lap count per lap");
                for (var k = 0; k < lapProgress.Count; k++)
                    Assert.AreEqual((k + 1) * race.Track.Length, lapProgress[k], 2f, $"lap {k + 1} counted at the line");
            }
            // Every rival is on its way: finished, or at least half the distance.
            foreach (var e in race.Entrants)
                Assert.IsTrue(e.progress.Finished || e.progress.Progress > e.progress.Distance * 0.5f, $"{e.name} far behind{lines}");
        }

        [UnityTest]
        public IEnumerator JoinAtTheMarker_CardThenStart()
        {
            yield return BootInCar();
            var race = Object.FindAnyObjectByType<RaceDirector>();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var e = race.Set.events[0];
            var t = race.TrackOf(e, out var s0);
            var tan = t.TangentAt(s0);
            // Test setup like a fast travel: stopped on the road beside the marker.
            player.Car.Place(t.PointAt(s0) + new Vector3(tan.z, 0f, -tan.x) * 2f, Mathf.Atan2(tan.x, tan.z) * Mathf.Rad2Deg, fromAbove: 3f);
            yield return new WaitForSeconds(0.6f);
            yield return Tap(Key.E);
            Assert.AreEqual(RaceDirector.State.Card, race.Current, "E at the marker shows the card");
            var hud = Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.GameplayHud>();
            StringAssert.StartsWith(e.title, hud.SheetText, "the card names the event");
            StringAssert.Contains("Sparks", hud.SheetText, "the card shows the reward");
            yield return Tap(Key.E);
            Assert.AreEqual(RaceDirector.State.Countdown, race.Current, "E on the card starts");
            Assert.AreEqual("", hud.SheetText, "the card closes at the start");
            Assert.IsTrue(hud.HoldNotices, "notices wait while the event runs (ASTRA §10)");
            Assert.AreEqual(e.id, race.Event.id);
            Assert.IsTrue(player.Car.HoldStill);
            race.Abort("test over");
            Assert.IsFalse(hud.HoldNotices, "notices flow again after the event");
        }
    }
}
