#!/usr/bin/env node
// Tools/data-sizes — what the start download (Build/Web.data) is made of, as it travels: unpacks the Brotli file,
// splits Unity's data container into its files (scene, shared assets, resource streams, built-in resources) and
// compresses each one again — the wire size per file. The build report's uncompressed sizes mislead here (the
// 2.7 MB splash logo was 0.01 MB on the wire, Phase 10).
//   node Tools/data-sizes.mjs [Builds/Web/Build/Web.data.unityweb]
import { readFileSync } from 'node:fs';
import { brotliDecompressSync, brotliCompressSync, constants } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from './lib/unity.mjs';

const file = process.argv[2] ?? join(ROOT, 'Builds/Web/Build/Web.data.unityweb');
let buf = readFileSync(file);
try { buf = brotliDecompressSync(buf); } catch { /* not compressed */ }
const magic = 'UnityWebData1.0\0';
if (buf.toString('latin1', 0, magic.length) !== magic) { console.error('not a UnityWebData container'); process.exit(1); }
const headerSize = buf.readUInt32LE(magic.length);
const files = [];
for (let p = magic.length + 4; p < headerSize;) {
  const offset = buf.readUInt32LE(p), size = buf.readUInt32LE(p + 4), nameLen = buf.readUInt32LE(p + 8);
  files.push({ name: buf.toString('utf8', p + 12, p + 12 + nameLen), offset, size });
  p += 12 + nameLen;
}
const MB = (b) => (b / 1e6).toFixed(2).padStart(7);
let raw = 0, wire = 0;
const rows = files.map((f) => {
  const body = buf.subarray(f.offset, f.offset + f.size);
  const c = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } }).length;
  raw += f.size; wire += c;
  return { ...f, c };
}).sort((a, b) => b.c - a.c);
console.log(`DATA ${MB(raw)} MB raw · ${MB(wire)} MB compressed (estimate, Brotli 9) · ${files.length} files`);
for (const r of rows.slice(0, 25)) console.log(`${MB(r.c)} MB wire  ${MB(r.size)} MB raw  ${r.name}`);
