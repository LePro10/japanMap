/**
 * HDRIs für die Auslieferung verkleinern — PLAN.md P12 / 12.5.
 *
 * ## Der Befund
 *
 * Der Startdownload liegt bei 53,4 MB gegen 15 MB aus SPEC §4, und **zwei
 * Dateien stellen 42 % davon**:
 *
 * | Datei | Größe | wofür |
 * |---|---|---|
 * | `industrial_sunset_02_puresky_4k.hdr` | 16,1 MB | sichtbarer Himmel (`scene.background`) |
 * | `rooftop_night_2k.hdr` | 6,5 MB | Beleuchtung (`PMREMGenerator` → `scene.environment`) |
 *
 * ## Warum das IBL ohne jeden Verlust kleiner darf
 *
 * Es wird **nie angesehen**. `LightingRig` schickt es durch `PMREMGenerator`,
 * und der baut daraus eine vorgefaltete Spiegel-Pyramide, deren größte Stufe
 * 256 Pixel Kantenlänge hat. Jedes Detail oberhalb davon wird bei der Faltung
 * weggemittelt — 2048 Pixel Quellauflösung liefern denselben Würfel wie 1024,
 * nur nach längerem Rechnen und 4,4 MB mehr Übertragung.
 *
 * Der Himmel ist der andere Fall: er steht **sichtbar** im Bild und wird nicht
 * gefaltet. Er wird deshalb hier zwar unterstützt, aber nicht ohne Bildvergleich
 * verkleinert — die Entscheidung steht in PLAN.md, nicht in diesem Werkzeug.
 *
 * ## Warum in Radiance-RGBE zurückgeschrieben wird
 *
 * Weil `RGBELoader` in three genau das liest und die Anwendung damit **keine
 * Zeile** ändern muss. Geschrieben wird ohne Lauflängenkodierung: vier Byte je
 * Pixel, plattgeschrieben. Das ist ein paar Prozent größer als die RLE-Form der
 * Quelle und dafür eine Fehlerquelle weniger — und der Gewinn kommt ohnehin aus
 * der Auflösung, nicht aus der Kodierung.
 *
 * ## Gemittelt wird **linear**, nicht in RGBE
 *
 * RGBE ist eine gemeinsame Mantisse mit einem gemeinsamen Exponenten. Zwei
 * Pixel dort direkt zu mitteln, hieße Exponenten zu mitteln — also
 * Logarithmen — und das ist ein anderer Mittelwert. Bei einem Himmel mit Sonne
 * stünden dann Sonnenrand und Wolke im selben Texel systematisch zu dunkel.
 * Dekodiert wird deshalb erst nach `float`, gemittelt, und danach neu kodiert.
 *
 * ```bash
 * node tools/optimize-hdri.mjs assets/hdri/rooftop_night_2k.hdr --half
 * node tools/optimize-hdri.mjs assets/hdri/industrial_sunset_02_puresky_4k.hdr --half --out assets/generated/hdri
 * ```
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// ── Radiance RGBE lesen ────────────────────────────────────────────────────

/**
 * Kopf und Bilddaten trennen.
 *
 * Der Kopf ist ASCII und endet mit einer **leeren** Zeile, danach folgt genau
 * eine Auflösungszeile (`-Y H +X W`). Andere Achsenordnungen als `-Y … +X` gibt
 * es, sie kommen aber bei Poly Haven nicht vor — sie werden deshalb abgelehnt
 * statt halb richtig behandelt.
 */
function readHeader(buffer) {
  let offset = 0;
  const zeile = () => {
    const ende = buffer.indexOf(0x0a, offset);
    if (ende < 0) throw new Error('HDR-Kopf ohne Zeilenende.');
    const text = buffer.toString('ascii', offset, ende);
    offset = ende + 1;
    return text;
  };

  const magic = zeile();
  if (!magic.startsWith('#?')) throw new Error(`Keine Radiance-Datei (Kennung „${magic}").`);

  let format = null;
  for (;;) {
    const text = zeile();
    if (text === '') break;
    if (text.startsWith('FORMAT=')) format = text.slice(7).trim();
  }
  if (format !== null && format !== '32-bit_rle_rgbe') {
    throw new Error(`Nicht unterstütztes Format „${format}".`);
  }

  const maße = zeile().trim().match(/^-Y\s+(\d+)\s+\+X\s+(\d+)$/);
  if (!maße) throw new Error('Nur die Achsenordnung „-Y H +X W" wird unterstützt.');

  return { width: Number(maße[2]), height: Number(maße[1]), dataOffset: offset };
}

