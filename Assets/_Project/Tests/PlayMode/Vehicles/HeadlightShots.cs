using System.Collections;
using System.IO;
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
    /// Pictures of the headlights (D52) in the real game, batchmode-safe: the player's car on the pass road and on a
    /// city street, lights off / on / high beam, tiers Low and High, from the front and from behind (chase view), plus the
    /// brake and reversing lights from behind. Captures/lights/*.png; run on demand:
    /// <c>node Tools/verify.mjs --filter HeadlightShots --play</c> (or -testCategory HeadlightShots).
    /// </summary>
    [FreshSave, Explicit, Category("HeadlightShots")]
    public class HeadlightShots
    {
        const string Dir = "Captures/lights";
        Keyboard _keyboard;
        int _prefs;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            _prefs = PlayerPrefs.GetInt(HeadlightSwitch.PrefsKey, -1);
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _keyboard = InputSystem.AddDevice<Keyboard>("ShotKeyboard");
            InputSystem.EnableDevice(_keyboard);
        }

        [TearDown]
        public void TearDown()
        {
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_keyboard != null) InputSystem.RemoveDevice(_keyboard);
            if (_prefs < 0) PlayerPrefs.DeleteKey(HeadlightSwitch.PrefsKey);
            else PlayerPrefs.SetInt(HeadlightSwitch.PrefsKey, _prefs);
            HeadlightSwitch.Reload();
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        void Press(params Key[] keys)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(keys));
            InputSystem.Update();
        }

        [UnityTest, Timeout(300000)]
        public IEnumerator LightsOffOnHigh_LowAndHigh_FrontAndChase()
        {
            Directory.CreateDirectory(Dir);
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            Object.FindAnyObjectByType<JapanMap.Gameplay.PlayerModeController>().Seat();
            var spawner = Object.FindAnyObjectByType<PlayerCarSpawner>();
            var locator = Object.FindAnyObjectByType<VehicleRespawn>().Locator;

            foreach (var (place, at) in new[] { ("pass", new Vector3(-990f, 0f, 415f)), ("city", new Vector3(640f, 0f, -250f)) })
            {
                var car = spawner.Current;
                Assert.IsTrue(locator.TryNearest(at, Vector3.forward, 400f, out var p, out var f), $"no road near {place}");
                car.Place(p, Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg, fromAbove: 2f);
                car.HoldStill = true; // the pass road is steep: the car must not roll out of the picture
                yield return new WaitForSecondsRealtime(6f); // the place streams in, the car settles
                var lights = car.GetComponent<Headlights>();
                Assert.NotNull(lights, "player car has no Headlights");
                foreach (var tier in new[] { "High", "Low" })
                {
                    QualitySystem.SetTier(tier, save: false);
                    foreach (var mode in new[] { HeadlightMode.Off, HeadlightMode.Low, HeadlightMode.High })
                    {
                        if (place == "city" && mode == HeadlightMode.High) continue;
                        HeadlightSwitch.Mode = mode;
                        yield return new WaitForSecondsRealtime(0.8f);
                        var tag = $"{place}-{tier.ToLower()}-{mode.ToString().ToLower()}";
                        Shoot(car, $"{tag}-front", front: true);
                        Shoot(car, $"{tag}-chase", front: false);
                        if (place == "pass") Shoot(car, $"{tag}-top", front: false, top: true);
                        var pool = car.transform.Find("HeadlightBeam");
                        var down = pool != null && Physics.Raycast(pool.position + Vector3.up * 3f, Vector3.down, out var hit, 10f) ? hit.point.y : float.NaN;
                        Debug.Log($"[Lights] {tag}: pool at {(pool != null ? pool.position.ToString("F2") : "-")} ground below {down:F2} groundY {lights.Lamps.groundY:F2} frontZ {lights.Lamps.frontZ:F2} headL {lights.Lamps.headL:F2}");
                        Debug.Log($"[Lights] {tag}: spots {lights.ActiveSpots} cones {lights.ActiveCones} pool {lights.PoolVisible} head {lights.HeadLevel:0.00} tail {lights.TailLevel:0.00}");
                    }
                }
                if (place != "pass") continue;
                // Cost: chase-view render time, lights off vs on, per tier (same spot, same frame content).
                car.HoldStill = true;
                foreach (var tier in new[] { "High", "Medium", "Low" })
                {
                    QualitySystem.SetTier(tier, save: false);
                    var ms = new float[2];
                    for (var k = 0; k < 2; k++)
                    {
                        HeadlightSwitch.Mode = k == 0 ? HeadlightMode.Off : HeadlightMode.Low;
                        yield return new WaitForSecondsRealtime(0.6f);
                        ms[k] = RenderMs(car, 40);
                    }
                    Debug.Log($"[Lights] bench {tier}: off {ms[0]:0.00} ms, on {ms[1]:0.00} ms per chase-view render (1280x720, {lights.ActiveSpots} spots, {lights.ActiveCones} cones, pool {lights.PoolVisible})");
                }
                // Brake (S at rest, before the car reverses) and reversing light, seen from behind, tier High.
                QualitySystem.SetTier("High", save: false);
                HeadlightSwitch.Mode = HeadlightMode.Low;
                car.HoldStill = false;
                Press(Key.S);
                yield return new WaitForSecondsRealtime(0.25f);
                Shoot(car, "pass-high-brake-rear", front: false, rear: true);
                Debug.Log($"[Lights] brake: tail {lights.TailLevel:0.00}");
                yield return new WaitForSecondsRealtime(1.6f);
                Press();
                Press(Key.S);
                yield return new WaitForSecondsRealtime(0.4f);
                Shoot(car, "pass-high-reverse-rear", front: false, rear: true);
                Debug.Log($"[Lights] reverse: {lights.ReverseLevel:0.00} speed {car.Telemetry.forwardSpeed:0.0}");
                Press();
                yield return new WaitForSecondsRealtime(1.5f);
            }
        }

        /// <summary>Mean wall time of one chase-view render with a read-back (forces the GPU to finish), ms.</summary>
        static float RenderMs(VehicleController car, int frames)
        {
            var cam = Camera.main;
            var t = car.transform;
            var eye = t.position - t.forward * 6.4f + Vector3.up * 2.35f;
            var pos0 = cam.transform.position;
            var rot0 = cam.transform.rotation;
            cam.transform.SetPositionAndRotation(eye, Quaternion.LookRotation(t.position + t.forward * 6f + Vector3.up * 0.6f - eye));
            var rt = RenderTexture.GetTemporary(1280, 720, 24, RenderTextureFormat.ARGBHalf);
            var px = new Texture2D(1, 1, TextureFormat.RGBAHalf, false);
            var old = cam.targetTexture;
            cam.targetTexture = rt;
            void One()
            {
                cam.Render();
                RenderTexture.active = rt;
                px.ReadPixels(new Rect(0, 0, 1, 1), 0, 0, false);
                RenderTexture.active = null;
            }
            for (var i = 0; i < 5; i++) One(); // warm up
            var sw = System.Diagnostics.Stopwatch.StartNew();
            for (var i = 0; i < frames; i++) One();
            var ms = (float)sw.Elapsed.TotalMilliseconds / frames;
            cam.targetTexture = old;
            RenderTexture.ReleaseTemporary(rt);
            Object.Destroy(px);
            cam.transform.SetPositionAndRotation(pos0, rot0);
            return ms;
        }

        static void Shoot(VehicleController car, string name, bool front, bool rear = false, bool top = false)
        {
            var cam = Camera.main;
            var t = car.transform;
            Vector3 eye, look;
            if (top)
            {
                // From above and behind: the whole beam pattern at once.
                eye = t.position - t.forward * 4f + Vector3.up * 18f;
                look = t.position + t.forward * 14f;
            }
            else if (front)
            {
                // Ahead and to the left, low: the lamps, the glass and the pattern on the road between.
                eye = t.position + t.forward * 11f - t.right * 3.5f + Vector3.up * 1.4f;
                look = t.position + t.forward * 3f + Vector3.up * 0.4f;
            }
            else if (rear)
            {
                eye = t.position - t.forward * 6.5f + t.right * 2.2f + Vector3.up * 1.3f;
                look = t.position + Vector3.up * 0.6f;
            }
            else
            {
                // The chase view as CarCameraSettings has it (6.4 m behind, 2.35 m up, aimed 1 m above the car) — a
                // little higher aim, so the road ahead fills the picture.
                eye = t.position - t.forward * 6.4f + Vector3.up * 2.35f;
                look = t.position + t.forward * 6f + Vector3.up * 0.6f;
            }
            var pos0 = cam.transform.position;
            var rot0 = cam.transform.rotation;
            cam.transform.SetPositionAndRotation(eye, Quaternion.LookRotation(look - eye));
            var image = CameraShot.Render(cam, 768, 432);
            cam.transform.SetPositionAndRotation(pos0, rot0);
            var path = $"{Dir}/{name}.png";
            File.WriteAllBytes(path, image.EncodeToPNG());
            Object.Destroy(image);
            Debug.Log($"[UiShot] {path}");
        }
    }
}
