using System;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>What kind of lamp lights how (matched by object name prefix in the place scenes).</summary>
    [CreateAssetMenu(menuName = "JapanMap/World/Lamp Light Settings")]
    public sealed class LampLightSettings : ScriptableObject
    {
        [Serializable]
        public sealed class Kind
        {
            [Tooltip("Object name prefix in the place scenes (streetLamp_3405 → streetLamp).")]
            public string prefix = "streetLamp";
            [Tooltip("Height of the lamp head above the object's origin, m.")]
            public float height = 6.5f;
            [Tooltip("Radius of the pool of light on the ground, m.")]
            public float poolRadius = 7f;
            [Tooltip("Pool colour (HDR, additive).")]
            public Color poolColor = new(1.4f, 0.95f, 0.6f);
            public Color lightColor = new(1f, 0.78f, 0.52f);
            public float lightIntensity = 6f;
            public float lightRange = 16f;
        }

        public Kind[] kinds = { new() };
        [Tooltip("Real point lights on the nearest lamps per tier (High, Medium, Low).")]
        public Vector3Int lights = new(12, 6, 0);
        [Tooltip("Pools drawn within this distance of the camera, m.")]
        public float poolDistance = 320f;
        [Tooltip("Re-pick the nearest lamps this often, s.")]
        public float pickInterval = 0.5f;
    }
}
