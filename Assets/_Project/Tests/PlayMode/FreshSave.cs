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

        public IEnumerator BeforeTest(ITest test)
        {
            Store = new MemoryStore();
            SaveStores.Current = Store;
            yield break;
        }

        public IEnumerator AfterTest(ITest test)
        {
            yield break;
        }
    }
}
