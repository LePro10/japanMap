using System.Collections;
using JapanMap.Core;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// The game's own path: Boot → Game, the spawner puts the car on a road, a keyboard drives it
    /// through the Drive actions, R puts it back on the road.
    /// </summary>
    public class PlayerDriveTests
    {
        Keyboard _keyboard;

        [SetUp]
        public void SetUp() => _keyboard = InputSystem.AddDevice<Keyboard>("TestKeyboard");

        [TearDown]
        public void TearDown()
        {
            if (_keyboard != null) InputSystem.RemoveDevice(_keyboard);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(keys));
            InputSystem.Update();
        }

        [UnityTest]
        public IEnumerator Keyboard_DrivesTheSpawnedCar_AndRespawnPutsItBackOnTheRoad()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;

            var spawner = Object.FindFirstObjectByType<PlayerCarSpawner>();
            Assert.NotNull(spawner, "Game scene has no PlayerCarSpawner");
            var car = spawner.Current;
            Assert.NotNull(car, "no car spawned");
            yield return new WaitForSeconds(0.5f);
            Assert.AreEqual(4, car.Telemetry.groundedWheels, "car does not stand on four wheels");
            Assert.AreEqual(Surface.Asphalt, car.Telemetry.surface);

            var start = car.transform.position;
            Press(Key.W);
            yield return new WaitForSeconds(3f);
            var kmh = car.Telemetry.speed * 3.6f;
            Assert.That(kmh, Is.GreaterThan(40f), "W does not accelerate the car");
            Assert.That(Vector3.Distance(start, car.transform.position), Is.GreaterThan(15f));

            // Throw the car off the road, then R.
            Press();
            car.Place(car.transform.position + car.transform.right * 40f, 90f, fromAbove: 50f);
            yield return new WaitForFixedUpdate();
            Press(Key.R);
            yield return null;
            Press();
            yield return new WaitForSeconds(0.5f);
            var network = Object.FindFirstObjectByType<VehicleRespawn>().Locator;
            Assert.NotNull(network, "respawn has no road locator");
            Assert.IsTrue(network.TryNearest(car.transform.position, car.transform.forward, 50f, out var road, out _));
            var off = new Vector2(road.x - car.transform.position.x, road.z - car.transform.position.z).magnitude;
            Assert.That(off, Is.LessThan(0.5f), $"after R the car is {off:F2} m from the road centre");
            Assert.That(car.Telemetry.speed, Is.LessThan(1f));
        }
    }
}
