using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.World
{
    /// <summary>
    /// Draws <see cref="InstanceData"/> (trees, place buildings) with GPU instancing: per camera, chunks
    /// are frustum-culled, each instance gets its LOD by distance, and every (prototype, LOD) pair
    /// becomes one instanced call. Terrain trees drew one call per tree (44 500 draw calls measured,
    /// DECISIONS D18); Tokyo as GameObjects would have been ~5 000 objects (D20).
    /// Tree colliders exist only near the main camera (pooled capsules); buildings bring their own.
    /// </summary>
    [ExecuteAlways]
    public sealed class InstanceRenderer : MonoBehaviour
    {
        const int Slice = 1023; // instances per call that every backend (WebGL2) accepts

        public InstanceData data;
        [Tooltip("Set per quality tier by TerrainQuality (trees only; buildings use their prototypes' maxDistance).")]
        public float maxDistance = 1500;
        [Tooltip("Pooled tree colliders within this radius of the main camera (play mode).")]
        public float colliderRadius = 70;

        Matrix4x4[] _matrices;
        Matrix4x4[][] _lists;  // [prototype * 4 + lod]
        int[] _counts;
        int _lodsPer = 4;
        readonly Plane[] _planes = new Plane[6];
        readonly List<CapsuleCollider> _pool = new();
        Vector3 _colliderCentre = new(float.MaxValue, 0, 0);

        /// <summary>Instances drawn in the last rendered camera (for tests and the debug overlay).</summary>
        public int LastDrawn { get; private set; }
        public int LastCalls { get; private set; }
        /// <summary>CPU time of the last Draw (ms) — list building + submission.</summary>
        public float LastMs { get; private set; }
        readonly System.Diagnostics.Stopwatch _watch = new();

        void OnEnable()
        {
            Build();
            RenderPipelineManager.beginCameraRendering += Draw;
        }

        void OnDisable()
        {
            RenderPipelineManager.beginCameraRendering -= Draw;
            foreach (var c in _pool) if (c != null) DestroyImmediate(c.gameObject);
            _pool.Clear();
        }

        public void Build()
        {
            _matrices = null;
            if (data == null || data.Count == 0) return;
            _matrices = new Matrix4x4[data.Count];
            for (var i = 0; i < data.Count; i++) _matrices[i] = data.Matrix(i);
            _lists = new Matrix4x4[data.prototypes.Length * _lodsPer][];
            _counts = new int[_lists.Length];
            // Upper bound per list: all instances of that prototype.
            var perProto = new int[data.prototypes.Length];
            foreach (var c in data.chunks) foreach (var r in c.runs) perProto[r.prototype] += r.count;
            for (var p = 0; p < data.prototypes.Length; p++)
            for (var l = 0; l < _lodsPer; l++)
                _lists[p * _lodsPer + l] = new Matrix4x4[Mathf.Max(1, perProto[p])];
            _colliderCentre = new Vector3(float.MaxValue, 0, 0);
        }

        void Update()
        {
            if (!Application.isPlaying || _matrices == null) return;
            var cam = Camera.main;
            if (cam != null && (cam.transform.position - _colliderCentre).sqrMagnitude > 100) UpdateColliders(cam.transform.position);
        }

        void Draw(ScriptableRenderContext ctx, Camera cam)
        {
            if (_matrices == null || cam.cameraType == CameraType.Preview || cam.cameraType == CameraType.Reflection) return;
            _watch.Restart();
            GeometryUtility.CalculateFrustumPlanes(cam, _planes);
            var eye = cam.transform.position;
            var bias = Mathf.Max(0.25f, QualitySettings.lodBias);
            var far = Mathf.Min(maxDistance, cam.farClipPlane);
            System.Array.Clear(_counts, 0, _counts.Length);

            foreach (var chunk in data.chunks)
            {
                var near = Mathf.Sqrt(chunk.bounds.SqrDistance(eye));
                if (near > far || !GeometryUtility.TestPlanesAABB(_planes, chunk.bounds)) continue;
                foreach (var run in chunk.runs)
                {
                    var proto = data.prototypes[run.prototype];
                    if (near > proto.maxDistance) continue;
                    var lods = proto.lods.Length;
                    var baseIndex = run.prototype * _lodsPer;
                    var lastEnd = proto.lodEnd[lods - 2] * bias;
                    if (near > lastEnd && near + data.chunkSize * 1.5f < Mathf.Min(far, proto.maxDistance))
                    {
                        // Whole run in the last LOD and inside the range: bulk copy.
                        var li = baseIndex + lods - 1;
                        System.Array.Copy(_matrices, run.start, _lists[li], _counts[li], run.count);
                        _counts[li] += run.count;
                        continue;
                    }
                    var maxD2 = Mathf.Min(far, proto.maxDistance);
                    maxD2 *= maxD2;
                    for (var i = run.start; i < run.start + run.count; i++)
                    {
                        var d2 = (data.positions[i] - eye).sqrMagnitude;
                        if (d2 > maxD2) continue;
                        var lod = 0;
                        while (lod < lods - 1 && d2 > Sq(proto.lodEnd[lod] * bias)) lod++;
                        var li = baseIndex + lod;
                        _lists[li][_counts[li]++] = _matrices[i];
                    }
                }
            }

            var drawn = 0;
            var calls = 0;
            var world = new Bounds(eye, Vector3.one * far * 2);
            for (var p = 0; p < data.prototypes.Length; p++)
            {
                var proto = data.prototypes[p];
                var proxy = proto.shadowProxyLod;
                for (var l = 0; l < proto.lods.Length; l++)
                {
                    var n = _counts[p * _lodsPer + l];
                    if (n == 0) continue;
                    var byProxy = proxy > l && proxy < proto.lods.Length;
                    var mat = proto.lodMaterials != null && l < proto.lodMaterials.Length && proto.lodMaterials[l] != null ? proto.lodMaterials[l] : proto.material;
                    var rp = new RenderParams(mat)
                    {
                        camera = cam,
                        worldBounds = world,
                        shadowCastingMode = !byProxy && l < proto.shadowLods ? ShadowCastingMode.On : ShadowCastingMode.Off,
                        receiveShadows = true,
                        layer = gameObject.layer,
                        lightProbeUsage = LightProbeUsage.Off,
                    };
                    for (var s = 0; s < n; s += Slice)
                    {
                        Graphics.RenderMeshInstanced(rp, proto.lods[l], 0, _lists[p * _lodsPer + l], Mathf.Min(Slice, n - s), s);
                        calls++;
                    }
                    if (byProxy)
                    {
                        rp.material = proto.lodMaterials != null && proxy < proto.lodMaterials.Length && proto.lodMaterials[proxy] != null ? proto.lodMaterials[proxy] : proto.material;
                        rp.shadowCastingMode = ShadowCastingMode.ShadowsOnly;
                        for (var s = 0; s < n; s += Slice)
                        {
                            Graphics.RenderMeshInstanced(rp, proto.lods[proxy], 0, _lists[p * _lodsPer + l], Mathf.Min(Slice, n - s), s);
                            calls++;
                        }
                    }
                    drawn += n;
                }
            }
            LastDrawn = drawn;
            LastCalls = calls;
            LastMs = (float)_watch.Elapsed.TotalMilliseconds;
        }

        static float Sq(float x) => x * x;

        void UpdateColliders(Vector3 centre)
        {
            _colliderCentre = centre;
            var used = 0;
            var r2 = colliderRadius * colliderRadius;
            foreach (var chunk in data.chunks)
            {
                if (chunk.bounds.SqrDistance(centre) > r2) continue;
                foreach (var run in chunk.runs)
                {
                    var proto = data.prototypes[run.prototype];
                    if (proto.colliderRadius <= 0) continue;
                    for (var i = run.start; i < run.start + run.count; i++)
                    {
                        if ((data.positions[i] - centre).sqrMagnitude > r2) continue;
                        if (used == _pool.Count)
                        {
                            var go = new GameObject("TreeCollider") { hideFlags = HideFlags.DontSave };
                            go.transform.SetParent(transform, false);
                            _pool.Add(go.AddComponent<CapsuleCollider>());
                        }
                        var c = _pool[used++];
                        var s = data is VegetationData v ? v.shapes[i] : Vector3.one;
                        c.radius = proto.colliderRadius * s.y;
                        c.height = proto.colliderHeight * s.x;
                        c.center = new Vector3(0, c.height / 2, 0);
                        c.transform.position = data.positions[i];
                        c.enabled = true;
                    }
                }
            }
            for (var k = used; k < _pool.Count; k++) _pool[k].enabled = false;
        }

        /// <summary>Colliders currently active (tests).</summary>
        public int ActiveColliders
        {
            get { var n = 0; foreach (var c in _pool) if (c != null && c.enabled) n++; return n; }
        }
    }
}
