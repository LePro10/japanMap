using System.Collections;
using JapanMap.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests
{
    /// <summary>
    /// The real way for collision: boot the game, drop rigid bodies onto the imported map and see
    /// where they come to rest. Positions are fixed spots of the legacy map (Unity coordinates).
    /// </summary>
    public class MapCollisionTests
    {
        [TearDown]
        public void TearDown()
        {
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        // name, x, z, expected rest height of the ball's bottom, tolerance
        static readonly (string name, float x, float z, float ground, float tol)[] Drops =
        {
            ("terrain at origin checkpoint", 0f, 0f, 52.65f, 0.15f),
            ("pass road at the ring junction", -552.21f, 343.88f, 41.60f, 0.15f),
            ("city street on the slab", 640f, -262f, 30.00f, 0.1f),
            ("roof of the temple hall placeholder", 820f, 954f, 162.35f, 0.15f),
        };

        [UnityTest]
        public IEnumerator DroppedBalls_RestOnTerrainRoadsAndProps()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            Assert.AreEqual("Game", SceneManager.GetActiveScene().name);
            // A Boot scene loaded while the previous test's Bootstrapper is still being destroyed loads
            // Game a second time a frame later; objects spawned before that would be thrown away.
            for (var f = 0; f < 10; f++) yield return null;

            const float radius = 0.25f;
            var balls = new Rigidbody[Drops.Length];
            for (var i = 0; i < Drops.Length; i++)
            {
                var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                ball.transform.localScale = Vector3.one * (radius * 2);
                ball.transform.position = new Vector3(Drops[i].x, Drops[i].ground + 6f, Drops[i].z);
                balls[i] = ball.AddComponent<Rigidbody>();
                balls[i].collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
                // Fall straight down only: on a slope a free ball would roll away from the spot under test.
                balls[i].constraints = RigidbodyConstraints.FreezePositionX | RigidbodyConstraints.FreezePositionZ | RigidbodyConstraints.FreezeRotation;
            }

            yield return new WaitForSeconds(3f);

            for (var i = 0; i < Drops.Length; i++)
            {
                var bottom = balls[i].position.y - radius;
                Assert.That(bottom, Is.EqualTo(Drops[i].ground).Within(Drops[i].tol),
                    $"{Drops[i].name}: ball rests at {bottom:F2} m, expected {Drops[i].ground:F2} m");
            }
        }
    }
}
