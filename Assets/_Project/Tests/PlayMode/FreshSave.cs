using System;
using System.Collections;
using JapanMap.Core.Save;
using NUnit.Framework.Interfaces;
using UnityEngine.TestTools;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every PlayMode test starts with an empty in-memory save: no test reads or writes the human's progress in
    /// the editor's PlayerPrefs, and no test inherits a region or a car another test earned. A test that needs
    /// a saved state writes it into <see cref="Store"/> before booting. On every class that boots the game
    /// (Unity calls it per test for a class; it ignores an assembly-level action — EditMode test checks).
    /// </summary>
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class FreshSaveAttribute : Attribute, IOuterUnityTestAction
    {
        public static MemoryStore Store { get; private set; }

        // Restored after each test, so the next class (which may not be FreshSave) gets the store it had before.
        static ISaveStore _previous;

        public IEnumerator BeforeTest(ITest test)
        {
            _previous = SaveStores.Current;
            Store = new MemoryStore();
            SaveStores.Current = Store;
            // A fresh save would get today's daily bonus a few seconds in: tests that count Sparks expect only theirs.
            JapanMap.Gameplay.Progress.DailySystem.AutoBonus = false;
            yield break;
        }

        public IEnumerator AfterTest(ITest test)
        {
            JapanMap.Gameplay.Progress.DailySystem.AutoBonus = true;
            SaveStores.Current = _previous;
            _previous = null;
            yield break;
        }
    }
}
