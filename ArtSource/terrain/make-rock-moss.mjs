// Mossy, wet Japanese rock from Poly Haven rock_face_03 (CC0, red sandstone): luminance only, then a cool grey-green.
// The red cliffs read as a desert canyon, not Japan (owner 2026-10-13). Re-run: node ArtSource/terrain/make-rock-moss.mjs
import sharp from '../../Tools/node_modules/sharp/dist/index.mjs';
const src = 'Assets/ThirdParty/PolyHaven/Textures/rock_face_03/rock_face_03_diff.jpg';
const out = 'Assets/_Project/Art/Terrain/rock_moss/rock_moss_diff.jpg';
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const px = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += info.channels) {
  const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  // Dark crevices go moss green, lit faces stay grey stone.
  const moss = Math.max(0, 0.55 - l) * 1.6;
  const r = l * 0.78 * (1 - moss) + l * 0.55 * moss;
  const g = l * 0.80 * (1 - moss) + l * 0.95 * moss;
  const b = l * 0.76 * (1 - moss) + l * 0.50 * moss;
  px[i] = Math.min(255, r * 255); px[i + 1] = Math.min(255, g * 255); px[i + 2] = Math.min(255, b * 255);
  if (info.channels === 4) px[i + 3] = data[i + 3];
}
await sharp(px, { raw: info }).jpeg({ quality: 90 }).toFile(out);
console.log('wrote', out);
