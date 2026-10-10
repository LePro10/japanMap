using JapanMap.Audio;
using JapanMap.Editor.Audio;
using JapanMap.Editor.Map;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Sound in the scene and the banks (Phase 9.4): exactly one AudioListener, on the main camera (the game had none
    /// until Phase 9 — nothing would have been heard); the sound player and the car sound are wired; every car has an
    /// engine bank with all its loops; the bank names every sound the code plays.
    /// </summary>
    public class AudioSceneTests
    {
        [SetUp]
        public void OpenGameScene() => MapScene.OpenGameScene();

        [Test]
        public void Scene_HasOneListener_OnTheMainCamera_AndTheSoundPlayer()
        {
            var listeners = Object.FindObjectsByType<AudioListener>(FindObjectsInactive.Include);
            Assert.AreEqual(1, listeners.Length, "exactly one AudioListener");
            Assert.AreEqual("Main Camera", listeners[0].gameObject.name);
            var sfx = Object.FindAnyObjectByType<Sfx>();
            Assert.NotNull(sfx, "sound player in the scene");
            Assert.NotNull(new SerializedObject(sfx).FindProperty("bank").objectReferenceValue, "sound bank wired");
            var car = Object.FindAnyObjectByType<JapanMap.Gameplay.CarAudio>();
            Assert.NotNull(car, "car sound in the scene");
            Assert.AreEqual(10, new SerializedObject(car).FindProperty("banks").arraySize, "an engine bank per car");
        }

        [Test]
        public void EveryEngineBank_HasAllLoops_AndRisingSteps()
        {
            var n = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:JapanMap.Audio.EngineSoundBank", new[] { AudioSetup.DataDir }))
            {
                var b = AssetDatabase.LoadAssetAtPath<EngineSoundBank>(AssetDatabase.GUIDToAssetPath(guid));
                Assert.NotNull(b.idle, $"{b.carId} idle");
                Assert.NotNull(b.lift, $"{b.carId} lift-off");
                Assert.AreEqual(4, b.steps.Length, b.carId);
                var last = b.idleRpm;
                foreach (var s in b.steps)
                {
                    Assert.NotNull(s.onLoad, $"{b.carId} {s.rpm} on");
                    Assert.NotNull(s.offLoad, $"{b.carId} {s.rpm} off");
                    Assert.Greater(s.rpm, last, $"{b.carId} steps rise");
                    last = s.rpm;
                }
                n++;
            }
            Assert.AreEqual(10, n);
        }

        [Test]
        public void SoundBank_NamesEverySoundTheGamePlays()
        {
            var bank = AssetDatabase.LoadAssetAtPath<SoundBank>(AudioSetup.BankPath);
            foreach (var name in new[] { "UI_Click", "Countdown_Tick", "Countdown_Go", "Bell_Checkpoint", "Bell_Finish", "Bell_Win", "Bell_Discovery",
                         "Bell_Sparks", "Impact_Car_Soft", "Impact_Car_Mid", "Impact_Car_Hard", "Land_Thump", "Splash", "Whoosh_Up",
                         "Break_Tree", "Break_Rail", "Break_Wood", "Break_Barrel", "Break_Cone", "Roll_Asphalt", "Roll_Gravel", "Roll_Grass", "Roll_Water", "Skid_Asphalt", "Wind" })
            {
                Assert.IsTrue(bank.TryGet(name, out var e), name);
                Assert.NotNull(e.clip, $"{name}: no clip (not even a stand-in)");
            }
        }
    }
}
