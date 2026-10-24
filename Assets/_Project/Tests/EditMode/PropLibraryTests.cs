using System.IO;
using System.Linq;
using JapanMap.Editor.Map;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every prop on the map is a real model: a spec without library models silently became a grey box with a red
    /// marker (boat ramp at the village, piers, temple stairs — found 2026-10-24).
    /// </summary>
    public class PropLibraryTests
    {
        [Test]
        public void EveryPlacedProp_HasLibraryModels()
        {
            var settings = MapImportSettings.LoadOrCreate();
            var raw = File.ReadAllText(LegacySource.PathOf(settings, "props/props.json"));
            var placed = JsonUtility.FromJson<LegacySource.Props>(raw).props.Select(p => p.id).Distinct();
            var specs = settings.props.ToDictionary(p => p.id);
            var boxes = placed.Where(id => !specs.TryGetValue(id, out var s) || s.library == null || s.library.Length == 0).ToArray();
            Assert.That(boxes, Is.Empty, "props that would be placeholder boxes (add library models in MapImportSettings)");
            var missing = settings.props.Where(s => s.library != null).SelectMany(s => s.library)
                .Distinct().Where(m => Editor.Art.LibraryImporter.LoadPrefab(m) == null).ToArray();
            Assert.That(missing, Is.Empty, "library models named in MapImportSettings but not imported");
        }
    }
}
