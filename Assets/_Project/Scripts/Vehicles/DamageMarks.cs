using System.Collections.Generic;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Scratches, scuffs and glass cracks as thin mesh decals that follow the dented body: each mark copies the body
    /// triangles of one material (paint or glass) around the hit, keeps their vertex indices, and is rebuilt from the
    /// deformed positions — so a scratch stays on the panel when the panel folds later. All marks of a car are one mesh
    /// and one draw call. The texture atlas is drawn at start (no download): scratch streaks, crumpled paint, rubber,
    /// spider-web and shattered glass.
    /// </summary>
    public sealed class DamageMarks
    {
        public enum Tile { Scratch = 0, Scratch2 = 1, Scuff = 2, Rubber = 3, Crack = 4, Crack2 = 5, Shatter = 6 }

        const int Cols = 4, Rows = 2, TileSize = 128;
        const float Lift = 0.004f; // m above the paint: no z-fighting, no visible gap

        sealed class Mark
        {
            public CarBodyDeformer.Part part;
            public int[] verts;   // into part.pos
            public int[] tris;    // into verts
            public Vector2[] uv;
        }

        readonly CarBodyDeformer _body;
        readonly List<Mark> _marks = new();
        readonly int _max;
        readonly Mesh _mesh;
        readonly GameObject _go;
        readonly List<Vector3> _v = new();
        readonly List<Vector3> _n = new();
        readonly List<Vector2> _uv = new();
        readonly List<int> _t = new();
        readonly Dictionary<int, int> _map = new();
        int _next;

        public int Count => _marks.Count;
        public string LastAdd { get; private set; } = "";
        readonly System.Diagnostics.Stopwatch _sw = new();

        static Material _material;
        static RenderTexture _atlas;
        static Texture2D _source;
        static Color32[] _cols;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _material = null;
            _atlas = null;
            _source = null;
            _cols = null;
            _px = null;
            _fade = null;
        }

        public DamageMarks(CarBodyDeformer body, Material template, int max)
        {
            _body = body;
            _max = Mathf.Max(1, max);
            _go = new GameObject("DamageMarks");
            _go.transform.SetParent(body.Body, false);
            _mesh = new Mesh { name = "DamageMarks" };
            _mesh.MarkDynamic();
            _go.AddComponent<MeshFilter>().sharedMesh = _mesh;
            var r = _go.AddComponent<MeshRenderer>();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = true;
            r.sharedMaterial = MaterialFor(template);
            _go.SetActive(false);
        }

        public static Material MaterialFor(Material template)
        {
            if (template == null) return null;
            if (_material != null) return _material;
            _material = new Material(template) { name = "DamageMarks (atlas)" };
            if (_atlas != null && _atlas.IsCreated()) _material.SetTexture("_BaseMap", _atlas);
            // After the car's own glass (also transparent): a crack is on the pane, not behind it.
            _material.renderQueue = template.renderQueue + 2;
            return _material;
        }

        /// <summary>
        /// A mark of <paramref name="tile"/> on sub-mesh <paramref name="subMesh"/> of <paramref name="part"/>, centred at
        /// a body-space point, over faces looking against <paramref name="into"/>, streaks along <paramref name="along"/>.
        /// False when no face of that material is there.
        /// </summary>
        public bool Add(CarBodyDeformer.Part part, int subMesh, Vector3 bodyPoint, Vector3 into, Vector3 along, float radius, Tile tile)
        {
            if (part == null || subMesh < 0) return false;
            _sw.Restart();
            _ = Atlas; // normally drawn in the frames after the car was built
            _body.Prepare(part);
            if (subMesh >= part.subMeshes.Length) return false;
            var toBody = _body.PartToBody(part);
            var fromBody = toBody.inverse;
            var c = fromBody.MultiplyPoint3x4(bodyPoint);
            var dir = fromBody.MultiplyVector(into).normalized;
            var u = Vector3.ProjectOnPlane(fromBody.MultiplyVector(along), dir);
            if (u.sqrMagnitude < 1e-6f) u = Vector3.ProjectOnPlane(Vector3.up, dir);
            if (u.sqrMagnitude < 1e-6f) u = Vector3.ProjectOnPlane(Vector3.right, dir);
            u.Normalize();
            var v = Vector3.Cross(dir, u);
            var info = part.subMeshes[subMesh];
            // A little beyond the tile's circle: the faces at the rim carry alpha 0 there, so the mark has no edge.
            var r2 = radius * radius * 1.5f;
            _map.Clear();
            var verts = new List<int>();
            var tris = new List<int>();
            var pos = part.pos;
            for (var k = info.indexStart; k < info.indexStart + info.indexCount; k += 3)
            {
                int a = part.tris[k], b = part.tris[k + 1], cc = part.tris[k + 2];
                if (a == b || b == cc) continue; // removed (broken window)
                var centre = (pos[a] + pos[b] + pos[cc]) / 3f;
                if ((centre - c).sqrMagnitude > r2) continue;
                var n = Vector3.Cross(pos[b] - pos[a], pos[cc] - pos[a]);
                if (n.sqrMagnitude < 1e-14f || Vector3.Dot(n.normalized, -dir) < 0.15f) continue;
                tris.Add(Index(a, verts));
                tris.Add(Index(b, verts));
                tris.Add(Index(cc, verts));
            }
            var tFaces = _sw.Elapsed.TotalMilliseconds;
            if (tris.Count == 0) return false;
            var col = (int)tile % Cols;
            var row = (int)tile / Cols;
            var tileUv = new Vector2((float)col / Cols, (float)row / Rows);
            var scale = new Vector2(1f / Cols, 1f / Rows);
            var uv = new Vector2[verts.Count];
            // Planar map from the modelled positions: the mark sticks to the sheet when it folds later.
            for (var i = 0; i < verts.Count; i++)
            {
                var o = part.rest[verts[i]] - c;
                var x = Mathf.Clamp(Vector3.Dot(o, u) / radius * 0.5f + 0.5f, 0.01f, 0.99f);
                var y = Mathf.Clamp(Vector3.Dot(o, v) / radius * 0.5f + 0.5f, 0.01f, 0.99f);
                uv[i] = tileUv + new Vector2(x * scale.x, y * scale.y);
            }
            var mark = new Mark { part = part, verts = verts.ToArray(), tris = tris.ToArray(), uv = uv };
            if (_marks.Count < _max) _marks.Add(mark);
            else
            {
                _marks[_next] = mark; // the oldest goes
                _next = (_next + 1) % _max;
            }
            var tUv = _sw.Elapsed.TotalMilliseconds;
            Rebuild();
            LastAdd = $"faces {tFaces:F2}, uv {tUv - tFaces:F2}, rebuild {_sw.Elapsed.TotalMilliseconds - tUv:F2} ms";
            return true;

            int Index(int vi, List<int> list)
            {
                if (_map.TryGetValue(vi, out var at)) return at;
                at = list.Count;
                list.Add(vi);
                _map[vi] = at;
                return at;
            }
        }

        /// <summary>Follows the body after a dent.</summary>
        public void Rebuild()
        {
            _v.Clear();
            _n.Clear();
            _uv.Clear();
            _t.Clear();
            foreach (var m in _marks)
            {
                var toBody = _body.PartToBody(m.part);
                var start = _v.Count;
                for (var i = 0; i < m.verts.Length; i++)
                {
                    var vi = m.verts[i];
                    var n = toBody.MultiplyVector(m.part.normal[vi]).normalized;
                    _v.Add(toBody.MultiplyPoint3x4(m.part.pos[vi]) + n * Lift);
                    _n.Add(n);
                    _uv.Add(m.uv[i]);
                }
                foreach (var t in m.tris) _t.Add(start + t);
            }
            _mesh.Clear();
            if (_t.Count == 0)
            {
                _go.SetActive(false);
                return;
            }
            _mesh.indexFormat = _v.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16;
            _mesh.SetVertices(_v);
            _mesh.SetNormals(_n);
            _mesh.SetUVs(0, _uv);
            _mesh.SetTriangles(_t, 0);
            _mesh.RecalculateBounds();
            _go.SetActive(true);
        }

        /// <summary>
        /// The marks object drawn once, empty, ahead of the first crash: its first appearance cost ~2 ms in that frame
        /// (renderer, material, mesh set up). Marks the car with nothing visible.
        /// </summary>
        public void Warm()
        {
            if (_warmed) return;
            _warmed = true;
            _mesh.SetVertices(new[] { Vector3.zero, Vector3.zero, Vector3.zero });
            _mesh.SetNormals(new[] { Vector3.up, Vector3.up, Vector3.up });
            _mesh.SetUVs(0, new[] { Vector2.zero, Vector2.zero, Vector2.zero });
            _mesh.SetTriangles(new[] { 0, 1, 2 }, 0);
            _go.SetActive(true);
        }

        bool _warmed;
        public bool Warmed => _warmed;

        public void Clear()
        {
            _marks.Clear();
            _next = 0;
            Rebuild();
        }

        public void Destroy()
        {
            if (_mesh != null) Kill(_mesh);
            if (_go != null) Kill(_go);
        }

        static void Kill(Object o)
        {
            if (Application.isPlaying) Object.Destroy(o);
            else Object.DestroyImmediate(o);
        }

        // ── the atlas ────────────────────────────────────────────────────────

        static Color[] _px;
        static int _drawn;
        static System.Random _atlasRng;

        /// <summary>The marks texture is drawn and on the GPU.</summary>
        public static bool AtlasReady => _atlas != null && _atlas.IsCreated();

        /// <summary>Draws one more tile of the atlas ahead of the first mark (spread over frames); false when done.</summary>
        public static bool WarmAtlas()
        {
            if (_atlas != null && _atlas.IsCreated()) return false;
            if (_source != null)
            {
                Upload(); // a lost render texture (WebGL context): just copy again
                return false;
            }
            if (_px == null)
            {
                _px = new Color[Cols * TileSize * Rows * TileSize];
                _cols = new Color32[_px.Length];
                _drawn = 0;
                _atlasRng = new System.Random(47);
                return true;
            }
            var w = Cols * TileSize;
            if (_drawn < Cols * Rows)
            {
                int ox = _drawn % Cols * TileSize, oy = _drawn / Cols * TileSize;
                DrawTile((Tile)_drawn, _px, w, ox, oy, _atlasRng);
                for (var y = oy; y < oy + TileSize; y++)
                    for (var x = ox; x < ox + TileSize; x++)
                        _cols[y * w + x] = _px[y * w + x];
                _drawn++;
                return true;
            }
            // No CPU mip chain (that cost ~5 ms): the texture goes up once and the GPU builds the mips of a render texture.
            _source = new Texture2D(w, Rows * TileSize, TextureFormat.RGBA32, false) { name = "DamageMarks (source)", wrapMode = TextureWrapMode.Clamp };
            _source.SetPixels32(_cols);
            _source.Apply(false, true);
            _px = null;
            _cols = null;
            Upload();
            return false;
        }

        static void Upload()
        {
            if (_atlas == null)
                _atlas = new RenderTexture(_source.width, _source.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                {
                    name = "DamageMarks", useMipMap = true, autoGenerateMips = true, wrapMode = TextureWrapMode.Clamp,
                    filterMode = FilterMode.Trilinear, anisoLevel = 2,
                };
            if (!_atlas.IsCreated()) _atlas.Create();
            Graphics.Blit(_source, _atlas);
            if (_material != null) _material.SetTexture("_BaseMap", _atlas);
        }

        /// <summary>The marks texture, drawn once per session: 4 × 2 tiles of 128 px.</summary>
        public static Texture Atlas
        {
            get
            {
                for (var guard = 0; guard < 16 && WarmAtlas(); guard++) { }
                return _atlas;
            }
        }

        static float R(System.Random r, float a, float b) => a + (float)r.NextDouble() * (b - a);

        static void DrawTile(Tile tile, Color[] px, int w, int ox, int oy, System.Random rng)
        {
            var c = new Vector2(TileSize * 0.5f, TileSize * 0.5f);
            switch (tile)
            {
                case Tile.Scratch:
                case Tile.Scratch2:
                {
                    // A scraped band: a grey haze of abraded paint, dark grooves (primer, the wall's grime) and bright
                    // metal in the deepest ones — readable on white paint as on black. Denser in the middle, along u.
                    var n = tile == Tile.Scratch ? 70 : 46;
                    for (var i = 0; i < 14; i++)
                    {
                        var y = c.y + Gauss(rng) * 14f;
                        var len = R(rng, 50f, 110f);
                        var x0 = c.x - len * 0.5f + Gauss(rng) * 8f;
                        Line(px, w, ox, oy, new Vector2(x0, y), new Vector2(x0 + len, y + R(rng, -2f, 2f)), R(rng, 5f, 11f), new Color(0.38f, 0.38f, 0.39f, 0.42f));
                    }
                    for (var i = 0; i < n; i++)
                    {
                        var y = c.y + Gauss(rng) * 20f;
                        var len = R(rng, 18f, 100f);
                        var x0 = c.x + Gauss(rng) * 18f - len * 0.5f;
                        var slope = R(rng, -0.05f, 0.05f);
                        var width = R(rng, 0.5f, tile == Tile.Scratch ? 1.4f : 2.3f);
                        var dark = rng.NextDouble() < 0.55;
                        var v = dark ? R(rng, 0.06f, 0.22f) : R(rng, 0.7f, 0.95f);
                        Line(px, w, ox, oy, new Vector2(x0, y), new Vector2(x0 + len, y + slope * len), width, new Color(v, v, v * 1.02f, dark ? R(rng, 0.7f, 0.95f) : R(rng, 0.6f, 1f)));
                    }
                    break;
                }
                case Tile.Scuff:
                {
                    // Crumpled, scraped paint: an irregular abraded area (noise, not circles) of dull grey, chipped
                    // flakes with jagged edges showing primer and bare metal, dark creases where the sheet folded.
                    Haze(px, w, ox, oy, rng, 0.055f, 0.3f, new Color(0.36f, 0.36f, 0.37f, 0.55f));
                    for (var i = 0; i < 46; i++)
                    {
                        var p = c + new Vector2(Gauss(rng), Gauss(rng)) * 24f;
                        var metal = rng.NextDouble() < 0.5;
                        var col = metal ? new Color(0.8f, 0.8f, 0.82f, 0.95f) : new Color(0.5f, 0.51f, 0.5f, 0.9f);
                        // A flake: a few short thick strokes from one point, each its own angle — a jagged chip.
                        var size = R(rng, 1.5f, 5f);
                        for (var k = 0; k < 4; k++)
                        {
                            var a = R(rng, 0f, Mathf.PI * 2f);
                            Line(px, w, ox, oy, p, p + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * size * R(rng, 0.6f, 1.3f), size * R(rng, 0.5f, 0.9f), col);
                        }
                    }
                    for (var i = 0; i < 18; i++)
                    {
                        var p = c + new Vector2(Gauss(rng), Gauss(rng)) * 26f;
                        var a = R(rng, 0f, Mathf.PI * 2f);
                        var q = p;
                        for (var k = 0; k < 6; k++)
                        {
                            a += R(rng, -0.7f, 0.7f);
                            var next = q + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * R(rng, 4f, 11f);
                            Line(px, w, ox, oy, q, next, R(rng, 0.8f, 1.8f), new Color(0.04f, 0.04f, 0.04f, 0.8f));
                            q = next;
                        }
                    }
                    break;
                }
                case Tile.Rubber:
                {
                    for (var i = 0; i < 26; i++)
                    {
                        var y = c.y + Gauss(rng) * 18f;
                        var len = R(rng, 30f, 100f);
                        var x0 = c.x - len * 0.5f + Gauss(rng) * 10f;
                        Line(px, w, ox, oy, new Vector2(x0, y), new Vector2(x0 + len, y + R(rng, -3f, 3f)), R(rng, 1.5f, 4f), new Color(0.06f, 0.06f, 0.06f, R(rng, 0.25f, 0.6f)));
                    }
                    break;
                }
                case Tile.Crack:
                case Tile.Crack2:
                case Tile.Shatter:
                {
                    // Spider web: rays from the impact, then rings joining them.
                    var rays = tile == Tile.Shatter ? 26 : tile == Tile.Crack ? 13 : 9;
                    var reach = tile == Tile.Crack2 ? 44f : 58f;
                    var ends = new List<Vector2>[rays];
                    var white = new Color(0.94f, 0.97f, 1f, 0.95f);
                    for (var i = 0; i < rays; i++)
                    {
                        ends[i] = new List<Vector2> { c };
                        var a = (i + R(rng, -0.3f, 0.3f)) / rays * Mathf.PI * 2f;
                        var q = c;
                        var len = reach * R(rng, 0.55f, 1f);
                        for (var d = 0f; d < len;)
                        {
                            var step = R(rng, 5f, 10f);
                            a += R(rng, -0.25f, 0.25f);
                            var next = q + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * step;
                            Line(px, w, ox, oy, q, next, Mathf.Lerp(1.4f, 0.5f, d / len), white);
                            q = next;
                            d += step;
                            ends[i].Add(q);
                        }
                    }
                    var rings = tile == Tile.Shatter ? 6 : 3;
                    for (var k = 1; k <= rings; k++)
                        for (var i = 0; i < rays; i++)
                        {
                            if (rng.NextDouble() < 0.3) continue;
                            var a = ends[i];
                            var b = ends[(i + 1) % rays];
                            var j = Mathf.Min(k * 2, Mathf.Min(a.Count, b.Count) - 1);
                            if (j < 1) continue;
                            Line(px, w, ox, oy, a[j], b[j], 0.6f, new Color(0.94f, 0.97f, 1f, 0.75f));
                        }
                    // The crushed spot at the centre.
                    Blob(px, w, ox, oy, c, tile == Tile.Shatter ? 9f : 4f, new Color(0.9f, 0.94f, 0.97f, 0.7f));
                    break;
                }
            }
            // Every tile fades out to its rim: a mark has no edge.
            var fade = Fade;
            for (var y = 0; y < TileSize; y++)
            {
                var row = (oy + y) * w + ox;
                for (var x = 0; x < TileSize; x++) px[row + x].a *= fade[y * TileSize + x];
            }
        }

        static float[] _fade;
        static float[] Fade
        {
            get
            {
                if (_fade != null) return _fade;
                _fade = new float[TileSize * TileSize];
                var h = TileSize * 0.5f;
                for (var y = 0; y < TileSize; y++)
                    for (var x = 0; x < TileSize; x++)
                    {
                        float dx = x + 0.5f - h, dy = y + 0.5f - h;
                        _fade[y * TileSize + x] = 1f - Mathf.SmoothStep(0.5f, 0.92f, Mathf.Sqrt(dx * dx + dy * dy) / h);
                    }
                return _fade;
            }
        }

        /// <summary>An irregular patch around the tile centre: value noise above a threshold, fading outwards.</summary>
        static void Haze(Color[] px, int w, int ox, int oy, System.Random rng, float freq, float threshold, Color col)
        {
            var seed = rng.Next();
            var h = TileSize * 0.5f;
            for (var y = 0; y < TileSize; y++)
                for (var x = 0; x < TileSize; x++)
                {
                    float dx = (x - h) / h, dy = (y - h) / h;
                    var r2 = dx * dx + dy * dy;
                    if (r2 > 0.7f) continue; // nothing can show out there (and the tile fades anyway)
                    var r = Mathf.Sqrt(r2);
                    var n = 0.7f * Value(x * freq, y * freq, seed) + 0.3f * Value(x * freq * 2.7f, y * freq * 2.7f, seed + 1);
                    var v = n - threshold - r * 0.45f;
                    if (v <= 0f) continue;
                    Over(px, (oy + y) * w + ox + x, col, Mathf.Clamp01(v * 6f));
                }
        }

        static float Value(float x, float y, int seed)
        {
            var x0 = Mathf.FloorToInt(x);
            var y0 = Mathf.FloorToInt(y);
            float fx = x - x0, fy = y - y0;
            fx = fx * fx * (3f - 2f * fx);
            fy = fy * fy * (3f - 2f * fy);
            float a = Cell(x0, y0, seed), b = Cell(x0 + 1, y0, seed), c = Cell(x0, y0 + 1, seed), d = Cell(x0 + 1, y0 + 1, seed);
            return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
        }

        static float Cell(int x, int y, int seed)
        {
            unchecked
            {
                var h = x * 374761393 + y * 668265263 + seed * 1274126177;
                h = (h ^ (h >> 13)) * 1274126177;
                return ((h ^ (h >> 16)) & 0xffff) / 65535f;
            }
        }

        static float Gauss(System.Random r)
        {
            var s = 0f;
            for (var i = 0; i < 4; i++) s += (float)r.NextDouble();
            return (s - 2f) * 0.85f;
        }

        // Plain floats: the atlas is drawn in the frames after a car is built, a tile a frame — keep each under a millisecond.
        static void Line(Color[] px, int w, int ox, int oy, Vector2 a, Vector2 b, float width, Color col)
        {
            float ax = a.x, ay = a.y, abx = b.x - a.x, aby = b.y - a.y;
            var minX = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(a.x, b.x) - width - 1));
            var maxX = Mathf.Min(TileSize - 1, Mathf.CeilToInt(Mathf.Max(a.x, b.x) + width + 1));
            var minY = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(a.y, b.y) - width - 1));
            var maxY = Mathf.Min(TileSize - 1, Mathf.CeilToInt(Mathf.Max(a.y, b.y) + width + 1));
            var len2 = Mathf.Max(1e-4f, abx * abx + aby * aby);
            var half = width * 0.5f + 0.5f;
            var reach2 = (half + 0.01f) * (half + 0.01f);
            for (var y = minY; y <= maxY; y++)
            {
                var py = y + 0.5f - ay;
                var row = (oy + y) * w + ox;
                for (var x = minX; x <= maxX; x++)
                {
                    var px0 = x + 0.5f - ax;
                    var t = (px0 * abx + py * aby) / len2;
                    t = t < 0f ? 0f : t > 1f ? 1f : t;
                    float ex = px0 - abx * t, ey = py - aby * t;
                    var d2 = ex * ex + ey * ey;
                    if (d2 >= reach2) continue;
                    var cover = half - Mathf.Sqrt(d2);
                    if (cover > 0f) Over(px, row + x, col, cover > 1f ? 1f : cover);
                }
            }
        }

        static void Blob(Color[] px, int w, int ox, int oy, Vector2 p, float r, Color col)
        {
            for (var y = Mathf.Max(0, (int)(p.y - r - 1)); y <= Mathf.Min(TileSize - 1, (int)(p.y + r + 1)); y++)
                for (var x = Mathf.Max(0, (int)(p.x - r - 1)); x <= Mathf.Min(TileSize - 1, (int)(p.x + r + 1)); x++)
                {
                    float dx = x + 0.5f - p.x, dy = y + 0.5f - p.y;
                    var cover = r + 0.5f - Mathf.Sqrt(dx * dx + dy * dy);
                    if (cover > 0f) Over(px, (oy + y) * w + ox + x, col, cover > 1f ? 1f : cover);
                }
        }

        static void Over(Color[] px, int i, Color col, float cover)
        {
            var a = col.a * cover;
            var dst = px[i];
            var keep = dst.a * (1f - a);
            var outA = a + keep;
            if (outA <= 1e-5f) return;
            var inv = 1f / outA;
            px[i] = new Color((col.r * a + dst.r * keep) * inv, (col.g * a + dst.g * keep) * inv, (col.b * a + dst.b * keep) * inv, outA);
        }
    }
}
