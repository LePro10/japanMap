using System;
using System.Collections.Generic;
using System.Linq;
using JapanMap.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// A car-lab car's lamps (D52). Every such car (player, rivals) drives its lamp glass: headlights by the switch, tail
    /// lights with them, brake lights brighter when braking, a white glow when reversing, pop-up lamps (popup_L/R) open
    /// when lit. The player's car (a child of <see cref="PlayerCarSpawner"/>) also throws light, per quality tier: two
    /// spot lights and faint cones on High, one spot on Medium, and on every tier a beam pattern on the road. Lamp
    /// positions come from the model (the *_head / *_tail submeshes); a model without them gets positions from its size.
    /// </summary>
    public sealed class Headlights : MonoBehaviour
    {
        static readonly int EmissiveFactor = Shader.PropertyToID("emissiveFactor");
        static readonly int ColorId = Shader.PropertyToID("_Color");
        static readonly int MainTex = Shader.PropertyToID("_MainTex");

        enum Kind { Head, Tail }

        struct Lamp
        {
            public Material material;
            public Color baseColor;
            public Kind kind;
        }

        /// <summary>Lamp centres in the car root's space (left = −X, right = +X; nose +Z).</summary>
        public struct Layout
        {
            public Vector3 headL, headR, tailL, tailR;
            public bool hasHead, hasTail;
            public float groundY, frontZ, rearZ;
        }

        HeadlightSettings _s;
        VehicleController _car;
        readonly List<Lamp> _lamps = new();
        readonly List<(Transform t, Quaternion rest)> _popups = new();
        Layout _layout;
        bool _player, _built;
        int _tier = 1;

        Light[] _spots = Array.Empty<Light>();
        Light _reverseSpot;
        MeshRenderer _pool;
        Material _poolMat;
        MeshRenderer[] _cones = Array.Empty<MeshRenderer>();
        Material _coneMat;
        MeshRenderer[] _glows = Array.Empty<MeshRenderer>();
        Material _reverseMat, _rainMat;

        float _head, _tail, _reverse, _beam, _popupT, _poolFade;
        bool _nearCamera; // the view from the seat (last frame's camera)

        /// <summary>The player's car: real light, follows the switch. Others are always lit and glow only.</summary>
        public bool IsPlayer => _player;
        public bool LightsOn => !_player || HeadlightSwitch.On;
        /// <summary>Current multipliers on the model's glow (tests, captures).</summary>
        public float HeadLevel => _head;
        public float TailLevel => _tail;
        public float ReverseLevel => _reverse;
        public float PopupOpen => _popupT;
        public Layout Lamps => _layout;
        public int LampMaterialCount => _lamps.Count;
        public int ActiveSpots { get { var n = 0; foreach (var l in _spots) if (l != null && l.enabled) n++; return n; } }
        public bool PoolVisible => _pool != null && _pool.enabled;
        /// <summary>Brightness of the beam pattern now (tier × lamps × the seat boost).</summary>
        public float PoolLevel { get; private set; }
        public int ActiveCones { get { var n = 0; foreach (var c in _cones) if (c != null && c.enabled) n++; return n; } }

        public void Bind(VehicleController car, Transform model, HeadlightSettings settings)
        {
            _car = car;
            _s = settings;
            TakeLampMaterials(model);
            foreach (var t in model.GetComponentsInChildren<Transform>(true))
                if (t.name.StartsWith("popup_")) _popups.Add((t, t.localRotation));
            _layout = FindLayout(model, transform, car.Definition, settings.popupAngle);
            // Start state without a fade: a car appears lit, not lighting up.
            UpdatePlayer();
            _head = HeadTarget();
            _tail = TailTarget(false);
            _popupT = LightsOn ? 1f : 0f;
            ApplyLamps();
        }

        void Start() => UpdatePlayer();
        void OnTransformParentChanged() => UpdatePlayer();

        void OnEnable() => QualitySystem.TierChanged += OnTier;

        void OnDisable()
        {
            QualitySystem.TierChanged -= OnTier;
        }

        void OnDestroy()
        {
            foreach (var l in _lamps) if (l.material != null) Destroy(l.material);
            foreach (var m in new[] { _poolMat, _coneMat, _reverseMat, _rainMat }) if (m != null) Destroy(m);
            if (_poolMesh != null) Destroy(_poolMesh);
        }

        void UpdatePlayer()
        {
            if (_s == null) return;
            var player = GetComponentInParent<PlayerCarSpawner>() != null;
            if (_built && player == _player) return;
            _player = player;
            _built = true;
            if (_player) HeadlightSwitch.Bind(_s.actions);
            BuildLights();
        }

        void OnTier(string _) => BuildLights();

        /// <summary>(Re)builds the light objects for this car and the current tier.</summary>
        void BuildLights()
        {
            foreach (var l in _spots) if (l != null) Destroy(l.gameObject);
            foreach (var c in _cones) if (c != null) Destroy(c.gameObject);
            if (_pool != null) Destroy(_pool.gameObject);
            if (_reverseSpot != null) Destroy(_reverseSpot.gameObject);
            _spots = Array.Empty<Light>();
            _cones = Array.Empty<MeshRenderer>();
            _pool = null;
            _reverseSpot = null;
            _tier = TierIndex(QualitySystem.Current);
            BuildGlows();
            if (!_player) return;

            var spots = Pick(_s.spots, _tier);
            _spots = new Light[spots];
            for (var i = 0; i < spots; i++)
            {
                var at = spots == 1 ? (_layout.headL + _layout.headR) * 0.5f : i == 0 ? _layout.headL : _layout.headR;
                _spots[i] = MakeSpot($"Headlight{(spots == 1 ? "" : i == 0 ? "L" : "R")}", at);
            }
            if (spots > 0)
            {
                _reverseSpot = MakeSpot("ReverseLight", (_layout.tailL + _layout.tailR) * 0.5f);
                _reverseSpot.transform.localRotation = Quaternion.Euler(12f, 180f, 0f);
                _reverseSpot.color = Color.white;
                _reverseSpot.intensity = _s.reverseLight.x;
                _reverseSpot.range = _s.reverseLight.y;
                _reverseSpot.spotAngle = 100f;
                _reverseSpot.innerSpotAngle = 50f;
                _reverseSpot.enabled = false;
            }
            if (_s.beamMaterial != null)
            {
                _poolMat ??= new Material(_s.beamMaterial) { name = "HeadlightBeam (car)" };
                _poolMat.SetTexture(MainTex, BeamPattern());
                _pool = MakeRenderer("HeadlightBeam", transform, _poolMesh != null ? _poolMesh : PoolMesh(), _poolMat);
            }
            if (Pick(_s.cones, _tier) > 0 && _s.coneMaterial != null)
            {
                _coneMat ??= new Material(_s.coneMaterial) { name = "HeadlightCone (car)" };
                _coneMat.SetTexture(MainTex, ConeGradient());
                _coneMat.SetColor(ColorId, _s.coneColor);
                _cones = new[] { MakeRenderer("HeadlightConeL", transform, ConeMesh(), _coneMat), MakeRenderer("HeadlightConeR", transform, ConeMesh(), _coneMat) };
                for (var i = 0; i < 2; i++)
                {
                    var t = _cones[i].transform;
                    t.localPosition = i == 0 ? _layout.headL : _layout.headR;
                    t.localRotation = Quaternion.Euler(_s.lowPitch, 0f, 0f);
                    t.localScale = new Vector3(_s.coneRadius, _s.coneRadius, _s.coneLength);
                }
            }
            Update();
        }

        /// <summary>Reversing glow at both tail lamps; a red rear light on a car without tail lamps (the formula car).</summary>
        void BuildGlows()
        {
            if (_glows.Length > 0 || _s.glowMaterial == null) return;
            _reverseMat = new Material(_s.glowMaterial) { name = "ReverseGlow (car)" };
            _reverseMat.SetColor(ColorId, _s.reverseColor);
            var list = new List<MeshRenderer>();
            foreach (var p in new[] { _layout.tailL, _layout.tailR })
            {
                var r = MakeRenderer("ReverseGlow", transform, QuadMesh(), _reverseMat);
                // A little inboard of the tail lamp and just behind the body.
                r.transform.localPosition = new Vector3(p.x * 0.8f, p.y - 0.04f, p.z - 0.04f);
                r.transform.localScale = Vector3.one * _s.reverseSize;
                list.Add(r);
            }
            if (!_layout.hasTail)
            {
                _rainMat = new Material(_s.glowMaterial) { name = "RainLight (car)" };
                _rainMat.SetColor(ColorId, _s.rainLightColor * 0.3f);
                var r = MakeRenderer("RainLight", transform, QuadMesh(), _rainMat);
                r.transform.localPosition = new Vector3(0f, _layout.tailL.y, _layout.rearZ - 0.03f);
                r.transform.localScale = Vector3.one * _s.reverseSize;
                list.Add(r);
            }
            _glows = list.ToArray();
        }

        Light MakeSpot(string name, Vector3 at)
        {
            // On the car's root, not the sprung body: a beam that dived and rolled with the body flickered over the road.
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.localPosition = at;
            go.transform.localRotation = Quaternion.Euler(_s.lowPitch, 0f, 0f);
            var l = go.AddComponent<Light>();
            l.type = LightType.Spot;
            l.shadows = LightShadows.None;
            l.color = _s.lightColor;
            return l;
        }

        static MeshRenderer MakeRenderer(string name, Transform parent, Mesh mesh, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = LightProbeUsage.Off;
            r.reflectionProbeUsage = ReflectionProbeUsage.Off;
            return r;
        }

        void Update()
        {
            if (_car == null || _s == null) return;
            var dt = Time.deltaTime;
            var k = 1f - Mathf.Exp(-_s.fade * dt);
            var t = _car.Telemetry;
            var input = _car.Input;
            var v = t.forwardSpeed;
            var braking = input.handbrake || (input.brake > 0.1f && v > -0.3f) || (input.throttle > 0.1f && v < -0.5f);
            var reversing = v < -0.3f && input.throttle < 0.1f;
            _head += (HeadTarget() - _head) * k;
            _tail += (TailTarget(braking) - _tail) * k;
            _reverse += ((reversing ? 1f : 0f) - _reverse) * k;
            var high = _player && HeadlightSwitch.Mode == HeadlightMode.High;
            _beam += ((high ? 1f : 0f) - _beam) * k;
            var popup = LightsOn ? 1f : 0f;
            _popupT = Mathf.MoveTowards(_popupT, popup, _s.popupSpeed * dt * 0.5f);
            ApplyLamps();
            if (_player) ApplyLight(t);
        }

        void LateUpdate()
        {
            // Glow sprites face the camera.
            var cam = Camera.main;
            if (cam == null) return;
            foreach (var g in _glows)
            {
                if (g == null || !g.enabled) continue;
                g.transform.rotation = Quaternion.LookRotation(cam.transform.position - g.transform.position, cam.transform.up) * Quaternion.Euler(90f, 0f, 0f);
            }
            var near = _nearCamera = (cam.transform.position - transform.position).sqrMagnitude < _s.coneHideDistance * _s.coneHideDistance;
            if (_cones.Length > 0)
            {
                var lit = _head > 0.5f * _s.headOn && !near;
                foreach (var c in _cones) c.enabled = lit;
            }
        }

        float HeadTarget() => !LightsOn ? _s.headOff : _player && HeadlightSwitch.Mode == HeadlightMode.High ? _s.headHigh : _s.headOn;
        float TailTarget(bool braking) => braking ? _s.brake : LightsOn ? _s.tailOn : _s.tailOff;

        void ApplyLamps()
        {
            foreach (var l in _lamps)
                l.material.SetColor(EmissiveFactor, l.baseColor * (l.kind == Kind.Head ? _head : _tail));
            var open = Quaternion.Euler(_s.popupAngle * Mathf.SmoothStep(0f, 1f, _popupT), 0f, 0f);
            foreach (var (t, rest) in _popups) if (t != null) t.localRotation = rest * open;
            for (var i = 0; i < _glows.Length; i++)
            {
                var rain = _rainMat != null && i == _glows.Length - 1;
                var level = rain ? _tail / Mathf.Max(0.01f, _s.tailOn) : _reverse;
                _glows[i].enabled = level > 0.02f;
                (rain ? _rainMat : _reverseMat).SetColor(ColorId, (rain ? _s.rainLightColor * 0.3f : _s.reverseColor) * level);
            }
        }

        void ApplyLight(VehicleTelemetry t)
        {
            var on = Mathf.InverseLerp(_s.headOff, _s.headOn, _head);
            var intensity = Mathf.Lerp(_s.lowIntensity, _s.highIntensity, _beam) * (_spots.Length == 1 ? 1.6f : 1f) * on;
            var range = Mathf.Lerp(_s.lowRange, _s.highRange, _beam);
            var angle = Vector2.Lerp(_s.lowAngle, _s.highAngle, _beam);
            var pitch = Mathf.Lerp(_s.lowPitch, _s.highPitch, _beam);
            foreach (var l in _spots)
            {
                l.enabled = on > 0.01f;
                l.intensity = intensity;
                l.range = range;
                l.spotAngle = angle.x;
                l.innerSpotAngle = angle.y;
                l.transform.localRotation = Quaternion.Euler(pitch, 0f, 0f);
            }
            if (_reverseSpot != null) _reverseSpot.enabled = _reverse > 0.02f;
            if (_pool != null)
            {
                // Off the ground (a jump) the pattern would float: it fades with the wheels that touch.
                _poolFade = Mathf.MoveTowards(_poolFade, t.groundedWheels >= 3 ? 1f : 0f, Time.deltaTime * 6f);
                var strength = Pick(_s.poolStrength, _tier) * on * _poolFade * Mathf.Lerp(1f, 1.3f, _beam) * (_nearCamera ? _s.seatPoolBoost : 1f);
                PoolLevel = strength;
                _pool.enabled = strength > 0.01f;
                _poolMat.SetColor(ColorId, _s.poolColor * strength);
                if (_pool.enabled) LayPool(Vector2.Lerp(_s.lowPool, _s.highPool, _beam));
            }
        }

        const int PoolRows = 6, PoolCols = 3;
        readonly Vector3[] _poolVerts = new Vector3[PoolRows * PoolCols];
        readonly Vector3[] _poolNormals = new Vector3[PoolRows * PoolCols];
        readonly Color[] _poolColors = new Color[PoolRows * PoolCols];
        Mesh _poolMesh;

        /// <summary>
        /// The beam pattern follows the road: a flat quad in the car's plane sank under the road a few metres ahead
        /// whenever the car pitched a little (city street: only a bright patch at the bumper). One ray per grid point;
        /// where a ray finds nothing (a drop beside the road) the pattern fades out.
        /// </summary>
        void LayPool(Vector2 size)
        {
            var physics = gameObject.scene.GetPhysicsScene();
            var mask = ~GameLayers.NotGround;
            var up = transform.up;
            for (var r = 0; r < PoolRows; r++)
            {
                var v = r / (PoolRows - 1f);
                var z = _layout.frontZ + _s.poolStart + v * size.x;
                for (var c = 0; c < PoolCols; c++)
                {
                    var x = (c / (PoolCols - 1f) - 0.5f) * size.y;
                    var i = r * PoolCols + c;
                    var probe = transform.TransformPoint(new Vector3(x, _layout.groundY + 2.5f, z));
                    if (physics.Raycast(probe, -up, out var hit, 6f, mask, QueryTriggerInteraction.Ignore))
                    {
                        _poolVerts[i] = transform.InverseTransformPoint(hit.point) + transform.InverseTransformDirection(hit.normal) * 0.05f;
                        _poolNormals[i] = transform.InverseTransformDirection(hit.normal);
                        _poolColors[i] = Color.white;
                    }
                    else
                    {
                        _poolVerts[i] = new Vector3(x, _layout.groundY, z);
                        _poolNormals[i] = Vector3.up;
                        _poolColors[i] = Color.clear;
                    }
                }
            }
            _poolMesh.vertices = _poolVerts;
            _poolMesh.normals = _poolNormals;
            _poolMesh.colors = _poolColors;
            _poolMesh.RecalculateBounds();
        }

        Mesh PoolMesh()
        {
            _poolMesh = new Mesh { name = "HeadlightBeamGrid" };
            _poolMesh.MarkDynamic();
            var uv = new Vector2[PoolRows * PoolCols];
            var tri = new List<int>();
            for (var r = 0; r < PoolRows; r++)
            for (var c = 0; c < PoolCols; c++)
            {
                uv[r * PoolCols + c] = new Vector2(c / (PoolCols - 1f), r / (PoolRows - 1f));
                _poolVerts[r * PoolCols + c] = new Vector3(c, 0f, r);
                if (r == PoolRows - 1 || c == PoolCols - 1) continue;
                var a = r * PoolCols + c;
                // Facing up (Unity winding: clockwise seen from above).
                tri.AddRange(new[] { a, a + PoolCols, a + PoolCols + 1, a, a + PoolCols + 1, a + 1 });
            }
            _poolMesh.vertices = _poolVerts;
            _poolMesh.uv = uv;
            _poolMesh.SetTriangles(tri, 0);
            return _poolMesh;
        }

        void TakeLampMaterials(Transform model)
        {
            var copies = new Dictionary<Material, Material>();
            foreach (var r in model.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                var changed = false;
                for (var i = 0; i < mats.Length; i++)
                {
                    var m = mats[i];
                    if (m == null || !m.HasProperty(EmissiveFactor)) continue;
                    var kind = KindOf(m.name);
                    if (kind == null) continue;
                    if (!copies.TryGetValue(m, out var copy))
                    {
                        // Same name: other systems find materials by suffix (paint, glass).
                        copy = new Material(m) { name = m.name };
                        copies[m] = copy;
                        _lamps.Add(new Lamp { material = copy, baseColor = m.GetColor(EmissiveFactor), kind = kind.Value });
                    }
                    mats[i] = copy;
                    changed = true;
                }
                if (changed) r.sharedMaterials = mats;
            }
        }

        static Kind? KindOf(string material) =>
            material.EndsWith("_head") || material.EndsWith("_head_bright") ? Kind.Head
            : material.EndsWith("_tail") ? Kind.Tail : null;

        /// <summary>
        /// Lamp centres from the model's lamp submeshes, in <paramref name="root"/>'s space: the body's lamps directly,
        /// pop-up lamps as they stand when open. Tuning parts (aero light pods) do not count.
        /// </summary>
        public static Layout FindLayout(Transform model, Transform root, VehicleDefinition def, float popupAngle)
        {
            var layout = new Layout();
            var head = new Accum();
            var tail = new Accum();
            var bounds = new Bounds();
            var any = false;
            foreach (var mf in model.GetComponentsInChildren<MeshFilter>(true))
            {
                var name = mf.name;
                var popup = name.StartsWith("popup_");
                if (!popup && !name.StartsWith("body")) continue;
                var mesh = mf.sharedMesh;
                var r = mf.GetComponent<Renderer>();
                if (mesh == null || r == null) continue;
                var toRoot = root.worldToLocalMatrix * mf.transform.localToWorldMatrix;
                if (popup)
                {
                    // Open: turned about its hinge (the node's origin) by the opening angle.
                    var t = mf.transform;
                    var open = Matrix4x4.TRS(t.localPosition, t.localRotation * Quaternion.Euler(popupAngle, 0f, 0f), t.localScale);
                    toRoot = root.worldToLocalMatrix * t.parent.localToWorldMatrix * open;
                }
                else
                {
                    var b = mesh.bounds;
                    foreach (var c in Corners(b))
                    {
                        var p = toRoot.MultiplyPoint3x4(c);
                        if (!any) { bounds = new Bounds(p, Vector3.zero); any = true; }
                        else bounds.Encapsulate(p);
                    }
                }
                var mats = r.sharedMaterials;
                for (var s = 0; s < mesh.subMeshCount && s < mats.Length; s++)
                {
                    if (mats[s] == null) continue;
                    var kind = KindOf(mats[s].name);
                    if (kind == null) continue;
                    (kind == Kind.Head ? head : tail).Add(mesh, s, toRoot);
                }
            }
            if (!any) bounds = new Bounds(new Vector3(0f, def.bodySize.z * 0.5f, def.bodyCenterZ), new Vector3(def.bodySize.y, def.bodySize.z, def.bodySize.x));
            layout.frontZ = bounds.max.z;
            layout.rearZ = bounds.min.z;
            layout.groundY = GroundY(model, root, def, bounds);
            var y = layout.groundY + def.clearance + bounds.size.y * 0.25f;
            var x = bounds.extents.x * 0.62f;
            layout.hasHead = head.TryGet(out layout.headL, out layout.headR);
            if (!layout.hasHead)
            {
                layout.headL = new Vector3(-x, y, bounds.max.z - 0.05f);
                layout.headR = new Vector3(x, y, bounds.max.z - 0.05f);
            }
            layout.hasTail = tail.TryGet(out layout.tailL, out layout.tailR);
            if (!layout.hasTail)
            {
                layout.tailL = new Vector3(-x, y, bounds.min.z + 0.05f);
                layout.tailR = new Vector3(x, y, bounds.min.z + 0.05f);
            }
            return layout;
        }

        static float GroundY(Transform model, Transform root, VehicleDefinition def, Bounds bounds)
        {
            var w = VehicleVisuals.FindPrefix(model, "wheel_FL");
            if (w == null) return bounds.min.y - def.clearance;
            return root.InverseTransformPoint(w.position).y - def.wheelRadius;
        }

        static IEnumerable<Vector3> Corners(Bounds b)
        {
            for (var i = 0; i < 8; i++)
                yield return new Vector3((i & 1) == 0 ? b.min.x : b.max.x, (i & 2) == 0 ? b.min.y : b.max.y, (i & 4) == 0 ? b.min.z : b.max.z);
        }

        /// <summary>Lamp vertices summed per side of the car.</summary>
        sealed class Accum
        {
            Vector3 _l, _r;
            int _nl, _nr;

            public void Add(Mesh mesh, int sub, Matrix4x4 toRoot)
            {
                if (mesh.isReadable)
                {
                    var v = mesh.vertices;
                    foreach (var i in mesh.GetIndices(sub)) Put(toRoot.MultiplyPoint3x4(v[i]));
                    return;
                }
                // Not readable (should not happen for glTFast imports): both lamps from the submesh box.
                var b = mesh.GetSubMesh(sub).bounds;
                var c = b.center;
                var e = b.extents;
                Put(toRoot.MultiplyPoint3x4(new Vector3(c.x - e.x * 0.75f, c.y, c.z)));
                Put(toRoot.MultiplyPoint3x4(new Vector3(c.x + e.x * 0.75f, c.y, c.z)));
            }

            void Put(Vector3 p)
            {
                if (p.x < 0f) { _l += p; _nl++; }
                else { _r += p; _nr++; }
            }

            public bool TryGet(out Vector3 left, out Vector3 right)
            {
                left = _nl > 0 ? _l / _nl : Vector3.zero;
                right = _nr > 0 ? _r / _nr : Vector3.zero;
                if (_nl == 0 && _nr > 0) left = new Vector3(-right.x, right.y, right.z);
                if (_nr == 0 && _nl > 0) right = new Vector3(-left.x, left.y, left.z);
                return _nl + _nr > 0;
            }
        }

        public static int TierIndex(string tier)
        {
            var i = Array.IndexOf(QualitySystem.Tiers, tier);
            return i < 0 ? 1 : i;
        }

        static int Pick(Vector3Int v, int tier) => tier == 0 ? v.x : tier == 2 ? v.z : v.y;
        static float Pick(Vector3 v, int tier) => tier == 0 ? v.x : tier == 2 ? v.z : v.y;

        // ---- shared meshes and patterns (built once, no assets in the download) ----

        static Mesh _quad, _cone;
        static Texture2D _beamTex, _gradient;

        /// <summary>Flat 1 × 1 quad in XZ, v = 0 at the near edge (−Z), normal up.</summary>
        static Mesh QuadMesh()
        {
            if (_quad != null) return _quad;
            _quad = new Mesh { name = "HeadlightQuad" };
            _quad.SetVertices(new[] { new Vector3(-0.5f, 0, -0.5f), new Vector3(-0.5f, 0, 0.5f), new Vector3(0.5f, 0, 0.5f), new Vector3(0.5f, 0, -0.5f) });
            _quad.SetNormals(new[] { Vector3.up, Vector3.up, Vector3.up, Vector3.up });
            _quad.SetUVs(0, new[] { new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0) });
            _quad.SetColors(new[] { Color.white, Color.white, Color.white, Color.white });
            _quad.SetTriangles(new[] { 0, 1, 2, 0, 2, 3 }, 0);
            _quad.RecalculateBounds();
            return _quad;
        }

        /// <summary>Open cone, apex at the origin, radius 1 at z = 1; v runs along it.</summary>
        static Mesh ConeMesh()
        {
            if (_cone != null) return _cone;
            const int n = 16;
            var v = new List<Vector3>();
            var nr = new List<Vector3>();
            var uv = new List<Vector2>();
            var tri = new List<int>();
            for (var i = 0; i <= n; i++)
            {
                var a = 2f * Mathf.PI * i / n;
                var d = new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0f);
                var normal = (d - Vector3.forward).normalized; // the slant surface's outward normal (45° cone before scaling)
                v.Add(new Vector3(d.x * 0.04f, d.y * 0.04f, 0.0f)); nr.Add(normal); uv.Add(new Vector2((float)i / n, 0f));
                v.Add(new Vector3(d.x, d.y, 1f)); nr.Add(normal); uv.Add(new Vector2((float)i / n, 1f));
            }
            for (var i = 0; i < n; i++)
            {
                var a = i * 2;
                // Outside faces front (Unity winding: clockwise seen from outside).
                tri.AddRange(new[] { a, a + 2, a + 1, a + 1, a + 2, a + 3 });
            }
            _cone = new Mesh { name = "HeadlightCone" };
            _cone.SetVertices(v);
            _cone.SetNormals(nr);
            _cone.SetUVs(0, uv);
            _cone.SetColors(Enumerable.Repeat(Color.white, v.Count).ToList());
            _cone.SetTriangles(tri, 0);
            _cone.RecalculateBounds();
            return _cone;
        }

        /// <summary>
        /// Low-beam pattern seen from above (u across, v away from the car): a fan that widens with distance, brightest
        /// a third of the way out with two lobes from the lamps, reaching further on the left — the kerb side in Japan.
        /// </summary>
        internal static Texture2D BeamPattern()
        {
            if (_beamTex != null) return _beamTex;
            const int w = 64, h = 128;
            // Linear: an sRGB texture would square the falloff on sampling.
            _beamTex = new Texture2D(w, h, TextureFormat.RGBA32, false, linear: true) { name = "HeadlightBeamPattern", wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[w * h];
            for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var u = (x + 0.5f) / w * 2f - 1f;  // −1 left … 1 right
                var d = (y + 0.5f) / h;            // 0 at the car … 1 far
                // A fan with a flat core and soft edges: a narrow pattern hid behind the car in the chase view.
                var half = 0.28f + 0.57f * Mathf.Sqrt(d); // stays inside the quad: no square corners
                var across = Mathf.Clamp01((half - Mathf.Abs(u)) / (0.45f * half));
                across = across * across * (3f - 2f * across);
                var reach = Mathf.Lerp(0.78f, 1f, Mathf.Clamp01(-u * 1.5f + 0.5f)); // left side carries further
                var far = Mathf.Clamp01(1f - d / reach);
                // Brightest a third of the way out: the chase camera sees the road from ~6 m ahead (the car hides the rest).
                var near = Mathf.SmoothStep(0f, 1f, d / 0.3f);
                // Fades in over the first metres: a hard near edge showed as a bright box beside the bumper from behind.
                var start = Mathf.SmoothStep(0f, 1f, d / 0.14f);
                var along = start * (0.6f + 0.4f * near) * Mathf.Pow(far, 1.3f);
                var lobes = 1f + 0.35f * (Lobe(u, -0.42f, d) + Lobe(u, 0.42f, d));
                var i = Mathf.Clamp01(across * along * lobes);
                var b = (byte)(i * 255f);
                px[y * w + x] = new Color32(b, b, b, 255);
            }
            _beamTex.SetPixels32(px);
            _beamTex.Apply(false, true);
            return _beamTex;
        }

        static float Lobe(float u, float centre, float d)
        {
            var k = (u - centre * (1f - d)) / 0.25f;
            return Mathf.Exp(-k * k) * Mathf.Clamp01(1f - d * 1.6f);
        }

        /// <summary>Cone brightness along its length: bright at the lamp, gone at the end.</summary>
        internal static Texture2D ConeGradient()
        {
            if (_gradient != null) return _gradient;
            const int h = 64;
            _gradient = new Texture2D(4, h, TextureFormat.RGBA32, false, linear: true) { name = "HeadlightConeGradient", wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[4 * h];
            for (var y = 0; y < h; y++)
            {
                var d = (y + 0.5f) / h;
                var b = (byte)(255f * Mathf.Pow(1f - d, 2.2f));
                for (var x = 0; x < 4; x++) px[y * 4 + x] = new Color32(b, b, b, 255);
            }
            _gradient.SetPixels32(px);
            _gradient.Apply(false, true);
            return _gradient;
        }
    }
}
