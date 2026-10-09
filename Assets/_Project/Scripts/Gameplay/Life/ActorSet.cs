using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// People and animals that stay at their spot (workers, shop visitors, fishers, cats, goats,
    /// chickens), in Unity coordinates. Written by the life import from the place data
    /// (SourceData/legacy/places/*.json "actors"), never by hand.
    /// </summary>
    public sealed class ActorSet : ScriptableObject
    {
        [Serializable]
        public struct Actor
        {
            public string place, kind;
            public Vector3 position;
            public float yaw;
        }

        public List<Actor> actors = new();
    }
}
