// Koedo (docs/DOERFER.md §4): fährt ein echtes Fahrzeug die Dorfstraße hinauf, über den
// Platz und Straße B bis zum Schrein und zurück, prüft, dass auf beiden Fahrbahnen nichts
// im Weg steht, und lässt eine Figur durch die Brauerei bis zwischen die Tanks, die
// Kashiya-Gasse hinunter über die Bogenbrücke, die Wehrgasse hinunter über die
// Plattenbrücke, auf den Turmplatz und gegen eine Kura-Front gehen.
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
  await page.waitForFunction(() => window.japanMap?.engine?.systems.find(s => s.name === 'KoedoTown')?.buildMs, null, { timeout: 240000 });
  const result = await page.evaluate(() => {
    const e = window.japanMap.engine, d = e.systems.find(s => s.name === 'DriveSystem'), k = e.systems.find(s => s.name === 'KoedoTown');
    e.stop();
    const v = d.vehicle;
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
    // Von den Reisfeldern durch die Ichibangai, über den Platz, Straße B bis vor den Schrein.
    const up = drive(k.line(450, k.sEnd - 6, 3), 13, 150);
    const down = drive(k.line(k.sEnd - 6, 450, 3), 11, 150);
    // Fahrbahn frei? Kollisionsabfrage auf Radhöhe: Straße A ±2,5 m (Asphalt 5 m), Straße B ±2,6 m.
    let blocked = 0, probes = 0; const hits = [];
    for (const p of k.line(560, k.sEnd - 1, 1)) {
      const q = k.line(p.s, p.s + 0.5, 0.5)[1] ?? p, l = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = (q.z - p.z) / l, nz = -(q.x - p.x) / l;
      for (const o of [-2.5, -1.2, 0, 1.2, 2.5]) { probes++; if (d.collision.query(p.x + nx * o, p.y + 0.5, p.z + nz * o, 0.3).depth > 0) { blocked++; if (hits.length < 6) hits.push([p.s, o]); } }
    }
    // Terrace Track (Eventstrecke) im Ortsbereich: ±2,5 m frei.
    let trackBlocked = 0, trackProbes = 0;
    const tr = k.track.filter(([x]) => x > -330);
    for (let i = 1; i < tr.length; i++) {
      const [x0, z0] = tr[i - 1], [x1, z1] = tr[i], l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (z1 - z0) / l, nz = -(x1 - x0) / l, y = d.height(x1, z1);
      for (const o of [-2.5, 0, 2.5]) { trackProbes++; if (d.collision.query(x1 + nx * o, y + 0.5, z1 + nz * o, 0.3).depth > 0) { trackBlocked++; if (hits.length < 12) hits.push(['track', +x1.toFixed(1), +z1.toFixed(1), o]); } }
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
    const bp = k.breweryPath, brewery = walk(bp[0][0], bp[0][1], bp.slice(1));
    const cw = k.canalWalk, canal = walk(cw[0][0], cw[0][1], cw.slice(1));
    const ww = k.weirWalk, weir = walk(ww[0][0], ww[0][1], ww.slice(1));
    const tp = k.towerPath, tower = walk(tp[0][0], tp[0][1], tp.slice(1));
    // Gegen die Front eines Kura: die Figur muss draußen bleiben.
    const h = k.houses.find(x => x.side === 1 && x.kind === 'kura' && x.s < 690);
    const start = k.at(h.s, 4.6), inside = k.at(h.s, 9), wall = walk(start[0], start[1], [inside], 600);
    const wp = wall[0], hc = k.at(h.s, 0), hc2 = k.at(h.s, 1), l = Math.hypot(hc2[0] - hc[0], hc2[1] - hc[1]);
    const wallO = ((wp[0] - hc[0]) * (hc2[0] - hc[0]) + (wp[2] - hc[1]) * (hc2[1] - hc[1])) / l;
    return {
      up, down, road: { probes, blocked, hits, trackProbes, trackBlocked },
      brewery: { end: brewery[brewery.length - 1], target: bp[bp.length - 1], floor: k.breweryFloor },
      canal: { end: canal[canal.length - 1], target: k.canalEnd.toArray() },
      weir: { end: weir[weir.length - 1], target: k.weirEnd.toArray() },
      tower: { end: tower[tower.length - 1], target: k.towerPoint.toArray() }, wallO,
      levels: k.levels, buildMs: k.buildMs, triangles: k.triangles, houses: k.houses.length,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await fs.mkdir('screenshots/koedo', { recursive: true });
  await fs.writeFile('screenshots/koedo/traversal.json', JSON.stringify(result, null, 2));
  for (const key of ['up', 'down']) {
    const r = result[key];
    assert.ok(r.index >= r.total - 3, `${key}: Auto kommt durch den Ort`);
    assert.equal(r.water, 0, `${key}: kein Wasser auf der Fahrbahn`);
    assert.ok(r.minClear > -0.3, `${key}: kein Durchfallen`);
    assert.ok(r.maxError < 3.5, `${key}: bleibt auf der Fahrbahn`);
    assert.ok(r.minSpeed > 3, `${key}: bleibt nirgends hängen`);
  }
  assert.equal(result.road.blocked, 0, 'Fahrbahn frei von Kollision');
  assert.equal(result.road.trackBlocked, 0, 'Terrace Track im Ort frei von Kollision');
  const near = (a, t, dy = 0.4) => Math.hypot(a[0] - t[0], a[2] - t[2]) < 1.2 && (dy === null || Math.abs(a[1] - t[1]) < dy);
  const [bx, by, bz] = result.brewery.end, [tx, tz] = result.brewery.target;
  assert.ok(Math.hypot(bx - tx, bz - tz) < 1 && Math.abs(by - result.brewery.floor) < 0.3, 'Brauerei: durch den Laden, über den Hof, zwischen die Tanks');
  assert.ok(near(result.canal.end, result.canal.target), 'Kashiya-Gasse hinunter, Promenade, über die Bogenbrücke auf den Damm');
  assert.ok(near(result.weir.end, result.weir.target), 'Wehrgasse hinunter und über die Plattenbrücke');
  assert.ok(Math.hypot(result.tower.end[0] - result.tower.target[0], result.tower.end[2] - result.tower.target[2]) < 1, 'Glockenturm erreichbar');
  assert.ok(result.wallO < 6.0, 'Kura-Front hält');
  assert.deepEqual(errors, []);
  console.log('Koedo traversal passed.');
} finally { await browser.close(); }
