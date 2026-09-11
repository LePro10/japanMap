import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { ChunkManager } from '../../src/world/ChunkManager.ts';
import { HeightPyramid } from '../../src/world/terrain/HeightPyramid.ts';
import type { TerrainSampler } from '../../src/world/TerrainSampler.ts';
import { VIEWPOINTS } from '../../src/debug/viewpoints.ts';
import { LOD } from '../../src/config/lod.config.ts';

const meta = JSON.parse(readFileSync('assets/generated/terrain/meta.json', 'utf8'));
const bytes = readFileSync('assets/generated/terrain/height.r16');
const raw = new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const sampler = { meta, raw, resolution: meta.heightmap.res, spacing: meta.heightmap.spacing } as TerrainSampler;
const chunks = new ChunkManager(sampler);
const fan = chunks.flatGeometry;
assert.ok(fan, 'flat nodes have their own shared geometry');
const p = fan.getAttribute('position'), index = fan.getIndex()!;
assert.equal(p.count, 260, 'four quadrant fans, each with 64 edge vertices and one center');
assert.equal(index.count / 3, 256);
const grid = chunks.geometry.getAttribute('position');
const edges = new Set<string>();
for (let i = 0; i < grid.count; i++) {
  const x = grid.getX(i), z = grid.getZ(i);
  if (x === 0 || x === 1 || z === 0 || z === 1) edges.add(`${x},${z}`);
}
for (let i = 0; i < p.count; i++) {
  const x = p.getX(i), z = p.getZ(i);
  if (x === 0 || x === 1 || z === 0 || z === 1) {
    assert.equal(x * 32, Math.round(x * 32));
    assert.equal(z * 32, Math.round(z * 32));
    edges.delete(`${x},${z}`);
  }
}
assert.equal(edges.size, 0);
for (let quadrant = 0; quadrant < 4; quadrant++) {
  const center = quadrant * 65 + 64;
  assert.deepEqual([p.getX(center), p.getY(center), p.getZ(center)], [0.25 + (quadrant % 2) * 0.5, 0, 0.25 + Math.floor(quadrant / 2) * 0.5]);
}
const a = new Vector3(), b = new Vector3(), c = new Vector3();
let area = 0;
for (let i = 0; i < index.count; i += 3) {
  a.fromBufferAttribute(p, index.getX(i)); b.fromBufferAttribute(p, index.getX(i + 1)); c.fromBufferAttribute(p, index.getX(i + 2));
  const normal = b.sub(a).cross(c.sub(a));
  assert.ok(normal.y > 0, 'fan triangles face up'); area += normal.y / 2;
}
assert.equal(area, 1, 'fan covers the complete node without overlaps or gaps');
// The existing shader moves only odd grid coordinates. The center is even,
// and the identical perimeter coordinates therefore retain identical morphs.
for (const morph of [0, 0.25, 0.75, 1]) {
  const moved = (v: number): number => v - ((v * 16) % 1) / 16 * morph;
  for (let i = 0; i < index.count; i += 3) {
    const center = index.getX(i), ia = index.getX(i + 1), ib = index.getX(i + 2);
    const cx = p.getX(center), cz = p.getZ(center);
    assert.equal(moved(cx), cx); assert.equal(moved(cz), cz);
    const ax = moved(p.getX(ia)) - cx, az = moved(p.getZ(ia)) - cz;
    const bx = moved(p.getX(ib)) - cx, bz = moved(p.getZ(ib)) - cz;
    assert.ok(az * bx - ax * bz >= 0, 'morph never reverses a quadrant triangle');
  }
}

