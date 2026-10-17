#!/usr/bin/env node
// Tools/save-web — the save in the real browser build: fresh browser profile, play a little (walk → region
// explored → saved), reload the page, check the progress came back. Runs once per host:
//   127.0.0.1  → whitelisted for the CrazyGames site lock: saves on this device (PlayerPrefs / IndexedDB)
//   localhost  → CrazyGames SDK path (loads sdk.crazygames.com, needs internet): saves with the data module
//   node Tools/save-web.mjs [--hosts 127.0.0.1,localhost] [--timeout 90]
// Does not build: run node Tools/build-web.mjs (or the menu) first. Prints one line per host, GREEN/RED.
import { chromium } from 'playwright-core';
import { serve } from './serve-web.mjs';
import { arg } from './lib/unity.mjs';

const hosts = arg('hosts', '127.0.0.1,localhost').split(',');
const timeoutMs = Number(arg('timeout', 90)) * 1000;
let port = 8093;
let server;
for (;; port++) {
  try { server = await serve(undefined, port, '127.0.0.1'); break; }
  catch (e) { if (e.code !== 'EADDRINUSE' || port > 8099) throw e; }
}

async function waitFor(logs, re, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = logs.find((l) => re.test(l));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

let red = false;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const host of hosts) {
    const context = await browser.newContext({ viewport: { width: 800, height: 560 } }); // empty storage
    const page = await context.newPage();
    let logs = [];
    const errors = [];
    page.on('console', (m) => { logs.push(m.text().split('\n')[0]); if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    const url = `http://${host}:${port}/?title=off`; // straight into the game (the title waits for a click, D48)
    const fail = (why) => { red = true; console.log(`SAVE RED · ${host} · ${why}${errors.length ? ' · errors: ' + errors.slice(0, 3).join(' | ') : ''}`); };

    await page.goto(url);
    const first = await waitFor(logs, /\[Save\] progress from/, timeoutMs);
    if (!first) { fail('no "[Save] progress from" — did the game boot?'); await context.close(); continue; }
    const store = /\((.*?)\)/.exec(first)?.[1] ?? '?';
    if (!/from Fresh/.test(first)) { fail(`first visit not fresh: ${first}`); await context.close(); continue; }
    // Walk: the region watch needs 1.5 s and 4 m on the ground (game starts on foot at Sakura Commons).
    await page.waitForTimeout(1500);
    // No click: in headless Chromium a click starts the walk camera's pointer lock, which fails there and
    // swallows the keys. Keyboard focus on the canvas, as a real click gives it (headless Chromium does not focus a canvas
    // without tabindex; the CrazyGames SDK did this itself where it runs).
    await page.bringToFront(); // headless: otherwise document.hasFocus() is false and the Input System drops keys
    await page.evaluate(() => { const c = document.querySelector('canvas'); c.tabIndex = 1; c.focus(); });
    // Hold D until the region pays (software GL runs slowly: the walk takes longer in wall time), at most 30 s.
    await page.keyboard.down('d');
    let saved = await waitFor(logs, /\[Save\] saved #\d+ .* 1 regions/, 30000);
    await page.keyboard.up('d');
    // Without the SDK (127.0.0.1) headless Chromium's keys never reached the game (three tries, Phase 8):
    // then only the boot save is checked — that it survives the reload on this device.
    const regionChecked = !!saved;
    if (!saved) saved = logs.find((l) => /\[Save\] saved #\d+/.test(l));
    if (!saved) { fail('nothing was saved'); await context.close(); continue; }
    await page.waitForTimeout(1500); // the CrazyGames data module debounces writes by 1 s

    logs = [];
    await page.reload({ waitUntil: 'commit' }); // a full 'load' wait timed out once on the 48 MB data file
    const again = await waitFor(logs, /\[Save\] progress from/, timeoutMs);
    if (!again || !/from Saved/.test(again) || (regionChecked && !/1 regions/.test(again))) { fail(`after reload: ${again ?? 'no load line'}`); await context.close(); continue; }
    const mode = logs.find((l) => l.includes('[Platform]')) ?? '';
    console.log(`SAVE GREEN${regionChecked ? '' : ' (boot save only — keys did not reach the game headless)'} · ${host} · store "${store}" · before reload: ${saved.replace(/^.*\[Save\] /, '')} · after: ${again.replace(/^.*\[Save\] /, '')}${mode ? ' · ' + mode.replace(/^.*\[Platform\] /, '') : ''}${errors.length ? ` · ${errors.length} console errors: ${errors[0]}` : ''}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(red ? 1 : 0);
