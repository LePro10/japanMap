using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Life
{
    /// <summary>
    /// Animals placed around map props by the life import (asset sprint 6 models had no place: pigeons at the shrine,
    /// crows on power poles and by the fish huts, shiba dogs at farmhouses). Read by <see cref="LifeImport"/> only.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Life/Animal Spots", fileName = "AnimalSpots")]
    public sealed class AnimalSpots : ScriptableObject
    {
        public const string Path = LifeSetup.Dir + "/AnimalSpots.asset";

        [System.Serializable]
        public struct Rule
        {
            [Tooltip("Prop id from props.json (powerPole, torii, …).")]
            public string prop;
            [Tooltip("Actor kind (FigureSet animal look): pigeon, crow, crowPerch, dog.")]
            public string kind;
            [Tooltip("Every n-th prop of that id gets animals (1 = all).")]
            public int every;
            [Tooltip("Animals per chosen prop.")]
            public int count;
            [Tooltip("Distance from the prop's centre, m (min, max); clear of buildings.")]
            public Vector2 radius;
            [Tooltip("Sit on top of the prop (pole) instead of on the ground next to it.")]
            public bool onTop;
        }

        public Rule[] rules =
        {
            new() { prop = "torii", kind = "pigeon", every = 1, count = 2, radius = new Vector2(1.5f, 4f) },
            new() { prop = "chozuya", kind = "pigeon", every = 1, count = 3, radius = new Vector2(2f, 4f) },
            new() { prop = "templeHall", kind = "pigeon", every = 1, count = 3, radius = new Vector2(8f, 12f) },
            new() { prop = "powerPole", kind = "crowPerch", every = 5, count = 1, onTop = true },
            new() { prop = "fishHut", kind = "crow", every = 2, count = 1, radius = new Vector2(4f, 7f) },
            new() { prop = "farmhouse", kind = "dog", every = 2, count = 1, radius = new Vector2(8f, 11f) },
        };

        public static AnimalSpots LoadOrCreate()
        {
            var s = AssetDatabase.LoadAssetAtPath<AnimalSpots>(Path);
            if (s != null) return s;
            s = CreateInstance<AnimalSpots>();
            AssetDatabase.CreateAsset(s, Path);
            return s;
        }
    }
}
