// Tools/smoke — serve Builds/Web, load it in headless Chromium, read the console, take a picture.
//   node Tools/smoke.mjs [--timeout 60] [--out Captures/web-smoke.png]
// Green when: the page loads, Unity reports "[Boot] … systems up" (the Bootstrapper finished),
// no console errors, no page errors, no failed requests.
// Runs on SwiftShader (software GL): frame rate here says nothing about real hardware.
// Setup once: (cd Tools && npm install && npx playwright install chromium-headless-shell)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serve } from './serve-web.mjs';
import { ROOT, arg } from './lib/unity.mjs';

const timeoutMs = Number(arg('timeout', 60)) * 1000;
const out = join(ROOT, arg('out', 'Captures/web-smoke.png'));
const port = 8091;

const server = await serve(undefined, port);
const errors = [];
const logs = [];
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
  page.on('console', (m) => {
    const text = m.text();
    logs.push(text);
    if (m.type() === 'error') errors.push(`console: ${text}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    // Unity's loader aborts the streaming fetch of br files on purpose and decompresses itself.
    if (why === 'net::ERR_ABORTED' && r.url().endsWith('.unityweb')) return;
    errors.push(`request failed: ${r.url()} ${why}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('dialog', (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/`);
  let bootMs = null;
  while (Date.now() - t0 < timeoutMs) {
    if (logs.some((l) => l.includes('[Boot]'))) { bootMs = Date.now() - t0; break; }
    if (errors.length) break;
    await page.waitForTimeout(250);
  }
  // A few seconds of runtime to catch errors that only appear after the first frames.
  if (bootMs !== null) {
    await page.waitForTimeout(2000);
    // F1 shows the stats overlay in development builds (release builds ignore it).
    await page.locator('canvas').first().click();
    await page.keyboard.press('F1');
    await page.waitForTimeout(1000);
  }
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });

  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const d = c?.getExtension('WEBGL_debug_renderer_info');
    return c ? c.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no webgl2';
  });
  const green = bootMs !== null && errors.length === 0;
  console.log(`SMOKE ${green ? 'GREEN' : 'RED'} · boot ${bootMs === null ? 'not reached' : (bootMs / 1000).toFixed(1) + ' s'} · console errors ${errors.length} · ${gl} · ${out}`);
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
  const bootLine = logs.find((l) => l.includes('[Boot]'));
  if (bootLine) console.log('  ' + bootLine);
  process.exitCode = green ? 0 : 1;
} finally {
  await browser?.close();
  server.close();
}
