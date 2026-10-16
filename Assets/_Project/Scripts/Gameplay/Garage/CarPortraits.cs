using System;
using System.Collections.Generic;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Garage
{
    /// <summary>
    /// A photo of each car standing in the Open Bay (owner 2026-10-17: "bei den Autos könnte man ein schönes Bild haben
    /// von dem in der Garage"). Rendered on demand in the game itself — the car's real model on the bay floor, the
    /// game camera's look — one per frame while the Cars page is open, kept for the session. Costs no download; a car
    /// whose model is still streaming gets its photo when the model arrives.
    /// </summary>
    public static class CarPortraits
    {
        public const int Width = 512, Height = 288;

        static readonly Dictionary<string, Texture2D> Cache = new();
        static readonly Dictionary<string, List<Action<Texture2D>>> Waiting = new();
        static readonly List<VehicleDefinition> Queue = new();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Cache.Clear();
            Waiting.Clear();
            Queue.Clear();
        }

        /// <summary>The photo now (null while it is made); <paramref name="ready"/> is called once it exists.</summary>
        public static Texture2D Get(VehicleDefinition def, Action<Texture2D> ready = null)
        {
            if (def == null) return null;
            if (Cache.TryGetValue(def.id, out var tex) && tex != null) return tex;
            if (ready != null)
            {
                if (!Waiting.TryGetValue(def.id, out var list)) Waiting[def.id] = list = new List<Action<Texture2D>>();
                list.Add(ready);
            }
            if (!Queue.Contains(def)) Queue.Add(def);
            CarModels.Request(def);
            return null;
        }

        /// <summary>Forget the callbacks (the page was rebuilt; its old elements are gone).</summary>
        public static void ClearWaiting() => Waiting.Clear();

        public static int Count => Cache.Count;

        /// <summary>Makes at most one photo (call once a frame while the photos are wanted).</summary>
        public static void Pump(GarageSettings settings, VehicleController hide)
        {
            if (Queue.Count == 0 || settings == null || Camera.main == null) return;
            for (var i = 0; i < Queue.Count; i++)
            {
                var def = Queue[i];
                var prefab = CarModels.Get(def);
                if (prefab == null) continue; // still streaming: the next one first
                Queue.RemoveAt(i);
                var tex = Render(prefab, settings, hide);
                if (tex == null) return;
                tex.name = $"CarPortrait {def.id}";
                Cache[def.id] = tex;
                if (Waiting.TryGetValue(def.id, out var list))
                {
                    Waiting.Remove(def.id);
                    foreach (var cb in list) cb?.Invoke(tex);
                }
                return;
            }
        }

        static Texture2D Render(GameObject prefab, GarageSettings s, VehicleController hide)
        {
            var rot = Quaternion.Euler(0f, s.bayHeading, 0f);
            // On the hall floor, not on the lift pads (the bay point stands on them: the car floated in the photo).
            var at = s.bay;
            var floor = float.MaxValue;
            foreach (var hit in Physics.RaycastAll(s.bay + Vector3.up * 1.5f, Vector3.down, 4f, ~Core.GameLayers.NotGround, QueryTriggerInteraction.Ignore))
                if (hit.rigidbody == null) floor = Mathf.Min(floor, hit.point.y);
            if (floor < float.MaxValue) at.y = floor;
            var car = UnityEngine.Object.Instantiate(prefab, at, rot);
            car.name = "PortraitCar";
            // The player's own car may stand in the bay: out of the picture while it is taken.
            var hidden = new List<Renderer>();
            if (hide != null && (hide.transform.position - s.bay).sqrMagnitude < 15f * 15f)
                foreach (var r in hide.GetComponentsInChildren<Renderer>())
                    if (r.enabled) { r.enabled = false; hidden.Add(r); }
            var go = new GameObject("PortraitCamera");
            try
            {
                var cam = go.AddComponent<Camera>();
                cam.CopyFrom(Camera.main);
                cam.enabled = false;
                // Front three-quarter view, a little above the bonnet — the classic car-magazine angle.
                var target = at + Vector3.up * 0.62f;
                go.transform.position = at + rot * new Vector3(-3.4f, 1.3f, 5.1f);
                go.transform.LookAt(target);
                cam.fieldOfView = 31f;
                cam.nearClipPlane = 0.2f;
                cam.farClipPlane = 250f;
                return Core.CameraShot.Render(cam, Width, Height);
            }
            finally
            {
                UnityEngine.Object.Destroy(go);
                UnityEngine.Object.DestroyImmediate(car);
                foreach (var r in hidden) if (r != null) r.enabled = true;
            }
        }
    }
}
