using System.Collections.Generic;
using System.Diagnostics;
using JapanMap.Core;
using JapanMap.World;
using UnityEngine;

namespace JapanMap.Gameplay.Smash
{
    /// <summary>
    /// Finds the breakable objects once at start (by name, <see cref="BreakableSettings"/>), breaks
    /// them on a hard enough hit and runs the debris: a recycled pool of box pieces with plain
    /// Rigidbodies, on the Debris layer, sinking away after their life. Broken objects come back when
    /// the player is far and they have been down a while. PROVISIONAL pieces: boxes cut from the
    /// object's collider, coloured by kind — pre-split meshes are on the asset list.
    /// </summary>
    public sealed class SmashSystem : MonoBehaviour
    {
        [SerializeField] BreakableSettings settings;
        [SerializeField] PlayerModeController player;
        [Tooltip("Lit material the debris palette is made from.")]
        [SerializeField] Material template;
        [Tooltip("Roots searched for breakable objects.")]
        [SerializeField] string[] roots = { "World/Places", "World/Props" };

        readonly List<Breakable> _all = new();
        readonly List<Piece> _pieces = new();
        int _nextPiece, _breaksThisStep, _stepFrame = -1;
        Mesh _cube;
        StandInPalette _palette;
        readonly Stopwatch _watch = new();

        sealed class Piece
        {
            public Rigidbody body;
            public MeshRenderer renderer;
            public MeshFilter filter;
            public BoxCollider collider;
            public float bornAt;
        }

        public IReadOnlyList<Breakable> Breakables => _all;
        public int Breaks { get; private set; }
        /// <summary>Longest single break (hide, pieces, car), ms — the cost the PLAN asks to measure.</summary>
        public float WorstBreakMs { get; private set; }
        /// <summary>Whole broken objects (trees, posts, machines) currently falling or lying.</summary>
        public int LiveChunks { get { var n = 0; foreach (var c in _chunks) if (c.go.activeSelf) n++; return n; } }
        public int LivePieces { get { var n = 0; foreach (var p in _pieces) if (p.body.gameObject.activeSelf) n++; return n; } }

        readonly List<(InstanceRenderer renderer, int index, float at, Vector3 position)> _trees = new();

        public int TreesBroken { get; private set; }
        /// <summary>Where the worst break's time went (diagnostics).</summary>
        public string WorstDetail { get; private set; } = "";

        /// <summary>Something broke: kind name ("tree", "post", "fence", …), where, and the impact speed (sound).</summary>
        public static event System.Action<string, Vector3, float> Broke;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetBroke() => Broke = null;

        void OnEnable() => InstanceCollider.Hit += OnInstanceHit;
        void OnDisable() => InstanceCollider.Hit -= OnInstanceHit;

        // Start() changes state that outlives this system (a static cutter hook, the global physics matrix).
        // Undo it on destroy, not disable: Start runs only once, so a re-enabled system would lose its setup.
        void OnDestroy()
        {
            if (MeshCutter.InUse != null && ReferenceEquals(MeshCutter.InUse.Target, this)) MeshCutter.InUse = null;
            var debris = GameLayers.Layer(GameLayers.Debris);
            foreach (var other in new[] { GameLayers.Vehicle, GameLayers.Walker, GameLayers.Pedestrian })
                Physics.IgnoreLayerCollision(debris, GameLayers.Layer(other), false);
        }

        void OnInstanceHit(InstanceRenderer r, int index, Collision c)
        {
            var body = c.rigidbody;
            if (body == null || !IsPlayerCar(body) || r.IsHidden(index)) return;
            var kind = settings.tree;
            var rel = c.relativeVelocity;
            var n = c.contactCount > 0 ? c.GetContact(0).normal : -rel.normalized;
            if (!Breakable.ShouldBreak(body.mass, Mathf.Abs(Vector3.Dot(rel, n)), kind.minSpeed, kind.energy)) return;
            if (!TakeBreakSlot()) return;
            _watch.Restart();
            var trunk = c.GetContact(0).thisCollider as CapsuleCollider;
            var h = trunk != null ? trunk.height : 4f;
            var radius = trunk != null ? trunk.radius : 0.35f;
            var at = r.data.positions[index];
            r.SetHidden(index, true);
            // The car felt a share of it: a trunk at speed leaves a deep fold (D47).
            JapanMap.Vehicles.VehicleDamage.Soften(body, c.GetContact(0).thisCollider, Mathf.Abs(Vector3.Dot(rel, n)) * kind.carDamage);
            _trees.Add((r, index, Time.time, at));
            Breaks++;
            TreesBroken++;
            Broke?.Invoke("tree", at, rel.magnitude);
            var carVelocity = body.linearVelocity;
            GiveSpeedBack(body, kind.carLoss);
            // The trunk snaps where the bumper met it: a splintered stump stays, the top falls the way the car pushed it,
            // rolling over its crown (D47; before: the whole tree tipped over from the foot).
            if (r.TryGetVisual(index, out var mesh, out var mat, out var m))
            {
                var push = Flat(carVelocity);
                if (push.sqrMagnitude < 0.01f) push = Flat(-n);
                push.Normalize();
                var pos = (Vector3)m.GetColumn(3);
                var scale = m.lossyScale;
                var hitY = c.contactCount > 0 ? c.GetContact(0).point.y - pos.y : 0.5f;
                // Two heights only (a low bumper, a tall one): a cut tree top is nearly the whole tree, so few are kept.
                var cutAt = (hitY < 0.6f ? 0.45f : 0.75f) / Mathf.Max(0.01f, scale.y);
                var ch = NextChunk();
                if (MeshCutter.TryCut(mesh, cutAt, true, _palette.Uv(settings.freshWood), out var cut))
                {
                    var mats = new[] { mat, _palette.Material };
                    ShowStump((r, index), cut.below, mats, pos, m.rotation, scale);
                    ch.Show(cut.above, mats, pos + Vector3.up * 0.03f, m.rotation, scale, settings.chunkLife);
                    ch.Capsule(radius * 1.4f, h, cut.height * scale.y);
                    // The crown is what it lands on.
                    var crown = cut.above.bounds;
                    ch.Crown(crown.center + Vector3.up * crown.extents.y * 0.25f, Mathf.Min(crown.extents.x, crown.extents.z) * 0.55f);
                }
                else
                {
                    ch.Show(mesh, new[] { mat }, pos + Vector3.up * 0.15f, m.rotation, scale, settings.chunkLife);
                    ch.Capsule(radius * 1.4f, h);
                }
                ch.body.mass = kind.mass;
                ch.body.linearVelocity = push * Mathf.Min(4f, carVelocity.magnitude * 0.12f);
                // Tip axis: horizontal, across the push; a little random twist so a row of trees does not fall alike.
                ch.body.angularVelocity = Vector3.Cross(Vector3.up, push) * settings.treeTip * Random.Range(0.8f, 1.25f) + Vector3.up * Random.Range(-0.3f, 0.3f);
            }
            // Splinters at the foot, leaves from the crown, dust — next frame.
            _later.Add((kind, new Bounds(at + Vector3.up * (h * 0.5f), new Vector3(radius * 2f, h, radius * 2f)), carVelocity * 0.5f, true));
            WorstBreakMs = Mathf.Max(WorstBreakMs, (float)_watch.Elapsed.TotalMilliseconds);
        }

