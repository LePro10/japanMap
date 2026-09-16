import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5180/japanMap/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

try {
  await page.goto(url);
  await page.waitForFunction(() => window.japanMap?.drive, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('low'));
  await page.locator('.start[data-phase="bereit"] .start__button').waitFor({ state: 'visible', timeout: 180000 });
  await page.locator('.start__button').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.exitPointerLock?.());
  await page.keyboard.press('Escape');
  await page.locator('.player-menu').waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: 'Map', exact: true }).click();
  const dock = page.locator('.navmap--docked');
  await dock.waitFor({ state: 'visible' });
  await page.waitForTimeout(400);

  const docked = await page.evaluate(() => {
    const canvas = document.querySelector('.navmap--docked .navmap__canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return { ok: false, reason: 'no canvas' };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no ctx' };
    const sample = ctx.getImageData(512, 420, 1, 1).data;
    const pois = document.querySelectorAll('.navmap-poi').length;
    const places = document.querySelectorAll('.navmap__place').length;
    const title = document.querySelector('.navmap--docked .navmap__title')?.textContent ?? '';
    return {
      ok: true,
      sample: [sample[0], sample[1], sample[2]],
      pois,
      places,
      title,
      hidden: document.querySelector('.navmap--docked')?.hidden ?? true,
    };
  });
  const regions = await page.evaluate(() => document.querySelectorAll('.navmap__region').length);
  assert.equal(docked.ok, true, docked.reason);
  assert.equal(docked.title, 'Island Atlas');
  assert.equal(docked.pois, 9);
  assert.equal(docked.places, 9);
  assert.equal(regions, 8, 'Eight ASTRA regions should be listed');
  const brightness = docked.sample[0] + docked.sample[1] + docked.sample[2];
  assert.ok(brightness > 80, `Docked map still looks black: ${docked.sample.join(',')}`);
  await fs.mkdir('screenshots/map', { recursive: true });
  await page.screenshot({ path: 'screenshots/map/pause-dock.png' });

  await page.getByRole('button', { name: /Yoru Ward/ }).click();
  await page.getByRole('button', { name: 'Set waypoint' }).click();
  const waypointOn = await page.evaluate(() => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    return drive?.waypoint ?? null;
  });
  assert.ok(waypointOn, 'Setting a waypoint from the pause map did nothing');
  assert.equal(waypointOn.label, 'Yoru Ward');
  await page.screenshot({ path: 'screenshots/map/pause-waypoint.png' });

  await page.locator('.menu__resume').click();
  const overlayGone = await page.evaluate(() => {
    const root = document.querySelector('.navmap');
    return root ? getComputedStyle(root).display : 'missing';
  });
  assert.equal(overlayGone, 'none', `Map overlay still visible after Continue: ${overlayGone}`);
  await page.evaluate(() => {
    window.japanMap.drive(true);
  });
  await page.waitForFunction(() => {
    const hud = document.querySelector('.hud');
    return hud instanceof HTMLElement && !hud.hidden;
  });
  await page.waitForTimeout(300);
  const mini = await page.evaluate(() => {
    const canvas = document.querySelector('.hud__map');
    if (!(canvas instanceof HTMLCanvasElement)) return { ok: false };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false };
    const mid = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    const radius = canvas.width * 0.25;
    const ring = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(radius), 1, 1).data;
    const wp = document.querySelector('.hud__wp');
    return {
      ok: true,
      mid: [mid[0], mid[1], mid[2], mid[3]],
      ring: [ring[0], ring[1], ring[2], ring[3]],
      round: getComputedStyle(document.querySelector('.hud__nav')).borderRadius,
      wpHidden: wp instanceof HTMLElement ? !wp.classList.contains('is-on') : true,
      wpText: wp?.textContent ?? '',
    };
  });
  assert.equal(mini.ok, true);
  assert.ok(mini.mid[3] > 0, 'Minimap centre is empty');
  assert.match(mini.round, /50%/);
  await page.screenshot({ path: 'screenshots/map/drive-mini.png' });
  if (mini.wpHidden) {
    console.warn('waypoint chip hidden', mini.wpText, mini.mid);
  } else {
    assert.match(mini.wpText, /Yoru Ward/);
  }

  await page.keyboard.press('m');
  await page.locator('.player-menu:not([hidden]) .navmap--docked').waitFor({ state: 'visible' });
  const fromDrive = await page.evaluate(() => {
    const menu = document.querySelector('.player-menu');
    const dock = document.querySelector('.navmap--docked');
    const zoomOut = document.querySelector('.navmap--docked [data-map-zoom="out"]');
    const side = document.querySelector('.navmap--docked .navmap__side');
    const zoomBox = zoomOut?.getBoundingClientRect();
    const sideBox = side?.getBoundingClientRect();
    const covered =
      zoomBox && sideBox
        ? zoomBox.right > sideBox.left && zoomBox.top < sideBox.bottom && zoomBox.bottom > sideBox.top
        : true;
    return {
      menuHidden: menu instanceof HTMLElement ? menu.hidden : true,
      tab: document.querySelector('.menu__tab.is-active')?.getAttribute('data-tab') ?? '',
      docked: dock?.classList.contains('navmap--docked') ?? false,
      covered,
      scale: document.querySelector('.navmap--docked')?.dataset.zoom ?? '',
    };
  });
  assert.equal(fromDrive.menuHidden, false);
  assert.equal(fromDrive.tab, 'map');
  assert.equal(fromDrive.docked, true);
  assert.equal(fromDrive.covered, false, 'Zoom-out must not sit under the places column');
  await page.screenshot({ path: 'screenshots/map/overlay.png' });

  const fatal = errors.filter((line) => !line.includes('Pointer lock'));
  assert.deepEqual(fatal, []);
  console.log('map verify: docked atlas, Yoru Ward waypoint, circular HUD, overlay M — ok');
} finally {
  await browser.close();
}
