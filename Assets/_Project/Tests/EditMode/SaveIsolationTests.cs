using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every PlayMode test class that boots the game carries [FreshSave]: without it the test reads and writes the
    /// human's own progress in the editor's PlayerPrefs, and inherits regions or cars an earlier test earned.
    /// Unity ignores an assembly-level test action, so the attribute has to sit on each class.
    /// </summary>
    public class SaveIsolationTests
    {
        [Test]
        public void EveryBootingPlayModeTestClass_HasFreshSave()
        {
            var bad = new System.Collections.Generic.List<string>();
            foreach (var path in Directory.GetFiles("Assets/_Project/Tests/PlayMode", "*.cs", SearchOption.AllDirectories))
            {
                var src = File.ReadAllText(path);
                if (!src.Contains("LoadScene(") && !src.Contains("BootSceneName")) continue;
                foreach (Match m in Regex.Matches(src, @"((?:\s*\[[^\]\n]*\]\s*)*)\bpublic\s+(?:sealed\s+)?class\s+(\w+)"))
                {
                    var body = src.Substring(m.Index);
                    var next = Regex.Match(body.Substring(m.Length), @"\bpublic\s+(?:sealed\s+)?class\s+\w+");
                    var classSrc = next.Success ? body.Substring(0, m.Length + next.Index) : body;
                    var isTest = classSrc.Contains("[UnityTest]") || classSrc.Contains("[Test]") || classSrc.Contains("[Test,");
                    if (isTest && !m.Groups[1].Value.Contains("FreshSave")) bad.Add($"{path}: {m.Groups[2].Value}");
                }
            }
            Assert.IsEmpty(bad, "add [FreshSave] to these classes");
        }
    }
}
