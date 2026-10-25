using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Core.Ui
{
    /// <summary>
    /// Touch controls shared by driving, walking and photo mode (ASTRA §10): round hold buttons that track their own
    /// finger (pointer capture — a finger lost between down and up must not leave a button held), a stick, and a
    /// <see cref="Group"/> in which a finger may slide from one button to the next ("dragging from Boost onto Drift
    /// releases Boost and immediately applies Drift"). Sizes in CSS px; styles from Game.uss (.jm-touch).
    /// </summary>
    public static class TouchKit
    {
        public static VisualElement Circle(VisualElement parent, float size, string label, params string[] classes)
        {
            var c = new VisualElement();
            c.AddToClassList("jm-touch");
            foreach (var k in classes) c.AddToClassList(k);
            c.style.width = c.style.height = size;
            if (!string.IsNullOrEmpty(label))
            {
                var l = new Label(label) { pickingMode = PickingMode.Ignore };
                l.style.fontSize = Mathf.Clamp(size * 0.22f, 11f, 16f);
                c.Add(l);
            }
            parent.Add(c);
            return c;
        }

        /// <summary>
        /// Puts a symbol on a round button and shrinks its word to a caption under it (the word stays: first-time
        /// players and the text-based test/tool lookups still read it). Returns the button.
        /// </summary>
        public static VisualElement Glyph(VisualElement button, TouchGlyph glyph)
        {
            var size = button.style.height.value.value;
            var label = button.Q<Label>();
            var color = label != null && label.style.color.keyword == StyleKeyword.Undefined ? label.style.color.value : new Color(0.965f, 0.937f, 0.894f);
            button.Q<TouchGlyphElement>()?.RemoveFromHierarchy();
            button.Insert(0, new TouchGlyphElement(glyph, Mathf.Round(size * 0.42f), color));
            button.style.justifyContent = Justify.Center;
            button.style.alignItems = Align.Center;
            if (label != null)
            {
                label.style.flexGrow = 0;
                label.style.fontSize = Mathf.Clamp(size * 0.16f, 8f, 10f);
                label.style.marginTop = 1f;
            }
            return button;
        }

        /// <summary>A button held by one finger; <paramref name="changed"/> true on down, false on up/cancel.</summary>
        public static VisualElement Hold(VisualElement parent, float size, string label, Action<bool> changed, params string[] classes)
        {
            var b = Circle(parent, size, label, classes);
            var pointer = -1;
            b.RegisterCallback<PointerDownEvent>(e =>
            {
                if (pointer >= 0) return;
                pointer = e.pointerId;
                b.CapturePointer(pointer);
                b.AddToClassList("jm-touch--down");
                changed(true);
                e.StopPropagation();
            });
            void Up(int id)
            {
                if (id != pointer) return;
                if (b.HasPointerCapture(id)) b.ReleasePointer(id);
                pointer = -1;
                b.RemoveFromClassList("jm-touch--down");
                changed(false);
            }
            b.RegisterCallback<PointerUpEvent>(e => Up(e.pointerId));
            b.RegisterCallback<PointerCancelEvent>(e => Up(e.pointerId));
            b.RegisterCallback<PointerCaptureOutEvent>(e => { if (pointer >= 0) Up(pointer); });
            return b;
        }

        /// <summary>A tap button (acts on release over it).</summary>
        public static VisualElement Tap(VisualElement parent, float size, string label, Action tapped, params string[] classes)
        {
            var b = Circle(parent, size, label, classes);
            b.RegisterCallback<PointerDownEvent>(e => { b.AddToClassList("jm-touch--down"); b.CapturePointer(e.pointerId); e.StopPropagation(); });
            b.RegisterCallback<PointerUpEvent>(e =>
            {
                b.RemoveFromClassList("jm-touch--down");
                if (b.HasPointerCapture(e.pointerId)) b.ReleasePointer(e.pointerId);
                if (b.worldBound.Contains(e.position)) tapped();
            });
            b.RegisterCallback<PointerCancelEvent>(e => b.RemoveFromClassList("jm-touch--down"));
            return b;
        }

        /// <summary>
        /// Buttons one finger can slide between: the finger belongs to the group, the button under it is the active
        /// one. Another finger may hold another button of the same group at the same time.
        /// </summary>
        public sealed class Group
        {
            readonly List<(VisualElement element, Action<bool> changed)> _buttons = new();
            readonly Dictionary<int, int> _fingerOn = new(); // pointer → button index (−1 = none)

            public VisualElement Add(VisualElement parent, float size, string label, Action<bool> changed, params string[] classes)
            {
                var b = Circle(parent, size, label, classes);
                var index = _buttons.Count;
                _buttons.Add((b, changed));
                b.RegisterCallback<PointerDownEvent>(e =>
                {
                    if (_fingerOn.ContainsKey(e.pointerId)) return;
                    b.CapturePointer(e.pointerId);
                    Move(e.pointerId, index);
                    e.StopPropagation();
                });
                b.RegisterCallback<PointerMoveEvent>(e =>
                {
                    if (!_fingerOn.ContainsKey(e.pointerId)) return;
                    Move(e.pointerId, Under(e.position));
                });
                void Up(int id)
                {
                    if (!_fingerOn.ContainsKey(id)) return;
                    Move(id, -1);
                    _fingerOn.Remove(id);
                    if (b.HasPointerCapture(id)) b.ReleasePointer(id);
                }
                b.RegisterCallback<PointerUpEvent>(e => Up(e.pointerId));
                b.RegisterCallback<PointerCancelEvent>(e => Up(e.pointerId));
                return b;
            }

            /// <summary>Button index under a panel point, or −1. Slightly generous (8 px) so a slide does not drop out.</summary>
            int Under(Vector2 p)
            {
                for (var i = 0; i < _buttons.Count; i++)
                {
                    var r = _buttons[i].element.worldBound;
                    r.xMin -= 8f; r.yMin -= 8f; r.xMax += 8f; r.yMax += 8f;
                    if (r.Contains(p) && _buttons[i].element.resolvedStyle.display != DisplayStyle.None) return i;
                }
                return -1;
            }

            void Move(int pointer, int to)
            {
                var from = _fingerOn.TryGetValue(pointer, out var f) ? f : -1;
                if (from == to) { _fingerOn[pointer] = to; return; }
                _fingerOn[pointer] = to;
                if (from >= 0 && !HeldByOther(pointer, from)) Set(from, false);
                if (to >= 0) Set(to, true);
            }

            bool HeldByOther(int pointer, int index)
            {
                foreach (var kv in _fingerOn) if (kv.Key != pointer && kv.Value == index) return true;
                return false;
            }

            void Set(int index, bool on)
            {
                var (e, changed) = _buttons[index];
                e.EnableInClassList("jm-touch--down", on);
                changed(on);
            }

            /// <summary>Lets go of everything (mode change, menu).</summary>
            public void ReleaseAll()
            {
                foreach (var kv in _fingerOn) if (kv.Value >= 0) Set(kv.Value, false);
                _fingerOn.Clear();
            }
        }

        /// <summary>A stick: axes −1…1 (y up), dead zone; follows one finger.</summary>
        public sealed class Stick
        {
            public readonly VisualElement Base, Knob;
            public Vector2 Axes { get; private set; }
            public bool Held => _pointer >= 0;
            public event Action Pressed;
            readonly float _dead;
            int _pointer = -1;

            public Stick(VisualElement parent, Vector2 size, float deadZone)
            {
                _dead = deadZone;
                Base = Circle(parent, size.x, "");
                Base.name = "stick";
                Base.style.height = size.y;
                Base.style.borderTopLeftRadius = Base.style.borderTopRightRadius = Base.style.borderBottomLeftRadius = Base.style.borderBottomRightRadius = Mathf.Min(size.x, size.y) * 0.5f;
                Knob = Circle(Base, Mathf.Min(size.x, size.y) * 0.45f, "");
                Knob.pickingMode = PickingMode.Ignore;
                Knob.style.position = Position.Absolute;
                Center();
                Base.RegisterCallback<PointerDownEvent>(e =>
                {
                    if (_pointer >= 0) return;
                    _pointer = e.pointerId;
                    Base.CapturePointer(e.pointerId);
                    Move(e.position);
                    Pressed?.Invoke();
                    e.StopPropagation();
                });
                Base.RegisterCallback<PointerMoveEvent>(e => { if (e.pointerId == _pointer) Move(e.position); });
                Base.RegisterCallback<PointerUpEvent>(e => Release(e.pointerId));
                Base.RegisterCallback<PointerCancelEvent>(e => Release(e.pointerId));
            }

            void Move(Vector2 p)
            {
                var r = Base.worldBound;
                var off = new Vector2((p.x - r.center.x) / (r.width * 0.5f), (p.y - r.center.y) / (r.height * 0.5f));
                if (off.magnitude > 1f) off.Normalize();
                var axes = new Vector2(off.x, -off.y); // UI y grows downwards; up is +y
                Axes = axes.magnitude < _dead ? Vector2.zero : axes;
                Knob.style.left = Length.Percent(50f + off.x * 32f);
                Knob.style.top = Length.Percent(50f + off.y * 32f);
            }

            void Release(int id)
            {
                if (id != _pointer) return;
                if (Base.HasPointerCapture(id)) Base.ReleasePointer(id);
                _pointer = -1;
                Axes = Vector2.zero;
                Center();
            }

            void Center()
            {
                Knob.style.left = Length.Percent(50f);
                Knob.style.top = Length.Percent(50f);
                Knob.style.translate = new Translate(Length.Percent(-50), Length.Percent(-50));
            }

            public void ReleaseAll()
            {
                if (_pointer >= 0) Release(_pointer);
            }
        }

        /// <summary>Places an element from the right or left edge (mirrored for left-handed play) and the bottom.</summary>
        public static void Place(VisualElement e, float fromOuter, float bottom, bool rightSide, bool mirror)
        {
            var right = rightSide != mirror;
            e.style.position = Position.Absolute;
            e.style.left = right ? StyleKeyword.Auto : fromOuter;
            e.style.right = right ? fromOuter : StyleKeyword.Auto;
            e.style.bottom = bottom;
            e.style.top = StyleKeyword.Auto;
        }
    }
}
