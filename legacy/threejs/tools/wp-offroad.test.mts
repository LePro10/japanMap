import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ArcadeDynamics } from '../src/game/arcadeDynamics.ts';
import { Vehicle } from '../src/game/Vehicle.ts';
import {
  ARCADE, ARCADE_CRAWL, ARCADE_SURFACE, DIRT_GRIP, GRIP_BLEND,
} from '../src/config/arcade.config.ts';
import {
  applySetup, crawlShare, driveRetain, rideLift, setupsFor, STOCK_TUNE, tunedArcade,
} from '../src/config/tuning.config.ts';
import { VEHICLES, VEHICLE_ORDER } from '../src/config/vehicles.config.ts';
import { RAMPS } from '../src/config/stunt.config.ts';
import { LocalSurfaces, SurfaceStack } from '../src/world/settlements/LocalSurfaces.ts';
import { SHALLOW_RUN, TERRACE_TRACK, shallowRunDepth } from '../src/world/settlements/settlementLayout.ts';
import { flatGround } from './bench/flat.mjs';

const dt = 1 / 60;
const cmd = (p: Record<string, unknown> = {}) => ({
  throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, ...p,
});
const env = (p: Record<string, unknown> = {}) => ({
  vLong: 0, vLat: 0, surface: 'asphalt' as const, waterDepth: 0, airborne: false, support: 1, ...p,
});

for (const id of VEHICLE_ORDER) {
  assert.equal(DIRT_GRIP[id], VEHICLES[id].dirt, `${id} dirt table matches identity`);
  assert.ok(VEHICLES[id].dirt >= 0.65 && VEHICLES[id].dirt <= 0.85, `${id} dirt in 0.65–0.85`);
}
assert.equal(VEHICLES.offroad.dirt, 0.85);
assert.equal(VEHICLES.torrent.dirt, 0.85);
assert.equal(VEHICLES.gt.dirt, 0.65);
assert.equal(VEHICLES.truck.ford, 0.3);
assert.equal(VEHICLES.offroad.ford, 0.45);
assert.equal(VEHICLES.torrent.ford, 0.3);
assert.equal(VEHICLES.gt.ford, 0.12);
assert.equal(VEHICLES.needle.ford, 0.1);
assert.equal(VEHICLES.touge.ford, 0.2);
assert.equal(VEHICLES.needle.clearance, 0.1);
assert.equal(ARCADE_SURFACE.gelaende, 0.65);
assert.equal(ARCADE_SURFACE.wasser, 0.75);

assert.deepEqual(setupsFor('touge'), ['road', 'drift', 'dirt']);
assert.deepEqual(setupsFor('needle'), ['road', 'drift', 'safe']);
assert.equal(rideLift('dirt'), 0.02);
assert.equal(rideLift('safe'), 0);
assert.equal(crawlShare('needle', 'safe'), ARCADE_CRAWL.safeShare);
assert.equal(crawlShare('gt', 'road'), ARCADE_CRAWL.trackShare);
assert.equal(crawlShare('touge', 'road'), ARCADE_CRAWL.share);
assert.equal(driveRetain('offroad'), 0.85);
assert.equal(driveRetain('touge'), 0.65);

const stock = ARCADE.touge;
const drifted = applySetup(stock, 'drift');
assert.ok(Math.abs(drifted.catchAssist / stock.catchAssist - 0.85) < 1e-9);
assert.ok(Math.abs(drifted.steerAngle / stock.steerAngle - 1.1) < 1e-9);
assert.equal(drifted.latG, stock.latG, 'Drift setup is not a grip gift');
const dirted = applySetup(stock, 'dirt');
assert.ok(Math.abs(dirted.steerFalloff / stock.steerFalloff - 0.95) < 1e-9);
assert.equal(dirted.latG, stock.latG);
assert.deepEqual(applySetup(stock, 'safe'), stock);
assert.deepEqual(tunedArcade('touge', STOCK_TUNE), ARCADE.touge);