        bool TakeBreakSlot()
        {
            if (Time.frameCount != _stepFrame)
            {
                _stepFrame = Time.frameCount;
                _breaksThisStep = 0;
            }
            if (_breaksThisStep >= settings.maxBreaksPerStep) return false;
            _breaksThisStep++;
            return true;
        }

        // The static collider already stopped the car this step; give the speed back, minus the loss.
        static void GiveSpeedBack(Rigidbody car, float loss)
        {
            var vc = car.GetComponent<JapanMap.Vehicles.VehicleController>();
            if (vc == null) return;
            var before = vc.VelocityBeforeStep;
            var speed = before.magnitude;
            if (speed > 0.1f) car.linearVelocity = before * (Mathf.Max(0f, speed - loss) / speed);
        }

        void Start()
        {
            _palette = StandInPalette.For(template);
            // Debris is born inside the car that broke it; it must never become a new roadblock
            // (legacy SmashField). It falls on the world, not on cars, walkers or pedestrians.
            var debris = GameLayers.Layer(GameLayers.Debris);
            foreach (var other in new[] { GameLayers.Vehicle, GameLayers.Walker, GameLayers.Pedestrian })
                Physics.IgnoreLayerCollision(debris, GameLayers.Layer(other), true);
            var watch = Stopwatch.StartNew();
            foreach (var path in roots)
            {
                var root = GameObject.Find(path);
                if (root != null) Scan(root);
            }
            // Pool and meshes now, not on the first hit (first break cost 2.1 ms creating them).
            foreach (var k in settings.kinds) CubeWithUv(_palette.Uv(k.color));
            for (var i = 0; i < settings.maxPieces; i++) CreatePiece();
            for (var i = 0; i < settings.maxChunks; i++) CreateChunk();
            CreatePuff();
            // Warm up once (the first throw cost 1 ms more than the next: PhysX actor, renderer, particle buffers).
            var warm = CubeWithUv(_palette.Uv(Color.grey));
            foreach (var c in _chunks)
            {
                c.Show(warm, new[] { _palette.Material }, new Vector3(0f, -500f, 0f), Quaternion.identity, Vector3.one, 0f);
                c.Box();
                c.go.SetActive(false);
            }
            // Stumps made now, and the hinge path run once (the first kinked lamp paid ~3 ms for them).
            for (var i = 0; i < settings.maxStumps; i++) NewStump();
            var first = _chunks[0];
            first.Show(warm, new[] { _palette.Material }, new Vector3(0f, -500f, 0f), Quaternion.identity, Vector3.one, 0f);
            first.Hinge(new Vector3(0f, -500f, 0f), Vector3.right, 80f);
            first.Crown(Vector3.zero, 0.5f);
            first.Show(warm, new[] { _palette.Material }, new Vector3(0f, -500f, 0f), Quaternion.identity, Vector3.one, 0f);
            first.go.SetActive(false);
            MeshCutter.InUse = MeshShown;
            QueueKinkCuts();
            if (_puff != null) { _puff.Emit(new ParticleSystem.EmitParams { position = new Vector3(0f, -500f, 0f) }, 1); _puff.Clear(); }
            MeshCutter.Warm();
            UnityEngine.Debug.Log($"[Smash] {_all.Count} breakables in {watch.ElapsedMilliseconds} ms");
        }

