using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Car models that are not in the start download (Addressables, D36): the starter car keeps its direct
    /// <see cref="VehicleDefinition.model"/>; every other car names its model by <see cref="VehicleDefinition.modelAsset"/>
    /// and arrives in the background. A car built before its model is here drives on a stand-in body and gets the model
    /// the moment it lands (<see cref="PendingModel"/>) — physics never waits for a download.
    /// </summary>
    public static class CarModels
    {
        static readonly Dictionary<string, GameObject> Loaded = new();
        static readonly Dictionary<string, AsyncOperationHandle<GameObject>> Ops = new();

        /// <summary>A model arrived (car id).</summary>
        public static event Action<VehicleDefinition> Arrived;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Loaded.Clear();
            Ops.Clear();
            Arrived = null;
            EditorSync = true;
        }

        static bool HasAsset(VehicleDefinition def) => def.modelAsset != null && def.modelAsset.RuntimeKeyIsValid();

        /// <summary>The model prefab now, or null while it is still on its way (call <see cref="Request"/>).</summary>
        public static GameObject Get(VehicleDefinition def)
        {
            if (def == null) return null;
            if (def.model != null) return def.model;
            return Loaded.TryGetValue(def.id, out var m) ? m : null;
        }

        /// <summary>Has a model at all (direct or by address) — false for model-less definitions (traffic).</summary>
        public static bool HasModel(VehicleDefinition def) => def != null && (def.model != null || HasAsset(def));

        public static bool Ready(VehicleDefinition def) => !HasModel(def) || Get(def) != null;

        /// <summary>
        /// Editor play mode: wait for the load at once (the asset database answers in a frame) so tests and play scripts
        /// see the real model as before. Off in tests of the stand-in path; never in a build (WebGL cannot block).
        /// </summary>
        public static bool EditorSync = true;

        /// <summary>Starts the download of a car's model (once). Cheap to call every frame.</summary>
        public static void Request(VehicleDefinition def)
        {
            if (def == null || def.model != null || !HasAsset(def) || Ops.ContainsKey(def.id)) return;
            var t0 = Time.realtimeSinceStartup;
            var op = Addressables.LoadAssetAsync<GameObject>(def.modelAsset.RuntimeKey);
            Ops[def.id] = op;
            op.Completed += h =>
            {
                if (h.Status != AsyncOperationStatus.Succeeded)
                {
                    Debug.LogWarning($"[Content] car model {def.id} failed: {h.OperationException?.Message}");
                    Ops.Remove(def.id); // a later request tries again
                    return;
                }
                Loaded[def.id] = h.Result;
                if (!Application.isEditor) Debug.Log($"[Content] car {def.id} in {Time.realtimeSinceStartup - t0:0.0} s ({(Arrived == null ? 0 : Arrived.GetInvocationList().Length)} waiting)");
                Arrived?.Invoke(def);
            };
            if (Application.isEditor && EditorSync) op.WaitForCompletion();
        }

        /// <summary>Its download is running.</summary>
        public static bool IsLoading(VehicleDefinition def) => def != null && Ops.ContainsKey(def.id) && !Loaded.ContainsKey(def.id);

        /// <summary>Models that are here (tests, the loader's progress).</summary>
        public static int LoadedCount => Loaded.Count;
    }
}
