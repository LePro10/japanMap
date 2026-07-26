#!/usr/bin/env node
/**
 * Sonnenrichtungs-Extraktor — PLAN.md P1 / 1.7
 *
 * Liest ein Radiance-HDRI, findet die hellste Region und rechnet deren
 * Equirect-Position in einen Richtungsvektor um.
 *
 *   node tools/hdri-sun.mjs assets/hdri/industrial_sunset_02_puresky_4k.hdr
 *
 * Warum das ein eigenes Werkzeug ist: eine von Hand geschätzte Sonnenposition
 * passt nie exakt zum HDRI-Himmel. Schatten fallen dann in eine andere Richtung
 * als die sichtbare Sonne — das Auge erkennt den Fehler sofort, auch wenn es
 * ihn nicht benennen kann.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

// ── Radiance-HDR lesen ───────────────────────────────────────────────────────

/**
 * Minimaler .hdr-Parser: Header, dann RLE-kodierte Scanlines.
 *
 * Es gibt zwei Datenformate. Das neue ("adaptive RLE") speichert die vier
 * Komponenten einer Zeile getrennt und lauflängenkodiert; das alte legt die
 * Pixel flach hintereinander. Poly Haven liefert das neue, der Flachfall ist
 * als Rückfallebene da.
 */
function parseHdr(buffer) {
  let pos = 0;

  const readLine = () => {
    let end = pos;
    while (end < buffer.length && buffer[end] !== 0x0a) end++;
    const line = buffer.toString('ascii', pos, end);
    pos = end + 1;
    return line;
  };

  const magic = readLine();
  if (!magic.startsWith('#?')) throw new Error('Keine Radiance-Datei (Signatur fehlt).');

  let format = '';
  for (;;) {
    const line = readLine();
    if (line === '') break;
    if (line.startsWith('FORMAT=')) format = line.slice(7).trim();
    if (pos >= buffer.length) throw new Error('Header ohne Ende.');
  }
  if (format && format !== '32-bit_rle_rgbe') {
    throw new Error(`Nicht unterstütztes Format: ${format}`);
  }

  const dims = readLine().trim();
  const match = /^-Y\s+(\d+)\s+\+X\s+(\d+)$/.exec(dims);
  if (!match) throw new Error(`Nicht unterstützte Achsenreihenfolge: "${dims}"`);
  const height = Number(match[1]);
  const width = Number(match[2]);

  const rgbe = new Uint8Array(width * height * 4);
  const row = new Uint8Array(width * 4);

  for (let y = 0; y < height; y++) {
    const isRle =
      width >= 8 &&
      width < 32768 &&
      buffer[pos] === 2 &&
      buffer[pos + 1] === 2 &&
      ((buffer[pos + 2] << 8) | buffer[pos + 3]) === width;

    if (!isRle) {
      // Flaches Format: der Rest der Datei ist Pixel für Pixel abgelegt.
      const remaining = (height - y) * width * 4;
      if (buffer.length - pos < remaining) throw new Error('Datei zu kurz.');
      rgbe.set(buffer.subarray(pos, pos + remaining), y * width * 4);
      break;
    }

    pos += 4;
    for (let channel = 0; channel < 4; channel++) {
      let x = 0;
      while (x < width) {
        const count = buffer[pos++];
        if (count > 128) {
          const value = buffer[pos++];
          const run = count - 128;
          for (let i = 0; i < run; i++) row[(x + i) * 4 + channel] = value;
          x += run;
        } else {
          for (let i = 0; i < count; i++) row[(x + i) * 4 + channel] = buffer[pos++];
          x += count;
        }
      }
    }
    rgbe.set(row, y * width * 4);
  }

  return { width, height, rgbe };
}

