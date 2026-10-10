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
    
        /// <summary>
        /// The display layer (sound, UI, HUD, map, menu) never draws from UnityEngine.Random: the stand-in sound's
        /// pitch spread did, shifted the traffic and the crowd, and made the ring acceptance drive nondeterministic.
        /// </summary>
        [Test]
        public void DisplayLayer_DoesNotUseTheGlobalRandom()
        {
            var dirs = new[] { "Scripts/Audio", "Scripts/UI", "Scripts/Gameplay/Hud", "Scripts/Gameplay/Map", "Scripts/Gameplay/Menu", "Scripts/Core/Ui" };
            var hits = new System.Collections.Generic.List<string>();
            foreach (var d in dirs)
            {
                var path = System.IO.Path.Combine(Application.dataPath, "_Project", d);
                if (!System.IO.Directory.Exists(path)) continue;
                foreach (var f in System.IO.Directory.GetFiles(path, "*.cs", System.IO.SearchOption.AllDirectories))
                    foreach (var line in System.IO.File.ReadAllLines(f))
                        if (System.Text.RegularExpressions.Regex.IsMatch(line, @"(?<![\w.])(UnityEngine\.)?Random\.(Range|value|insideUnit|onUnit|rotation)"))
                            hits.Add($"{System.IO.Path.GetFileName(f)}: {line.Trim()}");
            }
            Assert.IsEmpty(hits, string.Join("\n", hits));
        }
    }
}