        /// <summary>Makes everything breakable under <paramref name="root"/> — at start, and for a place streamed in later (D36).</summary>
        public int Scan(GameObject root)
        {
            var before = _all.Count;
            foreach (Transform child in root.GetComponentsInChildren<Transform>(true))
            {
                if (child.GetComponent<Collider>() == null && child.GetComponentInChildren<Collider>() == null) continue;
                var kind = settings.Find(child.name);
                if (kind == null) continue;
                // The breakable sits on the outermost object of that name (a prefab instance with
                // collider children, or a Tokyo collider box) — not again on its children.
                if (child.parent != null && child.parent.GetComponent<Breakable>() != null) continue;
                if (child.GetComponent<Breakable>() != null) continue;
                if (IsGroup(child, kind)) continue; // "shed" holding shed_000…065: the children break, not the group
                var b = child.gameObject.AddComponent<Breakable>();
                var instances = child.parent != null && child.parent.name == "Colliders"
                    ? child.parent.parent.GetComponentInChildren<InstanceRenderer>()
                    : null;
                b.Bind(this, kind, instances);
                _all.Add(b);
            }
            return _all.Count - before;
        }

        internal bool IsPlayerCar(Rigidbody body) => player != null && player.Car != null && player.Car.Body == body;

                bool IsGroup(Transform t, BreakableSettings.Kind kind)
        {
            foreach (Transform c in t)
                if (settings.Find(c.name) == kind) return true;
            return false;
        }

        internal void Break(Breakable b, Rigidbody car, Vector3 relativeVelocity, float approach = 0f, Collider touched = null, Vector3? contact = null)
        {
            if (!TakeBreakSlot()) return;
            JapanMap.Vehicles.VehicleDamage.Soften(car, touched, approach * b.Kind.carDamage);
            _watch.Restart();
            var kind = b.Kind;
            var bounds = b.Bounds;
            b.SetBroken(true);
            Breaks++;
            Broke?.Invoke(kind.name, bounds.center, relativeVelocity.magnitude);
            var carVelocity = car.linearVelocity;
            GiveSpeedBack(car, kind.carLoss);
            var t0 = _watch.Elapsed.TotalMilliseconds;
            var pieces = VisualsOf(b);
            var tv = _watch.Elapsed.TotalMilliseconds;
            var done = kind.way switch
            {
                BreakableSettings.Way.Kink => pieces.Count > 0 && Kink(b, pieces[0], kind, approach, carVelocity, contact ?? bounds.center),
                BreakableSettings.Way.Planks => pieces.Count > 0 && Planks(pieces[0], kind, carVelocity),
                _ => false,
            };
            // A lamp's second mesh (its head, when modelled apart) goes with the falling part as a loose piece.
            if (done) for (var i = 1; i < pieces.Count; i++) Launch(NextChunk(), pieces[i].mesh, pieces[i].mats, pieces[i].pos, pieces[i].rot, pieces[i].scale, kind, carVelocity, bounds.center);
            else ThrowObject(b, kind, carVelocity, pieces);
            var t1 = _watch.Elapsed.TotalMilliseconds;
            // Chips and dust a frame later: one frame does not carry the whole break (budget 2 ms).
            _later.Add((kind, bounds, carVelocity, false));
            if (t1 > WorstBreakMs) WorstDetail = $"{kind.name}: before {t0:F2}, visuals {tv - t0:F2}, object {t1 - tv:F2} ms ({pieces.Count} meshes)";
            WorstBreakMs = Mathf.Max(WorstBreakMs, (float)_watch.Elapsed.TotalMilliseconds);
        }

        struct Visual
        {
            public Mesh mesh;
            public Material[] mats;
            public Vector3 pos, scale;
            public Quaternion rot;
        }

        readonly List<Visual> _visuals = new();

        /// <summary>
        /// What the broken thing looks like: its two biggest meshes of the nearest LOD (a lamp: pole and head; before, LOD0
        /// and LOD1 flew as two copies of the same object), or its instances' meshes.
        /// </summary>
        List<Visual> VisualsOf(Breakable b)
        {
            _visuals.Clear();
            Renderer first = null, second = null;
            float firstSize = 0f, secondSize = 0f;
            foreach (var r in b.Renderers)
            {
                if (r == null || !(r is MeshRenderer) || !r.TryGetComponent<MeshFilter>(out var f) || f.sharedMesh == null) continue;
                if (IsFarLod(r)) continue;
                var size = r.bounds.size.sqrMagnitude;
                if (size > firstSize) { second = first; secondSize = firstSize; first = r; firstSize = size; }
                else if (size > secondSize) { second = r; secondSize = size; }
            }
            foreach (var r in new[] { first, second })
            {
                if (r == null) continue;
                var t = r.transform;
                _visuals.Add(new Visual { mesh = r.GetComponent<MeshFilter>().sharedMesh, mats = r.sharedMaterials, pos = t.position, rot = t.rotation, scale = t.lossyScale });
            }
            if (_visuals.Count == 0 && b.Instances != null)
                foreach (var id in b.InstanceIds)
                {
                    if (_visuals.Count >= 2) break;
                    if (!b.Instances.TryGetVisual(id, out var mesh, out var mat, out var m)) continue;
                    _visuals.Add(new Visual { mesh = mesh, mats = new[] { mat }, pos = m.GetColumn(3), rot = m.rotation, scale = m.lossyScale });
                }
            return _visuals;
        }

