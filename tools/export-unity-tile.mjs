/**
 * Schneidet ein Stück des gebackenen Höhenfelds aus und schreibt es so, wie
 * Unitys Terrain es importiert: RAW, 16 bit, little endian („Windows"),
 * quadratisch mit 2^n + 1 Stützstellen. Erster Baustein des Unity-Umzugs
 * (docs/UNITY-UMZUG.md) — die Karte ist Daten, und die müssen ohne Three.js
 * lesbar sein.
 *
 *   node tools/export-unity-tile.mjs [--cx 770] [--cz -690] [--size 513] [--out export/unity-spike]
 *   node tools/export-unity-tile.mjs --full --out ../../SourceData/legacy/terrain
 *
 * `--full` schreibt die ganze Karte als 2049² (Unity verlangt 2^n + 1, die
 * Quelle hat 2048²): letzte Zeile und Spalte werden verdoppelt, die Karte wird
 * dadurch am Ost- und Südrand um eine Stützweite (1,5 m) breiter. Kein
 * Umtasten — jeder Originalwert bleibt bitgenau an seiner Stelle.
 *
 * Achsen: Three.js ist rechtshändig mit Norden = −Z, Unity linkshändig mit
 * Norden = +Z. Dieselbe Welt entsteht mit unityZ = −threeZ (x bleibt). Unity
 * legt Zeile 0 der RAW-Datei an den Südrand (kleinstes Unity-Z) — die Zeilen
 * werden deshalb gespiegelt geschrieben. Ob das stimmt, prüft man am Gipfel:
 * `terrain.json` nennt seine Lage in Unity-Koordinaten, und dort muss nach dem
 * Import der höchste Punkt des Terrains stehen.
 *
 * Die Höhen werden auf den Bereich des Ausschnitts gestreckt (min…max → 0…65535),
 * damit die 16 bit nicht an 490 m Gesamthub verschenkt werden.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

// Standard: Hügel südöstlich, nahe den Blickpunkten bei (742 | −690) — 28…200 m
// Relief, kein Meer. Gewählt per Rasterlauf über alle 513er-Kacheln.
const full = process.argv.includes('--full');
const cx = Number(arg('cx', 770));
const cz = Number(arg('cz', -690));
const out = arg('out', 'export/unity-spike');

const meta = JSON.parse(readFileSync('assets/generated/terrain/meta.json', 'utf8'));
const R = meta.heightmap.res;
const sp = meta.heightmap.spacing;
const half = meta.world.size / 2;
const buf = readFileSync(join('assets/generated/terrain', meta.heightmap.file));
const src = new Uint16Array(buf.buffer, buf.byteOffset, R * R);
const toMeters = (v) => meta.world.minHeight + (v / 65535) * meta.heightmap.heightRange;

const size = full ? R + 1 : Number(arg('size', 513));
if (!Number.isInteger(Math.log2(size - 1))) throw new Error(`--size muss 2^n + 1 sein, nicht ${size}`);

// Linke obere Ecke in Texeln (Zeile = Three-Z, Spalte = Three-X).
const c0 = full ? 0 : Math.round((cx + half) / sp) - (size - 1) / 2;
const r0 = full ? 0 : Math.round((cz + half) / sp) - (size - 1) / 2;
if (!full && (c0 < 0 || r0 < 0 || c0 + size > R || r0 + size > R)) throw new Error('Ausschnitt liegt nicht vollständig auf der Karte');
// Bei --full liegt die letzte Zeile/Spalte eine Stützweite außerhalb: auf den Rand klemmen.
const at = (r, c) => src[Math.min(r0 + r, R - 1) * R + Math.min(c0 + c, R - 1)];

let min = Infinity, max = -Infinity, peak = { r: 0, c: 0 };
for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    const m = toMeters(at(r, c));
    if (m < min) min = m;
    if (m > max) { max = m; peak = { r, c }; }
  }
}
const span = max - min;

const raw = Buffer.alloc(size * size * 2);
const png = new PNG({ width: size, height: size });
for (let r = 0; r < size; r++) {
  const row = size - 1 - r; // gespiegelt: Zeile 0 = Südrand = größtes Three-Z
  for (let c = 0; c < size; c++) {
    const n = (toMeters(at(r, c)) - min) / span;
    raw.writeUInt16LE(Math.round(n * 65535), (row * size + c) * 2);
    const i = (r * size + c) * 4; // Vorschau ungespiegelt: Norden oben, wie auf der Karte
    png.data[i] = png.data[i + 1] = png.data[i + 2] = Math.round(n * 255);
    png.data[i + 3] = 255;
  }
}

const extent = (size - 1) * sp;
const originX = -half + c0 * sp;              // Three-X der Westkante
const southThreeZ = -half + (r0 + size - 1) * sp;
const info = {
  source: `japanMap ${meta.heightmap.file}, seed ${meta.seed}`,
  file: `height_${size}.raw`,
  import: { depth: 16, byteOrder: 'Windows (little endian)', resolution: size, flipVertically: false },
  terrainSize: { x: +extent.toFixed(3), y: +span.toFixed(3), z: +extent.toFixed(3) },
  metersPerSample: +sp.toFixed(6),
  heightMeters: { min: +min.toFixed(2), max: +max.toFixed(2) },
  // Terrain-Objekt so setzen, dann stimmen Unity-Koordinaten mit der Karte überein.
  unityTerrainPosition: { x: +originX.toFixed(3), y: +min.toFixed(3), z: +(-southThreeZ).toFixed(3) },
  axes: 'unityX = threeX, unityY = threeY, unityZ = -threeZ (Norden = +Z)',
  check: {
    peakUnity: {
      x: +(originX + peak.c * sp).toFixed(1),
      y: +max.toFixed(1),
      z: +(-(-half + (r0 + peak.r) * sp)).toFixed(1),
    },
    note: 'Nach dem Import muss hier der höchste Punkt des Terrains liegen. Sonst Zeilen spiegeln.',
  },
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, info.file), raw);
writeFileSync(join(out, 'height_preview.png'), PNG.sync.write(png));
writeFileSync(join(out, 'terrain.json'), JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify({ out, ...info.terrainSize, min: info.heightMeters.min, max: info.heightMeters.max, peak: info.check.peakUnity }));