const pyramid = HeightPyramid.build(sampler);
const camera = new PerspectiveCamera(60, 960 / 600, 0.5, 6000);
let interiorTexel = -1;
let cityFlatCount = 0;
let alteredOrigin: readonly [number, number] = [0, 0];
for (const name of ['stadt-strasse', 'stadt-neon', 'pass-kehren', 'sando', 'reisfeld']) {
  const view = VIEWPOINTS[name]!;
  camera.position.set(...view.position); camera.lookAt(...view.lookAt); chunks.select(camera);
  let count = 0;
  for (const [geometry, flat] of [[chunks.geometry, false], [chunks.flatGeometry, true]] as const) {
    const origins = geometry.getAttribute('aNodeOrigin'), sizes = geometry.getAttribute('aNodeSize');
    for (let i = 0; i < geometry.instanceCount; i++) {
      const size = sizes.getX(i), depth = Math.round(Math.log2(3072 / size));
      const nx = Math.round((origins.getX(i) + 1536) / size), nz = Math.round((origins.getY(i) + 1536) / size);
      assert.equal(pyramid.min(depth, nx, nz) === pyramid.max(depth, nx, nz), flat, 'only strictly constant raw regions enter the fan batch');
      count++;
    }
  }
  assert.equal(chunks.stats.nodes, count);
  assert.equal(chunks.stats.triangles, chunks.geometry.instanceCount * 2048 + chunks.flatGeometry.instanceCount * 256);
  assert.equal(chunks.stats.overflow, 0);
  assert.ok(count <= LOD.maxNodes);
  if (name === 'stadt-strasse') { cityFlatCount = chunks.flatGeometry.instanceCount; assert.ok(cityFlatCount > 0, 'real city has flat terrain to optimize'); }
  if (name === 'stadt-strasse') {
    const origins = chunks.flatGeometry.getAttribute('aNodeOrigin'), sizes = chunks.flatGeometry.getAttribute('aNodeSize');
    alteredOrigin = [origins.getX(0), origins.getY(0)];
    const centerX = alteredOrigin[0] + sizes.getX(0) / 2, centerZ = alteredOrigin[1] + sizes.getX(0) / 2;
    const tx = Math.floor((centerX + 1536) / sampler.spacing), tz = Math.floor((centerZ + 1536) / sampler.spacing);
    interiorTexel = tz * sampler.resolution + tx;
  }
  if (name === 'pass-kehren') assert.equal(chunks.flatGeometry.instanceCount, 0, 'mountain detail stays on the full grid');
  console.log(JSON.stringify({ name, nodes: count, flat: chunks.flatGeometry.instanceCount, triangles: chunks.stats.triangles }));
}
// A single interior texel one quantization step higher defeats exact flatness,
// even though all four node corners and the rest of the region remain flat.
const alteredRaw = raw.slice(); alteredRaw[interiorTexel]!++;
const altered = new ChunkManager({ ...sampler, raw: alteredRaw } as TerrainSampler);
const cityView = VIEWPOINTS['stadt-strasse']!;
camera.position.set(...cityView.position); camera.lookAt(...cityView.lookAt); altered.select(camera);
const fanOrigins = altered.flatGeometry.getAttribute('aNodeOrigin');
for (let i = 0; i < altered.flatGeometry.instanceCount; i++) {
  assert.ok(fanOrigins.getX(i) !== alteredOrigin[0] || fanOrigins.getY(i) !== alteredOrigin[1], 'one interior raw-height change must reject the fan');
}
assert.equal(altered.flatGeometry.instanceCount, cityFlatCount - 1);
altered.dispose();
chunks.frozen = true;
const stats = JSON.stringify(chunks.stats);
camera.position.set(0, 4000, 0); chunks.select(camera);
assert.equal(JSON.stringify(chunks.stats), stats, 'frozen selection preserves both batches');
let disposals = 0;
chunks.geometry.addEventListener('dispose', () => disposals++);
chunks.flatGeometry.addEventListener('dispose', () => disposals++);
chunks.dispose();
assert.equal(disposals, 2, 'both shared geometries are released');
console.log('Exact-flat terrain topology, boundaries, admission, budgets and disposal passed.');
