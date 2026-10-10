#!/usr/bin/env node
// Tools/sdk-web — the CrazyGames SDK path in the real browser build, and the start-download measurement:
//   * bytes transferred (compressed, as on the wire) from the first request to the first "[Platform] gameplayStart"
//     — what CrazyGames counts for the mobile homepage (≤ 20 MB) — split into our files and others (SDK script)
//   * gameplayStop on Escape (menu), gameplayStart again on Escape
//   node Tools/sdk-web.mjs [--host localhost|127.0.0.1] [--timeout 120] [--gpu] [--param quality=Low]
// localhost runs the real SDK (local environment, needs internet); 127.0.0.1 is our test host without SDK.
// Does not build. Prints one line SDK GREEN/RED with the numbers; exit 1 when red.
import { chromium } from 'playwright-core';
import { serve } from './serve-web.mjs';
import { arg, flag } from './lib/unity.mjs';

const host = arg('host', 'localhost');
const timeoutMs = Number(arg('timeout', 120)) * 1000;
const extra = arg('param', '');
let port = 8094;
let server;
for (;; port++) {
  try { server = await serve(undefined, port, '127.0.0.1'); break; }
  catch (e) { if (e.code !== 'EADDRINUSE' || port > 8099) throw e; }
}
const angle = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan';
const browser = await chromium.launch({
  args: flag('gpu')
    ? [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const MB = (b) => (b / 1e6).toFixed(2);
let red = false;
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on('console', (m) => { logs.push({ t: Date.now(), text: m.text().split('\n')[0] }); if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  page.on('pageerror', (e) => errors.push(e.message));

  // Wire bytes per request (encodedDataLength = compressed size incl. headers), with the time they finished.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const urls = new Map();
  const done = [];
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', (e) => done.push({ t: Date.now(), url: urls.get(e.requestId) ?? '', bytes: e.encodedDataLength }));

  const waitLog = async (re, after, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = logs.find((l) => l.t >= after && re.test(l.text));
      if (hit) return hit;
      await page.waitForTimeout(200);
    }
    return null;
  };

  const t0 = Date.now();
  await page.goto(`http://${host}:${port}/${extra ? `?${extra}` : ''}`, { waitUntil: 'commit' });
  const start = await waitLog(/\[Platform\] gameplayStart/, t0, timeoutMs);
  if (!start) {
    red = true;
    console.log(`SDK RED · ${host} · no gameplayStart within ${timeoutMs / 1000} s${errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''}`);
  } else {
    const before = done.filter((d) => d.t <= start.t);
    const ours = before.filter((d) => d.url.includes(`:${port}/`)).reduce((s, d) => s + d.bytes, 0);
    const other = before.filter((d) => !d.url.includes(`:${port}/`)).reduce((s, d) => s + d.bytes, 0);
    const platform = logs.find((l) => /\[Platform\]/.test(l.text) && !/gameplay/.test(l.text))?.text.replace(/^.*\[Platform\] /, '') ?? 'local';

    // Menu = break. Keys reach the game once the canvas has focus (as a player's click gives it).
    await page.bringToFront();
    await page.evaluate(() => { const c = document.querySelector('canvas'); c.tabIndex = 1; c.focus(); });
    const tEsc = Date.now();
    await page.keyboard.press('Escape');
    const stop = await waitLog(/\[Platform\] gameplayStop/, tEsc, 10000);
    const tEsc2 = Date.now();
    await page.keyboard.press('Escape');
    const again = await waitLog(/\[Platform\] gameplayStart/, tEsc2, 10000);
    const ok = stop && again && errors.length === 0;
    red = !ok;
    // Later downloads (background content) for the total.
    await page.waitForTimeout(3000);
    const all = done.filter((d) => d.url.includes(`:${port}/`)).reduce((s, d) => s + d.bytes, 0);
    console.log(`SDK ${ok ? 'GREEN' : 'RED'} · ${host} · start download ${MB(ours)} MB ours + ${MB(other)} MB other until gameplayStart ` +
      `(${((start.t - t0) / 1000).toFixed(1)} s) · ours after 3 s more ${MB(all)} MB · menu stop ${stop ? 'yes' : 'NO'} · start again ${again ? 'yes' : 'NO'} · ${platform}` +
      `${errors.length ? ` · ${errors.length} console errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    const big = before.filter((d) => d.bytes > 200000).sort((a, b) => b.bytes - a.bytes);
    for (const d of big) console.log(`  ${MB(d.bytes).padStart(6)} MB  ${d.url.replace(/^https?:\/\/[^/]+\//, '')}`);
  }
  await context.close();
} finally {
  await browser.close();
  server.close();
}
process.exit(red ? 1 : 0);
