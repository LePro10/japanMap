using System;
using System.IO;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// The terrain's grids (heights, splat weights, grass/rice density) as one lossless byte stream that gzip packs well
    /// (D36): heights as the remainder of a median-edge prediction (LOCO-I: left, up or the plane through left, up and
    /// up-left), zig-zag, split into a low and a high byte plane (the high plane is almost all zero); splat weights as
    /// they are, detail bytes as differences to the left neighbour. Where the splat weights add up to 255 everywhere, one layer is left
    /// out and rebuilt as the rest (−0.32 MB of the start download, measured 2026-10-25).
    /// Values round-trip exactly: heights are Unity's 16-bit steps, splat weights its 8-bit steps.
    /// </summary>
    public static class TerrainPayload
    {
        const int Magic = 0x33544D4A; // "JMT3" (median prediction, implied splat layer)
        const int DetailMagic = 0x31444D4A; // "JMD1"
        /// <summary>Unity keeps heights as 16-bit steps of 1/32766 of the terrain height.</summary>
        const float HeightSteps = 32766f;

        public sealed class Grids
        {
            public int heightRes, alphaRes, layers, detailRes, detailPatch, detailLayers;
            public Vector3 size;
            public ushort[] heights;   // heightRes², row-major (y, x)
            public byte[] alphas;      // layers × alphaRes², layer-major
            public byte[] details;     // detailLayers × detailRes²
            public int holeRes;        // heightRes − 1
            public byte[] holes;       // holeRes², 1 = solid, 0 = hole (under the city plate)
        }

#if UNITY_EDITOR
        public static Grids Read(TerrainData td)
        {
            var g = new Grids
            {
                heightRes = td.heightmapResolution, alphaRes = td.alphamapResolution, layers = td.alphamapLayers,
                detailRes = td.detailResolution, detailPatch = td.detailResolutionPerPatch, detailLayers = td.detailPrototypes.Length,
                size = td.size,
            };
            var h = td.GetHeights(0, 0, g.heightRes, g.heightRes);
            g.heights = new ushort[g.heightRes * g.heightRes];
            for (var y = 0; y < g.heightRes; y++)
            for (var x = 0; x < g.heightRes; x++)
                g.heights[y * g.heightRes + x] = (ushort)Mathf.RoundToInt(h[y, x] * HeightSteps);
            var a = td.GetAlphamaps(0, 0, g.alphaRes, g.alphaRes);
            g.alphas = new byte[g.layers * g.alphaRes * g.alphaRes];
            for (var l = 0; l < g.layers; l++)
            for (var y = 0; y < g.alphaRes; y++)
            for (var x = 0; x < g.alphaRes; x++)
                g.alphas[(l * g.alphaRes + y) * g.alphaRes + x] = (byte)Mathf.RoundToInt(a[y, x, l] * 255f);
            g.details = new byte[g.detailLayers * g.detailRes * g.detailRes];
            for (var l = 0; l < g.detailLayers; l++)
            {
                var d = td.GetDetailLayer(0, 0, g.detailRes, g.detailRes, l);
                for (var y = 0; y < g.detailRes; y++)
                for (var x = 0; x < g.detailRes; x++)
                    g.details[(l * g.detailRes + y) * g.detailRes + x] = (byte)Mathf.Clamp(d[y, x], 0, 255);
            }
            g.holeRes = td.holesResolution;
            var holes = td.GetHoles(0, 0, g.holeRes, g.holeRes);
            g.holes = new byte[g.holeRes * g.holeRes];
            for (var y = 0; y < g.holeRes; y++)
            for (var x = 0; x < g.holeRes; x++)
                g.holes[y * g.holeRes + x] = holes[y, x] ? (byte)1 : (byte)0;
            return g;
        }

        /// <summary>
        /// The grass/rice density alone (D38): optional detail, it comes after the first gameplayStart (0.45 MB less at the
        /// start; ASTRA §13 "optional detail must never become a driving dependency").
        /// </summary>
        public static byte[] EncodeDetails(Grids g)
        {
            using var ms = new MemoryStream();
            using var w = new BinaryWriter(ms);
            w.Write(DetailMagic);
            w.Write(g.detailRes); w.Write(g.detailPatch); w.Write(g.detailLayers);
            WriteRows(w, g.details, g.detailRes);
            w.Flush();
            return ms.ToArray();
        }

        public static byte[] Encode(Grids g) => Encode(g, true);

        /// <param name="withDetails">False: the grass grid travels in its own file (<see cref="EncodeDetails"/>).</param>
        public static byte[] Encode(Grids g, bool withDetails)
        {
            using var ms = new MemoryStream();
            using var w = new BinaryWriter(ms);
            w.Write(Magic);
            w.Write(g.heightRes); w.Write(g.alphaRes); w.Write(g.layers);
            w.Write(g.detailRes); w.Write(g.detailPatch); w.Write(g.detailLayers);
            w.Write(g.size.x); w.Write(g.size.y); w.Write(g.size.z);
            var n = g.heightRes;
            var lo = new byte[n * n];
            var hi = new byte[n * n];
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var r = g.heights[y * n + x] - Predict(g.heights, n, x, y);
                var z = (ushort)((r << 1) ^ (r >> 31)); // zig-zag: small ± become small +
                lo[y * n + x] = (byte)z;
                hi[y * n + x] = (byte)(z >> 8);
            }
            w.Write(lo);
            w.Write(hi);
            var implied = ImpliedLayer(g);
            w.Write(implied);
            var area = g.alphaRes * g.alphaRes;
            var kept = new byte[(g.layers - (implied >= 0 ? 1 : 0)) * area];
            for (int l = 0, k = 0; l < g.layers; l++)
                if (l != implied) Array.Copy(g.alphas, l * area, kept, k++ * area, area);
            // As they are: the weights sit in wide flat patches that gzip finds without help (raw 0.335 MB, row
            // differences 0.353 MB).
            w.Write(kept);
            w.Write(withDetails);
            if (withDetails) WriteRows(w, g.details, g.detailRes);
            w.Write(g.holeRes);
            WriteRows(w, g.holes, g.holeRes);
            w.Flush();
            return ms.ToArray();
        }

        /// <summary>
        /// The splat layer that need not travel: −1 unless every pixel's weights add up to 255; then the layer that
        /// changes most often along a row (the dearest to pack).
        /// </summary>
        static int ImpliedLayer(Grids g)
        {
            var area = g.alphaRes * g.alphaRes;
            if (g.layers < 2) return -1;
            for (var i = 0; i < area; i++)
            {
                var sum = 0;
                for (var l = 0; l < g.layers; l++) sum += g.alphas[l * area + i];
                if (sum != 255) return -1;
            }
            int best = -1, most = -1;
            for (var l = 0; l < g.layers; l++)
            {
                var changes = 0;
                for (var i = 1; i < area; i++) if (g.alphas[l * area + i] != g.alphas[l * area + i - 1]) changes++;
                if (changes > most) { most = changes; best = l; }
            }
            return best;
        }

        static void WriteRows(BinaryWriter w, byte[] grid, int res)
        {
            var o = new byte[grid.Length];
            for (var i = 0; i < grid.Length; i++) o[i] = i % res == 0 ? grid[i] : (byte)(grid[i] - grid[i - 1]);
            w.Write(o);
        }
