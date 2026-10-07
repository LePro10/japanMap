import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { Vehicle, type Ground } from '@/game/Vehicle';
import { VEHICLES, VEHICLE_ORDER } from '@/config/vehicles.config';
import { ArcadeDynamics, type PlanarEnv } from '@/game/arcadeDynamics';
import { ARCADE, GRIP_BLEND } from '@/config/arcade.config';
import { crawlShare, driveRetain } from '@/config/tuning.config';

const dt = 1 / 60;
const throttle = { throttle: 1, brake: 0, steer: 0, handbrake: false };
const idle = { ...throttle, throttle: 0 };
function slope(degrees: number, surface: 'asphalt' | 'gelaende' = 'asphalt'): Ground {
  const gradient = Math.tan(degrees * Math.PI / 180);
  return {
    height: (_x, z) => z * gradient,
    normal: (_x, _z, out) => out.set(0, 1, -gradient).normalize(),
    surface: () => surface,
  };
}

test('body acceleration attitude uses g and preserves ground clearance across the fleet', () => {
  for (const id of VEHICLE_ORDER) {
    const spec = VEHICLES[id];
    const vehicle = new Vehicle(spec);
    const ground = slope(0);
    vehicle.respawn(0, 0, 0, ground);
    for (let i = 0; i < 60; i++) vehicle.step(dt, throttle, ground, null);
    assert.ok(Math.abs(vehicle.pitch) < .08, `${id}: acceleration pitch ${vehicle.pitch}`);
    const point = new Vector3();
    let clearance = Infinity;
    for (let i = 0; i < spec.derived.hullSamples.length; i += 3) {
      point.fromArray(spec.derived.hullSamples, i).applyQuaternion(vehicle.quaternion).add(vehicle.position);
      clearance = Math.min(clearance, point.y);
    }
    assert.ok(clearance > .04, `${id}: underside clearance ${clearance}`);
  }
});

test('steady travel along a smooth hill does not compress the suspension', () => {
  for (const id of VEHICLE_ORDER) {
    const vehicle = new Vehicle(VEHICLES[id]);
    const ground = slope(15);
    vehicle.respawn(0, 0, 0, ground);
    const initialGap = vehicle.position.y - ground.height(0, 0);
    // Control only horizontal pace; the production suspension owns vertical motion.
    for (let i = 0; i < 240; i++) {
      vehicle.velocity.z = 8;
      vehicle.step(dt, idle, ground, null);
    }
    const gap = vehicle.position.y - ground.height(vehicle.position.x, vehicle.position.z);
    assert.ok(Math.abs(gap - initialGap) < .08, `${id}: ride height changed ${gap - initialGap} m`);
  }
});

const env: PlanarEnv = { vLong: 15, vLat: 1, surface: 'asphalt', waterDepth: 0, airborne: false, support: 1 };
function dynamics(id: typeof VEHICLE_ORDER[number] = 'touge') {
  const model = new ArcadeDynamics(ARCADE[id], VEHICLES[id].dirt);
  model.setMass(VEHICLES[id].chassis.mass);
  model.setWheelbase(VEHICLES[id].chassis.wheelbase);
  model.setCrawl(crawlShare(id, 'road'));
  model.setDriveRetain(driveRetain(id));
  return model;
}
const command = { ...throttle, boost: false };

test('loose-surface grip follows the current quarter-second time constant', () => {
  const model = dynamics();
  const before = model.step(dt, command, env);
  const dirt = { ...env, surface: 'gelaende' as const };
  const first = model.step(dt, command, dirt);
  const settledModel = dynamics();
  const settled = settledModel.step(dt, command, dirt);
  assert.ok(Math.abs(first.accelLat - before.accelLat) < Math.abs(settled.accelLat - before.accelLat) * .3);
  for (let i = 0; i < 14; i++) model.step(dt, command, dirt);
  const expected = .65 + .35 * Math.exp(-(15 * dt) / GRIP_BLEND);
  assert.ok(Math.abs(model.grip - expected) < 1e-10);
});

test('held handbrake slows every car even with throttle and boost held', () => {
  for (const id of VEHICLE_ORDER) {
    const model = dynamics(id);
    for (let i = 0; i < 30; i++) model.step(dt, command, env);
    const braking = model.step(dt, { ...command, handbrake: true, boost: true }, env);
    assert.ok(braking.accelLong < -1, `${id}: handbrake acceleration ${braking.accelLong}`);
    assert.equal(braking.boosting, false);
  }
});

test('braking and unsupported wheels suppress nitro drive', () => {
  const model = dynamics();
  for (let i = 0; i < 30; i++) model.step(dt, command, env);
  assert.equal(model.step(dt, { ...command, brake: 1, boost: true }, env).boosting, false);
  const unsupported = model.step(dt, { ...command, boost: true }, { ...env, vLong: 0, vLat: 0, support: 0 });
  assert.equal(unsupported.boosting, false);
  assert.equal(unsupported.accelLong, 0);
});

// Current crawl, shallow-water traction and per-car setup requirements live in
// wp-offroad.test.mts. The stale branch's speed targets predate that tuning.

test('loose dirt retains the authored lateral grip range', () => {
  for (const id of VEHICLE_ORDER) {
    const dry = dynamics(id).step(dt, command, { ...env, vLat: 10 });
    const dirt = dynamics(id).step(dt, command, { ...env, vLat: 10, surface: 'kies' });
    const ratio = dirt.accelLat / dry.accelLat;
    assert.ok(ratio >= .649 && ratio <= .851, `${id}: dirt grip factor ${ratio}`);
  }
});