function settleGrip(dyn: ArcadeDynamics, surface: 'asphalt' | 'kies' | 'gelaende' | 'wasser', dirt: number) {
  const d = dyn;
  d.reset();
  d.setSpec(ARCADE.touge, dirt);
  const e = env({ surface, vLong: 8 });
  d.step(dt, cmd(), e);
  for (let i = 0; i < 180; i++) d.step(dt, cmd(), e);
  return d.grip;
}
{
  const dyn = new ArcadeDynamics(ARCADE.touge, 0.7);
  assert.ok(Math.abs(settleGrip(dyn, 'gelaende', 0.7) - 0.65) < 0.002, 'grass is global 0.65');
  assert.ok(Math.abs(settleGrip(dyn, 'kies', 0.85) - 0.85) < 0.002, 'Cairn dirt 0.85');
  assert.ok(Math.abs(settleGrip(dyn, 'kies', 0.65) - 0.65) < 0.002, 'Ember dirt 0.65');
  assert.ok(Math.abs(settleGrip(dyn, 'wasser', 0.7) - 0.75) < 0.002, 'shallow water 0.75');
  assert.ok(Math.abs(settleGrip(dyn, 'asphalt', 0.7) - 1) < 0.002, 'asphalt unchanged');
}

{
  const dyn = new ArcadeDynamics(ARCADE.touge, 0.7);
  dyn.reset();
  const asphalt = env({ surface: 'asphalt', vLong: 10 });
  dyn.step(dt, cmd(), asphalt);
  assert.equal(dyn.grip, 1);
  const grass = env({ surface: 'gelaende', vLong: 10 });
  for (let i = 0; i < Math.round(0.05 / dt); i++) dyn.step(dt, cmd(), grass);
  assert.ok(dyn.grip > 0.85, `grip still blending after 0.05 s, got ${dyn.grip}`);
  for (let i = 0; i < Math.round(1 / dt); i++) dyn.step(dt, cmd(), grass);
  assert.ok(Math.abs(dyn.grip - 0.65) < 0.01, `settled toward grass after 1 s, got ${dyn.grip}`);
  assert.equal(GRIP_BLEND, 0.25);
}

{
  const heavy = { ...ARCADE.touge, launchForce: 80_000 };
  const road = new ArcadeDynamics(heavy, 0.7);
  road.setMass(1000);
  road.setDriveRetain(0.65);
  road.setCrawl(0);
  const util = new ArcadeDynamics(heavy, 0.85);
  util.setMass(1000);
  util.setDriveRetain(0.85);
  util.setCrawl(0);
  const grass = env({ surface: 'gelaende', vLong: 0.5 });
  let roadA = 0, utilA = 0;
  for (let i = 0; i < 30; i++) {
    roadA = road.step(dt, cmd({ throttle: 1 }), grass).accelLong;
    utilA = util.step(dt, cmd({ throttle: 1 }), grass).accelLong;
  }
  const g = 9.81 * 1.35;
  assert.ok(roadA >= g * 0.65 - 1, `road retain ≥65% on grass, got ${roadA.toFixed(2)}`);
  assert.ok(utilA >= g * 0.85 - 1, `utility retain ≥85% on grass, got ${utilA.toFixed(2)}`);
  assert.ok(utilA > roadA + 1, 'utility keeps more drive than a road car on grass');
}

{
  const dyn = new ArcadeDynamics(ARCADE.needle, 0.65);
  dyn.setMass(VEHICLES.needle.chassis.mass);
  dyn.setCrawl(ARCADE_CRAWL.safeShare);
  const grass = env({ surface: 'gelaende', vLong: 1 });
  let grassA = 0;
  for (let i = 0; i < 20; i++) {
    grassA = dyn.step(dt, cmd({ throttle: 1 }), grass).accelLong;
  }
  dyn.reset();
  dyn.setCrawl(0);
  let noCrawl = 0;
  for (let i = 0; i < 20; i++) {
    noCrawl = dyn.step(dt, cmd({ throttle: 1 }), grass).accelLong;
  }
  assert.ok(grassA > noCrawl + 0.5, `Needle Safe Return crawl pulls on grass (${grassA.toFixed(2)} vs ${noCrawl.toFixed(2)})`);
  dyn.reset();
  dyn.setCrawl(ARCADE_CRAWL.safeShare);
  const wall = env({ surface: 'gelaende', vLong: 1, support: 0 });
  let wallA = 0;
  for (let i = 0; i < 20; i++) wallA = dyn.step(dt, cmd({ throttle: 1, boost: true }), wall).accelLong;
  assert.ok(Math.abs(wallA) < 0.5, `crawl+nitro do not glue a car to a cliff, got ${wallA.toFixed(2)}`);
}

