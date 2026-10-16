using System;
using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// Who lives in the world (asset sprint 6): the player's body, the looks of pedestrians and place
    /// actors (body + clip + hand prop per role), the clips' walking speeds and the animal models.
    /// Written by the figure import (Editor/Art/FigureImporter) from ArtSource/exports/characters;
    /// roles and weights are choices and stay when the import runs again.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Life/Figure Set", fileName = "FigureSet")]
    public sealed class FigureSet : ScriptableObject
    {
        [Serializable]
        public struct Clip
        {
            public string name;
            [Tooltip("Ground speed the clip was animated for, m/s (anims.json); 0 = standing clip.")]
            public float speed;
            public bool loop;
        }

        [Serializable]
        public struct Prop
        {
            public string name;
            public GameObject prefab;
            public bool rightHand;
            [Tooltip("Held upright in the world (open umbrella, phone, rod) instead of hanging along the hand.")]
            public bool upright;
        }

        [Serializable]
        public struct Look
        {
            [Tooltip("crowd = pedestrians; else the place-actor kind (worker, fisher, seated, visitor).")]
            public string role;
            public GameObject[] bodies;
            [Tooltip("Clip while standing still (actors) or walking (crowd: Walk / WalkUmbrella).")]
            public string clip;
            [Tooltip("Hand prop name (empty = none).")]
            public string prop;
            public float weight;
        }

        [Serializable]
        public struct AnimalLook
        {
            public string kind;
            public GameObject[] prefabs;
        }

        public GameObject player;
        public Clip[] clips = { };
        public Prop[] props = { };
        public Look[] looks = { };
        public AnimalLook[] animals = { };

        [Header("Motion")]
        [Tooltip("Below this ground speed a figure stands (Idle), m/s.")]
        public float standBelow = 0.15f;
        [Tooltip("From this ground speed on a figure runs instead of walking, m/s.")]
        public float runFrom = 2.6f;
        [Tooltip("Playback rate limits when a walk/run clip is matched to the ground speed (feet would skate or blur outside).")]
        public Vector2 rateRange = new(0.6f, 1.9f);
        [Tooltip("Cross-fade between clips, s.")]
        public float fade = 0.2f;

        public float SpeedOf(string clip)
        {
            foreach (var c in clips) if (c.name == clip) return c.speed;
            return 0f;
        }

        public bool TryProp(string name, out Prop prop)
        {
            foreach (var p in props)
                if (p.name == name && p.prefab != null) { prop = p; return true; }
            prop = default;
            return false;
        }

        /// <summary>A look for <paramref name="role"/>, weighted; <paramref name="pick"/> 0…1 makes it repeatable.</summary>
        public bool TryLook(string role, float pick, out Look look)
        {
            var total = 0f;
            foreach (var l in looks) if (l.role == role && l.bodies is { Length: > 0 }) total += l.weight;
            var at = pick * total;
            foreach (var l in looks)
            {
                if (l.role != role || l.bodies is not { Length: > 0 }) continue;
                at -= l.weight;
                if (at <= 0f || total <= 0f) { look = l; return true; }
            }
            look = default;
            return false;
        }

        public GameObject Animal(string kind, float pick)
        {
            foreach (var a in animals)
                if (a.kind == kind && a.prefabs is { Length: > 0 })
                    return a.prefabs[Mathf.Min(a.prefabs.Length - 1, (int)(pick * a.prefabs.Length))];
            return null;
        }
    }
}
