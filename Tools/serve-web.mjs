// Tools/serve-web — serve Builds/Web as static files.
//   node Tools/serve-web.mjs [--port 8090] [--lan]
// Port 8090, not 8080: the Unity MCP listens on 8080. --lan binds 0.0.0.0 for the phone test.
// Decompression Fallback is on, so any server works; br is still sent when accepted (faster start).
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ROOT, arg, flag } from './lib/unity.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.data': 'application/octet-stream', '.unityweb': 'application/octet-stream', '.txt': 'text/plain',
};

export function serve(dir = join(ROOT, 'Builds', 'Web'), port = 8090, host = '127.0.0.1') {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`no build in ${dir} — run node Tools/build-web.mjs`);
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(dir, path || 'index.html');
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': statSync(file).size };
    // Brotli-compressed build files: let the browser decompress natively when it accepts br
    // (as CrazyGames' CDN does); otherwise Unity's decompression fallback takes over.
    if (file.endsWith('.unityweb') && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
      headers['Content-Encoding'] = 'br';
      if (file.includes('.wasm.')) headers['Content-Type'] = 'application/wasm';
      if (file.includes('.framework.js.')) headers['Content-Type'] = 'application/javascript';
    }
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(arg('port', 8090));
  const host = flag('lan') ? '0.0.0.0' : '127.0.0.1';
  await serve(undefined, port, host);
  console.log(`serving Builds/Web on http://127.0.0.1:${port}/`);
  if (flag('lan')) {
    for (const nets of Object.values(networkInterfaces()))
      for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  phone: http://${n.address}:${port}/`);
  }
}