{
  const dyn = new ArcadeDynamics(ARCADE.touge, 0.7);
  dyn.setMass(1180);
  const wall = env({ vLong: 8, support: 0, surface: 'gelaende' });
  const withBoost = dyn.step(dt, cmd({ boost: true, throttle: 1 }), wall).accelLong;
  dyn.reset();
  const without = dyn.step(dt, cmd({ throttle: 1 }), wall).accelLong;
  assert.ok(Math.abs(withBoost - without) < 0.05, 'nitro adds nothing on a wall');
}

{
  const g = flatGround('asphalt');
  const car = new Vehicle(VEHICLES.touge);
  car.setTune(STOCK_TUNE);
  car.respawn(0, 0, 0, g);
  let t = 0;
  while (car.telemetry.speed < 100 / 3.6 && t < 30) {
    car.step(dt, cmd({ throttle: 1 }), g, null);
    t += dt;
  }
  assert.ok(Math.abs(t - 7.2) < 0.12, `Kite 0–100 still ${t.toFixed(2)} s, target 7.2`);
  const road = new Vehicle(VEHICLES.touge);
  road.respawn(0, 0, 0, g);
  const lifted = new Vehicle(VEHICLES.touge);
  lifted.setSetup('dirt');
  lifted.respawn(0, 0, 0, g);
  assert.equal(lifted.setup, 'dirt');
  assert.ok(lifted.position.y >= road.position.y + 0.015, 'Dirt setup raises ride height 20 mm');
}

assert.ok(Math.abs(shallowRunDepth(SHALLOW_RUN.x, SHALLOW_RUN.z) - 0.12) < 1e-9);
assert.equal(shallowRunDepth(SHALLOW_RUN.x + 40, SHALLOW_RUN.z), 0);
assert.equal(TERRACE_TRACK.length, 6);
assert.deepEqual(TERRACE_TRACK[0], [-1140, 128]);
assert.deepEqual(TERRACE_TRACK[5], [-190, 90]);
assert.deepEqual(TERRACE_TRACK[2], [-900, 330]);

{
  const roller = RAMPS.find((r) => r.id === 'terrace-roller');
  assert.ok(roller, 'Terrace Roller is in RAMPS');
  assert.equal(roller!.width, 9);
  assert.equal(roller!.height, 1.4);
  assert.equal(roller!.length, 16);
  assert.equal(roller!.tail, 22);
  const peak = Math.atan(1.5 * roller!.height / roller!.length) * 180 / Math.PI;
  assert.ok(peak < 16, `roller peak ${peak.toFixed(1)}° under hull limit`);
}

{
  const stack = new SurfaceStack();
  const a = new LocalSurfaces();
  const b = new LocalSurfaces();
  a.quad([0, 2, 0], [10, 2, 0], [10, 2, 8], [0, 2, 8]);
  b.quad([2, 5, 2], [4, 5, 2], [4, 5, 6], [2, 5, 6]);
  stack.layers.push(a, b);
  assert.equal(stack.height(3, 4), 5, 'stack keeps the higher floor');
  assert.equal(stack.height(8, 4), 2, 'lower floor remains beside it');
  const n = new Vector3();
  assert.equal(stack.normal(3, 4, n), true);
}

console.log('Offroad surfaces, setups, crawl, ford table and Terrace Track passed');
