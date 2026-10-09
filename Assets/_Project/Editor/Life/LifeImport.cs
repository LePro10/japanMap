using System;
using System.IO;
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
            return $"[Life] {actors.actors.Count} actors, {shops.interiors.Count} shops ({boxes} boxes)";
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
