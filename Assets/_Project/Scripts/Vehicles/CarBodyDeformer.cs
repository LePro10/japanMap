using System;
using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Crumples the visible body of a car where it was hit (D47). Every mesh under <c>body_root</c> is pushed by one
    /// displacement field per impact, in body space: a crush plane <c>depth</c> behind the car's own surface at the
    /// contact (not behind the physics box — the box ends short of the bumpers), fading out sideways over
    /// <c>radius</c>; vertices in front of the plane are pushed back onto it with a soft knee, so a panel folds instead
    /// of shearing, and a little hashed noise wrinkles it. Normals are the authored ones turned by the change of their
    /// faces, so creases and smoothing groups stay as modelled. Meshes are cloned on their first dent and given back on
    /// <see cref="Restore"/>. Browser stand-in for soft-body physics: one pass over ~14 000 body vertices per hit.
    /// </summary>
    public sealed class CarBodyDeformer
    {
        public sealed class Part
        {
            public MeshFilter filter;
            public Mesh shared, work;
            public Vector3[] rest, pos, restNormal, normal;
            public int[] tris;
            public Vector3[] restFace;
            public bool[] moved, touched;
            /// <summary>Faces of each vertex: faceList[faceStart[v] … faceStart[v + 1]).</summary>
            public int[] faceStart, faceList;
            public Vector3[] faceNow;
            public int[] faceStamp;
            public int stamp;
            public List<int> movedList = new(), touchedList = new();
            public int normalCursor = -1, touchCursor;
            public Bounds restBounds;
            public bool ready, dirty;
            /// <summary>Sub-mesh index ranges of the body's materials (decals and glass need them).</summary>
            public SubMeshInfo[] subMeshes;
            public Material[] materials;
            /// <summary>Per end (0 front, 1 rear): which vertices lie in the bumper zone (made ahead, see WarmTear).</summary>
            public bool[][] zone = new bool[2][];
            public Vector2[] uv;
        }

        public struct SubMeshInfo
        {
            public int indexStart, indexCount;
        }

        /// <summary>One impact as the field sees it, in body space.</summary>
        public struct Dent
        {
            public Vector3 point;
            /// <summary>Into the car.</summary>
            public Vector3 dir;
            public float depth, radius, crumple;
            public int seed;
        }

        readonly Transform _body;
        readonly List<Part> _parts = new();
        float _maxDisplacement;

        public IReadOnlyList<Part> Parts => _parts;
        public Transform Body => _body;
        /// <summary>Largest distance any vertex has moved from where it was modelled, m.</summary>
        public float MaxDisplacement => _maxDisplacement;
        /// <summary>Vertices moved by the last dent (diagnostics, tests).</summary>
        public int LastMoved { get; private set; }
        /// <summary>The crush plane of the last dent along its direction (body space, from the dent point).</summary>
        public float LastPlane { get; private set; }
        public bool Damaged => _maxDisplacement > 0f;
        /// <summary>Where the last dent's time went (diagnostics).</summary>
        public string Timing { get; private set; } = "";
        readonly System.Diagnostics.Stopwatch _sw = new();

        /// <summary>Meshes under <paramref name="bodyRoot"/>, minus the ones <paramref name="skip"/> names (steering wheel, driver).</summary>
        public CarBodyDeformer(Transform bodyRoot, Func<Transform, bool> skip = null)
        {
            _body = bodyRoot;
            foreach (var f in bodyRoot.GetComponentsInChildren<MeshFilter>(true))
            {
                if (f.sharedMesh == null || (skip != null && skip(f.transform))) continue;
                if (!f.sharedMesh.isReadable) continue; // the car-lab GLBs are readable; anything else stays rigid
                _parts.Add(new Part { filter = f, shared = f.sharedMesh });
            }
        }

        /// <summary>Parts read and copied, of all (diagnostics).</summary>
        public string Readiness
        {
            get
            {
                int ready = 0, copied = 0, active = 0;
                foreach (var p in _parts)
                {
                    if (!p.filter.gameObject.activeInHierarchy) continue;
                    active++;
                    if (p.ready) ready++;
                    if (p.work != null) copied++;
                }
                return $"{ready}/{active} read, {copied} copied";
            }
        }

        /// <summary>
        /// The main shell: the car-lab "body" node (".009" suffixes aside), else the part with the most vertices. Not
        /// simply the largest: the formula car's engine has more vertices than its body.
        /// </summary>
        public Part Shell
        {
            get
            {
                Part best = null;
                foreach (var p in _parts)
                {
                    var n = p.filter.name;
                    if (n == "body" || n.StartsWith("body.")) return p;
                    if (best == null || p.shared.vertexCount > best.shared.vertexCount) best = p;
                }
                return best;
            }
        }

        /// <summary>Gets one more part ready ahead of the first hit (read its vertices, own copy of its mesh); false when all are.</summary>
        public bool PrepareNext()
        {
            Part next = null;
            foreach (var p in _parts)
                if (!p.ready && p.filter.gameObject.activeInHierarchy && (next == null || p.shared.vertexCount > next.shared.vertexCount)) next = p;
            if (next == null) return false;
            Prepare(next);
            return true;
        }

        /// <summary>After a repair: the car's own mesh copy again, one part per call, ahead of the next crash; false when none is missing.</summary>
        public bool CopyNext()
        {
            foreach (var p in _parts)
                if (p.ready && p.work == null && p.filter.gameObject.activeInHierarchy)
                {
                    EnsureCopy(p);
                    return true;
                }
            return false;
        }

        public void Prepare(Part p)
        {
            if (p.ready) return;
            var m = p.shared;
            p.rest = m.vertices;
            p.restNormal = m.normals;
            if (p.restNormal == null || p.restNormal.Length != p.rest.Length) p.restNormal = new Vector3[p.rest.Length];
            p.pos = (Vector3[])p.rest.Clone();
            p.normal = (Vector3[])p.restNormal.Clone();
            p.tris = m.triangles;
            p.restFace = new Vector3[p.tris.Length / 3];
            for (var t = 0; t < p.restFace.Length; t++) p.restFace[t] = Face(p.rest, p.tris, t);
            p.moved = new bool[p.rest.Length];
            p.touched = new bool[p.rest.Length];
            // Vertex → faces, so a dent re-normals only the faces around what moved.
            var count = new int[p.rest.Length + 1];
            foreach (var v in p.tris) count[v + 1]++;
            for (var i = 0; i < p.rest.Length; i++) count[i + 1] += count[i];
            p.faceStart = (int[])count.Clone();
            p.faceList = new int[p.tris.Length];
            for (var k = 0; k < p.tris.Length; k++) p.faceList[count[p.tris[k]]++] = k / 3;
            p.faceNow = new Vector3[p.restFace.Length];
            p.faceStamp = new int[p.restFace.Length];
            p.restBounds = m.bounds;
            p.subMeshes = new SubMeshInfo[m.subMeshCount];
            // The flat index list is the sub-meshes one after the other.
            var at = 0;
            for (var s = 0; s < m.subMeshCount; s++)
            {
                var n = (int)m.GetIndexCount(s);
                p.subMeshes[s] = new SubMeshInfo { indexStart = at, indexCount = n };
                at += n;
            }
            var r = p.filter.GetComponent<MeshRenderer>();
            p.materials = r != null ? r.sharedMaterials : Array.Empty<Material>();
            p.ready = true;
            // The car's own copy now, not in the crash.
            if (Application.isPlaying) EnsureCopy(p);
        }

        static Vector3 Face(Vector3[] v, int[] tris, int t)
        {
            var a = v[tris[t * 3]];
            return Vector3.Cross(v[tris[t * 3 + 1]] - a, v[tris[t * 3 + 2]] - a);
        }

        Matrix4x4 ToBody(Part p) => _body.worldToLocalMatrix * p.filter.transform.localToWorldMatrix;

        /// <summary>
        /// The field: how far a point <paramref name="d"/> m along the dent direction (from the dent point) and
        /// <paramref name="lateral"/> m beside it moves, for a crush plane at <paramref name="plane"/>.
        /// </summary>
        public static float Field(float d, float lateral, float plane, float knee, float radius, float maxPush = float.MaxValue)
        {
            if (lateral >= radius) return 0f;
            var x = lateral / radius;
            // Full push in the middle third, smooth to zero at the rim.
            var w = x < 0.35f ? 1f : 1f - Smooth((x - 0.35f) / 0.65f);
            if (w <= 0f) return 0f;
            var e = -(d - plane) / knee;
            // knee · softplus(e): the push that keeps a point at or behind the plane, rounded over one knee — but never
            // more than the crush itself: a part that sticks out beside the contact (a bumper corner, a mirror) is not
            // driven through the car.
            var push = e > 12f ? knee * e : knee * Mathf.Log(1f + Mathf.Exp(e));
            return w * Mathf.Min(push, maxPush);
        }

        /// <summary>The most a dent of this depth moves any point (before crumple noise).</summary>
        public static float MaxPush(float depth) => depth * 1.15f + Knee(depth);

        static float Smooth(float t)
        {
            t = Mathf.Clamp01(t);
            return t * t * (3f - 2f * t);
        }

        /// <summary>Where the crush plane of <paramref name="dent"/> lies (the car's own surface plus the depth), or NaN when no vertex is near.</summary>
        public float PlaneFor(in Dent dent)
        {
            var dMin = float.PositiveInfinity;
            var near = dent.radius * 0.5f;
            for (var pass = 0; pass < 2 && float.IsPositiveInfinity(dMin); pass++)
            {
                foreach (var p in _parts)
                {
                    if (!p.filter.gameObject.activeInHierarchy) continue;
                    var toBody = ToBody(p);
                    if (!Reaches(p, toBody, dent)) continue;
                    Prepare(p);
                    var fromBody = toBody.inverse;
                    var c = fromBody.MultiplyPoint3x4(dent.point);
                    var dir = fromBody.MultiplyVector(dent.dir).normalized;
                    var n2 = near * near;
                    var pos = p.pos;
                    float cx = c.x, cy = c.y, cz = c.z, dx = dir.x, dy = dir.y, dz = dir.z;
                    for (var i = 0; i < pos.Length; i++)
                    {
                        var v = pos[i];
                        float ox = v.x - cx, oy = v.y - cy, oz = v.z - cz;
                        var d = ox * dx + oy * dy + oz * dz;
                        if (d >= dMin) continue;
                        float lx = ox - dx * d, ly = oy - dy * d, lz = oz - dz * d;
                        if (lx * lx + ly * ly + lz * lz > n2) continue;
                        dMin = d;
                    }
                }
                near = dent.radius; // nothing in the middle (a graze at an edge): the whole disc
            }
            return float.IsPositiveInfinity(dMin) ? float.NaN : dMin + dent.depth;
        }

        static bool Reaches(Part p, Matrix4x4 toBody, in Dent dent)
        {
            var b = p.shared.bounds;
            var centre = toBody.MultiplyPoint3x4(b.center);
            var r = b.extents.magnitude + dent.radius + dent.depth;
            return (centre - dent.point).sqrMagnitude < r * r;
        }

        sealed class Job
        {
            public Dent dent;
            public float plane, knee, buckleLen, buckleAmp, maxTotal;
            public int part, index;
            public Droop droop; // a hanging bumper instead of a crush
        }

        /// <summary>A bumper torn at one side, hanging down at the other (body space).</summary>
        public sealed class Droop
        {
            /// <summary>+1 the front, −1 the rear.</summary>
            public float end;
            /// <summary>The side that hangs: +1 right (+X), −1 left.</summary>
            public float side;
            public float amount;
            public float endZ, zone, top, halfWidth;
        }

        /// <summary>
        /// Queues a hanging bumper after a hard hit at an end (D47 "Stoßstange verbogen"): the lowest part of that end, by its
        /// modelled shape, swings down on the far side, still held at the near one — dragging, not torn off (no hole).
        /// </summary>
        public void EnqueueDroop(float end, float side, float amount, float maxTotal)
        {
            var shell = Shell;
            if (shell == null) return;
            Prepare(shell);
            var dr = ZoneOf(shell, end);
            dr.side = side;
            dr.amount = amount;
            _jobs.Enqueue(new Job { maxTotal = maxTotal, droop = dr });
        }

        /// <summary>The bumper's zone at an end: the lowest part of the last ~9 % of the modelled body.</summary>
        static Droop ZoneOf(Part shell, float end)
        {
            var b = shell.restBounds; // the modelled body, mesh space ≈ body space (the shell sits at the body root)
            return new Droop
            {
                end = end,
                endZ = end > 0f ? b.max.z : b.min.z,
                zone = Mathf.Min(0.4f, b.size.z * 0.09f),
                top = b.min.y + b.size.y * 0.4f,
                halfWidth = Mathf.Max(0.3f, b.extents.x),
            };
        }

        /// <summary>
        /// Tears the bumper at an end off the body (a second hard hit on a hanging one): its faces leave the body meshes and
        /// come back as one mesh in body space, as they are now (dented, hanging), one sub-mesh per material. Null when
        /// nothing lies there. <see cref="Restore"/> puts them back.
        /// </summary>
        public Mesh TearOff(float end, List<Material> materials)
        {
            var shell = Shell;
            if (shell == null) return null;
            Prepare(shell);
            var dr = ZoneOf(shell, end);
            var verts = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var subs = new List<List<int>>();
            materials.Clear();
            foreach (var p in _parts)
            {
                if (!p.filter.gameObject.activeInHierarchy) continue;
                Prepare(p);
                var toBody = ToBody(p);
                var inZone = Zone(p, dr, end > 0f ? 0 : 1);
                if (inZone == null) continue;
                var uv = p.uv ??= p.shared.uv;
                var map = new int[p.rest.Length]; // vertex → index in the torn mesh, +1 (0 = not yet)
                for (var s = 0; s < p.subMeshes.Length; s++)
                {
                    var info = p.subMeshes[s];
                    List<int> sub = null;
                    for (var k = info.indexStart; k < info.indexStart + info.indexCount; k += 3)
                    {
                        int a = p.tris[k], b = p.tris[k + 1], c = p.tris[k + 2];
                        if (a == b && b == c) continue;
                        if (!inZone[a] || !inZone[b] || !inZone[c]) continue;
                        if (sub == null)
                        {
                            sub = new List<int>();
                            subs.Add(sub);
                            materials.Add(p.materials != null && s < p.materials.Length ? p.materials[s] : null);
                        }
                        sub.Add(TornVertex(p, a, toBody, uv, map, verts, normals, uvs));
                        sub.Add(TornVertex(p, b, toBody, uv, map, verts, normals, uvs));
                        sub.Add(TornVertex(p, c, toBody, uv, map, verts, normals, uvs));
                        p.tris[k + 1] = p.tris[k + 2] = a; // degenerate on the body: draws nothing, keeps the index count
                    }
                    if (sub == null) continue;
                    if (p.work == null) Upload(p);
                    p.work.SetIndices(p.tris, info.indexStart, info.indexCount, MeshTopology.Triangles, s, false);
                }
            }
            if (verts.Count == 0) return null;
            var mesh = new Mesh { name = "TornBumper" };
            if (verts.Count > 65000) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(verts);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = subs.Count;
            for (var s = 0; s < subs.Count; s++) mesh.SetTriangles(subs[s], s, false);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Finds the bumper zones of both ends ahead (idle frames, like the loose wheels' bodies): the tear itself then only
        /// copies faces. Returns false once done.
        /// </summary>
        public bool WarmTear()
        {
            var shell = Shell;
            if (shell == null || !shell.ready) return false;
            var did = false;
            foreach (var p in _parts)
            {
                if (!p.ready || p.uv != null) continue;
                for (var e = 0; e < 2; e++) Zone(p, ZoneOf(shell, e == 0 ? 1f : -1f), e);
                p.uv = p.shared.uv;
                did = true;
                break; // one part per frame
            }
            return did;
        }

        /// <summary>Which vertices of a part lie in an end's zone, by the modelled shape (found even crushed or hanging); null when none.</summary>
        bool[] Zone(Part p, Droop dr, int e)
        {
            if (p.zone[e] != null) return p.zone[e].Length == 0 ? null : p.zone[e];
            var toBody = ToBody(p);
            var inZone = new bool[p.rest.Length];
            var any = false;
            for (var v = 0; v < p.rest.Length; v++) any |= inZone[v] = InZone(dr, toBody.MultiplyPoint3x4(p.rest[v]));
            p.zone[e] = any ? inZone : Array.Empty<bool>();
            return any ? inZone : null;
        }

        static int TornVertex(Part p, int v, Matrix4x4 toBody, Vector2[] uv, int[] map, List<Vector3> verts, List<Vector3> normals, List<Vector2> uvs)
        {
            if (map[v] > 0) return map[v] - 1;
            map[v] = verts.Count + 1;
            verts.Add(toBody.MultiplyPoint3x4(p.pos[v]));
            normals.Add(toBody.MultiplyVector(p.normal[v]).normalized);
            uvs.Add(uv != null && v < uv.Length ? uv[v] : Vector2.zero);
            return verts.Count - 1;
        }

        static bool InZone(Droop dr, Vector3 r) => (r.z - dr.endZ) * dr.end >= -dr.zone && r.y <= dr.top;

        readonly Queue<Job> _jobs = new();
        Job _job;

        /// <summary>
        /// Queues a dent: the crush plane is found now (wheels and marks need it at once), the vertices move over the next
        /// frames within <see cref="Work"/>'s budget — a crash crumples over ~0.1 s anyway. NaN when nothing is near.
        /// </summary>
        public float Enqueue(in Dent dent, float maxTotal)
        {
            _sw.Restart();
            var plane = PlaneFor(dent);
            Timing = $"plane {_sw.Elapsed.TotalMilliseconds:F2} ms";
            LastPlane = plane;
            if (float.IsNaN(plane) || dent.depth <= 0f) return plane;
            _jobs.Enqueue(new Job
            {
                dent = dent,
                plane = plane,
                knee = Knee(dent.depth),
                buckleLen = Mathf.Max(0.12f, dent.depth * 1.3f),
                buckleAmp = dent.depth * 0.22f * dent.crumple,
                maxTotal = maxTotal,
            });
            return plane;
        }

        /// <summary>The soft knee of the crush for a depth (also used to ask the field at a wheel).</summary>
        public static float Knee(float depth) => Mathf.Max(0.025f, depth * 0.3f);

        bool StepDroop(Job job, float budgetMs)
        {
            var dr = job.droop;
            var max2 = job.maxTotal * job.maxTotal;
            var maxSeen = _maxDisplacement * _maxDisplacement;
            for (; job.part < _parts.Count; job.part++, job.index = 0)
            {
                var p = _parts[job.part];
                if (!p.filter.gameObject.activeInHierarchy) continue;
                Prepare(p);
                var toBody = ToBody(p);
                var fromBody = toBody.inverse;
                // Down, and a little out of the end: the bumper sags away from the body.
                var downL = fromBody.MultiplyVector(Vector3.down);
                var outL = fromBody.MultiplyVector(Vector3.forward * dr.end);
                var i = job.index;
                for (; i < p.pos.Length; i++)
                {
                    if ((i & 1023) == 1023 && _sw.Elapsed.TotalMilliseconds > budgetMs)
                    {
                        job.index = i;
                        _maxDisplacement = Mathf.Sqrt(maxSeen);
                        return false;
                    }
                    var r = toBody.MultiplyPoint3x4(p.rest[i]); // by the modelled shape: the bumper is found even crushed
                    var along = (r.z - dr.endZ) * dr.end; // 0 at the very end, negative inwards
                    if (along < -dr.zone || r.y > dr.top) continue;
                    var wz = Smooth(1f + along / dr.zone);
                    var wy = Smooth((dr.top - r.y) / 0.08f);
                    var wx = Smooth((r.x * dr.side / dr.halfWidth + 1f) * 0.5f); // 0 at the held side, 1 at the hanging one
                    var w = wz * wy * wx * wx;
                    if (w < 1e-3f) continue;
                    var next = p.pos[i] + (downL * 1f + outL * 0.3f) * (dr.amount * w);
                    var total = next - p.rest[i];
                    var t2 = total.sqrMagnitude;
                    if (t2 > max2)
                    {
                        next = p.rest[i] + total * (job.maxTotal / Mathf.Sqrt(t2));
                        t2 = max2;
                    }
                    p.pos[i] = next;
                    if (!p.moved[i]) p.movedList.Add(i);
                    p.moved[i] = true;
                    p.dirty = true;
                    p.normalCursor = -1;
                    LastMoved++;
                    if (t2 > maxSeen) maxSeen = t2;
                }
            }
            _maxDisplacement = Mathf.Sqrt(maxSeen);
            return true;
        }

        /// <summary>Parts moved but not yet re-normalled and uploaded.</summary>
        public bool Pending
        {
            get
            {
                foreach (var p in _parts) if (p.dirty) return true;
                return false;
            }
        }

        /// <summary>Dents still moving vertices, or moved vertices not yet re-normalled and uploaded.</summary>
        public bool Busy => _job != null || _jobs.Count > 0 || Pending;

        /// <summary>Pushes the vertices at once and finishes (tests, tools); returns the largest push, m.</summary>
        public float Apply(in Dent dent, float maxTotal, out float plane)
        {
            plane = Enqueue(dent, maxTotal);
            _largest = 0f;
            LastMoved = 0;
            Work(float.PositiveInfinity);
            return Mathf.Sqrt(_largest);
        }

        float _largest;

        /// <summary>
        /// Moves queued dents' vertices, then re-normals and uploads, until <paramref name="budgetMs"/> is used; returns the
        /// time it took. Called once a frame.
        /// </summary>
        public float Work(float budgetMs)
        {
            _sw.Restart();
            double tUpload = 0;
            while (true)
            {
                if (_job == null)
                {
                    if (_jobs.Count == 0) break;
                    _job = _jobs.Dequeue();
                    _job.part = 0;
                    _job.index = 0;
                }
                if (!Step(_job, budgetMs)) break; // out of time mid-job
                _job = null;
            }
            if (_job == null && _jobs.Count == 0)
                foreach (var p in _parts)
                {
                    if (!p.dirty) continue;
                    if (_sw.Elapsed.TotalMilliseconds > budgetMs) break;
                    if (!NormalsStep(p, budgetMs)) break;
                    var u0 = _sw.Elapsed.TotalMilliseconds;
                    Upload(p);
                    tUpload += _sw.Elapsed.TotalMilliseconds - u0;
                    foreach (var i in p.movedList) p.moved[i] = false;
                    p.movedList.Clear();
                    p.dirty = false;
                    p.normalCursor = -1;
                }
            var ms = (float)_sw.Elapsed.TotalMilliseconds;
            if (ms > WorstWorkMs)
            {
                WorstWorkMs = ms;
                WorstWorkDetail = $"{ms:F2} ms (upload {tUpload:F2}, budget {budgetMs:F1})";
            }
            return ms;
        }

        /// <summary>Longest single <see cref="Work"/> call, ms (the per-frame cost of damage).</summary>
        public float WorstWorkMs { get; private set; }
        public string WorstWorkDetail { get; private set; } = "";
        public void ResetCost()
        {
            WorstWorkMs = 0f;
            WorstWorkDetail = "";
        }

        /// <summary>Normals and upload of everything moved, now (tests).</summary>
        public void Finish()
        {
            Work(float.PositiveInfinity);
        }

        /// <summary>One job across the parts; false when the budget ran out before its end.</summary>
        bool Step(Job job, float budgetMs)
        {
            if (job.droop != null) return StepDroop(job, budgetMs);
            var dent = job.dent;
            var plane = job.plane;
            var knee = job.knee;
            var buckleLen = job.buckleLen;
            var buckleAmp = job.buckleAmp;
            var maxTotal = job.maxTotal;
            var max2 = maxTotal * maxTotal;
            var maxPush = MaxPush(dent.depth);
            var maxSeen = _maxDisplacement * _maxDisplacement;
            for (; job.part < _parts.Count; job.part++, job.index = 0)
            {
                var p = _parts[job.part];
                if (!p.filter.gameObject.activeInHierarchy) continue;
                var toBody = ToBody(p);
                if (job.index == 0 && !Reaches(p, toBody, dent)) continue;
                Prepare(p);
                var fromBody = toBody.inverse;
                var c = fromBody.MultiplyPoint3x4(dent.point);
                var dir = fromBody.MultiplyVector(dent.dir).normalized;
                var pos = p.pos;
                var rest = p.rest;
                float cx = c.x, cy = c.y, cz = c.z, dx = dir.x, dy = dir.y, dz = dir.z;
                var r2 = dent.radius * dent.radius;
                // Past this along the crush nothing moves: the knee has died out and the buckle band ended.
                var reach = plane + Mathf.Max(6f * knee, buckleLen);
                var i = job.index;
                for (; i < pos.Length; i++)
                {
                    if ((i & 1023) == 1023 && _sw.Elapsed.TotalMilliseconds > budgetMs)
                    {
                        job.index = i;
                        _maxDisplacement = Mathf.Sqrt(maxSeen);
                        return false;
                    }
                    // Plain floats in the hot loop: Vector3 operators cost twice as much here (Mono and WebAssembly).
                    var v = pos[i];
                    float ox = v.x - cx, oy = v.y - cy, oz = v.z - cz;
                    var d = ox * dx + oy * dy + oz * dz;
                    if (d > reach) continue;
                    float lx = ox - dx * d, ly = oy - dy * d, lz = oz - dz * d;
                    var lat2 = lx * lx + ly * ly + lz * lz;
                    if (lat2 >= r2) continue;
                    var lat = Mathf.Sqrt(lat2);
                    var push = Field(d, lat, plane, knee, dent.radius, maxPush);
                    // Buckling: sheet that runs along the crush (bonnet, wings, roof) folds out in a ridge just behind the
                    // crush plane instead of only sliding back.
                    var buckle = 0f;
                    var t = (d - plane) / buckleLen;
                    var n = p.restNormal[i];
                    if (t > -0.2f && t < 1f)
                    {
                        var along = Mathf.Abs(n.x * dx + n.y * dy + n.z * dz);
                        if (along < 0.6f)
                        {
                            var x = lat / dent.radius;
                            var w = x < 0.35f ? 1f : 1f - Smooth((x - 0.35f) / 0.65f);
                            buckle = Mathf.Sin(Mathf.PI * Mathf.Clamp01(t + 0.2f) / 1.2f) * w * (1f - along / 0.6f) * buckleAmp;
                        }
                    }
                    if (push < 1e-4f && buckle < 1e-4f) continue;
                    // Crumple: the push varies over a hand's width (smooth noise, not per vertex), the ridge too, and the
                    // sheet gathers a little towards the centre.
                    var r = rest[i];
                    var h = Noise(r.x * 9f, r.y * 9f, r.z * 9f, dent.seed);
                    push *= 1f + dent.crumple * (h - 0.5f) * 0.8f;
                    buckle *= 0.55f + 0.9f * h;
                    var gather = lat > 1e-4f ? push * dent.crumple * 0.15f * (1f - h) / lat : 0f;
                    var nx = v.x + dx * push + n.x * buckle - lx * gather;
                    var ny = v.y + dy * push + n.y * buckle - ly * gather;
                    var nz = v.z + dz * push + n.z * buckle - lz * gather;
                    // Never further than maxTotal from where it was modelled: a crushed front stays a front.
                    float tx = nx - r.x, ty = ny - r.y, tz = nz - r.z;
                    var tot2 = tx * tx + ty * ty + tz * tz;
                    if (tot2 > max2)
                    {
                        var k = maxTotal / Mathf.Sqrt(tot2);
                        nx = r.x + tx * k;
                        ny = r.y + ty * k;
                        nz = r.z + tz * k;
                        tot2 = max2;
                    }
                    float mx = nx - v.x, my = ny - v.y, mz = nz - v.z;
                    var moved2 = mx * mx + my * my + mz * mz;
                    if (moved2 < 1e-8f) continue;
                    pos[i] = new Vector3(nx, ny, nz);
                    if (!p.moved[i]) p.movedList.Add(i);
                    p.moved[i] = true;
                    p.dirty = true;
                    p.normalCursor = -1;
                    LastMoved++;
                    if (moved2 > _largest) _largest = moved2;
                    if (tot2 > maxSeen) maxSeen = tot2;
                }
            }
            _maxDisplacement = Mathf.Sqrt(maxSeen);
            return true;
        }

        /// <summary>
        /// Normals of moved faces: the authored normal turned by how its faces turned (keeps creases as modelled). In
        /// slices within the budget; true when the part is done.
        /// </summary>
        bool NormalsStep(Part p, float budgetMs)
        {
            var tris = p.tris;
            var touched = p.touched;
            if (p.normalCursor < 0)
            {
                p.touchedList.Clear();
                p.touchCursor = 0;
                p.normalCursor = int.MaxValue; // collecting
            }
            if (p.normalCursor == int.MaxValue)
            {
                // Touched: every vertex of a face that has a moved vertex (in slices too: a wreck moves ~9 000).
                var moved = p.movedList;
                for (; p.touchCursor < moved.Count; p.touchCursor++)
                {
                    if ((p.touchCursor & 255) == 255 && _sw.Elapsed.TotalMilliseconds > budgetMs) return false;
                    var v = moved[p.touchCursor];
                    for (var k = p.faceStart[v]; k < p.faceStart[v + 1]; k++)
                    {
                        var f = p.faceList[k] * 3;
                        for (var c = 0; c < 3; c++)
                        {
                            var u = tris[f + c];
                            if (touched[u]) continue;
                            touched[u] = true;
                            p.touchedList.Add(u);
                        }
                    }
                }
                foreach (var v in p.touchedList) touched[v] = false;
                p.stamp++;
                p.normalCursor = 0;
            }
            var list = p.touchedList;
            for (; p.normalCursor < list.Count; p.normalCursor++)
            {
                if ((p.normalCursor & 511) == 511 && _sw.Elapsed.TotalMilliseconds > budgetMs) return false;
                var v = list[p.normalCursor];
                var from = Vector3.zero;
                var to = Vector3.zero;
                for (var k = p.faceStart[v]; k < p.faceStart[v + 1]; k++)
                {
                    var f = p.faceList[k];
                    if (p.faceStamp[f] != p.stamp)
                    {
                        p.faceStamp[f] = p.stamp;
                        p.faceNow[f] = Face(p.pos, tris, f);
                    }
                    from += p.restFace[f];
                    to += p.faceNow[f];
                }
                if (from.sqrMagnitude < 1e-12f || to.sqrMagnitude < 1e-12f) continue;
                p.normal[v] = Quaternion.FromToRotation(from, to) * p.restNormal[v];
            }
            return true;
        }


        void EnsureCopy(Part p)
        {
            if (p.work == null)
            {
                p.work = UnityEngine.Object.Instantiate(p.shared);
                p.work.name = p.shared.name + " (dented)";
                p.work.MarkDynamic();
                p.filter.sharedMesh = p.work;
            }
        }

        void Upload(Part p)
        {
            EnsureCopy(p);
            p.work.SetVertices(p.pos);
            p.work.SetNormals(p.normal);
            p.work.RecalculateBounds();
        }

        /// <summary>Removes the triangles of sub-mesh <paramref name="subMesh"/> whose centre lies within <paramref name="radius"/> of a body-space point (a window breaking out).</summary>
        public int RemoveTriangles(Part p, int subMesh, Vector3 bodyPoint, float radius)
        {
            Prepare(p);
            if (subMesh < 0 || subMesh >= p.subMeshes.Length) return 0;
            var c = ToBody(p).inverse.MultiplyPoint3x4(bodyPoint);
            var info = p.subMeshes[subMesh];
            var r2 = radius * radius;
            var removed = 0;
            for (var k = info.indexStart; k < info.indexStart + info.indexCount; k += 3)
            {
                int a = p.tris[k], b = p.tris[k + 1], cc = p.tris[k + 2];
                if (a == b && b == cc) continue;
                var centre = (p.pos[a] + p.pos[b] + p.pos[cc]) / 3f;
                if ((centre - c).sqrMagnitude > r2) continue;
                p.tris[k + 1] = p.tris[k + 2] = a; // degenerate: draws nothing, keeps the index count
                removed++;
            }
            if (removed == 0) return 0;
            if (p.work == null) Upload(p);
            p.work.SetIndices(p.tris, info.indexStart, info.indexCount, MeshTopology.Triangles, subMesh, false);
            return removed;
        }

        /// <summary>Back to the modelled body: original meshes, nothing moved.</summary>
        public void Restore()
        {
            _jobs.Clear();
            _job = null;
            foreach (var p in _parts)
            {
                if (p.work != null)
                {
                    p.filter.sharedMesh = p.shared;
                    if (Application.isPlaying) UnityEngine.Object.Destroy(p.work);
                    else UnityEngine.Object.DestroyImmediate(p.work);
                    p.work = null;
                }
                if (!p.ready) continue;
                Array.Copy(p.rest, p.pos, p.rest.Length);
                Array.Copy(p.restNormal, p.normal, p.restNormal.Length);
                foreach (var i in p.movedList) p.moved[i] = false;
                p.movedList.Clear();
                p.dirty = false;
                p.normalCursor = -1;
                p.tris = p.shared.triangles;
            }
            _maxDisplacement = 0f;
            LastMoved = 0;
        }

        /// <summary>World position of a vertex as it is now (decals, debris colours).</summary>
        public Vector3 BodyPosition(Part p, int i) => ToBody(p).MultiplyPoint3x4(p.pos[i]);

        public Matrix4x4 PartToBody(Part p) => ToBody(p);

        /// <summary>Smooth 0…1 value noise on a unit lattice (trilinear between hashed corners).</summary>
        static float Noise(float px, float py, float pz, int seed)
        {
            var x0 = Mathf.FloorToInt(px);
            var y0 = Mathf.FloorToInt(py);
            var z0 = Mathf.FloorToInt(pz);
            var fx = px - x0;
            var fy = py - y0;
            var fz = pz - z0;
            fx = fx * fx * (3f - 2f * fx);
            fy = fy * fy * (3f - 2f * fy);
            fz = fz * fz * (3f - 2f * fz);
            var a = Lerp(Lerp(Lattice(x0, y0, z0, seed), Lattice(x0 + 1, y0, z0, seed), fx), Lerp(Lattice(x0, y0 + 1, z0, seed), Lattice(x0 + 1, y0 + 1, z0, seed), fx), fy);
            var b = Lerp(Lerp(Lattice(x0, y0, z0 + 1, seed), Lattice(x0 + 1, y0, z0 + 1, seed), fx), Lerp(Lattice(x0, y0 + 1, z0 + 1, seed), Lattice(x0 + 1, y0 + 1, z0 + 1, seed), fx), fy);
            return Lerp(a, b, fz);
        }

        static float Lerp(float a, float b, float t) => a + (b - a) * t;

        static float Lattice(int x, int y, int z, int seed)
        {
            unchecked
            {
                var h = x * 73856093 ^ y * 19349663 ^ z * 83492791 ^ seed * 668265263;
                h = (h ^ (h >> 13)) * 1274126177;
                h ^= h >> 16;
                return (h & 0xffff) / 65535f;
            }
        }
    }
}
