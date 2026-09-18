import assert from 'node:assert/strict';

import { catchUpFactor } from '@/game/ai/catchUp';
import { RaceLine } from '@/game/ai/RaceLine';
import { RivalDriver } from '@/game/ai/RivalDriver';
import { bumpPair, overlapObb } from '@/game/ai/carBump';
import { Vehicle } from '@/game/Vehicle';
import { TOUGE } from '@/config/vehicles.config';
// @ts-expect-error — reines Node-ESM ohne Typen, wie der Rest von tools/.
import { flatGround } from './flat.mjs';

/**
 * Prüfstand für Renngegner — Rammstoß, Überholen, Gummiband.
 *
 * Ohne Welt und ohne Renderer. Die Lehre aus P18 gilt: dieselbe `Vehicle`-
 * Klasse, derselbe `RivalDriver`, kein nachgebautes Modell.
 */

const DT = 1 / 60;
const ground = flatGround();

function straightLine(length = 400): RaceLine {
  const n = 200;
  const points = new Float32Array(n * 3);
  const step = length / (n - 1);
  for (let i = 0; i < n; i++) {
    points[i * 3 + 2] = i * step;
  }
  return new RaceLine(points, {
    latAccel: 9,
    brakeAccel: 8,
    driveAccel: 5.2,
    maxSpeed: 40,
    crestAccel: 0.5,
    closed: false,
  });
}

function place(car: Vehicle, x: number, z: number, yaw: number): void {
  car.respawn(x, z, yaw, ground);
}

// ── SAT ──────────────────────────────────────────────────────────────────
const hit = overlapObb(
  { x: 0, z: 0, yaw: 0, halfLength: 2, halfWidth: 0.9 },
  { x: 0, z: 2.5, yaw: 0, halfLength: 2, halfWidth: 0.9 },
);
assert.ok(hit, 'overlapping OBBs must report a hit');
assert.ok(hit!.depth > 1.4 && hit!.depth < 1.6, `overlap depth ${hit!.depth}`);
assert.ok(Math.abs(hit!.nz) > Math.abs(hit!.nx), 'rear-end normal should be along Z');

const miss = overlapObb(
  { x: 0, z: 0, yaw: 0, halfLength: 2, halfWidth: 0.9 },
  { x: 0, z: 8, yaw: 0, halfLength: 2, halfWidth: 0.9 },
);
assert.equal(miss, null, 'separated OBBs must not collide');

// ── Rammstoß: Spieler schiebt den Gegner weg ─────────────────────────────
const player = new Vehicle(TOUGE);
const rival = new Vehicle(TOUGE);
place(player, 0, 0, 0);
place(rival, 0, 3.4, 0);
player.velocity.set(0, 0, 22);
rival.velocity.set(0, 0, 6);
const playerSpeed0 = player.velocity.z;
const rivalSpeed0 = rival.velocity.z;
const z0 = rival.position.z;
assert.ok(bumpPair(player, rival, 0), 'rear-end must contact');
assert.ok(rival.position.z > z0, `rival must be shoved forward (${rival.position.z} vs ${z0})`);
assert.ok(rival.velocity.z > rivalSpeed0 + 2, `rival Δv too small: ${rival.velocity.z - rivalSpeed0}`);
assert.ok(
  player.velocity.z > playerSpeed0 * 0.55,
  `player lost too much speed: ${player.velocity.z} from ${playerSpeed0}`,
);
assert.ok(
  Math.hypot(player.velocity.x, player.velocity.z) < 40,
  `player launched: ${Math.hypot(player.velocity.x, player.velocity.z)}`,
);

// Seitlich: der langsamere Wagen fliegt zur Seite, nicht in den Orbit.
const sideA = new Vehicle(TOUGE);
const sideB = new Vehicle(TOUGE);
place(sideA, 0, 0, 0);
place(sideB, 1.5, 0.4, 0);
sideA.velocity.set(0, 0, 18);
sideB.velocity.set(0, 0, 10);
assert.ok(bumpPair(sideA, sideB, 0), 'sideswipe must contact');
assert.ok(Math.abs(sideB.position.x - sideA.position.x) > 1.5, 'sideswipe must separate in X');
assert.ok(Math.hypot(sideB.velocity.x, sideB.velocity.z) < 28, 'sideswipe must not orbit');

