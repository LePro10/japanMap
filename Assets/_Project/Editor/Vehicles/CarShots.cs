using System.Collections.Generic;
using System.IO;
using JapanMap.Editor.Look;
using JapanMap.Vehicles;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace JapanMap.Editor.Vehicles
{
    /// <summary>
    /// Close-ups of every car model under the game's Look on a street, for before/after checks of the models
    /// (D52: tyres, lamps). Batch: <c>JM_TAG=before node Tools/unity-run.mjs JapanMap.Editor.Vehicles.CarShots.Wheels</c>
    /// → Captures/cars/wheel-&lt;id&gt;-&lt;FL|RR&gt;-&lt;tag&gt;.png (then Tools/montage.mjs).
    /// </summary>
    public static class CarShots
    {
        public const string CarDir = "Assets/_Project/Art/Cars";
        const string Out = "Captures/cars";

        static string Tag => System.Environment.GetEnvironmentVariable("JM_TAG") ?? "now";

        public static IEnumerable<string> CarIds()
        {
            foreach (var f in Directory.GetFiles(CarDir, "*.glb")) yield return Path.GetFileNameWithoutExtension(f);
        }

        /// <summary>A fresh scene with the Look, a wet street, a camera — and the car at the origin, nose +Z.</summary>
        public static (Camera cam, GameObject car) Stage(string id)
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = new GameObject("Main Camera", typeof(Camera)) { tag = "MainCamera" }.GetComponent<Camera>();
            cam.nearClipPlane = 0.05f;
            cam.fieldOfView = 40f;
            new GameObject("Sun", typeof(Light));
            new GameObject("Global Volume", typeof(UnityEngine.Rendering.Volume));
            var road = GameObject.CreatePrimitive(PrimitiveType.Cube);
            road.name = "Street";
            road.transform.localPosition = new Vector3(0, -0.05f, 0);
            road.transform.localScale = new Vector3(40, 0.1f, 80);
            road.GetComponent<MeshRenderer>().sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Art/Materials/Road_Asphalt.mat");
            LookSetup.ApplyToActiveScene(LookSetup.LoadOrCreate());
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"{CarDir}/{id}.glb");
            var car = Object.Instantiate(prefab);
            car.name = id;
            foreach (var t in car.GetComponentsInChildren<Transform>(true))
                if (VehicleVisuals.IsTuningOption(t)) t.gameObject.SetActive(false);
            return (cam, car);
        }

        /// <summary>Front-left and rear-right wheel from outside, low, slightly from the front/rear.</summary>
        public static void Wheels()
        {
            Directory.CreateDirectory(Out);
            foreach (var id in CarIds())
            {
                var (cam, car) = Stage(id);
                // Inspection light at the camera: the blue-hour Look alone leaves a tyre near black.
                var fill = new GameObject("Fill", typeof(Light)).GetComponent<Light>();
                fill.type = LightType.Point;
                fill.range = 6f;
                fill.intensity = 4f;
                fill.transform.SetParent(cam.transform, false);
                fill.transform.localPosition = new Vector3(0.4f, 0.5f, 0f);
                foreach (var w in new[] { "FL", "RR" })
                {
                    var wheel = VehicleVisuals.FindPrefix(car.transform, "wheel_" + w);
                    if (wheel == null) { Debug.LogError($"[Capture] {id}: no wheel_{w}"); continue; }
                    var c = wheel.position;
                    var side = Mathf.Sign(c.x);
                    var along = Mathf.Sign(c.z);
                    var eye = c + new Vector3(side * 1.25f, 0.18f, along * 0.75f);
                    cam.transform.SetPositionAndRotation(eye, Quaternion.LookRotation(c - eye));
                    Capture.Render(cam, $"{Out}/wheel-{id}-{w}-{Tag}.png", 512, 384);
                }
            }
        }
    }
}
