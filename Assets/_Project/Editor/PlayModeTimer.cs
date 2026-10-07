using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace JapanMap.Editor
{
    /// <summary>
    /// Logs how long entering play mode takes ("[PlayModeTimer] enter 1.23 s, domain reload off").
    /// Survives a domain reload via SessionState, so both settings can be compared.
    /// Batch: Unity -batchmode -executeMethod JapanMap.Editor.PlayModeTimer.Batch [-jmDomainReload on|off]
    /// (no -quit: the timer exits once play mode is reached).
    /// </summary>
    [InitializeOnLoad]
    public static class PlayModeTimer
    {
        const string StartKey = "jm.playmode.start";
        const string ExitKey = "jm.playmode.exitWhenEntered";

        static PlayModeTimer() => EditorApplication.playModeStateChanged += OnChange;

        static double Now => DateTime.UtcNow.Ticks / (double)TimeSpan.TicksPerSecond;

        static void OnChange(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.ExitingEditMode)
                SessionState.SetFloat(StartKey, (float)(Now % 100000));
            else if (change == PlayModeStateChange.EnteredPlayMode)
            {
                var start = SessionState.GetFloat(StartKey, -1f);
                if (start < 0) return;
                var seconds = Now % 100000 - start;
                var reload = EditorSettings.enterPlayModeOptionsEnabled &&
                             (EditorSettings.enterPlayModeOptions & EnterPlayModeOptions.DisableDomainReload) != 0 ? "off" : "on";
                Debug.Log($"[PlayModeTimer] enter {seconds:F2} s, domain reload {reload}");
                SessionState.EraseFloat(StartKey);
                if (SessionState.GetBool(ExitKey, false))
                {
                    SessionState.EraseBool(ExitKey);
                    EditorApplication.Exit(0);
                }
            }
        }

        public static void Batch()
        {
            var mode = BatchArgs.Get("jmDomainReload", null);
            if (mode != null)
            {
                EditorSettings.enterPlayModeOptionsEnabled = true;
                EditorSettings.enterPlayModeOptions = mode == "on" ? EnterPlayModeOptions.None : EnterPlayModeOptions.DisableDomainReload;
            }
            EditorSceneManager.OpenScene(ProjectSetup.BootScene);
            SessionState.SetBool(ExitKey, true);
            EditorApplication.EnterPlaymode();
        }
    }
}
