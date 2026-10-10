using JapanMap.Core;
using NUnit.Framework;

namespace JapanMap.Tests
{
    public class QualitySystemTests
    {
        static readonly string[] Tiers = { "High", "Medium", "Low" };

        [Test] public void Desktop_StartsHigh() => Assert.AreEqual("High", QualitySystem.ChooseDefault(false, Tiers));
        [Test] public void Mobile_StartsLow() => Assert.AreEqual("Low", QualitySystem.ChooseDefault(true, Tiers));
        [Test] public void Url_SetsTier() => Assert.AreEqual("Low", QualitySystem.FromUrl("http://x/index.html?a=1&quality=Low#f"));
        [Test] public void Url_WithoutQuery_IsNull() => Assert.IsNull(QualitySystem.FromUrl("http://x/index.html"));
        [Test] public void MissingTier_FallsBackToFirst() => Assert.AreEqual("A", QualitySystem.ChooseDefault(true, new[] { "A" }));

        [Test]
        public void Guess_ByGpu_SoftwareAndPhonesLow_IntegratedMedium_RestHigh()
        {
            var c = UnityEngine.ScriptableObject.CreateInstance<QualityCalibration>();
            Assert.AreEqual("Low", QualityCalibrator.Guess(c, false, "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))", Tiers));
            Assert.AreEqual("Low", QualityCalibrator.Guess(c, false, "Mali-G78", Tiers));
            Assert.AreEqual("Medium", QualityCalibrator.Guess(c, false, "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)", Tiers));
            Assert.AreEqual("High", QualityCalibrator.Guess(c, false, "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics)", Tiers), "Arc is a real card");
            Assert.AreEqual("High", QualityCalibrator.Guess(c, false, "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)", Tiers));
            Assert.AreEqual("Low", QualityCalibrator.Guess(c, true, "Apple GPU", Tiers), "every phone starts low");
        }

        [Test]
        public void Calibrator_StepsDownOnASlowMedian_KeepsOnAFastOne_IgnoresTheWarmUp()
        {
            var c = UnityEngine.ScriptableObject.CreateInstance<QualityCalibration>();
            var cal = new QualityCalibrator(c);
            var verdict = QualityCalibrator.Verdict.Measuring;
            // Warm-up full of hitches (streaming, shader compile) must not count.
            for (var t = 0f; t < c.warmupSeconds; t += 0.2f) verdict = cal.Add(0.2f, true);
            Assert.AreEqual(QualityCalibrator.Verdict.Measuring, verdict);
            for (var t = 0f; t <= c.sampleSeconds + 0.1f && verdict == QualityCalibrator.Verdict.Measuring; t += 1f / 30f) verdict = cal.Add(1f / 30f, true);
            Assert.AreEqual(QualityCalibrator.Verdict.StepDown, verdict, "30 fps steps down");
            Assert.AreEqual(30f, cal.LastFps, 0.5f);
            verdict = QualityCalibrator.Verdict.Measuring;
            for (var t = 0f; t <= c.warmupSeconds + c.sampleSeconds + 0.1f && verdict == QualityCalibrator.Verdict.Measuring; t += 1f / 60f)
                verdict = cal.Add(t % 1f < 0.02f ? 0.1f : 1f / 60f, true); // one hitch a second: the median ignores it
            Assert.AreEqual(QualityCalibrator.Verdict.Keep, verdict, "60 fps with rare hitches stays");
            verdict = QualityCalibrator.Verdict.Measuring;
            for (var t = 0f; t <= c.warmupSeconds + c.sampleSeconds + 0.1f && verdict == QualityCalibrator.Verdict.Measuring; t += 1f / 30f)
                verdict = cal.Add(1f / 30f, false);
            Assert.AreEqual(QualityCalibrator.Verdict.Keep, verdict, "already the lowest tier: nothing to step to");
        }
    }
}
