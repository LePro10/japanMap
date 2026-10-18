using System;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>Steering wheel in the cockpit view: the model's own, or one built in code (<see cref="CockpitWheelMesh"/>).</summary>
    public enum CockpitWheel { Model, Round, Sport, Formula }

    /// <summary>Live instruments: analog dials or a screen over the model's gauge, or the screen on a formula wheel.</summary>
    public enum CockpitCluster { None, Analog, Digital, OnWheel }

    /// <summary>One car's seat and instruments (D51): where the eye sits, how wide it sees, which wheel and dials it has.</summary>
    [Serializable]
    public sealed class CockpitSpec
    {
        public string carId = "";
        [Tooltip("Added to the model's eye node, in the car's frame (x right, y up, z forward), m.")]
        public Vector3 eyeOffset;
        [Tooltip("Vertical field of view in landscape, degrees (portrait keeps the settings' minimum horizontal view).")]
        public float fov = 58f;
        [Tooltip("Look down from level, degrees — the bonnet line low in the picture, the road above it.")]
        public float pitch = 3f;
        [Tooltip("Near clip, m (a formula car's eye sits close to the halo and the wheel).")]
        public float near = 0.06f;
        [Tooltip("Steering wheel shown: the model's own, or a built one (round, sport with a flat bottom, formula yoke with paddles).")]
        public CockpitWheel wheel = CockpitWheel.Model;
        [Tooltip("Built wheel: diameter, m.")]
        public float wheelSize = 0.36f;
        [Tooltip("Wheel turn per degree of road-wheel angle (road ~11, formula ~5 — a formula wheel barely turns).")]
        public float wheelRatio = 11f;
        [Tooltip("Largest wheel turn either way, degrees.")]
        public float wheelMax = 240f;
        [Tooltip("Built wheel: moved from the model's wheel node, car frame, m.")]
        public Vector3 wheelOffset;
        [Tooltip("Instruments: analog dials, a digital screen (both over the model's gauge), or the screen on the wheel.")]
        public CockpitCluster cluster = CockpitCluster.Analog;
        [Tooltip("Cluster offset from the model's gauge, car frame, m.")]
        public Vector3 clusterOffset;
        public float clusterScale = 1f;
        [Tooltip("Small head-up projection low on the windscreen, above the bonnet line (never over the road ahead).")]
        public bool headUp;
        [Tooltip("Gloves and sleeves on the wheel.")]
        public bool arms = true;
        [Tooltip("Share of the head's look into the drift and the bend.")]
        public float look = 1f;
        [Tooltip("Share of the g-force lean (a formula seat holds the head tight).")]
        public float lean = 1f;
        [Tooltip("Share of the vibration (stiff race springs buzz more, a soft cruiser less).")]
        public float shake = 1f;
        [Tooltip("Model nodes (name prefixes) hidden in the cockpit view.")]
        public string[] hide = new string[0];
    }

    /// <summary>The cockpit of every car (D51). Cars without an entry use <see cref="fallback"/>.</summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Cockpit Settings", fileName = "CockpitSettings")]
    public sealed class CockpitSettings : ScriptableObject
    {
        public CockpitSpec fallback = new();
        public CockpitSpec[] cars = new CockpitSpec[0];

        public CockpitSpec For(string carId)
        {
            if (cars != null)
                foreach (var c in cars)
                    if (c != null && c.carId == carId) return c;
            return fallback;
        }
    }
}
