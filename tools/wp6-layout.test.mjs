import assert from 'node:assert/strict';
import { ORCHARD_BYPASS, inUrbanEnvelope, needlePoints, URBAN_ROUTES } from './wp6-layout.mjs';

const straight = needlePoints().filter((p) => Math.abs(p[1] - 855) < 0.05);
const span = Math.max(...straight.map((p) => p[0])) - Math.min(...straight.map((p) => p[0]));
assert.ok(span >= 896, `900 m straight must survive layout (${span.toFixed(1)} m)`);

assert.deepEqual(ORCHARD_BYPASS[0], [272, 856]);
assert.deepEqual(ORCHARD_BYPASS.at(-1), [-986, 458]);
assert.ok(
  ORCHARD_BYPASS.every(([x, z]) => !(x > -1120 && x < -120 && z > 620 && z < 910)),
  'Bypass control points stay off the racing shelf',
);

assert.ok(inUrbanEnvelope(620, 120), 'Old Neon stays inside the envelope');
assert.ok(!inUrbanEnvelope(820, -800), 'Temple corridor is reserved');
assert.ok(!inUrbanEnvelope(800, 900), 'Harbour approach is reserved');
assert.ok(!inUrbanEnvelope(550, 510), 'Sakura Commons is reserved');

const names = URBAN_ROUTES.map((r) => r[0]);
assert.ok(names.includes('crosslight-avenue'));
assert.ok(names.includes('needle-approach'));
assert.ok(URBAN_ROUTES.every(([, width]) => width >= 8 && width <= 18));

console.log(`WP6 layout: ${span.toFixed(0)} m straight, ${URBAN_ROUTES.length} urban routes, envelope reserves hold.`);
