import assert from 'node:assert/strict';
import { generateCity } from '@/world/city/CityGenerator';

const input = {
  isRoad: (x: number, z: number) => Math.abs(x - 620) < 5 && Math.abs(z - 120) < 140 || Math.abs(z - 120) < 5 && Math.abs(x - 620) < 140,
  sampleTerrain: () => 29,
  urbanLots: [
    { minX: 1080, maxX: 1110, minZ: -640, maxZ: -612, bottom: 40, top: 48, roadY: 47, group: 'hill' },
    { minX: 1101.731, maxX: 1131.731, minZ: -345.865, maxZ: -317.865, bottom: 45, top: 53.436, roadY: 52, group: 'beacon' },
    { minX: 459.253, maxX: 489.253, minZ: 699.377, maxZ: 727.377, bottom: 3, top: 10.076, roadY: 9, group: 'night-market' },
    { minX: 190.149, maxX: 220.149, minZ: 240.645, maxZ: 268.645, bottom: 24, top: 29.688, roadY: 28, group: 'rotor' },
    { minX: 670, maxX: 700, minZ: 0, maxZ: 25, bottom: 29, top: 30, roadY: 29, group: 'reserved' },
  ],
};
const city = generateCity(input);
assert.ok(Array.isArray(city.buildings), 'building descriptors must be emitted');
const again = generateCity(input);
assert.deepEqual(city.buildings, again.buildings, 'building identities and fronts must be deterministic');
assert.deepEqual(city.colliders, again.colliders);
assert.equal(city.buildings.length, city.stats.buildings);
assert.equal(new Set(city.buildings.map(b => b.id)).size, city.buildings.length);
assert.equal(city.buildings.length, city.colliders.length, 'each solid body has one collider');
const reserves = [
  { minX: 665, maxX: 745, minZ: -20, maxZ: 50 },
  { minX: 503, maxX: 525, minZ: 25, maxZ: 47 },
  { minX: 638, maxX: 650, minZ: 136, maxZ: 145 },
];
for (const b of city.buildings) {
  assert.ok(['px', 'nx', 'pz', 'nz'].includes(b.front));
  assert.ok(b.height > 0 && Number.isFinite(b.baseY));
  assert.ok(typeof b.shopInset === 'number' && b.shopInset > 0, 'shopfront wall inset is exposed');
  assert.ok(city.colliders.some(c => c.minX === b.minX && c.maxX === b.maxX && c.minZ === b.minZ && c.maxZ === b.maxZ && c.top === b.baseY + b.height), `collider for ${b.id}`);
  for (const r of reserves) assert.ok(b.maxX <= r.minX || b.minX >= r.maxX || b.maxZ <= r.minZ || b.minZ >= r.maxZ, `reserved space occupied by ${b.id}`);
}
for (const lot of input.urbanLots.filter(l => ['beacon', 'night-market', 'rotor'].includes(l.group))) {
  assert.ok(!city.buildings.some(b => b.minX < lot.maxX && b.maxX > lot.minX && b.minZ < lot.maxZ && b.maxZ > lot.minZ), 'authored lot stays free of generated bodies');
  assert.ok(city.curbs.some(c => c.minX === lot.minX && c.maxX === lot.maxX && c.top === lot.top), 'authored lot keeps its terrace');
}
assert.ok(city.landmarks.some(b => b.id === 'corner-mart'));
assert.ok(!city.buildings.some(b => b.id === 'corner-mart'));
for (const [i, block] of city.blocks.entries()) {
  for (const [name, attr] of Object.entries(block.geometry.attributes)) {
    assert.ok(Array.from(attr.array).every(Number.isFinite), `finite ${name} on block ${i}`);
    assert.deepEqual(attr.array, again.blocks[i]!.geometry.getAttribute(name).array);
  }
}
assert.ok(city.stats.triangles < 220000, `merged geometry stays bounded: ${city.stats.triangles}`);
console.log(`Architecture: ${city.buildings.length} deterministic bodies, reserved sites clear, ${city.stats.triangles} triangles in ${city.blocks.length} blocks.`);
