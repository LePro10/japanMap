import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, RepeatWrapping } from 'three';

import { CLOUDS } from '@/config/atmosphere.config';

/**
 * Kachelbares Wolkenrauschen — PLAN.md P8.4.
 *
 * ## Erzeugt statt geladen
 *
 * Der Startdownload liegt bei 42,68 MB gegen ein Budget von 15 (P7.5). Eine
 * weitere Datei wäre die falsche Richtung, und diese hier ist es besonders:
 * eine 256²-Graustufentextur wäre als PNG ein paar Dutzend Kilobyte, gerechnet
 * kostet sie **null Bytes**. Dieselbe Abwägung wie beim Imposter-Atlas aus P4,
 * nur ohne dessen Gegenargument — das Rauschen ist keine Ableitung einer
 * Quelle, die veralten könnte, sondern eine Funktion von einem Seed.
 *
 * ## Warum eine Textur und nicht Rauschen im Shader
 *
 * Weil es je Fragment **einmal** abgetastet statt gerechnet wird. Vier Oktaven
 * Wertrauschen im Shader sind 16 Hashes je Fragment; hier stehen sie in der
 * Textur, und der Shader liest zwei Texel (zwei Lagen). Auf einer integrierten
 * Grafik — genau der Zielgruppe der Stufe „Minimal" — ist das der Unterschied,
 * der zählt.
 *
 * ## Kachelbar, und deshalb ganzzahlig
 *
 * Das Gitter wird **modulo der Gitterweite** gehasht. Ohne diesen Rest liefe die
 * Textur an ihrer Naht auseinander, und die Naht stünde als gerade Linie in der
 * Landschaft — bei einer Kachel von 1150 m alle 1150 m eine.
 *
 * > **Der Hash rechnet ganzzahlig, und das ist kein Stilfrage.** CLAUDE.md
 * > führt einen Fall, in dem `fract(sin(dot(p, k)) * 43758.5453)` die Fassaden
 * > pixelfein rauschen ließ: bei einem Sinus-Argument um 3700 liegt die
 * > Auflösung von `float` bei 0,00024, mal 43758 sind das zehn ganze Einheiten,
 * > und `fract` davon ist gleichverteilt. Hier läuft die Rechnung ohnehin auf
 * > der CPU in `double`, aber ein ganzzahliger Hash ist auch dort das, was
 * > reproduzierbar bleibt.
 */
export function createCloudTexture(seed = 1337): DataTexture {
  const res = CLOUDS.textureRes;
  const data = new Uint8Array(res * res);

  let min = Infinity;
  let max = -Infinity;
  const raw = new Float32Array(res * res);

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      raw[y * res + x] = fbm(x / res, y / res, seed);
    }
  }
  for (const value of raw) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  // **Auf den vollen Bereich strecken.** Ein FBM aus vier Oktaven landet von
  // sich aus etwa bei 0,25…0,75; der Schwellwert `coverage` würde damit einen
  // anderen Deckungsgrad bedeuten, als er verspricht — und beim Verstellen der
  // Oktavenzahl stillschweigend einen weiteren.
  const span = max - min || 1;
  for (let i = 0; i < raw.length; i++) {
    data[i] = Math.round((((raw[i] ?? 0) - min) / span) * 255);
  }

  const texture = new DataTexture(data, res, res, RedFormat);
  texture.name = 'CloudNoise';
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Vier Oktaven, jede doppelt so fein und halb so stark. */
function fbm(u: number, v: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  let frequency = 2;

  for (let octave = 0; octave < CLOUDS.octaves; octave++) {
    sum += valueNoise(u * frequency, v * frequency, frequency, seed + octave * 101) * amplitude;
    norm += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return sum / norm;
}

/**
 * Wertrauschen auf einem Gitter, das sich nach `period` schließt.
 *
 * `period` ist die Zahl der Zellen über die ganze Textur — deshalb muss sie
 * eine Ganzzahl sein und mit der Frequenz übereinstimmen, sonst kachelt es
 * nicht.
 */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  // Smoothstep statt linear: eine lineare Überblendung lässt die Gitterlinien
  // als Knicke stehen, und ein Wolkenschatten mit Karomuster ist keiner.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash(xi, yi, period, seed);
  const b = hash(xi + 1, yi, period, seed);
  const c = hash(xi, yi + 1, period, seed);
  const d = hash(xi + 1, yi + 1, period, seed);

  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Ganzzahliger Hash mit Modulo — der Modulo ist das, was die Kachel schließt. */
function hash(x: number, y: number, period: number, seed: number): number {
  const px = ((x % period) + period) % period;
  const py = ((y % period) + period) % period;
  let h = (Math.imul(px, 374761393) + Math.imul(py, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
