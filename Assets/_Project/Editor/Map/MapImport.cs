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
            TerrainImporter.Import(s);
            WaterImporter.Import(s);
            RoadImporter.Import(s);
            PropImporter.Import(s);
        }

        /// <summary>
        /// Content of World/ as text: names, transforms, components, meshes, materials. Two imports must
        /// give the same text; the scene file itself differs because Unity assigns new object IDs.
        /// </summary>
        public static string Fingerprint()
        {
            var sb = new StringBuilder();
            foreach (var t in MapScene.Root().GetComponentsInChildren<Transform>(true))
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
