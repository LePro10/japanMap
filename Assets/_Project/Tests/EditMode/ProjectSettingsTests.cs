using System.Linq;
using JapanMap.Core;
using JapanMap.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace JapanMap.Tests
{
    /// <summary>
    /// Guards the settings ProjectSetup.Apply establishes. If one of these turns red, someone
    /// changed a setting by hand — either revert it or change ProjectSetup and this test together.
    /// </summary>
    public class ProjectSettingsTests
    {
        [Test]
        public void GameLayers_AllExist()
        {
            foreach (var name in new[] { GameLayers.Vehicle, GameLayers.Walker, GameLayers.Pedestrian, GameLayers.Debris, "Water" })
                Assert.That(LayerMask.NameToLayer(name), Is.GreaterThanOrEqualTo(0), $"layer {name} missing in TagManager");
        }

        [Test] public void Serialization_IsForceText() => Assert.AreEqual(SerializationMode.ForceText, EditorSettings.serializationMode);
        [Test] public void MetaFiles_AreVisible() => Assert.AreEqual("Visible Meta Files", VersionControlSettings.mode);
        [Test] public void ColorSpace_IsLinear() => Assert.AreEqual(ColorSpace.Linear, PlayerSettings.colorSpace);
        [Test] public void ProductName_IsTheStoreName() => Assert.AreEqual(ProjectSetup.ProductName, PlayerSettings.productName);

        [Test]
        public void InputHandling_IsNewInputSystemOnly()
        {
            var player = new SerializedObject(Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings"));
            Assert.AreEqual(1, player.FindProperty("activeInputHandler").intValue);
        }

        [Test]
        public void QualityTiers_EachHaveTheirOwnUrpAsset()
        {
            CollectionAssert.AreEqual(QualitySystem.Tiers, QualitySettings.names);
            var assets = Enumerable.Range(0, QualitySettings.count)
                .Select(i => QualitySettings.GetRenderPipelineAssetAt(i) as UniversalRenderPipelineAsset)
                .ToArray();
            Assert.That(assets, Has.None.Null);
            Assert.AreEqual(assets.Length, assets.Distinct().Count());
        }

        [Test]
        public void BuildScenes_BootFirst()
        {
            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            CollectionAssert.AreEqual(new[] { ProjectSetup.BootScene, ProjectSetup.GameScene }, scenes);
        }

        [Test]
        public void Web_IsBrotliWithFallback_WebGL2()
        {
            Assert.AreEqual(WebGLCompressionFormat.Brotli, PlayerSettings.WebGL.compressionFormat);
            Assert.IsTrue(PlayerSettings.WebGL.decompressionFallback);
            CollectionAssert.AreEqual(new[] { UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 }, PlayerSettings.GetGraphicsAPIs(BuildTarget.WebGL));
            Assert.AreEqual(ManagedStrippingLevel.High, PlayerSettings.GetManagedStrippingLevel(NamedBuildTarget.WebGL));
        }
    }
}
