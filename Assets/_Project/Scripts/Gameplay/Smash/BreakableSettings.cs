using System;
using UnityEngine;

namespace JapanMap.Gameplay.Smash
{
    /// <summary>
    /// What breaks and when. A piece gives way only if the car comes INTO it fast enough and with
    /// enough energy (legacy breakables.ts shouldBreak: a graze at 120 km/h leaves the rail standing,
    /// a 25 km/h frontal hit tears it off). Thresholds and speed losses from legacy breakables.ts and
    /// SmashField.ts; which library models belong to which kind is chosen here.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Life/Breakable Settings", fileName = "BreakableSettings")]
    public sealed class BreakableSettings : ScriptableObject
    {
        [Serializable]
        public class Kind
        {
            public string name;
            [Tooltip("Collider objects or prefab instances whose name starts with one of these.")]
            public string[] match = { };
            [Tooltip("Speed into the surface needed, m/s (legacy RAIL 4.6, TREE 7.8, toys 1.4).")]
            public float minSpeed = 4.6f;
            [Tooltip("Kinetic energy of that approach, J (legacy RAIL 9 000, TREE 21 000).")]
            public float energy = 9000f;
            [Tooltip("Speed the car loses, m/s (legacy cone 0.15, crate 0.45, barrel 0.9).")]
            public float carLoss = 0.9f;
            [Tooltip("Debris pieces: count along x, y, z of the collider box.")]
            public Vector3Int split = new(1, 3, 1);
            [Tooltip("Mass of the whole object, kg (pieces share it).")]
            public float mass = 40f;
            public Color color = new(0.55f, 0.55f, 0.55f);
        }

        public Kind[] kinds =
        {
            new() { name = "post", match = new[] { "delineator", "streetLamp", "avenueLamp", "parkLamp", "lampPost", "bicycle" },
                    minSpeed = 4.6f, energy = 9000f, carLoss = 0.9f, split = new Vector3Int(1, 3, 1), mass = 60f, color = new Color(0.32f, 0.33f, 0.35f) },
            new() { name = "vending", match = new[] { "vending" },
                    minSpeed = 6.0f, energy = 15000f, carLoss = 2.0f, split = new Vector3Int(2, 3, 1), mass = 250f, color = new Color(0.82f, 0.84f, 0.86f) },
            new() { name = "fence", match = new[] { "rack", "netRack", "squidRack", "dryingNet", "lanternRack", "crateStack", "bench", "parkBench", "yardGear" },
                    minSpeed = 1.4f, energy = 0f, carLoss = 0.45f, split = new Vector3Int(3, 2, 1), mass = 40f, color = new Color(0.45f, 0.33f, 0.2f) },
            new() { name = "hut", match = new[] { "shed", "fishHut" },
                    minSpeed = 7.8f, energy = 21000f, carLoss = 3.0f, split = new Vector3Int(3, 3, 2), mass = 600f, color = new Color(0.42f, 0.32f, 0.22f) },
        };

        [Header("Trees (instanced vegetation; legacy TREE_BREAK_SPEED 7.8 / TREE_BREAK_ENERGY 21 000)")]
        public Kind tree = new() { name = "tree", minSpeed = 7.8f, energy = 21000f, carLoss = 3.5f, split = new Vector3Int(1, 3, 1), mass = 400f, color = new Color(0.33f, 0.24f, 0.16f) };
        [Tooltip("Crown pieces thrown from the top of the trunk (legacy DebrisFx: the tree tips over, then parts).")]
        public int treeCrownPieces = 4;
        public Color treeCrown = new(0.2f, 0.33f, 0.18f);
        [Tooltip("Size of a crown piece, m.")]
        public float treeCrownPiece = 1.4f;

        [Header("Limits (legacy breakables.ts / DebrisFx.ts)")]
        [Tooltip("Breaks per physics step at most — a drift must not tear down a whole row.")]
        public int maxBreaksPerStep = 2;
        [Tooltip("Debris pieces alive at once (recycled, oldest first). Legacy CAP 64.")]
        public int maxPieces = 64;
        [Tooltip("Seconds a piece lies before it sinks away. Legacy LIFE 7.5.")]
        public float pieceLife = 7.5f;
        [Tooltip("Share of the car's velocity the pieces take along.")]
        public float carry = 0.75f;
        [Tooltip("A broken object comes back after this long, once the player is this far away (legacy SmashField 20 s, 120 m).")]
        public float respawnSeconds = 20f;
        public float respawnDistance = 120f;

        public Kind Find(string objectName)
        {
            foreach (var k in kinds)
                foreach (var m in k.match)
                    if (objectName.StartsWith(m, StringComparison.Ordinal)) return k;
            return null;
        }
    }
}
