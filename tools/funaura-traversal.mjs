// Funaura (docs/DOERFER.md §1): fährt ein echtes Fahrzeug von Stillwater über die
// neue Flussstraße bis ans Stegende und lässt eine Figur beide Molen zu den
// Leuchtfeuern, die Schreintreppe hinauf und gegen eine Bootshauswand gehen.
// Braucht den Dev-Server auf 5180 und `npm i --no-save playwright-core`.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5180/japanMap/';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.japanMap?.engine?.systems.find(s => s.name === 'FunauraVillage')?.buildMs, null, { timeout: 240000 });
  const result = await page.evaluate(() => {
    const e = window.japanMap.engine, d = e.systems.find(s => s.name === 'DriveSystem'), f = e.systems.find(s => s.name === 'FunauraVillage');
    e.stop();
    const V = f.roadSamples[0].constructor;
    // Dichter Pfad: Straße, dann über die Platte (zwischen Izakaya und Laden hindurch) bis ans Stegende.
    const line = f.roadSamples.filter((_, i) => i % 2 === 0);
    const tail = [[-1263, 1041], [-1263, 1082], [-1182, 1082], [-1180, 1090], [-1180, 1162]];
    for (let i = 1; i < tail.length; i++) {
      const [ax, az] = tail[i - 1], [bx, bz] = tail[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
      for (let j = 1; j <= n; j++) line.push(new V(ax + (bx - ax) * j / n, 1.8, az + (bz - az) * j / n));
    }
    const v = d.vehicle; d.board(); d.placeAt(line[0].x, line[0].z, Math.atan2(line[1].x - line[0].x, line[1].z - line[0].z));
    let index = 0, maxError = 0, minClear = Infinity, water = 0, steps = 0, maxHull = 0;
    const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    for (; steps < 60 * 420; steps++) {
      let best = Infinity;
      for (let j = index; j < Math.min(line.length, index + 12); j++) { const dist = Math.hypot(line[j].x - v.position.x, line[j].z - v.position.z); if (dist < best) { best = dist; index = j; } }
      if (index >= line.length - 2) break;
      const target = line[Math.min(line.length - 1, index + 4)], angle = Math.atan2(target.x - v.position.x, target.z - v.position.z);
      let err = angle - v.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      input.steer = Math.max(-1, Math.min(1, -err * 2.2));
      const speed = v.telemetry.speed, want = 8;
      input.throttle = speed < want ? 0.55 : 0; input.brake = speed > want + 2 ? 0.4 : 0;
      d.ground.refresh(v.position.x, v.position.z, 1 / 60);
      if (d.waterDepth(v.position.x, v.position.z) > 0.05) water++;
      v.step(1 / 60, input, d, d.collision);
      maxError = Math.max(maxError, best); minClear = Math.min(minClear, v.position.y - d.height(v.position.x, v.position.z));
      maxHull = Math.max(maxHull, v.telemetry.hullDepth || 0);
    }
    const route = { index, total: line.length, steps, seconds: steps / 60, maxError, minClear, water, maxHull, end: v.position.toArray() };
    const walk = (x, z, pts) => {
      d.walker.respawn(x, z, 0, d); const out = [];
      for (const [tx, tz] of pts) {
        for (let k = 0; k < 3000; k++) {
          const p = d.walker.position; if (Math.hypot(tx - p.x, tz - p.z) < 0.4) break;
          d.ground.refresh(p.x, p.z, 1 / 60);
          d.walker.step(1 / 60, { forward: 1, right: 0, jump: false, sprint: false }, d, d.collision, Math.atan2(tx - p.x, tz - p.z));
        }
        out.push(d.walker.position.toArray());
      }
      return out;
    };
    const westMole = walk(-1262, 1082, [[-1318, 1082], [-1321.5, 1090], [-1321.5, 1150], [-1318, 1194], [-1300, 1207.5]]);
    const eastMole = walk(-1170, 1080, [[-1150, 1098], [-1144.5, 1104], [-1145, 1160], [-1158, 1196], [-1204, 1212]]);
    const shrine = walk(-1268, 972, [[-1250, 958], [-1232, 940], [-1219, 928], [-1215.4, 923.5]]);
    const wall = walk(-1266, 1080, [[-1266, 1095]]);
    return { route, westMole, eastMole, shrine, wall, buildMs: f.buildMs, triangles: f.triangles, tetrapods: f.tetrapods };
  });
  console.log(JSON.stringify(result, null, 2));
  await fs.mkdir('screenshots/funaura', { recursive: true });
  await fs.writeFile('screenshots/funaura/traversal.json', JSON.stringify(result, null, 2));
  assert.ok(result.route.index >= result.route.total - 3, 'Auto erreicht das Stegende');
  assert.equal(result.route.water, 0, 'Straße und Kai fahren sich nicht wie Wasser');
  assert.ok(result.route.minClear > -0.3, 'kein Durchfallen');
  assert.ok(result.route.maxError < 4, 'bleibt auf dem Weg');
  const last = a => a[a.length - 1];
  assert.ok(last(result.westMole)[1] > 2.5 && Math.hypot(last(result.westMole)[0] + 1300, last(result.westMole)[2] - 1207.5) < 1, 'Westmole begehbar bis zum weißen Feuer');
  assert.ok(last(result.eastMole)[1] > 2.5 && Math.hypot(last(result.eastMole)[0] + 1204, last(result.eastMole)[2] - 1212) < 1, 'Ostmole begehbar bis zum roten Feuer');
  assert.ok(last(result.shrine)[1] > 8, 'Schreintreppe hinauf');
  assert.ok(result.wall[0][2] < 1091.5, 'Bootshauswand hält');
  assert.deepEqual(errors, []);
  console.log('Funaura traversal passed.');
} finally { await browser.close(); }
