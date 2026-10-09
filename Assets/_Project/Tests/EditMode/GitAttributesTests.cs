using System.Diagnostics;
using System.IO;
using NUnit.Framework;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every binary-serialized .asset must not be stored as text: the "*.asset text eol=lf" rule turned CRLF
    /// bytes inside binary NavMesh data into LF (the committed navmesh was one byte short — Phase 7).
    /// </summary>
    public class GitAttributesTests
    {
        [Test]
        public void BinaryAssets_AreNotTreatedAsText()
        {
            var root = Directory.GetParent(UnityEngine.Application.dataPath)!.FullName;
            var bad = "";
            foreach (var file in Directory.GetFiles(Path.Combine(root, "Assets"), "*.asset", SearchOption.AllDirectories))
            {
                var head = new byte[5];
                using (var f = File.OpenRead(file)) f.Read(head, 0, 5);
                if (System.Text.Encoding.ASCII.GetString(head) == "%YAML") continue;
                // LFS pointer files in a checkout without LFS are text too, but then the rule is -text anyway.
                var rel = Path.GetRelativePath(root, file).Replace('\\', '/');
                var p = Process.Start(new ProcessStartInfo("git", $"check-attr text -- \"{rel}\"")
                {
                    WorkingDirectory = root, RedirectStandardOutput = true, UseShellExecute = false,
                });
                var output = p!.StandardOutput.ReadToEnd();
                p.WaitForExit();
                if (output.TrimEnd().EndsWith(": set")) bad += $"\n{rel}";
            }
            Assert.IsEmpty(bad, "binary .asset files stored as text (add a -text / LFS rule to .gitattributes):" + bad);
        }
    }
}
