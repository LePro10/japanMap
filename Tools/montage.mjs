// Tools/montage — put several images side by side in one labelled PNG (for before/after and
// new-vs-legacy comparisons), so one small image is looked at instead of many large ones.
//   node Tools/montage.mjs --out Captures/cmp.png [--cols 2] [--width 480] a.png b.png …
// A label is the file name; give "label=path" to set one.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { ROOT, arg } from './lib/unity.mjs';

const out = join(ROOT, arg('out', 'Captures/montage.png'));
const cols = Number(arg('cols', 2));
const width = Number(arg('width', 480));
const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
if (!files.length) { console.log('MONTAGE: no images given'); process.exit(1); }

const cells = files.map((f) => {
  const [label, path] = f.includes('=') ? f.split('=') : [basename(f, extname(f)), f];
  const mime = extname(path).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png';
  const data = readFileSync(resolve(ROOT, path)).toString('base64');
  return `<figure><img src="data:${mime};base64,${data}"><figcaption>${label}</figcaption></figure>`;
});
const html = `<style>body{margin:0;background:#222;font:13px sans-serif;color:#eee}
main{display:grid;grid-template-columns:repeat(${cols},${width}px);gap:4px;padding:4px;width:max-content}
figure{margin:0}img{width:${width}px;display:block}figcaption{padding:2px 4px}</style><main>${cells.join('')}</main>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: cols * (width + 4) + 4, height: 200 } });
  await page.setContent(html, { waitUntil: 'load' });
  mkdirSync(dirname(out), { recursive: true });
  await page.locator('main').screenshot({ path: out });
} finally { await browser.close(); }
console.log(`MONTAGE OK · ${files.length} images · ${out}`);
