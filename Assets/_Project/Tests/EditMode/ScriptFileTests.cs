using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every component and ScriptableObject class needs a file of its own name: two in one file
    /// (ActorSet + InteriorSet in LifeData.cs) lost their script after a reload, and the shops
    /// were silently never built.
    /// </summary>
    public class ScriptFileTests
    {
        [Test]
        public void EveryComponentAndDataClass_HasItsOwnScriptFile()
        {
            var scripted = AssetDatabase.FindAssets("t:MonoScript", new[] { "Assets/_Project/Scripts" })
                .Select(g => AssetDatabase.LoadAssetAtPath<MonoScript>(AssetDatabase.GUIDToAssetPath(g)))
                .Select(m => m.GetClass()).Where(t => t != null).ToHashSet();
            var missing = TypeCache.GetTypesDerivedFrom<MonoBehaviour>().Concat(TypeCache.GetTypesDerivedFrom<ScriptableObject>())
                .Where(t => t.Namespace != null && t.Namespace.StartsWith("JapanMap") && !t.IsAbstract && !t.IsGenericType
                            && !t.Namespace.StartsWith("JapanMap.Editor") && !t.Namespace.StartsWith("JapanMap.Tests"))
                .Where(t => !scripted.Contains(t)).Select(t => t.FullName).ToList();
            Assert.IsEmpty(missing, "classes without a file of their own name: " + string.Join(", ", missing));
        }
    }
}
