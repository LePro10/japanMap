import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { LocalSurfaces } from '../src/world/settlements/LocalSurfaces.ts';

const floor = new LocalSurfaces();
floor.quad([0, 2, 0], [10, 4, 0], [10, 4, 8], [0, 2, 8]);
assert.equal(floor.height(5, 4), 3, 'Rendered ramp and driving surface agree');
assert.equal(floor.height(-0.01, 4), -Infinity, 'No invisible ground outside the mesh');
assert.equal(floor.height(10.01, 4), -Infinity);
const n = new Vector3();
assert.equal(floor.normal(5, 4, n), true);
assert.ok(Math.abs(n.x / n.y + 0.2) < 1e-6, 'Walking uses the ramp normal, not buried terrain');
floor.quad([2, 5, 2], [4, 5, 2], [4, 5, 6], [2, 5, 6]);
assert.equal(floor.height(3, 4), 5, 'Overlapping floors select the visible top');
assert.equal(floor.height(50, 50), -Infinity, 'Paddies outside local footprints stay untouched');
console.log('WP5 local floor heights, normals, seams and bounds passed.');