        /// <summary>A renderer of LOD 1 or further (by its LOD group, or the library's "_LODn" names).</summary>
        static bool IsFarLod(Renderer r)
        {
            var group = r.GetComponentInParent<LODGroup>();
            if (group != null)
            {
                var lods = group.GetLODs();
                for (var i = 1; i < lods.Length; i++)
                    foreach (var x in lods[i].renderers)
                        if (x == r) return true;
                return false;
            }
            var n = r.name;
            var at = n.LastIndexOf("_LOD", System.StringComparison.Ordinal);
            return at >= 0 && at + 4 < n.Length && n[at + 4] != '0';
        }

        /// <summary>The broken object flies as itself: each of its meshes becomes a loose body with the car's momentum, a hop and a tumble.</summary>
        void ThrowObject(Breakable b, BreakableSettings.Kind kind, Vector3 carVelocity, List<Visual> pieces)
        {
            foreach (var v in pieces) Launch(NextChunk(), v.mesh, v.mats, v.pos, v.rot, v.scale, kind, carVelocity, b.Bounds.center);
            // Nothing to show (a bare collider): fall back to the old blocks, smaller.
            if (pieces.Count == 0) SpawnPieces(kind, b.Bounds, b.Rotation, carVelocity);
        }

        /// <summary>
        /// A post hit by a bumper: it kinks there — the stub stays, the rest folds over on a hinge the way the car went
        /// and hangs. Hit harder than <see cref="BreakableSettings.kinkUntil"/>, it snaps off at the kink and flies.
        /// </summary>
        bool Kink(Breakable b, Visual v, BreakableSettings.Kind kind, float approach, Vector3 carVelocity, Vector3 contact)
        {
            var hitY = contact.y - v.pos.y;
            var at = Mathf.Clamp(hitY, settings.breakHeight.x, settings.breakHeight.y) / Mathf.Max(0.01f, v.scale.y);
            if (!MeshCutter.TryCut(v.mesh, at, false, default, out var cut)) return false;
            ShowStump(b, cut.below, v.mats, v.pos, v.rot, v.scale);
            var push = Flat(carVelocity);
            if (push.sqrMagnitude < 0.01f) push = Flat(b.transform.position - contact);
            push.Normalize();
            var axis = Vector3.Cross(Vector3.up, push);
            var ch = NextChunk();
            ch.Show(cut.above, v.mats, v.pos, v.rot, v.scale, settings.chunkLife);
            // A thin pole, not the box around pole and arm (the box's far edge struck the road after 20° of the fold).
            var top = cut.above.bounds.max.y * v.scale.y;
            ch.Capsule(0.12f, top, cut.height * v.scale.y);
            ch.body.mass = Mathf.Max(5f, kind.mass * 0.7f);
            var hinge = v.pos + v.rot * Vector3.Scale(v.scale, cut.centre);
            if (approach < settings.kinkUntil)
            {
                // The joint allows the negative turn about its axis — measured: with this axis that folds the post the way the
                // car pushed it (SmashTests checks the lean).
                ch.Hinge(hinge, axis, settings.kinkAngle);
                ch.body.angularVelocity = axis * Mathf.Lerp(1.5f, 4.5f, approach / settings.kinkUntil);
            }
            else
            {
                ch.body.linearVelocity = carVelocity * settings.carry * Random.Range(0.7f, 1f) + Vector3.up * Random.Range(1.5f, 3f);
                ch.body.angularVelocity = axis * Random.Range(4f, 7f) + Random.insideUnitSphere * 1.5f;
            }
            return true;
        }

        /// <summary>A bench or a rack bursts into planks along its length, each its own body.</summary>
        bool Planks(Visual v, BreakableSettings.Kind kind, Vector3 carVelocity)
        {
            var size = Vector3.Scale(v.mesh.bounds.size, v.scale);
            var count = Mathf.Clamp(Mathf.RoundToInt(Mathf.Max(size.x, size.z) * settings.planksPerMetre), 2, 6);
            if (!MeshCutter.TrySlices(v.mesh, count, out var slices)) return false;
            PlanksThrown = slices.Length;
            foreach (var slice in slices)
            {
                var ch = NextChunk();
                ch.Show(slice, v.mats, v.pos + Vector3.up * 0.04f, v.rot, v.scale, settings.chunkLife);
                ch.Box();
                ch.body.mass = Mathf.Max(3f, kind.mass / slices.Length);
                ch.body.linearVelocity = carVelocity * settings.carry * Random.Range(0.45f, 1.05f) + Vector3.up * Random.Range(1.2f, 3.8f) + Random.insideUnitSphere * 1.6f;
                ch.body.angularVelocity = Random.insideUnitSphere * 7f;
            }
            return true;
        }

        // ── flexible posts ──────────────────────────────────────────────────

        sealed class Flexer
        {
            public Breakable b;
            public Vector3 axis;
            public Quaternion rest;
            public float at;
        }

        readonly List<Flexer> _flexing = new();

