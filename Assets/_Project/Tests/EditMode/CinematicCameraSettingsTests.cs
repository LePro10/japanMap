using System;
using System.Linq;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;

namespace JapanMap.Tests
{
    /// <summary>The shot list of the auto-drive camera (D49): every kind present and possible, shots 3–8 s, a real lens change.</summary>
    public class CinematicCameraSettingsTests
    {
        [Test]
        public void ShotList_CoversEveryKind_WithSaneDurationsAndLenses()
        {
            var guid = AssetDatabase.FindAssets("t:CinematicCameraSettings").FirstOrDefault();
            Assert.NotNull(guid, "a CinematicCameraSettings asset under Data/");
            var s = AssetDatabase.LoadAssetAtPath<CinematicCameraSettings>(AssetDatabase.GUIDToAssetPath(guid));
            foreach (CineShot kind in Enum.GetValues(typeof(CineShot)))
                Assert.IsTrue(s.shots.Any(x => x.kind == kind && x.weight > 0f), $"{kind} can be picked");
            foreach (var shot in s.shots)
            {
                Assert.That(shot.seconds.x, Is.InRange(3f, 8f), $"{shot.kind} min length");
                Assert.That(shot.seconds.y, Is.InRange(shot.seconds.x, 8f), $"{shot.kind} max length");
                Assert.That(shot.fov.x, Is.InRange(15f, 75f), $"{shot.kind} lens");
            }
            Assert.Greater(s.shots.Max(x => x.fov.x) - s.shots.Min(x => x.fov.x), 25f, "long lenses and wide ones");
            var cam = AssetDatabase.LoadAssetAtPath<CarCameraSettings>(AssetDatabase.GUIDToAssetPath(AssetDatabase.FindAssets("t:CarCameraSettings").First()));
            Assert.AreSame(s, cam.cinematic, "the car camera uses it");
        }
    }
}