// ── Gummiband: Totzone, Aufholen, nicht Warten ───────────────────────────
assert.equal(catchUpFactor(0, 0, 1), 1, 'dead zone at the player');
assert.equal(catchUpFactor(10, 0, 1), 1, 'dead zone ±12 m');
assert.ok(catchUpFactor(80, 0, 1) > 1.07 && catchUpFactor(80, 0, 1) < 1.11, 'behind catch-up');
assert.ok(catchUpFactor(-80, 0, 1) < 0.97 && catchUpFactor(-80, 0, 1) > 0.93, 'ahead only mild');
assert.ok(catchUpFactor(0, 18, 1) > 1, 'AOKI even with the player still pushes for the lead');
assert.ok(catchUpFactor(80, 18, 1) >= catchUpFactor(80, 0, 1), 'a lead slot adds catch-up when behind');

// ── Überholen ────────────────────────────────────────────────────────────
const line = straightLine();
const driver = new RivalDriver(line, {
  pace: 1,
  lane: 0,
  rubber: 0,
  aggression: 1,
  block: 0.2,
});
driver.placeAt(0, 0);
driver.drive(
  DT,
  { x: 0, z: 0 },
  0,
  22,
  1,
  [{ progress: 8, along: 8, across: 0.4, speed: 12, isPlayer: true }],
  0.4,
);
assert.equal(driver.tactic, 'overtake', `expected overtake, got ${driver.tactic}`);

const clean = new RivalDriver(line, { pace: 1, lane: 0, rubber: 0, aggression: 1 });
clean.placeAt(0, 0);
clean.drive(DT, { x: 0, z: 0 }, 0, 22, 1);
assert.equal(clean.tactic, 'race', 'empty track stays on the race line');

const draftOn = new RivalDriver(line, { pace: 1, lane: 0, rubber: 0 });
const draftOff = new RivalDriver(line, { pace: 1, lane: 0, rubber: 0 });
draftOn.placeAt(40, 40);
draftOff.placeAt(40, 40);
const withDraft = draftOn.drive(
  DT,
  { x: 0, z: 40 },
  0,
  20,
  1,
  [{ progress: 7, along: 7, across: 0.1, speed: 20, isPlayer: true }],
);
const without = draftOff.drive(DT, { x: 0, z: 40 }, 0, 20, 1);
assert.ok(
  withDraft.throttle >= without.throttle,
  `draft should not slow the attacker (${withDraft.throttle} vs ${without.throttle})`,
);

// ── Fahren: der Regler kommt auf der Geraden voran und bleibt auf der Linie ─
const racer = new Vehicle(TOUGE);
place(racer, 0, 2, 0);
const pilot = new RivalDriver(line, { pace: 1, lane: 0, rubber: 0, aggression: 1 });
pilot.placeAt(2, 0);
for (let i = 0; i < 600; i++) {
  const command = pilot.drive(DT, racer.position, racer.yaw, racer.telemetry.speed, 1);
  racer.step(DT, command, ground, null);
}
assert.ok(pilot.distance > 80, `pilot only covered ${pilot.distance.toFixed(1)} m in 10 s`);
assert.ok(Math.abs(pilot.cross) < 3, `pilot drifted ${pilot.cross.toFixed(2)} m off the line`);
assert.ok(racer.telemetry.speed > 12, `pilot too slow: ${(racer.telemetry.speed * 3.6).toFixed(1)} km/h`);

console.log('rivals bench: bump, catch-up, overtake, draft, pace — ok');
console.log(
  JSON.stringify(
    {
      rearEnd: {
        rivalDeltaV: +(rival.velocity.z - rivalSpeed0).toFixed(2),
        playerKept: +(player.velocity.z / playerSpeed0).toFixed(2),
        shoveM: +(rival.position.z - z0).toFixed(2),
      },
      catchUp: {
        dead: catchUpFactor(8, 0, 1),
        behind: +catchUpFactor(80, 0, 1).toFixed(3),
        ahead: +catchUpFactor(-80, 0, 1).toFixed(3),
      },
      tactic: driver.tactic,
      pace: { m: +pilot.distance.toFixed(1), kmh: +(racer.telemetry.speed * 3.6).toFixed(1), cross: +pilot.cross.toFixed(2) },
    },
    null,
    2,
  ),
);
