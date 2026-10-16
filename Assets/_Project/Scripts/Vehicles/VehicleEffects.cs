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
        ParticleSystem[] _flames = System.Array.Empty<ParticleSystem>();
        ParticleSystem _shock;
        Light _burstLight;
        float _lastBurst;

        /// <summary>Fires once per burst (camera, HUD, sound listen to the telemetry instead; tests to this).</summary>
        public int Bursts { get; private set; }

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
            if (_s.flameMaterial != null) MakeNitro(car.Definition);
        }

        /// <summary>
        /// Exhaust flames (blue while boosting, a long orange-white jet in a burst), a shock ring and a light flash
        /// at the burst. The models carry no exhaust node: the tip sits at the rear bumper, left of centre.
        /// </summary>
        void MakeNitro(VehicleDefinition def)
        {
            var size = def.bodySize; // length, width, height
            var rear = def.bodyCenterZ - size.x * 0.5f + 0.08f;
            var tips = new[] { new Vector3(-size.y * 0.22f, def.clearance + 0.12f, rear), new Vector3(size.y * 0.22f, def.clearance + 0.12f, rear) };
            _flames = new ParticleSystem[tips.Length];
            for (var i = 0; i < tips.Length; i++) _flames[i] = MakeFlame(tips[i]);
            if (_s.shockMaterial != null) _shock = MakeShock(new Vector3(0f, def.clearance + size.z * 0.6f, rear - 0.5f));
            if (_s.burstLight > 0f)
            {
                var go = new GameObject("BurstLight");
                go.transform.SetParent(transform, false);
                go.transform.localPosition = new Vector3(0f, def.clearance + 0.9f, rear - 0.8f);
                _burstLight = go.AddComponent<Light>();
                _burstLight.type = LightType.Point;
                _burstLight.range = 6f;
                _burstLight.color = new Color(0.55f, 0.8f, 1f);
                _burstLight.shadows = LightShadows.None;
                _burstLight.enabled = false;
            }
        }

        ParticleSystem MakeFlame(Vector3 at)
        {
            var go = new GameObject("NitroFlame");
            go.transform.SetParent(transform, false);
            go.transform.localPosition = at;
            go.transform.localRotation = Quaternion.LookRotation(Vector3.back);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.06f, 0.13f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(7f, 11f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.22f, 0.38f);
            // Local: the jet stays attached to the car at 200 km/h instead of being left behind as a trail.
            main.simulationSpace = ParticleSystemSimulationSpace.Local;
            main.maxParticles = 160;
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 6f;
            shape.radius = 0.04f;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.EaseInOut(0f, 1f, 1f, 0.2f));
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = _s.flameMaterial;
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.06f;
            r.lengthScale = 2.4f;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            SetFlameColor(ps, false);
            ps.Play();
            return ps;
        }

        void SetFlameColor(ParticleSystem ps, bool burst)
        {
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(_s.flameCore, 0f), new GradientColorKey(burst ? _s.burstFlame : _s.flameEdge, 0.45f), new GradientColorKey(burst ? new Color(1f, 0.3f, 0.1f) : _s.flameEdge, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.8f, 0.4f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
        }

        ParticleSystem MakeShock(Vector3 at)
        {
            var go = new GameObject("BurstShock");
            go.transform.SetParent(transform, false);
            go.transform.localPosition = at;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = false;
            main.playOnAwake = false;
            main.startLifetime = 0.42f;
            main.startSpeed = 0f;
            main.startSize = 1f;
            main.startColor = new Color(0.75f, 0.9f, 1f, 0.9f);
            // World: the car leaves the ring behind, which is what sells the jump in speed.
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 4;
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            var shape = ps.shape;
            shape.enabled = false;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(_s.shockSize, AnimationCurve.EaseInOut(0f, 0.08f, 1f, 1f));
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(_s.flameEdge, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.6f, 0.35f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = _s.shockMaterial;
            r.renderMode = ParticleSystemRenderMode.Billboard;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return ps;
        }

        void UpdateNitro(in VehicleTelemetry t)
        {
            if (_flames.Length == 0) return;
            var burst = t.burst;
            if (burst > 0.97f && Time.time - _lastBurst > 0.5f)
            {
                _lastBurst = Time.time;
                Bursts++;
                foreach (var f in _flames) SetFlameColor(f, true);
                if (_shock != null)
                {
                    _shock.Emit(1);
                    // A second, later ring: one pop reads as a glitch, two as a shock wave.
                    var e = new ParticleSystem.EmitParams { startLifetime = 0.55f, startSize = 0.6f };
                    _shock.Emit(e, 1);
                }
            }
            else if (burst <= 0f && Time.time - _lastBurst < 5f && Time.time - _lastBurst > 0.1f)
            {
                foreach (var f in _flames) SetFlameColor(f, false);
                _lastBurst = -10f;
            }
            var rate = burst > 0f ? Mathf.Lerp(_s.flameRate, _s.burstFlameRate, burst) : t.boosting ? _s.flameRate : 0f;
            var length = burst > 0f ? 1f + 1.6f * burst : 1f;
            foreach (var f in _flames)
            {
                var em = f.emission;
                em.rateOverTime = rate;
                var main = f.main;
                main.startSpeed = new ParticleSystem.MinMaxCurve(7f * length, 11f * length);
                var grow = burst > 0f ? 1.25f + 0.5f * burst : 1f;
                main.startSize = new ParticleSystem.MinMaxCurve(0.22f * grow, 0.38f * grow);
            }
            if (_burstLight != null)
            {
                var k = burst > 0f ? burst * burst : 0f;
                _burstLight.enabled = k > 0.02f;
                _burstLight.intensity = _s.burstLight * k * (0.85f + 0.15f * Mathf.Sin(Time.time * 60f));
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

            UpdateNitro(t);
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
