/**
 * Texturen für die Auslieferung neu kodieren — PLAN.md P10.4.
 *
 * ## Der Befund, der dieses Werkzeug ausgelöst hat
 *
 * Der Startdownload liegt bei 43,48 MB gegen 15 MB aus SPEC §4, und ein Audit
 * am 2026-08-08 hat gezeigt, **woran** das liegt: die Texturen von Poly Haven
 * kommen mit einer Bitrate, die für Web-Auslieferung absurd ist.
 *
 * | Datei | Auflösung | bit/px |
 * |---|---|---|
 * | `asphalt_02/nor_gl.jpg` | 2048² | **9,43** |
 * | `asphalt_02/Diffuse.jpg` | 2048² | 5,87 |
 * | `brown_mud_02/nor_gl.jpg` | 1024² | 10,66 |
 *
 * Üblich für eine gut aussehende JPEG-Textur sind 1 bis 3 bit/px. Neun ist
 * Qualität 98+ — also praktisch verlustfrei gespeichertes, ohnehin schon
 * verlustbehaftetes Material.
 *
 * ## Was hier passiert
 *
 * Neu kodieren mit **Qualität 90 und vollem Chroma (4:4:4)**, gemessen über
 * alle 15 Dateien: 18,05 MB → 12,23 MB, also **5,83 MB** weniger.
 *
 * `4:4:4` ist nicht verhandelbar und der Grund steht in CLAUDE.md: eine
 * Normalmap ist kein Bild. Chromasubsampling mittelt die Farbkanäle über
 * 2 × 2 Pixel zusammen — bei einer Normalmap sind das die X- und Y-Anteile der
 * Normale, und die werden dabei schlicht falsch. Die Quellen liegen ohnehin
 * schon als JPEG vor; was hier passiert, ist ein zweiter kleiner Schritt, kein
 * erster großer.
 *
 * ## Warum manche Dateien größer würden — und was dagegen hilft
 *
 * Gemessen wachsen die `arm.jpg` um 54 bis 63 %: sie tragen wenig Struktur, und
 * ohne Subsampling kostet ihr flacher Farbanteil mehr, als die niedrigere
 * Qualität einspart. **Größer wird deshalb nie geschrieben** — ist das Ergebnis
 * schwerer als die Quelle, wird die Quelle kopiert. Eine Optimierung, die
 * einzelne Posten verschlechtert und im Mittel gewinnt, ist eine Optimierung mit
 * einer Ausrede.
 *
 * ## Warum nach `assets/generated/` und nicht an Ort und Stelle
 *
 * `assets/textures/` sind **Quellen** — reproduzierbar über
 * `tools/polyhaven.mjs`, eingecheckt, und die Grundlage jeder späteren
 * Entscheidung (etwa KTX2 statt JPEG). Wer sie in place überschreibt, hat nach
 * dem zweiten Lauf Generationsverlust und keinen Weg zurück. Alles Erzeugte
 * gehört unter `assets/generated/`; das ist dieselbe Regel, unter der Höhenfeld
 * und Straßen stehen.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = join(root, 'assets', 'textures');
const outDir = join(root, 'assets', 'generated', 'textures');
/**
 * Halbe Auflösung für die mittlere Stufe — P15.3.
 *
 * ## Warum ein zweiter Ordner und kein Suffix
 *
 * `terrainAssets.ts` importiert jede Datei über Vites `?url`, damit sie einen
 * Inhalts-Hash bekommt und ein Tippfehler im Pfad beim **Bauen** auffällt statt
 * im Browser mit einem 404. Das setzt statische Pfade voraus. Ein
 * Parallelordner mit identischer Struktur lässt beide Sätze über denselben
 * relativen Pfad ansprechen; ein Suffix mitten im Dateinamen bräuchte eine
 * zweite Importliste von Hand.
 *
 * ## Was das Verkleinern mit einer Normalmap macht
 *
 * Es mittelt Vektoren, und ein Mittel aus zwei Einheitsvektoren ist keiner
 * mehr — die Normale wird kürzer, die Fläche wirkt flacher. Das ist hier
 * **kein neuer** Fehler: genau das tut die Mipmap-Kette zur Laufzeit auf jeder
 * Stufe, und der Shader normiert nach dem Abtasten ohnehin. Was die halbe
 * Auflösung wirklich kostet, ist Detail im Nahfeld — und das ist der Tausch,
 * um den P15 bittet. Gemessen wird er am Bild, nicht hier behauptet.
 *
 * Chroma bleibt **4:4:4**, aus demselben Grund wie oben: eine Normalmap ist
 * kein Bild. Und die Qualität bleibt bei `QUALITY` — die halbe Auflösung ist
 * die *eine* Änderung dieses Durchgangs. Zwei Regler gleichzeitig zu drehen
 * heißt, hinterher nicht zu wissen, welcher gewirkt hat.
 */
