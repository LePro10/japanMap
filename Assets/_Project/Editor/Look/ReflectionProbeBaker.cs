using System.Collections.Generic;
using System.IO;
using System.Linq;
using JapanMap.Editor.Content;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace JapanMap.Editor.Look
{
    /// <summary>
    /// After rain the puddles mirror their surroundings. Without a local probe they mirror only the bright sky and read
    /// as ice (2026-10-13). One box-projected probe per place (Tokyo: a grid; its puddles also get the planar mirror),
    /// baked from the open world and stored as a custom cubemap in the place's own streamed scene, so it arrives with
    /// the place. Run after every place import (MapImport does). Menu: JapanMap/Look/Bake Place Reflections.
    /// </summary>
    public static class ReflectionProbeBaker
    {
        public const string Dir = "Assets/_Project/Art/Reflections";
        public const string RootName = "ReflectionProbes";
        const int Resolution = 128;
        // Tokyo is 1 km wide: one probe would box-project facades kilometres away into every street.
        const float GridSpacing = 260f;
        const float MaxBox = 360f;

        [MenuItem("JapanMap/Look/Bake Place Reflections")]
        public static string BakeFromMenu()
        {
            Map.MapScene.OpenGameScene();
            var r = BakeAll();
            Debug.Log(r);
            return r;
        }

        public static string BakeAll()
        {
            PlaceScenesInEditor.OpenAll();
            Directory.CreateDirectory(Dir);
            var report = new List<string>();
            foreach (var path in StreamingSetup.StreamedScenes().Where(p => p.StartsWith(StreamingSetup.PlaceDir)))
            {
                var scene = SceneManager.GetSceneByPath(path);
                if (!scene.IsValid() || !scene.isLoaded) continue;
                report.Add($"{scene.name} {Bake(scene, scene.name)}");
            }
            // Sakura Commons lives in Game.unity (start content).
            var game = SceneManager.GetSceneByPath(ProjectSetup.GameScene);
            report.Add($"Commons {BakeAt(game, "SakuraCommons", new Bounds(new Vector3(548f, 28f, -500f), new Vector3(150f, 40f, 130f)))}");
            AssetDatabase.SaveAssets();
            return "[Reflections] " + string.Join(" · ", report);
        }

        static int Bake(Scene scene, string name)
        {
            var bounds = SceneBounds(scene);
            // Tokyo draws instanced (no renderers to measure): its ground is the city slab.
            if (bounds.size == Vector3.zero && scene.name == "Tokyo")
            {
                var slab = AssetDatabase.LoadAssetAtPath<Mesh>(Map.RoadImporter.MeshDir + "/CitySlab.asset");
                if (slab != null) bounds = new Bounds(slab.bounds.center + Vector3.up * 20f, new Vector3(slab.bounds.size.x, 60f, slab.bounds.size.z));
            }
            if (bounds.size == Vector3.zero) return 0;
            return BakeAt(scene, name, bounds);
        }

        static int BakeAt(Scene scene, string name, Bounds bounds)
        {
            var root = scene.GetRootGameObjects().FirstOrDefault(g => g.name == RootName);
            if (root != null) Object.DestroyImmediate(root);
            root = new GameObject(RootName);
            SceneManager.MoveGameObjectToScene(root, scene);

            var nx = Mathf.Max(1, Mathf.CeilToInt(bounds.size.x / GridSpacing));
            var nz = Mathf.Max(1, Mathf.CeilToInt(bounds.size.z / GridSpacing));
            var cell = new Vector3(Mathf.Min(MaxBox, bounds.size.x / nx), 0f, Mathf.Min(MaxBox, bounds.size.z / nz));
            var made = 0;
            for (var ix = 0; ix < nx; ix++)
            for (var iz = 0; iz < nz; iz++)
            {
                var centre = new Vector3(bounds.min.x + (ix + 0.5f) * bounds.size.x / nx, 0f, bounds.min.z + (iz + 0.5f) * bounds.size.z / nz);
                var ground = Ground(centre, bounds);
                var go = new GameObject($"Probe_{ix}_{iz}");
                go.transform.SetParent(root.transform, false);
                // Eye height of a car: the puddles are seen from 1–2 m.
                go.transform.position = new Vector3(centre.x, ground + 2.5f, centre.z);
                var probe = go.AddComponent<ReflectionProbe>();
                probe.mode = ReflectionProbeMode.Custom;
                probe.resolution = Resolution;
                probe.hdr = true;
                probe.boxProjection = true;
                probe.size = new Vector3(cell.x + 40f, 80f, cell.z + 40f); // overlap: probes blend across the seams
                probe.center = new Vector3(0f, 20f, 0f);
                probe.blendDistance = 20f;
                probe.nearClipPlane = 0.3f;
                probe.farClipPlane = 600f;
                probe.shadowDistance = 0f;
                probe.clearFlags = ReflectionProbeClearFlags.Skybox;
                probe.importance = 1;
                var file = $"{Dir}/{name}_{ix}_{iz}.exr";
                if (!Lightmapping.BakeReflectionProbe(probe, file))
                {
                    Debug.LogWarning($"[Reflections] bake failed: {file}");
                    continue;
                }
                AssetDatabase.ImportAsset(file);
                var importer = (TextureImporter)AssetImporter.GetAtPath(file);
                if (importer != null)
                {
                    importer.textureShape = TextureImporterShape.TextureCube;
                    importer.mipmapEnabled = true;
                    importer.textureCompression = TextureImporterCompression.Compressed;
                    importer.SaveAndReimport();
                }
                probe.customBakedTexture = AssetDatabase.LoadAssetAtPath<Cubemap>(file);
                made++;
            }
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            return made;
        }

        static float Ground(Vector3 at, Bounds b)
        {
            // The terrain streams in at runtime; in the editor the roads, slabs and place colliders are the ground.
            if (Physics.Raycast(new Vector3(at.x, b.max.y + 50f, at.z), Vector3.down, out var hit, b.size.y + 200f, ~0, QueryTriggerInteraction.Ignore))
                return hit.point.y;
            return b.min.y;
        }

        static Bounds SceneBounds(Scene scene)
        {
            var have = false;
            var b = new Bounds();
            foreach (var root in scene.GetRootGameObjects())
            {
                if (root.name == RootName) continue;
                foreach (var r in root.GetComponentsInChildren<Renderer>())
                {
                    if (r is ParticleSystemRenderer) continue;
                    if (!have) { b = r.bounds; have = true; }
                    else b.Encapsulate(r.bounds);
                }
            }
            return have ? b : new Bounds();
        }
    }
}