        /// <summary>A plastic post bends flat under the car and springs back up (it never breaks). Hits at walking pace do nothing.</summary>
        internal void Flex(Breakable b, Rigidbody car, Vector3 relativeVelocity, Collider touched)
        {
            if (b.Flexing || b.Broken) return;
            var kind = b.Kind;
            JapanMap.Vehicles.VehicleDamage.Soften(car, touched, relativeVelocity.magnitude * kind.carDamage);
            var push = Flat(car.linearVelocity);
            if (push.sqrMagnitude < 0.01f) push = Flat(relativeVelocity);
            push.Normalize();
            GiveSpeedBack(car, kind.carLoss);
            foreach (var c in b.Colliders) c.enabled = false;
            b.Flexing = true;
            b.Flexed++;
            _flexing.Add(new Flexer { b = b, axis = Vector3.Cross(Vector3.up, push), rest = b.transform.rotation, at = Time.time });
            Broke?.Invoke(kind.name, b.transform.position, relativeVelocity.magnitude);
        }

        void UpdateFlex()
        {
            for (var i = _flexing.Count - 1; i >= 0; i--)
            {
                var f = _flexing[i];
                if (f.b == null) { _flexing.RemoveAt(i); continue; }
                var t = Time.time - f.at;
                const float flat = 84f;
                float angle;
                var hold = settings.flexTimes.x;
                var back = settings.flexTimes.y;
                if (t < 0.07f) angle = flat * Mathf.SmoothStep(0f, 1f, t / 0.07f);            // pushed down by the bumper
                else if (t < hold) angle = flat;                                            // under the car
                else
                {
                    var u = t - hold;                                                       // springs back, overshoots, settles
                    angle = flat * Mathf.Exp(-5f * u / back) * Mathf.Cos(u / back * Mathf.PI * 2.2f);
                }
                f.b.transform.rotation = Quaternion.AngleAxis(angle, f.axis) * f.rest;
                if (t < hold + back) continue;
                f.b.transform.rotation = f.rest;
                // Upright again — its collider back once the car is off it (else it would shove the car).
                var clear = true;
                foreach (var c in f.b.Colliders)
                {
                    var bb = c.bounds;
                    if (Physics.CheckBox(bb.center, bb.extents, Quaternion.identity, 1 << GameLayers.Layer(GameLayers.Vehicle), QueryTriggerInteraction.Ignore)) clear = false;
                }
                if (!clear) continue;
                foreach (var c in f.b.Colliders) c.enabled = true;
                f.b.Flexing = false;
                _flexing.RemoveAt(i);
            }
        }

        // ── stumps and stubs ────────────────────────────────────────────────

        readonly List<(object owner, GameObject go)> _stumps = new();
        int _nextStump;

        GameObject NewStump()
        {
            var go = new GameObject("Stump");
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>();
            var r = go.AddComponent<MeshRenderer>();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            go.SetActive(false);
            _stumps.Add((null, go));
            return go;
        }

        /// <summary>What stays standing of a broken trunk or post (no collider: the car has gone through it).</summary>
        void ShowStump(object owner, Mesh mesh, Material[] mats, Vector3 pos, Quaternion rot, Vector3 scale)
        {
            GameObject go = null;
            for (var i = 0; i < _stumps.Count; i++)
                if (!_stumps[i].go.activeSelf) { go = _stumps[i].go; _stumps[i] = (owner, go); break; }
            if (go == null)
            {
                go = _stumps[_nextStump].go; // all standing: the oldest goes
                _stumps[_nextStump] = (owner, go);
                _nextStump = (_nextStump + 1) % _stumps.Count;
            }
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            go.GetComponent<MeshRenderer>().sharedMaterials = mats;
            go.transform.SetPositionAndRotation(pos, rot);
            go.transform.localScale = scale;
            go.SetActive(true);
        }

        /// <summary>A cached cut piece still on screen (the cutter keeps those when it trims its cache).</summary>
        bool MeshShown(Mesh m)
        {
            foreach (var s in _stumps)
                if (s.go.activeSelf && s.go.GetComponent<MeshFilter>().sharedMesh == m) return true;
            foreach (var c in _chunks)
                if (c.go.activeSelf && c.filter.sharedMesh == m) return true;
            return false;
        }

        // Kinked posts are few kinds of mesh: their cuts are made in idle frames ahead of the first hit.
        readonly Queue<(Mesh mesh, float height)> _kinkCuts = new();

        void QueueKinkCuts()
        {
            var seen = new HashSet<Mesh>();
            foreach (var b in _all)
            {
                if (b.Kind.way != BreakableSettings.Way.Kink) continue;
                var v = VisualsOf(b);
                if (v.Count == 0 || !seen.Add(v[0].mesh)) continue;
                for (var h = settings.breakHeight.x; h <= settings.breakHeight.y + 1e-3f; h += 0.1f)
                    _kinkCuts.Enqueue((v[0].mesh, h / Mathf.Max(0.01f, v[0].scale.y)));
            }
        }

        void HideStump(object owner)
        {
            for (var i = 0; i < _stumps.Count; i++)
                if (_stumps[i].go.activeSelf && Equals(_stumps[i].owner, owner)) _stumps[i].go.SetActive(false);
        }

        public int LiveStumps { get { var n = 0; foreach (var s in _stumps) if (s.go.activeSelf) n++; return n; } }
        public int Flexing => _flexing.Count;
        /// <summary>Kinked tops hanging on their hinge now (tests).</summary>
        public int Hinged { get { var n = 0; foreach (var c in _chunks) if (c.go.activeSelf && c.hinged) n++; return n; } }
        public IEnumerable<Transform> HingedTops { get { foreach (var c in _chunks) if (c.go.activeSelf && c.hinged) yield return c.go.transform; } }
        /// <summary>Planks thrown by the last bench or rack.</summary>
        public int PlanksThrown { get; private set; }

