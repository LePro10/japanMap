#!/usr/bin/env node
// Car-lab GLBs → Unity-ready GLBs in Assets/_Project/Art/Cars/.
// Why: the car lab exported WebP textures (EXT_texture_webp, *required*); Unity/glTFast cannot decode
// WebP, so the import fails. Textures are re-encoded as PNG (≤ --max px), the extension is dropped.
// Usage: node Tools/convert-cars.mjs [--max 1024] [--simplify 0.25] [id …]
// --simplify r: meshoptimizer keeps ≈ r of the triangles of each mesh (welded first, borders locked, small error
// bound) — the start car Hachi had 176 000 vertices = 2.3 MB of the start download (2026-10-13).
// Every conversion also turns inside-out tyres the right way round (Tools/lib/tires.mjs, D52).
// Identical meshes (left front = left rear wheel, calipers: same geometry, same materials) are stored once (D52).
// Nodes, attributes and extras stay (the game finds nodes by name; paint textures need the UVs).
// --fix: only these repairs, in place on the Unity GLBs (keeps their simplification and textures).
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { orientTires, worstTire } from './lib/tires.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'legacy/threejs/car-lab/models');
const OUT = join(ROOT, 'Assets/_Project/Art/Cars');

const args = process.argv.slice(2);
const maxAt = args.indexOf('--max');
const max = maxAt >= 0 ? Number(args.splice(maxAt, 2)[1]) : 1024;
const simpAt = args.indexOf('--simplify');
const ratio = simpAt >= 0 ? Number(args.splice(simpAt, 2)[1]) : 1;
const fixAt = args.indexOf('--fix');
const fixOnly = fixAt >= 0 && args.splice(fixAt, 1).length > 0;
const ids = args.length ? args : readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => basename(f, '.glb'));

// Whole meshes only, and only when their materials match too: gltf-transform's dedup (meshes or just accessors) let
// glTFast give a stock rim the materials of a tuning option (kumo gold lip → chrome, 2026-10-18).
async function share(doc) {
  const key = (mesh) => mesh.listPrimitives().map((p) => [p.getMaterial()?.getName() ?? '',
    ...p.listSemantics().map((s) => s + Buffer.from(p.getAttribute(s).getArray().buffer).toString('base64')),
    Buffer.from(p.getIndices()?.getArray().buffer ?? new ArrayBuffer(0)).toString('base64')].join('|')).join('#');
  const first = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const k = key(mesh);
    if (first.has(k)) node.setMesh(first.get(k)); else first.set(k, mesh);
  }
  await doc.transform(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }));
}

mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let total = 0;
for (const id of ids) {
  const doc = await io.read(join(fixOnly ? OUT : SRC, `${id}.glb`));
  if (fixOnly) {
    const n = orientTires(doc);
    await share(doc);
    await io.write(join(OUT, `${id}.glb`), doc);
    total += statSync(join(OUT, `${id}.glb`)).size;
    console.log(`${id}: ${n} tyre primitives turned outward, worst outward share now ${worstTire(doc).toFixed(2)}`);
    continue;
  }
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [max, max] }));
  const verts = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getAttribute('POSITION').getCount(), 0), 0);
  const before = verts();
  if (ratio < 1) {
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: Number(process.env.SIMPLIFY_ERROR ?? 0.004), lockBorder: true }));
    console.log(`${id}: vertices ${before} → ${verts()}`);
  }
  console.log(`${id}: ${orientTires(doc)} tyre primitives turned outward`);
  await share(doc);
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
