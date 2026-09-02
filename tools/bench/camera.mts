/**
 * Kameraprüfstand — Nickachse und Last, ohne Renderer.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/camera.mts
 *
 * Findet die vertauschte Mausachse (Verfolger/zu Fuß) und prüft, dass Gas den
 * Arm verlängert und Bremse ihn kürzt. Feel selbst bleibt eine Hand an der Maus.
 */
import { PerspectiveCamera } from 'three';

import { ChaseCamera } from '@/game/ChaseCamera';
import { WalkCamera } from '@/game/WalkCamera';
import { Vehicle } from '@/game/Vehicle';
import { Walker } from '@/game/Walker';
import { CHASE_CAMERA } from '@/config/vehicle.config';
import { flatGround, input } from './flat.mjs';

const DT = 1 / 60;
const g = flatGround('asphalt') as never;

function settle(update: (dt: number) => void, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) update(DT);
}

function dist(cam: PerspectiveCamera, v: Vehicle): number {
  return Math.hypot(cam.position.x - v.position.x, cam.position.z - v.position.z);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}

{
  const v = new Vehicle();
  v.respawn(0, 0, 0, g);
  const chase = new ChaseCamera();
  const cam = new PerspectiveCamera(CHASE_CAMERA.fov, 1, 0.5, 6000);
  chase.reset(v);
  const tick = () => {
    v.step(DT, input({}), g, null);
    chase.update(DT, v, g, cam);
  };
  settle(tick, 0.6);
  const y0 = cam.position.y;

  chase.look(0, -80);
  settle(tick, 0.8);
  const yUp = cam.position.y;

  chase.reset(v);
  settle(tick, 0.6);
  chase.look(0, 80);
  settle(tick, 0.8);
  const yDown = cam.position.y;

  console.log(
    `Verfolger Nick  y0=${y0.toFixed(3)}  Maus hoch=${yUp.toFixed(3)}  Maus runter=${yDown.toFixed(3)}`,
  );
  if (!(yUp < y0 - 0.15)) fail(`Maus hoch soll die Kamera senken (Himmel), war ${yUp.toFixed(3)} gegen ${y0.toFixed(3)}`);
  if (!(yDown > y0 + 0.15)) fail(`Maus runter soll die Kamera heben, war ${yDown.toFixed(3)} gegen ${y0.toFixed(3)}`);
  ok('Verfolger: Maus hoch = Himmel');
}

{
  const walker = new Walker();
  walker.respawn(0, 0, 0, g);
  const walk = new WalkCamera();
  const cam = new PerspectiveCamera(60, 1, 0.5, 6000);
  walk.reset(walker);
  const tick = () => walk.update(DT, walker, g, cam);
  settle(tick, 0.5);
  const y0 = cam.position.y;
  walk.look(0, -80);
  settle(tick, 0.6);
  const yUp = cam.position.y;
  console.log(`Zu Fuß Nick  y0=${y0.toFixed(3)}  Maus hoch=${yUp.toFixed(3)}`);
  if (!(yUp < y0 - 0.1)) fail(`WalkCamera Maus hoch soll senken, war ${yUp.toFixed(3)} gegen ${y0.toFixed(3)}`);
  ok('Zu Fuß: Maus hoch = Himmel');
}

