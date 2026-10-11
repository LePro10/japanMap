using System.Collections.Generic;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Every object field of our components in the game scene is set. Setup scripts rebuild their groups fresh; a link
    /// another setup made into such a group is nulled silently (2026-10-11: the key overlay's save link after a content
    /// rebuild — no error, the overlay just never showed). Fields the game fills at runtime are named here.
    /// </summary>
    public class SceneLinkTests
    {
        static readonly HashSet<string> SetAtRuntime = new()
        {
            "WalkerInput.motor", "WalkTouchControls.input", "WalkCameraRig.motor", "WalkCameraRig.input", // the walker is built in play
            "VehicleRespawn.vehicle", "DriverInput.vehicle", // the car is spawned in play
            "GameMenu.theme", // optional theme override; the panel's theme is the default
        };

        [Test]
        public void GameScene_AllComponentLinksSet()
        {
            EditorSceneManager.OpenScene("Assets/_Project/Scenes/Game.unity", OpenSceneMode.Single);
            var missing = new List<string>();
            foreach (var mb in Object.FindObjectsByType<MonoBehaviour>(FindObjectsInactive.Include))
            {
                if (mb == null || !(mb.GetType().Namespace ?? "").StartsWith("JapanMap")) continue;
                var so = new SerializedObject(mb);
                var it = so.GetIterator();
                var enter = true;
                while (it.NextVisible(enter))
                {
                    enter = it.propertyType == SerializedPropertyType.Generic && !it.isArray;
                    if (it.propertyType != SerializedPropertyType.ObjectReference || it.name == "m_Script" || it.objectReferenceValue != null) continue;
                    var key = mb.GetType().Name + "." + it.propertyPath;
                    if (!SetAtRuntime.Contains(key)) missing.Add($"{key} @ {mb.gameObject.name}");
                }
            }
            Assert.IsEmpty(missing, "unset links (a setup rebuilt what they pointed at?):\n" + string.Join("\n", missing));
        }
    }
}
