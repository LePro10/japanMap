using System;
using UnityEngine;

namespace JapanMap.Gameplay.Discovery
{
    /// <summary>
    /// The 24 discovery cards, three per region (legacy ASTRA_PLAN.md §9 "Replace ninety anonymous
    /// pickups with twenty-four discoveries"). Positions in Unity metres; each card notes where its
    /// anchor came from and how it was adapted to the map as built.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Discovery Set")]
    public sealed class DiscoverySet : ScriptableObject
    {
        public enum Trigger
        {
            /// <summary>On foot, close, press Use.</summary>
            Inspect,
            /// <summary>Walk or drive within the radius.</summary>
            Approach,
            /// <summary>Press the labelled buttons in the order of the hint.</summary>
            Sequence,
            /// <summary>Press the token itself in a rhythm (gaps between presses).</summary>
            Rhythm,
        }

        [Serializable]
        public struct Button
        {
            public string label;
            [Tooltip("Offset from the card, local to its yaw: x right, y forward, metres.")]
            public Vector2 offset;
        }

        [Serializable]
        public struct Card
        {
            public string id;
            public string region;
            public string title;
            [Tooltip("Hint shown on inspecting a puzzle; ASTRA wording.")]
            public string hint;
            public Vector2 position;
            [Tooltip("Terrain height there, written by the setup; the token is put on what lies just above it (pavement, plate).")]
            public float ground;
            public float yaw;
            public Trigger trigger;
            public Button[] buttons;
            [Tooltip("Sequence: button indices in the right order.")]
            public int[] answer;
            [Tooltip("Rhythm: allowed seconds between press n and n+1 (min, max).")]
            public Vector2[] gaps;
            [Tooltip("Cosmetic the puzzle reveals (Phase 8 makes it usable).")]
            public string reward;
            [TextArea] public string note;
        }

        public Card[] cards = Array.Empty<Card>();

        [Header("Reach")]
        [Tooltip("Inspect and press reach on foot, m (ASTRA: within 2 m; a little more for the stand-in token).")]
        public float useReach = 2.5f;
        [Tooltip("Approach radius for walking, m (ASTRA: 3 m).")]
        public float approachReach = 3f;
        [Tooltip("Approach radius for the car centre, m (car half-length added to 3 m).")]
        public float approachReachCar = 5f;
        [Tooltip("Tokens and buttons are shown within this distance of the player, m.")]
        public float showDistance = 160f;

        public Vector3 ButtonPosition(Card c, int i)
        {
            var o = c.buttons[i].offset;
            var r = Quaternion.Euler(0f, c.yaw, 0f);
            return new Vector3(c.position.x, 0f, c.position.y) + r * new Vector3(o.x, 0f, o.y);
        }
    }
}
