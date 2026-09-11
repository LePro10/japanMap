import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

/** Lossless JH16 v1: dimensions/checksum, then deflated split-byte 2D residuals. */
export function encodeHeightmap(raw, resolution) {
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 8192 || raw.length !== resolution ** 2 * 2)
    throw new Error('Invalid heightmap resolution or byte count');
  const count = resolution ** 2, residuals = Buffer.alloc(raw.length);
  let checksum = 2166136261;
  for (let i = 0; i < count; i++) {
    const x = i % resolution, hasRow = i >= resolution;
    const value = raw.readUInt16LE(i * 2);
    const left = x ? raw.readUInt16LE(i * 2 - 2) : 0;
    const up = hasRow ? raw.readUInt16LE((i - resolution) * 2) : 0;
    const corner = x && hasRow ? raw.readUInt16LE((i - resolution - 1) * 2) : 0;
    const delta = (value - left - up + corner) & 65535;
    residuals[i] = delta & 255;
    residuals[count + i] = delta >>> 8;
    checksum = Math.imul(checksum ^ value, 16777619);
  }
  const header = Buffer.alloc(12);
  header.write('JH16');
  header.writeUInt32LE(resolution, 4);
  header.writeUInt32LE(checksum >>> 0, 8);
  return Buffer.concat([header, deflateSync(residuals, { level: 9 })]);
}

export async function packHeightmap() {
  const source = new URL('../assets/generated/terrain/height.r16', import.meta.url);
  const target = new URL('../assets/generated/terrain/height.h16', import.meta.url);
  const raw = await readFile(source);
  const packed = encodeHeightmap(raw, Math.sqrt(raw.length / 2));
  const previous = await readFile(target).catch(() => null);
  if (!previous?.equals(packed)) await writeFile(target, packed);
  console.log(`Lossless terrain: ${(raw.length / 1e6).toFixed(2)} MB raw → ${(packed.length / 1e6).toFixed(2)} MB packed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await packHeightmap();
