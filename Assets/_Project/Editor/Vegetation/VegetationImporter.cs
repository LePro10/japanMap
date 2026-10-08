using System.Collections.Generic;
using System.IO;
using System.Linq;
using JapanMap.Editor.Map;
using JapanMap.World;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Vegetation
{
    /// <summary>
    /// Trees as Terrain tree instances (LODGroup prefabs, instanced) and grass/rice as Terrain detail
    /// meshes in coverage mode — Unity's own vegetation path, so draw distance and density follow the
    /// quality tier (<see cref="TerrainQuality"/>). Deterministic: same settings, same forest.
    /// Menu: JapanMap/Vegetation/Import (also part of JapanMap/Map/Import All).
    /// </summary>
    public static class VegetationImporter
    {
        const float FieldCell = 4f;
        const float ChunkSize = 64f;
        public const string DataPath = "Assets/_Project/Data/World/VegetationInstances.asset";
        public const string RendererName = "Vegetation";

        static void WriteData(List<VegetationData.Prototype> protos, List<(Vector2Int chunk, int proto, Vector3 pos, Vector3 shape)> instances)
        {
            var data = AssetDatabase.LoadAssetAtPath<VegetationData>(DataPath);
            if (data == null)
            {
                data = ScriptableObject.CreateInstance<VegetationData>();
                AssetDatabase.CreateAsset(data, DataPath);
            }
            var sorted = instances.OrderBy(i => i.chunk.y).ThenBy(i => i.chunk.x).ThenBy(i => i.proto).ToList();
            data.chunkSize = ChunkSize;
            data.prototypes = protos.ToArray();
            data.positions = sorted.Select(i => i.pos).ToArray();
            data.shapes = sorted.Select(i => i.shape).ToArray();
            var chunks = new List<VegetationData.Chunk>();
            for (var k = 0; k < sorted.Count;)
            {
                var key = sorted[k].chunk;
                var runs = new List<VegetationData.Run>();
                var b = new Bounds(sorted[k].pos, Vector3.zero);
                while (k < sorted.Count && sorted[k].chunk == key)
                {
                    var proto = sorted[k].proto;
                    var start = k;
                    while (k < sorted.Count && sorted[k].chunk == key && sorted[k].proto == proto)
                    {
                        var mesh = protos[proto].lods[0].bounds;
                        var sh = sorted[k].shape;
                        b.Encapsulate(new Bounds(sorted[k].pos + Vector3.up * mesh.center.y * sh.x, new Vector3(mesh.size.x * sh.y * 1.5f, mesh.size.y * sh.x, mesh.size.z * sh.y * 1.5f)));
                        k++;
                    }
                    runs.Add(new VegetationData.Run { prototype = proto, start = start, count = k - start });
                }
                chunks.Add(new VegetationData.Chunk { bounds = b, runs = runs.ToArray() });
            }
            data.chunks = chunks.ToArray();
            EditorUtility.SetDirty(data);

            var group = MapScene.FreshGroup(RendererName);
            var veg = group.gameObject.AddComponent<InstanceRenderer>();
            veg.data = data;
            veg.Build();
        }

        public static VegetationSettings Settings()
        {
            var s = AssetDatabase.LoadAssetAtPath<VegetationSettings>(VegetationSettings.AssetPath);
            if (s != null) return s;
            Directory.CreateDirectory(Path.GetDirectoryName(VegetationSettings.AssetPath));
            s = ScriptableObject.CreateInstance<VegetationSettings>();
            AssetDatabase.CreateAsset(s, VegetationSettings.AssetPath);
            return s;
        }

        /// <summary>Batch: node Tools/unity-run.mjs JapanMap.Editor.Vegetation.VegetationImporter.Batch</summary>
        public static void Batch()
        {
            TreeBuilder.Build();
            ImportFromMenu();
        }

        [MenuItem("JapanMap/Vegetation/Import")]
        public static void ImportFromMenu()
        {
            Debug.Log(Import(Settings(), MapImportSettings.LoadOrCreate()));
            MapScene.Save();
        }

        public static string Import(VegetationSettings s, MapImportSettings map)
        {
            MapScene.OpenGameScene();
            if (AssetDatabase.LoadAssetAtPath<GameObject>(TreeBuilder.PrefabPath(TreeBuilder.Species.Cedar, 0)) == null) TreeBuilder.Build();
            var terrains = Terrain.activeTerrains;
            if (terrains.Length == 0) throw new System.InvalidOperationException("no terrain — run JapanMap/Map/Import All");

            var bounds = WorldBounds(terrains);
            var roads = RoadEdgeDistance(bounds, s.species.Max(x => x.roadClearance) + FieldCell * 2);
            var clear = PropCircles(s.propClearance);
            var counts = new Dictionary<string, int>();

            // Prototypes: every species × variant (drawn by InstanceRenderer, not as Terrain trees — D18).
            var protoIndex = new Dictionary<(TreeBuilder.Species, int), int>();
            var protos = new List<VegetationData.Prototype>();
            var material = AssetDatabase.LoadAssetAtPath<Material>(TreeBuilder.MaterialPath);
            foreach (var sp in s.species)
            for (var v = 0; v < TreeBuilder.Variants; v++)
            {
                if (protoIndex.ContainsKey((sp.model, v))) continue;
                protoIndex[(sp.model, v)] = protos.Count;
                var name = $"Veg_{sp.model}_{v}";
                protos.Add(new VegetationData.Prototype
                {
                    name = name,
                    lods = Enumerable.Range(0, 3).Select(l => AssetDatabase.LoadAssetAtPath<Mesh>($"{TreeBuilder.ArtDir}/SM_{name}_LOD{l}.asset")).ToArray(),
                    material = material,
                    lodEnd = new[] { sp.lod0End, sp.lod1End },
                    maxDistance = sp.maxDistance,
                    shadowLods = 2,
                    colliderRadius = sp.colliderRadius,
                    colliderHeight = sp.colliderHeight,
                });
            }
            var instances = new List<(Vector2Int chunk, int proto, Vector3 pos, Vector3 shape)>();

            foreach (var terrain in terrains)
            {
                var data = terrain.terrainData;
                data.SetTreeInstances(new TreeInstance[0], false);
                data.treePrototypes = new TreePrototype[0];
                var origin = terrain.transform.position;
                var size = data.size;
                var alpha = data.GetAlphamaps(0, 0, data.alphamapWidth, data.alphamapHeight);
                float Weight(Vector3 w, int layer)
                {
                    var u = (w.x - origin.x) / size.x;
                    var t = (w.z - origin.z) / size.z;
                    var ax = Mathf.Clamp(Mathf.RoundToInt(u * (data.alphamapWidth - 1)), 0, data.alphamapWidth - 1);
                    var az = Mathf.Clamp(Mathf.RoundToInt(t * (data.alphamapHeight - 1)), 0, data.alphamapHeight - 1);
                    return layer < alpha.GetLength(2) ? alpha[az, ax, layer] : 0;
                }

                for (var si = 0; si < s.species.Length; si++)
                {
                    var sp = s.species[si];
                    var rnd = new System.Random(s.seed + si * 7919 + (int)origin.x * 31 + (int)origin.z);
                    var n = Mathf.FloorToInt(size.x / sp.cellSize);
                    var m = Mathf.FloorToInt(size.z / sp.cellSize);
                    var placed = 0;
                    for (var j = 0; j < m; j++)
                    for (var i = 0; i < n; i++)
                    {
                        // All rolls first, so a filter change does not reshuffle every tree behind it (legacy scatterChunk).
                        var w = new Vector3(origin.x + (i + (float)rnd.NextDouble()) * sp.cellSize, 0, origin.z + (j + (float)rnd.NextDouble()) * sp.cellSize);
                        var roll = (float)rnd.NextDouble();
                        var scaleRoll = (float)rnd.NextDouble();
                        var rot = (float)rnd.NextDouble() * Mathf.PI * 2;
                        var aspectRoll = (float)rnd.NextDouble() * 2 - 1;
                        var variantRoll = (float)rnd.NextDouble();

                        var y = terrain.SampleHeight(w) + origin.y;
                        if (y < sp.minHeight || y > sp.maxHeight) continue;
                        var suit = Weight(w, 0) * sp.zoneWeights.x + Weight(w, 1) * sp.zoneWeights.y + Weight(w, 2) * sp.zoneWeights.z + Weight(w, 3) * sp.zoneWeights.w;
                        suit *= 1 - CityBlend(map, w, s.cityFade);
                        if (roll >= suit) continue;
                        var nx = (w.x - origin.x) / size.x;
                        var nz = (w.z - origin.z) / size.z;
                        if (data.GetSteepness(nx, nz) > sp.maxSlopeDeg) continue;
                        if (roads.Sample(w) < sp.roadClearance) continue;
                        if (clear.Blocks(w)) continue;

                        var baseScale = Mathf.Lerp(sp.minScale, sp.maxScale, scaleRoll);
                        var aspect = 1 + 0.18f * aspectRoll;
                        var pos = new Vector3(w.x, y - 0.15f, w.z); // sink a little: no floating roots on slopes
                        var chunk = new Vector2Int(Mathf.FloorToInt(w.x / ChunkSize), Mathf.FloorToInt(w.z / ChunkSize));
                        instances.Add((chunk, protoIndex[(sp.model, PickVariant(sp.variantWeights, variantRoll))], pos, new Vector3(baseScale * aspect, baseScale / aspect, rot)));
                        placed++;
                    }
                    counts[sp.model.ToString()] = counts.GetValueOrDefault(sp.model.ToString()) + placed;
                }
                Details(terrain, s, map, roads, clear, Weight);
                EditorUtility.SetDirty(data);
                if (terrain.GetComponent<TerrainCollider>() is { } col) col.terrainData = data;
            }

            counts["placed in places"] = AuthoredTrees(protoIndex, instances);
            WriteData(protos, instances);
            EnsureQualityComponent(terrains);
            AssetDatabase.SaveAssets();
            return "[Vegetation] " + string.Join(", ", counts.Select(c => $"{c.Key} {c.Value}")) + $" — {counts.Values.Sum()} trees on {terrains.Length} tile(s)";
        }

        /// <summary>
        /// Trees the prototype set by hand in its places (Sakura Commons ring, willows, kaki, …): same
        /// renderer and prototypes as the scatter, so new tree models replace them too (D18).
        /// </summary>
        static int AuthoredTrees(Dictionary<(TreeBuilder.Species, int), int> protoIndex, List<(Vector2Int chunk, int proto, Vector3 pos, Vector3 shape)> instances)
        {
            var n = 0;
            foreach (var kit in Places.PlaceImporter.Kits())
            foreach (var t in Places.PlaceSource.Load(kit.source).trees)
            {
                if (!System.Enum.TryParse<TreeBuilder.Species>(t.species, out var species) &&
                    !(Stand.TryGetValue(t.species, out var stand) && System.Enum.TryParse(stand, out species)))
                {
                    Debug.LogWarning($"[Vegetation] {kit.name}: unknown tree species '{t.species}'");
                    continue;
                }
                // stand-ins (Kaki, StreetTree, … drawn as maple) keep the plain green variant, not autumn red
                var standIn = !System.Enum.IsDefined(typeof(TreeBuilder.Species), t.species);
                var variant = standIn && t.species != "Momiji" ? 0 : Places.PlaceImporter.Variant(t.x, t.z, TreeBuilder.Variants);
                if (!protoIndex.TryGetValue((species, variant), out var proto) && !protoIndex.TryGetValue((species, 0), out proto))
                {
                    Debug.LogWarning($"[Vegetation] {kit.name}: species {species} is not scattered anywhere — add it to Vegetation.asset");
                    continue;
                }
                var w = Places.PlaceSource.ToUnity(t.x, t.z);
                w.y = Places.PlaceImporter.Ground(w) - 0.15f;
                var chunk = new Vector2Int(Mathf.FloorToInt(w.x / ChunkSize), Mathf.FloorToInt(w.z / ChunkSize));
                var scale = t.scale > 0 ? t.scale : 1;
                instances.Add((chunk, proto, w, new Vector3(scale, scale, -t.yaw)));
                n++;
            }
            return n;
        }

        /// <summary>
        /// Species the places name but the provisional tree set does not have yet (D18): drawn as the
        /// closest one until the asset session brings the real tree; the place data keeps the real name.
        /// </summary>
        static readonly Dictionary<string, string> Stand = new()
        {
            ["Pine"] = "Cedar", ["Sugi"] = "Cedar", ["Willow"] = "Maple", ["Kaki"] = "Maple", ["Momiji"] = "Maple", ["Niwaki"] = "Bush", ["StreetTree"] = "Maple",
        };

        static int PickVariant(Vector3 w, float roll)
        {
            var total = w.x + w.y + w.z;
            roll *= total;
            if (roll < w.x) return 0;
            return roll < w.x + w.y ? 1 : 2;
        }

        static void Details(Terrain terrain, VegetationSettings s, MapImportSettings map, Field roads, Circles clear, System.Func<Vector3, int, float> weight)
        {
            var data = terrain.terrainData;
            var res = s.detailResolution;
            data.SetDetailResolution(res, 32);
            data.SetDetailScatterMode(DetailScatterMode.CoverageMode);
            data.detailPrototypes = new[]
            {
                Detail("Grass", s.grassDensity, 0.8f, 1.4f, 0.7f, 1.3f),
                Detail("Rice", s.riceDensity, 0.9f, 1.1f, 0.85f, 1.15f),
            };
            var origin = terrain.transform.position;
            var size = data.size;
            var grass = new int[res, res];
            var rice = new int[res, res];
            for (var z = 0; z < res; z++)
            for (var x = 0; x < res; x++)
            {
                var w = new Vector3(origin.x + (x + 0.5f) / res * size.x, 0, origin.z + (z + 0.5f) / res * size.z);
                if (roads.Sample(w) < s.grassRoadClearance) continue;
                var city = 1 - CityBlend(map, w, s.cityFade);
                if (city <= 0) continue;
                var g = weight(w, 1) * 1f + weight(w, 2) * 0.06f;
                var p = weight(w, 3);
                grass[z, x] = Mathf.RoundToInt(Mathf.Clamp01(g * city) * s.grassCoverage);
                rice[z, x] = Mathf.RoundToInt(Mathf.Clamp01(p * city) * s.riceCoverage);
            }
            data.SetDetailLayer(0, 0, 0, grass);
            data.SetDetailLayer(0, 0, 1, rice);
        }

        static DetailPrototype Detail(string name, float density, float minW, float maxW, float minH, float maxH) => new()
        {
            prototype = AssetDatabase.LoadAssetAtPath<GameObject>(TreeBuilder.DetailPath(name)),
            usePrototypeMesh = true,
            renderMode = DetailRenderMode.VertexLit,
            useInstancing = true,
            density = density,
            minWidth = minW, maxWidth = maxW, minHeight = minH, maxHeight = maxH,
            noiseSpread = 0.3f,
            useDensityScaling = true,
            alignToGround = 0.4f,
        };

        /// <summary>0 outside the city district, 1 inside, linear over <paramref name="fade"/> metres (legacy districtBlend).</summary>
        static float CityBlend(MapImportSettings map, Vector3 w, float fade)
        {
            var best = 0f;
            foreach (var r in map.cityParts)
            {
                // cityParts are in Three coordinates: x, z (Unity z = −Three z).
                var tz = -w.z;
                var dx = Mathf.Max(r.xMin - w.x, w.x - r.xMax, 0);
                var dz = Mathf.Max(r.yMin - tz, tz - r.yMax, 0);
                var d = Mathf.Sqrt(dx * dx + dz * dz);
                best = Mathf.Max(best, 1 - Mathf.Clamp01(d / fade));
            }
            return best;
        }

        static Rect WorldBounds(Terrain[] terrains)
        {
            var r = new Rect();
            var first = true;
            foreach (var t in terrains)
            {
                var p = t.transform.position;
                var s = t.terrainData.size;
                var tr = Rect.MinMaxRect(p.x, p.z, p.x + s.x, p.z + s.z);
                r = first ? tr : Rect.MinMaxRect(Mathf.Min(r.xMin, tr.xMin), Mathf.Min(r.yMin, tr.yMin), Mathf.Max(r.xMax, tr.xMax), Mathf.Max(r.yMax, tr.yMax));
                first = false;
            }
            return r;
        }

        /// <summary>Distance (m) to the nearest road edge on a 4 m grid, capped at <paramref name="cap"/>.</summary>
        public sealed class Field
        {
            public Rect area;
            public int w, h;
            public float[] d;
            public float Sample(Vector3 p)
            {
                var x = Mathf.Clamp(Mathf.FloorToInt((p.x - area.xMin) / FieldCell), 0, w - 1);
                var z = Mathf.Clamp(Mathf.FloorToInt((p.z - area.yMin) / FieldCell), 0, h - 1);
                return d[z * w + x];
            }
        }

        static Field RoadEdgeDistance(Rect area, float cap)
        {
            var f = new Field { area = area, w = Mathf.CeilToInt(area.width / FieldCell), h = Mathf.CeilToInt(area.height / FieldCell) };
            f.d = Enumerable.Repeat(cap, f.w * f.h).ToArray();
            var network = AssetDatabase.LoadAssetAtPath<RoadNetwork>(RoadImporter.NetworkPath);
            if (network == null) { Debug.LogWarning("[Vegetation] no road network — no road clearance"); return f; }
            foreach (var road in network.roads)
            {
                var half = road.width / 2;
                for (var k = 0; k + 1 < road.points.Length; k++)
                {
                    var a = road.points[k];
                    var b = road.points[k + 1];
                    var reach = cap + half;
                    int x0 = Mathf.FloorToInt((Mathf.Min(a.x, b.x) - reach - area.xMin) / FieldCell), x1 = Mathf.FloorToInt((Mathf.Max(a.x, b.x) + reach - area.xMin) / FieldCell);
                    int z0 = Mathf.FloorToInt((Mathf.Min(a.z, b.z) - reach - area.yMin) / FieldCell), z1 = Mathf.FloorToInt((Mathf.Max(a.z, b.z) + reach - area.yMin) / FieldCell);
                    for (var z = Mathf.Max(0, z0); z <= Mathf.Min(f.h - 1, z1); z++)
                    for (var x = Mathf.Max(0, x0); x <= Mathf.Min(f.w - 1, x1); x++)
                    {
                        var c = new Vector2(area.xMin + (x + 0.5f) * FieldCell, area.yMin + (z + 0.5f) * FieldCell);
                        var dist = SegmentDistance(c, new Vector2(a.x, a.z), new Vector2(b.x, b.z)) - half;
                        var i = z * f.w + x;
                        if (dist < f.d[i]) f.d[i] = Mathf.Max(0, dist);
                    }
                }
            }
            return f;
        }

        static float SegmentDistance(Vector2 p, Vector2 a, Vector2 b)
        {
            var ab = b - a;
            var t = ab.sqrMagnitude < 1e-6f ? 0 : Mathf.Clamp01(Vector2.Dot(p - a, ab) / ab.sqrMagnitude);
            return Vector2.Distance(p, a + ab * t);
        }

        sealed class Circles
        {
            readonly Dictionary<(int, int), List<Vector3>> _cells = new(); // x, z, radius
            readonly List<Rect> _rects = new(); // x/z, Unity
            const float Cell = 32f;
            public void Add(Rect r) => _rects.Add(r);
            public void Add(Vector3 c, float r)
            {
                for (var x = Mathf.FloorToInt((c.x - r) / Cell); x <= Mathf.FloorToInt((c.x + r) / Cell); x++)
                for (var z = Mathf.FloorToInt((c.z - r) / Cell); z <= Mathf.FloorToInt((c.z + r) / Cell); z++)
                {
                    if (!_cells.TryGetValue((x, z), out var l)) _cells[(x, z)] = l = new List<Vector3>();
                    l.Add(new Vector3(c.x, c.z, r));
                }
            }
            public bool Blocks(Vector3 p)
            {
                foreach (var r in _rects)
                    if (r.Contains(new Vector2(p.x, p.z))) return true;
                if (!_cells.TryGetValue((Mathf.FloorToInt(p.x / Cell), Mathf.FloorToInt(p.z / Cell)), out var l)) return false;
                foreach (var c in l)
                    if ((p.x - c.x) * (p.x - c.x) + (p.z - c.y) * (p.z - c.y) < c.z * c.z) return true;
                return false;
            }
        }

        /// <summary>Footprints of everything under World/Props and World/Places (colliders' bounds) plus a margin, and the places' clearings.</summary>
        static Circles PropCircles(float margin)
        {
            var c = new Circles();
            foreach (var group in new[] { PropImporter.GroupName, Places.PlaceImporter.GroupName })
            {
                var props = MapScene.Root().Find(group);
                if (props == null) continue;
                foreach (var col in props.GetComponentsInChildren<Collider>())
                {
                    var b = col.bounds;
                    c.Add(b.center, Mathf.Max(b.extents.x, b.extents.z) + margin);
                }
            }
            // Courts, streets and yards of the places (legacy *Clearance functions), Three → Unity.
            foreach (var kit in Places.PlaceImporter.Kits())
            {
                var place = Places.PlaceSource.Load(kit.source);
                foreach (var k in place.clearCircles) c.Add(new Vector3(k[0], 0, -k[1]), k[2]);
                foreach (var r in place.clearRects) c.Add(Rect.MinMaxRect(r[0], -r[3], r[2], -r[1]));
            }
            return c;
        }

        static void EnsureQualityComponent(Terrain[] terrains)
        {
            var host = terrains[0].transform.parent != null ? terrains[0].transform.parent.gameObject : terrains[0].gameObject;
            if (host.GetComponent<TerrainQuality>() == null) host.AddComponent<TerrainQuality>();
            foreach (var t in terrains)
            {
                t.drawTreesAndFoliage = true;
                t.treeBillboardDistance = 5000; // no billboards: our trees bring their own low LOD
                t.treeMaximumFullLODCount = 400;
                t.treeCrossFadeLength = 0;
                t.preserveTreePrototypeLayers = false;
            }
        }
    }
}
