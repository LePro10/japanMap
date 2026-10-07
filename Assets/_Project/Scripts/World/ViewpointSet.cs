using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Named camera positions. Every look or performance question is answered at one of these, so
    /// before/after images and numbers come from the same spot. Unity coordinates (north = +Z).
    /// Initial set from legacy src/debug/viewpoints.ts with z mirrored.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Viewpoint Set")]
    public sealed class ViewpointSet : ScriptableObject
    {
        [Serializable]
        public struct Viewpoint
        {
            public string name;
            public Vector3 position;
            public Vector3 lookAt;
            [TextArea] public string note;

            public Quaternion Rotation => Quaternion.LookRotation(lookAt - position, Vector3.up);
        }

        public List<Viewpoint> viewpoints = new();

        public bool TryGet(string name, out Viewpoint viewpoint)
        {
            foreach (var v in viewpoints)
                if (v.name == name) { viewpoint = v; return true; }
            viewpoint = default;
            return false;
        }

        public void Apply(string name, Transform target)
        {
            if (!TryGet(name, out var v)) throw new ArgumentException($"unknown viewpoint '{name}'");
            target.SetPositionAndRotation(v.position, v.Rotation);
        }
    }
}
