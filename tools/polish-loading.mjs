import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const legacy of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (legacy) await page.addInitScript(() => Object.defineProperty(globalThis, 'DecompressionStream', { value: undefined }));
    await page.goto('http://127.0.0.1:5181/japanMap/');
    await page.locator('.start__button').waitFor({ state: 'visible', timeout: 180000 });
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => ({
      file: r.name.split('/').pop(), encoded: r.encodedBodySize, transfer: r.transferSize,
    })));
    const packed = resources.filter(r => /height-.*\.h16$/.test(r.file));
    const raw = resources.filter(r => /height-.*\.r16$/.test(r.file));
    assert.equal(packed.length, legacy ? 0 : 1, 'packed heightmap requested only with decoder support');
    assert.equal(raw.length, legacy ? 1 : 0, 'raw fallback must not be eagerly downloaded');
    const transfer = resources.reduce((sum, r) => sum + r.transfer, 0);
    if (!legacy) assert.ok(transfer < 16000000, `phone cold load ${transfer} exceeds 16 MB`);
    assert.deepEqual(errors, []);
    results.push({ legacy, transfer, resources, errors });
    await page.close();
  }
  assert.ok(results[1].transfer - results[0].transfer > 2000000, 'lossless codec saves over 2 MB in actual loading');
  await fs.mkdir('screenshots/remote-integration', { recursive: true });
  await fs.writeFile('screenshots/remote-integration/loading.json', JSON.stringify(results, null, 2));
  console.log('Production packed/fallback boot passed.', results.map(({ legacy, transfer }) => ({ legacy, transfer })));
} finally { await browser.close(); }
