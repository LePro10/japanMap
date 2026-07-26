import { LookupTexture } from 'postprocessing';

import { GRADING_LUT_SIZE, type GradingParams } from '@/config/postfx.config';

/**
 * Color Grading — PLAN.md P2 / 2.5.
 *
 * Die LUT wird aus Parametern **gerechnet**, nicht als `.cube` geladen. Der
 * Plan sah den umgekehrten Weg vor; die Abweichung hat zwei Gründe:
 *
 *  1. *Die Schleife wird kurz.* Ein Regler zeigt sein Ergebnis sofort. Der Weg
 *     über Screenshot → Bildbearbeitung → Export → Neuladen dauert Minuten pro
 *     Iteration, und Look-Tuning besteht aus hunderten davon.
 *  2. *Es kostet kein Download-Budget.* Eine 32³-LUT als Datei sind rund 2 MB
 *     Text. Gerechnet sind es 30 ms beim Start und null Bytes — bei 42,8 MB
 *     gemessenem Startdownload gegen 15 MB Budget kein Nebenaspekt.
 *
 * Der Export nach `.cube` bleibt trotzdem da: sobald ein Look sitzt, kann er
 * die Datei liefern, die eine Farbkorrektur-Software erwartet. Und `parseCube`
 * liest umgekehrt eine extern gebaute LUT ein — der Weg aus dem Plan bleibt
 * also offen, er ist nur nicht mehr der einzige.
 *
 * Gearbeitet wird in **Anzeigewerten**, also nach dem Tonemapping: eine LUT ist
 * per Definition eine Abbildung von [0,1]³ auf [0,1]³. Auf lineares HDR
 * angewandt wäre sie sinnlos, weil dort Werte über 1 vorkommen.
 */

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

/**
 * Eine Farbe durch die Korrekturkette schicken.
 *
 * Die Reihenfolge ist die einer Farbkorrektur-Suite und nicht beliebig:
 * Weißabgleich steht vorn (er korrigiert die Aufnahme), Sättigung hinten (sie
 * bewertet das Ergebnis). Ein Kontrastregler vor dem Weißabgleich verschöbe den
 * Weißpunkt gleich mit.
 */
function grade(
  r: number,
  g: number,
  b: number,
  p: GradingParams,
): [number, number, number] {
  // Weißabgleich: Rot gegen Blau ist Temperatur, Grün gegen Magenta ist Tint.
  let cr = r * (1 + p.temperature * 0.35);
  let cg = g * (1 + p.tint * 0.3);
  let cb = b * (1 - p.temperature * 0.35);

  // Lift / Gamma / Gain — der klassische Dreiklang aus Tiefen, Mitten, Lichtern.
  const inverseGamma = 1 / Math.max(p.gamma, 1e-3);
  cr = Math.pow(clamp01(cr * p.gain + p.lift), inverseGamma);
  cg = Math.pow(clamp01(cg * p.gain + p.lift), inverseGamma);
  cb = Math.pow(clamp01(cb * p.gain + p.lift), inverseGamma);

  cr = (cr - 0.5) * p.contrast + 0.5;
  cg = (cg - 0.5) * p.contrast + 0.5;
  cb = (cb - 0.5) * p.contrast + 0.5;

  // Farbstich in den Tiefen. Quadratisch gewichtet, damit er die Mitten in Ruhe
  // lässt — bei blauer Stunde ist genau das der Regler, der die Stimmung macht.
  const luma = cr * LUMA.r + cg * LUMA.g + cb * LUMA.b;
  const shadow = (1 - clamp01(luma)) ** 2 * p.shadowTint;
  cr -= shadow * 0.1;
  cg += shadow * 0.03;
  cb += shadow * 0.14;

  const gray = cr * LUMA.r + cg * LUMA.g + cb * LUMA.b;
  cr = gray + (cr - gray) * p.saturation;
  cg = gray + (cg - gray) * p.saturation;
  cb = gray + (cb - gray) * p.saturation;

  return [clamp01(cr), clamp01(cg), clamp01(cb)];
}

