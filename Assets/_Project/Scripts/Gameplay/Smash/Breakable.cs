using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.World;
using UnityEngine;

namespace JapanMap.Gameplay.Smash
{
    /// <summary>
    /// A post, fence, vending machine or hut that a car can knock down. Sits on the object's static
    /// collider; Unity reports the car's hit here. Breaking hides the object (its renderers, or its
    /// instances in an InstanceRenderer), switches the collider off, lets the object itself tumble away with a few
    /// chips, and gives the car back the speed the collision took, minus a little (legacy SmashField: the car drives
    /// through).
    /// </summary>
    public sealed class Breakable : MonoBehaviour
    {
        BreakableSettings.Kind _kind;
        SmashSystem _system;
        Collider[] _colliders;
        Renderer[] _renderers;
        InstanceRenderer _instances;
        readonly List<int> _instanceIds = new();

        public bool Broken { get; private set; }
        public float BrokenAt { get; private set; }
        public BreakableSettings.Kind Kind => _kind;

        public void Bind(SmashSystem system, BreakableSettings.Kind kind, InstanceRenderer instances)
        {
            _system = system;
            _kind = kind;
            _colliders = GetComponentsInChildren<Collider>();
            _renderers = GetComponentsInChildren<Renderer>();
            _instances = instances;
            // A static collider reports hits only to its own GameObject: relay from collider children.
            foreach (var c in _colliders)
                if (c.gameObject != gameObject) c.gameObject.AddComponent<BreakableRelay>().target = this;
            if (instances != null && _colliders.Length > 0)
            {
                var b = _colliders[0].bounds;
                b.Expand(new Vector3(0.3f, 2f, 0.3f));
                instances.FindInstances(b, _instanceIds);
            }
        }

        void OnCollisionEnter(Collision c) => Hit(c);

        internal void Hit(Collision c)
        {
            if (Broken || _system == null) return;
            var body = c.rigidbody;
            // Only the player's car: traffic grazing a corner must not clear the city while nobody looks.
            if (body == null || !_system.IsPlayerCar(body)) return;
            // Approach = speed into the surface along the contact normal; a graze does not count.
            var rel = c.relativeVelocity;
            var n = c.contactCount > 0 ? c.GetContact(0).normal : -rel.normalized;
            var approach = Mathf.Abs(Vector3.Dot(rel, n));
            if (!ShouldBreak(body.mass, approach, _kind.minSpeed, _kind.energy)) return;
            _system.Break(this, body, rel);
        }

        /// <summary>Legacy breakables.ts shouldBreak: speed and energy must both suffice.</summary>
        public static bool ShouldBreak(float mass, float approach, float minSpeed, float energy) =>
            approach >= minSpeed && 0.5f * mass * approach * approach >= energy;

        internal Bounds Bounds => _colliders.Length > 0 ? _colliders[0].bounds : new Bounds(transform.position, Vector3.one);
        internal Quaternion Rotation => transform.rotation;
        internal Renderer[] Renderers => _renderers;
        internal InstanceRenderer Instances => _instances;
        internal List<int> InstanceIds => _instanceIds;

        internal void SetBroken(bool broken)
        {
            Broken = broken;
            BrokenAt = Time.time;
            foreach (var c in _colliders) c.enabled = !broken;
            foreach (var r in _renderers) r.enabled = !broken;
            foreach (var i in _instanceIds) _instances.SetHidden(i, broken);
            // A lamp lying in the road does not light it.
            if (name.IndexOf("Lamp", System.StringComparison.OrdinalIgnoreCase) >= 0)
                LampLights.Instance?.Darken(transform.position, 2f, broken);
        }
    }
}