const halfDir = join(root, 'assets', 'generated', 'textures-half');

/**
 * Qualität und Chroma.
 *
 * 90 statt 85: gemessen brächte 85 weitere 2,7 MB, aber die Quellen sind bereits
 * verlustbehaftet, und der zweite Durchgang addiert seine Artefakte auf die des
 * ersten. Bei einer Optimierung, die nichts sichtbar kosten darf, ist 90 der
 * Wert mit Abstand zum Rand — 85 wäre der Wert am Rand.
 */
const QUALITY = 90;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(jpe?g)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

async function main() {
  let files;
  try {
    files = walk(sourceDir);
  } catch {
    console.error(
      `Kein Ordner ${relative(root, sourceDir)}. Texturen holen mit:\n` +
        '  node tools/polyhaven.mjs get textures asphalt_02 --res 2k --maps Diffuse,nor_gl,arm',
    );
    process.exit(1);
  }

  console.log(`Texturen optimieren — Qualität ${QUALITY}, Chroma 4:4:4, ${files.length} Dateien\n`);
  console.log('Datei                             Quelle    Ergebnis   Ersparnis      halbe Stufe');

  let sourceTotal = 0;
  let outTotal = 0;
  let halfTotal = 0;
  let kept = 0;

  for (const file of files) {
    const rel = relative(sourceDir, file);
    const sourceSize = statSync(file).size;
    const encoded = await sharp(file)
      .jpeg({ quality: QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();

    // Halbe Auflösung für die mittlere Stufe — siehe `halfDir` oben.
    // Aus der **Quelle** verkleinert, nicht aus `encoded`: sonst läge über dem
    // Ergebnis zweimal dieselbe JPEG-Kodierung, und die Artefakte des ersten
    // Durchgangs würden mitskaliert. Dieselbe Überlegung wie bei QUALITY = 90.
    const meta = await sharp(file).metadata();
    const halfWidth = Math.max(1, Math.round((meta.width ?? 2) / 2));
    const halfHeight = Math.max(1, Math.round((meta.height ?? 2) / 2));
    const half = await sharp(file)
      .resize(halfWidth, halfHeight, { kernel: 'lanczos3' })
      .jpeg({ quality: QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();
    const halfTarget = join(halfDir, rel);
    mkdirSync(join(halfTarget, '..'), { recursive: true });
    writeFileSync(halfTarget, half);
    halfTotal += half.length;

    const target = join(outDir, rel);
    mkdirSync(join(target, '..'), { recursive: true });

    // Nie größer schreiben als die Quelle — siehe Kopf der Datei.
    const useSource = encoded.length >= sourceSize;
    if (useSource) {
      copyFileSync(file, target);
      kept++;
    } else {
      writeFileSync(target, encoded);
    }
    const finalSize = useSource ? sourceSize : encoded.length;

    sourceTotal += sourceSize;
    outTotal += finalSize;
    console.log(
      rel.replace(/\\/g, '/').padEnd(33),
      mb(sourceSize).padStart(8),
      mb(finalSize).padStart(10),
      useSource
        ? '   Quelle behalten'
        : `${(((sourceSize - finalSize) / sourceSize) * 100).toFixed(0)} %`.padStart(10),
      `${mb(half.length).padStart(9)} (${halfWidth}²)`,
    );
  }

  console.log('\n' + '─'.repeat(70));
  console.log(
    `${files.length} Dateien: ${mb(sourceTotal)} → ${mb(outTotal)} ` +
      `(${mb(sourceTotal - outTotal)} weniger, ${(((sourceTotal - outTotal) / sourceTotal) * 100).toFixed(1)} %)`,
  );
  if (kept > 0) {
    console.log(`${kept} Datei(en) unverändert übernommen, weil die Neukodierung größer war.`);
  }
  console.log(
    `Halbe Stufe (P15.3): ${mb(halfTotal)} gegen ${mb(outTotal)} — ` +
      `${(((outTotal - halfTotal) / outTotal) * 100).toFixed(1)} % weniger für den Erststart.`,
  );
}

await main();
