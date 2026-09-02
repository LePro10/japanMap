/**
 * Prüfstand für den Fußmodus.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/walker.mts
 *
 * Was er prüft: Spawn in der Sakura-Schale, Gehen hält die Sollgeschwindigkeit,
 * Sprunghöhe aus der Formel, Wand bleibt Wand, gleicher Seed gleicher Fleck.
 * Was er nicht kann: sagen, ob der Walk-Cycle gut aussieht.
 */
import { Vector3 } from 'three';

import { CollisionWorld } from '@/game/CollisionWorld';
import { Walker, type WalkInput } from '@/game/Walker';
import {
  WALK_ALIGHT_GAP,
  WALK_BOARD_RANGE,
  WALK_SPAWN_INNER,
  WALK_SPAWN_OUTER,
  WALKER,
  rollWalkSpawn,
  walkSpawnZone,
} from '@/config/walker.config';

const DT = 1 / 60;

const flat = {
  height: () => 0,
  normal: (_x: number, _z: number, t: Vector3) => t.set(0, 1, 0),
  surface: () => 'gelaende' as const,
  waterDepth: () => 0,
};

function input(partial: Partial<WalkInput> = {}): WalkInput {
  return {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    ...partial,
  };
}

const problems: string[] = [];
const notes: string[] = [];

function ok(label: string, value?: string): void {
  notes.push(`   ✓ ${label}${value === undefined ? '' : `: ${value}`}`);
}
function bad(label: string, value?: string): void {
  problems.push(`   ✗ ${label}${value === undefined ? '' : `: ${value}`}`);
}

// ── Spawn in der Schale ──────────────────────────────────────────────────
const zone = walkSpawnZone();
const samples = 40;
let minR = Infinity;
let maxR = 0;
let outside = 0;
for (let i = 0; i < samples; i++) {
  const spawn = rollWalkSpawn(1000 + i * 17);
  const r = Math.hypot(spawn.x - zone.x, spawn.z - zone.z);
  minR = Math.min(minR, r);
  maxR = Math.max(maxR, r);
  if (r < WALK_SPAWN_INNER - 0.05 || r > WALK_SPAWN_OUTER + 0.05) outside++;
}
if (outside === 0 && minR >= WALK_SPAWN_INNER - 0.05 && maxR <= WALK_SPAWN_OUTER + 0.05) {
  ok('Spawn in der Sakura-Schale', `${minR.toFixed(1)}…${maxR.toFixed(1)} m vom Mittelpunkt`);
} else {
  bad('Spawn verlässt die Schale', `${outside}/${samples} außerhalb, ${minR.toFixed(1)}…${maxR.toFixed(1)} m`);
}

const a = rollWalkSpawn(42);
const b = rollWalkSpawn(42);
if (a.x === b.x && a.z === b.z && a.heading === b.heading) {
  ok('gleicher Seed, gleicher Fleck', `seed 42 → (${a.x.toFixed(2)}, ${a.z.toFixed(2)})`);
} else {
  bad('Spawn nicht reproduzierbar');
}

const c = rollWalkSpawn(43);
if (c.x !== a.x || c.z !== a.z) {
  ok('anderer Seed, anderer Fleck');
} else {
  bad('zwei Seeds treffen denselben Pixel');
}

// ── Aussteigen: Abstand zur Fahrzeugmitte ────────────────────────────────
{
  const yaw = 0.7;
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const gap = Math.hypot(rx * WALK_ALIGHT_GAP, rz * WALK_ALIGHT_GAP);
  if (Math.abs(gap - WALK_ALIGHT_GAP) < 1e-9 && WALK_ALIGHT_GAP < WALK_BOARD_RANGE) {
    ok(
      'Aussteigen in Reichweite der Tür',
      `Lücke ${WALK_ALIGHT_GAP.toFixed(2)} m < Einsteigen ${WALK_BOARD_RANGE.toFixed(1)} m`,
    );
  } else {
    bad('Aussteigen außerhalb der Einsteige-Reichweite', `${gap.toFixed(2)} m`);
  }
}

