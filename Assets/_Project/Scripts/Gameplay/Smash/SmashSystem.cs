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
        public int LivePieces { get { var n = 0; foreach (var p in _pieces) if (p.body.gameObject.activeSelf) n++; return n; } }

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
                if (root == null) continue;
                foreach (Transform child in root.GetComponentsInChildren<Transform>(true))
                {
                    if (child.GetComponent<Collider>() == null && child.GetComponentInChildren<Collider>() == null) continue;
                    var kind = settings.Find(child.name);
                    if (kind == null) continue;
                    // The breakable sits on the outermost object of that name (a prefab instance with
                    // collider children, or a Tokyo collider box) — not again on its children.
                    if (child.parent != null && child.parent.GetComponent<Breakable>() != null) continue;
                    if (IsGroup(child, kind)) continue; // "shed" holding shed_000…065: the children break, not the group
                    var b = child.gameObject.AddComponent<Breakable>();
                    var instances = child.parent != null && child.parent.name == "Colliders"
                        ? child.parent.parent.GetComponentInChildren<InstanceRenderer>()
                        : null;
                    b.Bind(this, kind, instances);
                    _all.Add(b);
                }
            }
            // Pool and meshes now, not on the first hit (first break cost 2.1 ms creating them).
            foreach (var k in settings.kinds) CubeWithUv(_palette.Uv(k.color));
            for (var i = 0; i < settings.maxPieces; i++) CreatePiece();
            UnityEngine.Debug.Log($"[Smash] {_all.Count} breakables in {watch.ElapsedMilliseconds} ms");
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
            if (Time.frameCount != _stepFrame)
            {
                _stepFrame = Time.frameCount;
                _breaksThisStep = 0;
            }
            if (_breaksThisStep >= settings.maxBreaksPerStep) return;
            _breaksThisStep++;
            _watch.Restart();
            var kind = b.Kind;
            var bounds = b.Bounds;
            b.SetBroken(true);
            Breaks++;

            // The static collider already stopped the car this step; give the speed back, minus the loss.
            var vc = car.GetComponent<JapanMap.Vehicles.VehicleController>();
            var before = vc != null ? vc.VelocityBeforeStep : relativeVelocity;
            var speed = before.magnitude;
            if (speed > 0.1f) car.linearVelocity = before * (Mathf.Max(0f, speed - kind.carLoss) / speed);

            SpawnPieces(kind, bounds, b.Rotation, car.linearVelocity);
            WorstBreakMs = Mathf.Max(WorstBreakMs, (float)_watch.Elapsed.TotalMilliseconds);
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

        void Update()
        {
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

            // A few broken objects per frame: back when the player is far and some time has passed.
            if (_all.Count == 0) return;
            var focus = Focus();
            var far2 = settings.respawnDistance * settings.respawnDistance;
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
