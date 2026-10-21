using System;
using System.Collections;
using System.IO;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Menu;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Pictures of the title and the menu in every form factor without a game window (batchmode renders no frames):
    /// the camera through <see cref="CameraShot"/>, the UI panel into a render texture, composited into
    /// Captures/ui/&lt;name&gt;.png. On demand only (<c>node Tools/ui-shots.mjs</c>) — a second agent without the editor
    /// gets the same proof a play script gives (D48).
    /// </summary>
    [FreshSave, Explicit, Category("UiShots")]
    public class UiShots
    {
        const string Dir = "Captures/ui";

        [SetUp]
        public void SetUp() => TitleScreen.ResetSession();

        [TearDown]
        public void TearDown()
        {
            TitleScreen.RunInEditor = false;
            Unlocks.Query = null;
            // The shared runtime panel drew into the shot's texture: back to the screen, or every later test's clicks and
            // taps miss the UI (screen input is not mapped into a panel with a target texture).
            var ps = UiPanel.Get(null);
            if (ps != null && ps.targetTexture != null)
            {
                var rt = ps.targetTexture;
                ps.targetTexture = null;
                rt.Release();
                UnityEngine.Object.Destroy(rt);
            }
            UiPanel.ForcedForm = null;
            Time.timeScale = 1f;
            AudioListener.pause = false;
            if (Bootstrapper.Instance != null) UnityEngine.Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator Boot()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
        }

        static readonly (string name, FormFactor form, int w, int h)[] Forms =
        {
            ("desktop", FormFactor.Desktop, 1280, 720),
            ("portrait", FormFactor.PhonePortrait, 390, 844),
            ("landscape", FormFactor.PhoneLandscape, 844, 390),
        };

        [UnityTest, Timeout(240000)]
        public IEnumerator TitleAndMenu_AllForms()
        {
            TitleScreen.RunInEditor = true;
            yield return Boot();
            for (var w = 0f; (TitleScreen.Instance == null || TitleScreen.Instance.Current != TitleScreen.State.Shown) && w < 20f; w += Time.unscaledDeltaTime) yield return null;
            Assert.NotNull(TitleScreen.Instance, "title");
            yield return new WaitForSecondsRealtime(2.5f); // the reveal plays out
            foreach (var f in Forms) yield return Shot($"title-{f.name}", f.form, f.w, f.h, 1.6f);
            // The focus moves to Settings: the second entry lights up.
            TitleScreen.Instance.SettingsButton.Focus();
            yield return Shot("title-settings-focus", FormFactor.Desktop, 1280, 720, 0.4f);
            TitleScreen.Instance.StartButton.Focus();

            TitleScreen.Instance.Begin();
            yield return Shot("title-out", FormFactor.Desktop, 1280, 720, 0.25f);
            for (var w = 0f; TitleScreen.Instance.Current != TitleScreen.State.Done && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            yield return new WaitForSecondsRealtime(1f);

            // In the car for the menu pictures (the new player starts on foot; the menu orbits the car then).
            UnityEngine.Object.FindAnyObjectByType<JapanMap.Gameplay.PlayerModeController>().Seat();
            yield return new WaitForSecondsRealtime(0.5f);
            var menu = GameMenu.Instance;
            menu.Open();
            yield return new WaitForSecondsRealtime(1.5f);
            foreach (var f in Forms) yield return Shot($"menu-play-{f.name}", f.form, f.w, f.h, 1.2f);
            menu.Show(menu.Screen<CarsScreen>());
            yield return Shot("menu-cars-desktop", FormFactor.Desktop, 1280, 720, 1.2f);
            var settings = menu.Screen<SettingsScreen>();
            menu.Show(settings);
            yield return Shot("menu-settings-desktop", FormFactor.Desktop, 1280, 720, 1.0f);
            settings.ShowPage(1);
            yield return Shot("menu-settings-display", FormFactor.Desktop, 1280, 720, 0.6f);
            settings.ShowPage(2);
            yield return Shot("menu-settings-sound", FormFactor.Desktop, 1280, 720, 0.6f);
            settings.ShowPage(0, keys: true);
            yield return Shot("menu-settings-keys", FormFactor.Desktop, 1280, 720, 0.6f);
            settings.ShowPage(0);
            yield return Shot("menu-settings-portrait", FormFactor.PhonePortrait, 390, 844, 1.0f);

            // What the career will lock: map, races, tuning, the car shop.
            Unlocks.Query = new LockSome(FeatureId.Map, FeatureId.Races, FeatureId.Tuning, FeatureId.CarShop, FeatureId.FastTravel);
            menu.Show(menu.Screen<PlayScreen>());
            yield return Shot("menu-locked-desktop", FormFactor.Desktop, 1280, 720, 1.2f);
            yield return Shot("menu-locked-portrait", FormFactor.PhonePortrait, 390, 844, 1.2f);
            menu.Close();
        }

        /// <summary>Lays the UI out for a form factor and size, waits, renders camera + UI into one PNG.</summary>
        public static IEnumerator Shot(string name, FormFactor form, int w, int h, float settle)
        {
            // The shared panel draws into a texture of the shot's size; switching its target re-attaches every
            // document a few frames later, so the target is set first and the layout settles after.
            var ps = FindDoc() != null ? FindDoc().panelSettings : null;
            RenderTexture rt = null;
            if (ps != null)
            {
                var old = ps.targetTexture;
                rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
                ps.targetTexture = rt;
                ps.clearColor = true;
                ps.colorClearValue = Color.clear;
                if (old != null) { old.Release(); UnityEngine.Object.Destroy(old); }
            }
            UiPanel.ForcedForm = form;
            UiPanel.Apply(new Vector2Int(w, h), 1f, Vector4.zero);
            var cam = Camera.main;
            if (cam != null) cam.aspect = w / (float)h;
            yield return new WaitForSecondsRealtime(settle);
            UiPanel.Apply(new Vector2Int(w, h), 1f, Vector4.zero); // a Refresh may have run meanwhile
            for (var f = 0; f < 3; f++) yield return null;
            Save(name, w, h, ps, rt);
        }

        static UIDocument FindDoc()
        {
            foreach (var d in UnityEngine.Object.FindObjectsByType<UIDocument>()) if (d.isActiveAndEnabled && d.panelSettings != null) return d;
            return null;
        }

        static void Save(string name, int w, int h, PanelSettings ps, RenderTexture rt)
        {
            var cam = Camera.main;
            var image = cam != null ? CameraShot.Render(cam, w, h) : new Texture2D(w, h, TextureFormat.RGB24, false);
            var ui = ps != null ? RenderUi(ps, rt, w, h) : null;
            if (ui != null)
            {
                if (Environment.GetEnvironmentVariable("JM_UI_LAYER") == "1") File.WriteAllBytes($"{Dir}/{name}-ui.png", ui.EncodeToPNG());
                var a = image.GetPixels();
                var b = ui.GetPixels();
                // UI Toolkit writes premultiplied colour.
                for (var i = 0; i < a.Length; i++) a[i] = new Color(b[i].r + a[i].r * (1f - b[i].a), b[i].g + a[i].g * (1f - b[i].a), b[i].b + a[i].b * (1f - b[i].a), 1f);
                image.SetPixels(a);
                image.Apply();
                UnityEngine.Object.Destroy(ui);
            }
            Directory.CreateDirectory(Dir);
            var path = $"{Dir}/{name}.png";
            File.WriteAllBytes(path, image.EncodeToPNG());
            UnityEngine.Object.Destroy(image);
            Debug.Log($"[UiShot] {path} {w}x{h} {UiPanel.Form} problems: {string.Join(" | ", UiLayoutProbe.Check())}");
        }

        /// <summary>Reads what the panel drew into its texture these last frames.</summary>
        static Texture2D RenderUi(PanelSettings ps, RenderTexture rt, int w, int h)
        {
            var old = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply();
            RenderTexture.active = old;
            return tex; // the texture stays the panel's target until the next shot (or the end of the test)
        }

        sealed class LockSome : IUnlockQuery
        {
            readonly FeatureId[] _locked;
            public LockSome(params FeatureId[] locked) => _locked = locked;
            public bool IsUnlocked(FeatureId id) => Array.IndexOf(_locked, id) < 0;
            public string Requirement(FeatureId id) => id switch
            {
                FeatureId.Map => "Finish the first drive",
                FeatureId.Races => "Reach driver level 2",
                FeatureId.Tuning => "Visit the Open Bay",
                FeatureId.CarShop => "Win your first race",
                _ => "Keep driving",
            };
            public event Action Changed { add { } remove { } }
        }
    }
}
