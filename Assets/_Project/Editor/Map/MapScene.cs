using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// The imported map lives in Game.unity under one root "World" with a child per importer.
    /// Importers replace their own child completely, so running one twice gives the same result.
    /// </summary>
    public static class MapScene
    {
        public const string RootName = "World";

        public static Scene OpenGameScene()
        {
            var scene = SceneManager.GetActiveScene();
            if (scene.path != ProjectSetup.GameScene)
            {
                EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
                scene = EditorSceneManager.OpenScene(ProjectSetup.GameScene, OpenSceneMode.Single);
            }
            // The streamed parts of the world (D36) open beside it, so tools and tests see the whole map.
            if (!Application.isPlaying) Content.PlaceScenesInEditor.OpenAll();
            return scene;
        }

        /// <summary>
        /// A part of World/&lt;group&gt;/&lt;child&gt; wherever it lives now: still in Game.unity, or the root of its streamed scene
        /// (named by StreamingSetup). Null when neither is open.
        /// </summary>
        public static Transform Part(string group, string child)
        {
            var inGame = Root().Find($"{group}/{child}");
            if (inGame != null) return inGame;
            foreach (var name in Content.StreamingSetup.PartNames(group, child))
                for (var i = 0; i < SceneManager.sceneCount; i++)
                    foreach (var r in SceneManager.GetSceneAt(i).GetRootGameObjects())
                        if (r.name == name) return r.transform;
            return null;
        }

        /// <summary>Every root of World/&lt;group&gt;'s children, in Game.unity and in streamed scenes.</summary>
        public static System.Collections.Generic.IEnumerable<Transform> Parts(string group)
        {
            var g = Root().Find(group);
            if (g != null) foreach (Transform c in g) yield return c;
            var prefix = Content.StreamingSetup.PrefixOf(group);
            for (var i = 0; i < SceneManager.sceneCount; i++)
            {
                var s = SceneManager.GetSceneAt(i);
                if (!s.path.StartsWith(Content.StreamingSetup.WorldDir) && !s.path.StartsWith(Content.StreamingSetup.PlaceDir)) continue;
                foreach (var r in s.GetRootGameObjects())
                    if (prefix != null && (prefix == "" ? group == Places.PlaceImporter.GroupName : r.name.StartsWith(prefix))) yield return r.transform;
            }
        }

        /// <summary>Destroys and recreates World/&lt;name&gt; so nothing from a previous run survives.</summary>
        public static Transform FreshGroup(string name)
        {
            var root = Root();
            var old = root.Find(name);
            if (old != null) Object.DestroyImmediate(old.gameObject);
            var group = new GameObject(name).transform;
            group.SetParent(root, false);
            return group;
        }

        public static Transform Root()
        {
            var scene = OpenGameScene();
            foreach (var go in scene.GetRootGameObjects())
                if (go.name == RootName) return go.transform;
            var root = new GameObject(RootName);
            SceneManager.MoveGameObjectToScene(root, scene);
            return root.transform;
        }

        public static void Save() => EditorSceneManager.SaveScene(OpenGameScene());
    }
}
