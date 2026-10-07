using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Simple car effects (fine polish in Phase 4/9): brake lights, skid marks and tyre smoke / dust
    /// at the rear wheels. Driven by <see cref="VehicleTelemetry"/>: skid for marks and smoke, the
    /// surface for the colour (grey smoke on asphalt, brown dust off-road).
    /// </summary>
    public sealed class VehicleEffects : MonoBehaviour
    {
        static readonly int EmissiveFactor = Shader.PropertyToID("emissiveFactor");

        VehicleController _car;
        VehicleEffectsSettings _s;
        readonly TrailRenderer[] _marks = new TrailRenderer[2];
        readonly ParticleSystem[] _smoke = new ParticleSystem[2];
        Renderer[] _tailRenderers = System.Array.Empty<Renderer>();
        int[] _tailIndex = System.Array.Empty<int>();
        Color[] _tailBase = System.Array.Empty<Color>();
        MaterialPropertyBlock _mpb;
        float _brakeGlow;

        public void Bind(VehicleController car, Transform model, VehicleEffectsSettings settings)
        {
            _car = car;
            _s = settings;
            _mpb = new MaterialPropertyBlock();
            FindTailLights(model);
            for (var i = 0; i < 2; i++)
            {
                _marks[i] = MakeMark(i);
                _smoke[i] = MakeSmoke(i);
            }
        }

        void FindTailLights(Transform model)
        {
            var renderers = new System.Collections.Generic.List<Renderer>();
            var index = new System.Collections.Generic.List<int>();
            var colors = new System.Collections.Generic.List<Color>();
            foreach (var r in model.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                for (var m = 0; m < mats.Length; m++)
                {
                    if (mats[m] == null || !mats[m].name.EndsWith("_tail") || !mats[m].HasProperty(EmissiveFactor)) continue;
                    renderers.Add(r);
                    index.Add(m);
                    colors.Add(mats[m].GetColor(EmissiveFactor));
                }
            }
            _tailRenderers = renderers.ToArray();
            _tailIndex = index.ToArray();
            _tailBase = colors.ToArray();
        }

        TrailRenderer MakeMark(int i)
        {
            var go = new GameObject(i == 0 ? "SkidMarkL" : "SkidMarkR");
            go.transform.SetParent(transform, false);
            // Lie flat on the road: the trail faces its local Z, so point Z up.
            go.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            var t = go.AddComponent<TrailRenderer>();
            t.alignment = LineAlignment.TransformZ;
            t.time = _s.markSeconds;
            t.minVertexDistance = 0.25f;
            t.widthMultiplier = _s.markWidth;
            t.sharedMaterial = _s.skidMaterial;
            t.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            t.receiveShadows = false;
            t.emitting = false;
            return t;
        }

        ParticleSystem MakeSmoke(int i)
        {
            var go = new GameObject(i == 0 ? "SmokeL" : "SmokeR");
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.duration = 1f;
            main.loop = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.8f, 1.6f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.5f, 1.5f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.6f, 1.2f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 120;
            main.gravityModifier = -0.02f;
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 0.2f;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 2.2f));
            var color = ps.colorOverLifetime;
            color.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0.55f, 0f), new GradientAlphaKey(0f, 1f) });
            color.color = g;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = _s.smokeMaterial;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ps.Play();
            return ps;
        }

        void LateUpdate()
        {
            if (_car == null) return;
            var t = _car.Telemetry;
            var input = _car.Input;

            // Brake light: braking forward (not reverse) or handbrake.
            var braking = (input.brake > 0.1f && t.forwardSpeed > 0.5f) || input.handbrake;
            _brakeGlow = Mathf.MoveTowards(_brakeGlow, braking ? 1f : 0f, Time.deltaTime * 12f);
            for (var k = 0; k < _tailRenderers.Length; k++)
            {
                _tailRenderers[k].GetPropertyBlock(_mpb, _tailIndex[k]);
                _mpb.SetColor(EmissiveFactor, _tailBase[k] * Mathf.Lerp(_s.tailIdle, _s.tailBrake, _brakeGlow));
                _tailRenderers[k].SetPropertyBlock(_mpb, _tailIndex[k]);
            }

            var loose = t.surface == Surface.Terrain || t.surface == Surface.Gravel;
            for (var i = 0; i < 2; i++)
            {
                var w = _car.Wheels[2 + i];
                var onGround = w.grounded && !t.airborne;
                // Marks only on firm ground; dust off-road even without sliding.
                var mark = onGround && t.skid > _s.markFromSkid && !loose && t.surface != Surface.Water;
                if (onGround) _marks[i].transform.position = w.contact + w.normal * 0.02f;
                _marks[i].emitting = mark;

                var smokeAmount = onGround ? Mathf.Max(t.skid, loose ? Mathf.Clamp01(t.speed / _s.dustFullSpeed) * 0.6f : 0f) : 0f;
                var ps = _smoke[i];
                ps.transform.position = onGround ? w.contact + Vector3.up * 0.3f : ps.transform.position;
                var main = ps.main;
                main.startColor = loose ? _s.dustColor : _s.smokeColor;
                var emission = ps.emission;
                emission.rateOverTime = smokeAmount > 0.15f ? smokeAmount * _s.smokeRate : 0f;
            }
        }
    }
}