#endif

        static int Predict(ushort[] h, int n, int x, int y)
        {
            if (y == 0) return x == 0 ? 0 : h[x - 1];
            if (x == 0) return h[(y - 1) * n];
            int a = h[y * n + x - 1], b = h[(y - 1) * n + x], c = h[(y - 1) * n + x - 1];
            // Median edge detector: across a ridge or a cut edge the plane overshoots, one neighbour does not.
            if (c >= Math.Max(a, b)) return Math.Min(a, b);
            if (c <= Math.Min(a, b)) return Math.Max(a, b);
            return a + b - c;
        }

        public static Grids Decode(byte[] data)
        {
            using var r = new BinaryReader(new MemoryStream(data));
            if (r.ReadInt32() != Magic) throw new InvalidDataException("not a terrain payload");
            var g = new Grids
            {
                heightRes = r.ReadInt32(), alphaRes = r.ReadInt32(), layers = r.ReadInt32(),
                detailRes = r.ReadInt32(), detailPatch = r.ReadInt32(), detailLayers = r.ReadInt32(),
            };
            g.size = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
            var n = g.heightRes;
            var lo = r.ReadBytes(n * n);
            var hi = r.ReadBytes(n * n);
            g.heights = new ushort[n * n];
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var i = y * n + x;
                var z = lo[i] | (hi[i] << 8);
                var res = (z >> 1) ^ -(z & 1);
                g.heights[i] = (ushort)(Predict(g.heights, n, x, y) + res);
            }
            var implied = r.ReadInt32();
            var area = g.alphaRes * g.alphaRes;
            var kept = r.ReadBytes((g.layers - (implied >= 0 ? 1 : 0)) * area);
            g.alphas = new byte[g.layers * area];
            for (int l = 0, k = 0; l < g.layers; l++)
                if (l != implied) Array.Copy(kept, k++ * area, g.alphas, l * area, area);
            if (implied >= 0)
                for (var i = 0; i < area; i++)
                {
                    var sum = 0;
                    for (var l = 0; l < g.layers; l++) if (l != implied) sum += g.alphas[l * area + i];
                    g.alphas[implied * area + i] = (byte)(255 - sum);
                }
            g.details = r.ReadBoolean() ? ReadRows(r, g.detailLayers * g.detailRes * g.detailRes, g.detailRes) : null;
            g.holeRes = r.ReadInt32();
            g.holes = ReadRows(r, g.holeRes * g.holeRes, g.holeRes);
            return g;
        }

        /// <summary>Reads a grass file into <paramref name="g"/> (or a new grid set).</summary>
        public static Grids DecodeDetails(byte[] data, Grids g = null)
        {
            using var r = new BinaryReader(new MemoryStream(data));
            if (r.ReadInt32() != DetailMagic) throw new InvalidDataException("not a terrain detail file");
            g ??= new Grids();
            g.detailRes = r.ReadInt32(); g.detailPatch = r.ReadInt32(); g.detailLayers = r.ReadInt32();
            g.details = ReadRows(r, g.detailLayers * g.detailRes * g.detailRes, g.detailRes);
            return g;
        }

        static byte[] ReadRows(BinaryReader r, int count, int res)
        {
            var o = r.ReadBytes(count);
            for (var i = 0; i < o.Length; i++) if (i % res != 0) o[i] = (byte)(o[i] + o[i - 1]);
            return o;
        }

        /// <summary>
        /// Writes the grids into a (placeholder) terrain data in strips, so no 17 MB float array is allocated at once
        /// (WASM heap). The terrain collider follows the heights by itself.
        /// </summary>
        public static void Apply(Grids g, TerrainData td)
        {
            td.heightmapResolution = g.heightRes;
            td.size = g.size;
            const int strip = 128;
            var n = g.heightRes;
            for (var y0 = 0; y0 < n; y0 += strip)
            {
                var rows = Math.Min(strip, n - y0);
                var h = new float[rows, n];
                for (var y = 0; y < rows; y++)
                for (var x = 0; x < n; x++)
                    h[y, x] = g.heights[(y0 + y) * n + x] / HeightSteps;
                td.SetHeightsDelayLOD(0, y0, h);
            }
            td.SyncHeightmap();

            td.alphamapResolution = g.alphaRes;
            var ar = g.alphaRes;
            for (var y0 = 0; y0 < ar; y0 += strip)
            {
                var rows = Math.Min(strip, ar - y0);
                var a = new float[rows, ar, g.layers];
                for (var l = 0; l < g.layers; l++)
                for (var y = 0; y < rows; y++)
                for (var x = 0; x < ar; x++)
                    a[y, x, l] = g.alphas[(l * ar + y0 + y) * ar + x] / 255f;
                td.SetAlphamaps(0, y0, a);
            }

            // Holes after the heights (a new heightmap resolution resets them): the terrain is cut open under the city plate.
            var hr = g.holeRes;
            var solid = new bool[hr, hr];
            for (var y = 0; y < hr; y++)
            for (var x = 0; x < hr; x++)
                solid[y, x] = g.holes[y * hr + x] != 0;
            td.SetHoles(0, 0, solid);

            if (g.details != null) ApplyDetails(g, td);
        }

        /// <summary>Grass and rice density (may come later than the ground).</summary>
        public static void ApplyDetails(Grids g, TerrainData td)
        {
            td.SetDetailResolution(g.detailRes, g.detailPatch);
            var dr = g.detailRes;
            for (var l = 0; l < g.detailLayers; l++)
            {
                var d = new int[dr, dr];
                for (var y = 0; y < dr; y++)
                for (var x = 0; x < dr; x++)
                    d[y, x] = g.details[(l * dr + y) * dr + x];
                td.SetDetailLayer(0, 0, l, d);
            }
        }
    }
}
