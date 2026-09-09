import assert from 'node:assert/strict';
import { FACADE_FAMILY } from '@/config/city.config';
import { generateCity } from '@/world/city/CityGenerator';

const result = generateCity({
  isRoad: (x, z) => Math.abs(x - 620) < 5 && Math.abs(z - 120) < 140 || Math.abs(z - 120) < 5 && Math.abs(x - 620) < 140,
  sampleTerrain: () => 29,
  urbanLots: [
    { minX: 1080, maxX: 1110, minZ: -640, maxZ: -612, bottom: 40, top: 48, roadY: 47, group: 'hill' },
    { minX: 460, maxX: 490, minZ: 640, maxZ: 668, bottom: 20, top: 28, roadY: 27, group: 'market' },
  ],
});

assert.ok(result.stats.buildings > 30, `city needs a place, not a handful of boxes (${result.stats.buildings})`);
assert.equal(result.landmarks.length, 4);
assert.ok(result.landmarks.some((l) => l.id === 'hotel' && l.family === FACADE_FAMILY.hotel));
assert.ok(result.landmarks.some((l) => l.id === 'cinema' && l.family === FACADE_FAMILY.cinema));
assert.equal(result.stats.families.length, 8);
const used = result.stats.families.filter((n) => n > 0).length;
assert.ok(used >= 6, `expected most families on the plate, got ${result.stats.families.join(',')}`);
assert.ok(result.stats.heightMax > 40, `hotel corner must read as a tower (${result.stats.heightMax})`);
assert.ok(result.stats.families[FACADE_FAMILY.hillside]! >= 1, 'hill lot must use plaster houses');
assert.ok(result.stats.families[FACADE_FAMILY.shed]! >= 1, 'market lot must use sheds');

console.log(
  `WP4 city kit: ${result.stats.buildings} buildings, families [${result.stats.families.join(', ')}], hotel ${result.stats.heightMax.toFixed(0)} m, ${result.landmarks.map((l) => l.id).join(', ')}.`,
);