        void Launch(Chunk ch, Mesh mesh, Material[] mats, Vector3 pos, Quaternion rot, Vector3 scale, BreakableSettings.Kind kind, Vector3 carVelocity, Vector3 hitCentre)
        {
            ch.Show(mesh, mats, pos + Vector3.up * 0.05f, rot, scale, settings.chunkLife);
            ch.Box();
            ch.body.mass = Mathf.Max(5f, kind.mass);
            // Heavy things (vending 250 kg, hut 600 kg) barely leave the ground; a post flies.
            var light = Mathf.Clamp01(80f / Mathf.Max(1f, kind.mass));
            ch.body.linearVelocity = carVelocity * settings.carry * Mathf.Lerp(0.35f, 1f, light) * Random.Range(0.8f, 1.05f)
                                     + Vector3.up * Mathf.Lerp(0.8f, 3.2f, light) * Random.Range(0.7f, 1.2f);
            // Hit low, it tips over the top: spin about the axis across the travel.
            var push = Flat(carVelocity).normalized;
            ch.body.angularVelocity = Vector3.Cross(Vector3.up, push) * Mathf.Lerp(1.2f, 5f, light) + Random.insideUnitSphere * 2f * light;
        }

        /// <summary>Small chips of the object's colour (splinters, glass, plastic) — few and small: the object itself is
        /// what falls, these only say "it broke".</summary>
        void Chips(BreakableSettings.Kind kind, Bounds bounds, Vector3 carVelocity, int count)
        {
            var uv = _palette.Uv(kind.color);
            for (var i = 0; i < count; i++)
            {
                var p = NextPiece(uv);
                var at = bounds.center + Vector3.Scale(Random.insideUnitSphere * 0.5f, bounds.size);
                p.body.transform.SetPositionAndRotation(at, Random.rotation);
                var a = Random.Range(settings.chipSize.x, settings.chipSize.y);
                p.body.transform.localScale = new Vector3(a, a * Random.Range(0.3f, 0.8f), a * Random.Range(0.5f, 1.6f));
                p.body.gameObject.SetActive(true);
                p.body.mass = 1f;
                p.body.linearVelocity = carVelocity * settings.carry * Random.Range(0.5f, 1.1f) + Vector3.up * Random.Range(1.5f, 4.5f) + Random.insideUnitSphere * 2.5f;
                p.body.angularVelocity = Random.insideUnitSphere * 12f;
                p.bornAt = Time.time - settings.pieceLife * 0.4f; // chips go sooner than the object
            }
        }

        void SpawnPieces(BreakableSettings.Kind kind, Bounds bounds, Quaternion rotation, Vector3 carVelocity)
        {
            var size = bounds.size;
            var s = kind.split;
            var count = s.x * s.y * s.z;
            var piece = new Vector3(size.x / s.x, size.y / s.y, size.z / s.z) * 0.92f;
            var uv = _palette.Uv(kind.color);
            for (var x = 0; x < s.x; x++)
            for (var y = 0; y < s.y; y++)
            for (var z = 0; z < s.z; z++)
            {
                var p = NextPiece(uv);
                var local = new Vector3((x + 0.5f) / s.x - 0.5f, (y + 0.5f) / s.y - 0.5f, (z + 0.5f) / s.z - 0.5f);
                var at = bounds.center + Vector3.Scale(local, size);
                p.body.transform.SetPositionAndRotation(at, rotation);
                p.body.transform.localScale = piece;
                p.body.gameObject.SetActive(true);
                p.body.mass = Mathf.Max(2f, kind.mass / count);
                p.body.linearVelocity = carVelocity * settings.carry * Random.Range(0.6f, 1.1f) + Vector3.up * Random.Range(1f, 3.5f) + Random.insideUnitSphere * 1.5f;
                p.body.angularVelocity = Random.insideUnitSphere * 6f;
                p.bornAt = Time.time;
            }
        }

        static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

        // ── whole objects in flight ─────────────────────────────────────────

        sealed class Chunk
        {
            public GameObject go;
            public MeshFilter filter;
            public MeshRenderer renderer;
            public Rigidbody body;
            public BoxCollider box;
            public CapsuleCollider capsule;
            public SphereCollider crown;
            public ConfigurableJoint joint;
            public bool hinged;
            public float bornAt, life;

            public void Show(Mesh mesh, Material[] mats, Vector3 pos, Quaternion rot, Vector3 scale, float lifetime)
            {
                // A recycled body: no hinge, no crown from its last life.
                if (hinged) Free();
                if (crown != null) crown.enabled = false;
                body.isKinematic = false;
                go.transform.SetPositionAndRotation(pos, rot);
                go.transform.localScale = scale;
                filter.sharedMesh = mesh;
                renderer.sharedMaterials = mats;
                go.SetActive(true);
                bornAt = Time.time;
                life = lifetime;
            }

            public void Box()
            {
                capsule.enabled = false;
                box.enabled = true;
                var b = filter.sharedMesh.bounds;
                box.center = b.center;
                box.size = b.size * 0.9f;
                body.ResetCenterOfMass();
                body.ResetInertiaTensor();
            }

