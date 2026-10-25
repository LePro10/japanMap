using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Simple car effects (fine polish in Phase 4/9): skid marks and tyre smoke / dust
    /// at the rear wheels. Driven by <see cref="VehicleTelemetry"/>: skid for marks and smoke, the
    /// surface for the colour (grey smoke on asphalt, brown dust off-road). Brake lights: <see cref="Headlights"/> (D52).
    /// </summary>
    public sealed class VehicleEffects : MonoBehaviour
    {
        VehicleController _car;
        VehicleEffectsSettings _s;
        readonly TrailRenderer[] _marks = new TrailRenderer[2];
        readonly ParticleSystem[] _smoke = new ParticleSystem[2];
        readonly ParticleSystem[] _spray = new ParticleSystem[2];
        readonly ParticleSystem[] _sheet = new ParticleSystem[2];
        readonly float[] _sprayDue = new float[2];
        readonly float[] _sheetDue = new float[2];
        readonly bool[] _wasWet = new bool[2];
        float _sprayScale = 1f;
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
            for (var i = 0; i < 2; i++)
            {
                _marks[i] = MakeMark(i);
                _smoke[i] = MakeSmoke(i);
                _spray[i] = MakeSpray(i);
                _sheet[i] = MakeSheet(i);
            }
            if (_s.flameMaterial != null) MakeNitro(car.Definition);
            OnTier(Core.QualitySystem.Current);
            Core.QualitySystem.TierChanged -= OnTier;
            Core.QualitySystem.TierChanged += OnTier;
        }

        void OnDestroy() => Core.QualitySystem.TierChanged -= OnTier;

        void OnTier(string tier)
        {
            var i = System.Array.IndexOf(Core.QualitySystem.Tiers, tier);
            _sprayScale = _s != null && i >= 0 && i < _s.sprayTierScale.Length ? _s.sprayTierScale[i] : 1f;
        }

        /// <summary>Drops thrown off a wheel in water: ballistic, stretched along the flight (legacy VehicleFx #emitWater).</summary>
        ParticleSystem MakeSpray(int i)
        {
            var go = new GameObject(i == 0 ? "SprayL" : "SprayR");
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.playOnAwake = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(_s.sprayLife * 0.7f, _s.sprayLife * 1.3f);
            main.startSize = _s.spraySize * 2f;
            main.startColor = _s.sprayColor;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 1f;
            main.maxParticles = 160;
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            var shape = ps.shape;
            shape.enabled = false;
            // A drop shrinks as it flies (legacy dropSize → dropSizeEnd).
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 1f, 1f, 0.5f));
            var color = ps.colorOverLifetime;
            color.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.7f, 0.6f), new GradientAlphaKey(0f, 1f) });
            color.color = g;
            // Air drag on a 2 mm drop is slight (legacy dropDrag 0.9/s).
            var limit = ps.limitVelocityOverLifetime;
            limit.enabled = true;
            limit.drag = 0.9f;
            limit.multiplyDragByParticleSize = false;
            limit.multiplyDragByParticleVelocity = false;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = _s.smokeMaterial;
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.022f; // legacy dropStretch: a 8 m/s drop is drawn 18 cm long
            r.lengthScale = 1f;
            r.maxParticleSize = 0.05f;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            ps.Play();
            return ps;
        }

        /// <summary>The fan at the tyre (legacy KIND_SHEET): a short, wide puff that grows fast and is gone in a fifth of a second.</summary>
        ParticleSystem MakeSheet(int i)
        {
            var go = new GameObject(i == 0 ? "SheetL" : "SheetR");
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.playOnAwake = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(_s.sheetLife * 0.8f, _s.sheetLife * 1.2f);
            main.startSize = _s.sheetSize.x;
            main.startColor = _s.sprayColor;
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 0.5f;
            main.maxParticles = 24;
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            var shape = ps.shape;
            shape.enabled = false;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            var grow = _s.sheetSize.y / Mathf.Max(0.01f, _s.sheetSize.x);
            size.size = new ParticleSystem.MinMaxCurve(1f, new AnimationCurve(new Keyframe(0f, 1f, 2f * grow, 2f * grow), new Keyframe(1f, grow)));
            var color = ps.colorOverLifetime;
            color.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0.7f, 0f), new GradientAlphaKey(0f, 1f) });
            color.color = g;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = _s.smokeMaterial;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            ps.Play();
            return ps;
        }

        void Spray(int i, in VehicleController.Wheel w, in VehicleTelemetry t)
        {
            var wet = w.grounded && !t.airborne && w.waterDepth > _car.Tuning.wetThreshold;
            var entering = wet && !_wasWet[i];
            _wasWet[i] = wet;
            if (!wet) { _sprayDue[i] = 0f; return; }
            var speed = t.speed;
            var depthShare = Mathf.Min(1f, 0.35f + w.waterDepth / 0.5f);
            var pace = Mathf.Min(1.35f, speed / 16f) * depthShare * _sprayScale * Time.deltaTime;
            _sprayDue[i] += _s.sprayRate * pace;
            _sheetDue[i] += _s.sheetRate * pace;
            if (entering) _sprayDue[i] += _s.sprayEntryBurst * _sprayScale;
            var n = (int)_sprayDue[i];
            var sheets = (int)_sheetDue[i];
            if (n <= 0 && sheets <= 0) return;
            _sprayDue[i] -= n;
            _sheetDue[i] -= sheets;
            var tr = _car.transform;
            var outward = tr.right * (i == 0 ? -1f : 1f);
            var vel = _car.Body.linearVelocity;
            var launch = Vector3.up * (_s.sprayLaunch.x + _s.sprayLaunchFromSpeed.x * speed)
                         + outward * (_s.sprayLaunch.y + _s.sprayLaunchFromSpeed.y * speed)
                         - tr.forward * (_s.sprayLaunch.z + _s.sprayLaunchFromSpeed.z * speed)
                         + vel * _s.sprayInherit;
            var e = new ParticleSystem.EmitParams { applyShapeToPosition = false };
            for (var k = 0; k < n; k++)
            {
                e.position = w.contact + outward * Random.Range(0f, 0.15f) + Random.insideUnitSphere * 0.08f;
                e.velocity = launch * Random.Range(0.6f, 1.15f) + Random.insideUnitSphere * 1.2f;
                _spray[i].Emit(e, 1);
            }
            for (var k = 0; k < sheets; k++)
            {
                e.position = w.contact + outward * 0.1f + Vector3.up * 0.1f;
                e.velocity = launch * 0.45f + Random.insideUnitSphere * 0.6f;
                _sheet[i].Emit(e, 1);
            }
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
            UpdateNitro(t);
            var loose = t.surface == Surface.Terrain || t.surface == Surface.Gravel;
            var water = t.surface == Surface.Water;
            for (var i = 0; i < 2; i++)
            {
                var w = _car.Wheels[2 + i];
                var onGround = w.grounded && !t.airborne;
                // Marks only on firm ground; dust off-road even without sliding.
                var mark = onGround && t.skid > _s.markFromSkid && !loose && t.surface != Surface.Water;
                if (onGround) _marks[i].transform.position = w.contact + w.normal * 0.02f;
                _marks[i].emitting = mark;
                Spray(i, w, t);

                var smokeAmount = onGround ? Mathf.Max(t.skid, loose ? Mathf.Clamp01(t.speed / _s.dustFullSpeed) * 0.6f : 0f) : 0f;
                // In water the puffs are mist that hangs behind the car (legacy KIND_MIST), never tyre smoke.
                if (water) smokeAmount = onGround ? Mathf.Clamp01(t.speed / _s.dustFullSpeed) * _s.mistShare * _sprayScale : 0f;
                var ps = _smoke[i];
                ps.transform.position = onGround ? w.contact + Vector3.up * 0.3f : ps.transform.position;
                var main = ps.main;
                main.startColor = water ? _s.mistColor : loose ? _s.dustColor : _s.smokeColor;
                var emission = ps.emission;
                emission.rateOverTime = smokeAmount > (water ? 0.02f : 0.15f) ? smokeAmount * _s.smokeRate : 0f;
            }
        }
    }
}
