using JapanMap.Core;
using NUnit.Framework;

namespace JapanMap.Tests
{
    public class QualitySystemTests
    {
        static readonly string[] Tiers = { "High", "Medium", "Low" };

        [Test] public void Desktop_StartsHigh() => Assert.AreEqual("High", QualitySystem.ChooseDefault(false, Tiers));
        [Test] public void Mobile_StartsLow() => Assert.AreEqual("Low", QualitySystem.ChooseDefault(true, Tiers));
        [Test] public void MissingTier_FallsBackToFirst() => Assert.AreEqual("A", QualitySystem.ChooseDefault(true, new[] { "A" }));
    }
}
