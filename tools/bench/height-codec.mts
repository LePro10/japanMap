import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { encodeHeightmap } from '../pack-heightmap.mjs';
import { decodeHeightmap } from '../../src/world/heightCodec.ts';

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;
for (const res of [2, 16, 256]) {
  const raw = Buffer.alloc(res * res * 2);
  for (let i = 0; i < res * res; i++) raw.writeUInt16LE((i * 1777 + (i % 3) * 65535) & 65535, i * 2);
  const packed = encodeHeightmap(raw, res);
  assert.deepEqual(Buffer.from((await decodeHeightmap(arrayBuffer(packed), res)).buffer), raw);
  await assert.rejects(decodeHeightmap(arrayBuffer(packed), res + 1), /resolution/);
  await assert.rejects(decodeHeightmap(arrayBuffer(packed.subarray(0, 10)), res), /header/);
  const corrupt = Buffer.from(packed); corrupt[corrupt.length - 3]! ^= 127;
  await assert.rejects(decodeHeightmap(arrayBuffer(corrupt), res));
  const checksum = Buffer.from(packed); checksum[8]! ^= 1;
  await assert.rejects(decodeHeightmap(arrayBuffer(checksum), res), /checksum/);
}
const raw = fs.readFileSync('assets/generated/terrain/height.r16');
const res = Math.sqrt(raw.length / 2), packed = encodeHeightmap(raw, res);
const start = performance.now();
assert.deepEqual(Buffer.from((await decodeHeightmap(arrayBuffer(packed), res)).buffer), raw);
const decodeMs = performance.now() - start;
const oldTransfer = gzipSync(raw).length;
assert.ok(packed.length < oldTransfer * .7, 'lossless height transfer must improve materially');
console.log(JSON.stringify({ samples: res * res, bitExact: true, gzipRaw: oldTransfer,
  packed: packed.length, saved: oldTransfer - packed.length, decodeMs }));
