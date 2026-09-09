import assert from 'node:assert/strict';
import { CIRCUIT_PREP } from '@/config/arcade.config';
import { ROAD_TYPES, roadWidthAt, type RoadData } from '@/config/roads.config';
import { ArcadeDynamics } from '@/game/arcadeDynamics';
import { preparedCircuitBlend } from '@/game/circuitPrep';
import { GRAVITY } from '@/config/vehicle.config';
import { ARCADE } from '@/config/arcade.config';
import { buildRoadGeometry } from '@/world/roads/RoadMeshBuilder';

assert.equal(preparedCircuitBlend(0, 8, 100), 1);
assert.equal(preparedCircuitBlend(8, 8, 100), 1);
assert.equal(preparedCircuitBlend(9, 8, 100), 0.5);
assert.equal(preparedCircuitBlend(10, 8, 100), 0);
assert.equal(preparedCircuitBlend(0, 8, 0), 0);
assert.equal(preparedCircuitBlend(0, 8, 12.5), 0.5);

const stub = (width: number, tags: string[] = []): RoadData => ({
  id: 'probe',
  type: 'city',
  closed: false,
  tags,
  nodes: [
    { pos: [0, 10, 0], width, banking: 0 },
    { pos: [0, 10, 40], width, banking: 0 },
  ],
  centerline: [0, 10, 0, 0, 10, 20, 0, 10, 40],
  widths: [width, width, width],
  banking: [0, 0, 0],
  length: 40,
  junctions: [],
  trimStart: 0,
  trimEnd: 0,
  rails: [],
  measured: {
    minRadius: 40,
    maxGradient: 0,
    hairpins: 0,
    deepestCut: 0,
    highestFill: 0,
    meanEarthwork: 0,
    earthwork95: 0,
    worstAt: 0,
    gradientMargin: 1,
    gradientAttempts: 1,
    climb: 0,
    neededLength: 0,
    railLength: 0,
  },
});

assert.equal(roadWidthAt(stub(16), 0), 16);
assert.equal(ROAD_TYPES.city.width, 8);

const mesh = buildRoadGeometry(stub(16));
const pos = mesh.geometry.getAttribute('position')!;
let minX = Infinity, maxX = -Infinity;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
}
const span = maxX - minX;
assert.ok(span > 16 && span < 16 + 2 * ROAD_TYPES.city.shoulder + 0.05, `16 m city road mesh spanned ${span.toFixed(2)} m`);

const kerbs = buildRoadGeometry(stub(16, ['circuit']));
assert.ok(kerbs.triangles > mesh.triangles, 'Circuit kerbs add a lip without replacing the asphalt');

const spec = ARCADE.touge;
const dyn = () => new ArcadeDynamics(spec, 1);
const env = (circuit: number) => ({
  vLong: 20,
  vLat: 0,
  surface: 'asphalt' as const,
  circuit,
  waterDepth: 0,
  airborne: false,
  support: 1,
});
const input = { throttle: 0, brake: 1, steer: 0, handbrake: false, boost: false };

const a0 = dyn().step(1 / 60, input, env(0));
const a1 = dyn().step(1 / 60, input, env(1));
const brake0 = spec.brakeG * GRAVITY;
assert.ok(
  Math.abs(a1.accelLong - a0.accelLong + 0.2 * brake0) < 0.05,
  `brake delta ${a1.accelLong - a0.accelLong} against ${-0.2 * brake0}`,
);

const lat0 = dyn().step(1 / 60, { ...input, brake: 0 }, { ...env(0), vLat: 40 });
const lat1 = dyn().step(1 / 60, { ...input, brake: 0 }, { ...env(1), vLat: 40 });
assert.ok(
  Math.abs(lat1.accelLat / lat0.accelLat - CIRCUIT_PREP.lateral) < 0.04,
  `lat ${lat1.accelLat / lat0.accelLat}`,
);

const gas0 = dyn().step(1 / 60, { ...input, brake: 0, throttle: 1 }, env(0));
const gas1 = dyn().step(1 / 60, { ...input, brake: 0, throttle: 1 }, env(1));
assert.ok(Math.abs(gas1.accelLong - gas0.accelLong) < 0.05, 'drive force must not inherit the 1.50× cornering bump');

console.log('WP6 runtime: authored widths, 4 cm kerbs, 1.50× lat / 1.20× brake on prepared asphalt.');
