using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Core.Ui
{
    /// <summary>
    /// Finds HUD parts that sit on each other or leave the screen. The size check only proved that the game started:
    /// on the human's phone (2026-10-11) the dial covered the buttons and the buttons covered each other while every
    /// check was green. Checked: every touch control (<c>jm-touch</c>) and the named HUD blocks below, visible ones only.
    /// Browser: <c>?uicheck=1</c> logs the result 4 s after start (Tools/sizes-web.mjs reads it); tests call <see cref="Check"/>.
    /// </summary>
    public static class UiLayoutProbe
    {
        /// <summary>HUD blocks that must not cover a control or each other.</summary>
        static readonly HashSet<string> Named = new()
        {
            "instrument", "minimap", "player-prompt", "key-hints", "desk-menu", "goal", "activity",
            "intro-prompt", "intro-steps", "intro-skip",
        };

        /// <summary>Full-width rows and lines whose content is centred: they cover what they fill, not their row.</summary>
        static readonly HashSet<string> Rows = new() { "player-prompt", "key-hints", "goal", "intro-prompt", "intro-steps" };

        /// <summary>Overlaps smaller than this (panel px) are touching edges, not covering.</summary>
        const float Slack = 2f;

        /// <summary>One line per problem; empty = clean.</summary>
        public static List<string> Check()
        {
            var parts = new List<(string name, Rect r)>();
            // All documents share one panel (UiPanel): its visual tree holds every HUD part.
            foreach (var d in Object.FindObjectsByType<UIDocument>())
                if (d.isActiveAndEnabled && d.rootVisualElement?.panel != null) { Collect(d.rootVisualElement.panel.visualTree, parts); break; }
            var problems = new List<string>();
            var screen = new Rect(0f, 0f, UiPanel.Size.x, UiPanel.Size.y);
            for (var i = 0; i < parts.Count; i++)
            {
                var a = parts[i];
                if (a.r.xMin < screen.xMin - Slack || a.r.yMin < screen.yMin - Slack || a.r.xMax > screen.xMax + Slack || a.r.yMax > screen.yMax + Slack)
                    problems.Add($"{a.name} leaves the screen {Fmt(a.r)} (screen {screen.width:0}x{screen.height:0})");
                for (var j = i + 1; j < parts.Count; j++)
                {
                    var b = parts[j];
                    var ox = Mathf.Min(a.r.xMax, b.r.xMax) - Mathf.Max(a.r.xMin, b.r.xMin);
                    var oy = Mathf.Min(a.r.yMax, b.r.yMax) - Mathf.Max(a.r.yMin, b.r.yMin);
                    if (ox > Slack && oy > Slack) problems.Add($"{a.name} covers {b.name} ({ox:0}x{oy:0} px)");
                }
            }
            return problems;
        }

        /// <summary>A line for logs and the browser check.</summary>
        public static string Summary()
        {
            var p = Check();
            var sb = new StringBuilder($"[UiCheck] {UiPanel.Form} {UiPanel.Size.x:0}x{UiPanel.Size.y:0} · ");
            sb.Append(p.Count == 0 ? "clean" : $"{p.Count} problems: " + string.Join(" | ", p));
            return sb.ToString();
        }

        static void Collect(VisualElement e, List<(string, Rect)> into)
        {
            if (e.resolvedStyle.display == DisplayStyle.None || e.resolvedStyle.visibility == Visibility.Hidden || e.resolvedStyle.opacity <= 0.01f) return;
            var touch = e.ClassListContains("jm-touch");
            if (touch || Named.Contains(e.name))
            {
                if (e is Label lab && string.IsNullOrEmpty(lab.text)) return; // an empty line covers nothing
                // A full-width row (key overlay, prompt) covers only what its children fill.
                var r = touch || !Rows.Contains(e.name) ? e.worldBound : Filled(e);
                if (r.width > 1f && r.height > 1f)
                {
                    var label = touch ? "touch:" + Label(e) : e.name;
                    into.Add((label, r));
                }
                return; // parts inside a block belong to it
            }
            foreach (var c in e.Children()) Collect(c, into);
        }

        static Rect Filled(VisualElement e)
        {
            if (e is Label text && e.childCount == 0) return TextRect(text);
            if (e.childCount == 0) return e.worldBound;
            var any = false;
            var r = default(Rect);
            foreach (var c in e.Children())
            {
                if (c.resolvedStyle.display == DisplayStyle.None) continue;
                var b = c is Label l && string.IsNullOrEmpty(l.text) ? default : c.worldBound;
                if (b.width < 1f || b.height < 1f) continue;
                r = any ? Rect.MinMaxRect(Mathf.Min(r.xMin, b.xMin), Mathf.Min(r.yMin, b.yMin), Mathf.Max(r.xMax, b.xMax), Mathf.Max(r.yMax, b.yMax)) : b;
                any = true;
            }
            return any ? r : default;
        }

        // A centred line of text covers its text, not the whole row it is laid out in.
        static Rect TextRect(Label l)
        {
            var b = l.worldBound;
            var size = l.MeasureTextSize(l.text, b.width, VisualElement.MeasureMode.AtMost, b.height, VisualElement.MeasureMode.Undefined);
            var w = Mathf.Min(b.width, size.x);
            var align = l.resolvedStyle.unityTextAlign;
            var centred = align == TextAnchor.MiddleCenter || align == TextAnchor.UpperCenter || align == TextAnchor.LowerCenter;
            var x = centred ? b.center.x - w * 0.5f : b.xMin;
            return new Rect(x, b.yMin, w, b.height);
        }

        static string Label(VisualElement e)
        {
            if (!string.IsNullOrEmpty(e.name)) return e.name;
            var l = e.Q<Label>();
            return l != null && !string.IsNullOrEmpty(l.text) ? l.text : "?";
        }

        static string Fmt(Rect r) => $"({r.xMin:0},{r.yMin:0})-({r.xMax:0},{r.yMax:0})";
    }
}
