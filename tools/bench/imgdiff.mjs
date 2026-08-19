/**
 * Differenzbild zweier Aufnahmen — CLAUDE.md, „Wer eine Differenz misst, sieht
 * sie sich an". Eine Prozentzahl sagt *wie viel*, nicht *wo*; deshalb schreibt
 * dieses Werkzeug beides.
 */
import sharp from 'sharp';
const [a, b, out] = process.argv.slice(2);
const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = A.info;
const diff = Buffer.alloc(width * height * 3);
let changed = 0, sum = 0, max = 0;
let minX = width, maxX = 0, minY = height, maxY = 0;
for (let i = 0, p = 0; i < A.data.length; i += channels, p += 3) {
  const dr = Math.abs(A.data[i] - B.data[i]);
  const dg = Math.abs(A.data[i+1] - B.data[i+1]);
  const db = Math.abs(A.data[i+2] - B.data[i+2]);
  const d = Math.max(dr, dg, db);
  sum += d; if (d > max) max = d;
  if (d > 3) {
    changed++;
    const px = (i / channels) % width, py = Math.floor((i / channels) / width);
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  // Verstärkt, damit eine kleine Differenz überhaupt zu sehen ist
  const g = Math.min(255, d * 8);
  diff[p] = g; diff[p+1] = g; diff[p+2] = g;
}
await sharp(diff, { raw: { width, height, channels: 3 } }).png().toFile(out);
const n = width * height;
console.log(`geänderte Pixel (>3/255): ${((changed/n)*100).toFixed(3)} %   mittlere Differenz ${(sum/n).toFixed(2)}   Maximum ${max}`);
if (changed > 0) console.log(`  Rechteck der Änderung: x ${minX}…${maxX}, y ${minY}…${maxY}  (Bild ${width}×${height})`);
console.log(`  Differenzbild (8×verstärkt): ${out}`);
