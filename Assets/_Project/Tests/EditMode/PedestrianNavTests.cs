using JapanMap.Editor.Map;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;

namespace JapanMap.Tests
{
    /// <summary>
    /// The pedestrian NavMesh never lies on a carriageway — across the whole width, not just the centre line. A road
    /// piece whose middle lay just outside a place's bake volume was not cut out, though half its width reached in:
    /// pedestrians walked on meiji-south by Sakura Commons (Phase 11, PedestrianTests: 52 hits).
    /// </summary>
    public class PedestrianNavTests
    {
        [Test]
        public void NoNavMesh_AcrossAnyCarriageway()
        {
            MapScene.OpenGameScene();
            foreach (var f in System.IO.Directory.GetFiles("Assets/_Project/Scenes/World", "Nav_*.unity"))
                EditorSceneManager.OpenScene(f, OpenSceneMode.Additive);
            var net = AssetDatabase.LoadAssetAtPath<JapanMap.World.RoadNetwork>("Assets/_Project/Data/Roads/RoadNetwork.asset");
            int probes = 0, hits = 0;
            var first = "";
            foreach (var r in net.roads)
            {
                var pts = r.points;
                var segs = r.closed ? pts.Length : pts.Length - 1;
                for (var i = 0; i < segs; i++)
                {
                    var a = pts[i];
                    var b = pts[(i + 1) % pts.Length];
                    var flat = new Vector3(b.x - a.x, 0f, b.z - a.z);
                    if (flat.sqrMagnitude < 1e-4f) continue;
                    var side = Vector3.Cross(Vector3.up, flat.normalized);
                    // Across the carriageway up to 80 % of the half width (the edge itself may touch a kerb).
                    foreach (var u in new[] { -0.8f, -0.4f, 0f, 0.4f, 0.8f })
                    {
                        var p = (a + b) * 0.5f + side * (u * r.width * 0.5f);
                        probes++;
                        if (!NavMesh.SamplePosition(p, out var h, 0.2f, 1) || Mathf.Abs(h.position.y - p.y) > 1f) continue;
                        hits++;
                        if (first == "") first = $"{r.id} at {p:F1}";
                    }
                }
            }
            Assert.AreEqual(0, hits, $"{hits}/{probes} carriageway probes on the pedestrian NavMesh, first {first}");
        }
    }
}
