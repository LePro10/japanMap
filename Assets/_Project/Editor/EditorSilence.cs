using UnityEditor;

namespace JapanMap.Editor
{
    /// <summary>
    /// Agents play and test in the human's editor while they work nearby: the game must not make a sound there.
    /// Mutes the editor's audio output (the Game view's "Mute Audio") on every load and every play start.
    /// The mix still runs, so play.mjs "record" captures sound as before. The human can switch it back on
    /// with the menu "JapanMap/Sound in Editor" (remembered per machine).
    /// </summary>
    [InitializeOnLoad]
    public static class EditorSilence
    {
        const string Key = "JapanMap.SoundInEditor";
        const string MenuPath = "JapanMap/Sound in Editor";

        static EditorSilence()
        {
            Apply();
            EditorApplication.playModeStateChanged += _ => Apply();
        }

        static bool SoundOn => EditorPrefs.GetBool(Key, false);

        static void Apply() => EditorUtility.audioMasterMute = !SoundOn;

        [MenuItem(MenuPath)]
        static void Toggle()
        {
            EditorPrefs.SetBool(Key, !SoundOn);
            Apply();
        }

        [MenuItem(MenuPath, true)]
        static bool ToggleCheck()
        {
            Menu.SetChecked(MenuPath, SoundOn);
            return true;
        }
    }
}
