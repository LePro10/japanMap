#!/usr/bin/env node
// Cut a region out of a screenshot (HUD close-ups: minimap, instrument), optionally scaled:
//   node Tools/crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]     (pixels, top-left origin)
import sharp from 'sharp';
const [src, dst, x, y, w, h, scale = '1'] = process.argv.slice(2);
if (!h) { console.error('usage: node Tools/crop.mjs in.png out.png x y w h [scale]'); process.exit(2); }
const img = sharp(src).extract({ left: +x, top: +y, width: +w, height: +h });
await (scale !== '1' ? img.resize(Math.round(+w * +scale)) : img).toFile(dst);
console.log(`CROP OK · ${dst}`);
