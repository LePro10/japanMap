using System.Collections.Generic;
using System.IO;
using System.Linq;
using JapanMap.Editor.Look;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.Editor.Art
{
    /// <summary>
    /// Scenes/Showroom.unity: every library prefab under the game's Look on a wet street, one row
    /// per style (fronts face +Z, the street). For judging models under real light and for the
    /// asset sprint's light test. Rebuilt from scratch each time. Menu: JapanMap/Art/Build Showroom.
    /// Captures: Captures/showroom-&lt;row&gt;.png.
    /// </summary>
    public static class Showroom
    {
        public const string ScenePath = "Assets/_Project/Scenes/Showroom.unity";
        const float RowSpacing = 60f;
        const float Gap = 1.5f;

        /// <summary>Row name → asset name prefixes, in order.</summary>
        static readonly (string row, string[] prefixes)[] Rows =
        {
            ("props", new[] { "UtilityPole", "StreetLight", "TrafficLight", "RoadSign", "VendingMachine", "RecycleBins", "BusStop", "Bicycle", "BikeRack", "Bench", "Planter", "Torii", "StoneLantern", "Fence", "Barrier", "Rock" }),
            ("tokyo", new[] { "Tokyo_Center", "Tokyo_Street", "Tokyo_Konbini", "Tokyo_Zakkyo", "Tokyo_Mansion" }),
            ("koedo", new[] { "Koedo", "Kura_" }),
            ("kiso", new[] { "Kiso" }),
            ("vegetation", new[] { "Veg_Cedar", "Veg_Maple", "Veg_Cherry", "Veg_Bamboo", "Veg_Bush" }),
        };

        [MenuItem("JapanMap/Art/Build Showroom")]
        public static void BuildFromMenu() => Build();

        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = new GameObject("Main Camera", typeof(Camera)) { tag = "MainCamera" }.GetComponent<Camera>();
            cam.farClipPlane = 3000;
            new GameObject("Sun", typeof(Light));
            new GameObject("Global Volume", typeof(Volume));

            var prefabs = Directory.GetFiles(LibraryImporter.PrefabDir, "P_*.prefab")
                .Concat(Directory.Exists(Vegetation.TreeBuilder.PrefabDir) ? Directory.GetFiles(Vegetation.TreeBuilder.PrefabDir, "P_*.prefab") : new string[0])
                .OrderBy(p => p)
                .Select(AssetDatabase.LoadAssetAtPath<GameObject>).Where(p => p != null).ToList();
            var used = new HashSet<GameObject>();
            var z = 0f;
            foreach (var (row, prefixes) in Rows)
            {
                var parent = new GameObject(row).transform;
                parent.position = new Vector3(0, 0, z);
                var items = prefixes.SelectMany(pre => prefabs.Where(p => p.name.Substring(2).StartsWith(pre) && used.Add(p))).ToList();
                if (row == "props") items.RemoveAll(p => p.name.Contains("PowerLine")); // spans hang between poles
                var x = 0f;
                foreach (var p in items)
                {
                    var b = Bounds(p);
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(p, parent);
                    x += -b.min.x;
                    go.transform.localPosition = new Vector3(x, 0, -b.max.z); // fronts flush on the kerb line z=0
                    x += b.max.x + Gap;
                }
                // centre the row on x = 0
                foreach (Transform c in parent) c.localPosition -= new Vector3(x / 2, 0, 0);
                Ground(parent, x + 40, row);
                z += RowSpacing;
            }
            LookSetup.ApplyToActiveScene(LookSetup.LoadOrCreate());
            RenderSettings.fogDensity *= 0.5f; // short distances; keep the colours, not the haze
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        static Bounds Bounds(GameObject prefab)
        {
            var rs = prefab.GetComponentsInChildren<MeshRenderer>(true).Where(r => r.name.Contains("_LOD0") || !r.name.Contains("_LOD")).ToArray();
            var b = new Bounds(Vector3.zero, Vector3.zero);
            foreach (var r in rs)
            {
                var mf = r.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;
                var mb = mf.sharedMesh.bounds;
                var m = r.transform.localToWorldMatrix * prefab.transform.worldToLocalMatrix;
                foreach (var corner in Corners(mb)) b.Encapsulate(m.MultiplyPoint3x4(corner));
            }
            return b;
        }

        static IEnumerable<Vector3> Corners(Bounds b)
        {
            for (var i = 0; i < 8; i++)
                yield return new Vector3((i & 1) == 0 ? b.min.x : b.max.x, (i & 2) == 0 ? b.min.y : b.max.y, (i & 4) == 0 ? b.min.z : b.max.z);
        }

        static void Ground(Transform row, float length, string name)
        {
            var road = GameObject.CreatePrimitive(PrimitiveType.Cube);
            road.name = "Street";
            road.transform.SetParent(row, false);
            road.transform.localPosition = new Vector3(0, -0.05f, 8);
            road.transform.localScale = new Vector3(length, 0.1f, 16);
            road.GetComponent<MeshRenderer>().sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Art/Materials/Road_Asphalt.mat");
            var lot = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lot.name = "Lot";
            lot.transform.SetParent(row, false);
            lot.transform.localPosition = new Vector3(0, -0.06f, -20);
            lot.transform.localScale = new Vector3(length, 0.1f, 40);
            lot.GetComponent<MeshRenderer>().sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Art/Materials/Road_Concrete.mat");
        }

        /// <summary>Renders a row from the street: eye height or a higher overview.</summary>
        public static string Capture(string row, float along, float distance = 14f, float height = 1.7f, float yaw = 180f, int width = 1024, int height2 = 576)
        {
            var t = GameObject.Find(row).transform;
            var cam = Camera.main;
            cam.transform.SetPositionAndRotation(t.position + new Vector3(along, height, distance), Quaternion.Euler(height > 5 ? 20 : 4, yaw, 0));
            return JapanMap.Editor.Capture.Render(cam, $"{JapanMap.Editor.Capture.Dir}/showroom-{row}-{along:0}.png", width, height2);
        }
    }
}
