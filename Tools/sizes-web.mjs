#!/usr/bin/env node
// Tools/sizes-web — the build at CrazyGames' check sizes, device pixel ratio 1 (their readability rule): desktop
// 907×510, 1216×684, 1280×720, 1920×1080; mobile 800×450; tablet 1080×607 — plus a tablet held upright (820×1180;
// the map squeezed its card there, Phase 11). Per size a picture of the HUD, the menu (Escape) and the map page (M),
// then one montage. Real path: the page loads, the game starts, Escape opens the menu.
// Plus real phones (2026-10-11: at DPR 1 everything looked fine while the human's Android showed the HUD 1.3x too big and
// stacked): Android 800x360 at DPR 2.625 and iPhone 844x390 at DPR 3 (the page draws iOS at 1), touch and mobile UA.
// Every size runs with ?uicheck=1: the game reports HUD parts that cover each other or leave the screen.
//   node Tools/sizes-web.mjs [--sizes 907x510,800x450] [--phones android,iphone,android-up|none] [--out Captures/p11-sizes]   (does not build)
// Prints SIZES GREEN/RED (red: no gameplayStart, a console error, the menu did not open, or HUD parts overlap).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve-web.mjs';
import { ROOT, arg } from './lib/unity.mjs';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PHONES = {
  android: { w: 800, h: 360, dpr: 2.625, ua: ANDROID },
  iphone: { w: 844, h: 390, dpr: 3, ua: IPHONE },
  'android-up': { w: 360, h: 800, dpr: 2.625, ua: ANDROID },
};
const sizes = arg('sizes', '907x510,1216x684,1280x720,1920x1080,800x450,1080x607,820x1180').split(',').filter(Boolean)
  .map((s) => { const [w, h] = s.split('x').map(Number); return { name: `${w}x${h}`, w, h, dpr: 1 }; });
for (const id of arg('phones', 'android,iphone,android-up').split(',')) if (PHONES[id]) sizes.push({ name: id, ...PHONES[id], phone: true });
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
  for (const { name, w, h, dpr, ua, phone } of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr,
      ...(phone ? { isMobile: true, hasTouch: true, userAgent: ua } : {}) });
    const page = await ctx.newPage();
    const logs = [];
    const errors = [];
    page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?uicheck=1`);
    const t0 = Date.now();
    while (!logs.some((l) => /\[Platform\] gameplayStart/.test(l)) && Date.now() - t0 < 60000) await page.waitForTimeout(250);
    const started = logs.some((l) => /\[Platform\] gameplayStart/.test(l));
    await page.waitForTimeout(4000); // first content and the HUD's first layout
    for (const t0b = Date.now(); !logs.some((l) => l.startsWith('[UiCheck]')) && Date.now() - t0b < 5000;) await page.waitForTimeout(250);
    const uiCheck = logs.find((l) => l.startsWith('[UiCheck]')) ?? '[UiCheck] no report';
    const hud = join(out, `${name}-hud.png`);
    await page.screenshot({ path: hud });
    await page.evaluate(() => { const c = document.querySelector('canvas'); c.tabIndex = 1; c.focus(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const menuOpen = logs.some((l) => /\[Platform\] gameplayStop/.test(l));
    const menu = join(out, `${name}-menu.png`);
    await page.screenshot({ path: menu });
    await page.keyboard.press('m');
    await page.waitForTimeout(1200);
    const map = join(out, `${name}-map.png`);
    await page.screenshot({ path: map });
    shots.push(hud, menu, map);
    const clean = / · clean$/.test(uiCheck);
    const ok = started && menuOpen && errors.length === 0 && clean;
    red ||= !ok;
    console.log(`  ${name} (${w}x${h} @${dpr}) · ${started ? 'started' : 'NO START'} · menu ${menuOpen ? 'open' : 'NOT OPEN'} · ${errors.length} errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
    console.log(`    ${uiCheck.replace(/^\[UiCheck\] /, 'HUD ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
const montage = join(out, 'sizes.png');
execFileSync('node', [join(ROOT, 'Tools/montage.mjs'), '--out', montage, ...shots], { stdio: 'ignore' });
console.log(`SIZES ${red ? 'RED' : 'GREEN'} · ${sizes.length} sizes (desktop DPR 1 + phones) · ${montage}`);
process.exit(red ? 1 : 0);