            /// <summary>A tree: a trunk capsule from <paramref name="bottom"/> up to its top (world metres; the mesh may be scaled by the instance).</summary>
            public void Capsule(float radius, float height, float bottom = 0f)
            {
                box.enabled = false;
                capsule.enabled = true;
                var s = go.transform.lossyScale;
                var sy = Mathf.Max(0.01f, s.y);
                var sx = Mathf.Max(0.01f, s.x);
                capsule.direction = 1;
                capsule.radius = radius / sx;
                var len = Mathf.Max(radius * 2.2f, height - bottom);
                capsule.height = len / sy;
                capsule.center = new Vector3(0f, (bottom + len * 0.5f) / sy, 0f);
                body.ResetCenterOfMass();
                body.ResetInertiaTensor();
            }

            /// <summary>A sphere for a tree's crown (mesh space): the top lands on its leaves, not through them.</summary>
            public void Crown(Vector3 centre, float radius)
            {
                crown.enabled = true;
                crown.center = centre;
                crown.radius = Mathf.Max(0.3f, radius);
                body.ResetCenterOfMass();
                body.ResetInertiaTensor();
            }

            /// <summary>Holds the piece to the world at a point (a kinked post folds about it, up to <paramref name="max"/> degrees).</summary>
            public void Hinge(Vector3 worldAnchor, Vector3 worldAxis, float max)
            {
                // A joint made once with the chunk and switched between free and hinge: adding one in the break cost ~0.5 ms.
                var j = joint;
                j.autoConfigureConnectedAnchor = false;
                j.anchor = go.transform.InverseTransformPoint(worldAnchor);
                j.axis = go.transform.InverseTransformDirection(worldAxis);
                j.secondaryAxis = go.transform.InverseTransformDirection(Vector3.up);
                j.connectedAnchor = worldAnchor;
                j.xMotion = j.yMotion = j.zMotion = ConfigurableJointMotion.Locked;
                j.angularXMotion = ConfigurableJointMotion.Limited;
                j.angularYMotion = j.angularZMotion = ConfigurableJointMotion.Locked;
                // Folds one way only, to max; a little bounce at the end.
                j.lowAngularXLimit = new SoftJointLimit { limit = -max };
                j.highAngularXLimit = new SoftJointLimit { limit = 3f };
                j.angularXLimitSpring = new SoftJointLimitSpring { spring = 0f, damper = 0f };
                hinged = true;
            }

            /// <summary>No hold: the joint lets everything go.</summary>
            public void Free()
            {
                var j = joint;
                j.xMotion = j.yMotion = j.zMotion = ConfigurableJointMotion.Free;
                j.angularXMotion = j.angularYMotion = j.angularZMotion = ConfigurableJointMotion.Free;
                hinged = false;
            }
        }

        readonly List<Chunk> _chunks = new();
        int _nextChunk;


        Chunk NextChunk()
        {
            foreach (var c in _chunks)
                if (!c.go.activeSelf) return c;
            var oldest = _chunks[_nextChunk];
            _nextChunk = (_nextChunk + 1) % _chunks.Count;
            return oldest;
        }

        void CreateChunk()
        {
            var c = new Chunk { go = new GameObject("FallingObject") };
            c.go.layer = GameLayers.Layer(GameLayers.Debris);
            c.go.transform.SetParent(transform, false);
            c.filter = c.go.AddComponent<MeshFilter>();
            c.renderer = c.go.AddComponent<MeshRenderer>();
            c.renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            c.box = c.go.AddComponent<BoxCollider>();
            c.capsule = c.go.AddComponent<CapsuleCollider>();
            c.body = c.go.AddComponent<Rigidbody>();
            c.body.interpolation = RigidbodyInterpolation.Interpolate;
            c.body.angularDamping = 0.4f;
            c.body.linearDamping = 0.05f;
            c.joint = c.go.AddComponent<ConfigurableJoint>();
            c.Free();
            c.crown = c.go.AddComponent<SphereCollider>();
            c.crown.enabled = false;
            c.go.SetActive(false);
            _chunks.Add(c);
        }

        // ── dust and leaves ─────────────────────────────────────────────────

        ParticleSystem _puff;

        void Puff(Vector3 at, Color color, int count, float spread, bool leaves = false)
        {
            if (_puff == null) return;
            var e = new ParticleSystem.EmitParams { applyShapeToPosition = false };
            for (var i = 0; i < count; i++)
            {
                e.position = at + Random.insideUnitSphere * spread * 0.6f;
                e.velocity = leaves
                    ? Random.insideUnitSphere * 2.2f + Vector3.up * 0.8f
                    : Random.insideUnitSphere * 1.2f + Vector3.up * 0.6f;
                e.startSize = leaves ? Random.Range(0.12f, 0.3f) : Random.Range(0.9f, 1.8f) * spread * 0.5f;
                e.startLifetime = leaves ? Random.Range(1.6f, 2.8f) : Random.Range(0.9f, 1.6f);
                var c = color;
                c.a *= Random.Range(0.6f, 1f);
                e.startColor = c;
                e.rotation = Random.Range(0f, 360f);
                _puff.Emit(e, 1);
            }
        }

