using System.Collections;
using JapanMap.Audio;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Garage;
using JapanMap.Gameplay.Progress;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Audio
{
    /// <summary>
    /// Sound on the player's path (Phase 9.4, ASTRA §6): the car's engine comes from its own bank and follows the
    /// gearbox — under throttle the loaded loops lead and the pitch rises with rpm, off throttle the overrun loops;
    /// a Sport engine bought in the garage adds its deeper layer; the Engine slider at 0 silences it; walking away
    /// leaves the engine idling, the menu pauses it.
    /// </summary>
    [FreshSave]
    public class AudioTests
    {
        Keyboard _kb;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;
        float _engineVolume;

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _kb = InputSystem.AddDevice<Keyboard>("TestKeyboard");
            InputSystem.EnableDevice(_kb);
            _engineVolume = SoundMix.Volume(SoundGroup.Engine);
        }

        [TearDown]
        public void TearDown()
        {
            SoundMix.SetVolume(SoundGroup.Engine, _engineVolume);
            Time.timeScale = 1f;
            AudioListener.pause = false;
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

        [UnityTest, Timeout(120000)]
        public IEnumerator Engine_FollowsTheGearbox_SportEngineIsHeard_SliderSilences()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null; // the previous test's Game scene is still active this frame
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            yield return Tap(Key.F);
            yield return new WaitForSeconds(0.5f);
            var player = Object.FindAnyObjectByType<PlayerModeController>();
            var audio = Object.FindAnyObjectByType<CarAudio>();
            Assert.NotNull(audio.Engine, "the car has an engine sound");
            Assert.AreEqual(player.Car.Definition.id, audio.Engine.Bank.carId, "its own bank");
            Assert.Greater(audio.Engine.LayerLevel, 0f, "idling is heard");

            Press(Key.W);
            yield return new WaitForSeconds(1.2f);
            Assert.Greater(audio.Engine.OnLevel, audio.Engine.OffLevel, "under throttle the loaded loops lead");
            var p1 = audio.Engine.MainPitch;
            var rpm1 = player.Car.Gearbox.Rpm;
            yield return new WaitForSeconds(0.6f);
            Press();
            yield return new WaitForSeconds(0.3f);
            Assert.Greater(audio.Engine.OffLevel, audio.Engine.OnLevel, "off throttle: overrun loops");
            Assert.Less(audio.Engine.DeepLevel, 1e-4f, "stock engine: no Sport layer");
            Debug.Log($"[AudioTest] rpm {rpm1:0} pitch {p1:0.00} on {audio.Engine.OnLevel:0.00} off {audio.Engine.OffLevel:0.00}");

            // A Sport engine from the garage (its own action, as the button calls it) adds the deeper loaded layer.
            var progress = Object.FindAnyObjectByType<PlayerProgress>();
            var garage = Object.FindAnyObjectByType<GarageSystem>();
            progress.Wallet.Restore(100000);
            garage.Pick(player.Car.Definition.id);
            Assert.IsTrue(garage.Fit(TuneCategory.Engine, 2), "Sport engine fitted");
            garage.ApplySoon();
            for (var w = 0f; w < 3f && (audio.Engine == null || audio.Engine.Tier < 2); w += Time.deltaTime) yield return null;
            Assert.AreEqual(2, audio.Engine.Tier, "the rebuilt car knows its Sport engine");
            Press(Key.W);
            yield return new WaitForSeconds(1.2f);
            Assert.Greater(audio.Engine.DeepLevel, 0.01f, "Sport is audible as a deeper layer, not a transposition");

            SoundMix.SetVolume(SoundGroup.Engine, 0f);
            yield return null;
            yield return null;
            Assert.AreEqual(0f, audio.Engine.LayerLevel, 1e-5f, "Engine slider at 0: silent");
            Press();
        }
            /// <summary>Two sounds at two places stay at their places (all voices once shared one object: a new sound moved the old).</summary>
        [UnityTest, Timeout(60000)]
        public IEnumerator PositionedSounds_KeepTheirOwnPlace()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            for (var w = 0f; SceneManager.GetActiveScene().name != "Game" && w < 10f; w += Time.unscaledDeltaTime) yield return null;
            for (var f = 0; f < 5; f++) yield return null;
            var a = new Vector3(10f, 0f, 0f);
            var b = new Vector3(-30f, 0f, 50f);
            Sfx.Play("Impact_Car_Hard", 1f, a);
            Sfx.Play("Impact_Car_Hard", 1f, b);
            var at = new System.Collections.Generic.List<Vector3>();
            foreach (var s in Object.FindAnyObjectByType<Sfx>().GetComponentsInChildren<AudioSource>())
                if (s.isPlaying && s.clip != null && s.clip.name.Contains("Impact_Car_Hard")) at.Add(s.transform.position);
            Assert.AreEqual(2, at.Count, "two voices play");
            Assert.That(at, Has.Some.Matches<Vector3>(p => (p - a).sqrMagnitude < 0.01f), "the first sound stays where it was played");
            Assert.That(at, Has.Some.Matches<Vector3>(p => (p - b).sqrMagnitude < 0.01f));
        }
    }
}