{
  const v = new Vehicle();
  v.respawn(0, 0, 0, g);
  const chase = new ChaseCamera();
  const cam = new PerspectiveCamera(CHASE_CAMERA.fov, 1, 0.5, 6000);
  chase.reset(v);
  const tick = (cmd: { throttle?: number; brake?: number }) => {
    v.step(DT, input(cmd), g, null);
    chase.update(DT, v, g, cam);
  };
  // Auf Tempo, dann ausrollen bis die Last weg ist — sonst misst man
  // `distanceFast` (Tempo) statt den Gas-Arm (Last).
  settle(() => tick({ throttle: 1 }), 2);
  settle(() => tick({}), 0.5);
  const coast = dist(cam, v);
  settle(() => tick({ throttle: 1 }), 0.4);
  const accel = dist(cam, v);
  const extra = accel - coast;
  console.log(
    `Arm rollt ${coast.toFixed(3)} m  Gas 0,4 s ${accel.toFixed(3)} m  Δ=${extra.toFixed(3)}  accelLong=${v.telemetry.accelLong.toFixed(2)}`,
  );
  if (!(extra > 0.05)) fail(`Gas soll den Arm verlängern, Δ=${extra.toFixed(3)}`);
  if (extra > CHASE_CAMERA.accelArmMax + 0.12) {
    fail(`Gas-Arm zu weit: +${extra.toFixed(3)} m (Deckel ${CHASE_CAMERA.accelArmMax})`);
  }
  ok('Gas zieht die Kamera nach hinten');
}

{
  const v = new Vehicle();
  v.respawn(0, 0, 0, g);
  const chase = new ChaseCamera();
  const cam = new PerspectiveCamera(CHASE_CAMERA.fov, 1, 0.5, 6000);
  chase.reset(v);
  settle(() => {
    v.step(DT, input({ throttle: 1 }), g, null);
    chase.update(DT, v, g, cam);
  }, 3);
  // Gaswegnehmen abwarten, sonst misst man noch den throttleRate-Schwanz.
  settle(() => {
    v.step(DT, input({}), g, null);
    chase.update(DT, v, g, cam);
  }, 0.4);
  const coast = dist(cam, v);
  settle(() => {
    v.step(DT, input({ brake: 1 }), g, null);
    chase.update(DT, v, g, cam);
  }, 0.45);
  const braking = dist(cam, v);
  console.log(
    `Arm rollt ${coast.toFixed(3)} m  Bremse 0,45 s ${braking.toFixed(3)} m  accelLong=${v.telemetry.accelLong.toFixed(2)}`,
  );
  if (!(braking < coast - 0.08)) fail(`Bremse soll den Arm kürzen, ${braking.toFixed(3)} gegen ${coast.toFixed(3)}`);
  if (braking < 5.8) fail(`Bremse zu weit vorn: ${braking.toFixed(3)} m — erste Runde war 5,03 und unspielbar`);
  ok('Bremse holt die Kamera nach vorn');
}

{
  const v = new Vehicle();
  v.respawn(0, 0, 0, g);
  const chase = new ChaseCamera();
  const cam = new PerspectiveCamera(CHASE_CAMERA.fov, 1, 0.5, 6000);
  chase.reset(v);
  const tick = () => {
    v.step(DT, input({}), g, null);
    chase.update(DT, v, g, cam);
  };
  settle(tick, 0.5);
  const mid = dist(cam, v);
  chase.zoom(0.6);
  settle(tick, 0.5);
  const close = dist(cam, v);
  chase.zoom(1 / 0.6);
  chase.zoom(1.8);
  settle(tick, 0.5);
  const far = dist(cam, v);
  console.log(`Zoom  mitten ${mid.toFixed(3)}  näher ${close.toFixed(3)}  weiter ${far.toFixed(3)}`);
  if (!(close < mid * 0.75)) fail(`Rad näher soll den Arm kürzen, ${close.toFixed(3)} gegen ${mid.toFixed(3)}`);
  if (!(far > mid * 1.4)) fail(`Rad weiter soll den Arm strecken, ${far.toFixed(3)} gegen ${mid.toFixed(3)}`);
  ok('Mausrad zoomt den Boom');

  for (let i = 0; i < 12; i++) chase.zoom(0.5);
  if (chase.mode !== 'hood') fail(`Zoom unter Minimum soll in die Haube, war ${chase.mode}`);
  chase.zoom(1.2);
  if (chase.mode !== 'chase') fail(`Zoom aus der Haube soll in den Verfolger, war ${chase.mode}`);
  ok('Nächste Rastung unter Minimum = Haube');
}

console.log('Kamera-Prüfstand: alle Proben grün');
