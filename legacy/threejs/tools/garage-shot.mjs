import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.URL ?? 'http://127.0.0.1:5188/japanMap/';
const out = join(process.cwd(), '.cache', 'shots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('console', msg.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'japanmap.profile',
      JSON.stringify({
        yen: 20000,
        owned: ['touge'],
        sandbox: false,
        bestByEvent: {},
        driftByEvent: {},
      }),
    );
    localStorage.removeItem('japanmap.tune.touge');
    localStorage.setItem('japanMap.reducedMotion', 'true');
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.japanMap?.quality, null, { timeout: 180000 });
  await page.evaluate(() => window.japanMap.quality('low'));
  await page.locator('.start__button').waitFor({ state: 'visible', timeout: 180000 });
  await page.locator('.start__button').click({ force: true });
  await page.waitForFunction(() => document.pointerLockElement || document.querySelector('.player-menu'), null, {
    timeout: 60000,
  });
  await page.evaluate(() => document.exitPointerLock?.());
  await page.locator('.player-menu').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: 'Tune Car' }).click();
  const bay = page.locator('.tune-garage');
  await bay.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, 'bay-hero.png') });

  const tools = await page.locator('.tune-garage__tools').count();
  const shots = await page.locator('[data-shot]').count();
  console.log(`tools=${tools} data-shot=${shots}`);

  await page.locator('[data-filter="engine"]').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, 'bay-engine.png') });

  await page.locator('[data-filter="brakes"]').click();
  await page.locator('[data-cat="brakes"][data-tier="2"]').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, 'bay-brakes.png') });

  await page.locator('[data-filter="tyres"]').click();
  await page.locator('[data-cat="tyres"][data-tier="2"]').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, 'bay-sport-wheels.png') });

  await page.locator('[data-filter="setup"]').click();
  await page.locator('[data-setup="dirt"]').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, 'bay-dirt.png') });

  const closed = await page.evaluate(() => {
    const stage = document.querySelector('.tune-garage');
    return {
      open: !!stage,
      isEngine: stage?.classList.contains('is-engine') ?? false,
      tools: document.querySelectorAll('.tune-garage__tools').length,
    };
  });
  console.log(JSON.stringify(closed));
  console.log('shots written to', out);
} finally {
  await browser.close();
}
