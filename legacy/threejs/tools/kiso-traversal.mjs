// Kiso-Juku (docs/DOERFER.md §3): fährt ein echtes Fahrzeug den Pass durch die
// Poststation, bergauf und bergab, prüft, dass auf der Fahrbahn nichts im Weg steht,
// und lässt eine Figur die Steingasse hinauf bis auf die Teehausterrasse, durch das
// Honjin-Tor bis an das Irori und gegen eine Hauswand gehen.
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
  await page.waitForFunction(() => window.japanMap?.engine?.systems.find(s => s.name === 'KisoJuku')?.buildMs, null, { timeout: 240000 });
  const result = await page.evaluate(() => {
    const e = window.japanMap.engine, d = e.systems.find(s => s.name === 'DriveSystem'), k = e.systems.find(s => s.name === 'KisoJuku');
    e.stop();
    const v = d.vehicle, toge = d.roads.roads.find(r => r.id === 'toge'), c = toge.centerline, spacing = toge.length / (c.length / 3 - 1);
    const line = (s0, s1) => { const out = []; for (let s = s0; s1 > s0 ? s <= s1 : s >= s1; s += s1 > s0 ? 4 : -4) { const i = Math.round(s / spacing); out.push({ x: c[i * 3], y: c[i * 3 + 1], z: c[i * 3 + 2] }); } return out; };
    const drive = (pts, want, limit) => {
      d.board(); d.placeAt(pts[0].x, pts[0].z, Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z));
      let index = 0, maxError = 0, minClear = Infinity, water = 0, steps = 0, maxHull = 0, minSpeed = Infinity;
      const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      for (; steps < 60 * limit; steps++) {
        let best = Infinity;
        for (let j = index; j < Math.min(pts.length, index + 8); j++) { const dist = Math.hypot(pts[j].x - v.position.x, pts[j].z - v.position.z); if (dist < best) { best = dist; index = j; } }
        if (index >= pts.length - 2) break;
        const target = pts[Math.min(pts.length - 1, index + 2)], angle = Math.atan2(target.x - v.position.x, target.z - v.position.z);
        let err = angle - v.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
        input.steer = Math.max(-1, Math.min(1, -err * 2.2));
        const speed = v.telemetry.speed;
        input.throttle = speed < want ? 0.7 : 0; input.brake = speed > want + 2 ? 0.4 : 0;
        d.ground.refresh(v.position.x, v.position.z, 1 / 60);
        if (d.waterDepth(v.position.x, v.position.z) > 0.05) water++;
        v.step(1 / 60, input, d, d.collision);
        maxError = Math.max(maxError, best); minClear = Math.min(minClear, v.position.y - d.height(v.position.x, v.position.z));
        maxHull = Math.max(maxHull, v.telemetry.hullDepth || 0);
        if (steps > 300) minSpeed = Math.min(minSpeed, speed);
      }
      return { index, total: pts.length, steps, seconds: steps / 60, maxError, minClear, water, maxHull, minSpeed, contacts: v.telemetry.contacts };
    };
    // Bergauf mit Renntempo (22 m/s ≈ 80 km/h), bergab langsamer.
    const up = drive(line(1600, 2010), 22, 120);
    const down = drive(line(2010, 1600), 16, 120);
    // Fahrbahn frei? Kollisionsabfrage auf Radhöhe über die ganze Breite (±3,8 m).
    let blocked = 0, probes = 0;
    for (let s = 1660; s <= 1960; s += 1) {
      const i = Math.round(s / spacing), x = c[i * 3], y = c[i * 3 + 1], z = c[i * 3 + 2], x2 = c[i * 3 + 3], z2 = c[i * 3 + 5], l = Math.hypot(x2 - x, z2 - z);
      for (const o of [-3.8, -2, 0, 2, 3.8]) { probes++; if (d.collision.query(x + (z2 - z) / l * o, y + 0.5, z - (x2 - x) / l * o, 0.3).depth > 0) blocked++; }
    }
    const walk = (x, z, pts, limit = 3000) => {
      d.alight?.(); d.walker.respawn(x, z, 0, d); const out = [];
      for (const [tx, tz] of pts) {
        for (let n = 0; n < limit; n++) {
          const p = d.walker.position; if (Math.hypot(tx - p.x, tz - p.z) < 0.45) break;
          d.ground.refresh(p.x, p.z, 1 / 60);
          d.walker.step(1 / 60, { forward: 1, right: 0, jump: false, sprint: false }, d, d.collision, Math.atan2(tx - p.x, tz - p.z));
        }
        out.push(d.walker.position.toArray());
      }
      return out;
    };
    const lane = k.lane.filter((_, i) => i % 6 === 0).map(p => [p.x, p.z]);
    // Die Gasse hinauf bis zum Abzweig, dann über den Steg auf die Terrasse.
    const turn = k.lane.reduce((b, p, i) => Math.hypot(p.x - k.teaPath[0][0], p.z - k.teaPath[0][1]) < Math.hypot(k.lane[b].x - k.teaPath[0][0], k.lane[b].z - k.teaPath[0][1]) ? i : b, 0);
    const stair = walk(lane[0][0], lane[0][1], [...k.lane.slice(1, turn + 1).filter((_, i) => i % 6 === 0).map(p => [p.x, p.z]), ...k.teaPath]);
    const hp = k.honjinPath;
    const honjin = walk(hp[0][0], hp[0][1], hp.slice(1));
    // Gegen die Front eines Talhauses: die Figur muss draußen bleiben.
    const h = k.houses.find(x => x.side === 1 && x.role === 'inn');
    const toge2 = (s, o) => { const i = Math.round(s / spacing), x = c[i * 3], z = c[i * 3 + 2], x2 = c[i * 3 + 3], z2 = c[i * 3 + 5], l = Math.hypot(x2 - x, z2 - z); return [x + (z2 - z) / l * o, z - (x2 - x) / l * o]; };
    const start = toge2(h.s, 5.2), inside = toge2(h.s, 9);
    const wall = walk(start[0], start[1], [inside], 600);
    const wallO = (() => { const p = wall[0], i = Math.round(h.s / spacing), x = c[i * 3], z = c[i * 3 + 2], x2 = c[i * 3 + 3], z2 = c[i * 3 + 5], l = Math.hypot(x2 - x, z2 - z); return (p[0] - x) * (z2 - z) / l + (p[2] - z) * -(x2 - x) / l; })();
    return {
      up, down, road: { probes, blocked }, stair: { end: stair[stair.length - 1], deck: k.teaDeck.toArray(), laneTop: k.lane[k.lane.length - 1].toArray() },
      honjin: { end: honjin[honjin.length - 1], floor: k.honjinFloor, target: hp[hp.length - 1] }, wallO,
      buildMs: k.buildMs, triangles: k.triangles, houses: k.houses.length,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await fs.mkdir('screenshots/kiso', { recursive: true });
  await fs.writeFile('screenshots/kiso/traversal.json', JSON.stringify(result, null, 2));
  for (const key of ['up', 'down']) {
    const r = result[key];
    assert.ok(r.index >= r.total - 3, `${key}: Auto kommt durch das Dorf`);
    assert.equal(r.water, 0, `${key}: kein Wasser auf der Fahrbahn`);
    assert.ok(r.minClear > -0.3, `${key}: kein Durchfallen`);
    // 3,5 m wie in gassho-traversal: der Regler schwingt beim Anfahren um die Linie, nicht das Dorf.
    assert.ok(r.maxError < 3.5, `${key}: bleibt auf der Fahrbahn`);
    assert.ok(r.minSpeed > 3, `${key}: bleibt nirgends hängen`);
  }
  assert.equal(result.road.blocked, 0, 'Fahrbahn ±3,8 m frei von Kollision');
  const [sx, sy, sz] = result.stair.end, [dx, dy, dz] = result.stair.deck;
  assert.ok(Math.hypot(sx - dx, sz - dz) < 1.2 && Math.abs(sy - dy) < 0.4, 'Steingasse bis auf die Teehausterrasse begehbar');
  const [hx, hy, hz] = result.honjin.end, [tx, tz] = result.honjin.target;
  assert.ok(Math.hypot(hx - tx, hz - tz) < 1 && Math.abs(hy - result.honjin.floor) < 0.3, 'Honjin: durchs Tor, über den Hof, in die Doma und hinauf an das Irori');
  assert.ok(result.wallO < 6.5, 'Hausfront hält');
  assert.deepEqual(errors, []);
  console.log('Kiso traversal passed.');
} finally { await browser.close(); }
