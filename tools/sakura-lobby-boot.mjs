import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5197/japanMap/';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.japanMap?.quality, null, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('low'));
  await page.locator('.start__button').click();
  await page.waitForFunction(() => window.japanMap.walk());
  await page.waitForTimeout(800);
  const spawn = await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    const c = window.japanMap.engine.systems.find(s => s.name === 'SakuraCommons');
    return {
      range: d.vehicleRange(),
      walking: d.walking,
      prompt: c.prompt.textContent,
      lobby: !!c.group.children.length,
    };
  });
  assert.ok(Math.abs(spawn.range - 4) < 0.3, JSON.stringify(spawn));
  assert.match(spawn.prompt, /Your car. Take it out./);
  await fs.mkdir('screenshots/lobby', { recursive: true });
  await page.screenshot({ path: 'screenshots/lobby/opening.png' });

  await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    const c = window.japanMap.engine.systems.find(s => s.name === 'SakuraCommons');
    d.ground.refresh(528, 480, 0);
    d.walker.respawn(528, 480, Math.PI, d);
    d.walkCamera.reset(d.walker);
    for (let i = 0; i < 8; i++) c.update(1 / 60);
  });
  await page.screenshot({ path: 'screenshots/lobby/showroom.png' });

  const inside = await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    const c = window.japanMap.engine.systems.find(s => s.name === 'SakuraCommons');
    d.ground.refresh(519.2, 477.3, 0);
    d.walker.respawn(519.2, 477.3, Math.PI / 2, d);
    d.walkCamera.reset(d.walker);
    for (let i = 0; i < 12; i++) c.update(1 / 60);
    return {
      button: document.querySelector('.commons-prompt button')?.textContent,
      prompt: c.prompt.textContent,
      x: d.walker.position.x,
      z: d.walker.position.z,
      y: d.walker.position.y,
      floor: d.height(d.walker.position.x, d.walker.position.z),
    };
  });
  console.log('At pad:', inside);
  assert.match(inside.button ?? '', /Buy|Select|Need Sparks|Selected/);
  await page.screenshot({ path: 'screenshots/lobby/pad.png' });

  await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    d.ground.refresh(572, 485, 0);
    d.walker.respawn(572, 485, Math.PI, d);
    d.walkCamera.reset(d.walker);
  });
  await page.waitForFunction(() => document.querySelector('.commons-prompt button')?.textContent === 'Enter Tune');
  await page.screenshot({ path: 'screenshots/lobby/open-bay.png' });

  await page.evaluate(() => {
    const d = window.japanMap.engine.systems.find(s => s.name === 'DriveSystem');
    d.ground.refresh(528, 485, 0);
    d.walker.respawn(528, 485, Math.PI, d);
    d.walkCamera.reset(d.walker);
  });
  await page.waitForFunction(() => document.querySelector('.commons-prompt button')?.textContent === 'Enter Cars');
  await page.screenshot({ path: 'screenshots/lobby/petal-door.png' });

  const consoleErrors = errors.filter(m => !/PropSystem/.test(m));
  assert.deepEqual(consoleErrors, []);
  console.log('Sakura lobby boot: spawn, showroom pad, both doorways.');
} finally {
  await browser.close();
}
