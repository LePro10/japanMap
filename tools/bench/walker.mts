/**
 * Prüfstand für den Fußmodus.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/walker.mts
 *
 * Was er prüft: Spawn in der Sakura-Schale, Gehen hält die Sollgeschwindigkeit,
 * Sprunghöhe aus der Formel, Wand bleibt Wand, Steilhang ist keine Leiter,
 * gleicher Seed gleicher Fleck.
 * Was er nicht kann: sagen, ob der Walk-Cycle gut aussieht.
 */
import { MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';

import { CollisionWorld } from '@/game/CollisionWorld';
import { WalkCamera } from '@/game/WalkCamera';
import { Walker, type WalkInput } from '@/game/Walker';
import { createWalkerRig } from '@/game/walkerMesh';
import type { PropMaterial } from '@/world/materials/PropMaterial';
import {
  WALK_ALIGHT_GAP,
  WALK_BOARD_RANGE,
  WALK_CAMERA,
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
    slide: false,
    ...partial,
  };
}

/** Rampe um X, Höhe = ±z·tanθ. `downhill` = +Z ist hangab. */
function ramp(angleDeg: number, downhill = false) {
  const θ = (angleDeg * Math.PI) / 180;
  const sign = downhill ? -1 : 1;
  const ny = Math.cos(θ);
  const nz = -sign * Math.sin(θ);
  return {
    height: (_x: number, z: number) => sign * z * Math.tan(θ),
    normal: (_x: number, _z: number, t: Vector3) => t.set(0, ny, nz),
    surface: () => 'gelaende' as const,
    waterDepth: () => 0,
  };
}

/** Tal bei z ≤ 0, Steilwand für z > 0 — der Fall „Sprung in den Berg". */
function cliff(angleDeg: number) {
  const θ = (angleDeg * Math.PI) / 180;
  const ny = Math.cos(θ);
  const nz = -Math.sin(θ);
  return {
    height: (_x: number, z: number) => (z <= 0 ? 0 : z * Math.tan(θ)),
    normal: (_x: number, z: number, t: Vector3) =>
      z <= 0 ? t.set(0, 1, 0) : t.set(0, ny, nz),
    surface: () => 'gelaende' as const,
    waterDepth: () => 0,
  };
}

