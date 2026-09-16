/**
 * Kameraprüfstand — Nickachse und Last, ohne Renderer.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/camera.mts
 *
 * Findet die vertauschte Mausachse (Verfolger/zu Fuß) und prüft, dass Gas den
 * Arm verlängert und Bremse ihn kürzt. Feel selbst bleibt eine Hand an der Maus.
 */
import { Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three';

import { ChaseCamera } from '@/game/ChaseCamera';
import { WalkCamera } from '@/game/WalkCamera';
import { Vehicle } from '@/game/Vehicle';
import { Walker } from '@/game/Walker';
import { CAMERA } from '@/config/world.config';
import { cabinLayout, clusterFace, cockpitEye, helmHub, hoodCowl } from '@/config/cabin.config';
import { CHASE_CAMERA, COCKPIT_CAMERA } from '@/config/vehicle.config';
import { VEHICLES, VEHICLE_ORDER } from '@/config/vehicles.config';
import { createCarVisuals } from '@/game/carMesh';
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
  if (chase.mode !== 'cockpit') fail(`Zoom unter Minimum soll in den Sitz, war ${chase.mode}`);
  chase.zoom(1.2);
  if (chase.mode !== 'chase') fail(`Zoom aus dem Sitz soll in den Verfolger, war ${chase.mode}`);
  ok('Nächste Rastung unter Minimum = Sitz');
}

{
  const v = new Vehicle();
  v.respawn(0, 0, 0, g);
  const chase = new ChaseCamera();
  const cam = new PerspectiveCamera(CHASE_CAMERA.fov, 1, CAMERA.near, 6000);
  chase.reset(v);
  chase.toggleMode();
  if (chase.mode !== 'cockpit') fail(`C einmal = Sitz, war ${chase.mode}`);
  const tick = () => {
    v.step(DT, input({}), g, null);
    chase.update(DT, v, g, cam);
  };
  settle(tick, 1.2);
  const inv = v.quaternion.clone().invert();
  const eye = cockpitEye(v.spec);
  const eyeLocal = cam.position.clone().sub(v.position).applyQuaternion(inv);
  console.log(
    `Sitz lokal ${eyeLocal.x.toFixed(3)} ${eyeLocal.y.toFixed(3)} ${eyeLocal.z.toFixed(3)}  eye ${eye.y.toFixed(3)} ${eye.z.toFixed(3)}  near=${cam.near}`,
  );
  if (Math.abs(eyeLocal.y - eye.y) > 0.12) fail(`Auge Y ${eyeLocal.y.toFixed(3)} gegen ${eye.y.toFixed(3)}`);
  const roofLocal = v.spec.body.roofHeight - v.spec.chassis.cgHeight;
  if (eyeLocal.y > roofLocal - 0.05) fail(`Auge im Dach: ${eyeLocal.y.toFixed(3)} Dach ${roofLocal.toFixed(3)}`);
  if (Math.abs(cam.near - COCKPIT_CAMERA.near) > 1e-3) fail(`Sitz near ${cam.near}`);
  if (Math.abs(cam.fov - COCKPIT_CAMERA.fov) > 2) fail(`Sitz FOV ${cam.fov}, erwartet ~${COCKPIT_CAMERA.fov}`);
  ok('Sitz unter dem Dach, eigenes FOV und Near');

  const visuals = createCarVisuals(v.spec);
  const cabinMesh = new Mesh(visuals.cabin, new MeshBasicMaterial());
  const origin = new Vector3(eye.x, eye.y, eye.z);
  const down = new Raycaster(origin, new Vector3(0, -1, 0), 0, 1.4);
  const floorHits = down.intersectObject(cabinMesh);
  console.log(`Cabin-Bodenstrahl Treffer=${floorHits.length} dist=${floorHits[0]?.distance.toFixed(3) ?? '—'}`);
  if (floorHits.length === 0) fail('Strahl nach unten trifft keinen Kabinenboden');
  ok('Kabinenboden schließt den Durchblick');

  const hub = helmHub(v.spec);
  const toHub = new Vector3(hub.x - eye.x, hub.y - eye.y, hub.z - eye.z).normalize();
  const through = new Raycaster(origin, toHub, 0, 1.4);
  const dashHits = through.intersectObject(cabinMesh);
  console.log(`Strahl durchs Rad Treffer=${dashHits.length} dist=${dashHits[0]?.distance.toFixed(3) ?? '—'}`);
  if (dashHits.length === 0) fail('Durchs Lenkrad muss die Armatur kommen, nicht die Wiese');
  ok('Armatur sitzt hinter dem Kranz');
  cabinMesh.geometry.dispose();
  cabinMesh.material.dispose();
  visuals.body.dispose();
  visuals.glass.dispose();
  visuals.helm.dispose();

  const look = COCKPIT_CAMERA.lookPitch;
  const rim = 0.16;
  const rimTop = Math.atan2(hub.y + rim - eye.y, hub.z - eye.z) - look;
  const hubPitch = Math.atan2(hub.y - eye.y, hub.z - eye.z) - look;
  const halfFov = (COCKPIT_CAMERA.fov * Math.PI) / 180 / 2;
  const rimDeg = (rimTop * 180) / Math.PI;
  const hubDeg = (hubPitch * 180) / Math.PI;
  console.log(`Kranz oben ${rimDeg.toFixed(1)}°  Nabe ${hubDeg.toFixed(1)}°  halbes FOV=${((halfFov * 180) / Math.PI).toFixed(1)}°`);
  if (rimTop > -0.12) fail(`Kranz zu hoch (Tunnel): ${rimDeg.toFixed(1)}°`);
  if (hubPitch < -halfFov * 1.05) fail(`Nabe unter dem Bild: ${hubDeg.toFixed(1)}°`);
  ok('Lenkrad ist ein Bogen unten, kein Tunnel');

  const face = clusterFace(v.spec);
  const clusterPitch = Math.atan2(face.y - eye.y, face.z - eye.z) - look;
  const clusterDeg = (clusterPitch * 180) / Math.PI;
  console.log(`Cluster ${clusterDeg.toFixed(1)}°  zwischen Kranz ${rimDeg.toFixed(1)}° und Nabe ${hubDeg.toFixed(1)}°`);
  if (clusterPitch > rimTop + 0.02 || clusterPitch < hubPitch - 0.02) {
    fail(`Cluster liegt nicht im Lenkradloch (${clusterDeg.toFixed(1)}°)`);
  }
  ok('Tacho sitzt im Lenkradloch');

  chase.toggleMode();
  if (chase.mode !== 'chase') fail(`C zweimal = Verfolger, war ${chase.mode}`);
  settle(tick, 0.2);
  if (Math.abs(cam.near - CAMERA.near) > 1e-3) fail(`Near nach Verfolger ${cam.near}, erwartet ${CAMERA.near}`);
  ok('C schaltet nur Sitz an/aus');

  chase.mode = 'hood';
  chase.reset(v);
  settle(tick, 0.5);
  const cowl = hoodCowl(v.spec);
  const local = cam.position.clone().sub(v.position);
  local.applyQuaternion(inv);
  const layout = cabinLayout(v.spec);
  const beltLocal = layout.belt - v.spec.chassis.cgHeight;
  console.log(
    `Haube lokal ${local.x.toFixed(3)} ${local.y.toFixed(3)} ${local.z.toFixed(3)}  overBelt=${(local.y - beltLocal).toFixed(3)}`,
  );
  if (local.y - beltLocal < 0.35) {
    fail(`Haube zu nah am Blech: ${(local.y - beltLocal).toFixed(3)} m über Gürtel`);
  }
  ok('Haube (Mausrad) hoch genug, dass die Straße bleibt');
}

