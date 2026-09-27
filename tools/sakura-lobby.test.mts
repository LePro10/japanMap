import assert from 'node:assert/strict';
import { VEHICLE_ORDER } from '../src/config/vehicles.config.ts';
import { readFileSync } from 'node:fs';
import { eventBoardSpot, layoutPads, lobbyOffsets } from '../src/world/stunt/sakuraLobby.ts';

const s = { x: 550, z: 510 };
const { petal, bay } = lobbyOffsets(s);

assert.equal(petal.x, 514);
assert.equal(bay.x, 572);
assert.equal(petal.z + petal.d / 2, 485);
assert.equal(bay.z + bay.d / 2, 485);

const pads = layoutPads(petal.x, petal.z, petal.w, petal.d);
assert.equal(pads.length, VEHICLE_ORDER.length);
assert.deepEqual(new Set(pads.map(p => p.id)).size, VEHICLE_ORDER.length);

for (const pad of pads) {
  assert.ok(Math.abs(pad.x - petal.x) < petal.w / 2 - 0.8, `${pad.id} x ${pad.x}`);
  assert.ok(Math.abs(pad.z - petal.z) < petal.d / 2 - 0.4, `${pad.id} z ${pad.z}`);
  assert.ok(Math.hypot(pad.x - petal.x, pad.z - 485) > 4.2, `${pad.id} must not steal the WP2 doorway`);
}

const aisle = pads.filter(p => Math.abs(p.x - petal.x) < 1.6);
assert.ok(aisle.length <= 2, 'Centre aisle stays walkable');

// Die Zufahrt `commons-drive` darf durch keine Halle und keine Tafel laufen —
// sie lief bis 2026-09-26 durch die Ostwand von Petal Motors (sakuraLobby.ts).
// Gegen die gebackene Mittellinie, nicht gegen eine abgeschriebene Zahl.
const roads = JSON.parse(readFileSync(new URL('../assets/generated/roads/roads.json', import.meta.url), 'utf8'));
const drive = roads.roads.find((r: { id: string }) => r.id === 'commons-drive');
if (drive) {
  const board = eventBoardSpot(s);
  const blocks = [
    { name: 'Petal Motors', x: petal.x, z: petal.z, w: petal.w + 0.6, d: petal.d + 0.6 },
    { name: 'Open Bay', x: bay.x, z: bay.z, w: bay.w + 0.6, d: bay.d + 0.6 },
    { name: 'Event Board', x: board.x, z: board.z, w: 3.8, d: 0.6 },
  ];
  const c: number[] = drive.centerline;
  let closest = Infinity;
  for (let i = 0; i < c.length; i += 3) {
    const half = (drive.widths[i / 3] ?? 9) / 2;
    for (const b of blocks) {
      const dx = Math.max(0, Math.abs(c[i]! - b.x) - b.w / 2);
      const dz = Math.max(0, Math.abs(c[i + 2]! - b.z) - b.d / 2);
      const gap = Math.hypot(dx, dz) - half;
      closest = Math.min(closest, gap);
      assert.ok(gap > 1, `commons-drive läuft ${gap.toFixed(2)} m an ${b.name} (${c[i]!.toFixed(0)} | ${c[i + 2]!.toFixed(0)})`);
    }
  }
  console.log(`commons-drive: engster Abstand zu Halle/Tafel ${closest.toFixed(2)} m.`);
}

console.log('Sakura lobby: WP2 doorways, ten pads, aisle clear of the court prompt.');
