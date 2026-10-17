using JapanMap.Core;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// What flies off a car in a crash: sparks (stretched additive streaks) and bits — paint flakes, black plastic,
    /// glass — as lit mesh particles that bounce off the world on High/Medium. Two particle systems per car. Each burst
    /// is one Emit call: the emitter turns to face the burst and its own random ranges (cone, speed, size, spin, colour
    /// between two) spread the particles — a loop of single emits cost ~1 ms for a crash. The emitters ride on the car,
    /// so particles inherit its velocity. The quality tier scales the counts (Low: a third, bits without world collision).
    /// </summary>
    public sealed class DamageEffects
    {
        readonly ParticleSystem _sparks, _bits;
        readonly VehicleDamageSettings _s;
        float _share = 1f;

        static Mesh _flake;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => _flake = null;

        public int SparksEmitted { get; private set; }
        public int BitsEmitted { get; private set; }

        public DamageEffects(Transform parent, VehicleDamageSettings settings)
        {
            _s = settings;
            if (settings.sparkMaterial != null) _sparks = MakeSparks(parent, settings);
            if (settings.debrisMaterial != null) _bits = MakeBits(parent, settings);
            SetTier(QualitySystem.Current);
        }

        public void SetTier(string tier)
        {
            _share = _s.EffectShare(tier);
            if (_bits == null) return;
            var col = _bits.collision;
            col.enabled = tier != "Low" || _s.collideOnLow;
        }

        /// <summary>A burst of sparks at a world point, thrown around <paramref name="outward"/> at up to <paramref name="speed"/> m/s.</summary>
        public void Sparks(Vector3 at, Vector3 outward, int count, float speed)
        {
            if (_sparks == null) return;
            count = Mathf.RoundToInt(count * _share);
            if (count <= 0) return;
            Aim(_sparks, outward);
            var main = _sparks.main;
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed * 0.3f, speed);
            _sparks.Emit(new ParticleSystem.EmitParams { position = at, applyShapeToPosition = true }, count);
            SparksEmitted += count;
        }

        /// <summary>Bits between two colours, about <paramref name="size"/> m, thrown around <paramref name="outward"/>.</summary>
        public void Bits(Vector3 at, Vector3 outward, int count, Color a, Color b, float size)
        {
            if (_bits == null) return;
            count = Mathf.RoundToInt(count * _share);
            if (count <= 0) return;
            Aim(_bits, outward + Vector3.up * 0.5f);
            var main = _bits.main;
            main.startColor = new ParticleSystem.MinMaxGradient(a, b);
            main.startSizeX = new ParticleSystem.MinMaxCurve(size * 0.5f, size * 1.4f);
            main.startSizeY = new ParticleSystem.MinMaxCurve(size * 0.06f, size * 0.3f);
            main.startSizeZ = new ParticleSystem.MinMaxCurve(size * 0.4f, size * 1.2f);
            _bits.Emit(new ParticleSystem.EmitParams { position = at, applyShapeToPosition = true }, count);
            BitsEmitted += count;
        }

        static void Aim(ParticleSystem ps, Vector3 dir)
        {
            if (dir.sqrMagnitude < 1e-6f) dir = Vector3.up;
            ps.transform.rotation = Quaternion.LookRotation(dir.normalized);
        }

        public void Destroy()
        {
            if (_sparks != null) Object.Destroy(_sparks.gameObject);
            if (_bits != null) Object.Destroy(_bits.gameObject);
        }

        static ParticleSystem Base(Transform parent, string name, int max, float gravity, float inherit)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = false;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = max;
            main.gravityModifier = gravity;
            main.emitterVelocityMode = ParticleSystemEmitterVelocityMode.Transform;
            var emission = ps.emission;
            emission.enabled = false;
            // The car's own speed: sparks trail it along a wall, bits keep flying the way it went.
            var inheritV = ps.inheritVelocity;
            inheritV.enabled = true;
            inheritV.mode = ParticleSystemInheritVelocityMode.Initial;
            inheritV.curveMultiplier = inherit;
            return ps;
        }

        static ParticleSystem MakeSparks(Transform parent, VehicleDamageSettings s)
        {
            var ps = Base(parent, "DamageSparks", 400, 1.1f, 0.65f);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.18f, 0.55f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.018f, 0.04f);
            main.startColor = new ParticleSystem.MinMaxGradient(s.sparkColor, Color.white);
            var shape = ps.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 55f;
            shape.radius = 0.06f;
            var drag = ps.limitVelocityOverLifetime;
            drag.enabled = true;
            drag.drag = 1.2f;
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(new Color(1f, 0.55f, 0.2f), 0.5f), new GradientColorKey(new Color(0.8f, 0.2f, 0.05f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.9f, 0.6f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            var r = ps.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = s.sparkMaterial;
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.045f;
            r.lengthScale = 1.5f;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            ps.Play();
            return ps;
        }

        static ParticleSystem MakeBits(Transform parent, VehicleDamageSettings s)
        {
            var ps = Base(parent, "DamageBits", 220, 1f, 0.8f);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(2.5f, 4.5f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(1.5f, 5.5f);
            main.startSize3D = true;
            main.startRotation3D = true;
            main.startRotationX = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            main.startRotationY = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            main.startRotationZ = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            var shape = ps.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 60f;
            shape.radius = 0.15f;
            var rot = ps.rotationOverLifetime;
            rot.enabled = true;
            rot.separateAxes = true;
            rot.x = new ParticleSystem.MinMaxCurve(-9f, 9f);
            rot.y = new ParticleSystem.MinMaxCurve(-9f, 9f);
            rot.z = new ParticleSystem.MinMaxCurve(-9f, 9f);
            var col = ps.collision;
            col.enabled = true;
            col.type = ParticleSystemCollisionType.World;
            col.mode = ParticleSystemCollisionMode.Collision3D;
            col.quality = ParticleSystemCollisionQuality.Medium;
            col.collidesWith = ~GameLayers.NotGround; // the road and the world, not cars, people or other debris
            col.bounce = 0.25f;
            col.dampen = 0.5f;
            col.lifetimeLoss = 0f;
            col.maxCollisionShapes = 64;
            var fade = ps.colorOverLifetime;
            fade.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, 0.85f), new GradientAlphaKey(0f, 1f) });
            fade.color = g;
            var r = ps.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = s.debrisMaterial;
            r.renderMode = ParticleSystemRenderMode.Mesh;
            r.mesh = Flake;
            r.alignment = ParticleSystemRenderSpace.World;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ps.Play();
            return ps;
        }

        static Mesh Flake
        {
            get
            {
                if (_flake != null) return _flake;
                var b = new BoxMeshBuilder();
                b.Box(0, Vector3.zero, Vector3.one, Vector2.zero);
                return _flake = b.ToMesh("DamageFlake", skinned: false);
            }
        }
    }
}
