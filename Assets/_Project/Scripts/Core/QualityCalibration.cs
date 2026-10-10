using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Core
{
    /// <summary>Automatic quality: the first guess by device and the measurement in real play that may step it down (D38).</summary>
    [CreateAssetMenu(menuName = "JapanMap/Core/Quality Calibration", fileName = "QualityCalibration")]
    public sealed class QualityCalibration : ScriptableObject
    {
        [Tooltip("Seconds of real play (not menus, not while the world streams) before measuring.")]
        public float warmupSeconds = 4f;
        [Tooltip("Seconds measured per tier.")]
        public float sampleSeconds = 6f;
        [Tooltip("Median frame rate below this steps one tier down (browsers cap at the display rate, 60 on most).")]
        public float minFps = 45f;
        [Tooltip("GPU names (any part, case-insensitive) that start on Low: software renderers and phone GPUs.")]
        public string[] lowGpus = { "SwiftShader", "llvmpipe", "Mali", "Adreno", "PowerVR", "Software" };
        [Tooltip("GPU names that start on Medium: integrated laptop/Chromebook graphics.")]
        public string[] mediumGpus = { "Intel", "UHD", "Iris" };
    }

    /// <summary>
    /// The measurement as pure logic (tests): frames come in while the game is really played; after warm-up and a sample
    /// the median frame rate decides — keep the tier, or one step down. Never up: no tier flips back and forth.
    /// </summary>
    public sealed class QualityCalibrator
    {
        public enum Verdict { Measuring, Keep, StepDown }

        readonly QualityCalibration _c;
        readonly List<float> _frames = new();
        float _played;

        public QualityCalibrator(QualityCalibration c) => _c = c;

        /// <summary>Median frame rate of the last finished sample (0 before one).</summary>
        public float LastFps { get; private set; }

        public void Restart()
        {
            _frames.Clear();
            _played = 0f;
        }

        /// <summary>One frame of real play (unscaled seconds).</summary>
        public Verdict Add(float dt, bool canStepDown)
        {
            _played += dt;
            if (_played < _c.warmupSeconds) return Verdict.Measuring;
            _frames.Add(dt);
            if (_played < _c.warmupSeconds + _c.sampleSeconds) return Verdict.Measuring;
            _frames.Sort();
            var median = _frames[_frames.Count / 2];
            LastFps = median > 0f ? 1f / median : 999f;
            Restart();
            return LastFps < _c.minFps && canStepDown ? Verdict.StepDown : Verdict.Keep;
        }

        /// <summary>First guess: phones and weak/software GPUs low, integrated graphics medium, the rest high.</summary>
        public static string Guess(QualityCalibration c, bool mobile, string gpu, string[] tiers)
        {
            string Pick(string t) => Array.IndexOf(tiers, t) >= 0 ? t : tiers.Length > 0 ? tiers[0] : t;
            gpu ??= "";
            if (mobile || Matches(gpu, c != null ? c.lowGpus : null)) return Pick("Low");
            if (Matches(gpu, c != null ? c.mediumGpus : null) && gpu.IndexOf("Arc", StringComparison.OrdinalIgnoreCase) < 0) return Pick("Medium");
            return Pick("High");
        }

        static bool Matches(string gpu, string[] hints)
        {
            if (hints == null) return false;
            foreach (var h in hints) if (!string.IsNullOrEmpty(h) && gpu.IndexOf(h, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            return false;
        }
    }
}
