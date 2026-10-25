using System;
using System.Collections.Generic;
using System.Diagnostics;
using JapanMap.Core;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// The player's car takes visible damage where it is hit (D47). Unity reports the body's collisions; each hit is
    /// gathered over a couple of physics steps (a crash is resolved over more than one), its speed change
    /// (impulse / mass) decides how hard it was, and the contact and impulse direction decide where and which way:
    /// the body crumples there (<see cref="CarBodyDeformer"/>), paint scratches or glass cracks (<see cref="DamageMarks"/>),
    /// sparks and bits fly (<see cref="DamageEffects"/>), a wheel near a hard hit bends (wobbles, pulls a little) or is
    /// torn off (rolls away; the car sits on that hub and drags). Small things that broke tell the car how little they
    /// cost it (<see cref="Soften"/>). Nothing hidden: engine and steering stay whole. <see cref="Repair"/> undoes all of it
    /// (respawn, a new car, the garage, the repair key or button).
    /// </summary>
    [DefaultExecutionOrder(-150)]
    public sealed class VehicleDamage : MonoBehaviour
    {
        public struct Impact
        {
            public Vector3 point, direction;
            /// <summary>Speed change the hit gave the car, m/s (after softening).</summary>
            public float deltaV;
            /// <summary>Largest vertex push of this hit, m.</summary>
            public float dent;
            public bool scratched, glassCracked, glassBroke;
            /// <summary>A hard end-on hit cracked the windscreen (front) or rear window.</summary>
            public bool screenCracked;
            /// <summary>Wheel index torn off by this hit, −1 none.</summary>
            public int wheelLost;
            public int wheelsBent;
            /// <summary>The bumper at that end now hangs down.</summary>
            public bool bumperHangs;
            /// <summary>The bumper at that end, already hanging, tore off (it falls in the next frame).</summary>
            public bool bumperOff;
            /// <summary>The thing hit broke and the car drove through (sign, tree, lamp).</summary>
            public bool brokeThrough;
            /// <summary>What was hit (null for a hit given by hand).</summary>
            public Collider other;
        }

        sealed class Pending
        {
            public Collider other;
            public Vector3 impulse, pointSum, normalSum, relative;
            public int contacts, steps;
            public bool soft;
            public float softDeltaV;
        }

        VehicleDamageSettings _s;
        VehicleController _car;
        VehicleVisuals _visuals;
        CarBodyDeformer _deformer;
        DamageMarks _marks;
        DamageEffects _fx;
        bool _bound;
        int _paintSub = -1, _glassSub = -1;
        Color _paint = new(0.7f, 0.7f, 0.72f, 1f);
        readonly List<Pending> _pending = new();
        readonly Dictionary<Collider, float> _soft = new();
        readonly float[] _bend = new float[VehicleController.WheelCount];
        readonly bool[] _lost = new bool[VehicleController.WheelCount];
        readonly GameObject[] _loose = new GameObject[VehicleController.WheelCount];
        readonly float[] _looseAt = new float[VehicleController.WheelCount];
        // The loose wheels' bodies, kept with _loose so Update does not GetComponent every frame.
        readonly Rigidbody[] _looseBody = new Rigidbody[VehicleController.WheelCount];
        readonly Dictionary<Collider, float> _slid = new();
        int _seed, _dentFrame = -1, _hitFrame = -1;
        readonly bool[] _drooped = new bool[2]; // front, rear: once per end until repaired
        readonly GameObject[] _torn = new GameObject[2]; // the torn-off bumpers lying in the world
        readonly float[] _tornAt = new float[2];
        readonly GameObject[] _tornBody = new GameObject[2]; // made ahead, inactive, outside the car
        bool _tearWarm;
        readonly Queue<(int end, Vector3 dir)> _tearQueue = new();
        double _tGlass;
        int _marksWarmFrame;
        readonly Queue<(Vector3 at, Vector3 into, Vector3 along, float radius, DamageMarks.Tile tile)> _markQueue = new();
        Collider _other;
        float _depth, _shoulder = 0.5f, _spread;
        bool _hullBaked;
        // Windscreen [0] and rear window [1] in body space: centre and outward normal (zero normal = none), found once.
        readonly Vector3[] _screenAt = new Vector3[2], _screenOut = new Vector3[2];
        bool _screensFound;

        readonly Stopwatch _watch = new();

        public VehicleDamageSettings Settings => _s;
        public CarBodyDeformer Deformer => _deformer;
        public DamageMarks Marks => _marks;
        public DamageEffects Effects => _fx;
        public bool Bound => _bound;

        /// <summary>0 = as new, 1 = wrecked (the deepest crush against 0.5 m, a lost wheel counts fully).</summary>
        public float Damage01
        {
            get
            {
                var d = _deformer != null ? _deformer.MaxDisplacement / 0.5f : 0f;
                foreach (var l in _lost) if (l) d = Mathf.Max(d, 1f);
                return Mathf.Clamp01(Mathf.Max(d, (_marks != null && _marks.Count > 0) ? 0.02f : 0f));
            }
        }

        /// <summary>Anything to repair (dent, mark, bent or lost wheel).</summary>
        public bool NeedsRepair => Damage01 > 0f || BentWheels > 0;
        public int WheelsLost { get { var n = 0; foreach (var l in _lost) if (l) n++; return n; } }
        public int BentWheels { get { var n = 0; for (var i = 0; i < _bend.Length; i++) if (!_lost[i] && _bend[i] >= (_s != null ? _s.wheelBendPush : 0.04f)) n++; return n; } }
        public bool IsWheelLost(int i) => _lost[i];
        public float Bend(int i) => _bend[i];
        public Impact Last { get; private set; }
        public int Hits { get; private set; }
        /// <summary>Longest handling of one hit (field, normals, upload, marks, wheels, effects), ms — budget 2 ms.</summary>
        public float WorstHitMs { get; private set; }
        /// <summary>The last hit's own cost (the frame of the hit, without the crumpling that follows), ms.</summary>
        public float LastHitMs { get; private set; }
        /// <summary>Where the worst hit's time went (diagnostics).</summary>
        public string WorstDetail { get; private set; } = "";
        /// <summary>Metal on road or wall right now, 0…1 (scrape loop, tests).</summary>
        public float Scrape { get; private set; }

        public event Action<Impact> Impacted;
        public event Action Repaired;

        /// <summary>Puts damage on a player car (traffic and rivals stay whole: their races must not change).</summary>
        public static VehicleDamage Attach(VehicleController car, VehicleDamageSettings settings)
        {
            if (car == null || settings == null) return null;
            var d = car.GetComponent<VehicleDamage>();
            if (d == null) d = car.gameObject.AddComponent<VehicleDamage>();
            d._s = settings;
            d._car = car;
            d.TryBind();
            return d;
        }

        /// <summary>
        /// The thing behind <paramref name="other"/> broke: the car felt only <paramref name="deltaV"/> m/s of it (the
        /// collision first stopped the car as a wall would; smashing gave the speed back).
        /// </summary>
        public static void Soften(Rigidbody body, Collider other, float deltaV)
        {
            if (body == null || other == null || !body.TryGetComponent<VehicleDamage>(out var d)) return;
            d._soft[other] = deltaV;
        }

        void OnEnable() => QualitySystem.TierChanged += OnTier;
        void OnDisable() => QualitySystem.TierChanged -= OnTier;
        void OnTier(string tier) => _fx?.SetTier(tier);

        void OnDestroy()
        {
            _marks?.Destroy();
            for (var i = 0; i < _loose.Length; i++)
                if (_loose[i] != null) Destroy(_loose[i]);
            DropTorn();
            foreach (var go in _tornBody) if (go != null) Destroy(go);
        }

        /// <summary>Longest frame spent tearing a bumper off, ms (its own frame, after the hit's).</summary>
        public float TearMs { get; private set; }
        public string TearDetail { get; private set; } = "";

        /// <summary>The torn-off bumper of an end (0 front, 1 rear) lying in the world, or null.</summary>
        public GameObject TornBumper(int end) => _torn[end];

        /// <summary>The body a torn bumper falls on: made ahead (components cost ~0.7 ms in the crash), inactive outside the car.</summary>
        GameObject TornBody(int end)
        {
            if (_tornBody[end] != null) return _tornBody[end];
            var go = new GameObject("TornBumper") { layer = DebrisLayer };
            go.SetActive(false);
            go.AddComponent<MeshFilter>();
            go.AddComponent<MeshRenderer>();
            go.AddComponent<BoxCollider>();
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = _s.bumperMass;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.maxDepenetrationVelocity = 3f; // it starts inside the wall it was torn on: slide out, not shot out
            return _tornBody[end] = go;
        }

        bool TearQueued(int end)
        {
            foreach (var q in _tearQueue) if (q.end == end) return true;
            return false;
        }

        /// <summary>Torn-off bumpers out of the world (repair puts them back on the car; a new car has its own).</summary>
        void DropTorn()
        {
            _tearQueue.Clear();
            for (var e = 0; e < _torn.Length; e++)
            {
                if (_torn[e] == null) continue;
                Destroy(_torn[e].GetComponent<MeshFilter>().sharedMesh);
                Destroy(_torn[e]);
                _torn[e] = null;
            }
        }

        /// <summary>
        /// The hanging bumper of an end leaves the body and falls as its own piece: as it was (dented, hanging), with the
        /// car's speed at that end, a little thrown off the hit. A box collider (no cooking in the crash).
        /// </summary>
        void TearBumper(int end, Vector3 worldDir)
        {
            var mats = new List<Material>();
            var t0 = Stopwatch.GetTimestamp();
            var mesh = _deformer.TearOff(end == 0 ? 1f : -1f, mats);
            TearDetail = $"cut {(Stopwatch.GetTimestamp() - t0) * 1000.0 / Stopwatch.Frequency:F2} ms";
            if (mesh == null) return;
            var body = _deformer.Body;
            var go = TornBody(end);
            _tornBody[end] = null; // it is in the world now; repair or its life's end destroys it, a new one is made
            go.transform.SetPositionAndRotation(body.position, body.rotation);
            go.transform.localScale = body.lossyScale;
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            go.GetComponent<MeshRenderer>().sharedMaterials = mats.ToArray();
            var b = mesh.bounds;
            var col = go.GetComponent<BoxCollider>();
            col.center = b.center;
            col.size = Vector3.Max(b.size, Vector3.one * 0.08f);
            go.SetActive(true);
            var rb = go.GetComponent<Rigidbody>();
            var at = go.transform.TransformPoint(b.center);
            rb.linearVelocity = _car.Body.GetPointVelocity(at) * 0.8f + worldDir * 1.5f + Vector3.up * 1.5f;
            rb.angularVelocity = transform.right * 2f;
            _torn[end] = go;
            _tornAt[end] = Time.time;
        }

        bool TryBind()
        {
            if (_bound || _car == null || _s == null) return _bound;
            _visuals = GetComponent<VehicleVisuals>();
            if (_visuals == null || _visuals.BodyRoot == null) return false; // the model is still on its way (PendingModel)
            _deformer = new CarBodyDeformer(_visuals.BodyRoot, t => t.name.StartsWith("steering_wheel") || t.name.StartsWith("driver"));
            var shell = _deformer.Shell;
            if (shell != null)
            {
                var mats = shell.filter.GetComponent<MeshRenderer>().sharedMaterials;
                for (var i = 0; i < mats.Length; i++)
                {
                    if (mats[i] == null) continue;
                    var n = mats[i].name;
                    if (_paintSub < 0 && n.EndsWith("_paint")) _paintSub = i;
                    if (_glassSub < 0 && n.EndsWith("_glass")) _glassSub = i;
                }
                if (_paintSub >= 0 && mats[_paintSub].HasProperty("baseColorFactor")) _paint = mats[_paintSub].GetColor("baseColorFactor");
                // Height of the widest part of the body (where a wall touches it), from the shell's bounds.
                var b = shell.shared.bounds;
                _shoulder = b.min.y + b.size.y * 0.42f;
            }
            _marks = new DamageMarks(_deformer, _s.decalMaterial, Mathf.Max(4, Mathf.RoundToInt(_s.maxMarks * _s.EffectShare(QualitySystem.Current))));
            _fx = new DamageEffects(transform, _s);
            _bound = true;
            return true;
        }

        // ── collisions ──────────────────────────────────────────────────────

        static int _debris = -2;
        static int DebrisLayer => _debris != -2 ? _debris : _debris = LayerMask.NameToLayer(GameLayers.Debris);

        void OnCollisionEnter(Collision c) => Gather(c, true);
        void OnCollisionStay(Collision c) => Gather(c, false);

        void Gather(Collision c, bool enter)
        {
            if (_s == null || c.collider == null || c.collider.gameObject.layer == DebrisLayer || c.contactCount == 0) return;
            Pending p = null;
            foreach (var q in _pending)
                if (q.other == c.collider) { p = q; break; }
            if (p == null)
            {
                if (!enter)
                {
                    Slide(c);
                    return;
                }
                p = new Pending { other = c.collider };
                _pending.Add(p);
            }
            if (p.steps >= _s.gatherSteps) return;
            p.impulse += c.impulse;
            for (var i = 0; i < c.contactCount; i++)
            {
                var k = c.GetContact(i);
                p.pointSum += k.point;
                p.normalSum += k.normal;
                p.contacts++;
            }
            if (enter) p.relative = c.relativeVelocity;
        }

        void FixedUpdate()
        {
            if (!_bound && !TryBind()) { _pending.Clear(); _soft.Clear(); return; }
            for (var i = _pending.Count - 1; i >= 0; i--)
            {
                var p = _pending[i];
                // One crush per frame: a second wall in the same frame waits for the next (budget 2 ms a frame).
                if (_dentFrame == Time.frameCount && p.steps >= _s.gatherSteps) continue;
                p.steps++;
                if (_soft.TryGetValue(p.other, out var dv)) { p.soft = true; p.softDeltaV = dv; }
                // A thing that broke is known after one step; a wall gathers its whole impulse first.
                if (p.steps < _s.gatherSteps && !p.soft) continue;
                _pending.RemoveAt(i);
                Resolve(p);
            }
            _soft.Clear();
            HubScrape();
        }

        void Resolve(Pending p)
        {
            if (p.contacts == 0) return;
            var body = _car.Body;
            var point = p.pointSum / p.contacts;
            var dir = p.impulse.sqrMagnitude > 1e-6f ? p.impulse.normalized : p.normalSum.normalized;
            // Into the car, whatever sign convention the contact pair had.
            if (Vector3.Dot(dir, body.worldCenterOfMass - point) < 0f) dir = -dir;
            var deltaV = p.soft ? p.softDeltaV : p.impulse.magnitude / Mathf.Max(1f, body.mass);
            // A landing on the floor pan is not a crash.
            if (transform.InverseTransformDirection(dir).y > 0.6f) deltaV *= _s.undersideShare;
            var tangent = p.relative - dir * Vector3.Dot(p.relative, dir);
            // The thing may be gone by now (a place streamed out, a broken prop): then it counts as wide.
            var half = p.other != null ? HalfWidth(p.other, dir) : 10f;
            _other = p.other;
            Take(point, dir, deltaV, half, tangent, p.soft);
            _other = null;
        }

        /// <summary>How wide the thing hit is across the hit, half, m (a trunk 0.3, a wall: large).</summary>
        static float HalfWidth(Collider c, Vector3 dir)
        {
            if (c is CapsuleCollider cap) return cap.radius * Mathf.Max(Mathf.Abs(cap.transform.lossyScale.x), Mathf.Abs(cap.transform.lossyScale.z));
            if (c is SphereCollider sph) return sph.radius * Mathf.Abs(sph.transform.lossyScale.x);
            var e = c.bounds.extents;
            // Across the hit direction in the horizontal plane, or the height for a hit from above or below.
            var across = Vector3.Cross(Vector3.up, dir);
            if (across.sqrMagnitude < 0.1f) return Mathf.Min(e.x, e.z);
            across.Normalize();
            return Mathf.Abs(across.x) * e.x + Mathf.Abs(across.z) * e.z;
        }

        /// <summary>
        /// One hit at a world point, pushing the car along <paramref name="dir"/> (into it), of <paramref name="deltaV"/> m/s
        /// against something <paramref name="halfWidth"/> m wide each side, sliding along <paramref name="slide"/>.
        /// </summary>
        public Impact Take(Vector3 point, Vector3 dir, float deltaV, float halfWidth, Vector3 slide, bool brokeThrough = false)
        {
            var hit = new Impact { point = point, direction = dir, deltaV = deltaV, wheelLost = -1, brokeThrough = brokeThrough, other = _other };
            if (!_bound || deltaV < _s.scuffFrom) return hit;
            _watch.Restart();
            Hits++;
            _hitFrame = Time.frameCount;
            _seed++;
            var bodyT = _deformer.Body;
            var bp = bodyT.InverseTransformPoint(point);
            var bd = bodyT.InverseTransformDirection(dir).normalized;
            var along = slide.sqrMagnitude > 0.25f ? bodyT.InverseTransformDirection(slide) : Vector3.Cross(bd, Vector3.up);
            var radius = _s.Radius(deltaV, halfWidth);
            var shell = _deformer.Shell;
            var plane = float.NaN;
            var knee = 0.03f;
            if (deltaV >= _s.dentFrom)
            {
                var depth = _depth = Mathf.Min(_s.maxDepth, _s.Depth(deltaV) * _s.Narrow(halfWidth));
                knee = CarBodyDeformer.Knee(depth);
                var dent = new CarBodyDeformer.Dent { point = bp, dir = bd, depth = depth, radius = radius, crumple = _s.crumple, seed = _seed };
                // The crush plane now; the vertices move over the next frames within the frame budget (a crash crumples
                // over ~0.1 s anyway).
                plane = _deformer.Enqueue(dent, _s.maxDisplacement);
                if (!float.IsNaN(plane)) hit.dent = depth;
                // A hard hit square on an end leaves that bumper hanging down at the side it was hit; the next one tears it
                // off (cut out in the next frame: searching the body's faces would cost the hit's frame ~1 ms).
                var endIndex = bd.z < 0f ? 0 : 1;
                if (!float.IsNaN(plane) && deltaV >= _s.tearFrom && Mathf.Abs(bd.z) > 0.7f && _drooped[endIndex] && _torn[endIndex] == null
                    && !TearQueued(endIndex))
                {
                    _tearQueue.Enqueue((endIndex, dir));
                    hit.bumperOff = true;
                }
                else if (!float.IsNaN(plane) && deltaV >= _s.droopFrom && Mathf.Abs(bd.z) > 0.7f && !_drooped[bd.z < 0f ? 0 : 1])
                {
                    _drooped[bd.z < 0f ? 0 : 1] = true;
                    var side = Mathf.Abs(bp.x) > 0.15f ? Mathf.Sign(bp.x) : ((_seed & 1) == 0 ? 1f : -1f); // torn off its clips where it was hit
                    _deformer.EnqueueDroop(bd.z < 0f ? 1f : -1f, side, Mathf.Min(_s.droopMax, 0.06f + (deltaV - _s.droopFrom) * 0.02f), _s.maxDisplacement);
                    hit.bumperHangs = true;
                }
                _dentFrame = Time.frameCount;
            }
            var tDent = _watch.Elapsed.TotalMilliseconds;
            _tGlass = tDent;
            // The paint at the hit: streaks from a graze, crumpled paint from a dent.
            var tile = deltaV >= _s.dentFrom * 1.6f ? DamageMarks.Tile.Scuff : (_seed & 1) == 0 ? DamageMarks.Tile.Scratch : DamageMarks.Tile.Scratch2;
            if (shell != null && _paintSub >= 0)
            {
                var markAt = bp;
                if (Mathf.Abs(bd.y) < 0.6f) markAt.y = Mathf.Max(markAt.y, _shoulder * 0.85f); // from the box's low corner up onto the paint
                // Painted on in a following frame (searching the paint's ~8 000 faces cost ~0.5–2 ms in the hit's frame).
                _markQueue.Enqueue((markAt, bd, along, Mathf.Clamp(radius * 0.85f, 0.25f, 0.6f), tile));
                hit.scratched = true;
            }
            if (shell != null && _glassSub >= 0 && deltaV >= _s.glassCrackDeltaV)
            {
                var crack = deltaV >= _s.glassBreakDeltaV ? DamageMarks.Tile.Shatter : (_seed & 1) == 0 ? DamageMarks.Tile.Crack : DamageMarks.Tile.Crack2;
                hit.glassCracked = _marks.Add(shell, _glassSub, bp, bd, along, Mathf.Clamp(radius * 0.9f, 0.35f, 0.7f), crack);
                _tGlass = _watch.Elapsed.TotalMilliseconds;
                if (hit.glassCracked && deltaV >= _s.glassBreakDeltaV)
                    hit.glassBroke = _deformer.RemoveTriangles(shell, _glassSub, bp + bd * 0.05f, radius * 0.55f) > 0;
            }
            if (shell != null && _glassSub >= 0 && deltaV >= _s.windscreenCrackDeltaV) CrackScreen(ref hit, dir, deltaV);
            var tMarks = _watch.Elapsed.TotalMilliseconds;
            if (!float.IsNaN(plane)) Wheels(ref hit, bp, bd, plane, knee, radius, deltaV, dir);
            Fly(hit, point, dir, deltaV, slide);
            var total = (float)_watch.Elapsed.TotalMilliseconds;
            LastHitMs = total;
            if (total > WorstHitMs)
            {
                WorstHitMs = total;
                WorstDetail = $"Δv {deltaV:F1}: {_deformer.Timing}, marks {tMarks - tDent:F2} (crack {_tGlass - tDent:F2}: {_marks.LastAdd}), wheels+fx {total - tMarks:F2} ms";
            }
            Last = hit;
            Impacted?.Invoke(hit);
            return hit;
        }

        /// <summary>
        /// A hard hit square on the nose cracks the windscreen (on the tail the rear window): the crush runs back through
        /// the body into the pane, far from the bumper where the hit's own crack lies.
        /// </summary>
        void CrackScreen(ref Impact hit, Vector3 worldDir, float deltaV)
        {
            var along = Vector3.Dot(worldDir, _car.transform.forward);
            if (Mathf.Abs(along) < 0.7f) return;
            var end = along < 0f ? 0 : 1; // pushed backwards = hit on the nose
            FindScreens();
            if (_screenOut[end] == Vector3.zero) return;
            var bodyT = _deformer.Body;
            var right = bodyT.InverseTransformDirection(_car.transform.right);
            var tile = deltaV >= _s.windscreenShatterDeltaV ? DamageMarks.Tile.Shatter : (_seed & 1) == 0 ? DamageMarks.Tile.Crack : DamageMarks.Tile.Crack2;
            var radius = Mathf.Lerp(0.42f, 0.7f, Mathf.InverseLerp(_s.windscreenCrackDeltaV, _s.windscreenShatterDeltaV, deltaV));
            // A little off centre, like a real stone or crush point; the pane stays in (laminated glass).
            var at = _screenAt[end] + right * ((_seed % 5 - 2) * 0.08f);
            if (!_marks.Add(_deformer.Shell, _glassSub, at, -_screenOut[end], right, radius, tile)) return;
            hit.screenCracked = true;
            hit.glassCracked = true;
            ScreenCracks++;
            _fx.Bits(bodyT.TransformPoint(at), bodyT.TransformDirection(_screenOut[end]), 8, _s.glassColor, Color.white, 0.02f);
        }

        /// <summary>Windscreen and rear window: glass faces high on the body looking forward (back) and up, area-weighted.</summary>
        void FindScreens()
        {
            if (_screensFound) return;
            _screensFound = true;
            var shell = _deformer.Shell;
            _deformer.Prepare(shell);
            if (_glassSub >= shell.subMeshes.Length) return;
            var bodyT = _deformer.Body;
            var toBody = _deformer.PartToBody(shell);
            var fwd = bodyT.InverseTransformDirection(_car.transform.forward);
            var up = bodyT.InverseTransformDirection(_car.transform.up);
            // Height range of the whole shell along the car's up: the panes sit in its upper half, the lamp lenses below.
            float lo = float.MaxValue, hi = float.MinValue;
            foreach (var v in shell.rest)
            {
                var h = Vector3.Dot(toBody.MultiplyPoint3x4(v), up);
                lo = Mathf.Min(lo, h);
                hi = Mathf.Max(hi, h);
            }
            var minH = lo + (hi - lo) * 0.55f;
            var sum = new Vector3[2];
            var nSum = new Vector3[2];
            var area = new float[2];
            var info = shell.subMeshes[_glassSub];
            for (var k = info.indexStart; k < info.indexStart + info.indexCount; k += 3)
            {
                var a = toBody.MultiplyPoint3x4(shell.rest[shell.tris[k]]);
                var b = toBody.MultiplyPoint3x4(shell.rest[shell.tris[k + 1]]);
                var c = toBody.MultiplyPoint3x4(shell.rest[shell.tris[k + 2]]);
                var centre = (a + b + c) / 3f;
                if (Vector3.Dot(centre, up) < minH) continue;
                var n = Vector3.Cross(b - a, c - a);
                var twice = n.magnitude;
                if (twice < 1e-8f) continue;
                n /= twice;
                var f = Vector3.Dot(n, fwd);
                // Either winding: a pane may be modelled one-sided either way round; facing up and to an end is what counts.
                if (Vector3.Dot(n, up) < 0f) { n = -n; f = -f; }
                if (Vector3.Dot(n, up) < 0.15f || Mathf.Abs(f) < 0.3f) continue;
                var end = f > 0f ? 0 : 1;
                sum[end] += centre * twice;
                nSum[end] += n * twice;
                area[end] += twice;
            }
            for (var e = 0; e < 2; e++)
            {
                if (area[e] <= 0f) continue;
                _screenAt[e] = sum[e] / area[e];
                _screenOut[e] = nSum[e].normalized;
            }
        }

        /// <summary>Windscreen / rear-window cracks since the last repair.</summary>
        public int ScreenCracks { get; private set; }

        /// <summary>Windscreen (0) / rear window (1) centre in body space, or null (tests, tools).</summary>
        public Vector3? ScreenCentre(int end)
        {
            if (!_bound) return null;
            FindScreens();
            return _screenOut[end] == Vector3.zero ? null : _screenAt[end];
        }

        void Wheels(ref Impact hit, Vector3 bp, Vector3 bd, float plane, float knee, float radius, float deltaV, Vector3 worldDir)
        {
            var bodyT = _deformer.Body;
            var def = _car.Definition;
            for (var i = 0; i < VehicleController.WheelCount; i++)
            {
                if (_lost[i]) continue;
                var centre = bodyT.InverseTransformPoint(transform.TransformPoint(_car.Wheels[i].local));
                // The edge of the tyre that faces the hit: once the crush reaches it, the wheel takes the blow.
                var q = centre - bd * (def.wheelRadius * 0.95f);
                var o = q - bp;
                var d = Vector3.Dot(o, bd);
                var lat = (o - bd * d).magnitude;
                var push = CarBodyDeformer.Field(d, lat, plane, knee, radius, CarBodyDeformer.MaxPush(_depth));
                if (push < 0.005f) continue;
                _bend[i] += push;
                if (_bend[i] >= _s.wheelOffPush && deltaV >= _s.wheelOffDeltaV)
                {
                    LoseWheel(i, worldDir);
                    hit.wheelLost = i;
                    UpdatePull();
                    continue;
                }
                if (_bend[i] >= _s.wheelBendPush)
                {
                    hit.wheelsBent++;
                    _visuals.SetWobble(i, Mathf.Min(_s.maxWobble, _bend[i] / _s.wheelOffPush * _s.maxWobble));
                }
            }
            UpdatePull();
        }

        void UpdatePull()
        {
            var pull = 0f;
            for (var i = 0; i < VehicleController.WheelCount; i++)
            {
                // A lost wheel drags its hub: the arcade yaw model would cancel the drag's turn, so it pulls through the steering.
                if (_lost[i])
                {
                    pull += Mathf.Sign(_car.Wheels[i].local.x) * _s.lostWheelPull * (i < 2 ? 1f : 0.5f);
                    continue;
                }
                if (_bend[i] < _s.wheelBendPush) continue;
                // Towards the bent side; a rear wheel steers the car half as much.
                var side = Mathf.Sign(_car.Wheels[i].local.x);
                pull += side * _bend[i] * _s.pullPerBend * (i < 2 ? 1f : 0.5f);
            }
            _car.SteerBias = Mathf.Clamp(pull, -_s.maxPull - _s.lostWheelPull, _s.maxPull + _s.lostWheelPull);
        }

        void LoseWheel(int i, Vector3 worldDir)
        {
            var wheel = _visuals.Detach(i);
            _lost[i] = true;
            _car.SetWheelMissing(i, true, _s.hubRadius, _s.hubFriction);
            if (wheel == null) return;
            var go = LooseBody(i);
            go.transform.SetPositionAndRotation(wheel.position, wheel.rotation);
            wheel.SetParent(go.transform, true);
            go.SetActive(true);
            var rb = go.GetComponent<Rigidbody>();
            rb.isKinematic = false;
            // It keeps the car's speed at that corner, is thrown off the hit and spins on.
            var side = transform.right * Mathf.Sign(_car.Wheels[i].local.x);
            rb.linearVelocity = _car.Body.GetPointVelocity(wheel.position) * 0.85f + (worldDir * 2.5f + side * 2f + Vector3.up * 2.5f);
            rb.angularVelocity = transform.right * (_car.Telemetry.forwardSpeed / Mathf.Max(0.1f, _car.Definition.wheelRadius));
            _looseAt[i] = Time.time;
        }

        /// <summary>
        /// The body a torn-off wheel rolls on: made ahead (collider cooking cost ~1 ms in the crash), kept inactive outside the
        /// car so it does not follow it.
        /// </summary>
        GameObject LooseBody(int i)
        {
            if (_loose[i] != null) return _loose[i];
            var go = new GameObject("LooseWheel");
            go.SetActive(false);
            go.layer = DebrisLayer;
            var col = go.AddComponent<MeshCollider>();
            col.sharedMesh = WheelHull(_car.Definition.wheelRadius, 0.22f);
            col.convex = true;
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = _s.looseWheelMass;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.angularDamping = 0.2f;
            _looseBody[i] = rb;
            return _loose[i] = go;
        }

        static Mesh _hull;
        static float _hullRadius;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => _hull = null;

        /// <summary>A 12-sided cylinder along X for the loose wheel's convex collider (it rolls).</summary>
        static Mesh WheelHull(float radius, float width)
        {
            if (_hull != null && Mathf.Approximately(_hullRadius, radius)) return _hull;
            const int n = 12;
            var v = new Vector3[n * 2];
            for (var k = 0; k < n; k++)
            {
                var a = k * Mathf.PI * 2f / n;
                v[k] = new Vector3(-width * 0.5f, Mathf.Cos(a) * radius, Mathf.Sin(a) * radius);
                v[k + n] = new Vector3(width * 0.5f, Mathf.Cos(a) * radius, Mathf.Sin(a) * radius);
            }
            var t = new List<int>();
            for (var k = 0; k < n; k++)
            {
                int a = k, b = (k + 1) % n;
                t.AddRange(new[] { a, b, a + n, b, b + n, a + n });
            }
            for (var k = 1; k < n - 1; k++) t.AddRange(new[] { 0, k + 1, k, n, n + k, n + k + 1 });
            _hull = new Mesh { name = "WheelHull", vertices = v, triangles = t.ToArray() };
            _hullRadius = radius;
            return _hull;
        }

        void Fly(in Impact hit, Vector3 point, Vector3 dir, float deltaV, Vector3 slide)
        {
            // The thing hit is on the far side of the contact: sparks and bits spray up and back off it, along any slide.
            var sl = slide.sqrMagnitude > 1f ? slide.normalized * 0.4f : Vector3.zero;
            var outward = (dir * 0.45f + Vector3.up * 0.8f - sl).normalized;
            var sparks = Mathf.RoundToInt(Mathf.Min(60f, deltaV * _s.sparksPerDeltaV));
            _fx.Sparks(point, outward, sparks, 3f + deltaV * 0.35f);
            if (deltaV >= _s.dentFrom)
            {
                var bits = Mathf.RoundToInt(Mathf.Min(40f, (deltaV - _s.dentFrom) * _s.bitsPerDeltaV));
                _fx.Bits(point, outward, bits, _paint, _s.plasticColor, 0.07f);
            }
            if (hit.glassBroke) _fx.Bits(point + Vector3.up * 0.4f, outward, 28, _s.glassColor, Color.white, 0.035f);
            else if (hit.glassCracked) _fx.Bits(point + Vector3.up * 0.3f, outward, 6, _s.glassColor, Color.white, 0.025f);
            if (hit.wheelLost >= 0) _fx.Sparks(point, outward, 30, 7f);
        }

        /// <summary>Sliding along a wall or a rail: sparks, and a scratch mark every so many metres.</summary>
        void Slide(Collision c)
        {
            if (!_bound) return;
            var k = c.GetContact(0);
            // The car's own motion along the surface at the contact (the collision's relative velocity has no fixed sign).
            var rel = _car.Body.GetPointVelocity(k.point) - (c.rigidbody != null ? c.rigidbody.GetPointVelocity(k.point) : Vector3.zero);
            var slide = rel - k.normal * Vector3.Dot(rel, k.normal);
            var speed = slide.magnitude;
            if (speed < _s.scrapeSpeed) return;
            Scrape = Mathf.Max(Scrape, Mathf.Clamp01(speed / 25f));
            var outward = k.normal;
            if (Vector3.Dot(outward, _car.Body.worldCenterOfMass - k.point) > 0f) outward = -outward;
            // Off the wall, trailing behind the slide (the wall's side of the contact would swallow them).
            var spray = (-slide / speed + Vector3.up * 0.35f - outward * 0.35f).normalized;
            _fx.Sparks(k.point, spray, Mathf.Max(1, Mathf.RoundToInt(speed * 0.15f)), 2f + speed * 0.25f);
            _slid.TryGetValue(c.collider, out var metres);
            metres += speed * Time.fixedDeltaTime;
            // The floor pan on the road (a landing, a kerb) throws sparks but leaves no mark on the paint.
            var underneath = transform.InverseTransformDirection(outward).y < -0.6f;
            if (metres >= _s.scratchEvery && !underneath)
            {
                metres = 0f;
                var shell = _deformer.Shell;
                if (shell != null && _paintSub >= 0)
                {
                    var bodyT = _deformer.Body;
                    // The physics box touches with its corners (low, at the sill); a wall scrapes the widest part of the
                    // body — the shoulder line — so the mark goes there.
                    // Along the side between the box's touching corners — a scrape marks the whole flank, not two ends.
                    var lo = float.MaxValue;
                    var hi = float.MinValue;
                    for (var i = 0; i < c.contactCount; i++)
                    {
                        var z = bodyT.InverseTransformPoint(c.GetContact(i).point).z;
                        lo = Mathf.Min(lo, z);
                        hi = Mathf.Max(hi, z);
                    }
                    var at = bodyT.InverseTransformPoint(k.point);
                    _spread = (_spread + 0.618034f) % 1f;
                    at.z = Mathf.Lerp(lo, hi, _spread);
                    at.y = Mathf.Max(at.y, _shoulder);
                    if (_markQueue.Count < 4)
                        _markQueue.Enqueue((at, bodyT.InverseTransformDirection(-outward), bodyT.InverseTransformDirection(slide), 0.38f,
                            (_seed++ & 1) == 0 ? DamageMarks.Tile.Scratch : DamageMarks.Tile.Scratch2));
                }
            }
            _slid[c.collider] = metres;
        }

        /// <summary>A lost wheel's hub grinding on the road throws sparks and is heard.</summary>
        void HubScrape()
        {
            var scrape = 0f;
            for (var i = 0; i < VehicleController.WheelCount; i++)
            {
                if (!_lost[i]) continue;
                var w = _car.Wheels[i];
                if (!w.grounded) continue;
                var v = _car.Body.GetPointVelocity(w.contact);
                var speed = Vector3.ProjectOnPlane(v, w.normal).magnitude;
                if (speed < 1.5f) continue;
                scrape = Mathf.Max(scrape, Mathf.Clamp01(speed / 20f));
                if (Time.frameCount % 2 == 0)
                    _fx.Sparks(w.contact + w.normal * 0.03f, w.normal * 0.3f - v.normalized, Mathf.Max(1, Mathf.RoundToInt(speed * 0.18f)), 2f + speed * 0.12f);
            }
            // Wall scrapes set it in Slide during the last step; it decays when nothing grinds.
            Scrape = Mathf.Max(scrape, Scrape * 0.8f);
        }

        void Update()
        {
            if (_bound && _markQueue.Count > 0 && Time.frameCount != _hitFrame)
            {
                var m = _markQueue.Dequeue();
                _marks.Add(_deformer.Shell, _paintSub, m.at, m.into, m.along, m.radius, m.tile);
            }
            else if (_bound && _deformer.Busy)
            {
                // Crumpling within the frame budget; the marks follow the sheet once it has settled.
                var budget = Time.frameCount == _dentFrame ? _s.frameBudgetMs * 0.5f : _s.frameBudgetMs;
                _deformer.Work(budget);
                if (!_deformer.Busy && _marks.Count > 0) _marks.Rebuild();
            }
            // Ahead of the first hit, one piece a frame: the body's vertices, then the marks texture.
            else if (_bound && !_marks.Warmed && !_deformer.Busy && _deformer.Shell != null && _deformer.Shell.ready && DamageMarks.AtlasReady) _marks.Warm();
            else if (_bound && _marks.Warmed && _marks.Count == 0 && _marksWarmFrame++ == 2) _marks.Rebuild(); // the empty warm-up mark goes again
            else if (_bound && !_deformer.PrepareNext() && !_deformer.CopyNext() && !DamageMarks.WarmAtlas() && !_hullBaked)
            {
                // The loose wheels' collider cooked and their bodies made now, not in the crash (~1 ms each there).
                _hullBaked = true;
                Physics.BakeMesh(WheelHull(_car.Definition.wheelRadius, 0.22f).GetEntityId(), true);
                for (var i = 0; i < _loose.Length; i++) LooseBody(i);
            }
            else if (_bound && _hullBaked && !_tearWarm && !_deformer.Busy && !_deformer.WarmTear())
            {
                _tearWarm = true;
                for (var e = 0; e < _torn.Length; e++) TornBody(e);
            }
            while (_tearQueue.Count > 0)
            {
                var (end, dir) = _tearQueue.Dequeue();
                var t0 = Stopwatch.GetTimestamp();
                TearBumper(end, dir);
                TearMs = Mathf.Max(TearMs, (float)((Stopwatch.GetTimestamp() - t0) * 1000.0 / Stopwatch.Frequency));
            }
            // Torn bumpers lie like the loose wheels, then go.
            for (var e = 0; e < _torn.Length; e++)
            {
                var go = _torn[e];
                if (go == null || Time.time - _tornAt[e] < _s.looseWheelLife) continue;
                var rb = go.GetComponent<Rigidbody>();
                if (!rb.isKinematic) rb.isKinematic = true;
                go.transform.position += Vector3.down * (0.4f * Time.deltaTime);
                if (Time.time - _tornAt[e] > _s.looseWheelLife + 3f) { Destroy(go.GetComponent<MeshFilter>().sharedMesh); Destroy(go); _torn[e] = null; }
            }
            // Loose wheels lie a while, then sink away (they come back on repair anyway).
            for (var i = 0; i < _loose.Length; i++)
            {
                var go = _loose[i];
                if (go == null || !go.activeSelf || Time.time - _looseAt[i] < _s.looseWheelLife) continue;
                var rb = _looseBody[i];
                if (!rb.isKinematic) rb.isKinematic = true;
                go.transform.position += Vector3.down * (0.4f * Time.deltaTime);
                if (Time.time - _looseAt[i] > _s.looseWheelLife + 3f) go.SetActive(false);
            }
        }

        /// <summary>Forget the measured costs (a test warms up first: the editor compiles code on first use).</summary>
        public void ResetCost()
        {
            WorstHitMs = 0f;
            WorstDetail = "";
            _deformer?.ResetCost();
        }

        /// <summary>Every queued crush done now, normals and marks too (tests).</summary>
        public void FinishNow()
        {
            if (!_bound) return;
            while (_markQueue.Count > 0)
            {
                var m = _markQueue.Dequeue();
                _marks.Add(_deformer.Shell, _paintSub, m.at, m.into, m.along, m.radius, m.tile);
            }
            if (!_deformer.Busy) return;
            _deformer.Finish();
            if (_marks.Count > 0) _marks.Rebuild();
        }

        /// <summary>Longest frame of crumpling (vertices, normals, upload), ms — budget 2 ms with the hit itself.</summary>
        public float WorstWorkMs => _deformer != null ? _deformer.WorstWorkMs : 0f;

        /// <summary>Good as new: body, glass, marks, wheels back on, no pull.</summary>
        public void Repair()
        {
            _pending.Clear();
            _soft.Clear();
            _slid.Clear();
            _markQueue.Clear();
            _drooped[0] = _drooped[1] = false;
            DropTorn();
            _tearWarm = false; // the used bodies are made again in idle frames
            ScreenCracks = 0;
            Scrape = 0f;
            if (_bound)
            {
                _deformer.Restore();
                _marks.Clear();
            }
            for (var i = 0; i < VehicleController.WheelCount; i++)
            {
                _bend[i] = 0f;
                if (_visuals != null) _visuals.SetWobble(i, 0f);
                if (!_lost[i]) continue;
                _lost[i] = false;
                _car.SetWheelMissing(i, false);
                if (_visuals != null) _visuals.Reattach(i);
                if (_loose[i] != null)
                {
                    _loose[i].SetActive(false);
                    _loose[i].GetComponent<Rigidbody>().isKinematic = false;
                }
            }
            if (_car != null) _car.SteerBias = 0f;
            Repaired?.Invoke();
        }
    }
}
