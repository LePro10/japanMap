using System.Collections.Generic;
using System.IO;
using System.Linq;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Tests
{
    /// <summary>
    /// Headlights without the game (D52): the switch (tap, double tap, saved), the wiring of the assets, the L key free of
    /// other bindings, cheap tiers, and lamp positions found in every car model.
    /// </summary>
    public class HeadlightTests
    {
        const string SettingsPath = "Assets/_Project/Data/Vehicles/Headlights.asset";
        int _saved;

        [SetUp]
        public void SetUp()
        {
            _saved = PlayerPrefs.GetInt(HeadlightSwitch.PrefsKey, -1);
            PlayerPrefs.DeleteKey(HeadlightSwitch.PrefsKey);
            HeadlightSwitch.Reload();
        }

        [TearDown]
        public void TearDown()
        {
            if (_saved < 0) PlayerPrefs.DeleteKey(HeadlightSwitch.PrefsKey);
            else PlayerPrefs.SetInt(HeadlightSwitch.PrefsKey, _saved);
            HeadlightSwitch.Reload();
        }

        static HeadlightSettings Settings => AssetDatabase.LoadAssetAtPath<HeadlightSettings>(SettingsPath);

        [Test]
        public void Switch_OnByDefault_TapToggles_DoubleTapHighBeam_Saved()
        {
            Assert.AreEqual(HeadlightMode.Low, HeadlightSwitch.Mode, "lights are on by default");
            HeadlightSwitch.Press(10f);
            Assert.AreEqual(HeadlightMode.Off, HeadlightSwitch.Mode, "a tap switches off");
            HeadlightSwitch.Press(11f);
            Assert.AreEqual(HeadlightMode.Low, HeadlightSwitch.Mode, "a later tap switches on");
            HeadlightSwitch.Press(12f);
            HeadlightSwitch.Press(12.2f);
            Assert.AreEqual(HeadlightMode.High, HeadlightSwitch.Mode, "a double tap is the high beam");
            HeadlightSwitch.Press(13f);
            HeadlightSwitch.Press(13.2f);
            Assert.AreEqual(HeadlightMode.Low, HeadlightSwitch.Mode, "a double tap on high beam goes back to low");
            HeadlightSwitch.Press(14f);
            Assert.AreEqual(HeadlightMode.Off, HeadlightSwitch.Mode);
            HeadlightSwitch.Reload();
            Assert.AreEqual(HeadlightMode.Off, HeadlightSwitch.Mode, "the state is saved");
        }

        [Test]
        public void Assets_Wired_ShaderMaterials_FromEffects()
        {
            var fx = AssetDatabase.LoadAssetAtPath<VehicleEffectsSettings>("Assets/_Project/Data/Vehicles/VehicleEffects.asset");
            Assert.AreSame(Settings, fx.headlights, "VehicleEffects.asset → Headlights.asset (Editor: JapanMap/Vehicles/Setup Headlights)");
            foreach (var m in new[] { Settings.beamMaterial, Settings.coneMaterial, Settings.glowMaterial })
            {
                Assert.NotNull(m);
                Assert.AreEqual("JapanMap/Headlight Glow", m.shader.name, m.name);
            }
            Assert.NotNull(Settings.glowMaterial.GetTexture("_MainTex"), "glow sprite texture");
        }

        [Test]
        public void Tiers_LowHasNoRealLight_HighHasTheMost()
        {
            var s = Settings;
            Assert.AreEqual(0, s.spots.z, "Low: no real-time light (WebGL, weak devices)");
            Assert.AreEqual(0, s.cones.z);
            Assert.That(s.spots.x, Is.GreaterThanOrEqualTo(s.spots.y));
            Assert.That(s.spots.x, Is.LessThanOrEqualTo(2));
            Assert.Greater(s.poolStrength.z, 0f, "Low still gets the beam pattern");
        }

        [Test]
        public void Action_LAndLeftShoulder_NotUsedElsewhere()
        {
            var actions = Settings.actions;
            Assert.NotNull(actions);
            var lights = actions.FindAction("Drive/Headlights");
            Assert.NotNull(lights, "Drive/Headlights in Drive.inputactions");
            var paths = lights.bindings.Select(b => b.path).ToList();
            CollectionAssert.Contains(paths, "<Keyboard>/l");
            CollectionAssert.Contains(paths, "<Gamepad>/leftShoulder");
            foreach (var map in actions.actionMaps)
            foreach (var b in map.bindings)
            {
                if (b.action == "Headlights") continue;
                Assert.AreNotEqual("<Keyboard>/l", b.path, $"{map.name}/{b.action} also uses L");
                if (map.name == "Drive") Assert.AreNotEqual("<Gamepad>/leftShoulder", b.path, $"Drive/{b.action} also uses LB");
            }
        }

        static IEnumerable<string> Cars() => Directory.GetFiles("Assets/_Project/Art/Cars", "*.glb").Select(Path.GetFileNameWithoutExtension);

        [TestCaseSource(nameof(Cars))]
        public void LampPositions_FromTheModel(string id)
        {
            var def = AssetDatabase.LoadAssetAtPath<VehicleDefinition>($"Assets/_Project/Data/Vehicles/{id}.asset");
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"Assets/_Project/Art/Cars/{id}.glb");
            var car = Object.Instantiate(prefab);
            try
            {
                var l = Headlights.FindLayout(car.transform, car.transform, def, Settings.popupAngle);
                // The formula car has no lamps; every other car-lab car has head and tail lamps in its model.
                Assert.AreEqual(id != "hanami", l.hasHead, $"{id}: head lamps in the model");
                Assert.AreEqual(id != "hanami", l.hasTail, $"{id}: tail lamps in the model");
                Assert.Less(l.headL.x, -0.2f, $"{id}: left lamp on the left");
                Assert.Greater(l.headR.x, 0.2f, $"{id}: right lamp on the right");
                Assert.Greater(l.headL.z, l.frontZ - 0.8f, $"{id}: head lamps at the nose ({l.headL.z:0.00} vs {l.frontZ:0.00})");
                Assert.Less(l.tailL.z, l.rearZ + 0.8f, $"{id}: tail lamps at the tail ({l.tailL.z:0.00} vs {l.rearZ:0.00})");
                foreach (var p in new[] { l.headL, l.headR, l.tailL, l.tailR })
                    Assert.That(p.y - l.groundY, Is.InRange(0.2f, 1.3f), $"{id}: lamp height {p.y - l.groundY:0.00}");
                Assert.That(l.groundY, Is.InRange(-0.15f, 0.15f), $"{id}: model floor at its origin");
            }
            finally { Object.DestroyImmediate(car); }
        }
    }
}