        void CreatePuff()
        {
            if (settings.puffMaterial == null) return;
            var go = new GameObject("BreakPuff");
            go.transform.SetParent(transform, false);
            _puff = go.AddComponent<ParticleSystem>();
            _puff.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = _puff.main;
            main.loop = false;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 160;
            main.gravityModifier = 0.12f;
            var emission = _puff.emission;
            emission.enabled = false;
            var shape = _puff.shape;
            shape.enabled = false;
            var drag = _puff.limitVelocityOverLifetime;
            drag.enabled = true;
            drag.drag = 1.6f;
            var size = _puff.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.7f, 1f, 1.4f));
            var col = _puff.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.7f, 0.5f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = settings.puffMaterial;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
        }

        Piece NextPiece(Vector2 uv)
        {
            Piece p = null;
            foreach (var q in _pieces)
                if (!q.body.gameObject.activeSelf) { p = q; break; }
            if (p == null)
            {
                p = _pieces[_nextPiece]; // all busy: recycle the oldest
                _nextPiece = (_nextPiece + 1) % _pieces.Count;
            }
            p.filter.sharedMesh = CubeWithUv(uv);
            return p;
        }

        Piece CreatePiece()
        {
            var p = new Piece();
            var go = new GameObject("Debris");
            go.layer = GameLayers.Layer(GameLayers.Debris);
            go.transform.SetParent(transform, false);
            p.filter = go.AddComponent<MeshFilter>();
            p.renderer = go.AddComponent<MeshRenderer>();
            p.renderer.sharedMaterial = _palette.Material;
            p.renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; // legacy: no debris shadows
            p.collider = go.AddComponent<BoxCollider>();
            p.body = go.AddComponent<Rigidbody>();
            p.body.interpolation = RigidbodyInterpolation.Interpolate;
            go.SetActive(false);
            _pieces.Add(p);
            return p;
        }

        readonly Dictionary<Vector2, Mesh> _cubes = new();

        Mesh CubeWithUv(Vector2 uv)
        {
            if (_cubes.TryGetValue(uv, out var m)) return m;
            var b = new BoxMeshBuilder();
            b.Box(0, Vector3.zero, Vector3.one, uv);
            return _cubes[uv] = b.ToMesh("Debris", skinned: false);
        }

        Vector3 Focus()
        {
            if (player == null) return transform.position;
            return player.Current == PlayerModeController.Mode.Walking && player.Walker != null
                ? player.Walker.transform.position
                : player.Car != null ? player.Car.transform.position : transform.position;
        }

        int _respawnCursor;

        readonly List<(BreakableSettings.Kind kind, Bounds bounds, Vector3 velocity, bool tree)> _later = new();

        void Update()
        {
            UpdateFlex();
            if (_kinkCuts.Count > 0 && _stepFrame != Time.frameCount)
            {
                var (mesh, h) = _kinkCuts.Dequeue();
                if (!MeshCutter.Has(mesh, h, false)) MeshCutter.TryCut(mesh, h, false, default, out _);
            }
            foreach (var l in _later)
            {
                if (l.tree)
                {
                    var foot = new Vector3(l.bounds.center.x, l.bounds.min.y, l.bounds.center.z);
                    Chips(l.kind, new Bounds(foot + Vector3.up * 0.6f, new Vector3(l.bounds.size.x, 1.2f, l.bounds.size.z)), l.velocity, settings.chips);
                    Puff(foot + Vector3.up * 0.5f, settings.dustColor, 10, 1.4f);
                    Puff(foot + Vector3.up * (l.bounds.size.y * 0.85f), settings.leafColor, 26, 3.2f, leaves: true);
                }
                else
                {
                    Chips(l.kind, l.bounds, l.velocity, settings.chips);
                    Puff(l.bounds.center, settings.dustColor, 8, Mathf.Clamp(l.bounds.size.magnitude * 0.5f, 0.8f, 3f));
                }
            }
            _later.Clear();
            // Pieces: lie, then sink through the ground and go.
            foreach (var p in _pieces)
            {
                if (!p.body.gameObject.activeSelf) continue;
                var age = Time.time - p.bornAt;
                if (age < settings.pieceLife) continue;
                if (!p.body.isKinematic) p.body.isKinematic = true;
                p.body.transform.position += Vector3.down * (0.5f * Time.deltaTime);
                if (age > settings.pieceLife + 2f)
                {
                    p.body.isKinematic = false;
                    p.body.gameObject.SetActive(false);
                }
            }

            foreach (var c in _chunks)
            {
                if (!c.go.activeSelf) continue;
                var age = Time.time - c.bornAt;
                if (age < c.life) continue;
                if (!c.body.isKinematic) c.body.isKinematic = true;
                c.go.transform.position += Vector3.down * (0.6f * Time.deltaTime);
                if (age > c.life + 3f) c.go.SetActive(false);
            }

            // A few broken objects per frame: back when the player is far and some time has passed.
            var focus = Focus();
            var far2 = settings.respawnDistance * settings.respawnDistance;
            for (var t = _trees.Count - 1; t >= 0; t--)
            {
                var tree = _trees[t];
                if (Time.time - tree.at < settings.respawnSeconds || (tree.position - focus).sqrMagnitude < far2) continue;
                tree.renderer.SetHidden(tree.index, false);
                HideStump((tree.renderer, tree.index));
                _trees.RemoveAt(t);
            }
            if (_all.Count == 0) return;
            for (var k = 0; k < 16; k++)
            {
                var b = _all[_respawnCursor];
                _respawnCursor = (_respawnCursor + 1) % _all.Count;
                if (!b.Broken || Time.time - b.BrokenAt < settings.respawnSeconds) continue;
                if ((b.transform.position - focus).sqrMagnitude > far2)
                {
                    b.SetBroken(false);
                    HideStump(b);
                }
            }
        }
    }
}
