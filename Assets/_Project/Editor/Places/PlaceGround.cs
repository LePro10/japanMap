using System.Collections.Generic;
using System.Linq;
using JapanMap.Editor.Map;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Places
{
    /// <summary>
    /// Levels the terrain under building footprints so a house neither floats on its downhill side nor
    /// sinks its door uphill (the prototype stood every house on the highest ground point plus a skirt).
    /// Inside the footprint the ground becomes the footprint's mean height; over <c>blend</c> metres
    /// outside it returns to the natural slope (cut and fill, no wall). Texels near a road keep the
    /// road's carve. Idempotent: the mean of a levelled pad is the pad.
    /// </summary>
    public static class PlaceGround
    {
        public struct Pad
        {
            public Vector3 center;
            public float yaw;     // Unity degrees
            public Vector2 half;  // half extents in the model's x/z
            public float blend;
            public int paint;     // terrain layer index, −1 = keep
            public bool paintOnly;
            [Tooltip("NaN: level to the footprint's mean. Else this height (a quay platform at 1.8 m).")]
            public float fixedLevel;
        }

        public static (int pads, int texels, float maxChange, int roadTexels) Level(IList<Pad> pads, MapImportSettings s)
        {
            int texels = 0, roadTexels = 0;
            var maxChange = 0f;
            if (pads.Count == 0) return (0, 0, 0, 0);
            var types = s.roadTypes.ToDictionary(t => t.type);
            var roads = RoadImporter.NetworkRoads(RoadImporter.Load(s), types);
            foreach (var terrain in Terrain.activeTerrains)
            {
                var data = terrain.terrainData;
                var res = data.heightmapResolution;
                var size = data.size;
                var origin = terrain.transform.position;
                var cell = size.x / (res - 1);
                var h = data.GetHeights(0, 0, res, res);
                var touched = false;
                foreach (var pad in pads)
                {
                    if (pad.paintOnly) continue;
                    var rot = Quaternion.Euler(0, -pad.yaw, 0); // world → pad local
                    var reach = pad.half.magnitude + pad.blend;
                    int c0 = Mathf.Max(0, Mathf.FloorToInt((pad.center.x - reach - origin.x) / cell)), c1 = Mathf.Min(res - 1, Mathf.CeilToInt((pad.center.x + reach - origin.x) / cell));
                    int r0 = Mathf.Max(0, Mathf.FloorToInt((pad.center.z - reach - origin.z) / cell)), r1 = Mathf.Min(res - 1, Mathf.CeilToInt((pad.center.z + reach - origin.z) / cell));
                    if (c0 > c1 || r0 > r1) continue;
                    var near = roads.Where(r => r.points.Any(p => (new Vector2(p.x - pad.center.x, p.z - pad.center.z)).sqrMagnitude < (reach + r.width + 20) * (reach + r.width + 20))).ToList();

                    // Mean ground inside the footprint.
                    double sum = 0;
                    var n = 0;
                    for (var r = r0; r <= r1; r++)
                    for (var c = c0; c <= c1; c++)
                    {
                        var local = rot * new Vector3(origin.x + c * cell - pad.center.x, 0, origin.z + r * cell - pad.center.z);
                        if (Mathf.Abs(local.x) > pad.half.x || Mathf.Abs(local.z) > pad.half.y) continue;
                        sum += h[r, c];
                        n++;
                    }
                    if (n == 0) continue;
                    var fixedPad = !float.IsNaN(pad.fixedLevel);
                    var level = fixedPad ? (pad.fixedLevel - origin.y) / size.y : (float)(sum / n);

                    for (var r = r0; r <= r1; r++)
                    for (var c = c0; c <= c1; c++)
                    {
                        var x = origin.x + c * cell;
                        var z = origin.z + r * cell;
                        var local = rot * new Vector3(x - pad.center.x, 0, z - pad.center.z);
                        var dx = Mathf.Max(0, Mathf.Abs(local.x) - pad.half.x);
                        var dz = Mathf.Max(0, Mathf.Abs(local.z) - pad.half.y);
                        var outside = Mathf.Sqrt(dx * dx + dz * dz);
                        if (outside >= pad.blend) continue;
                        // a fixed-height pad carries its roads at that height (quay); a mean pad leaves them to the carve
                        if (!fixedPad && NearRoad(near, x, z, types))
                        {
                            roadTexels++;
                            continue;
                        }
                        var t = pad.blend <= 0 ? 0 : Mathf.SmoothStep(0, 1, outside / pad.blend);
                        var target = Mathf.Lerp(level, h[r, c], t);
                        var change = Mathf.Abs(target - h[r, c]) * size.y;
                        if (change < 1e-4f) continue;
                        maxChange = Mathf.Max(maxChange, change);
                        h[r, c] = target;
                        texels++;
                        touched = true;
                    }
                }
                if (touched)
                {
                    data.SetHeights(0, 0, h);
                    EditorUtility.SetDirty(data);
                }
                Paint(terrain, pads);
            }
            return (pads.Count, texels, maxChange, roadTexels);
        }

        /// <summary>Courts and yards get their ground layer (gravel = Sand) inside the footprint.</summary>
        static void Paint(Terrain terrain, IList<Pad> pads)
        {
            var data = terrain.terrainData;
            var res = data.alphamapResolution;
            var layers = data.alphamapLayers;
            var origin = terrain.transform.position;
            var cell = data.size.x / res;
            float[,,] alpha = null;
            foreach (var pad in pads)
            {
                if (pad.paint < 0 || pad.paint >= layers) continue;
                alpha ??= data.GetAlphamaps(0, 0, res, res);
                var rot = Quaternion.Euler(0, -pad.yaw, 0);
                var reach = pad.half.magnitude;
                int c0 = Mathf.Max(0, Mathf.FloorToInt((pad.center.x - reach - origin.x) / cell)), c1 = Mathf.Min(res - 1, Mathf.CeilToInt((pad.center.x + reach - origin.x) / cell));
                int r0 = Mathf.Max(0, Mathf.FloorToInt((pad.center.z - reach - origin.z) / cell)), r1 = Mathf.Min(res - 1, Mathf.CeilToInt((pad.center.z + reach - origin.z) / cell));
                for (var r = r0; r <= r1; r++)
                for (var c = c0; c <= c1; c++)
                {
                    // alphamap cells are sampled at their centre
                    var local = rot * new Vector3(origin.x + (c + 0.5f) * cell - pad.center.x, 0, origin.z + (r + 0.5f) * cell - pad.center.z);
                    if (Mathf.Abs(local.x) > pad.half.x || Mathf.Abs(local.z) > pad.half.y) continue;
                    for (var l = 0; l < layers; l++) alpha[r, c, l] = l == pad.paint ? 1 : 0;
                }
            }
            if (alpha == null) return;
            data.SetAlphamaps(0, 0, alpha);
            EditorUtility.SetDirty(data);
        }

        /// <summary>Within the road's carved corridor (half width + shoulder + 1 m).</summary>
        static bool NearRoad(List<JapanMap.World.RoadNetwork.Road> roads, float x, float z, Dictionary<string, MapImportSettings.RoadType> types)
        {
            var p = new Vector2(x, z);
            foreach (var road in roads)
            {
                var reach = road.width / 2 + (types.TryGetValue(road.type, out var t) ? t.shoulder : 0) + 1;
                var pts = road.points;
                for (var i = 0; i + 1 < pts.Length; i++)
                {
                    var a = new Vector2(pts[i].x, pts[i].z);
                    var b = new Vector2(pts[i + 1].x, pts[i + 1].z);
                    var ab = b - a;
                    var u = ab.sqrMagnitude < 1e-6f ? 0 : Mathf.Clamp01(Vector2.Dot(p - a, ab) / ab.sqrMagnitude);
                    if ((a + ab * u - p).sqrMagnitude < reach * reach) return true;
                }
            }
            return false;
        }
    }
}
