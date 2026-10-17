using System;
using JapanMap.Core;
using JapanMap.Core.Ui;
using JapanMap.Gameplay.Menu;
using JapanMap.UI;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Tests
{
    /// <summary>
    /// The pieces of the title and menu redo (D48) that need no running game: the fades go clear where the car is,
    /// the unlock rules default to "everything open", a locked tile says why, and the loading line before boot.
    /// </summary>
    public class MenuUiTests
    {
        [TearDown]
        public void TearDown() => Unlocks.Query = null;

        [Test]
        public void Smooth_IsGlslSmoothstep_NotMathfSmoothStep()
        {
            Assert.AreEqual(0f, Ui.Smooth(0.3f, 0.6f, 0.1f));
            Assert.AreEqual(1f, Ui.Smooth(0.3f, 0.6f, 0.9f));
            Assert.AreEqual(0.5f, Ui.Smooth(0.3f, 0.6f, 0.45f), 1e-4f);
        }

        [Test]
        public void Fades_AreClearOverTheCar()
        {
            // Mathf.SmoothStep(0.3, 0.58, t) never left 0.3…0.58: the "clear" right half kept 26–33 % ink over the car.
            var menu = GameMenu.Backdrop(narrow: true);
            Assert.AreEqual(0f, menu.GetPixel(menu.width - 1, 0).a, 0.01f, "menu fade clear on the right");
            Assert.Greater(menu.GetPixel(0, 0).a, 0.5f, "dark behind the page");
            var title = TitleScreen.Shade();
            Assert.AreEqual(0f, title.GetPixel(title.width * 3 / 4, 0).a, 0.01f, "title shade clear over the car");
            Assert.Greater(title.GetPixel(0, 0).a, 0.6f, "dark behind the title column");
        }

        [Test]
        public void Unlocks_DefaultEverythingOpen_ASwappedRuleLocksAndSaysWhy()
        {
            foreach (FeatureId id in Enum.GetValues(typeof(FeatureId))) Assert.IsTrue(Unlocks.IsUnlocked(id), $"{id} open by default");
            Assert.AreEqual("", Unlocks.Hint(FeatureId.Map));
            var raised = 0;
            Unlocks.Changed += () => raised++;
            var rule = new Lock(FeatureId.Map);
            Unlocks.Query = rule;
            Assert.AreEqual(1, raised, "menus hear about new rules");
            Assert.IsFalse(Unlocks.IsUnlocked(FeatureId.Map));
            Assert.IsTrue(Unlocks.IsUnlocked(FeatureId.Races));
            Assert.AreEqual("Unlocks: Finish the first drive", Unlocks.Hint(FeatureId.Map));
            rule.Open();
            Assert.AreEqual(2, raised, "an unlock reaches the menus");
        }

        [Test]
        public void LockedTile_ShowsPadlockAndReason_OpenTileHasNone()
        {
            Unlocks.Query = new Lock(FeatureId.Tuning);
            var ran = false;
            var locked = MenuTiles.Tile(null, new MenuTiles.Spec { Title = "Tune", Feature = FeatureId.Tuning, Click = () => ran = true, Action = "Tune now" });
            Assert.IsTrue(locked.ClassListContains("jm-locked"));
            Assert.IsNotNull(locked.Q<UiIcon>(className: null), "icons inside");
            var reason = locked.Q<Label>(className: "jm-lock__label");
            Assert.NotNull(reason, "a locked tile says why");
            Assert.AreEqual("Unlocks: Finish the first drive", reason.text);
            var open = MenuTiles.Tile(null, new MenuTiles.Spec { Title = "Map", Feature = FeatureId.Map });
            Assert.IsFalse(open.ClassListContains("jm-locked"));
            Assert.IsNull(open.Q<Label>(className: "jm-lock__label"));
            Assert.IsFalse(ran);
            // A locked text button keeps its label and adds the reason.
            var buy = Ui.Button(null, "Buy", () => ran = true);
            Unlocks.Query = new Lock(FeatureId.CarShop);
            MenuTiles.Gate(buy, FeatureId.CarShop);
            StringAssert.StartsWith("Buy", buy.text);
            StringAssert.Contains("Unlocks:", buy.text);
        }

        [Test]
        public void StartFlow_BeforeBoot_SaysStartingTheEngine()
        {
            var share = StartFlow.Progress(out var stage);
            if (Bootstrapper.Instance == null)
            {
                Assert.AreEqual(0f, share);
                Assert.AreEqual("Starting the engine", stage);
            }
            if (StartFlow.Current == StartFlow.Phase.Loading) Assert.IsTrue(StartFlow.Holding, "while loading the intro waits for the title's decision");
        }

        sealed class Lock : IUnlockQuery
        {
            FeatureId? _locked;
            public Lock(FeatureId id) => _locked = id;
            public bool IsUnlocked(FeatureId id) => _locked != id;
            public string Requirement(FeatureId id) => "Finish the first drive";
            public event Action Changed;
            public void Open() { _locked = null; Changed?.Invoke(); }
        }
    }
}
