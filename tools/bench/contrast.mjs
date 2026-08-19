/** Helligkeitsverhältnis auf der Spur gegen daneben — die Zahl, die „sichtbar" bedeutet. */
import sharp from 'sharp';
const [a, b] = process.argv.slice(2);
const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
const { width, channels } = A.info;
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
// Nur Pixel nehmen, die sich deutlich geändert haben — das sind die Spurpixel.
let onSum = 0, offSum = 0, n = 0, worst = 1;
for (let i = 0; i < A.data.length; i += channels) {
  const la = lum(A.data, i), lb = lum(B.data, i);
  if (lb - la > 8) {           // dunkler geworden = Spur
    onSum += la; offSum += lb; n++;
    const r = lb / Math.max(la, 1);
    if (r > worst) worst = r;
  }
}
console.log(n === 0 ? 'keine abgedunkelten Pixel gefunden' :
  `Spurpixel: ${n}   mit Spur ${(onSum/n).toFixed(1)}   ohne ${(offSum/n).toFixed(1)}   ` +
  `Verhältnis ${(offSum/onSum).toFixed(2)} : 1   stärkste Einzelstelle ${worst.toFixed(2)} : 1`);
