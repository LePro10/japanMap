#!/usr/bin/env node
/**
 * Reisfeld: Wassertiefe gegens Auto, Luftspalt an Terrassenkanten.
 * Liest dieselben Dateien wie das Spiel. Kein Bake.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WATER_BAKED = 0.3;
const WATER_TARGET = 0.1;
const KITE = { radius: 0.31, clearance: 0.16, height: 1.36, ford: 0.2, cg: 0.5 };

function sit(depth) {
  return {
    depth,
    wheelCover: depth / KITE.radius,
    hullInWater: depth - KITE.clearance,
    bodyCover: depth / KITE.height,
    overFord: depth - KITE.ford,
    overWet: depth - 0.08,
  };
}

const terrainDir = join(ROOT, 'assets/generated/terrain');
const meta = JSON.parse(await readFile(join(terrainDir, 'meta.json'), 'utf8'));
const raw = new Uint16Array((await readFile(join(terrainDir, 'height.r16'))).buffer.slice(0));
const png = PNG.sync.read(await readFile(join(terrainDir, 'paddy.png')));
const res = meta.heightmap.res;
const spacing = meta.heightmap.spacing;
const half = meta.world.size / 2;
const scale = meta.heightmap.heightRange / 65535;
const minH = meta.world.minHeight;
const last = res - 1;
const maskRes = png.width;
const maskLast = maskRes - 1;

const hAt = (ix, iz) => minH + raw[(iz < 0 ? 0 : iz > last ? last : iz) * res + (ix < 0 ? 0 : ix > last ? last : ix)] * scale;
const wetAt = (mx, mz) => {
  if (mx < 0 || mz < 0 || mx > maskLast || mz > maskLast) return false;
  return png.data[(mz * maskRes + mx) * 4] > 127;
};
const worldOfMask = (mx, mz) => [
  -half + (mx / maskLast) * meta.world.size,
  -half + (mz / maskLast) * meta.world.size,
];
const heightOfMask = (mx, mz) => {
  const [x, z] = worldOfMask(mx, mz);
  const gx = (x + half) / spacing;
  const gz = (z + half) / spacing;
  return hAt(Math.round(gx), Math.round(gz));
};

let wet = 0;
const drops = [];
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
for (let mz = 1; mz < maskLast; mz++) {
  for (let mx = 1; mx < maskLast; mx++) {
    if (!wetAt(mx, mz)) continue;
    wet++;
    const h = heightOfMask(mx, mz);
    for (const [dx, dz] of dirs) {
      const nx = mx + dx;
      const nz = mz + dz;
      const nh = heightOfMask(nx, nz);
      const neighborWet = wetAt(nx, nz);
      // Luft unter dem Spiegel: Nachbar tiefer als Wasserlinie.
      const waterY = h + WATER_BAKED;
      const gap = waterY - nh;
      if (gap < 0.15) continue;
      // Damm ist HÖHER. Uns interessiert der Abfall nach unten.
      if (nh >= h - 0.05 && neighborWet) continue;
      drops.push({ mx, mz, nx, nz, h, nh, gap, neighborWet, x: worldOfMask(mx, mz)[0], z: worldOfMask(mx, mz)[1] });
    }
  }
}

drops.sort((a, b) => b.gap - a.gap);
const gaps = drops.map((d) => d.gap);
const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor((gaps.length - 1) * p))];
const nearView = drops.filter((d) => d.x > -900 && d.x < -620 && d.z > 40 && d.z < 220);

const bucket = (lo, hi) => drops.filter((d) => d.gap >= lo && d.gap < hi).length;

console.log(JSON.stringify({
  meta: { waterDepth: meta.paddies.waterDepth, damHeight: meta.paddies.damHeight, parcels: meta.paddies.parcels, wetTexels: wet },
  kiteSitBaked: sit(WATER_BAKED),
  kiteSitTarget: sit(WATER_TARGET),
  dropEdges: drops.length,
  gap: {
    max: gaps[0] ?? 0,
    p99: pct(0.99),
    p90: pct(0.9),
    p50: pct(0.5),
    mean: gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1),
  },
  buckets_m: {
    '0.15-0.4': bucket(0.15, 0.4),
    '0.4-0.8': bucket(0.4, 0.8),
    '0.8-1.5': bucket(0.8, 1.5),
    '1.5-2.5': bucket(1.5, 2.5),
    '2.5+': bucket(2.5, 99),
  },
  top5: drops.slice(0, 5).map((d) => ({ x: +d.x.toFixed(1), z: +d.z.toFixed(1), h: +d.h.toFixed(2), nh: +d.nh.toFixed(2), gap: +d.gap.toFixed(2), neighborWet: d.neighborWet })),
  nearReisfeld: nearView.slice(0, 8).map((d) => ({ x: +d.x.toFixed(1), z: +d.z.toFixed(1), h: +d.h.toFixed(2), nh: +d.nh.toFixed(2), gap: +d.gap.toFixed(2) })),
}, null, 2));
