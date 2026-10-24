using System;
using System.IO;
using JapanMap.Core;
using JapanMap.Editor.Places;
using JapanMap.Gameplay.Life;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Life
{
    /// <summary>
    /// Place actors and walk-in shops from the exported place data into Data/Life (ActorSet,
    /// InteriorSet): Unity coordinates, on the ground. Run by Life/Setup and by the map import.
    /// </summary>
    public static class LifeImport
    {
        [Serializable] class ActorFile { public string place; public RawActor[] actors = { }; }
        [Serializable] class RawActor { public string kind; public float x, z, yaw; }
        [Serializable] class InteriorFile { public RawInterior[] interiors = { }; }
        [Serializable] class RawInterior { public string id; public RawBox[] boxes = { }; }
        [Serializable] class RawBox { public float x, y, z, w, h, d; public string finish; public bool solid, visible; }

        public const string ActorsPath = LifeSetup.Dir + "/Actors.asset";
        public const string InteriorsPath = LifeSetup.Dir + "/Interiors.asset";
        static readonly string[] ActorPlaces = { "sakura", "funaura", "gassho" };

        [MenuItem("JapanMap/Life/Import Actors And Shops")]
        public static string Import()
        {
            var actors = Load<ActorSet>(ActorsPath);
            actors.actors.Clear();
            foreach (var place in ActorPlaces)
            {
                var path = PlaceSource.PathOf(place);
                if (!File.Exists(path)) continue;
                var f = JsonUtility.FromJson<ActorFile>(File.ReadAllText(path));
                foreach (var a in f.actors)
                {
                    var at = PlaceSource.ToUnity(a.x, a.z);
                    at.y = PlaceImporter.Ground(at);
                    actors.actors.Add(new ActorSet.Actor { place = f.place, kind = a.kind, position = at, yaw = Mathf.Repeat(PlaceSource.Yaw(a.yaw), 360f) });
                }
            }
            var placed = actors.actors.Count;
            AddWorldAnimals(actors);
            EditorUtility.SetDirty(actors);

            var shops = Load<InteriorSet>(InteriorsPath);
            shops.interiors.Clear();
            var file = PlaceSource.PathOf("interiors");
            var boxes = 0;
            if (File.Exists(file))
            {
                foreach (var raw in JsonUtility.FromJson<InteriorFile>(File.ReadAllText(file)).interiors)
                {
                    // The shop floor is the city ground at the shop's centre (legacy floorY = slab + kerb).
                    var cx = 0f; var cz = 0f;
                    foreach (var b in raw.boxes) { cx += b.x; cz += b.z; }
                    var centre = PlaceSource.ToUnity(cx / raw.boxes.Length, cz / raw.boxes.Length);
                    var floor = PlaceImporter.Ground(centre);
                    var shop = new InteriorSet.Interior { id = raw.id };
                    foreach (var b in raw.boxes)
                    {
                        var p = PlaceSource.ToUnity(b.x, b.z);
                        p.y = floor + b.y;
                        shop.boxes.Add(new InteriorSet.Box { centre = p, size = new Vector3(b.w, b.h, b.d), finish = b.finish, solid = b.solid, visible = b.visible });
                        boxes++;
                    }
                    shops.interiors.Add(shop);
                }
            }
            EditorUtility.SetDirty(shops);
            AssetDatabase.SaveAssets();
            return $"[Life] {placed} place actors + {actors.actors.Count - placed} world animals, {shops.interiors.Count} shops ({boxes} boxes)";
        }

        /// <summary>
        /// Animals beside map props (AnimalSpots): on free ground next to the prop, or on top of the pole. Needs
        /// Game.unity open (terrain, props, sea). Seeded: the same crow sits on the same pole after every import.
        /// </summary>
        static void AddWorldAnimals(ActorSet actors)
        {
            var rules = AnimalSpots.LoadOrCreate().rules;
            var settings = Map.MapImportSettings.LoadOrCreate();
            var raw = File.ReadAllText(Map.LegacySource.PathOf(settings, "props/props.json"));
            var props = JsonUtility.FromJson<Map.LegacySource.Props>(raw).props;
            var sea = Map.MapScene.Part(Map.WaterImporter.GroupName, "Sea");
            var seaY = sea != null && sea.TryGetComponent<Renderer>(out var sr) ? sr.bounds.max.y : float.MinValue;
            Physics.SyncTransforms(); // fresh imports report collider bounds at the origin until then
            var paddy = Map.WaterImporter.PaddyAt(settings);
            var rng = new System.Random(4242);
            var ground = ~GameLayers.NotGround;
            foreach (var rule in rules)
            {
                var n = 0;
                foreach (var p in props)
                {
                    if (p.id != rule.prop || n++ % Mathf.Max(1, rule.every) != 0) continue;
                    var at = Map.LegacySource.ToUnity(p.x, 0, p.z);
                    for (var k = 0; k < rule.count; k++)
                    {
                        var yaw = (float)rng.NextDouble() * 360f;
                        if (rule.onTop)
                        {
                            if (PoleTop(rule.prop, at) is { } top) actors.actors.Add(new ActorSet.Actor { place = "world", kind = rule.kind, position = top, yaw = yaw });
                            continue;
                        }
                        // A few tries for a free spot: on the ground (not a roof), above the sea, not in a paddy, nothing in the way.
                        for (var tries = 0; tries < 8; tries++)
                        {
                            var angle = (float)rng.NextDouble() * Mathf.PI * 2f;
                            var dist = Mathf.Lerp(rule.radius.x, rule.radius.y, (float)rng.NextDouble());
                            var spot = at + new Vector3(Mathf.Cos(angle), 0f, Mathf.Sin(angle)) * dist;
                            spot.y = PlaceImporter.Ground(spot);
                            if (!Physics.Raycast(spot + Vector3.up * 3f, Vector3.down, out var hit, 10f, ground)) continue;
                            if (Mathf.Abs(hit.point.y - spot.y) > 0.8f || hit.point.y < seaY + 0.2f || paddy(hit.point)) continue;
                            if (Physics.CheckCapsule(hit.point + Vector3.up * 0.5f, hit.point + Vector3.up * 0.9f, 0.3f, ~0, QueryTriggerInteraction.Ignore)) continue;
                            actors.actors.Add(new ActorSet.Actor { place = "world", kind = rule.kind, position = hit.point, yaw = yaw });
                            break;
                        }
                    }
                }
            }
        }

        /// <summary>Top of the placed prop nearest to <paramref name="at"/> (the pole models differ in height).</summary>
        static Vector3? PoleTop(string id, Vector3 at)
        {
            Transform best = null;
            var bestD = 9f; // 3 m
            foreach (var group in Map.MapScene.Parts("Props"))
            {
                if (group.name != id) continue;
                foreach (Transform t in group)
                {
                    if (t.name == Map.PowerCables.ObjectName) continue;
                    var d = new Vector2(t.position.x - at.x, t.position.z - at.z).sqrMagnitude;
                    if (d < bestD) { bestD = d; best = t; }
                }
            }
            if (best == null) return null;
            var rs = best.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return null;
            // On the pivot (the pole itself), not the bounds centre: guy wires and transformers widen the bounds.
            var top = rs[0].bounds.max.y;
            foreach (var r in rs) top = Mathf.Max(top, r.bounds.max.y);
            return new Vector3(best.position.x, top, best.position.z);
        }

        static T Load<T>(string path) where T : ScriptableObject
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a != null) return a;
            if (!AssetDatabase.IsValidFolder(LifeSetup.Dir)) AssetDatabase.CreateFolder("Assets/_Project/Data", "Life");
            a = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(a, path);
            return a;
        }
    }
}