{
  const v = new Vehicle();
  v.respawn(0, 0, 0, g);
  const slope = {
    height: (_x: number, z: number) => z * 0.18,
    normal: (_x: number, _z: number, out: Vector3) => out.set(0, 1, -0.18).normalize(),
    surface: () => 'asphalt' as const,
  };
  // Echter Hang: height = 0,18·z ≈ 10°. Nach dem Einschwingen muss die Haube
  // der Quaternion folgen, nicht der Welt-Y.
  v.respawn(0, 0, 0, slope as never);
  const chase = new ChaseCamera();
  chase.mode = 'hood';
  const cam = new PerspectiveCamera(CHASE_CAMERA.fov, 1, CAMERA.near, 6000);
  chase.reset(v);
  for (let i = 0; i < 90; i++) {
    v.step(DT, input({}), slope as never, null);
    chase.update(DT, v, slope as never, cam);
  }
  const cowl = hoodCowl(v.spec);
  const local = cam.position.clone().sub(v.position);
  local.applyQuaternion(v.quaternion.clone().invert());
  console.log(
    `Hang-Haube lokal y=${local.y.toFixed(3)} z=${local.z.toFixed(3)}  cowl y=${cowl.y.toFixed(3)}  pitch=${(v.pitch * 180 / Math.PI).toFixed(1)}°`,
  );
  if (Math.abs(local.y - cowl.y) > 0.12) {
    fail(`Haube folgt der Quaternion nicht: lokal y=${local.y.toFixed(3)} cowl=${cowl.y.toFixed(3)}`);
  }
  ok('Haube parented: Hang verschiebt das Auge nicht durchs Blech');
}

{
  for (const id of VEHICLE_ORDER) {
    const spec = VEHICLES[id];
    const eye = cockpitEye(spec);
    const cowl = hoodCowl(spec);
    const layout = cabinLayout(spec);
    const roofLocal = spec.body.roofHeight - spec.chassis.cgHeight;
    if (eye.y > roofLocal - 0.05) fail(`${id}: Auge im Dach (${eye.y.toFixed(3)} / ${roofLocal.toFixed(3)})`);
    const overBelt = cowl.y - (layout.belt - spec.chassis.cgHeight);
    if (!layout.open && overBelt < 0.35) {
      fail(`${id}: Haube zu nah am Blech (${overBelt.toFixed(3)} m über Gürtel)`);
    }
    const visuals = createCarVisuals(spec);
    if (visuals.cabin.getAttribute('position').count < 24) fail(`${id}: Cabin leer`);
    visuals.body.dispose();
    visuals.glass.dispose();
    visuals.cabin.dispose();
    visuals.helm.dispose();
  }
  ok('Zehn Autos: Auge unter Dach, Haube hoch, Cabin da');
}

console.log('Kamera-Prüfstand: alle Proben grün');
