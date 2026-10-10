using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// A car whose model is still downloading: a plain body of the car's size so it is never invisible, swapped for the
    /// real model the moment <see cref="CarModels"/> has it. Physics is untouched by the swap.
    /// </summary>
    public sealed class PendingModel : MonoBehaviour
    {
        VehicleController _car;
        VehicleEffectsSettings _effects;
        ICarLoadout _loadout;
        GameObject _standIn;

        /// <summary>Body material while waiting (set by the spawner from its scene field).</summary>
        public static Material Material;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Material = null;

        public void Wait(VehicleController car, VehicleEffectsSettings effects, ICarLoadout loadout)
        {
            _car = car;
            _effects = effects;
            _loadout = loadout;
            _standIn = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _standIn.name = "StandInBody";
            Destroy(_standIn.GetComponent<Collider>());
            if (Material != null) _standIn.GetComponent<MeshRenderer>().sharedMaterial = Material;
            _standIn.transform.SetParent(transform, false);
            var size = car.Definition.bodySize; // length, width, height
            _standIn.transform.localScale = new Vector3(size.y, size.z * 0.75f, size.x);
            _standIn.transform.localPosition = new Vector3(0f, car.Definition.clearance + size.z * 0.375f, car.Definition.bodyCenterZ);
            CarModels.Arrived += OnArrived;
        }

        void OnArrived(VehicleDefinition def)
        {
            if (_car == null || def != _car.Definition) return;
            CarModels.Arrived -= OnArrived;
            if (_standIn != null) Destroy(_standIn);
            PlayerCarSpawner.AttachModel(_car, CarModels.Get(def), _effects, _loadout);
            if (!Application.isEditor) Debug.Log($"[Content] {def.id}: model in place of the stand-in");
            Destroy(this);
        }

        void OnDestroy() => CarModels.Arrived -= OnArrived;
    }
}
