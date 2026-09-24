import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5180/japanMap/';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });

async function start(page) {
  await page.goto(url);
  await page.locator('.start__button').waitFor({ state: 'visible', timeout: 180_000 });
  await page.locator('.start__button').click();
  await page.locator('.touch').waitFor({ state: 'visible' });
}

try {
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await start(mobile);
  const initial = await mobile.evaluate(() => ({
    fullscreen: Boolean(document.fullscreenElement),
    height: getComputedStyle(document.body).height,
    viewportHeight: innerHeight,
    touch: getComputedStyle(document.querySelector('.touch')).display,
  }));
  console.log('Mobile start:', initial);

  await mobile.locator('[data-touch="drive"]').click();
  await mobile.locator('.hud__speedo').waitFor({ state: 'visible' });
  const boxes = await mobile.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      canvas: rect('#viewport'),
      map: rect('.hud__nav'),
      speedo: rect('.hud__speedo'),
      buttons: [...document.querySelectorAll('.touch__buttons button:not([hidden])')]
        .map((el) => ({ name: el.getAttribute('data-touch'), ...(() => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        })() })),
    };
  });
  console.log('Mobile drive:', JSON.stringify(boxes));
  await mkdir('.cache', { recursive: true });
  await mobile.screenshot({ path: '.cache/mobile-drive-after.png' });
  assert.equal(initial.fullscreen, true, 'Play should request fullscreen on supported mobile browsers');
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
  assert.ok(boxes.map.width <= 100, 'Minimap should leave room for the steering thumb');
  assert.ok(boxes.speedo.width <= 120, 'Speedometer should be compact in landscape');
  for (const button of boxes.buttons) {
    assert.ok(!overlaps(button, boxes.speedo), `${button.name} must not overlap speedometer`);
    assert.ok(button.x >= 0 && button.y >= 0 && button.x + button.width <= boxes.viewport.width &&
      button.y + button.height <= boxes.viewport.height, `${button.name} must stay in viewport`);
  }
  const pedal = await mobile.evaluate(async () => {
    const { TouchControls } = await import('/japanMap/src/ui/TouchControls.ts');
    const canvas = document.createElement('canvas');
    const container = document.createElement('div');
    document.body.append(canvas, container);
    let axes = [0, 0, 0];
    const drive = {
      active: true, walking: false, toggle() {}, toggleVehicle() {}, respawn() {},
      setHandbrake() {}, setJump() {}, setBoost() {}, toggleView() {},
    };
    const controls = new TouchControls({ canvas, container, drive, onMenu() {}, camera: {
      look() {}, setAxes(...next) { axes = next; }, scaleSpeed() {},
      toggleCollision() { return false; }, resetToStart() {}, speed: 10,
    } });
    controls.setDriveMode(true);
    const gas = container.querySelector('[data-touch="gas"]');
    if (!gas) { controls.dispose(); canvas.remove(); return null; }
    gas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41, pointerType: 'touch' }));
    const held = axes[0];
    gas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, pointerType: 'touch' }));
    const released = axes[0];
    controls.dispose();
    canvas.remove();
    return { held, released };
  });
  assert.deepEqual(pedal, { held: 1, released: 0 }, 'Gas pedal should accelerate only while held');
  await mobile.locator('[data-touch="gas"]').dispatchEvent('pointerdown',
    { pointerId: 73, pointerType: 'touch' });
  await mobile.waitForFunction(() => Number(document.querySelector('[data-hud="speed"]')?.textContent) > 3,
    null, { timeout: 10_000 });
  await mobile.locator('[data-touch="gas"]').dispatchEvent('pointerup',
    { pointerId: 73, pointerType: 'touch' });

  await mobile.getByRole('button', { name: 'Menu', exact: true }).click();
  await mobile.screenshot({ path: '.cache/mobile-menu-landscape.png' });
  const menu = await mobile.evaluate(() => ({
    panel: document.querySelector('.menu__panel:not([hidden])').getBoundingClientRect().height,
    hero: document.querySelector('.menu__tile--hero').getBoundingClientRect().height,
  }));
  assert.ok(menu.hero <= menu.panel, 'The main menu action should fit in a short landscape screen');
  await mobile.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await mobile.locator('.menu__fullscreen').innerText(), 'Exit full screen');
  await mobile.evaluate(() => document.exitFullscreen());
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.getByRole('button', { name: 'Continue' }).click();
  const portrait = await mobile.evaluate(() => {
    const box = (selector) => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    const optional = (selector) => {
      const el = document.querySelector(selector);
      return el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'
        ? box(selector) : null;
    };
    return { map: box('.hud__nav'), speedo: box('.hud__speedo'),
      pedals: box('.touch__buttons'), side: box('.touch__side'),
      waypoint: optional('.hud__wp'), discovery: optional('.city-discovery') };
  });
  console.log('Mobile portrait:', JSON.stringify(portrait));
  await mobile.screenshot({ path: '.cache/mobile-portrait-after.png' });
  assert.ok(!overlaps(portrait.map, portrait.speedo), 'Portrait map and speedometer must be separate');
  assert.ok(!overlaps(portrait.side, portrait.speedo), 'Portrait shortcuts must not cover speedometer');
  assert.ok(!overlaps(portrait.side, portrait.pedals), 'Portrait shortcuts must not cover pedals');
  if (portrait.waypoint) {
    assert.ok(!overlaps(portrait.waypoint, portrait.speedo), 'Waypoint must not cover speedometer');
  }
  if (portrait.discovery) {
    assert.equal(await mobile.locator('.city-discovery').evaluate((el) => getComputedStyle(el).pointerEvents),
      'none', 'Discovery notice must not block steering gestures');
    assert.ok(!overlaps(portrait.discovery, portrait.map), 'Discovery must not cover map');
    assert.ok(!overlaps(portrait.discovery, portrait.speedo), 'Discovery must not cover speedometer');
    if (portrait.waypoint) {
      assert.ok(!overlaps(portrait.discovery, portrait.waypoint), 'Discovery must not cover waypoint');
    }
  }
  await mobile.waitForFunction(() => document.querySelector('.commons-prompt')?.hidden, null,
    { timeout: 10_000 });
  await mobile.getByRole('button', { name: 'Menu', exact: true }).click();
  await mobile.getByRole('button', { name: 'Settings', exact: true }).click();
  const unsupported = await mobile.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    document.dispatchEvent(new Event('fullscreenchange'));
    return {
      buttonHidden: document.querySelector('.menu__fullscreen').hidden,
      hintShown: !document.querySelector('.menu__fullscreenHint').hidden,
    };
  });
  assert.deepEqual(unsupported, { buttonHidden: true, hintShown: true },
    'Unsupported browsers should offer the Home Screen route');

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await desktop.goto(url);
  await desktop.locator('.start__button').waitFor({ state: 'visible', timeout: 180_000 });
  await desktop.locator('.start__button').click();
  assert.equal(await desktop.evaluate(() => Boolean(document.fullscreenElement)), true,
    'Play should request fullscreen on desktop');
  await desktop.keyboard.press('F11');
  await desktop.waitForFunction(() => !document.fullscreenElement);
  console.log('Fullscreen entry and F11 exit passed.');
} finally {
  await browser.close();
}