/** RGBE → linearer Float. Exponent 0 bedeutet exakt Schwarz. */
function decodePixel(rgbe, index, out) {
  const e = rgbe[index + 3];
  if (e === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const scale = 2 ** (e - 136);
  out[0] = rgbe[index] * scale;
  out[1] = rgbe[index + 1] * scale;
  out[2] = rgbe[index + 2] * scale;
}

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ── Equirect-Abbildung ───────────────────────────────────────────────────────

/**
 * Bildzeile/-spalte → Richtungsvektor.
 *
 * Three.js bildet Richtung auf UV so ab (Shader-Chunk `common`):
 *   u = atan(d.z, d.x) / 2π + 0.5
 *   v = asin(d.y) / π + 0.5
 *
 * Die vertikale Achse ist die Stelle, an der man sich hier verrechnet. Eine
 * .hdr-Datei mit "-Y H +X W" speichert von **oben nach unten**: Dateizeile 0
 * ist der Zenit. Für v muss deshalb von unten gezählt werden.
 *
 * Das war keine Herleitung, sondern eine Messung: mit der umgekehrten Zählung
 * lieferte `industrial_sunset_02_puresky` eine Elevation von −2,23°, mit dieser
 * +2,23°. Ein Sonnenuntergangs-Himmel hat die Sonne knapp über dem Horizont,
 * nicht knapp darunter — und die Ausgabe warnt weiterhin, falls die Elevation
 * je negativ wird.
 */
function pixelToDirection(col, rowFromTop, width, height) {
  const u = (col + 0.5) / width;
  const v = 1 - (rowFromTop + 0.5) / height;

  const y = Math.sin((v - 0.5) * Math.PI);
  const radius = Math.cos((v - 0.5) * Math.PI);
  const azimuth = (u - 0.5) * 2 * Math.PI;

  return [Math.cos(azimuth) * radius, y, Math.sin(azimuth) * radius];
}

// ── Sonnensuche ──────────────────────────────────────────────────────────────

const COARSE_WIDTH = 256;

/**
 * Zweistufig: erst ein grobes Raster, dann der helligkeitsgewichtete
 * Schwerpunkt im Fenster um die hellste Zelle.
 *
 * Das grobe Raster verhindert, dass ein einzelnes heißes Pixel (Sensorrauschen,
 * eine Lampe) die Sonne ersetzt. Der Schwerpunkt danach liefert die
 * Subpixel-Position: die Sonnenscheibe ist in einem 4k-Panorama nur ein paar
 * Pixel groß, aber ihre Mitte soll trotzdem auf ein Grad genau stimmen.
 */
function findSun(width, height, rgbe) {
  const coarseW = Math.min(COARSE_WIDTH, width);
  const coarseH = Math.max(1, Math.round(coarseW / 2));
  const cells = new Float64Array(coarseW * coarseH);
  const pixel = [0, 0, 0];

  let total = 0;
  for (let y = 0; y < height; y++) {
    // Zellen nahe Zenit und Nadir decken viel weniger Raumwinkel ab. Ohne
    // diese Gewichtung gewinnt fast immer der Pol.
    const solidAngle = Math.sin(((y + 0.5) / height) * Math.PI);
    const cy = Math.min(coarseH - 1, Math.floor((y / height) * coarseH));
    for (let x = 0; x < width; x++) {
      decodePixel(rgbe, (y * width + x) * 4, pixel);
      const lum = luminance(pixel[0], pixel[1], pixel[2]) * solidAngle;
      cells[cy * coarseW + Math.min(coarseW - 1, Math.floor((x / width) * coarseW))] += lum;
      total += lum;
    }
  }

  let best = 0;
  for (let i = 1; i < cells.length; i++) if (cells[i] > cells[best]) best = i;

  const cellX = best % coarseW;
  const cellY = Math.floor(best / coarseW);
  const scaleX = width / coarseW;
  const scaleY = height / coarseH;

  // Fenster von ±1 Zelle um den Treffer — groß genug, wenn die Sonne genau auf
  // einer Zellgrenze liegt.
  const x0 = Math.max(0, Math.floor((cellX - 1) * scaleX));
  const x1 = Math.min(width - 1, Math.ceil((cellX + 2) * scaleX));
  const y0 = Math.max(0, Math.floor((cellY - 1) * scaleY));
  const y1 = Math.min(height - 1, Math.ceil((cellY + 2) * scaleY));

  let peak = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      decodePixel(rgbe, (y * width + x) * 4, pixel);
      peak = Math.max(peak, luminance(pixel[0], pixel[1], pixel[2]));
    }
  }
  // Zwei Schwellen, zwei Fragen.
  //
  // Für die *Position* zählt nur der helle Kern (50 % der Spitze) — er trennt
  // die Sonnenscheibe sauber vom Halo.
  //
  // Für die *Farbe* wäre derselbe Kern die falsche Quelle: er ist im HDRI
  // regelmäßig übersteuert, einzelne Kanäle laufen in die Sättigung, und
  // heraus kommt ein reines Rot, das kein Sonnenlicht je hatte. Der Halo
  // (5 % der Spitze) trägt dieselbe Lichtfarbe, ohne geklippt zu sein.
  const coreThreshold = peak * 0.5;
  const haloThreshold = peak * 0.05;

  let weight = 0;
  let sumX = 0;
  let sumY = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let discPixels = 0;
  let haloPixels = 0;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      decodePixel(rgbe, (y * width + x) * 4, pixel);
      const lum = luminance(pixel[0], pixel[1], pixel[2]);
      if (lum < haloThreshold) continue;

      sumR += pixel[0];
      sumG += pixel[1];
      sumB += pixel[2];
      haloPixels++;

      if (lum < coreThreshold) continue;
      weight += lum;
      sumX += x * lum;
      sumY += y * lum;
      discPixels++;
    }
  }

  if (weight === 0) throw new Error('Keine helle Region gefunden.');

  return {
    col: sumX / weight,
    row: sumY / weight,
    color: [sumR / haloPixels, sumG / haloPixels, sumB / haloPixels],
    peak,
    discPixels,
    haloPixels,
    /** Mittlere Leuchtdichte der gesamten Sphäre — Bezugsgröße für Intensität. */
    meanLuminance: total / (width * height),
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);
const toHex = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const source = args[0];
  if (!source) {
    console.error('Aufruf: node tools/hdri-sun.mjs <datei.hdr>');
    process.exitCode = 1;
    return;
  }

  const buffer = await readFile(source);
  const { width, height, rgbe } = parseHdr(buffer);
  console.log(c.bold(`\n${basename(source)}`) + c.dim(`  ${width}×${height}`));

  const sun = findSun(width, height, rgbe);
  const direction = pixelToDirection(sun.col, sun.row, width, height);

  const elevation = (Math.asin(clamp(direction[1], -1, 1)) * 180) / Math.PI;
  // Azimut in Grad, von Norden (-Z) im Uhrzeigersinn — die Konvention aus
  // PLAN.md, damit die Zahl zur Weltkarte passt und nicht zu atan2.
  let azimuth = (Math.atan2(direction[0], -direction[2]) * 180) / Math.PI;
  if (azimuth < 0) azimuth += 360;

  // Farbe auf den hellsten Kanal normiert: die absolute Helligkeit steckt in
  // der Intensität, damit beide getrennt regelbar bleiben.
  const maxChannel = Math.max(...sun.color, 1e-6);
  const color = sun.color.map((v) => clamp01(v / maxChannel));

  // Startwert, kein Messwert: das Verhältnis von Sonnenleuchtdichte zur
  // mittleren Himmelsleuchtdichte, gestaucht in einen für three brauchbaren
  // Bereich. Feinabstimmung passiert im Debug-Panel gegen das gerenderte Bild.
  const contrast = luminance(...sun.color) / Math.max(sun.meanLuminance, 1e-6);
  const intensity = Math.round(Math.min(6, Math.max(0.5, Math.log10(1 + contrast) * 1.4)) * 100) / 100;

  const result = {
    generator: 'tools/hdri-sun.mjs',
    source: source.replace(ROOT, ''),
    resolution: [width, height],
    /** Einheitsvektor vom Ursprung **zur** Sonne (Y-up, Norden ist -Z). */
    direction: direction.map((v) => Math.round(v * 100000) / 100000),
    elevationDeg: Math.round(elevation * 100) / 100,
    azimuthDeg: Math.round(azimuth * 100) / 100,
    color: color.map((v) => Math.round(v * 10000) / 10000),
    colorHex: `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`,
    intensity,
    diagnostics: {
      peakLuminance: Math.round(sun.peak * 1000) / 1000,
      meanLuminance: Math.round(sun.meanLuminance * 10000) / 10000,
      discPixels: sun.discPixels,
      pixel: [Math.round(sun.col * 10) / 10, Math.round(sun.row * 10) / 10],
    },
  };

  const outDir = join(ROOT, 'assets/generated/lighting');
  const outFile = join(outDir, `${basename(source, '.hdr')}.sun.json`);
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`  Richtung    ${result.direction.map((v) => v.toFixed(3).padStart(7)).join(' ')}`);
  console.log(
    `  Elevation   ${result.elevationDeg.toFixed(2).padStart(7)}°` +
      c.dim('   (muss bei einem Himmels-HDRI positiv sein)'),
  );
  console.log(`  Azimut      ${result.azimuthDeg.toFixed(2).padStart(7)}°  ${c.dim('von Norden')}`);
  console.log(`  Farbe       ${result.colorHex}   Intensität ${result.intensity}`);
  console.log(c.dim(`  Sonnenscheibe: ${sun.discPixels} Pixel\n`));

  if (result.elevationDeg < 0) {
    console.log(
      c.yellow(
        '  ⚠ Elevation negativ — die Sonne läge unter dem Horizont.\n' +
          '    Bei einem Himmels-HDRI heißt das: die vertikale Abbildung ist gespiegelt.\n',
      ),
    );
  }
  console.log(c.dim(`  → ${outFile.replace(ROOT, '')}\n`));
}

main().catch((error) => {
  console.error(`\n${error.stack ?? error.message}`);
  process.exitCode = 1;
});
