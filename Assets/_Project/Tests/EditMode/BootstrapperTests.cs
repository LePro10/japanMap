using System.Collections.Generic;
using JapanMap.Core;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    public class BootstrapperTests
    {
        static readonly List<string> Order = new();

        class RecordingSystem : GameSystem
        {
            protected override void OnInitialize() => Order.Add(name);
        }

        GameObject _root;

        [SetUp] public void SetUp() => Order.Clear();
        [TearDown] public void TearDown() => Object.DestroyImmediate(_root);

        [Test]
        public void Systems_AreInitialised_InHierarchyOrder_Once()
        {
            _root = new GameObject("Boot");
            var boot = _root.AddComponent<Bootstrapper>();
            foreach (var n in new[] { "A", "B", "C" })
                new GameObject(n, typeof(RecordingSystem)).transform.SetParent(_root.transform);

            boot.InitializeSystems();
            boot.InitializeSystems();

            CollectionAssert.AreEqual(new[] { "A", "B", "C" }, Order);
            Assert.That(boot.Systems, Has.Count.EqualTo(3));
            Assert.That(boot.Systems, Has.All.Property(nameof(GameSystem.IsInitialized)).True);
        }
    }
}
