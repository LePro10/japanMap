import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5180/japanMap/');
  await page.waitForFunction(() => window.japanMap?.quality, null, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('low'));
  await page.locator('.start__button').click();
  await page.waitForFunction(() => window.japanMap.walk());
  await page.waitForTimeout(1200);
  const spawn = await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    return { range: d.vehicleRange(), x: d.vehicle.position.x - d.walker.position.x, z: d.vehicle.position.z - d.walker.position.z };
  });
  assert.ok(Math.abs(spawn.range - 4) < 0.2, JSON.stringify(spawn));
  assert.ok(Math.abs(spawn.z + 4) < 0.2);
  assert.match(await page.locator('.commons-prompt').innerText(), /Your car. Take it out./);
  await fs.mkdir('screenshots/wp2', { recursive: true });
  await page.screenshot({ path: 'screenshots/wp2/opening.png' });
  if (!process.argv.includes('--shops-only')) {
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => window.japanMap.drive()), true);
  await page.keyboard.down('w');
  await page.waitForFunction(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    return Math.hypot(d.vehicle.position.x - 550, d.vehicle.position.z - 510) > 70;
  }, null, { timeout: 120000 });
  await page.keyboard.up('w');
  const driveOut = await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    return { distance: Math.hypot(d.vehicle.position.x - 550, d.vehicle.position.z - 510), y: d.vehicle.position.y, ground: d.height(d.vehicle.position.x, d.vehicle.position.z) };
  });
  console.log('Drive out:', driveOut);
  assert.ok(driveOut.distance > 62, 'Must drive beyond the bowl');
  assert.ok(driveOut.y > driveOut.ground - 1, 'Car stays above ground');
  await page.screenshot({ path: 'screenshots/wp2/drive-out.png' });
  const called = await page.evaluate(async () => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    d.startOnFoot(1);
    d.placeAt(650, 510, 0);
    const { callPlayerCar } = await import('/japanMap/src/ui/callPlayerCar.ts');
    return { text: callPlayerCar(d), range: d.vehicleRange(), walking: d.walking };
  });
  console.log('Call car:', called);
  assert.match(called.text, /parked/);
  assert.ok(called.range < 45 && called.walking);
  }
  await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    d.ground.refresh(572, 485, 0);
    d.walker.respawn(572, 485, Math.PI, d);
    d.walkCamera.reset(d.walker);
  });
  await page.waitForFunction(() => document.querySelector('.commons-prompt button').textContent === 'Enter Tune');
  await page.keyboard.press('Enter');
  await page.locator('[data-panel="cars"]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-panel="cars"] .menu__note').innerText(), /Open Bay/);
  await page.locator('[data-panel="cars"] .menu__note').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/wp2/tune.png' });
  await page.locator('.menu__resume').click();
  await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    d.ground.refresh(528, 485, 0);
    d.walker.respawn(528, 485, Math.PI, d);
    d.walkCamera.reset(d.walker);
  });
  await page.waitForFunction(() => document.querySelector('.commons-prompt button').textContent === 'Enter Cars');
  await page.keyboard.press('Enter');
  await page.locator('[data-panel="cars"]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-panel="cars"] .menu__note').innerText(), /Petal Motors/);
  await page.locator('.menu__resume').click();
  const practice = await page.evaluate(() => {
    const systems = window.japanMap.engine.systems;
    const d = systems.find(s => s.name === 'DriveSystem');
    const c = systems.find(s => s.name === 'SakuraCommons');
    d.startOnFoot(1); d.board();
    for (const marker of c.markers) {
      d.placeAt(marker.position.x, marker.position.z, 0);
      c.update(1 / 60);
    }
    return { cleared: c.markers.every(m => !m.visible), text: c.prompt.textContent, race: d.race.state };
  });
  assert.equal(practice.cleared, true);
  assert.equal(practice.race, 'idle');
  assert.match(practice.text, /Practice complete/);
  assert.deepEqual(errors, []);
  console.log(process.argv.includes('--shops-only')
    ? 'WP2: spawn, both doorways and optional practice passed.'
    : 'WP2: spawn, enter, drive out, call car, both doorways and optional practice passed.');
} finally { await browser.close(); }
