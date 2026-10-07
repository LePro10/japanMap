import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Uses the loaded game's complete RoadGround, local surfaces, water and solid
// collision world. Deliberate offroad lines are diagnostics, not AI race lines.
const url = process.argv[2] ?? 'http://127.0.0.1:5180/japanMap/';
const output = process.argv[3] ?? '.cache/physics-runtime.json';
// Baselines may fail today's acceptance limits; record them without hiding the
// measurements. Normal runs enforce progress and contact limits for all cars.
const recordOnly = process.argv.includes('--record-only');
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.japanMap?.quality === 'function', null, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('low'));
  await page.locator('.start__button').click();
  const results = await page.evaluate(async () => {
    const j = window.japanMap, engine = j.engine;
    engine.stop();
    j.drive(true);
    const drive = engine.systems.find(system => system.name === 'DriveSystem');
    const { VEHICLE_ORDER } = await import('/japanMap/src/config/vehicles.config.ts');
    const routes = [
      ['paddy', -622, -215, 0], ['hillside', -622, 520, 0],
      ['rough', 948, -362, 0], ['terrace', -1140, 128, Math.PI / 2],
      ['meadow', -900, 0, 0],
    ];
    const rows = [], roadReports = [];
    for (const id of VEHICLE_ORDER) {
      drive.setVehicle(id);
      for (const [name, x, z, heading] of routes) {
        drive.placeAt(x, z, heading);
        drive.vehicle.velocity.set(Math.sin(heading) * 8, 0, Math.cos(heading) * 8);
        let maxLoss = 0, contacts = 0, airSteps = 0, hullRequest = 0, worst = null;
        for (let i = 0; i < 300; i++) {
          const v = drive.vehicle;
          const before = Math.hypot(v.velocity.x, v.velocity.z);
          drive.simulateStep(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
          const loss = (before - Math.hypot(v.velocity.x, v.velocity.z)) * 3.6;
          if (loss > maxLoss) {
            maxLoss = loss;
            worst = { step: i, position: v.position.toArray(), solidContacts: v.telemetry.contacts };
          }
          contacts += v.telemetry.contacts > 0 ? 1 : 0;
          airSteps += v.telemetry.airborne ? 1 : 0;
          hullRequest = Math.max(hullRequest, v.telemetry.hullDepth);
        }
        rows.push({ id, name, distance: Math.hypot(drive.vehicle.position.x - x, drive.vehicle.position.z - z),
          speed: drive.vehicle.telemetry.speed * 3.6, maxLoss, contacts, airSteps, hullRequest, worst,
          position: drive.vehicle.position.toArray() });
      }
      roadReports.push({ id, report: j.driveProbe({ roads: ['ring', 'toge', 'sando'], seconds: 30, speedCap: 16 }) });
    }
    drive.setVehicle('offroad');
    drive.placeAt(-622, 535, 0);
    drive.camera.reset(drive.vehicle);
    return { rows, roadReports };
  });
  await fs.mkdir('.cache', { recursive: true });
  await fs.writeFile(output, JSON.stringify({ ...results, errors, recordOnly }, null, 2));
  for (const row of results.rows) {
    assert.ok(row.position.every(Number.isFinite), `${row.id}/${row.name}: invalid position`);
    if (!recordOnly) assert.ok(row.distance > 15, `${row.id}/${row.name}: failed to make useful progress`);
    if (!recordOnly) assert.ok(row.maxLoss < 2, `${row.id}/${row.name}: abrupt loss ${row.maxLoss} km/h`);
  }
  if (!recordOnly) for (const { id, report } of results.roadReports) {
    const ring = report.runs.find(run => run.roadId === 'ring');
    assert.ok(ring && ring.offRoadSteps === 0 && ring.contactSteps === 0,
      `${id}: ring road regression`);
  }
  assert.deepEqual(errors, []);
  console.log(`Physics runtime: ${results.rows.length} current-world drives and ${results.roadReports.length} road reports, no page errors.`);
  console.table(results.rows.filter(row => row.id === 'offroad').map(({ name, distance, speed, maxLoss }) =>
    ({ name, distance: distance.toFixed(1), speed: speed.toFixed(1), maxLoss: maxLoss.toFixed(2) })));
} finally {
  await browser.close();
}
