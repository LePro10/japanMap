#!/usr/bin/env node
// Tools/sdk-web — the CrazyGames SDK path in the real browser build, and the start-download measurement:
//   * bytes transferred (compressed, as on the wire) from the first request to the first "[Platform] gameplayStart"
//     — what CrazyGames counts for the mobile homepage (≤ 20 MB) — split into our files and others (SDK script)
//   * gameplayStop on Escape (menu), gameplayStart again on Escape
//   node Tools/sdk-web.mjs [--host localhost|127.0.0.1] [--timeout 120] [--gpu] [--param quality=Low] [--stream] [--mem] [--fps] [--probe] [--novsync] [--cpu 4] [--browser webkit] [--logs <regex>] [--dir Builds/Preview] [--shot Captures/x.png]
// localhost runs the real SDK (local environment, needs internet); 127.0.0.1 is our test host without SDK.
// Does not build. Prints one line SDK GREEN/RED with the numbers; exit 1 when red.
import { chromium, webkit } from 'playwright-core';
import { serve } from './serve-web.mjs';
import { join } from 'node:path';
import { ROOT, arg, flag } from './lib/unity.mjs';

const host = arg('host', 'localhost');
const timeoutMs = Number(arg('timeout', 120)) * 1000;
const extra = arg('param', '');
let port = 8094;
let server;
for (;; port++) {
  try { server = await serve(arg('dir', '') ? join(ROOT, arg('dir', '')) : undefined, port, '127.0.0.1'); break; }
  catch (e) { if (e.code !== 'EADDRINUSE' || port > 8099) throw e; }
}
const angle = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan';
// --browser webkit: Safari's engine (CrazyGames: Safari must work). No CDP there: sizes are not measured.
const useWebkit = arg('browser', 'chromium') === 'webkit';
const browser = useWebkit ? await webkit.launch() : await chromium.launch({
  args: flag('gpu')
    ? [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu',
       // --novsync: frames as fast as the GPU goes (the display caps at 60 otherwise; compare costs, not this machine's screen)
       ...(flag('novsync') ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])]
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const MB = (b) => (b / 1e6).toFixed(2);
let red = false;
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on('console', (m) => {
    const text = m.text().split('\n')[0];
    logs.push({ t: Date.now(), text });
    // WebGPU reports broken draws as warnings ("Validation: … invalid") — then the frame is black (Phase 10).
    if (m.type() === 'error' || /^Validation:|\[Invalid /.test(text)) errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(e.message));

  const cdp = useWebkit ? null : await context.newCDPSession(page);
  // --cpu N: CPU N times slower (Chromebook profile: 4).
  if (cdp && Number(arg('cpu', 1)) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(arg('cpu', 1)) });
  // Wire bytes as they arrive (dataReceived chunks, compressed size), each with its time: 'loadingFinished' of the
  // streamed-compiled wasm came after gameplayStart, and a whole 6.7 MB file went uncounted (Phase 10).
  const urls = new Map();
  const done = [];
  if (cdp) {
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
    cdp.on('Network.dataReceived', (e) => done.push({ t: Date.now(), url: urls.get(e.requestId) ?? '', bytes: e.encodedDataLength }));
  }

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
  const query = [extra, flag('probe') ? 'probe=frame' : ''].filter(Boolean).join('&');
  await page.goto(`http://${host}:${port}/${query ? `?${query}` : ''}`, { waitUntil: 'commit' });
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
    red = red || !ok;
    // Later downloads (background content) for the total.
    await page.waitForTimeout(3000);
    if (flag('stream')) {
      // --stream: wait until the background loader has gone quiet (no new "[Content] … in" line for 15 s, at most 4 min),
      // count what arrived, and take a picture of the game as it is then.
      const t1 = Date.now();
      let last = Date.now(), seen = 0;
      while (Date.now() - t1 < 240000 && Date.now() - last < 15000) {
        const n = logs.filter((l) => /\[Content\] (place|world)\/.* in /.test(l.text)).length;
        if (n !== seen) { seen = n; last = Date.now(); }
        await page.waitForTimeout(1000);
      }
      const failed = logs.filter((l) => /\[Content\].*(failed|did not)/.test(l.text)).map((l) => l.text);
      const total = done.filter((d) => d.url.includes(`:${port}/`)).reduce((s, d) => s + d.bytes, 0);
      await page.screenshot({ path: join(ROOT, arg('shot', 'Captures/sdk-web-streamed.png')) });
      console.log(`STREAM ${failed.length ? 'RED' : 'GREEN'} · ${seen} scenes streamed in ${((last - t1) / 1000).toFixed(0)} s · ${MB(total)} MB on the wire in all${failed.length ? ' · ' + failed.slice(0, 3).join(' | ') : ''} · Captures/sdk-web-streamed.png`);
      if (failed.length) red = true;
    }
    const all = done.filter((d) => d.url.includes(`:${port}/`)).reduce((s, d) => s + d.bytes, 0);
    console.log(`SDK ${ok ? 'GREEN' : 'RED'} · ${host} · start download ${MB(ours)} MB ours + ${MB(other)} MB other until gameplayStart ` +
      `(${((start.t - t0) / 1000).toFixed(1)} s) · ours after 3 s more ${MB(all)} MB · menu stop ${stop ? 'yes' : 'NO'} · start again ${again ? 'yes' : 'NO'} · ${platform}` +
      `${errors.length ? ` · ${errors.length} console errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    const per = new Map();
    for (const d of before) per.set(d.url, (per.get(d.url) ?? 0) + d.bytes);
    for (const [url, bytes] of [...per].filter(([, b]) => b > 200000).sort((a, b) => b[1] - a[1]))
      console.log(`  ${MB(bytes).padStart(6)} MB  ${url.replace(/^https?:\/\/[^/]+\//, '')}`);
  }
  // --fps: frame rate over 8 s where Unity renders (requestAnimationFrame), as smoke --gpu does.
  if (flag('fps')) {
    const r = await page.evaluate(() => new Promise((ok) => {
      const t0 = performance.now(); let last = t0, n = 0, worst = 0;
      const tick = (now) => { n++; worst = Math.max(worst, now - last); last = now; if (now - t0 < 8000) requestAnimationFrame(tick); else ok({ fps: n / ((now - t0) / 1000), worst }); };
      requestAnimationFrame(tick);
    }));
    // A run that sits at 55–61 fps with a ~33 ms worst frame was held by the display clock, not by the game
    // (Phase 10: every setting gave either ~57 or ~140 — the 57s were capped). Such a run measures nothing.
    const capped = r.fps > 54 && r.fps < 62 && r.worst > 30;
    console.log(`FPS · ${r.fps.toFixed(0)} fps (worst frame ${r.worst.toFixed(0)} ms)${capped ? ' · CAPPED by the display clock — repeat' : ''}${arg('cpu', '') ? ' · CPU ÷' + arg('cpu', '') : ''}`);
  }
  // --probe: the game reads back its own frame (?probe=frame, DevTools/FrameProbe): something must be drawn.
  if (flag('probe')) {
    const t1 = Date.now();
    let line = null;
    while (!line && Date.now() - t1 < 20000) { line = logs.find((l) => /\[Probe\] frame/.test(l.text)); await page.waitForTimeout(500); }
    const lit = line ? Number(/lit (\d+)%/.exec(line.text)?.[1] ?? 0) : 0;
    if (!line || lit < 5) red = true;
    console.log(`PROBE ${line && lit >= 5 ? 'GREEN' : 'RED'} · ${line ? line.text.replace(/^.*\[Probe\] /, '') : 'no frame read back (build without FrameProbe?)'}`);
  }
  // --mem: memory as the game reports it (template exposes window.unityInstance): WASM heap total/used, JS heap.
  if (flag('mem')) {
    const m = await page.evaluate(() => {
      const i = window.unityInstance;
      const info = i && i.GetMetricsInfo ? i.GetMetricsInfo() : null;
      const pm = performance.memory;
      return { info, js: pm ? pm.usedJSHeapSize : null };
    });
    const f = (b) => (b == null ? '?' : (b / 1048576).toFixed(0) + ' MiB');
    const i = m.info || {};
    console.log(`MEM · WASM heap ${f(i.totalWASMHeapSize)} (used ${f(i.usedWASMHeapSize)}) · JS heap ${f(m.js)}` +
      `${i.totalWASMHeapSize ? '' : ' · no metrics (old template?)'}`);
  }
  // --logs <regex>: the console lines that match, after the run (e.g. --logs "Content|Exception").
  const pattern = arg('logs', '');
  if (pattern) for (const l of logs.filter((l) => new RegExp(pattern).test(l.text)).slice(0, 60)) console.log('  log ' + l.text);
  await context.close();
} finally {
  await browser.close();
  server.close();
}
process.exit(red ? 1 : 0);