function gapToFloor(w: Walker, ground: { height: (x: number, z: number) => number }): number {
  return w.position.y - ground.height(w.position.x, w.position.z);
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
const a = rollWalkSpawn(42);
const r = Math.hypot(a.x - zone.x, a.z - zone.z);
if (r < 0.05 && a.heading === Math.PI) {
  ok('Spawn im Hof der Schale', `(${a.x.toFixed(1)}, ${a.z.toFixed(1)}), Seed ${a.seed}`);
} else {
  bad('Spawn nicht im Hof', `r = ${r.toFixed(2)} m, heading ${a.heading}`);
}

const b = rollWalkSpawn(42);
if (a.x === b.x && a.z === b.z && a.heading === b.heading && a.seed === 42) {
  ok('gleicher Seed, gleicher Fleck', `seed 42 → (${a.x.toFixed(2)}, ${a.z.toFixed(2)})`);
} else {
  bad('Spawn nicht reproduzierbar');
}

const c = rollWalkSpawn(43);
if (c.x === a.x && c.z === a.z && c.seed === 43) {
  ok('Hof bleibt, Seed wandert mit', `seed 43 → (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
} else {
  bad('Spawn verwirft den Seed', `seed ${c.seed}, (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
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

// ── Sprung in die Wand: nicht drauf, nicht fest ──────────────────────────
{
  const world = new CollisionWorld();
  world.addBox(-0.4, 0.4, -4, 4, -1, 3);
  const w = new Walker();
  w.respawn(-2, 0, Math.PI / 2, flat);
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    w.step(DT, input({ forward: 1, jump: true }), flat, world, Math.PI / 2);
    if (w.position.y > peak) peak = w.position.y;
  }
  const inFront = w.position.x < -0.2;
  const jumpOnly = peak < 1.2;
  for (let i = 0; i < 120; i++) {
    w.step(DT, input({ forward: -1 }), flat, world, Math.PI / 2);
  }
  const away = w.position.x < -4 && w.grounded;
  if (inFront && jumpOnly && away) {
    ok(
      'Sprung in die Wand bleibt davor',
      `x = ${w.position.x.toFixed(2)} m, Spitze ${peak.toFixed(2)} m, danach weg`,
    );
  } else {
    bad(
      'Sprung in die Wand',
      `x ${w.position.x.toFixed(2)}, Spitze ${peak.toFixed(2)}, grounded ${w.grounded}, away ${away}`,
    );
  }
}

// ── Steilhang ist Wand: Gehen und Sprung klettern nicht ─────────────────
{
  const wall = cliff(70);
  const walker = new Walker();
  walker.respawn(0, -1.5, 0, wall);
  for (let i = 0; i < 180; i++) {
    walker.step(DT, input({ forward: 1 }), wall, null, 0);
  }
  const stay =
    walker.grounded &&
    walker.position.y < 0.15 &&
    walker.position.z < 0.2 &&
    Math.abs(gapToFloor(walker, wall)) < 0.05;
  if (stay) {
    ok(
      'Gehen klettert keine 70°',
      `y = ${walker.position.y.toFixed(2)} m, z = ${walker.position.z.toFixed(2)} m, grounded`,
    );
  } else {
    bad(
      'Gehen die Steilwand hoch',
      `y = ${walker.position.y.toFixed(2)} m, z = ${walker.position.z.toFixed(2)} m, grounded ${walker.grounded}`,
    );
  }

  const jumper = new Walker();
  jumper.respawn(0, -1.5, 0, wall);
  let peak = jumper.position.y;
  for (let i = 0; i < 240; i++) {
    jumper.step(DT, input({ forward: 1, jump: true }), wall, null, 0);
    if (jumper.position.y > peak) peak = jumper.position.y;
  }
  for (let i = 0; i < 90; i++) jumper.step(DT, input(), wall, null, 0);
  const expect = (WALKER.jumpSpeed * WALKER.jumpSpeed) / (2 * WALKER.gravity);
  const landed =
    jumper.grounded &&
    jumper.position.y < 0.15 &&
    jumper.position.z < 0.2 &&
    peak < expect + 0.35;
  if (landed) {
    ok(
      'Sprung klettert keine 70°',
      `Spitze ${peak.toFixed(2)} m (Sollsprung ${expect.toFixed(2)}), z = ${jumper.position.z.toFixed(2)} m, landet`,
    );
  } else {
    bad(
      'Sprung die Steilwand hoch',
      `Spitze ${peak.toFixed(2)} m, z = ${jumper.position.z.toFixed(2)} m, y = ${jumper.position.y.toFixed(2)}, grounded ${jumper.grounded}`,
    );
  }

  const hopper = new Walker();
  hopper.respawn(0, -1.5, 0, wall);
  peak = hopper.position.y;
  for (let i = 0; i < 360; i++) {
    hopper.step(DT, input({ forward: 1, jump: hopper.grounded }), wall, null, 0);
    if (hopper.position.y > peak) peak = hopper.position.y;
  }
  for (let i = 0; i < 90; i++) hopper.step(DT, input(), wall, null, 0);
  if (
    peak < expect + 0.5 &&
    hopper.position.z < 0.2 &&
    hopper.position.y < 0.15 &&
    hopper.grounded
  ) {
    ok(
      'Hopser klettern keine 70°',
      `Spitze ${peak.toFixed(2)} m, z = ${hopper.position.z.toFixed(2)} m, landet`,
    );
  } else {
    bad(
      'Hopser die Steilwand hoch',
      `Spitze ${peak.toFixed(2)} m, z = ${hopper.position.z.toFixed(2)} m, y = ${hopper.position.y.toFixed(2)}, grounded ${hopper.grounded}`,
    );
  }
}

{
  const wall = cliff(80);
  const w = new Walker();
  w.respawn(0, -1.5, 0, wall);
  let peak = w.position.y;
  for (let i = 0; i < 240; i++) {
    w.step(DT, input({ forward: 1, jump: true }), wall, null, 0);
    if (w.position.y > peak) peak = w.position.y;
  }
  for (let i = 0; i < 90; i++) w.step(DT, input(), wall, null, 0);
  if (peak < 1.5 && w.position.z < 0.2 && w.grounded && w.position.y < 0.15) {
    ok(
      'Sprung klettert keine 80°',
      `Spitze ${peak.toFixed(2)} m, z = ${w.position.z.toFixed(2)} m, landet`,
    );
  } else {
    bad(
      'Sprung die Felswand hoch',
      `Spitze ${peak.toFixed(2)} m, z = ${w.position.z.toFixed(2)} m, y = ${w.position.y.toFixed(2)}, grounded ${w.grounded}`,
    );
  }
}

{
  // Nach dem Block an der Wand muss man wieder wegkommen — nicht feststecken.
  const wall = cliff(70);
  const w = new Walker();
  w.respawn(0, -1.5, 0, wall);
  for (let i = 0; i < 120; i++) w.step(DT, input({ forward: 1, jump: true }), wall, null, 0);
  for (let i = 0; i < 120; i++) w.step(DT, input({ forward: -1 }), wall, null, 0);
  if (w.position.z < -2 && w.grounded && w.position.y < 0.15) {
    ok('von der Steilwand wieder weg', `z = ${w.position.z.toFixed(2)} m, grounded`);
  } else {
    bad(
      'an der Steilwand fest',
      `z = ${w.position.z.toFixed(2)} m, y = ${w.position.y.toFixed(2)}, grounded ${w.grounded}`,
    );
  }
}

{
  // Gehbarer Hang bleibt gehbar — die Wandregel darf 20° nicht mitnehmen.
  const hill = ramp(20, false);
  const w = new Walker();
  w.respawn(0, 0, 0, hill);
  for (let i = 0; i < 180; i++) w.step(DT, input({ forward: 1 }), hill, null, 0);
  if (w.position.z > 7 && w.grounded && w.position.y > 2) {
    ok(
      '20° bleibt gehbar',
      `z = ${w.position.z.toFixed(1)} m, y = ${w.position.y.toFixed(1)} m`,
    );
  } else {
    bad(
      '20° blockiert',
      `z = ${w.position.z.toFixed(2)} m, y = ${w.position.y.toFixed(2)}, grounded ${w.grounded}`,
    );
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

// ── Rutschen: Flach ──────────────────────────────────────────────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  for (let i = 0; i < 120; i++) w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
  const before = w.speed;
  w.step(DT, input({ forward: 1, sprint: true, slide: true }), flat, null, 0);
  if (w.sliding && w.grounded && w.speed >= before - 0.05) {
    ok('Rutsch startet aus dem Sprint', `${w.speed.toFixed(2)} m/s, vorher ${before.toFixed(2)}`);
  } else {
    bad('Rutsch startet nicht', `sliding ${w.sliding}, grounded ${w.grounded}, v ${w.speed.toFixed(2)}`);
  }
  // Sprint loslassen: sonst beschleunigt der Schritt nach dem Ausstieg
  // wieder aufs Einstiegstempo und der Rutsch kettet. Gemessen wird der
  // eine Rutsch, nicht die Kette.
  let still = 0;
  for (let i = 0; i < 180; i++) {
    w.step(DT, input({ forward: 1, slide: true }), flat, null, 0);
    if (w.sliding) still++;
    if (Math.abs(gapToFloor(w, flat)) > 0.05) {
      bad('Rutsch hebt auf Flach ab', `y = ${w.position.y.toFixed(3)} bei Schritt ${i}`);
      break;
    }
  }
  if (still > 20 && still < 160 && !w.sliding && w.grounded) {
    ok('Rutsch auf Flach endet von selbst', `${(still / 60).toFixed(2)} s, danach ${w.speed.toFixed(2)} m/s`);
  } else if (problems.at(-1)?.includes('hebt auf Flach')) {
    /* schon gemeldet */
  } else {
    bad('Rutsch auf Flach', `sliding-Frames ${still}, ende sliding ${w.sliding} v ${w.speed.toFixed(2)}`);
  }
}

{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  for (let i = 0; i < 120; i++) w.step(DT, input({ forward: 1 }), flat, null, 0);
  for (let i = 0; i < 30; i++) w.step(DT, input({ forward: 1, slide: true }), flat, null, 0);
  if (!w.sliding) ok('Schritt ohne Sprint rutscht auf Flach nicht');
  else bad('Schritt-Rutsch auf Flach', `${w.speed.toFixed(2)} m/s`);
}

// ── Rutschen: bergab gewinnt Tempo, bleibt am Boden ──────────────────────
{
  const hill = ramp(20, true);
  const w = new Walker();
  w.respawn(0, -4, 0, hill);
  for (let i = 0; i < 90; i++) w.step(DT, input({ forward: 1, sprint: true }), hill, null, 0);
  const sprintV = w.speed;
  let maxGap = 0;
  let maxVy = 0;
  for (let i = 0; i < 90; i++) {
    w.step(DT, input({ forward: 1, sprint: true, slide: true }), hill, null, 0);
    maxGap = Math.max(maxGap, Math.abs(gapToFloor(w, hill)));
    maxVy = Math.max(maxVy, w.vy);
  }
  if (w.sliding && w.speed > sprintV + 0.4 && w.grounded && maxGap < 0.05 && maxVy < 0.2) {
    ok(
      'Rutsch bergab gewinnt Tempo',
      `${w.speed.toFixed(2)} m/s gegen Sprint ${sprintV.toFixed(2)}, Spalt ${maxGap.toFixed(3)} m`,
    );
  } else {
    bad(
      'Rutsch bergab',
      `v ${w.speed.toFixed(2)} (Sprint ${sprintV.toFixed(2)}), sliding ${w.sliding}, grounded ${w.grounded}, Spalt ${maxGap.toFixed(3)}, vy ${maxVy.toFixed(3)}`,
    );
  }
}

// ── Rutschen: bergauf kein Launch, kein Hochschuss ───────────────────────
{
  const hill = ramp(20, false);
  const sprinter = new Walker();
  sprinter.respawn(0, 0, 0, hill);
  for (let i = 0; i < 90; i++) sprinter.step(DT, input({ forward: 1, sprint: true }), hill, null, 0);
  const sprintZ0 = sprinter.position.z;
  for (let i = 0; i < 90; i++) sprinter.step(DT, input({ forward: 1, sprint: true }), hill, null, 0);
  const sprintGain = sprinter.position.z - sprintZ0;

  const w = new Walker();
  w.respawn(0, 0, 0, hill);
  for (let i = 0; i < 90; i++) w.step(DT, input({ forward: 1, sprint: true }), hill, null, 0);
  const z0 = w.position.z;
  let maxGap = 0;
  let maxVy = 0;
  let airborne = 0;
  for (let i = 0; i < 90; i++) {
    w.step(DT, input({ forward: 1, sprint: true, slide: true }), hill, null, 0);
    maxGap = Math.max(maxGap, Math.abs(gapToFloor(w, hill)));
    maxVy = Math.max(maxVy, w.vy);
    if (!w.grounded) airborne++;
  }
  const slideGain = w.position.z - z0;
  const launched = maxGap > 0.08 || maxVy > 0.35 || airborne > 3;
  const shotUp = slideGain > sprintGain - 0.05;
  if (!launched && !shotUp) {
    ok(
      'Rutsch schießt nicht den Hang hoch',
      `Δz ${slideGain.toFixed(2)} m gegen Sprint ${sprintGain.toFixed(2)}, Spalt ${maxGap.toFixed(3)} m, vy ${maxVy.toFixed(3)}`,
    );
  } else {
    bad(
      'Rutsch bergauf',
      `Δz ${slideGain.toFixed(2)} / Sprint ${sprintGain.toFixed(2)}, Spalt ${maxGap.toFixed(3)}, vy ${maxVy.toFixed(3)}, air ${airborne}, v ${w.speed.toFixed(2)}`,
    );
  }
}

// ── Tal: bergab in bergauf, kein Launch an der Naht ──────────────────────
{
  const θ = (18 * Math.PI) / 180;
  const valley = {
    height: (_x: number, z: number) => Math.abs(z) * Math.tan(θ),
    normal: (_x: number, z: number, t: Vector3) =>
      t.set(0, Math.cos(θ), z >= 0 ? -Math.sin(θ) : Math.sin(θ)),
    surface: () => 'gelaende' as const,
    waterDepth: () => 0,
  };
  const w = new Walker();
  w.respawn(0, -6, 0, valley);
  for (let i = 0; i < 60; i++) w.step(DT, input({ forward: 1, sprint: true }), valley, null, 0);
  let maxGap = 0;
  let maxVy = 0;
  let crossed = false;
  for (let i = 0; i < 150; i++) {
    w.step(DT, input({ forward: 1, sprint: true, slide: true }), valley, null, 0);
    maxGap = Math.max(maxGap, Math.abs(gapToFloor(w, valley)));
    maxVy = Math.max(maxVy, w.vy);
    if (w.position.z > 1) crossed = true;
  }
  if (crossed && maxGap < 0.1 && maxVy < 0.5) {
    ok(
      'Talnaht ohne Launch',
      `Ende z = ${w.position.z.toFixed(2)}, Spalt ${maxGap.toFixed(3)} m, vy ${maxVy.toFixed(3)}`,
    );
  } else {
    bad(
      'Talnaht',
      `z ${w.position.z.toFixed(2)}, crossed ${crossed}, Spalt ${maxGap.toFixed(3)}, vy ${maxVy.toFixed(3)}`,
    );
  }
}

// ── Space bleibt Sprung, auch aus dem Rutsch ─────────────────────────────
{
  const expect = (WALKER.jumpSpeed * WALKER.jumpSpeed) / (2 * WALKER.gravity);
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  for (let i = 0; i < 90; i++) w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
  for (let i = 0; i < 12; i++) w.step(DT, input({ forward: 1, sprint: true, slide: true }), flat, null, 0);
  if (!w.sliding) {
    bad('Sprung aus Rutsch: war nicht im Rutsch');
  } else {
    w.step(DT, input({ forward: 1, jump: true, slide: true }), flat, null, 0);
    let peak = w.position.y;
    for (let i = 0; i < 120; i++) {
      w.step(DT, input({ forward: 1 }), flat, null, 0);
      if (w.position.y > peak) peak = w.position.y;
    }
    if (!w.sliding && Math.abs(peak - expect) < 0.15 && w.grounded) {
      ok('Space aus dem Rutsch ist Sprung', `Spitze ${peak.toFixed(2)} m, landet`);
    } else {
      bad('Space aus dem Rutsch', `Spitze ${peak.toFixed(2)}, sliding ${w.sliding}, grounded ${w.grounded}`);
    }
  }
}

// ── Sprint danach unverändert ────────────────────────────────────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  for (let i = 0; i < 90; i++) w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
  for (let i = 0; i < 40; i++) w.step(DT, input({ forward: 1, sprint: true, slide: true }), flat, null, 0);
  for (let i = 0; i < 120; i++) w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
  if (!w.sliding && Math.abs(w.speed - WALKER.runSpeed) < 0.25) {
    ok('Sprint nach dem Rutsch hält Tempo', `${w.speed.toFixed(2)} m/s`);
  } else {
    bad('Sprint nach Rutsch', `${w.speed.toFixed(2)} m/s, sliding ${w.sliding}`);
  }
}

// ── Kapsel bleibt sane ───────────────────────────────────────────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  const stand = w.capsuleHeights();
  for (let i = 0; i < 90; i++) w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
  for (let i = 0; i < 8; i++) w.step(DT, input({ forward: 1, sprint: true, slide: true }), flat, null, 0);
  const slide = w.capsuleHeights();
  const hipsOk = slide.hips > WALKER.radius && slide.hips < stand.hips - 0.08;
  const chestOk = slide.chest > slide.hips + WALKER.radius * 0.5 && slide.chest < stand.chest - 0.15;
  if (w.sliding && hipsOk && chestOk) {
    ok(
      'Kapsel im Rutsch',
      `Hüfte ${slide.hips.toFixed(2)} m (Stand ${stand.hips.toFixed(2)}), Brust ${slide.chest.toFixed(2)}`,
    );
  } else {
    bad(
      'Kapsel',
      `sliding ${w.sliding} Hüfte ${slide.hips.toFixed(3)}/${stand.hips.toFixed(3)} Brust ${slide.chest.toFixed(3)}/${stand.chest.toFixed(3)}`,
    );
  }
}

{
  const world = new CollisionWorld();
  world.addBox(-0.4, 0.4, -4, 4, -1, 3);
  const w = new Walker();
  w.respawn(-2, 0, Math.PI / 2, flat);
  for (let i = 0; i < 90; i++) w.step(DT, input({ forward: 1, sprint: true }), flat, world, Math.PI / 2);
  for (let i = 0; i < 90; i++) {
    w.step(DT, input({ forward: 1, sprint: true, slide: true }), flat, world, Math.PI / 2);
  }
  if (w.position.x < -0.2) ok('Rutsch bleibt vor der Wand', `x = ${w.position.x.toFixed(2)} m`);
  else bad('Rutsch durch die Wand', `x = ${w.position.x.toFixed(2)} m`);
}

// ── Kamera: sinkt, bleibt über Grund, keine NaN ──────────────────────────
{
  const w = new Walker();
  w.respawn(0, 0, 0, flat);
  const cam = new PerspectiveCamera(WALK_CAMERA.fov, 1, 0.5, 6000);
  const look = new WalkCamera();
  look.reset(w);
  const tick = (inp: WalkInput) => {
    w.step(DT, inp, flat, null, 0);
    look.update(DT, w, flat, cam);
  };
  for (let i = 0; i < 90; i++) tick(input({ forward: 1, sprint: true }));
  for (let i = 0; i < 20; i++) look.update(DT, w, flat, cam);
  const yStand = cam.position.y;
  for (let i = 0; i < 45; i++) tick(input({ forward: 1, sprint: true, slide: true }));
  const ySlide = cam.position.y;
  const floor = WALK_CAMERA.groundClearance - 0.02;
  const finite =
    Number.isFinite(cam.position.x) &&
    Number.isFinite(cam.position.y) &&
    Number.isFinite(cam.position.z);
  if (finite && ySlide < yStand - 0.25 && ySlide > floor && w.sliding) {
    ok(
      'Kamera im Rutsch',
      `y ${ySlide.toFixed(2)} m gegen Stand ${yStand.toFixed(2)}, Bodenfreiheit ${ySlide.toFixed(2)}`,
    );
  } else {
    bad(
      'Kamera',
      `stand ${yStand.toFixed(3)} slide ${ySlide.toFixed(3)} floor ${floor.toFixed(3)} sliding ${w.sliding} finite ${finite}`,
    );
  }
}

// ── Beine: Sohlen auf der Fläche, kein Stroboskop am Hang ────────────────
{
  const dummy = new MeshBasicMaterial() as unknown as PropMaterial;
  const rig = createWalkerRig(dummy);
  const scratch = new Vector3();

  const soleGaps = (
    w: Walker,
    ground: { height: (x: number, z: number) => number },
  ): number[] => {
    rig.group.position.copy(w.position);
    rig.group.rotation.set(w.visualPitch, w.yaw, w.visualRoll);
    rig.animate(
      {
        cycle: w.cycle,
        speed: w.speed,
        grounded: w.grounded,
        vy: w.vy,
        lean: w.lean,
        slideAmount: w.slideAmount,
      },
      DT,
    );
    rig.group.updateMatrixWorld(true);
    const gaps: number[] = [];
    rig.group.traverse((obj) => {
      if (obj.name !== 'Sohle') return;
      obj.getWorldPosition(scratch);
      gaps.push(scratch.y - ground.height(scratch.x, scratch.z));
    });
    return gaps;
  };

  const shinOf = (side: 'BeinL' | 'BeinR'): number => {
    let v = 0;
    rig.group.traverse((obj) => {
      if (obj.name === side) {
        const shin = obj.children.find((c) => c.name === 'Unterschenkel');
        if (shin) v = shin.rotation.x;
      }
    });
    return v;
  };

  {
    const w = new Walker();
    w.respawn(0, 0, 0, flat);
    for (let i = 0; i < 90; i++) {
      w.step(DT, input({ forward: 1, sprint: true }), flat, null, 0);
      soleGaps(w, flat);
    }
    const stand = soleGaps(w, flat);
    for (let i = 0; i < 40; i++) {
      w.step(DT, input({ forward: 1, sprint: true, slide: true }), flat, null, 0);
      soleGaps(w, flat);
    }
    const slide = soleGaps(w, flat);
    const deepest = Math.min(...slide);
    const highest = Math.max(...slide);
    if (w.sliding && deepest > -0.08 && highest < 0.22) {
      ok(
        'Sohlen auf Flach',
        `Stand ${stand.map((g) => g.toFixed(3)).join('/')} → Rutsch ${slide.map((g) => g.toFixed(3)).join('/')}`,
      );
    } else {
      bad(
        'Sohlen auf Flach',
        `deep ${deepest.toFixed(3)} high ${highest.toFixed(3)} sliding ${w.sliding}`,
      );
    }
  }

  {
    const hill = ramp(20, true);
    const w = new Walker();
    w.respawn(0, -4, 0, hill);
    let air = 0;
    let maxShinJump = 0;
    let prevShin = 0;
    for (let i = 0; i < 90; i++) {
      w.step(DT, input({ forward: 1, sprint: true }), hill, null, 0);
      soleGaps(w, hill);
    }
    for (let i = 0; i < 90; i++) {
      w.step(DT, input({ forward: 1, sprint: true, slide: true }), hill, null, 0);
      soleGaps(w, hill);
      if (!w.grounded) air++;
      const shin = shinOf('BeinR');
      if (i > 8) maxShinJump = Math.max(maxShinJump, Math.abs(shin - prevShin));
      prevShin = shin;
    }
    const slide = soleGaps(w, hill);
    const deepest = Math.min(...slide);
    const highest = Math.max(...slide);
    const pitchOk = Math.abs(w.slopePitch) > 0.2;
    if (
      w.sliding &&
      air === 0 &&
      deepest > -0.1 &&
      highest < 0.28 &&
      maxShinJump < 0.12 &&
      pitchOk
    ) {
      ok(
        'Sohlen am Hang',
        `Spalt ${slide.map((g) => g.toFixed(3)).join('/')}, shinΔ ${maxShinJump.toFixed(3)}, pitch ${w.slopePitch.toFixed(2)}`,
      );
    } else {
      bad(
        'Beine am Hang',
        `deep ${deepest.toFixed(3)} high ${highest.toFixed(3)} air ${air} shinΔ ${maxShinJump.toFixed(3)} pitch ${w.slopePitch.toFixed(2)} sliding ${w.sliding}`,
      );
    }
  }

  {
    // 40° ist begehbar (`minNy` 0,55 ≈ 57°) und war der Bauchflop:
    // visualPitch folgte slopePitch 1:1, plus Wirbelsäule +0,48.
    const hill = ramp(40, true);
    const w = new Walker();
    w.respawn(0, -4, 0, hill);
    for (let i = 0; i < 90; i++) {
      w.step(DT, input({ forward: 1, sprint: true }), hill, null, 0);
    }
    for (let i = 0; i < 90; i++) {
      w.step(DT, input({ forward: 1, sprint: true, slide: true }), hill, null, 0);
    }
    soleGaps(w, hill);
    let headX = 0;
    let headY = 0;
    let headZ = 0;
    rig.group.traverse((obj) => {
      if (obj.name !== 'Schädel') return;
      obj.getWorldPosition(scratch);
      headX = scratch.x;
      headY = scratch.y;
      headZ = scratch.z;
    });
    const headClear = headY - hill.height(headX, headZ);
    const tilt = Math.abs(w.visualPitch);
    const raw = Math.abs(w.slopePitch);
    // Hocke hält den Schädel über einem Meter. Volle Hangneigung plus
    // Wirbelsäule 0,48 legt ihn an die Fläche.
    if (
      w.sliding &&
      raw > WALKER.slideTiltCap + 0.15 &&
      tilt <= WALKER.slideTiltCap + 1e-6 &&
      headClear > 1.05
    ) {
      ok(
        'Keine Bauchlage am Berg',
        `visualPitch ${w.visualPitch.toFixed(3)} gegen Hang ${w.slopePitch.toFixed(3)}, Schädel ${headClear.toFixed(2)} m über Boden`,
      );
    } else {
      bad(
        'Bauchlage',
        `sliding ${w.sliding} visual ${w.visualPitch.toFixed(3)} hang ${w.slopePitch.toFixed(3)} Schädel ${headClear.toFixed(2)} m`,
      );
    }
  }

  dummy.dispose();
  rig.dispose();
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
