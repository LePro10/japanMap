// Tools/loader-preview — pictures of the page's loading screen (WebGLTemplates/JapanMap/index.html) without a web build:
//   node Tools/loader-preview.mjs [--out Captures/loader]   → <out>/<form>-<moment>.png for desktop, phone upright, phone on its side
// The template's tokens are filled in, Unity's loader is a stub that reports progress like a real start (files, then the
// game's boot stages through window.__jmProgress, then __jmLoaded). Only a static page — no game, no GPU load.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, arg } from './lib/unity.mjs';

const out = resolve(ROOT, arg('out', 'Captures/loader'));
mkdirSync(out, { recursive: true });
const dir = join(tmpdir(), `jm-loader-${process.pid}`);
mkdirSync(join(dir, 'TemplateData'), { recursive: true });
mkdirSync(join(dir, 'Build'), { recursive: true });
const tpl = join(ROOT, 'Assets/WebGLTemplates/JapanMap');
copyFileSync(join(tpl, 'TemplateData/display.ttf'), join(dir, 'TemplateData/display.ttf'));
let html = readFileSync(join(tpl, 'index.html'), 'utf8')
  .replace(/^#if .*$|^#endif.*$/gm, '')
  .replace(/\{\{\{ PRODUCT_NAME\.toUpperCase\(\) \}\}\}/g, 'AMEAGARI DRIVE')
  .replace(/\{\{\{ JSON\.stringify\((\w+)\) \}\}\}/g, '"x"')
  .replace(/\{\{\{ PRODUCT_NAME \}\}\}/g, 'Ameagari Drive')
  .replace(/\{\{\{ (\w+) \}\}\}/g, 'stub.js');
writeFileSync(join(dir, 'index.html'), html);
// Stub loader: Unity's files over 2.4 s, then the boot stages, then "loaded" (the title) at ~5 s.
writeFileSync(join(dir, 'Build/stub.js'), `
window.createUnityInstance = function (canvas, cfg, progress) {
  return new Promise(function (done) {
    var t = 0, iv = setInterval(function () { t += 0.1; progress(Math.min(1, t / 2.4)); if (t >= 2.4) { clearInterval(iv); done({}); } }, 100);
  });
};
setTimeout(function () { window.__jmProgress && window.__jmProgress(0.25, 'Waking the city'); }, 2900);
setTimeout(function () { window.__jmProgress && window.__jmProgress(0.8, 'Bringing your car'); }, 3900);
setTimeout(function () { window.__jmLoaded && window.__jmLoaded(); }, 5200);
`);

const forms = [['desktop', 1280, 720], ['portrait', 390, 844], ['landscape', 844, 390]];
const moments = [['reveal', 600], ['download', 1800], ['boot', 4300], ['gone', 6200]];
const browser = await chromium.launch();
const shots = [];
try {
  for (const [name, w, h] of forms) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/stub|favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto('file://' + join(dir, 'index.html'));
    const t0 = Date.now();
    for (const [moment, at] of moments) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      const file = join(out, `${name}-${moment}.png`);
      await page.screenshot({ path: file });
      const state = await page.evaluate(() => { const l = document.getElementById('loading'); return `${getComputedStyle(l).display}/${l.querySelector('.pct').textContent}/${l.querySelector('.stage').textContent}`; });
      shots.push(`${file.replace(ROOT + '/', '')} · ${state}`);
    }
    if (errors.length) shots.push(`  errors (${name}): ${errors.join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
const red = shots.some((s) => s.includes('errors'));
console.log(`LOADER ${red ? 'RED' : 'OK'} · ${shots.length} pictures`);
for (const s of shots) console.log('  ' + s);
process.exit(red ? 1 : 0);
