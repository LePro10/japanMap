// Tools/smoke — serve Builds/Web, load it in headless Chromium, read the console, take a picture.
//   node Tools/smoke.mjs [--timeout 60] [--out Captures/web-smoke.png] [--gpu] [--quality Low|Medium|High]
// --gpu: real GPU (macOS: Metal) instead of SwiftShader, no vsync, and a 5 s frame-rate
// measurement (rAF = Unity frames). Numbers are for THIS machine only, never for phones.
// Green when: the page loads, Unity reports "[Boot] … systems up" (the Bootstrapper finished),
// no console errors, no page errors, no failed requests.
// Default runs on SwiftShader (software GL): frame rate there says nothing about real hardware.
// Setup once: (cd Tools && npm install && npx playwright install chromium-headless-shell)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serve } from './serve-web.mjs';
import { ROOT, arg, flag } from './lib/unity.mjs';

const timeoutMs = Number(arg('timeout', 60)) * 1000;
const out = join(ROOT, arg('out', 'Captures/web-smoke.png'));
// 8091, or the next free port: a human's preview server once held 8091 and the smoke crashed (EADDRINUSE).
let port = 8091;
const quality = arg('quality', '');
const extra = arg('param', '');

let server;
for (;; port++) {
  try { server = await serve(undefined, port); break; }
  catch (e) { if (e.code !== 'EADDRINUSE' || port > 8099) throw e; }
}
const errors = [];
const logs = [];
let browser;
try {
  const gpu = flag('gpu');
  const angle = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan';
  browser = await chromium.launch({
    args: gpu
      ? [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
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
  const query = [quality ? `quality=${quality}` : '', extra].filter(Boolean).join('&');
  await page.goto(`http://127.0.0.1:${port}/${query ? `?${query}` : ''}`);
  let bootMs = null;
  while (Date.now() - t0 < timeoutMs) {
    if (logs.some((l) => l.includes('[Boot]'))) { bootMs = Date.now() - t0; break; }
    if (errors.length) break;
    await page.waitForTimeout(250);
  }
  // A few seconds of runtime to catch errors that only appear after the first frames — with the title (D48): it
  // must stand and the page's loading screen must go; then Enter starts the game (headless keys may not arrive).
  let title = '';
  if (bootMs !== null) {
    await page.waitForTimeout(2000);
    if (!extra.includes('title=off')) {
      for (const t1 = Date.now(); !logs.some((l) => l.includes('[Title] shown')) && Date.now() - t1 < 30000;) await page.waitForTimeout(250);
      title = logs.some((l) => l.includes('[Title] shown')) ? (logs.some((l) => l.includes('[Page] loaded')) ? ' · title ok' : ' · title shown, page loader stayed') : ' · no title';
      await page.evaluate(() => { const c = document.querySelector('canvas'); c.tabIndex = 1; c.focus(); });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }
    // F1 shows the stats overlay in development builds (release builds ignore it).
    await page.locator('canvas').first().click();
    await page.keyboard.press('F1');
    await page.waitForTimeout(1000);
  }
  let fpsText = '';
  if (gpu && bootMs !== null) {
    // Average and worst frame interval over 5 s, measured where Unity renders: requestAnimationFrame.
    const r = await page.evaluate(() => new Promise((done) => {
      const t0 = performance.now(); let last = t0, n = 0, worst = 0;
      const tick = (now) => {
        n++; worst = Math.max(worst, now - last); last = now;
        if (now - t0 < 5000) requestAnimationFrame(tick); else done({ fps: n / ((now - t0) / 1000), worst });
      };
      requestAnimationFrame(tick);
    }));
    fpsText = ` · ${r.fps.toFixed(0)} fps (worst frame ${r.worst.toFixed(1)} ms)`;
  }
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });

  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const d = c?.getExtension('WEBGL_debug_renderer_info');
    return c ? c.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no webgl2';
  });
  const green = bootMs !== null && errors.length === 0;
  console.log(`SMOKE ${green ? 'GREEN' : 'RED'}${quality ? ' · ' + quality : ''}${extra ? ' · ' + extra : ''} · boot ${bootMs === null ? 'not reached' : (bootMs / 1000).toFixed(1) + ' s'}${title}${fpsText} · console errors ${errors.length} · ${gl} · ${out}`);
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
  const bootLine = logs.find((l) => l.includes('[Boot]'));
  if (bootLine) console.log('  ' + bootLine);
  process.exitCode = green ? 0 : 1;
} finally {
  await browser?.close();
  server.close();
}
