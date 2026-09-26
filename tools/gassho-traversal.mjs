// Stillwater als Gassho-Weiler (docs/DOERFER.md §2): fährt ein echtes Fahrzeug die
// neue Dorfstraße von der Nord- zur Südeinmündung und die Mill Lane über beide
// Brücken, prüft die Brückengeländer, lässt eine Figur zum Wasserrad, die
// Schreinstufen hinauf, in einen Hof und gegen eine Hauswand gehen.
// Braucht einen Dev-Server (Standard 5180) und `npm i --no-save playwright-core`.
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
  await page.waitForFunction(() => window.japanMap?.engine?.systems.find(s => s.name === 'GasshoHamlet')?.buildMs, null, { timeout: 240000 });
  const result = await page.evaluate(() => {
    const e = window.japanMap.engine, d = e.systems.find(s => s.name === 'DriveSystem'), g = e.systems.find(s => s.name === 'GasshoHamlet'), sw = e.systems.find(s => s.name === 'StillwaterVillage');
    e.stop();
    const v = d.vehicle;
    const drive = (line, want, limit) => {
      d.board(); d.placeAt(line[0].x, line[0].z, Math.atan2(line[1].x - line[0].x, line[1].z - line[0].z));
      let index = 0, maxError = 0, minClear = Infinity, water = 0, steps = 0, maxHull = 0;
      const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      for (; steps < 60 * limit; steps++) {
        let best = Infinity;
        for (let j = index; j < Math.min(line.length, index + 12); j++) { const dist = Math.hypot(line[j].x - v.position.x, line[j].z - v.position.z); if (dist < best) { best = dist; index = j; } }
        if (index >= line.length - 2) break;
        const target = line[Math.min(line.length - 1, index + 4)], angle = Math.atan2(target.x - v.position.x, target.z - v.position.z);
        let err = angle - v.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
        input.steer = Math.max(-1, Math.min(1, -err * 2.2));
        const speed = v.telemetry.speed;
        input.throttle = speed < want ? 0.55 : 0; input.brake = speed > want + 2 ? 0.4 : 0;
        d.ground.refresh(v.position.x, v.position.z, 1 / 60);
        if (d.waterDepth(v.position.x, v.position.z) > 0.05) water++;
        v.step(1 / 60, input, d, d.collision);
        maxError = Math.max(maxError, best); minClear = Math.min(minClear, v.position.y - d.height(v.position.x, v.position.z));
        maxHull = Math.max(maxHull, v.telemetry.hullDepth || 0);
      }
      return { index, total: line.length, steps, seconds: steps / 60, maxError, minClear, water, maxHull, contacts: v.telemetry.contacts, end: v.position.toArray() };
    };
    const street = drive(g.streetSamples.filter((_, i) => i % 2 === 0), 8, 240);
    // Mill Lane in voller Länge: beide Flussquerungen liegen darauf.
    const lane = drive(sw.laneSamples.filter((_, i) => i % 2 === 0), 8, 300);
    // Brückengeländer: halten sie seitlich? (Abfrage direkt neben der Fahrbahn, auf Radhöhe.)
    const wet = sw.laneSamples.filter(p => d.terrain.getHeightAt(p.x, p.z) < 20);
    const rails = wet.map(p => { const i = sw.laneSamples.indexOf(p), q = sw.laneSamples[Math.min(sw.laneSamples.length - 1, i + 1)]; const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1; return d.collision.query(p.x + dz / l * 3.75, p.y + 0.5, p.z - dx / l * 3.75, 0.3).depth; });
    const walk = (x, z, pts) => {
      d.alight?.(); d.walker.respawn(x, z, 0, d); const out = [];
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
    const wheel = walk(-1173, 346, [[-1188, 346], [-1197.5, 344.5]]);
    // Schrein: Plattform 0,7 m hoch, über die Stufen an der Torii-Seite (Westen).
    const shrine = walk(-1125, 252, [[-1117.5, 252], [-1112, 252]]);
    // Über die Steinstufen vor dem Tor in den Hof des großen Hauses (1,2 m über der
    // Straße) und dann gegen seine Wand. Neben den Stufen hält die Terrassenmauer.
    const yard = walk(-1171, 392, [[-1162, 392]]);
    const wall = walk(-1162, 398, [[-1150, 398]]);
    const terrace = walk(-1171, 398, [[-1162, 398]]);
    const hero = g.yards.find(y => Math.abs(y.x + 1154) < 1 && Math.abs(y.z - 392) < 1);
    return { street, lane, rails: { count: rails.length, holding: rails.filter(x => x > 0).length }, wheel, shrine, yard, wall, terrace, heroYard: hero?.y, buildMs: g.buildMs, triangles: g.triangles, bridges: g.bridges, outlet: g.troughOutlet };
  });
  console.log(JSON.stringify(result, null, 2));
  await fs.mkdir('screenshots/gassho', { recursive: true });
  await fs.writeFile('screenshots/gassho/traversal.json', JSON.stringify(result, null, 2));
  const last = a => a[a.length - 1];
  for (const key of ['street', 'lane']) {
    const r = result[key];
    assert.ok(r.index >= r.total - 3, `${key}: Auto kommt ans Ende`);
    assert.equal(r.water, 0, `${key}: fährt sich nicht wie Wasser`);
    assert.ok(r.minClear > -0.3, `${key}: kein Durchfallen`);
    assert.ok(r.maxError < 3.5, `${key}: bleibt auf dem Weg`);
  }
  assert.equal(result.bridges, 2, 'zwei Flussquerungen der Mill Lane');
  assert.ok(result.rails.count > 0 && result.rails.holding / result.rails.count > 0.9, 'Brückengeländer halten');
  assert.ok(Math.hypot(last(result.wheel)[0] + 1197.5, last(result.wheel)[2] - 344.5) < 1, 'Aussichtspunkt am Wasserrad erreichbar');
  assert.ok(last(result.shrine)[1] > result.shrine[0][1] + 0.4, 'Schreinstufen hinauf');
  assert.ok(Math.abs(last(result.yard)[1] - result.heroYard) < 0.35, 'Hof des großen Hauses begehbar');
  assert.ok(last(result.wall)[0] < -1159.6, 'Hauswand hält');
  assert.ok(last(result.terrace)[1] < result.heroYard - 0.5, 'Terrassenmauer neben den Stufen hält');
  assert.ok(result.outlet >= 0.3, 'Rinne läuft bergab auf die Terrasse');
  assert.deepEqual(errors, []);
  console.log('Gassho traversal passed.');
} finally { await browser.close(); }
