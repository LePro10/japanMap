using JapanMap.Core.Ui;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    public class UiPanelTests
    {
        [TearDown]
        public void TearDown() => UiPanel.Refresh(force: true);

        [Test]
        public void Resize_WithClampedScale_StillUpdatesSize()
        {
            // Both heights are below 864 px, so the desktop fit stays clamped at 0.8 and the scale does not change.
            UiPanel.Apply(new Vector2Int(1471, 731), 1f, Vector4.zero);
            Assert.AreEqual(1.25f, UiPanel.Scale, 1e-4f);
            UiPanel.Apply(new Vector2Int(1469, 684), 1f, Vector4.zero);
            Assert.AreEqual(1.25f, UiPanel.Scale, 1e-4f);
            Assert.AreEqual(1469f * 1.25f, UiPanel.Size.x, 0.01f, "Size follows the screen even when the scale is unchanged");
            Assert.AreEqual(684f * 1.25f, UiPanel.Size.y, 0.01f);
        }

        [Test]
        public void Resize_UpdatesSafeInsets()
        {
            UiPanel.Apply(new Vector2Int(1600, 800), 1f, Vector4.zero);
            UiPanel.Apply(new Vector2Int(1600, 800), 1f, new Vector4(40f, 0f, 0f, 20f));
            Assert.AreEqual(40f * 1.25f, UiPanel.Safe.x, 0.01f);
            Assert.AreEqual(20f * 1.25f, UiPanel.Safe.w, 0.01f);
        }

        [Test]
        public void PhoneSizes_PickPhoneForms()
        {
            UiPanel.Apply(new Vector2Int(1170, 2532), 3f, Vector4.zero);
            Assert.AreEqual(FormFactor.PhonePortrait, UiPanel.Form);
            Assert.AreEqual(390f, UiPanel.Size.x, 0.01f);
            UiPanel.Apply(new Vector2Int(2532, 1170), 3f, Vector4.zero);
            Assert.AreEqual(FormFactor.PhoneLandscape, UiPanel.Form);
        }
    }
}
