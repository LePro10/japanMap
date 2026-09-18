import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { CollisionWorld, HIT_STATIC } from '../src/game/CollisionWorld.ts';
import { WalkCamera } from '../src/game/WalkCamera.ts';
import { Walker } from '../src/game/Walker.ts';
import { createInteriorLayout } from '../src/world/city/CityInteriorLayout.ts';

const obstacles = new CollisionWorld();
const wall = obstacles.addBox(-5, 5, -2.01, -2, 0, 4);
assert.ok(Math.abs(obstacles.cameraFraction(0, 1, 0, 0, 1, -10, .2) - .18) < 1e-8,
  'A thin wall between clear endpoints must shorten the whole boom');
assert.equal(obstacles.cameraFraction(0, 5, 0, 0, 5, -10, .2), 1, 'Clearance above walls remains open');
obstacles.disableHit(wall, HIT_STATIC);
assert.equal(obstacles.cameraFraction(0, 1, 0, 0, 1, -10, .2), 1, 'Destroyed props no longer block the camera');
obstacles.addBox(-5, 5, -5, 5, 3, 3.01);
assert.ok(Math.abs(obstacles.cameraFraction(0, 1, 0, 0, 5, 0, .2) - .45) < 1e-8, 'Vertical ceiling casts');
obstacles.clear();
obstacles.addWall(-2, -4, 2, 0, .1, 0, 4);
assert.ok(obstacles.cameraFraction(0, 1, 0, 0, 1, -5, .2) < .4, 'Rotated walls retain their orientation');
assert.equal(obstacles.cameraFraction(1.8, 1, -3.8, 4, 1, -3.8, .2), 1, 'Do not collide with the empty corner of a rotated wall AABB');
obstacles.clear();
obstacles.addCylinder(0, -2, .4, 0, 4);
assert.ok(obstacles.cameraFraction(0, 1, 0, 0, 1, -5, .2) < .3, 'Static round props');
obstacles.clear();
obstacles.addDynamicCylinder(0, -2, .4, 0, 4, 20);
assert.ok(obstacles.cameraFraction(0, 1, 0, 0, 1, -5, .2) < .3, 'Nearby tree trunks');

const layout = createInteriorLayout();
const world = new CollisionWorld();
for (const c of layout.colliders) world.addBox(c.minX, c.maxX, c.minZ, c.maxZ, c.bottom, c.top);
const ground = { height: () => layout.floorY, normal: (_x: number, _z: number, n: Vector3) => n.set(0, 1, 0), surface: () => 'asphalt' as const };
const flat = { height: () => 0, normal: (_x: number, _z: number, n: Vector3) => n.set(0, 1, 0), surface: () => 'asphalt' as const };
for (const [x, z] of [[644, 141], [644, 138.5], [508.5, 35], [514, 36.8]]) {
  const walker = new Walker();
  walker.position.set(x!, layout.floorY, z!);
  const orbit = new WalkCamera();
  const camera = new PerspectiveCamera(58, 16 / 9, .1, 2000);
  orbit.reset(walker);
  for (let frame = 0; frame < 160; frame++) {
    if (frame === 20) orbit.zoom(10);
    orbit.look(25, frame < 80 ? 10 : -10);
    orbit.update(1 / 60, walker, ground, camera, world);
    assert.ok(camera.position.y < layout.floorY + (x! > 600 ? 5.2 : 5.4), 'Zoom and pitch cannot escape through the ceiling');
    assert.equal(world.query(camera.position.x, camera.position.y, camera.position.z, .12).depth, 0,
      `Camera entered furniture/wall at ${x},${z} frame ${frame}`);
    assert.ok(world.cameraFraction(walker.position.x, walker.position.y + 1.28, walker.position.z,
      camera.position.x, camera.position.y, camera.position.z, .12) > .999,
      'Smoothing must not leave the camera on the far side of an obstacle');
  }
}
const walker = new Walker();
walker.position.set(644, layout.floorY, 141);
const orbit = new WalkCamera(), camera = new PerspectiveCamera(58, 16 / 9, .1, 2000);
orbit.reset(walker);
orbit.update(1 / 60, walker, ground, camera, world);
assert.ok(camera.position.z > 137.4, 'Default mart camera remains in front of the fridge');
const blockedLength = camera.position.distanceTo(walker.position);
world.clear();
for (let i = 0; i < 120; i++) orbit.update(1 / 60, walker, ground, camera, world);
assert.ok(camera.position.distanceTo(walker.position) > blockedLength + .25, 'Boom smoothly recovers its length after leaving an obstacle');

// Look-at inside the near-plane shell of a wall in front of the walker (the
// production CAMERA.near = 0.5 m case). Boom points away from the wall; the
// camera must keep looking at the walker, not snap onto the look-at and flip
// to world +Z.
{
  const shell = new CollisionWorld();
  shell.addBox(-8, 8, -8, -0.4, 0, 6);
  assert.equal(shell.cameraFraction(0, 1.28, 0, 0, 1.55, 4.1, 0.76), 1,
    'Look-at in a wall’s clearance shell must not collapse a boom that points away');
  assert.ok(shell.cameraFraction(0, 1.28, 0, 0, 1.55, -4.1, 0.76) < 0.2,
    'A boom that actually goes through the wall still shortens');
  const beside = new Walker();
  beside.position.set(0, 0, 0);
  beside.yaw = 0;
  const look = new WalkCamera();
  const cam = new PerspectiveCamera(58, 16 / 9, 0.5, 6000);
  look.reset(beside);
  for (let i = 0; i < 45; i++) look.update(1 / 60, beside, flat, cam, shell);
  const forward = new Vector3();
  cam.getWorldDirection(forward);
  assert.ok(cam.position.distanceTo(beside.position) > 1.2,
    `Boom next to a building must not collapse, was ${cam.position.distanceTo(beside.position).toFixed(3)} m`);
  assert.ok(forward.z > 0.55,
    `View next to a building must stay on the walker (heading 0 looks +Z), was ${forward.toArray().map((n) => n.toFixed(3)).join(',')}`);
}

// Parked-car cylinders: look-at sits inside the expanded volume when standing
// beside or on the body. Same collapse, same +Z flip.
{
  const car = new CollisionWorld();
  // A single axle/hood volume the walker is standing in — extra axles along
  // the boom are a different hit and must not hide this skip.
  car.addDynamicCylinder(0, 0, 0.84, -0.7, 1.4, 0xffffff00);
  const onCar = new Walker();
  onCar.position.set(0, 0, 0);
  onCar.yaw = 0;
  assert.equal(car.cameraFraction(0, 1.28, 0, 0, 1.55, 4.1, 0.76), 1,
    'Look-at inside a parked-car collider must not collapse the boom');
  const look = new WalkCamera();
  const cam = new PerspectiveCamera(58, 16 / 9, 0.5, 6000);
  look.reset(onCar);
  for (let i = 0; i < 45; i++) look.update(1 / 60, onCar, flat, cam, car);
  const forward = new Vector3();
  cam.getWorldDirection(forward);
  assert.ok(cam.position.distanceTo(onCar.position) > 1.2,
    `Boom on the parked car must not collapse, was ${cam.position.distanceTo(onCar.position).toFixed(3)} m`);
  assert.ok(forward.z > 0.55,
    `View on the parked car must stay on the walker, was ${forward.toArray().map((n) => n.toFixed(3)).join(',')}`);
}

console.log('Walk camera: thin/rotated walls, ceilings, props, recovery, 640 interior orbit/zoom frames, wall-shell and parked-car look-at clear.');
