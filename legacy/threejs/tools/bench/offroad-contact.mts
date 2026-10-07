import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { Vehicle, type Ground } from '@/game/Vehicle';
import { VEHICLES, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';
import { resolveHullTerrain } from '@/game/hullTerrain';
import { resolveTerrainFollow } from '@/game/supportPlane';

const full = { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false };
function slope(degrees: number): Ground {
  const grade = Math.tan(degrees * Math.PI / 180);
  return {
    height: (_x, z) => Math.max(0, z) * grade,
    normal: (_x, z, out) => out.set(0, 1, z > 0 ? -grade : 0).normalize(),
    surface: () => 'gelaende',
  };
}
function drive(id: VehicleId, degrees: number, reverse = false, hz = 60, boost = false, seconds = 8) {
  const ground = slope(degrees);
  const vehicle = new Vehicle(VEHICLES[id]);
  vehicle.respawn(0, -12, reverse ? Math.PI : 0, ground);
  vehicle.velocity.z = reverse ? 5 : 12;
  const input = reverse ? { ...full, throttle: 0, brake: 1 } : { ...full, boost };
  let maxLoss = 0, maxHeight = vehicle.position.y, maxHull = 0;
  for (let i = 0; i < hz * seconds; i++) {
    const before = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
    if (boost) vehicle.addBoost(1);
    vehicle.step(1 / hz, input, ground, null);
    maxLoss = Math.max(maxLoss, (before - Math.hypot(vehicle.velocity.x, vehicle.velocity.z)) * 3.6);
    maxHeight = Math.max(maxHeight, vehicle.position.y);
    maxHull = Math.max(maxHull, vehicle.telemetry.hullDepth);
    assert.ok(vehicle.position.toArray().every(Number.isFinite), `${id}: nonfinite position`);
  }
  return { z: vehicle.position.z, kmh: vehicle.velocity.z * 3.6, maxLoss, maxHeight, maxHull };
}

test('a shallow underside contact cannot convert landing velocity into an abrupt planar brake', () => {
  const g = slope(15);
  const state = { x: 0, y: .26, z: 1, vx: 0, vy: -5, vz: 15 };
  resolveHullTerrain(state, new Quaternion(), new Float64Array([0, 0, 0]), g,
    .35, .28, 1 / 60, new Vector3(), new Vector3());
  assert.ok(state.vz > 14.95, `8 mm contact removed ${(15 - state.vz) * 3.6} km/h`);
});

test('the emergency ground catch also preserves horizontal speed on a driveable landing', () => {
  const normal = new Vector3(-.13, .87, -.48).normalize();
  const state = { x: 0, y: .15, z: 0, vx: -.36, vy: -2.86, vz: 21.39 };
  resolveTerrainFollow(state, 0, normal.x, normal.y, normal.z, .18, .35, 1 / 60);
  assert.ok(state.vz > 21.34, `driveable landing removed ${(21.39 - state.vz) * 3.6} km/h`);
  assert.equal(state.vy, 0, 'catch falling motion without launching the car');
});

test('ordinary 15/20 degree entries do not catch the nose or tail across the fleet', () => {
  for (const id of VEHICLE_ORDER) for (const reverse of [false, true]) {
    const result = drive(id, reverse ? 15 : 20, reverse);
    assert.ok(result.maxLoss < 1.5, `${id} reverse=${reverse}: ${JSON.stringify(result)}`);
    assert.ok(result.z > 2, `${id} reverse=${reverse}: did not escape the transition`);
  }
});

test('Cairn maintains useful speed on a 20 degree grassy hill without nitro', () => {
  const result = drive('offroad', 20, false, 60, false, 15);
  assert.ok(result.kmh > 25, JSON.stringify(result));
});

test('continuous boost cannot ratchet the fleet up a cliff', () => {
  for (const id of VEHICLE_ORDER) for (const degrees of [40, 50, 65]) {
    const result = drive(id, degrees, false, 60, true, 12);
    assert.ok(result.z < 1, `${id} ${degrees}: ${JSON.stringify(result)}`);
    assert.ok(result.maxHeight < 2, `${id} ${degrees}: launched from the wall`);
  }
});

test('offroad contact has consistent progress at 60 and 120 Hz', () => {
  for (const id of ['touge', 'offroad'] as const) {
    const a = drive(id, 20, false, 60), b = drive(id, 20, false, 120);
    assert.ok(Math.abs(a.z - b.z) < 3, `${id}: 60Hz=${a.z}, 120Hz=${b.z}`);
  }
});

test('both wheel tracks and the chassis lean with a cross slope, in either heading', () => {
  for (const degrees of [15, 20, 30, 35]) {
  const grade = Math.tan(degrees * Math.PI / 180);
  const ground: Ground = { height: (x) => x * grade,
    normal: (_x, _z, out) => out.set(-grade, 1, 0).normalize(), surface: () => 'gelaende' };
  for (const id of VEHICLE_ORDER) for (const heading of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    const vehicle = new Vehicle(VEHICLES[id]);
    vehicle.respawn(0, 0, heading, ground);
    for (const wheel of vehicle.wheelPositions) {
      const clearance = wheel.y - VEHICLES[id].chassis.wheelRadius - ground.height(wheel.x, wheel.z);
      assert.ok(Math.abs(clearance) < .005, `${id} slope=${degrees} heading=${heading}: wheel error ${clearance} m`);
    }
    const up = new Vector3(0, 1, 0).applyQuaternion(vehicle.quaternion);
    assert.ok(up.dot(ground.normal(0, 0, new Vector3())) > .999,
      `${id}: chassis leans against the hillside`);
  }
  }
});

test('a deep floor contact cannot hide a simultaneous shallower wall contact', () => {
  const ground: Ground = { height: (_x, z) => z > .5 ? .1 : .3,
    normal: (_x, z, out) => z > .5 ? out.set(0, .5, -Math.sqrt(.75)) : out.set(0, 1, 0),
    surface: () => 'gelaende' };
  const state = { x: 0, y: 0, z: 0, vx: 3, vy: 0, vz: 10 };
  resolveHullTerrain(state, new Quaternion(), new Float64Array([0, 0, 0, 0, 0, 1]),
    ground, .35, .3, 1 / 60, new Vector3(), new Vector3());
  assert.ok(state.vz < .01, `floor masked wall; ${state.vz} m/s into the wall`);
  assert.ok(state.vx > 2.9, 'grazing motion along the wall should remain');
});

test('all cars can reverse uphill from rest on an ordinary 15 degree slope', () => {
  const ground = slope(15);
  for (const id of VEHICLE_ORDER) {
    const vehicle = new Vehicle(VEHICLES[id]);
    vehicle.respawn(0, 10, Math.PI, ground);
    for (let i = 0; i < 360; i++) vehicle.step(1 / 60,
      { ...full, throttle: 0, brake: 1 }, ground, null);
    assert.ok(vehicle.position.z > 13, `${id} cannot reverse out: ${vehicle.position.z}`);
  }
});

test('the rendered underside is resolved at the current pose on a climb', () => {
  for (const id of ['offroad', 'meridian', 'needle'] as const) {
    const ground = slope(35), vehicle = new Vehicle(VEHICLES[id]);
    vehicle.respawn(0, -12, 0, ground);
    const point = new Vector3();
    let depth = 0;
    for (let step = 0; step < 600; step++) {
      vehicle.step(1 / 60, full, ground, null);
      for (let i = 0; i < vehicle.spec.derived.hullSamples.length; i += 3) {
        point.fromArray(vehicle.spec.derived.hullSamples, i).applyQuaternion(vehicle.quaternion).add(vehicle.position);
        depth = Math.max(depth, ground.height(point.x, point.z) - point.y);
      }
    }
    assert.ok(depth < .1, `${id}: rendered underside penetrates ${depth} m`);
  }
});

test('an unsupported chassis sliding down rolling hills cannot remain inside the slope', () => {
  // The deterministic world bench exposed Pip's body sinking into a 40-degree
  // descent for 31 frames because the wheels no longer supported the chassis.
  const waves = [[.0084, .0061, 26, .7], [.0173, -.0119, 13, 1.9],
    [.0301, .0227, 7.5, 2.4], [.0611, -.0509, 3.1, .6],
    [.1103, .0894, 1.4, 1.1], [.2203, -.1701, .55, 2.8]];
  const height = (x: number, z: number) => waves.reduce(
    (h, [fx, fz, amplitude, phase]) => h + amplitude! * Math.sin(x * fx! + z * fz! + phase!), 0);
  const ground: Ground = { height, surface: () => 'gelaende',
    normal: (x, z, out) => out.set(-(height(x + .5, z) - height(x - .5, z)), 1,
      -(height(x, z + .5) - height(x, z - .5))).normalize() };
  for (const id of VEHICLE_ORDER) {
    let seed = 0x9e3779b9;
    const random = () => {
      seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17;
      seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff;
    };
    const car = new Vehicle(VEHICLES[id]), point = new Vector3();
    car.respawn(0, 0, 0, ground);
    let steer = 0, throttle = 1, consecutive = 0;
    for (let step = 0; step < 5400; step++) {
      if (step % 90 === 0) {
        steer = random() * 2 - 1;
        throttle = random() < .8 ? .5 + random() * .5 : 0;
      }
      car.step(1 / 60, { ...full, steer, throttle }, ground, null);
      let depth = 0;
      for (let i = 0; i < car.spec.derived.hullSamples.length; i += 3) {
        point.fromArray(car.spec.derived.hullSamples, i).applyQuaternion(car.quaternion).add(car.position);
        depth = Math.max(depth, height(point.x, point.z) - point.y);
      }
      consecutive = depth > .1 ? consecutive + 1 : 0;
      assert.ok(consecutive <= 6, `${id}: body inside terrain for ${consecutive} frames at step ${step}`);
    }
  }
});

// Reproducible comparison: enter a 20-degree grassy hill from 12 m before its
// foot at 43.2 km/h, six seconds of full throttle, stock tune, no nitro.
if (process.argv.includes('--report')) {
  console.table(['touge', 'offroad', 'gt'].map(id => ({
    id, ...drive(id as VehicleId, 20, false, 60, false, 6),
  })));
}
