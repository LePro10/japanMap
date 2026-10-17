using System;
using System.Collections.Generic;
using JapanMap.World;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Lowers the terrain under every road so no ground pokes through the asphalt. The legacy heightmap
    /// (≈1.5 m texels) cannot follow a 9 m road cut into a cliff: on the ring it stood 4 m above the road
    /// and threw cars off (Phase 3 acceptance drive). Across road + shoulder the ground is kept just
    /// below the centreline, then rises at 45° back to the natural ground. Idempotent: running it again
    /// changes nothing.
    /// </summary>
    public static class TerrainCarve
    {
        /// <param name="fills">Roads that also raise the ground to their surface (an embankment with a 45° bank):
        /// the places' own roads, which — unlike roads.json — are not baked into the heightmap.</param>
        /// <summary>Fast roads only: their profiles move most (RoadProfile); filling under slow streets lifted ground
        /// through a neighbouring footpath (sando, 0.19 m).</summary>
        static bool GapFills(RoadNetwork.Road road, MapImportSettings s)
        {
            foreach (var t in s.roadTypes)
                if (t.type == road.type) return t.minVerticalRadius >= 150f;
            return false;
        }

        public static (int texels, float maxCut, int skipped) UnderRoads(IList<RoadNetwork.Road> roads, Func<string, float> shoulderOf, MapImportSettings s, ISet<string> fills = null)
        {
            int changed = 0, skipped = 0;
            var maxCut = 0f;
            foreach (var terrain in Terrain.activeTerrains)
            {
                var data = terrain.terrainData;
                var res = data.heightmapResolution;
                var size = data.size;
                var origin = terrain.transform.position;
                var cell = size.x / (res - 1);
                var h = data.GetHeights(0, 0, res, res);
                var touched = false;
                // Two passes: every embankment first, then every cut — so a side road's fill never rises
                // through the road it joins (0.92 m at the gassho street junction when done road by road).
                for (var pass = 0; pass < 2; pass++)
                foreach (var road in roads)
                {
                    var p = road.points;
                    var fill = fills != null && fills.Contains(road.id);
                    // Every road fills small gaps under its core (a dip evened out by RoadProfile lifted the ring
                    // up to 0.74 m off the ground); bridges and viaducts stand much higher and stay as they are.
                    var gapOnly = pass == 0 && !fill;
                    if (gapOnly && (s.carveGapFill <= 0f || !GapFills(road, s))) continue;
                    var cutting = pass == 1;
                    var half = road.width / 2f;
                    var shoulder = shoulderOf(road.type);
                    var core = half + shoulder;
                    // Beyond the shoulder the gravel verge runs down onto the ground: keep the ground under it too, or the
                    // 1.5 m terrain grid pokes through it in a saw-tooth (owner 2026-10-17: "Übergang zum Dreck").
                    var verge = shoulder > 0f ? s.roadVerge : 0f;
                    // Only highway and mountain roads bank in bends (RoadImporter: banking data).
                    var bankSlope = road.type == "highway" || road.type == "mountain" ? s.carveBankSlope : 0f;
                    var reach = core + verge + s.carveBank;
                    var segments = road.closed ? p.Length : p.Length - 1;
                    for (var i = 0; i < segments; i++)
                    {
                        var a = p[i];
                        var b = p[(i + 1) % p.Length];
                        var c0 = Mathf.Max(0, Mathf.FloorToInt((Mathf.Min(a.x, b.x) - reach - origin.x) / cell));
                        var c1 = Mathf.Min(res - 1, Mathf.CeilToInt((Mathf.Max(a.x, b.x) + reach - origin.x) / cell));
                        var r0 = Mathf.Max(0, Mathf.FloorToInt((Mathf.Min(a.z, b.z) - reach - origin.z) / cell));
                        var r1 = Mathf.Min(res - 1, Mathf.CeilToInt((Mathf.Max(a.z, b.z) + reach - origin.z) / cell));
                        var ab = new Vector2(b.x - a.x, b.z - a.z);
                        var len2 = Mathf.Max(ab.sqrMagnitude, 1e-6f);
                        // At an open road's ends the ground reaches two texels past the end cap: the terrain
                        // is bilinear between 1.5 m texels, and untouched texels just beyond the start lifted
                        // the first metre of a 14 m avenue 0.39 m above the asphalt.
                        var cap = 2f * cell / Mathf.Sqrt(len2);
                        var tMin = !road.closed && i == 0 ? -Mathf.Max(0.25f, cap) : -0.25f;
                        var tMax = !road.closed && i == segments - 1 ? 1f + Mathf.Max(0.25f, cap) : 1.25f;
                        for (var r = r0; r <= r1; r++)
                        for (var c = c0; c <= c1; c++)
                        {
                            var x = origin.x + c * cell;
                            var z = origin.z + r * cell;
                            // Only texels beside this segment (a quarter segment of overlap closes the
                            // outside of bends). A clamped projection from the segment behind would hand an
                            // uphill road's lower end height to ground further on (measured 35 cm too deep).
                            var tRaw = ((x - a.x) * ab.x + (z - a.z) * ab.y) / len2;
                            if (tRaw < tMin || tRaw > tMax) continue;
                            var t = Mathf.Clamp01(tRaw);
                            var dx = x - (a.x + ab.x * t);
                            var dz = z - (a.z + ab.y * t);
                            var d = Mathf.Sqrt(dx * dx + dz * dz);
                            if (d > reach) continue;
                            // The road mesh drops by roadShoulderDrop across the shoulder; follow it.
                            var drop = shoulder > 0f ? s.roadShoulderDrop * Mathf.Clamp01((d - half) / shoulder) : 0f;
                            // A little more below the edges than the centre: banked bends tilt the deck by a few degrees.
                            var surface = Mathf.LerpUnclamped(a.y, b.y, tRaw) - s.carveDepth - drop - Mathf.Min(d, core) * bankSlope;
                            var allowed = d <= core
                                ? surface
                                : d <= core + verge
                                    ? surface - s.carveVergeMargin + (d - core) * s.carveVergeRise
                                    : surface - s.carveVergeMargin + verge * s.carveVergeRise + (d - core - verge);
                            var world = origin.y + h[r, c] * size.y;
                            var cut = world - allowed;
                            if (!cutting)
                            {
                                var floor = surface - Mathf.Max(0f, d - core);
                                if (gapOnly && (d > core || floor - world > s.carveGapFill)) continue;
                                if (world < floor)
                                {
                                    h[r, c] = (floor - origin.y) / size.y;
                                    changed++;
                                    touched = true;
                                }
                                continue;
                            }
                            if (cut <= 0f) continue;
                            if (cut > s.carveMaxDepth)
                            {
                                skipped++;
                                continue;
                            }
                            h[r, c] = (allowed - origin.y) / size.y;
                            maxCut = Mathf.Max(maxCut, cut);
                            changed++;
                            touched = true;
                        }
                    }
                }
                if (!touched) continue;
                data.SetHeights(0, 0, h);
                EditorUtility.SetDirty(data);
            }
            return (changed, maxCut, skipped);
        }
    }
}
