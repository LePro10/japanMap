using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Core.Ui
{
    /// <summary>
    /// What Escape / Back closes next: every open overlay (garage, photo mode, a sheet in the menu) pushes its
    /// close action and pops it when it closes. One Escape closes exactly one level (ASTRA §10: "a Back arrow
    /// always returns one level; closing the root resumes the game"); with nothing open the menu opens.
    /// </summary>
    public static class UiStack
    {
        static readonly List<(object owner, Action close)> _stack = new();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => _stack.Clear();

        public static void Clear() => _stack.Clear();

        public static int Count => _stack.Count;
        public static object Top => _stack.Count > 0 ? _stack[^1].owner : null;

        public static void Push(object owner, Action close)
        {
            Pop(owner);
            _stack.Add((owner, close));
        }

        public static void Pop(object owner)
        {
            for (var i = _stack.Count - 1; i >= 0; i--)
                if (ReferenceEquals(_stack[i].owner, owner)) _stack.RemoveAt(i);
        }

        public static bool Contains(object owner)
        {
            foreach (var e in _stack) if (ReferenceEquals(e.owner, owner)) return true;
            return false;
        }

        /// <summary>Closes the top level. False if nothing was open.</summary>
        public static bool Back()
        {
            if (_stack.Count == 0) return false;
            var (owner, close) = _stack[^1];
            // Off the stack first: a close action that only goes one level down puts itself back (photo result → framing).
            Pop(owner);
            close?.Invoke();
            return true;
        }
    }
}
