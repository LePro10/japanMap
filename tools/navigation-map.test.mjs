import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourcePath = new URL('../src/ui/navigationMapMath.ts', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: 'navigationMapMath.ts',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
const { clampWorldPoint, mapToWorld, worldToMap } = await import(moduleUrl);

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

console.log('navigation map math: ok');