/**
 * Eine Bildzeile lesen — neue RLE-Form oder flach.
 *
 * Die neue Form beginnt mit `2 2 hi lo`, wobei `hi<<8|lo` die Breite ist; die
 * vier Kanäle stehen dann **getrennt** hintereinander, jeweils lauflängen-
 * kodiert. Alles andere ist eine flache Zeile aus vier Byte je Pixel.
 */
function readScanline(buffer, offset, width, out) {
  const flach = () => {
    for (let i = 0; i < width * 4; i++) out[i] = buffer[offset + i];
    return offset + width * 4;
  };

  if (width < 8 || width > 0x7fff) return flach();
  if (buffer[offset] !== 2 || buffer[offset + 1] !== 2) return flach();
  if (((buffer[offset + 2] << 8) | buffer[offset + 3]) !== width) return flach();

  let cursor = offset + 4;
  for (let kanal = 0; kanal < 4; kanal++) {
    let x = 0;
    while (x < width) {
      const count = buffer[cursor++];
      if (count > 128) {
        // Lauf: ein Wert, `count - 128` mal.
        const value = buffer[cursor++];
        const bis = x + (count - 128);
        if (bis > width) throw new Error('RLE-Lauf über die Zeilenbreite hinaus.');
        for (; x < bis; x++) out[x * 4 + kanal] = value;
      } else {
        // Wörtlich: `count` einzelne Werte.
        const bis = x + count;
        if (count === 0 || bis > width) throw new Error('Ungültige RLE-Länge.');
        for (; x < bis; x++) out[x * 4 + kanal] = buffer[cursor++];
      }
    }
  }
  return cursor;
}

/** Ganzes Bild als `Float32Array` mit drei Kanälen, linear. */
function decode(buffer) {
  const { width, height, dataOffset } = readHeader(buffer);
  const pixels = new Float32Array(width * height * 3);
  const zeile = new Uint8Array(width * 4);
  let offset = dataOffset;

  for (let y = 0; y < height; y++) {
    offset = readScanline(buffer, offset, width, zeile);
    for (let x = 0; x < width; x++) {
      const e = zeile[x * 4 + 3];
      // Exponent 0 heißt exakt schwarz — `Math.pow(2, -136)` wäre zwar winzig,
      // aber nicht null, und Summen darüber driften.
      const scale = e === 0 ? 0 : Math.pow(2, e - 136);
      const ziel = (y * width + x) * 3;
      pixels[ziel] = zeile[x * 4] * scale;
      pixels[ziel + 1] = zeile[x * 4 + 1] * scale;
      pixels[ziel + 2] = zeile[x * 4 + 2] * scale;
    }
  }
  return { width, height, pixels };
}

// ── Verkleinern und zurückschreiben ────────────────────────────────────────

/** Kastenfilter um den ganzzahligen Faktor `factor`, linear gemittelt. */
function downsample(image, factor) {
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  if (width < 4 || height < 2) throw new Error('Zielauflösung zu klein.');
  const pixels = new Float32Array(width * height * 3);
  const anteil = 1 / (factor * factor);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy++) {
        const zeile = (y * factor + dy) * image.width;
        for (let dx = 0; dx < factor; dx++) {
          const q = (zeile + x * factor + dx) * 3;
          r += image.pixels[q];
          g += image.pixels[q + 1];
          b += image.pixels[q + 2];
        }
      }
      const ziel = (y * width + x) * 3;
      pixels[ziel] = r * anteil;
      pixels[ziel + 1] = g * anteil;
      pixels[ziel + 2] = b * anteil;
    }
  }
  return { width, height, pixels };
}

/**
 * Ein Pixel nach RGBE.
 *
 * `frexp` gibt es in JS nicht; `Math.log2` plus `Math.ceil` liefert denselben
 * Exponenten, und die Mantisse wird danach zurückgerechnet statt geschätzt.
 */
function encodePixel(r, g, b, out, offset) {
  const max = Math.max(r, g, b);
  if (!(max > 1e-32)) {
    out[offset] = 0;
    out[offset + 1] = 0;
    out[offset + 2] = 0;
    out[offset + 3] = 0;
    return;
  }
  let exponent = Math.ceil(Math.log2(max));
  let scale = 256 / Math.pow(2, exponent);
  // Rundung kann den größten Kanal auf 256 heben — dann eine Stufe höher, sonst
  // läuft das Byte über und ein heller Pixel wird schwarz.
  if (Math.round(max * scale) > 255) {
    exponent += 1;
    scale = 256 / Math.pow(2, exponent);
  }
  out[offset] = Math.min(255, Math.round(r * scale));
  out[offset + 1] = Math.min(255, Math.round(g * scale));
  out[offset + 2] = Math.min(255, Math.round(b * scale));
  out[offset + 3] = exponent + 128;
}

