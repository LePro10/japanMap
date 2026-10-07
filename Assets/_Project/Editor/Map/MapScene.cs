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
            if (scene.path == ProjectSetup.GameScene) return scene;
            EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
            return EditorSceneManager.OpenScene(ProjectSetup.GameScene, OpenSceneMode.Single);
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
