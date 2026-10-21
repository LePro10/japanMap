using System.Linq;
using JapanMap.Editor.Ui;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Races;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// The menu postcards (Editor/Ui/Postcards): a card for every race and every travel point, each crunched for the
    /// web at 768 × 432, and the set streamed by its own address — never in the start download.
    /// </summary>
    public class PostcardTests
    {
        static PostcardSet Set => AssetDatabase.LoadAssetAtPath<PostcardSet>(Postcards.SetPath);

        [Test]
        public void EveryRaceAndPlace_HasACard()
        {
            Assert.NotNull(Set, "run JapanMap/UI/Bake Postcards");
            var races = AssetDatabase.LoadAssetAtPath<RaceEventSet>("Assets/_Project/Data/Gameplay/RaceEvents.asset");
            var travel = AssetDatabase.LoadAssetAtPath<TravelPoints>("Assets/_Project/Data/Gameplay/TravelPoints.asset");
            foreach (var e in races.events) Assert.NotNull(Set.Find(PostcardSet.EventId(e.id)), $"no card for race {e.id} (bake again)");
            foreach (var p in travel.points) Assert.NotNull(Set.Find(PostcardSet.PlaceId(p.id)), $"no card for place {p.id} (bake again)");
        }

        [Test]
        public void Cards_AreCrunchedForTheWeb()
        {
            foreach (var c in Set.cards)
            {
                Assert.AreEqual(Postcards.Width, c.image.width, c.id);
                Assert.AreEqual(Postcards.Height, c.image.height, c.id);
                var importer = (TextureImporter)AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(c.image));
                var web = importer.GetPlatformTextureSettings("WebGL");
                Assert.IsTrue(importer.crunchedCompression || (web.overridden && web.crunchedCompression), $"{c.id} is not crunched");
                Assert.IsFalse(importer.mipmapEnabled, $"{c.id}: a UI picture needs no mipmaps");
            }
        }

        [Test]
        public void Set_IsStreamedByItsAddress()
        {
            var settings = AddressableAssetSettingsDefaultObject.Settings;
            var entry = settings.FindAssetEntry(AssetDatabase.AssetPathToGUID(Postcards.SetPath));
            Assert.NotNull(entry, "the set is not addressable (Postcards.Stream)");
            Assert.AreEqual(PostcardSet.Address, entry.address);
            Assert.AreEqual(Postcards.Group, entry.parentGroup.Name);
            // Nothing in the start scenes may link the set directly, or it would ride along in the start download.
            foreach (var dep in AssetDatabase.GetDependencies(new[] { "Assets/_Project/Scenes/Boot.unity", "Assets/_Project/Scenes/Game.unity" }, true))
                Assert.AreNotEqual(Postcards.SetPath, dep, "a start scene links the postcards directly");
        }
    }
}
