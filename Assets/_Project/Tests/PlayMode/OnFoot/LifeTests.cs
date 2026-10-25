using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Life;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.OnFoot
{
    /// <summary>
    /// Phase 6.5: the place actors (workers, fishers, visitors, animals) stand on the ground at their
    /// spots, the two walk-in shops exist, and the walker walks into the corner mart with W.
    /// </summary>
    [FreshSave]
    public class LifeTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _kb = InputSystem.AddDevice<Keyboard>("TestKeyboard");
            InputSystem.EnableDevice(_kb);
        }

        [TearDown]
        public void TearDown()
        {
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_kb != null) InputSystem.RemoveDevice(_kb);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator BootGame()
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
        }

        [UnityTest]
        public IEnumerator Actors_StandOnTheGround_AtTheirPlaces()
        {
            yield return BootGame();
            var actors = Object.FindAnyObjectByType<PlaceActors>();
            Assert.NotNull(actors, "no PlaceActors in Game.unity");
            var data = actors.Data.actors;
            Assert.That(data.Count(a => a.place != "world"), Is.EqualTo(37), "6 Sakura + 17 Funaura + 14 Stillwater");
            // World animals beside map props (AnimalSpots): pigeons at shrines, crows on poles, dogs at farms.
            Assert.That(data.Count(a => a.place == "world"), Is.InRange(30, 120), "world animals");
            foreach (var kind in new[] { "worker", "fisher", "visitor", "seated", "cat", "goat", "chicken", "pigeon", "crow", "crowPerch", "dog" })
                Assert.That(data.Count(a => a.kind == kind), Is.GreaterThan(0), kind);
            foreach (var a in data)
            {
                if (a.kind == "crowPerch")
                {
                    Assert.IsTrue(Physics.Raycast(a.position + new Vector3(2f, -0.5f, 0f), Vector3.down, out var below, 20f, ~GameLayers.NotGround), $"pole crow at {a.position}: no ground (2 m beside the pole, clear of it)");
                    Assert.That(a.position.y - below.point.y, Is.GreaterThan(4.5f), $"pole crow at {a.position} is not up on a pole");
                    continue;
                }
                Assert.IsTrue(Physics.Raycast(a.position + Vector3.up * 3f, Vector3.down, out var hit, 10f, ~GameLayers.NotGround), $"{a.place} {a.kind}: no ground under {a.position}");
                Assert.That(Mathf.Abs(hit.point.y - a.position.y), Is.LessThan(1f), $"{a.place} {a.kind} floats or sinks at {a.position}");
            }
        }

        [UnityTest]
        public IEnumerator Seated_StandsUp_WhenItsBenchBreaks()
        {
            yield return BootGame();
            var actors = Object.FindAnyObjectByType<PlaceActors>();
            var smash = Object.FindAnyObjectByType<JapanMap.Gameplay.Smash.SmashSystem>();
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            mode.PressVehicle();
            var spot = actors.Data.actors.First(a => a.kind == "seated");
            var car = mode.Car;
            car.Place(spot.position + new Vector3(8f, 0f, 8f), 0f, fromAbove: 3f);
            GameObject seated = null;
            for (var f = 0; f < 120 && seated == null; f++)
            {
                yield return null;
                seated = actors.GetComponentsInChildren<Transform>().Select(t => t.gameObject)
                    .FirstOrDefault(g => g.name == $"{spot.place} seated" && (g.transform.position - spot.position).sqrMagnitude < 0.01f);
            }
            Assert.NotNull(seated, "the seated actor is shown near the player");
            var bench = smash.Breakables.Where(b => !b.Broken).OrderBy(b => (b.Bounds.center - spot.position).sqrMagnitude).First();
            Assert.That(Vector3.Distance(bench.Bounds.center, spot.position), Is.LessThan(2.5f), $"no breakable seat under the seated actor ({bench.name})");
            var figure = seated.GetComponentInChildren<JapanMap.OnFoot.HitoFigure>();
            var sitting = figure.Clip;
            Assert.IsTrue(PlaceActors.SeatAt(spot.position), "the seat is found before the break");
            smash.Break(bench, car.Body, Vector3.forward * 8f);
            for (var f = 0; f < 5; f++) yield return null;
            Assert.IsTrue(bench.Broken);
            Assert.AreEqual("Idle", figure.Clip, $"stood up (it hung in the air where the {bench.name} was)");
            Assert.IsFalse(PlaceActors.SeatAt(spot.position), "no seat while the bench is broken");
            // Away and back while the bench is still broken: stays standing. Bench back: sits again.
            yield return AwayAndBack(car, spot.position);
            Assert.AreEqual("Idle", figure.Clip, "no sitting on a broken bench");
            bench.SetBroken(false);
            yield return new WaitForFixedUpdate();
            yield return AwayAndBack(car, spot.position);
            Assert.AreEqual(sitting, figure.Clip, "back on the restored bench");
        }

        static IEnumerator AwayAndBack(JapanMap.Vehicles.VehicleController car, Vector3 spot)
        {
            car.Place(spot + new Vector3(400f, 0f, 0f), 0f, fromAbove: 600f);
            for (var f = 0; f < 40; f++) yield return null;
            car.Place(spot + new Vector3(8f, 0f, 8f), 0f, fromAbove: 3f);
            for (var f = 0; f < 40; f++) yield return null;
        }

        [UnityTest]
        public IEnumerator Walker_WalksIntoTheCornerMart()
        {
            yield return BootGame();
            var shops = Object.FindAnyObjectByType<ShopInteriors>();
            Assert.That(shops.Built, Is.EqualTo(2), "diner and corner mart");
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            // Setup: stand on the pavement 8 m in front of the mart's open south front, facing it.
            var front = new Vector3(578f, 600f, -50f);
            Physics.Raycast(front, Vector3.down, out var g, 1200f, ~GameLayers.NotGround);
            mode.Walker.Place(g.point, 0f);
            yield return new WaitForSeconds(0.5f);
            InputSystem.QueueStateEvent(_kb, new KeyboardState(Key.W));
            InputSystem.Update();
            yield return new WaitForSeconds(2.2f);
            InputSystem.QueueStateEvent(_kb, new KeyboardState());
            InputSystem.Update();
            var p = mode.Walker.transform.position;
            Assert.That(p.z, Is.GreaterThan(-43f), $"walker went through the front into the shop, is at {p}");
            Assert.That(p.z, Is.LessThan(-34f), "and stopped at the back wall");
        }
    }
}
