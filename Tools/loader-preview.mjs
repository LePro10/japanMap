// Tools/loader-preview — pictures of the page's loading screen (WebGLTemplates/JapanMap/index.html) without a web build:
//   node Tools/loader-preview.mjs [--out Captures/loader] [--template old.html]   → <out>/<form>-<moment>.png for desktop,
//   phone upright, phone on its side (--template: another index.html, e.g. `git show HEAD~1:…/index.html` for before/after)
// The template's tokens are filled in, Unity's loader is a stub that reports progress like a real start (files, then the
// game's boot stages through window.__jmProgress, then __jmLoaded). Only a static page — no game, no GPU load.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { ROOT, arg } from './lib/unity.mjs';

const out = resolve(ROOT, arg('out', 'Captures/loader'));
mkdirSync(out, { recursive: true });
const dir = join(tmpdir(), `jm-loader-${process.pid}`);
mkdirSync(join(dir, 'TemplateData'), { recursive: true });
mkdirSync(join(dir, 'Build'), { recursive: true });
const tpl = join(ROOT, 'Assets/WebGLTemplates/JapanMap');
cpSync(join(tpl, 'TemplateData'), join(dir, 'TemplateData'), { recursive: true, filter: (f) => !f.endsWith('.meta') });
let html = readFileSync(arg('template') ? resolve(arg('template')) : join(tpl, 'index.html'), 'utf8')
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

// Served over http, not file://: fonts load in CORS mode, and a file:// page never gets its web font (the old preview
// showed the fallback face without saying so).
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  try {
    const body = readFileSync(join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    res.writeHead(200, { 'Content-Type': types[extname(req.url.split('?')[0])] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

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
    await page.goto(base + 'index.html');
    const t0 = Date.now();
    for (const [moment, at] of moments) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      const file = join(out, `${name}-${moment}.png`);
      await page.screenshot({ path: file });
      const state = await page.evaluate(() => { const l = document.getElementById('loading'); return `${getComputedStyle(l).display}/${l.querySelector('.pct')?.textContent ?? '-'}/${l.querySelector('.stage')?.textContent ?? '-'}`; });
      shots.push(`${file.replace(ROOT + '/', '')} · ${state}`);
    }
    if (errors.length) shots.push(`  errors (${name}): ${errors.join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
const red = shots.some((s) => s.includes('errors'));
console.log(`LOADER ${red ? 'RED' : 'OK'} · ${shots.length} pictures`);
for (const s of shots) console.log('  ' + s);
process.exit(red ? 1 : 0);
