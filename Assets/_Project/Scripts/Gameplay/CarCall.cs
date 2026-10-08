using JapanMap.Core;
using JapanMap.OnFoot;
using UnityEngine;

namespace JapanMap.Gameplay
{
    /// <summary>
    /// "Call the car": find a clear, level parking spot on a road near the walker (legacy
    /// callPlayerCar.ts — rings of 8…32 m, 12 directions, road points rather than any ground, so
    /// the car never lands in a paddy, in water or on a slope). Better than the prototype: with no
    /// road in reach, a level, dry, clear patch of ground on the same rings will do.
    /// </summary>
    public static class CarCall
    {
        public struct Spot
        {
            public Vector3 position;
            public float heading;
            public float distance;
            public bool onRoad;
        }

        /// <summary>
        /// Search a spot for a car of <paramref name="halfSize"/> (x = half width, z = half length).
        /// <paramref name="ignore"/> is the car itself (it may stand in the way of its own new spot).
        /// </summary>
        public static bool TryFind(Vector3 player, IRoadLocator roads, WalkerSettings s, Vector3 halfSize, Collider[] ignore, out Spot spot)
        {
            spot = default;
            return Search(player, roads, s, halfSize, ignore, onRoad: true, out spot)
                   || Search(player, roads, s, halfSize, ignore, onRoad: false, out spot);
        }

        static bool Search(Vector3 player, IRoadLocator roads, WalkerSettings s, Vector3 halfSize, Collider[] ignore, bool onRoad, out Spot spot)
        {
            spot = default;
            var physics = Physics.defaultPhysicsScene;
            var groundMask = ~GameLayers.NotGround;
            var waterMask = groundMask | LayerMask.GetMask("Water");
            var waterLayer = GameLayers.Layer("Water");
            var margin = Mathf.Max(halfSize.x, halfSize.z) + 1f;
            foreach (var ring in s.callRings)
            for (var i = 0; i < s.callDirections; i++)
            {
                var a = i * Mathf.PI * 2f / s.callDirections;
                var dir = new Vector3(Mathf.Sin(a), 0f, Mathf.Cos(a));
                var p = player + dir * ring;
                var fwd = new Vector3(dir.z, 0f, -dir.x); // off-road: side-on to the walker
                if (onRoad && (roads == null || !roads.TryNearest(p, Vector3.forward, s.callRoadSnap, out p, out fwd))) continue;
                var flat = new Vector2(p.x - player.x, p.z - player.z).magnitude;
                if (flat < margin + 2f || flat > s.callMaxDistance) continue;
                var from = new Vector3(p.x, player.y + 40f, p.z);
                // First hit including water: a paddy or a river is no parking space.
                if (!physics.Raycast(from, Vector3.down, out var top, 120f, waterMask, QueryTriggerInteraction.Collide)) continue;
                if (top.collider.gameObject.layer == waterLayer) continue;
                if (!physics.Raycast(from, Vector3.down, out var hit, 120f, groundMask, QueryTriggerInteraction.Ignore)) continue;
                var ground = hit.point.y;
                var rot = Quaternion.LookRotation(new Vector3(fwd.x, 0f, fwd.z), Vector3.up);
                if (!Level(physics, hit.point, rot, halfSize, s.callMaxStep, groundMask)) continue;
                // Nothing in the car's box: walls, poles, other cars, people (the old car excepted).
                var centre = new Vector3(p.x, ground + 0.4f + 1.2f, p.z);
                if (Blocked(centre, new Vector3(halfSize.x + 0.4f, 1.15f, halfSize.z + 0.4f), rot, ignore)) continue;
                spot = new Spot { position = new Vector3(p.x, ground, p.z), heading = rot.eulerAngles.y, distance = flat, onRoad = onRoad };
                return true;
            }
            return false;
        }

        static bool Level(PhysicsScene physics, Vector3 at, Quaternion rot, Vector3 half, float maxStep, int mask)
        {
            for (var cx = -1; cx <= 1; cx += 2)
            for (var cz = -1; cz <= 1; cz += 2)
            {
                var c = at + rot * new Vector3(cx * half.x, 0f, cz * half.z);
                if (!physics.Raycast(c + Vector3.up * 5f, Vector3.down, out var h, 10f, mask, QueryTriggerInteraction.Ignore)) return false;
                if (Mathf.Abs(h.point.y - at.y) > maxStep) return false;
            }
            return true;
        }

        static readonly Collider[] Hits = new Collider[16];

        static bool Blocked(Vector3 centre, Vector3 half, Quaternion rot, Collider[] ignore)
        {
            var n = Physics.OverlapBoxNonAlloc(centre, half, Hits, rot, ~(LayerMask.GetMask("Water", "UI") | Physics.IgnoreRaycastLayer), QueryTriggerInteraction.Ignore);
            for (var i = 0; i < n; i++)
                if (System.Array.IndexOf(ignore, Hits[i]) < 0) return true;
            return false;
        }
    }
}
