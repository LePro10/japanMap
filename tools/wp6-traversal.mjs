import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5180/japanMap/');
  await page.waitForFunction(() => window.japanMap?.quality, null, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('low'));
  await page.locator('.start__button').click();
  const result = await page.evaluate(() => {
    const engine = window.japanMap.engine;
    const drive = engine.systems.find((s) => s.name === 'DriveSystem');
    engine.stop();
    const roads = drive.roads.roads;
    const byId = Object.fromEntries(roads.map((r) => [r.id, r]));
    if (!byId['needle-circuit']) return { error: 'needle-circuit missing — this server is not serving the WP6 road file' };
    const lots = drive.roads.file?.urbanLots?.length ?? 0;

    const ends = (road) => {
      const l = road.centerline;
      const n = l.length / 3;
      return [
        [l[0], l[2]],
        [l[(n - 1) * 3], l[(n - 1) * 3 + 2]],
      ];
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const nearestIndex = (road, p) => {
      const l = road.centerline;
      const n = l.length / 3;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(l[i * 3] - p[0], l[i * 3 + 2] - p[1]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    const stitch = (ids) => {
      const line = [];
      let cursor = null;
      for (let k = 0; k < ids.length; k++) {
        const road = byId[ids[k]];
        const l = road.centerline;
        const n = l.length / 3;
        const i0 = cursor ? nearestIndex(road, cursor) : 0;
        const next = ids[k + 1] && byId[ids[k + 1]];
        if (road.closed && !next) {
          for (let i = 0; i < n; i += 3) line.push({ x: l[i * 3], y: l[i * 3 + 1], z: l[i * 3 + 2] });
          if (line.length) cursor = [line.at(-1).x, line.at(-1).z];
          continue;
        }
        let i1 = road.closed ? i0 : n - 1;
        if (next) {
          const [na, nb] = ends(next);
          let best = Infinity;
          for (let i = 0; i < n; i++) {
            const d = Math.min(
              dist([l[i * 3], l[i * 3 + 2]], na),
              dist([l[i * 3], l[i * 3 + 2]], nb),
            );
            if (d < best) {
              best = d;
              i1 = i;
            }
          }
        }
        if (road.closed) {
          const fwd = (i1 - i0 + n) % n;
          const back = (i0 - i1 + n) % n;
          const dir = fwd <= back ? 1 : -1;
          const count = Math.min(fwd, back);
          for (let s = 0; s <= count; s += 3) {
            const i = (i0 + dir * s + n * 8) % n;
            line.push({ x: l[i * 3], y: l[i * 3 + 1], z: l[i * 3 + 2] });
          }
        } else {
          const dir = i1 >= i0 ? 1 : -1;
          for (let i = i0; dir > 0 ? i <= i1 : i >= i1; i += dir * 3) {
            line.push({ x: l[i * 3], y: l[i * 3 + 1], z: l[i * 3 + 2] });
          }
        }
        if (line.length) cursor = [line.at(-1).x, line.at(-1).z];
      }
      return line;
    };
    const adj = new Map(roads.map((r) => [r.id, []]));
    for (const road of roads) {
      for (const j of road.junctions) {
        if (!byId[j.with]) continue;
        adj.get(road.id).push(j.with);
        adj.get(j.with).push(road.id);
      }
    }
    for (const a of roads) {
      for (const b of roads) {
        if (a.id >= b.id) continue;
        for (const ea of ends(a)) for (const eb of ends(b)) {
          if (dist(ea, eb) < 18) {
            adj.get(a.id).push(b.id);
            adj.get(b.id).push(a.id);
          }
        }
      }
    }
    const pathIds = (start, goal) => {
      const q = [[start]];
      const seen = new Set([start]);
      while (q.length) {
        const chain = q.shift();
        const u = chain.at(-1);
        if (u === goal) return chain;
        for (const v of adj.get(u) ?? []) {
          if (seen.has(v)) continue;
          seen.add(v);
          q.push([...chain, v]);
        }
      }
      return null;
    };
    const follow = (line, seconds) => {
      const v = drive.vehicle;
      drive.board();
      drive.placeAt(line[0].x, line[0].z, Math.atan2(line[1].x - line[0].x, line[1].z - line[0].z));
      let index = 0;
      let maxError = 0;
      let minClearance = Infinity;
      let water = 0;
      const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      const steps = 60 * seconds;
      let n = 0;
      for (; n < steps; n++) {
        let best = Infinity;
        for (let j = index; j < Math.min(line.length, index + 14); j++) {
          const d = Math.hypot(line[j].x - v.position.x, line[j].z - v.position.z);
          if (d < best) {
            best = d;
            index = j;
          }
        }
        if (index >= line.length - 3) break;
        const target = line[Math.min(line.length - 1, index + 6)];
        let err = Math.atan2(target.x - v.position.x, target.z - v.position.z) - v.yaw;
        err = Math.atan2(Math.sin(err), Math.cos(err));
        input.steer = Math.max(-1, Math.min(1, -err * 2.4));
        const speed = v.telemetry.speed;
        input.throttle = speed < 9 ? 0.42 : 0;
        input.brake = speed > 12 ? 0.25 : 0;
        drive.simulateStep(1 / 60, input);
        maxError = Math.max(maxError, best);
        minClearance = Math.min(minClearance, v.position.y - drive.height(v.position.x, v.position.z));
        if (drive.surface(v.position.x, v.position.z) === 'wasser') water++;
      }
      return {
        index,
        total: line.length,
        steps: n,
        maxError,
        minClearance,
        water,
        position: v.position.toArray(),
        finished: index >= line.length - 4,
      };
    };

    const toCity = pathIds('commons-drive', 'stadt') ?? pathIds('commons-drive-2', 'stadt');
    const toVillage = pathIds('stadt', 'dorf');
    if (!toCity || !toVillage) return { error: 'no connected Commons → city → village path', toCity, toVillage };
    // Einzelne offene Strecken, nicht den ganzen Ring: der Regler verliert
    // eine 6-km-Schleife, und dann misst man den Controller statt die Straße.
    const commons = follow(stitch(['commons-drive', 'commons-drive-2']), 90);
    const gate = follow(stitch(['zufahrt']), 40);
    const village = follow(stitch(['dorf']), 90);
    const circuit = follow(stitch(['needle-circuit']), 50);
    return {
      lots,
      needle: byId['needle-circuit'].length,
      toCity,
      toVillage,
      commons,
      gate,
      village,
      circuit,
    };
  });
  await fs.mkdir('screenshots/wp6', { recursive: true });
  await fs.writeFile('screenshots/wp6/traversal.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(!result.error, result.error);
  assert.ok(result.lots > 0, 'urban lots must be in the live road file');
  assert.ok(result.toCity, 'Commons connects to the city');
  assert.ok(result.toVillage, 'city connects to the village');
  for (const key of ['commons', 'gate', 'village', 'circuit']) {
    const run = result[key];
    assert.ok(run.minClearance > -0.35, `${key} must not fall through (${run.minClearance})`);
    assert.equal(run.water, 0, `${key} must stay out of water`);
    assert.ok(run.maxError < 8, `${key} stays on the road (${run.maxError})`);
    assert.ok(
      key === 'circuit' ? run.index > 40 : run.finished || run.index / run.total > 0.7,
      `${key} must cover the road`,
    );
  }
  console.log('WP6 Commons → city → village traversal passed.');
} finally {
  await browser.close();
}