// ── Gehen: Sollgeschwindigkeit ───────────────────────────────────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  const heading = 0;
  for (let i = 0; i < 180; i++) {
    w.step(DT, input({ forward: 1 }), flat, null, heading);
  }
  const spd = w.speed;
  const err = Math.abs(spd - WALKER.walkSpeed);
  if (err < 0.15 && w.position.z > 7.5 && w.grounded) {
    ok(
      'Schritt hält Solltempo',
      `${spd.toFixed(2)} m/s (Soll ${WALKER.walkSpeed}) nach 3 s, s = ${w.position.z.toFixed(1)} m`,
    );
  } else {
    bad(
      'Schritttempo',
      `${spd.toFixed(2)} m/s, z = ${w.position.z.toFixed(2)} m, grounded ${w.grounded}`,
    );
  }
}

// ── Sprint ───────────────────────────────────────────────────────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  for (let i = 0; i < 180; i++) {
    w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
  }
  const spd = w.speed;
  if (Math.abs(spd - WALKER.runSpeed) < 0.2) {
    ok('Sprint hält Solltempo', `${spd.toFixed(2)} m/s (Soll ${WALKER.runSpeed})`);
  } else {
    bad('Sprinttempo', `${spd.toFixed(2)} m/s`);
  }
}

// ── Sprunghöhe ───────────────────────────────────────────────────────────
{
  const expect = (WALKER.jumpSpeed * WALKER.jumpSpeed) / (2 * WALKER.gravity);
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  w.step(DT, input({ jump: true }), flat, null, 0);
  let peak = w.position.y;
  for (let i = 0; i < 120; i++) {
    w.step(DT, input(), flat, null, 0);
    if (w.position.y > peak) peak = w.position.y;
  }
  if (Math.abs(peak - expect) < 0.12 && w.grounded) {
    ok('Sprunghöhe', `Spitze ${peak.toFixed(2)} m (Soll ${expect.toFixed(2)} m), landet`);
  } else {
    bad('Sprung', `Spitze ${peak.toFixed(2)} m, Soll ${expect.toFixed(2)}, grounded ${w.grounded}`);
  }
}

// ── Wand ─────────────────────────────────────────────────────────────────
{
  const world = new CollisionWorld();
  world.addBox(-0.4, 0.4, -4, 4, -1, 3);
  const w = new Walker();
  w.respawn(-2, 0, Math.PI / 2, flat);
  // Kamera nach +X, vorwärts in die Wand bei x = 0.
  for (let i = 0; i < 180; i++) {
    w.step(DT, input({ forward: 1 }), flat, world, Math.PI / 2);
  }
  if (w.position.x < -0.2) {
    ok('Wand bleibt Wand', `x = ${w.position.x.toFixed(2)} m nach 3 s Vollschritt`);
  } else {
    bad('durch die Wand gelaufen', `x = ${w.position.x.toFixed(2)} m`);
  }
}

// ── Kamera-relatives Gehen: W bei heading π/2 läuft nach +X ──────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  for (let i = 0; i < 120; i++) {
    w.step(DT, input({ forward: 1 }), flat, null, Math.PI / 2);
  }
  if (w.position.x > 6 && Math.abs(w.position.z) < 0.4) {
    ok('W folgt der Kamera', `nach 2 s: x = ${w.position.x.toFixed(1)} m, z = ${w.position.z.toFixed(2)} m`);
  } else {
    bad('W nicht kamera-relativ', `x = ${w.position.x.toFixed(2)}, z = ${w.position.z.toFixed(2)}`);
  }
}

console.log(`Walker-Prüfstand (${(WALKER.height * 100).toFixed(0)} cm, g = ${WALKER.gravity})`);
console.log('');
for (const line of notes) console.log(line);
if (problems.length > 0) {
  console.log('');
  for (const line of problems) console.log(line);
  process.exitCode = 1;
} else {
  console.log('');
  console.log(`   ${notes.length} Proben grün.`);
}
