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

const { clampMapView, clampWorldPoint, mapMinScale, mapToWorld, worldToMap, zoomMapView } =
  await importTypescript('../src/ui/navigationMapMath.ts', 'navigationMapMath.ts');
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

const zoomed = zoomMapView({ scale: 1, tx: 0, ty: 0 }, 2, 200, 100, 400, 400);
assert.equal(zoomed.scale, 2);
assert.equal(zoomed.tx, -200);
assert.equal(zoomed.ty, -100);
const again = zoomMapView(zoomed, 2, 200, 100, 400, 400);
assert.equal(again.tx + 200 * again.scale, 200, 'Zoom muss den Punkt unter dem Cursor halten.');
assert.equal(again.ty + 100 * again.scale, 100);
const clamped = clampMapView({ scale: 2, tx: 50, ty: 50 }, 400, 400);
assert.equal(clamped.tx, 0);
assert.equal(clamped.ty, 0);
const overPan = clampMapView({ scale: 2, tx: -999, ty: -999 }, 400, 400);
assert.equal(overPan.tx, -400);
assert.equal(overPan.ty, -400);

const landscapeMin = mapMinScale(1400, 700);
assert.ok(landscapeMin < 1, 'Querformat muss unter Cover zoomen können.');
const fitted = clampMapView({ scale: 0.05, tx: 0, ty: 0 }, 1400, 700);
assert.ok(Math.abs(fitted.scale - landscapeMin) < 1e-9);
assert.ok(fitted.tx > 0, 'Contain-Zoom zentriert die Insel waagerecht.');
const zoomOut = zoomMapView({ scale: 1, tx: 0, ty: 0 }, 0.4, 700, 350, 1400, 700);
assert.ok(zoomOut.scale < 1, 'Mausrad nach hinten darf unter Cover fallen.');

assert.equal(formatMapDistance(428), '428 m');
assert.equal(formatMapDistance(999.6), '1.0 km');
assert.equal(formatMapDistance(1340), '1.3 km');

assert.ok(MAP_LANDMARKS.length >= 15, 'Die Karte soll Regionen und Neon-Orte tragen.');
assert.equal(
  MAP_LANDMARKS.filter((landmark) => landmark.major).length,
  // 10 seit Funaura (docs/DOERFER.md §1), 11 seit Kiso-Juku (§3): ein neues Dorf ist ein Hauptort, kein Innenraum.
  11,
  'Elf Region-Pins, der Rest erst aus der Nähe.',
);
const city = MAP_LANDMARKS.find((landmark) => landmark.id === 'stadt');
assert.deepEqual(
  city && { x: city.x, z: city.z, icon: city.icon },
  { x: 620, z: 120, icon: 'city' },
);
assert.equal(city?.label, 'Yoru Ward');
const temple = MAP_LANDMARKS.find((landmark) => landmark.id === 'tempel');
assert.deepEqual(
  temple && { x: temple.x, z: temple.z, icon: temple.icon },
  { x: 820, z: -940, icon: 'temple' },
);
assert.ok(
  MAP_LANDMARKS.every((landmark) => landmark.label && landmark.kanji && landmark.icon),
  'Jeder Ort braucht Namen, Kanji und ein eigenes Icon.',
);

console.log('navigation map math/data: ok');