/**
 * LUT aus Parametern bauen.
 *
 * Die Achsenreihenfolge ist die von `Data3DTexture`: Rot läuft am schnellsten,
 * dann Grün, dann Blau. Dieselbe Reihenfolge nutzt auch das `.cube`-Format —
 * ein Zufall, der den Export auf eine Schleife verkürzt.
 */
export function createGradingLut(params: GradingParams, size = GRADING_LUT_SIZE): LookupTexture {
  const data = new Float32Array(size * size * size * 4);
  const step = 1 / (size - 1);

  let offset = 0;
  for (let ib = 0; ib < size; ib++) {
    const b = ib * step;
    for (let ig = 0; ig < size; ig++) {
      const g = ig * step;
      for (let ir = 0; ir < size; ir++) {
        const [r, gg, bb] = grade(ir * step, g, b, params);
        data[offset++] = r;
        data[offset++] = gg;
        data[offset++] = bb;
        data[offset++] = 1;
      }
    }
  }

  const lut = new LookupTexture(data, size);
  lut.name = 'GradingLut';
  return lut;
}

/** Bestehende LUT an Ort und Stelle neu rechnen — spart Neuanlegen bei jedem Reglerzug. */
export function updateGradingLut(lut: LookupTexture, params: GradingParams): void {
  const image = lut.image as { data: Float32Array; width: number };
  const size = image.width;
  const data = image.data;
  const step = 1 / (size - 1);

  let offset = 0;
  for (let ib = 0; ib < size; ib++) {
    const b = ib * step;
    for (let ig = 0; ig < size; ig++) {
      const g = ig * step;
      for (let ir = 0; ir < size; ir++) {
        const [r, gg, bb] = grade(ir * step, g, b, params);
        data[offset++] = r;
        data[offset++] = gg;
        data[offset++] = bb;
        offset++;
      }
    }
  }

  lut.needsUpdate = true;
}

/** LUT als `.cube` serialisieren — das Format, das Resolve, Photoshop und Nuke lesen. */
export function toCube(params: GradingParams, title: string, size = GRADING_LUT_SIZE): string {
  const lines = [
    `TITLE "${title}"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    '',
  ];

  const step = 1 / (size - 1);
  for (let ib = 0; ib < size; ib++) {
    for (let ig = 0; ig < size; ig++) {
      for (let ir = 0; ir < size; ir++) {
        const [r, g, b] = grade(ir * step, ig * step, ib * step, params);
        lines.push(`${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * `.cube` einlesen.
 *
 * Bewusst nachsichtig: Kommentare, Leerzeilen und die optionalen
 * DOMAIN-Angaben werden übersprungen. Streng geprüft wird nur, ob am Ende
 * genau size³ Zeilen zusammengekommen sind — eine zu kurze Datei ergäbe sonst
 * eine LUT mit schwarzem Rest, und das sieht nach einem Grading-Fehler aus
 * statt nach einer kaputten Datei.
 */
export function parseCube(source: string): LookupTexture {
  let size = 0;
  const values: number[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number.parseInt(line.slice('LUT_3D_SIZE'.length).trim(), 10);
      continue;
    }
    if (/^[A-Z_]/.test(line)) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }

  if (size <= 1) throw new Error('.cube ohne gültige LUT_3D_SIZE.');

  const expected = size * size * size * 3;
  if (values.length !== expected) {
    throw new Error(
      `.cube hat ${values.length / 3} Einträge, erwartet ${expected / 3} (${size}³).`,
    );
  }

  const data = new Float32Array(size * size * size * 4);
  for (let i = 0, j = 0; i < values.length; i += 3) {
    data[j++] = values[i] ?? 0;
    data[j++] = values[i + 1] ?? 0;
    data[j++] = values[i + 2] ?? 0;
    data[j++] = 1;
  }

  const lut = new LookupTexture(data, size);
  lut.name = 'GradingLutCube';
  return lut;
}
