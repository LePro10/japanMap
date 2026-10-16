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
            _trees.Add((r, index, Time.time, at));
            Breaks++;
            TreesBroken++;
            Broke?.Invoke("tree", at, rel.magnitude);
            var carVelocity = body.linearVelocity;
            GiveSpeedBack(body, kind.carLoss);
            // The tree itself snaps at the foot and tips over the way the car pushed it (it used to burst into three
            // trunk-sized boxes: "aus einem Baum wird ein riesen Pfosten"). Gravity does the rest.
            if (r.TryGetVisual(index, out var mesh, out var mat, out var m))
            {
                var push = Flat(carVelocity);
                if (push.sqrMagnitude < 0.01f) push = Flat(-n);
                push.Normalize();
                var ch = NextChunk();
                var pos = m.GetColumn(3);
                ch.Show(mesh, new[] { mat }, (Vector3)pos + Vector3.up * 0.15f, m.rotation, m.lossyScale, settings.chunkLife);
                ch.Capsule(radius * 1.4f, h);
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
            if (_puff != null) { _puff.Emit(new ParticleSystem.EmitParams { position = new Vector3(0f, -500f, 0f) }, 1); _puff.Clear(); }
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

        internal void Break(Breakable b, Rigidbody car, Vector3 relativeVelocity)
        {
            if (!TakeBreakSlot()) return;
            _watch.Restart();
            var kind = b.Kind;
            var bounds = b.Bounds;
            b.SetBroken(true);
            Breaks++;
            Broke?.Invoke(kind.name, bounds.center, relativeVelocity.magnitude);
            var carVelocity = car.linearVelocity;
            GiveSpeedBack(car, kind.carLoss);
            var t0 = _watch.Elapsed.TotalMilliseconds;
            ThrowObject(b, kind, carVelocity);
            var t1 = _watch.Elapsed.TotalMilliseconds;
            // Chips and dust a frame later: one frame does not carry the whole break (budget 2 ms).
            _later.Add((kind, bounds, carVelocity, false));
            if (t1 > WorstBreakMs) WorstDetail = $"{kind.name}: before {t0:F2}, object {t1 - t0:F2} ms";
            WorstBreakMs = Mathf.Max(WorstBreakMs, (float)_watch.Elapsed.TotalMilliseconds);
        }

        /// <summary>
        /// The broken object flies as itself: each of its meshes (or its instance's mesh) becomes a loose body with the
        /// car's momentum, a hop and a tumble. The two biggest meshes — a bench is one, a lamp post with its head two.
        /// </summary>
        void ThrowObject(Breakable b, BreakableSettings.Kind kind, Vector3 carVelocity)
        {
            var thrown = 0;
            var filters = 0;
            // The two biggest meshes (a lamp: pole and head); small trims vanish with the chips.
            Renderer first = null, second = null;
            float firstSize = 0f, secondSize = 0f;
            foreach (var r in b.Renderers)
            {
                if (r == null || !(r is MeshRenderer) || !r.TryGetComponent<MeshFilter>(out var f) || f.sharedMesh == null) continue;
                filters++;
                var size = r.bounds.size.sqrMagnitude;
                if (size > firstSize) { second = first; secondSize = firstSize; first = r; firstSize = size; }
                else if (size > secondSize) { second = r; secondSize = size; }
            }
            foreach (var r in new[] { first, second })
            {
                if (r == null) continue;
                var t = r.transform;
                Launch(NextChunk(), r.GetComponent<MeshFilter>().sharedMesh, r.sharedMaterials, t.position, t.rotation, t.lossyScale, kind, carVelocity, b.Bounds.center);
                thrown++;
            }
            if (filters == 0 && b.Instances != null)
                foreach (var id in b.InstanceIds)
                {
                    if (thrown >= 2) break;
                    if (!b.Instances.TryGetVisual(id, out var mesh, out var mat, out var m)) continue;
                    Launch(NextChunk(), mesh, new[] { mat }, m.GetColumn(3), m.rotation, m.lossyScale, kind, carVelocity, b.Bounds.center);
                    thrown++;
                }
            // Nothing to show (a bare collider): fall back to the old blocks, smaller.
            if (thrown == 0) SpawnPieces(kind, b.Bounds, b.Rotation, carVelocity);
        }

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
            public float bornAt, life;

            public void Show(Mesh mesh, Material[] mats, Vector3 pos, Quaternion rot, Vector3 scale, float lifetime)
            {
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

            /// <summary>A tree: a trunk capsule from the foot up (local units — the mesh is unscaled in y by the instance).</summary>
            public void Capsule(float radius, float height)
            {
                box.enabled = false;
                capsule.enabled = true;
                var s = go.transform.lossyScale;
                var sy = Mathf.Max(0.01f, s.y);
                var sx = Mathf.Max(0.01f, s.x);
                capsule.direction = 1;
                capsule.radius = radius / sx;
                capsule.height = height / sy;
                capsule.center = new Vector3(0f, height * 0.5f / sy, 0f);
                body.ResetCenterOfMass();
                body.ResetInertiaTensor();
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
                _trees.RemoveAt(t);
            }
            if (_all.Count == 0) return;
            for (var k = 0; k < 16; k++)
            {
                var b = _all[_respawnCursor];
                _respawnCursor = (_respawnCursor + 1) % _all.Count;
                if (!b.Broken || Time.time - b.BrokenAt < settings.respawnSeconds) continue;
                if ((b.transform.position - focus).sqrMagnitude > far2) b.SetBroken(false);
            }
        }
    }
}
