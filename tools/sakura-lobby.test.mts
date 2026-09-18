import assert from 'node:assert/strict';
import { VEHICLE_ORDER } from '../src/config/vehicles.config.ts';
import { layoutPads, lobbyOffsets } from '../src/world/stunt/sakuraLobby.ts';

const s = { x: 550, z: 510 };
const { petal, bay } = lobbyOffsets(s);

assert.equal(petal.x, 528);
assert.equal(bay.x, 572);
assert.equal(petal.z + petal.d / 2, 485);
assert.equal(bay.z + bay.d / 2, 485);

const pads = layoutPads(petal.x, petal.z, petal.w, petal.d);
assert.equal(pads.length, VEHICLE_ORDER.length);
assert.deepEqual(new Set(pads.map(p => p.id)).size, VEHICLE_ORDER.length);

for (const pad of pads) {
  assert.ok(Math.abs(pad.x - petal.x) < petal.w / 2 - 0.8, `${pad.id} x ${pad.x}`);
  assert.ok(Math.abs(pad.z - petal.z) < petal.d / 2 - 0.4, `${pad.id} z ${pad.z}`);
  assert.ok(Math.hypot(pad.x - 528, pad.z - 485) > 4.2, `${pad.id} must not steal the WP2 doorway`);
}

const aisle = pads.filter(p => Math.abs(p.x - petal.x) < 1.6);
assert.ok(aisle.length <= 2, 'Centre aisle stays walkable');

console.log('Sakura lobby: WP2 doorways, ten pads, aisle clear of the court prompt.');
