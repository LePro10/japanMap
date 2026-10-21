using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.TextCore.Text;

namespace JapanMap.Editor.Ui
{
    /// <summary>
    /// The UI fonts of "Night Meet" (D55), reproducible: four dynamic Archivo cuts (empty in git, cleared on build — the
    /// glyphs a screen needs are rendered at runtime) and Dela Gothic One as a STATIC atlas of exactly the Japanese
    /// characters the game's strings use: its source file is 2.5 MB and must not reach the build. Fallbacks: every Archivo
    /// cut → Dela (kana, kanji) → Saira Condensed (arrows). Menu "JapanMap/UI/Build Fonts"; run again when new Japanese
    /// text appears (FontCoverageTests says so).
    /// </summary>
    public static class UiFonts
    {
        public const string Dir = "Assets/_Project/Art/Fonts/";
        public const string Display = Dir + "Archivo Display SDF.asset";
        public const string Title = Dir + "Archivo Title SDF.asset";
        public const string Body = Dir + "Archivo Body SDF.asset";
        public const string Label = Dir + "Archivo Label SDF.asset";
        public const string Jp = Dir + "Dela Gothic JP SDF.asset";
        const string Saira = Dir + "SairaCondensed-Bold SDF.asset";

        static readonly (string ttf, string asset)[] Archivo =
        {
            ("ArchivoCondensed-BlackItalic.ttf", Display),
            ("ArchivoCondensed-ExtraBoldItalic.ttf", Title),
            ("Archivo-Medium.ttf", Body),
            ("Archivo-SemiBold.ttf", Label),
        };

        [MenuItem("JapanMap/UI/Build Fonts")]
        public static string Build()
        {
            var report = new StringBuilder("[UiFonts]");
            var jp = BuildJapanese(report);
            var saira = AssetDatabase.LoadAssetAtPath<FontAsset>(Saira);
            foreach (var (ttf, path) in Archivo)
            {
                var fa = AssetDatabase.LoadAssetAtPath<FontAsset>(path);
                if (fa == null)
                {
                    var font = AssetDatabase.LoadAssetAtPath<Font>(Dir + ttf);
                    fa = FontAsset.CreateFontAsset(font, 90, 9, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, true);
                    fa.name = Path.GetFileNameWithoutExtension(path);
                    Save(fa, path);
                    report.Append($" created {fa.name};");
                }
                SetField(fa, "m_ClearDynamicDataOnBuild", so => so.boolValue = true);
                fa.fallbackFontAssetTable = new List<FontAsset> { jp, saira }.Where(f => f != null).ToList();
                EditorUtility.SetDirty(fa);
            }
            AssetDatabase.SaveAssets();
            Debug.Log(report);
            return report.ToString();
        }

        /// <summary>The static Japanese atlas: rebuilt from scratch so it holds exactly today's characters.</summary>
        static FontAsset BuildJapanese(StringBuilder report)
        {
            var chars = JapaneseCharacters();
            var font = AssetDatabase.LoadAssetAtPath<Font>(Dir + "DelaGothicOne-Regular.ttf");
            if (AssetDatabase.LoadAssetAtPath<FontAsset>(Jp) != null) AssetDatabase.DeleteAsset(Jp);
            var fa = FontAsset.CreateFontAsset(font, 72, 8, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, false);
            fa.name = Path.GetFileNameWithoutExtension(Jp);
            var ok = fa.TryAddCharacters(chars, out var missing);
            fa.atlasPopulationMode = AtlasPopulationMode.Static;
            Save(fa, Jp);
            // The build carries the atlas, not the 2.5 MB font: drop the runtime reference (the editor one stays).
            SetField(fa, "m_SourceFontFile", so => so.objectReferenceValue = null);
            SetField(fa, "m_ClearDynamicDataOnBuild", so => so.boolValue = false); // its glyphs are the content
            report.Append($" JP static {chars.Length} chars{(ok ? "" : $", missing '{missing}'")};");
            return AssetDatabase.LoadAssetAtPath<FontAsset>(Jp);
        }

        static void SetField(Object o, string field, System.Action<SerializedProperty> set)
        {
            var so = new SerializedObject(o);
            var p = so.FindProperty(field);
            if (p == null) { Debug.LogWarning($"[UiFonts] no field {field}"); return; }
            set(p);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static void Save(FontAsset fa, string path)
        {
            AssetDatabase.CreateAsset(fa, path);
            foreach (var t in fa.atlasTextures)
                if (t != null) { t.name = fa.name + " Atlas"; AssetDatabase.AddObjectToAsset(t, fa); }
            if (fa.material != null) { fa.material.name = fa.name + " Material"; AssetDatabase.AddObjectToAsset(fa.material, fa); }
            EditorUtility.SetDirty(fa);
        }

        /// <summary>Every CJK / kana character in string literals of the game scripts and in the UI style sheets.</summary>
        public static string JapaneseCharacters()
        {
            var set = new SortedSet<char>();
            var files = Directory.GetFiles("Assets/_Project/Scripts", "*.cs", SearchOption.AllDirectories)
                .Concat(Directory.GetFiles("Assets/_Project/Data/UI", "*.uss", SearchOption.AllDirectories));
            foreach (var f in files)
                foreach (var c in File.ReadAllText(f))
                    if (IsJapanese(c)) set.Add(c);
            return new string(set.ToArray());
        }

        public static bool IsJapanese(char c) =>
            (c >= '　' && c <= 'ヿ') || (c >= '一' && c <= '鿿') || (c >= '＀' && c <= '￯');
    }
}
