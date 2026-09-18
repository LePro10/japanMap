import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * One-off cockpit stills: load the isolate server, enter drive, seat camera,
 * shoot Kite / Ember / Needle. Swiftshader — look at composition, not GPU time.
 */
const url = process.argv[2] ?? 'http://127.0.0.1:5190/japanMap/';
const HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const browser = await chromium.launch({
  executablePath: existsSync(HEADLESS_SHELL) ? HEADLESS_SHELL : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => console.error('pageerror', error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('console', msg.text());
});

await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
await page.waitForFunction(() => document.querySelector('.start__button'), undefined, { timeout: 120_000 });
await page.evaluate(() => document.querySelector('.start__button')?.click());
await page.waitForFunction(() => typeof window.japanMap?.drive === 'function', undefined, { timeout: 60_000 });
await page.evaluate(() => {
  window.japanMap.engine.resize(1280, 720);
});
await page.waitForFunction(() => {
  const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
  return !!(drive && drive.roads && drive.terrain);
}, undefined, { timeout: 120_000 });

const names = await page.evaluate(async () => {
  const api = window.japanMap;
  const drive = api.engine.systems.find((s) => s.name === 'DriveSystem');
  const fly = api.engine.systems.find((s) => s.name === 'FreeFlyController');
  const menu = document.querySelector('.menu');
  if (menu && !menu.hidden) {
    const resume = document.querySelector('[data-menu="resume"], .menu__resume, .menu button');
    if (resume instanceof HTMLElement) resume.click();
  }
  drive.setPaused(false);
  fly?.setEnabled(false);
  const entered = api.drive(true);
  drive.setPaused(false);
  fly?.setEnabled(false);
  if (!drive.active) {
    throw new Error(`drive.enter failed (entered=${entered}, roads=${!!drive.roads})`);
  }
  const line = drive.roads.getRacingLine('ring');
  const heading = Math.atan2(line[3] - line[0], line[5] - line[2]);
  const ids = ['touge', 'gt', 'needle'];
  const out = [];
  for (const id of ids) {
    drive.setVehicle(id);
    drive.placeAt(line[0], line[2], heading);
    if (drive.camera.mode !== 'cockpit') drive.toggleView();
    drive.setPaused(false);
    fly?.setEnabled(false);
    drive.camera.reset(drive.vehicle);
    for (let i = 0; i < 12; i++) {
      drive.simulateStep(1 / 60, { throttle: 0.4, brake: 0, steer: 0, handbrake: false });
      drive.camera.update(1 / 60, drive.vehicle, drive, api.engine.camera);
      drive.update(1 / 60);
    }
    drive.camera.update(1 / 60, drive.vehicle, drive, api.engine.camera);
    const fovBefore = api.engine.camera.fov;
    const nearBefore = api.engine.camera.near;
    const path = await api.shot(`cockpit-${id}`);
    const probe = api.probe();
    const cam = api.engine.camera;
    const e = cam.matrixWorld.elements;
    const look = { x: -e[8], y: -e[9], z: -e[10] };
    const yaw = drive.vehicle.yaw;
    const carF = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    out.push({
      id,
      path,
      mode: drive.camera.mode,
      fovBefore,
      nearBefore,
      fov: cam.fov,
      near: cam.near,
      share: probe.anteilNichtSchwarz,
      look,
      carF,
      align: look.x * carF.x + look.z * carF.z,
      active: drive.active,
    });
  }
  return out;
});

console.log(JSON.stringify(names, null, 2));
await browser.close();
