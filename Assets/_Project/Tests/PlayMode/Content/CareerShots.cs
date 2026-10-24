using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Core.Save;
using JapanMap.Core.Ui;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Career;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Intro;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Progress;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// Pictures of the career (D50) in every form factor, batchmode-safe like <see cref="UiShots"/>: the goal card with
    /// its meter, the ticked card, an UNLOCKED banner, the goal chip on a menu page and the career tile on Play.
    /// Captures/ui/career-*.png via <c>node Tools/ui-shots.mjs</c>.
    /// </summary>
    [FreshSave, Explicit, Category("UiShots")]
    public class CareerShots
    {
        [TearDown]
        public void TearDown()
        {
            CareerSystem.RunInEditor = false;
            UiShots.RestorePanel();
            UiPanel.ForcedForm = null;
            Time.timeScale = 1f;
            AudioListener.pause = false;
            if (GameMenu.Instance != null && GameMenu.Instance.IsOpen) GameMenu.Instance.Close();
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
            Unlocks.Query = null;
        }

        static readonly (string name, FormFactor form, int w, int h)[] Forms =
        {
            ("desktop", FormFactor.Desktop, 1280, 720),
            ("portrait", FormFactor.PhonePortrait, 390, 844),
            ("landscape", FormFactor.PhoneLandscape, 844, 390),
        };

        [UnityTest, Timeout(240000)]
        public IEnumerator CareerCardBannerAndMenu_AllForms()
        {
            // A save at the drift goal: the first drive and the Open Bay done.
            var asset = UnityEditor.AssetDatabase.LoadAssetAtPath<CareerSettings>("Assets/_Project/Data/Gameplay/Career.asset");
            var saved = new ProgressData { claims = { CareerChain.On, FirstDrive.Claim }, sparks = 2600 };
            foreach (var s in asset.steps.TakeWhile(s => s.goal != CareerGoal.DriftChain)) saved.claims.Add(CareerChain.Claim(s));
            ProgressStore.Save(FreshSaveAttribute.Store, saved);
            CareerSystem.RunInEditor = true;
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            Object.FindAnyObjectByType<PlayerModeController>().Seat();
            var career = CareerSystem.Instance;
            for (var w = 0f; career.Overlay.Pending > 0 || career.Overlay.Goal == ""; w += Time.unscaledDeltaTime)
            {
                if (w > 15f) break;
                yield return null;
            }
            yield return new WaitForSecondsRealtime(0.6f);
            var drift = Object.FindAnyObjectByType<DriftScorer>();
            Drive(drift.Chain, 5f); // part of the way: the meter shows
            yield return new WaitForSecondsRealtime(0.3f);
            foreach (var f in Forms) yield return UiShots.Shot($"career-card-{f.name}", f.form, f.w, f.h, 0.8f);

            // Ticked: the check, then the next chapter's goal and an unlock banner (Street Skills' end opens the map).
            Drive(drift.Chain, 30f);
            drift.Chain.Bank();
            yield return UiShots.Shot("career-done-desktop", FormFactor.Desktop, 1280, 720, 0.35f);
            // Set-up only (pictures): the rest of Street Skills marked done; the next chapter announces itself.
            yield return new WaitForSecondsRealtime(1.6f);
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            foreach (var s in asset.steps.TakeWhile(s => s.id != "open-map")) progress.Grant(CareerChain.Claim(s), 0, "shot");
            for (var w = 0f; !career.Overlay.LastBanner.Contains("CHAPTER") && w < 6f; w += Time.unscaledDeltaTime) yield return null;
            yield return UiShots.Shot("career-chapter-desktop", FormFactor.Desktop, 1280, 720, 0.5f);
            // Open the map: the goal ticks on the system's own path, and its unlock is announced back on the road.
            var menu = GameMenu.Instance;
            menu.Open(menu.Screen<MapScreen>());
            yield return new WaitForSecondsRealtime(1f);
            menu.Close();
            for (var w = 0f; !career.Overlay.LastBanner.Contains("UNLOCKED") && w < 8f; w += Time.unscaledDeltaTime) yield return null;
            yield return UiShots.Shot("career-banner-desktop", FormFactor.Desktop, 1280, 720, 0.5f);
            yield return UiShots.Shot("career-banner-portrait", FormFactor.PhonePortrait, 390, 844, 0.5f);

            yield return new WaitForSecondsRealtime(3f);
            menu.Open(menu.Screen<PlayScreen>());
            yield return new WaitForSecondsRealtime(1.2f);
            yield return UiShots.Shot("career-menu-play-desktop", FormFactor.Desktop, 1280, 720, 1.0f);
            yield return UiShots.Shot("career-menu-play-portrait", FormFactor.PhonePortrait, 390, 844, 1.0f);
            menu.Show(menu.Screen<CarsScreen>());
            yield return UiShots.Shot("career-menu-cars-desktop", FormFactor.Desktop, 1280, 720, 1.0f);
            menu.Close();
        }

        static void Drive(DriftChain chain, float seconds)
        {
            var v = 60f / 3.6f;
            for (var t = 0f; t < seconds; t += 0.02f)
                chain.Step(0.02f, new DriftSample { speed = v, forwardSpeed = v, slip = 30f * Mathf.Deg2Rad });
        }
    }
}
