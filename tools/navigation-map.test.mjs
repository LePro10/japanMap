import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypescript(path, fileName) {
  const sourcePath = new URL(path, import.meta.url);
  const source = await readFile(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  return import(moduleUrl);
}

const { clampWorldPoint, mapToWorld, worldToMap } = await importTypescript(
  '../src/ui/navigationMapMath.ts',
  'navigationMapMath.ts',
);
const { MAP_LANDMARKS, formatMapDistance } = await importTypescript(
  '../src/ui/navigationMapData.ts',
  'navigationMapData.ts',
);

const bounds = { minX: -1536, maxX: 1536, minZ: -1536, maxZ: 1536 };

assert.deepEqual(worldToMap(0, 0, bounds), { x: 0.5, y: 0.5 });
assert.deepEqual(worldToMap(-1536, -1536, bounds), { x: 0, y: 0 });
assert.deepEqual(worldToMap(1536, 1536, bounds), { x: 1, y: 1 });

const world = mapToWorld(0.25, 0.75, bounds);
assert.equal(world.x, -768);
assert.equal(world.z, 768);

const normalized = worldToMap(612, -420, bounds);
const roundTrip = mapToWorld(normalized.x, normalized.y, bounds);
assert.ok(Math.abs(roundTrip.x - 612) < 1e-9);
assert.ok(Math.abs(roundTrip.z + 420) < 1e-9);

assert.deepEqual(clampWorldPoint(-9999, 9999, bounds), { x: -1536, z: 1536 });

assert.equal(formatMapDistance(428), '428 m');
assert.equal(formatMapDistance(999.6), '1.0 km');
assert.equal(formatMapDistance(1340), '1.3 km');

assert.ok(MAP_LANDMARKS.length >= 7, 'Die Karte soll die wichtigen Regionen sichtbar machen.');
const city = MAP_LANDMARKS.find((landmark) => landmark.id === 'stadt');
assert.deepEqual(
  city && { x: city.x, z: city.z, icon: city.icon },
  { x: 620, z: 120, icon: 'city' },
);
const temple = MAP_LANDMARKS.find((landmark) => landmark.id === 'tempel');
assert.deepEqual(
  temple && { x: temple.x, z: temple.z, icon: temple.icon },
  { x: 820, z: -940, icon: 'temple' },
);

console.log('navigation map math/data: ok');
