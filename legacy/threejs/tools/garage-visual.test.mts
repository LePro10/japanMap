import assert from 'node:assert/strict';

import { TOUGE, VEHICLES } from '@/config/vehicles.config';
import { hoodBox, jackPoints, garageSitHeight, LIFT_PAD } from '@/game/garageLayout';
import { createGarageWheel } from '@/game/garageWheels';
import { beltHeight } from '@/config/engines.config';

const undertray = TOUGE.clearance - TOUGE.chassis.cgHeight;
const box = hoodBox(TOUGE);
assert.ok(
  box.min.y > undertray + 0.25,
  `hood hole punches the undertray: min.y=${box.min.y} undertray=${undertray}`,
);
const belt = beltHeight(TOUGE) - TOUGE.chassis.cgHeight;
assert.ok(box.min.y < belt, `hood hole sits above the loft (${box.min.y} >= ${belt})`);
assert.ok(box.max.y <= belt + 0.16, `hood hole reaches the roof/cabin (${box.max.y})`);
assert.ok(box.min.y > undertray + 0.2, `hood hole still reaches the undertray`);

const pads = jackPoints(TOUGE);
const halfTrack = TOUGE.chassis.track / 2;
const wheelR = TOUGE.chassis.wheelRadius;
const pad = LIFT_PAD / 2;
for (const [x, z] of pads) {
  assert.ok(
    Math.abs(x) + pad < halfTrack - TOUGE.chassis.wheelWidth / 2,
    `pad AABB x hits a tyre (${x})`,
  );
  assert.ok(
    Math.abs(z) + pad < TOUGE.derived.cgToFront - wheelR,
    `pad AABB z hits a front tyre (${z})`,
  );
  assert.ok(
    Math.abs(z) + pad < TOUGE.derived.cgToRear - wheelR,
    `pad AABB z hits a rear tyre (${z})`,
  );
}

const sit = garageSitHeight(TOUGE, 0.1);
const wheelBottom = sit - TOUGE.chassis.cgHeight;
assert.ok(wheelBottom < 0.1 - 0.02, `wheels do not hang below pads: bottom=${wheelBottom}`);

const stock = createGarageWheel(TOUGE, 0, 'road');
const street = createGarageWheel(TOUGE, 1, 'road');
const sport = createGarageWheel(TOUGE, 2, 'road');
const dirt = createGarageWheel(TOUGE, 0, 'dirt');
assert.ok(street.getAttribute('position')!.count > stock.getAttribute('position')!.count * 0.5);
assert.ok(sport.getAttribute('position')!.count > street.getAttribute('position')!.count);
assert.ok(dirt.getAttribute('position')!.count > stock.getAttribute('position')!.count);
assert.match(sport.name, /sport/);
assert.match(dirt.name, /dirt/);

const pipPads = jackPoints(VEHICLES.pip);
assert.ok(Math.abs(pipPads[0]![0]) < VEHICLES.pip.chassis.track / 2);
const needlePads = jackPoints(VEHICLES.needle);
assert.ok(Math.abs(needlePads[0]![0]) < VEHICLES.needle.chassis.track / 2);

for (const id of Object.keys(VEHICLES) as Array<keyof typeof VEHICLES>) {
  const spec = VEHICLES[id];
  const hole = hoodBox(spec);
  const floor = spec.clearance - spec.chassis.cgHeight;
  assert.ok(hole.min.y > floor + 0.15, `${id}: hood hole reaches the floor`);
  createGarageWheel(spec, 2, 'road').dispose();
}

stock.dispose();
street.dispose();
sport.dispose();
dirt.dispose();
console.log('   ✓ hood hole above undertray, jack pads miss tyres, wheel skins differ');
