using UnityEngine;

namespace JapanMap.Gameplay.Traffic
{
    /// <summary>
    /// The traffic models (asset sprint 6) and the street's paint mix, written by the figure import from traffic.json.
    /// Streamed (LifeContent.Traffic); weights and wheelbases are choices and stay when the import runs again.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Life/Traffic Looks", fileName = "TrafficLooks")]
    public sealed class TrafficLooks : ScriptableObject
    {
        [System.Serializable]
        public struct Model
        {
            public string name;
            public GameObject prefab;
            [Tooltip("Share of the street (relative).")]
            public float weight;
            [Tooltip("Width, length, height, m (traffic.json).")]
            public Vector3 size;
            [Tooltip("Axle distance, m: the model's origin sits midway between the axles.")]
            public float wheelbase;
            [Tooltip("Has the M_TrafficPaint slot (taxis and the bus keep their livery).")]
            public bool paint;
        }

        [System.Serializable]
        public struct Paint
        {
            public string name;
            public Color color;
            public float weight;
        }

        public Model[] models = { };
        [Tooltip("Colour mix of Japanese streets: mostly pearl white, silver, black (traffic.json).")]
        public Paint[] paints = { };
        [Tooltip("M_TrafficPaint: tinted per colour of the mix.")]
        public Material paintMaterial;
    }
}