function encode(image) {
  const kopf = Buffer.from(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nSOFTWARE=japanMap tools/optimize-hdri.mjs\n\n` +
      `-Y ${image.height} +X ${image.width}\n`,
    'ascii',
  );
  const daten = Buffer.alloc(image.width * image.height * 4);
  for (let i = 0, p = 0; i < image.width * image.height; i++, p += 3) {
    encodePixel(image.pixels[p], image.pixels[p + 1], image.pixels[p + 2], daten, i * 4);
  }
  return Buffer.concat([kopf, daten]);
}

// ── Selbstprüfung ──────────────────────────────────────────────────────────

/**
 * Die geschriebene Datei wieder einlesen und gegen das Original halten.
 *
 * **Ein Kodierer, der seine eigene Ausgabe nicht liest, ist ungeprüft.** Der
 * Vergleich läuft über die mittlere Leuchtdichte und den größten relativen
 * Fehler je Pixel; beide müssen klein sein, sonst stimmt die Beleuchtung der
 * ganzen Karte nicht mehr — und das fiele erst am Bild auf.
 */
function selfCheck(original, geschrieben) {
  const wieder = decode(geschrieben);
  if (wieder.width !== original.width || wieder.height !== original.height) {
    throw new Error('Selbstprüfung: Maße nach dem Rundlauf verschieden.');
  }
  let summeA = 0;
  let summeB = 0;
  let maxFehler = 0;
  for (let i = 0; i < original.pixels.length; i += 3) {
    const a = original.pixels[i] * 0.2126 + original.pixels[i + 1] * 0.7152 + original.pixels[i + 2] * 0.0722;
    const b = wieder.pixels[i] * 0.2126 + wieder.pixels[i + 1] * 0.7152 + wieder.pixels[i + 2] * 0.0722;
    summeA += a;
    summeB += b;
    if (a > 1e-4) maxFehler = Math.max(maxFehler, Math.abs(b - a) / a);
  }
  const anzahl = original.pixels.length / 3;
  return {
    mittelVorher: summeA / anzahl,
    mittelNachher: summeB / anzahl,
    abweichungProzent: (Math.abs(summeB - summeA) / summeA) * 100,
    maxFehlerProzent: maxFehler * 100,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const quelle = argv.find((a) => !a.startsWith('--'));
if (!quelle) {
  console.error('Aufruf: node tools/optimize-hdri.mjs <datei.hdr> [--half|--quarter] [--out <ordner>]');
  process.exit(1);
}
const faktor = argv.includes('--quarter') ? 4 : 2;
const outIndex = argv.indexOf('--out');
const outDir = outIndex >= 0 ? join(root, argv[outIndex + 1]) : dirname(join(root, quelle));

const quellPfad = join(root, quelle);
const roh = readFileSync(quellPfad);
const original = decode(roh);
const klein = downsample(original, faktor);
const ausgabe = encode(klein);

const name = basename(quelle).replace(/(_(\d+)k)?\.hdr$/i, '');
const kante = klein.width >= 1024 ? `${Math.round(klein.width / 1024)}k` : `${klein.width}px`;
mkdirSync(outDir, { recursive: true });
const zielPfad = join(outDir, `${name}_${kante}.hdr`);
writeFileSync(zielPfad, ausgabe);

const prüfung = selfCheck(klein, ausgabe);
const mb = (bytes) => (bytes / 1048576).toFixed(2);

console.log(
  `${basename(quelle)}  ${original.width}×${original.height} → ${klein.width}×${klein.height}\n` +
    `  ${mb(statSync(quellPfad).size)} MB → ${mb(ausgabe.byteLength)} MB\n` +
    `  Selbstprüfung: mittlere Leuchtdichte ${prüfung.mittelVorher.toFixed(5)} → ` +
    `${prüfung.mittelNachher.toFixed(5)} (${prüfung.abweichungProzent.toFixed(4)} % Abweichung, ` +
    `größter Pixelfehler ${prüfung.maxFehlerProzent.toFixed(2)} %)\n` +
    `  geschrieben: ${zielPfad}`,
);

if (prüfung.abweichungProzent > 0.5) {
  console.error('  ✗ Die mittlere Leuchtdichte hat sich verschoben — die Kodierung stimmt nicht.');
  process.exit(1);
}
