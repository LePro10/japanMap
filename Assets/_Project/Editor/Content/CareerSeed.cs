using JapanMap.Gameplay.Career;
using JapanMap.Gameplay.Intro;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// The career asset (D50): Data/Gameplay/Career.asset with the designed chain (CareerSettings defaults), linked from
    /// IntroSettings so FirstDrive builds the career at runtime. "Reset" writes the code's chain over the asset.
    /// </summary>
    public static class CareerSeed
    {
        [MenuItem("JapanMap/Career/Create Or Link Asset")]
        public static void Apply() => Link(false);

        [MenuItem("JapanMap/Career/Reset Chain From Code")]
        public static void Reset() => Link(true);

        static void Link(bool reset)
        {
            var career = ContentSetup.Asset<CareerSettings>("Career");
            if (reset)
            {
                var fresh = ScriptableObject.CreateInstance<CareerSettings>();
                career.steps = fresh.steps;
                career.features = fresh.features;
                Object.DestroyImmediate(fresh);
            }
            EditorUtility.SetDirty(career);
            var intro = ContentSetup.Asset<IntroSettings>("IntroSettings");
            intro.career = career;
            EditorUtility.SetDirty(intro);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Career] asset {AssetDatabase.GetAssetPath(career)} · {career.steps.Length} steps · linked from IntroSettings");
        }
    }
}
