using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// Walk-in shops (legacy CityInteriorLayout: diner and corner mart), boxes in Unity coordinates.
    /// Written by the life import from SourceData/legacy/places/interiors.json.
    /// </summary>
    public sealed class InteriorSet : ScriptableObject
    {
        [Serializable]
        public struct Box
        {
            public Vector3 centre, size;
            public string finish;
            public bool solid, visible;
        }

        [Serializable]
        public class Interior
        {
            public string id;
            public List<Box> boxes = new();
        }

        public List<Interior> interiors = new();

        /// <summary>Colour per finish (legacy InteriorFinish).</summary>
        public static Color Finish(string f) => f switch
        {
            "plaster" => new Color(0.86f, 0.82f, 0.74f),
            "wood" => new Color(0.55f, 0.38f, 0.24f),
            "dark" => new Color(0.16f, 0.15f, 0.15f),
            "tile" => new Color(0.72f, 0.74f, 0.72f),
            "metal" => new Color(0.6f, 0.62f, 0.64f),
            "red" => new Color(0.62f, 0.16f, 0.13f),
            "green" => new Color(0.18f, 0.4f, 0.33f),
            _ => Color.magenta,
        };
    }
}
