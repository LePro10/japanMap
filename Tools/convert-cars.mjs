#!/usr/bin/env node
// Car-lab GLBs → Unity-ready GLBs in Assets/_Project/Art/Cars/.
// Why: the car lab exported WebP textures (EXT_texture_webp, *required*); Unity/glTFast cannot decode
// WebP, so the import fails. Textures are re-encoded as PNG (≤ --max px), the extension is dropped.
// Usage: node Tools/convert-cars.mjs [--max 1024] [id …]
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'legacy/threejs/car-lab/models');
const OUT = join(ROOT, 'Assets/_Project/Art/Cars');

const args = process.argv.slice(2);
const maxAt = args.indexOf('--max');
const max = maxAt >= 0 ? Number(args.splice(maxAt, 2)[1]) : 1024;
const ids = args.length ? args : readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => basename(f, '.glb'));

mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let total = 0;
for (const id of ids) {
  const doc = await io.read(join(SRC, `${id}.glb`));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [max, max] }));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_texture_webp') ext.dispose();
  }
  const out = join(OUT, `${id}.glb`);
  await io.write(out, doc);
  const size = statSync(out).size;
  total += size;
  console.log(`${id}: ${(size / 1e6).toFixed(2)} MB, ${doc.getRoot().listTextures().length} textures`);
}
console.log(`CONVERT-CARS OK · ${ids.length} cars · ${(total / 1e6).toFixed(1)} MB`);
