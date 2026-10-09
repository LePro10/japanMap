using System.Collections;
using JapanMap.Core;
using JapanMap.DevTools;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests
{
    /// <summary>
    /// Goes the real way: load Boot, let it bring up the systems and switch to Game.
    /// Any Debug.LogError or exception during these frames fails the test (Test Framework default).
    /// </summary>
    [FreshSave]
    public class BootTests
    {
        [TearDown]
        public void TearDown()
        {
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        [UnityTest]
        public IEnumerator Boot_StartsSystems_AndLoadsGame()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }

            Assert.AreEqual("Game", SceneManager.GetActiveScene().name, "Game scene not active after 10 s");
            Assert.IsTrue(Bootstrapper.IsBooted);
            Assert.That(Bootstrapper.Instance.Systems, Has.All.Property(nameof(GameSystem.IsInitialized)).True);
            Assert.IsNotNull(Camera.main, "Game scene has no MainCamera");

            for (var i = 0; i < 30; i++) yield return null;

            var overlay = Bootstrapper.Instance.GetComponentInChildren<StatsOverlay>();
            Assert.IsNotNull(overlay, "StatsOverlay must exist in editor/development");
            Assert.Greater(overlay.Last.FrameMs, 0f);
            var l = overlay.Last;
            Debug.Log($"[StatsProbe] valid={l.RenderStatsValid} draw={l.DrawCalls} batches={l.Batches} setpass={l.SetPassCalls} tris={l.Triangles}");
        }
    }
}
