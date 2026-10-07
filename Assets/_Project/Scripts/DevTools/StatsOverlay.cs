using JapanMap.Core;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.DevTools
{
    /// <summary>
    /// F1 overlay: FPS, frame ms, draw calls, triangles, memory. Exists only in the editor and in
    /// development builds — in a release build it removes itself so the scene needs no variant.
    /// Render counters come from ProfilerRecorder; where a platform does not provide them the
    /// overlay shows "n/a" instead of a misleading 0.
    /// </summary>
    public sealed class StatsOverlay : GameSystem
    {
        [SerializeField] bool visibleOnStart;

        public struct Snapshot
        {
            public float Fps, FrameMs, WorstMs;
            public long DrawCalls, SetPassCalls, Triangles, UsedMemoryBytes, GcMemoryBytes;
            public bool RenderStatsValid;
        }

        readonly FrameTimeStats _frames = new(120);
        ProfilerRecorder _drawCalls, _setPass, _triangles, _usedMemory, _gcMemory;
        GUIStyle _style;
        Snapshot _last;

        public bool Visible { get; set; }
        public Snapshot Last => _last;

        protected override void OnInitialize()
        {
            if (!Debug.isDebugBuild)
            {
                Destroy(this);
                return;
            }
            Visible = visibleOnStart;
        }

        void OnEnable()
        {
            _drawCalls = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            _setPass = ProfilerRecorder.StartNew(ProfilerCategory.Render, "SetPass Calls Count");
            _triangles = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
            _usedMemory = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "System Used Memory");
            _gcMemory = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Reserved Memory");
        }

        void OnDisable()
        {
            _drawCalls.Dispose();
            _setPass.Dispose();
            _triangles.Dispose();
            _usedMemory.Dispose();
            _gcMemory.Dispose();
        }

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard != null && keyboard.f1Key.wasPressedThisFrame) Visible = !Visible;

            _frames.Add(Time.unscaledDeltaTime * 1000f);
            _last = new Snapshot
            {
                FrameMs = _frames.AverageMs,
                WorstMs = _frames.WorstMs,
                Fps = _frames.AverageMs > 0f ? 1000f / _frames.AverageMs : 0f,
                RenderStatsValid = _drawCalls.Valid && _triangles.Valid,
                DrawCalls = _drawCalls.LastValue,
                SetPassCalls = _setPass.LastValue,
                Triangles = _triangles.LastValue,
                UsedMemoryBytes = _usedMemory.LastValue,
                GcMemoryBytes = _gcMemory.LastValue,
            };
        }

        void OnGUI()
        {
            if (!Visible) return;
            _style ??= new GUIStyle(GUI.skin.box)
            {
                alignment = TextAnchor.UpperLeft,
                fontSize = 14,
                normal = { textColor = Color.white },
            };
            var s = _last;
            var render = s.RenderStatsValid
                ? $"Draw calls {s.DrawCalls}  SetPass {s.SetPassCalls}\nTriangles {s.Triangles / 1000f:F1} k"
                : "Draw calls n/a\nTriangles n/a";
            var text =
                $"{s.Fps:F0} fps  {s.FrameMs:F2} ms (worst {s.WorstMs:F1})\n{render}\n" +
                $"Memory {s.UsedMemoryBytes / 1048576f:F0} MB  GC {s.GcMemoryBytes / 1048576f:F0} MB\n" +
                $"Quality {QualitySettings.names[QualitySettings.GetQualityLevel()]}";
            GUI.Box(new Rect(8, 8, 300, 96), text, _style);
        }
    }
}
