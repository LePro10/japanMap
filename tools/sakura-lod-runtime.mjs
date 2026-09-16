/**
 * Runtime: Commons-Kirschen haben dieselbe LOD-Leiter wie Kiefern
 * und denselben Bruch wie ein Waldstamm.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/japanMap/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.japanMap?.quality, { timeout: 180000 });
  await page.evaluate(() => {
    window.japanMap.engine.resize(1280, 720);
    window.japanMap.quality('ultra');
  });

  const lodProbe = await page.evaluate(async () => {
    const scatter = window.japanMap.engine.systems.find((s) => s.name === 'ScatterSystem');
    const wait = () =>
      new Promise((resolve) => {
        const c = new MessageChannel();
        c.port1.onmessage = () => resolve();
        c.port2.postMessage(0);
      });
    const tickUntil = async (want) => {
      let last = scatter.speciesVisible('sakura');
      for (let i = 0; i < 240; i++) {
        window.japanMap.engine.loop.tick();
        await wait();
        last = scatter.speciesVisible('sakura');
        if (want(last)) return last;
      }
      return last;
    };

    window.japanMap.view({ position: [550, 80, 910], lookAt: [550, 18, 510] });
    const far = await tickUntil((s) => s.far > 0 && s.near === 0 && s.mid === 0);
    window.japanMap.view({ position: [550, 8, 540], lookAt: [550, 4, 510] });
    const near = await tickUntil((s) => s.near > 0);
    return { far, near, pineFar: scatter.speciesVisible('pine') };
  });

  assert.equal(lodProbe.far.authored, 44, 'commons shell places 24+20 cherries');
  assert.ok(lodProbe.far.far > 0, `far camera draws sakura imposters (${JSON.stringify(lodProbe.far)})`);
  assert.equal(lodProbe.far.near, 0, '400 m is past the near mesh');
  assert.equal(lodProbe.far.mid, 0, '400 m is past the mid mesh — same 180 m seam as pine');
  assert.ok(lodProbe.near.near > 0, `close camera draws sakura meshes (${JSON.stringify(lodProbe.near)})`);

  const breakProbe = await page.evaluate(() => {
    const scatter = window.japanMap.engine.systems.find((s) => s.name === 'ScatterSystem');
    const hits = Array.from({ length: 48 }, () => ({ x: 0, y: 0, z: 0, radius: 0, height: 0, key: 0 }));
    const n = scatter.queryCanopy(550, 510, 80, hits);
    const first = n > 0 ? { ...hits[0] } : null;
    const broken = first ? scatter.breakTree(first.key) : false;
    const afterHits = Array.from({ length: 48 }, () => ({ x: 0, y: 0, z: 0, radius: 0, height: 0, key: 0 }));
    const after = scatter.queryCanopy(550, 510, 80, afterHits);
    const stillThere = first
      ? Array.from({ length: after }, (_, i) => afterHits[i].key).includes(first.key)
      : true;
    return {
      authored: scatter.speciesVisible('sakura').authored,
      found: n,
      trunk: first,
      broke: broken,
      remaining: after,
      stillThere,
      brokenTrees: scatter.brokenTrees,
    };
  });

  assert.equal(breakProbe.authored, 44, 'commons shell places 24+20 cherries');
  assert.ok(breakProbe.found > 0, 'queryCanopy sees the bowl');
  assert.ok(breakProbe.trunk && breakProbe.trunk.radius > 0.1 && breakProbe.trunk.radius < 0.8, 'trunk radius is a tree, not a bush');
  assert.equal(breakProbe.broke, true, 'breakTree accepts a cherry key');
  assert.equal(breakProbe.stillThere, false, 'broken cherry leaves the canopy');
  assert.equal(breakProbe.brokenTrees, 1);

  const hitProbe = await page.evaluate(() => {
    const scatter = window.japanMap.engine.systems.find((s) => s.name === 'ScatterSystem');
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    window.japanMap.drive(true);
    const hits = Array.from({ length: 48 }, () => ({ x: 0, y: 0, z: 0, radius: 0, height: 0, key: 0 }));
    const n = scatter.queryCanopy(550, 510, 80, hits);
    const ring = Array.from({ length: n }, (_, i) => hits[i]).filter((t) => {
      const d = Math.hypot(t.x - 550, t.z - 510);
      return d > 50 && d < 70;
    });
    const tree = ring[0];
    if (!tree) return { hit: false, before: scatter.brokenTrees, after: scatter.brokenTrees, n };
    const before = scatter.brokenTrees;
    drive.placeAt(tree.x - 8, tree.z, Math.PI / 2);
    drive.vehicle.velocity.set(18, 0, 0);
    const input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    for (let i = 0; i < 90; i++) drive.simulateStep(1 / 60, input);
    return {
      hit: scatter.brokenTrees > before,
      before,
      after: scatter.brokenTrees,
      kind: drive.vehicle.telemetry ? 'ok' : 'ok',
      n,
      ring: ring.length,
      target: tree ? { x: tree.x, z: tree.z, key: tree.key } : null,
    };
  });
  assert.equal(hitProbe.hit, true, `vehicle impact breaks a cherry (${JSON.stringify(hitProbe)})`);

  const shaderErrors = errors.filter((e) => /shader|WebGL|THREE/i.test(e));
  assert.equal(shaderErrors.length, 0, shaderErrors.join(' | '));

  console.log(
    JSON.stringify({
      test: 'sakura lod runtime',
      status: 'passed',
      break: breakProbe,
      hit: hitProbe,
      lod: lodProbe,
    }),
  );
} finally {
  await browser.close();
}
