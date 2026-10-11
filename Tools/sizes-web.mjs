#!/usr/bin/env node
// Tools/sizes-web — the build at CrazyGames' check sizes, device pixel ratio 1 (their readability rule): desktop
// 907×510, 1216×684, 1280×720, 1920×1080; mobile 800×450; tablet 1080×607 — plus a tablet held upright (820×1180;
// the map squeezed its card there, Phase 11). Per size a picture of the HUD, the menu (Escape) and the map page (M),
// then one montage. Real path: the page loads, the game starts, Escape opens the menu.
//   node Tools/sizes-web.mjs [--sizes 907x510,800x450] [--out Captures/p11-sizes]   (does not build)
// Prints SIZES GREEN/RED (red: no gameplayStart, a console error, or the menu did not open).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve-web.mjs';
import { ROOT, arg } from './lib/unity.mjs';

const sizes = arg('sizes', '907x510,1216x684,1280x720,1920x1080,800x450,1080x607,820x1180').split(',').map((s) => s.split('x').map(Number));
const out = join(ROOT, arg('out', 'Captures/p11-sizes'));
mkdirSync(out, { recursive: true });
let port = 8095, server;
for (;; port++) {
  try { server = await serve(undefined, port, '127.0.0.1'); break; } catch (e) { if (e.code !== 'EADDRINUSE' || port > 8099) throw e; }
}
const angle = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan';
const browser = await chromium.launch({ args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const shots = [];
let red = false;
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const logs = [];
    const errors = [];
    page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    const t0 = Date.now();
    while (!logs.some((l) => /\[Platform\] gameplayStart/.test(l)) && Date.now() - t0 < 60000) await page.waitForTimeout(250);
    const started = logs.some((l) => /\[Platform\] gameplayStart/.test(l));
    await page.waitForTimeout(4000); // first content and the HUD's first layout
    const hud = join(out, `${w}x${h}-hud.png`);
    await page.screenshot({ path: hud });
    await page.evaluate(() => { const c = document.querySelector('canvas'); c.tabIndex = 1; c.focus(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const menuOpen = logs.some((l) => /\[Platform\] gameplayStop/.test(l));
    const menu = join(out, `${w}x${h}-menu.png`);
    await page.screenshot({ path: menu });
    await page.keyboard.press('m');
    await page.waitForTimeout(1200);
    const map = join(out, `${w}x${h}-map.png`);
    await page.screenshot({ path: map });
    shots.push(hud, menu, map);
    const ok = started && menuOpen && errors.length === 0;
    red ||= !ok;
    console.log(`  ${w}x${h} · ${started ? 'started' : 'NO START'} · menu ${menuOpen ? 'open' : 'NOT OPEN'} · ${errors.length} errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
const montage = join(out, 'sizes.png');
execFileSync('node', [join(ROOT, 'Tools/montage.mjs'), '--out', montage, ...shots], { stdio: 'ignore' });
console.log(`SIZES ${red ? 'RED' : 'GREEN'} · ${sizes.length} sizes at DPR 1 · ${montage}`);
process.exit(red ? 1 : 0);
