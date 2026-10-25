using System.Collections;
using System.IO;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using JapanMap.Gameplay.Records;
using JapanMap.Gameplay.Stunts;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Records and photos on the game's path (Phase 8.4): a jump over Petal Hop sets airtime and distance records,
    /// pays the 15 m milestone once and gets a card picture when the car stands; Tab shows it; an event loan makes
    /// no records; P pauses into photo mode, the camera stays on its leash, Enter saves a large PNG without HUD.
    /// </summary>
    [FreshSave]
    public class RecordsTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

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

        static IEnumerator BootInCar(RecordsTests t)
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;
            yield return t.Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator JumpOverPetalHop_SetsRecords_PaysMilestoneOnce_TakesACard_TabShowsIt()
        {
            yield return BootInCar(this);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var stunts = Object.FindAnyObjectByType<StuntScorer>();
            var keeper = Object.FindAnyObjectByType<RecordKeeper>();
            var sheet = Object.FindAnyObjectByType<RecordsSheet>();
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);
            var ramp = stunts.Ramps.ramps.First(r => r.id == "petal-hop");
            var foot = new Vector3(ramp.start.x, 0f, ramp.start.y);
            var car = player.Car;
            // Setup like RampTests: 40 m before the kicker at the hinted speed, the player floors it (W).
            car.Place(foot - ramp.Forward * 40f, ramp.yaw, fromAbove: 300f);
            yield return new WaitForFixedUpdate();
            car.Body.linearVelocity = car.transform.forward * 68f / 3.6f;
            StuntResult? jump = null;
            void OnScored(StuntResult x) { if (x.ramp >= 0) jump = x; }
            stunts.Scored += OnScored;
            Press(Key.W);
            for (var t = 0f; t < 10f && jump == null; t += Time.deltaTime) yield return null;
            stunts.Scored -= OnScored;
            Assert.IsNotNull(jump, "no jump from Petal Hop");
            var r = progress.Data.records;
            Assert.AreEqual(jump.Value.airtime, r.airtime, 1e-3f, "airtime record");
            Assert.AreEqual(jump.Value.distance, r.jumpMetres, 1e-3f, "jump record");
            Assert.Greater(r.topKmh, 50f, "held road speed record on the run-up");
            if (jump.Value.distance >= 15f)
                Assert.IsTrue(progress.Claimed("milestone:JumpMetres:15"), "15 m milestone");

            // Stop and stand: the card picture is taken in the calm moment, not at the landing.
            Press(Key.S, Key.Space);
            for (var t = 0f; t < 8f && keeper.CardsTaken == 0; t += Time.deltaTime) yield return null;
            Press();
            Assert.Greater(keeper.CardsTaken, 0, "card picture after standing still");
            Assert.IsNotNull(RecordKeeper.LoadCard(JapanMap.Gameplay.Economy.MilestoneKind.JumpMetres), "jump card in the save store");
            var balance = progress.Wallet.Balance;

            yield return Tap(Key.Tab);
            Assert.IsTrue(sheet.IsOpen, "Tab opens the records");
            StringAssert.Contains($"Jump distance {r.jumpMetres:0} m", sheet.Text);
            yield return Tap(Key.Tab);
            Assert.IsFalse(sheet.IsOpen);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current, "back in the car");
            Assert.IsFalse(player.Suspended);
            Assert.AreEqual(balance, progress.Wallet.Balance, "opening the records pays nothing");
        }

        [UnityTest]
        public IEnumerator Sheet_TilesOneHeight_TwoAcrossUpright_NoLeftoverCard()
        {
            yield return BootInCar(this);
            // A card picture an older save left in its own key: this fresh save lists no card, so none may show.
            var jpg = new Texture2D(8, 8);
            JapanMap.Core.Save.SaveStores.Current.Write(RecordKeeper.CardKeyPrefix + JapanMap.Gameplay.Economy.MilestoneKind.TopSpeedKmh,
                System.Convert.ToBase64String(jpg.EncodeToJPG()));
            Object.Destroy(jpg);
            yield return Tap(Key.Tab);
            var menu = JapanMap.Gameplay.Menu.GameMenu.Instance;
            Assert.IsTrue(menu.IsOpen, "Tab opens the records");
            try
            {
                foreach (var (form, w, h) in new[] { (JapanMap.Core.Ui.FormFactor.Desktop, 1920, 1080), (JapanMap.Core.Ui.FormFactor.PhonePortrait, 390, 844) })
                {
                    yield return UiShots.Layout(form, w, h, 0.5f);
                    var tiles = menu.Root.Query(className: "nm-stat").ToList();
                    Assert.AreEqual(RecordKeeper.Headline.Length, tiles.Count, $"{form}: one tile per record");
                    var height = tiles[0].layout.height;
                    foreach (var t in tiles)
                    {
                        Assert.AreEqual(height, t.layout.height, 1f, $"{form}: tiles one height (one without a picture was shorter)");
                        Assert.IsNull(t.Q(className: "jm-pic").resolvedStyle.backgroundImage.texture, $"{form}: a card picture this save does not list");
                    }
                    if (form == JapanMap.Core.Ui.FormFactor.PhonePortrait)
                        Assert.That(tiles[0].layout.width, Is.GreaterThan(tiles[0].parent.layout.width * 0.4f), "upright two tiles fill the row (one narrow column)");
                }
            }
            finally
            {
                UiShots.RestorePanel();
                JapanMap.Core.Ui.UiPanel.ForcedForm = null;
                JapanMap.Core.Ui.UiPanel.Refresh(force: true);
            }
        }

        [UnityTest, Timeout(300000)]
        public IEnumerator EventLoan_MakesNoRecords()
        {
            yield return BootInCar(this);
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var race = Object.FindAnyObjectByType<RaceDirector>();
            race.Autopilot = true;
            var finished = false;
            race.Finished += _ => finished = true;
            Assert.IsTrue(race.Begin("open-seat"));
            Time.timeScale = 4f;
            var t0 = Time.time;
            while (!finished && Time.time - t0 < 200f) yield return null;
            Time.timeScale = 1f;
            Assert.IsTrue(finished);
            Assert.AreEqual(0f, progress.Data.records.topKmh, "the Needle loan sets no speed record (ASTRA §9)");
            Assert.AreEqual(0f, progress.Data.records.distanceKm);
        }

        [UnityTest, Timeout(120000)]
        public IEnumerator PhotoMode_Pauses_KeepsTheLeash_SavesALargePngWithoutHud()
        {
            yield return BootInCar(this);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var photo = Object.FindAnyObjectByType<PhotoMode>();
            var hud = Object.FindAnyObjectByType<GameplayHud>();
            var carAt = player.Car.transform.position;

            yield return Tap(Key.P);
            Assert.IsTrue(photo.IsOpen, "P opens photo mode");
            Assert.AreEqual(0f, Time.timeScale, "the game is paused");
            Assert.IsTrue(hud.Hidden);
            // Fly far away: the leash holds the camera within 100 m / 40 m of the player.
            for (var i = 0; i < 40; i++) photo.Step(new Vector3(0f, 1f, 1f), 1f);
            var cam = Camera.main.transform.position;
            Assert.LessOrEqual(new Vector2(cam.x - carAt.x, cam.z - carAt.z).magnitude, 100.5f);
            Assert.LessOrEqual(cam.y - carAt.y, 40.5f);
            Assert.Less(Vector3.Distance(carAt, player.Car.transform.position), 0.05f, "nothing moves while paused");

            yield return Tap(Key.Enter);
            Assert.IsTrue(File.Exists(photo.LastPhoto), $"photo file {photo.LastPhoto}");
            Assert.AreEqual(2560, photo.LastSize.x, "desktop capture width (ASTRA §11)");
            StringAssert.StartsWith("Ameagari-Drive_", Path.GetFileName(photo.LastPhoto), "the store name, not the project name");
            File.Delete(photo.LastPhoto);

            yield return Tap(Key.P);
            Assert.IsFalse(photo.IsOpen);
            Assert.AreEqual(1f, Time.timeScale);
            Assert.IsFalse(hud.Hidden);
            Assert.AreEqual(PlayerModeController.Mode.Driving, player.Current);
        }
    }
}

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Ring Time Trial benchmark per car (STATUS open item): the autopilot drives the trial in every car of the fleet;
    /// the benchmark is that time × 1.1 (Hachi H8: 228 s → 250 s, the existing target). Writes Captures/ring-bench.json
    /// for "JapanMap/Economy/Seed Ring Benchmarks". Explicit: about ten minutes.
    /// </summary>
    [FreshSave, Explicit("Report, start by name")]
    public class RingBenchmarkReport
    {
        [UnityTest, Timeout(1800000)]
        public IEnumerator WriteRingTimes()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            while (SceneManager.GetActiveScene().name != "Game") yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var race = Object.FindAnyObjectByType<RaceDirector>();
            var lines = new System.Collections.Generic.List<string>();
            foreach (var def in spawner.Fleet.vehicles)
            {
                spawner.SpawnAt(def, player.Car.transform.position, player.Car.transform.eulerAngles.y);
                player.Seat();
                yield return new WaitForSeconds(0.5f);
                race.Autopilot = true;
                var done = false;
                void OnDone(RaceDirector.Result _) => done = true;
                race.Finished += OnDone;
                Assert.IsTrue(race.Begin("ring-trial"), def.id);
                Time.timeScale = 4f;
                var t0 = Time.time;
                while (!done && Time.time - t0 < 600f) yield return null;
                Time.timeScale = 1f;
                race.Finished -= OnDone;
                var r = race.Last;
                lines.Add($"{{\"car\":\"{def.id}\",\"seconds\":{r.seconds.ToString(System.Globalization.CultureInfo.InvariantCulture)},\"completed\":{(r.completed ? "true" : "false")},\"rescues\":{race.Rescues}}}");
                Debug.Log($"[RingBench] {def.id} {r.seconds:0.0} s completed={r.completed} rescues={race.Rescues}");
                while (race.Current != RaceDirector.State.Idle) yield return null;
            }
            Directory.CreateDirectory("Captures");
            File.WriteAllText("Captures/ring-bench.json", "[\n" + string.Join(",\n", lines) + "\n]\n");
        }
    }
}
