import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Exercise the already-built Brotli sidecars, as a static production host would.
// No application files or assets are transformed by this test.
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const name = pathname.replace(/^\/japanMap\//, '') || 'index.html';
    const file = resolve(root, name);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let served = file;
    if (request.headers['accept-encoding']?.includes('br')) {
      try { await stat(file + '.br'); served = file + '.br'; } catch { /* Plain sidecar fallback. */ }
    }
    const data = await readFile(served);
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    response.setHeader('Content-Length', data.length);
    response.setHeader('Vary', 'Accept-Encoding');
    if (served !== file) response.setHeader('Content-Encoding', 'br');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], compressed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (response.headers()['content-encoding'] === 'br') compressed.push(response.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/japanMap/`);
  await page.locator('.start__button').waitFor({ state: 'visible', timeout: 180000 });
  const readyBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((sum, r) => sum + r.encodedBodySize, 0));
  await page.locator('.start__button').click();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.fatal').count(), 0);
  assert.equal(await page.locator('.settlement-prompt').count(), 1);
  assert.ok(compressed.length > 0, 'The browser must receive real compressed responses');
  assert.ok(readyBytes < 18_000_000, `First-load resource bodies exceed 18 MB: ${readyBytes}`);
  assert.deepEqual(errors, []);
  const report = { readyBytes, compressedResponses: compressed.length, errors, note: 'Built assets served with existing Brotli sidecars; excludes HTTP headers and the HTML document.' };
  await writeFile('screenshots/wp5/compressed-boot.json', JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
