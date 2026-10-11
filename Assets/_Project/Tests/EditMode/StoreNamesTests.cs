using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;

namespace JapanMap.Tests
{
    /// <summary>
    /// CrazyGames wants original names. The car models stay recognisable, but no shown name may carry a
    /// manufacturer's trademark or model code (decision D41, owner's word 2026-10-11).
    /// </summary>
    public class StoreNamesTests
    {
        // Model names and chassis/trim codes that point at a real car or team.
        static readonly Regex Brand = new(
            @"GT-?R|\bSTi\b|\bWRX\b|\bAE ?86\b|\b86\b|\bRX-?\d|\bFD\b|\bRZ\b|\bSF-?\d|Skyline|Impreza|Supra\b|Silvia|Miata|Nissan|Subaru|Toyota|Mazda|Honda|Ferrari",
            RegexOptions.IgnoreCase);

        [Test]
        public void CarNames_CarryNoTrademarks()
        {
            var cars = AssetDatabase.FindAssets("t:VehicleDefinition", new[] { "Assets/_Project/Data" })
                .Select(g => AssetDatabase.LoadAssetAtPath<VehicleDefinition>(AssetDatabase.GUIDToAssetPath(g)))
                .ToList();
            Assert.That(cars.Count, Is.GreaterThanOrEqualTo(10));
            var bad = cars.Where(c => Brand.IsMatch(c.displayName)).Select(c => c.displayName).ToList();
            CollectionAssert.IsEmpty(bad, "brand-like car names: " + string.Join(", ", bad));
        }

        // A string literal naming the project ("JAPANMAP", "japanMap_…") is text a player can see; editor menu
        // paths ("JapanMap/…") and assembly names ("JapanMap.…") are not. The game's name comes from Application.productName (D41).
        static readonly Regex OldName = new(@"""[^""\n]*japan ?map(?![/.])[^""\n]*""", RegexOptions.IgnoreCase);

        [Test]
        public void GameCode_ShowsNoProjectName()
        {
            var hits = Directory.GetFiles("Assets/_Project/Scripts", "*.cs", SearchOption.AllDirectories)
                .SelectMany(f => File.ReadAllLines(f).Select((l, i) => (f, i, l)))
                .Where(x => OldName.IsMatch(x.l))
                .Select(x => $"{x.f}:{x.i + 1}").ToList();
            CollectionAssert.IsEmpty(hits, "project name in a game string: " + string.Join(", ", hits));
        }

        // The loading screen and tab title come from the page template: {{{ PRODUCT_NAME }}}, never a written name.
        [Test]
        public void PageTemplate_ShowsNoProjectName() =>
            Assert.IsFalse(Regex.IsMatch(File.ReadAllText("Assets/WebGLTemplates/JapanMap/index.html"), @">\s*japan ?map", RegexOptions.IgnoreCase),
                "the page shows the project name — use {{{ PRODUCT_NAME }}}");
    }
}
