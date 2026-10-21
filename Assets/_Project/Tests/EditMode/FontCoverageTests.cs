using System.Collections.Generic;
using System.IO;
using System.Text;
using NUnit.Framework;
using UnityEditor;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.TextCore.Text;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every non-ASCII character in a player-facing string must exist in the UI font or its fallbacks (UI audit
    /// 2026-10-21): the editor quietly borrows missing glyphs from the system fonts, the browser shows a box — "✓ Saved"
    /// and the key hints "↑↓←→" were boxes on the web for weeks. Reads the source font files (FontEngine), so the
    /// dynamic font assets stay empty in git.
    /// </summary>
    public class FontCoverageTests
    {
        const string Font = "Assets/_Project/Art/Fonts/Archivo Body SDF.asset"; // Editor/Ui/UiFonts.Body

        [Test]
        public void EveryCharacterInUiStrings_IsInTheUiFont()
        {
            var font = AssetDatabase.LoadAssetAtPath<FontAsset>(Font);
            Assert.IsNotNull(font, Font);
            var missing = new StringBuilder();
            foreach (var (c, where) in UiCharacters())
                if (!Covered(font, c, new HashSet<FontAsset>()))
                    missing.AppendLine($"'{c}' U+{(int)c:X4} in {where}");
            Assert.IsEmpty(missing.ToString(), "Characters the UI font cannot draw (boxes in the browser): use a drawn UiIcon or a plain word; new Japanese text needs \"JapanMap/UI/Build Fonts\".");
        }

        static bool Covered(FontAsset font, char c, HashSet<FontAsset> seen)
        {
            if (font == null || !seen.Add(font)) return false;
            // A static atlas (the Japanese one) has no font file in the build: what it holds is what it can draw.
            if (font.atlasPopulationMode == AtlasPopulationMode.Static) { if (font.characterLookupTable.ContainsKey(c)) return true; }
            else if (font.sourceFontFile != null && FontEngine.LoadFontFace(font.sourceFontFile) == FontEngineError.Success
                && FontEngine.TryGetGlyphIndex(c, out var index) && index != 0) return true;
            if (font.fallbackFontAssetTable != null)
                foreach (var f in font.fallbackFontAssetTable)
                    if (Covered(f, c, seen)) return true;
            return false;
        }

        /// <summary>Characters above ASCII inside string literals of the game scripts, minus what never reaches a screen:
        /// comments, tooltips, logs and the developer tools.</summary>
        static IEnumerable<(char, string)> UiCharacters()
        {
            var seen = new HashSet<char>();
            foreach (var file in Directory.GetFiles("Assets/_Project/Scripts", "*.cs", SearchOption.AllDirectories))
            {
                var path = file.Replace('\\', '/');
                if (path.Contains("/DevTools/") || path.EndsWith("EconomySim.cs")) continue;
                var lines = File.ReadAllLines(file);
                for (var n = 0; n < lines.Length; n++)
                {
                    var line = lines[n];
                    var t = line.TrimStart();
                    if (t.StartsWith("//") || t.StartsWith("[Tooltip") || t.StartsWith("[Header") || line.Contains("Debug.Log") || line.Contains("Tooltip(")) continue;
                    var inString = false;
                    for (var i = 0; i < line.Length; i++)
                    {
                        var c = line[i];
                        if (!inString && c == '/' && i + 1 < line.Length && line[i + 1] == '/') break; // trailing comment
                        if (c == '"' && (i == 0 || line[i - 1] != '\\')) { inString = !inString; continue; }
                        if (inString && c > 127 && seen.Add(c)) yield return (c, $"{Path.GetFileName(file)}:{n + 1}");
                    }
                }
            }
        }
    }
}
