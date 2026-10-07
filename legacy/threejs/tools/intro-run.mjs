/**
 * „First Drive" — ein Durchlauf des Intros im echten Browser.
 *
 *   node tools/intro-run.mjs [url]      (Dev-Server muss laufen)
 *
 * Fährt wie ein Spieler, der jeden Hinweis befolgt: W, Shift, in der Luft
 * zweimal Space, dann Space + A für die Wende. Den Heimweg fährt er **nicht**
 * — ein Folgeregler über 800 m Stadtstraße ist ein eigener Prüfstand und
 * blieb im ersten Versuch an einem Laternenmast hängen. Stattdessen wird der
 * Wagen vor die Open Bay gesetzt und rollt von Hand hinein: geprüft wird die
 * Einfahrt, die Garage samt Tipp und die Ausfahrt bis zur Begrüßung.
 *
 * Die Schleife wird **von Hand getrieben** (`loop.tick()` nach 16 ms
 * Wartezeit): im Hintergrund oder in der eingebetteten Vorschau kommt kein
 * rAF, und die Fristen des Intros laufen in Echtzeit.
 *
 * `?intro=on` ist nötig — unter Automatisierung gilt das Intro sonst als
 * gesehen (`FirstDrive.seen`).
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:5180/japanMap/';
const url = base + (base.includes('?') ? '&' : '?') + 'intro=on';
// Echte GPU über ANGLE/D3D11: SwiftShader braucht gemessen ~350 ms je Frame,
// und der Anlauf allein sind dann sieben Minuten. `SWIFTSHADER=1` für
// Maschinen ohne GPU.
const args = process.env.SWIFTSHADER
  ? ['--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'];
const browser = await chromium.launch({ headless: true, args });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.japanMap?.quality, null, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('minimal'));
  await page.waitForSelector('.start[data-phase="bereit"] .start__button', { timeout: 180000 });
  await page.locator('.start__button').click();

  await page.evaluate(() => {
    const e = window.japanMap.engine;
    window.__sys = (n) => e.systems.find((s) => s.name === n);
    window.__key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    window.__label = () => (document.querySelector('.intro__prompt').hidden ? '' : document.querySelector('.intro__label').textContent);
    window.__run = async (n, each) => {
      // Headless-Chromium stempelt rAF-Frames mit Zeiten, die vor
      // `performance.now()` liegen können; `tick()` sähe dann ein negatives dt
      // und rechnete gemessen in 12 Aufrufen keinen einzigen festen Schritt.
      // Und die eigene rAF-Schleife steht, solange von Hand getrieben wird: sie
      // setzte die Uhr bei jedem Warten vor, und die Einfahrt kam gemessen in
      // 400 Aufrufen 3 m weit.
      e.loop.stop();
      e.loop.resetClock();
      try {
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        while (performance.now() - t < 16) { /* Echtzeit für die Fristen */ }
        e.loop.tick();
        if (each && each(i) === true) return i;
        if (i % 10 === 0) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
      }
      return n;
      } finally {
        e.loop.start();
      }
    };
  });

  // 1. Anlauf, Absprung, Rolle — bis zum Drift-Hinweis.
  const jump = await page.evaluate(async () => {
    const drive = __sys('DriveSystem');
    let rolled = false, slowest = 1, flew = false;
    const n = await __run(2500, () => {
      const t = drive.vehicle.telemetry, L = __label();
      if (L.includes('accelerate')) __key('KeyW', true);
      if (L === 'Nitro') __key('ShiftLeft', true);
      if (t.airborne) flew = true;
      slowest = Math.min(slowest, window.japanMap.engine.loop.timeScale);
      // Erst tippen, wenn die Zeitlupe steht — ein Mensch reagiert auch nicht
      // im selben Frame, in dem der Hinweis erscheint.
      if (t.airborne && L.includes('roll') && !rolled && window.japanMap.engine.loop.timeScale < 0.3) {
        rolled = true;
        __key('Space', true); __key('Space', false); __key('Space', true); __key('Space', false);
        __key('KeyW', false); __key('ShiftLeft', false);
      }
      return L.includes('drift it around');
    });
    return { n, rolled, flew, slowest, trick: rolled, label: __label() };
  });
  console.log('Absprung:', jump);
  assert.ok(jump.flew, 'Der Wagen hat nicht abgehoben');
  assert.ok(jump.slowest < 0.3, `Keine Zeitlupe (kleinster Faktor ${jump.slowest})`);
  assert.match(jump.label, /drift it around/);

  // 2. Drift-Wende.
  const drift = await page.evaluate(async () => {
    __key('KeyW', true); __key('Space', true); __key('KeyA', true);
    const n = await __run(400, () => !document.querySelector('.intro__objective').hidden);
    __key('Space', false); __key('KeyA', false); __key('KeyW', false);
    const wp = __sys('DriveSystem').waypoint;
    return { n, objective: document.querySelector('.intro__objective strong')?.textContent, waypoint: wp?.label, remaining: wp?.remaining };
  });
  console.log('Drift:', drift);
  assert.equal(drift.objective, 'Drive to Sakura Commons');
  assert.equal(drift.waypoint, 'Sakura Commons');

  // 3. Einfahrt — vor das Tor gesetzt, langsam hinein.
  const bay = await page.evaluate(async () => {
    const drive = __sys('DriveSystem'), commons = __sys('SakuraCommons');
    const a = commons.bayApron;
    drive.placeAt(a.x, a.z + 18, Math.PI);
    __key('KeyW', true);
    const trace = [];
    await __run(400, (i) => {
      // Wie ein Spieler: anrollen, Gas lassen, bei Schritttempo wieder antippen.
      const v = drive.vehicle.telemetry.speed;
      if (v > 15 / 3.6) __key('KeyW', false);
      else if (v < 4 / 3.6 && !commons.bayBusy) __key('KeyW', true);
      if (i % 40 === 0) trace.push([+drive.vehicle.position.x.toFixed(1), +drive.vehicle.position.z.toFixed(1), +(drive.vehicle.telemetry.speed * 3.6).toFixed(0), commons.bayBusy]);
      return !!document.querySelector('.tune-garage');
    });
    __key('KeyW', false);
    return {
      trace,
      garage: !!document.querySelector('.tune-garage'),
      coach: !!document.querySelector('.tune-garage__coach'),
      shutter: document.querySelector('.bay-shutter').className,
    };
  });
  console.log('Einfahrt:', bay);
  assert.ok(bay.garage, 'Garage nicht geöffnet');
  assert.ok(bay.coach, 'Tipp beim ersten Besuch fehlt');

  // 4. Ausfahrt und Begrüßung.
  const out = await page.evaluate(async () => {
    const drive = __sys('DriveSystem'), commons = __sys('SakuraCommons'), intro = __sys('FirstDrive');
    document.querySelector('.tune-garage [data-action="drive"]').click();
    await new Promise((r) => setTimeout(r, 50));
    await __run(600, (i) => i > 5 && !commons.bayBusy);
    return {
      running: intro.running,
      welcome: !!document.querySelector('.commons-welcome'),
      seen: localStorage.getItem('japanmap.intro.done'),
      timeScale: window.japanMap.engine.loop.timeScale,
      lock: drive.introLock,
      z: drive.vehicle.position.z,
      apronZ: commons.bayApron.z,
    };
  });
  console.log('Ausfahrt:', out);
  assert.equal(out.running, false);
  assert.ok(out.welcome, 'Begrüßung fehlt');
  assert.equal(out.seen, '1');
  assert.equal(out.timeScale, 1);
  assert.equal(out.lock, false);
  assert.ok(out.z > out.apronZ, 'Wagen steht nicht vor dem Tor');

  const bad = errors.filter((m) => !/PropSystem/.test(m));
  assert.deepEqual(bad, []);
  console.log('Intro: Absprung, Zeitlupe, Rolle, Drift, Einfahrt, Garage, Ausfahrt, Begrüßung.');
} finally {
  await browser.close();
}
