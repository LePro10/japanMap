using JapanMap.Editor;
using NUnit.Framework;

namespace JapanMap.Tests
{
    public class WebBuildTests
    {
        const string TerrainStripped =
            "Shader 'Universal Render Pipeline/Terrain/Lit': All SubShaders were stripped because their RenderPipeline tags do not match";

        [Test]
        public void StrippedShaderName_ReadsNameFromUnityWarning()
        {
            Assert.AreEqual("Universal Render Pipeline/Terrain/Lit", WebBuild.StrippedShaderName(TerrainStripped));
            Assert.IsNull(WebBuild.StrippedShaderName("Shader 'X': something else"));
        }

        [Test]
        public void UnexpectedStrippedShaders_IgnoresUnityDebugShaders_FlagsEverythingElse()
        {
            var broken = WebBuild.UnexpectedStrippedShaders(new[]
            {
                "Hidden/Core/DebugOccluder", "Hidden/Core/DebugOcclusionTest",
                "Universal Render Pipeline/Terrain/Lit", "Universal Render Pipeline/Terrain/Lit",
            });
            CollectionAssert.AreEqual(new[] { "Universal Render Pipeline/Terrain/Lit" }, broken);
        }
    }
}
