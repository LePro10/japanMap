using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every play-script command is named in Tools/play.mjs's header — the list agents read. Commands missing there got
    /// built twice (carcam, damage, 2026-10-25).
    /// </summary>
    public class PlayScriptDocsTests
    {
        [Test]
        public void EveryCommand_IsNamedInPlayMjs()
        {
            var root = Path.GetDirectoryName(Application.dataPath);
            var code = File.ReadAllText(Path.Combine(root, "Assets/_Project/Editor/PlayScript.cs"));
            var header = string.Join("\n", File.ReadAllLines(Path.Combine(root, "Tools/play.mjs")).Where(l => l.StartsWith("//")));
            var commands = Regex.Matches(code, "case \"([a-z]+)\":").Select(m => m.Groups[1].Value).Distinct().ToList();
            Assert.That(commands.Count, Is.GreaterThan(40), "commands found in PlayScript.cs");
            var missing = commands.Where(c => !Regex.IsMatch(header, $@"\b{c}\b")).ToList();
            Assert.IsEmpty(missing, "PlayScript commands not named in Tools/play.mjs: " + string.Join(", ", missing));
        }
    }
}
