using System.Text;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>All map importers in dependency order (water, roads and props sample the terrain).</summary>
    public static class MapImport
    {
        [MenuItem("JapanMap/Map/Import All")]
        public static void ImportAllFromMenu()
        {
            ImportAll();
            MapScene.Save();
            Debug.Log(RoadImporter.FitReport(MapImportSettings.LoadOrCreate()));
        }

        public static void ImportAll()
        {
            var s = MapImportSettings.LoadOrCreate();
            // Streamed parts close: every importer rebuilds its group in Game.unity, StreamingSetup moves them out again.
            MapScene.OpenGameScene();
            Content.PlaceScenesInEditor.CloseAll();
            Content.PlaceScenesInEditor.Hold = true;
            try { ImportAllHeld(s); }
            finally
            {
                Content.PlaceScenesInEditor.Hold = false;
                Content.PlaceScenesInEditor.OpenAll();
            }
        }

        static void ImportAllHeld(MapImportSettings s)
        {
            TerrainImporter.Import(s);
            WaterImporter.Import(s);
            RoadImporter.Import(s);
            PropImporter.Import(s);
            Debug.Log(Places.PlaceImporter.Import());
            Vegetation.VegetationImporter.Import(Vegetation.VegetationImporter.Settings(), s);
            Debug.Log(Life.LifeImport.Import()); // shop walls go into the NavMesh
            Debug.Log(Life.PedestrianNav.Bake(save: false));
            // Last: the places (now back in Game.unity) move into their streamed scenes again (D36).
            Debug.Log(Content.StreamingSetup.Apply());
        }

        /// <summary>
        /// Content of World/ as text: names, transforms, components, meshes, materials. Two imports must
        /// give the same text; the scene file itself differs because Unity assigns new object IDs.
        /// </summary>
        public static string Fingerprint()
        {
            var sb = new StringBuilder();
            var all = new System.Collections.Generic.List<Transform>(MapScene.Root().GetComponentsInChildren<Transform>(true));
            // The streamed parts too, in a fixed order (scene by name).
            var streamed = new System.Collections.Generic.List<UnityEngine.SceneManagement.Scene>();
            for (var i = 0; i < UnityEngine.SceneManagement.SceneManager.sceneCount; i++)
            {
                var sc = UnityEngine.SceneManagement.SceneManager.GetSceneAt(i);
                if (sc.path.StartsWith(Content.StreamingSetup.WorldDir) || sc.path.StartsWith(Content.StreamingSetup.PlaceDir)) streamed.Add(sc);
            }
            streamed.Sort((a, b) => string.CompareOrdinal(a.path, b.path));
            foreach (var sc in streamed)
                foreach (var r in sc.GetRootGameObjects())
                    all.AddRange(r.GetComponentsInChildren<Transform>(true));
            foreach (var t in all)
            {
                sb.Append(t.name).Append('|').Append(t.position.ToString("F3")).Append('|')
                    .Append(t.eulerAngles.ToString("F2")).Append('|').Append(t.lossyScale.ToString("F3"));
                foreach (var c in t.GetComponents<Component>())
                {
                    sb.Append('|').Append(c.GetType().Name);
                    switch (c)
                    {
                        case MeshFilter mf:
                            sb.Append(':').Append(AssetDatabase.GetAssetPath(mf.sharedMesh)).Append(':').Append(mf.sharedMesh.vertexCount);
                            break;
                        case BoxCollider bc:
                            sb.Append(bc.center.ToString("F2")).Append(bc.size.ToString("F2"));
                            break;
                        case MeshRenderer r:
                            foreach (var m in r.sharedMaterials) sb.Append(':').Append(m.name);
                            break;
                        case Terrain tr:
                            sb.Append(':').Append(AssetDatabase.GetAssetPath(tr.terrainData)).Append(tr.terrainData.size.ToString("F2"));
                            break;
                    }
                }
                sb.Append('\n');
            }
            return sb.ToString();
        }
    }
}
