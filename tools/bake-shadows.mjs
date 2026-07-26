#!/usr/bin/env node
/**
 * Horizont-Baker — PLAN.md P2 / 2.3
 *
 * Backt die Geländeverschattung in eine Textur, statt sie zur Laufzeit als
 * Shadow-Map zu rendern.
 *
 *   node tools/bake-shadows.mjs
 *
 * **Warum gebacken und nicht CSM?** Zwei Gründe, beide gemessen:
 *
 *  1. *Dreiecke.* Das Terrain-Gitter kostet 1.176.578 Dreiecke pro Durchlauf.
 *     Vier Kaskaden wären vier zusätzliche Durchläufe: 5,88 Mio. Dreiecke gegen
 *     ein Budget von 3 Mio. (SPEC §4). CSM ist vor dem LOD-Quadtree aus P4
 *     schlicht nicht bezahlbar — auch nicht mit zwei Kaskaden (3,53 Mio.).
 *
 *  2. *Sonnenstand.* Die Sonne steht 2,2° über dem Horizont. Ein 450-m-Gipfel
 *     wirft damit einen 11,5 km langen Schatten — fast das Vierfache der
 *     Kantenlänge der Welt. Keine Kaskadenaufteilung fängt das ein; die
 *     P1-Shadow-Map mit 700 m Radius erwischte davon 6 %.
 *
 * Gebacken geht beides: der Schatten reicht beliebig weit, flimmert nicht
 * (er steht im Weltraum, nicht im Kameraraum) und kostet zur Laufzeit eine
 * Texturabfrage. Möglich ist das nur, weil die Tageszeit fest ist (SPEC §3.1).
 *
 * Gespeichert wird **nicht** ein Schatten-Ja/Nein, sondern der Horizontwinkel:
 * die Höhe, ab der die Sonne an dieser Stelle über dem Gelände auftaucht.
 * Daraus folgen drei Eigenschaften, die eine Binärmaske nicht hat —
 * der Übergang ist stetig und damit bilinear filterbar, die Sonnenhöhe bleibt
 * im Debug-Panel verstellbar, und aus der Entfernung des verdeckenden Kamms
 * lässt sich die Halbschatten-Breite ableiten.
 *
 * Kanäle von shade.png:
 *   R  Horizontwinkel Richtung Sonne, sqrt-kodiert über 0…90°
 *   G  Entfernung zum verdeckenden Kamm, sqrt-kodiert über 0…2000 m
 *   B  Himmelssicht (Umgebungsverdeckung des Geländes), 0…1
 *
 * Ausgabe → assets/generated/terrain/shade.png + shade.json
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = new URL('..', import.meta.url).pathname;

/** Siehe tools/bake-terrain.mjs — pngjs liest den Farbtyp nur aus dem 2. Argument. */
function writePng(data, width, height, colorType) {
  const bytesPerPixel = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const expected = width * height * bytesPerPixel;
  if (data.length !== expected) {
    throw new Error(
      `PNG-Puffer passt nicht: ${data.length} Bytes, erwartet ${expected} ` +
        `(${width}×${height}, Farbtyp ${colorType}).`,
    );
  }
  return PNG.sync.write({ width, height, data }, { colorType, inputColorType: colorType });
}

// ── Parameter ────────────────────────────────────────────────────────────────

const SHADE = {
  /**
   * Auflösung der Verschattungskarte. Bewusst gröber als die Heightmap.
   *
   * Gespeichert wird ein Winkel, kein Schatten. Das Winkelfeld ist glatt — die
   * Schattenkante entsteht erst beim Vergleich mit dem Sonnenstand und liegt
   * dort, wo eine stetige Funktion einen Schwellwert kreuzt. Bilineare
   * Filterung liefert deshalb eine weiche, gerade Kante, keine Treppe. 3 m pro
   * Texel reichen dafür; 2048² wären 4× Bake-Zeit und 4× Download für einen
   * Unterschied, den man nicht sieht.
   */
  res: 1024,

  /** Kodierungsbereiche — müssen mit terrain_pars.frag.glsl übereinstimmen. */
  maxHorizonDeg: 90,
  maxOccluderDistance: 2000,

  /** Sonnen-Marsch: Startschritt in Metern und Wachstumsfaktor. */
  sunStep: 2.4,
  sunGrowth: 1.024,

  /**
   * Himmelssicht: Azimut-Anzahl und Reichweite.
   *
   * 250 m ist bewusst kurz. Der große Maßstab — ein Tal liegt tiefer als der
   * Kamm daneben — wird von der Beleuchtung ohnehin erfasst. Was hier gesucht
   * wird, ist die *lokale* Mulde: Erosionsrinnen, Steilwandfüße, Bachbetten.
   * Bei 2000 m Reichweite würde daraus ein weicher Verlauf über die halbe
   * Karte, und genau der ist unerwünscht.
   */
  skyDirections: 24,
  skyRadius: 250,
  skyStep: 2,
  skyGrowth: 1.13,
  /**
   * Der Strahl startet 40 cm über der Oberfläche.
   *
   * Ohne diesen Versatz verdeckt sich das Mikro-Relief selbst: eine 30-cm-Welle
   * in 2 m Entfernung steht unter 8,5° und nimmt damit 2 % der Himmelskuppel —
   * pro Richtung, mit einer Zufälligkeit, die von der Schrittfolge abhängt. Auf
   * der Reisfeld-Ebene erzeugte das fleckige Inseln in einer Fläche, die
   * gleichmäßig offenen Himmel hat. Umgebungsverdeckung soll von Landformen
   * kommen, nicht vom Rauschen der Heightmap.
   */
  skyBias: 0.4,
};

// ── Kleine Mathematik ────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/**
 * Höhenfeld als Float32Array plus bilineare Abfrage.
 *
 * Dieselbe Konvention wie überall im Projekt: Texel 0 liegt auf −half, Texel
 * (res−1) auf +half, der Abstand ist `size / (res − 1)`.
 */
function createSampler(raw, res, size, minHeight, heightRange) {
  const height = new Float32Array(res * res);
  const scale = heightRange / 65535;
  for (let i = 0; i < raw.length; i++) height[i] = minHeight + raw[i] * scale;

  const half = size / 2;
  const spacing = size / (res - 1);
  const last = res - 1;

  return {
    height,
    spacing,
    half,
    at(x, z) {
      const gx = clamp((x + half) / spacing, 0, last);
      const gz = clamp((z + half) / spacing, 0, last);
      const ix = gx | 0;
      const iz = gz | 0;
      const jx = ix < last ? ix + 1 : last;
      const jz = iz < last ? iz + 1 : last;
      const fx = gx - ix;
      const fz = gz - iz;

      const row0 = iz * res;
      const row1 = jz * res;
      const h00 = height[row0 + ix];
      const h10 = height[row0 + jx];
      const h01 = height[row1 + ix];
      const h11 = height[row1 + jx];

      return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
    },
  };
}

/**
 * Horizontwinkel Richtung Sonne.
 *
 * Marschiert in wachsenden Schritten auf die Sonne zu und merkt sich den
 * größten Steigungswinkel. Die Schrittweite wächst geometrisch, weil die
 * Winkelauflösung mit der Entfernung sinkt: ein Hügel in 2 km Entfernung ändert
 * den Horizont nicht mehr, wenn man ihn um drei Meter verfehlt.
 *
 * Der Abbruch ist exakt, nicht heuristisch: sobald `(maxHeight − h0) / d`
 * unter den bisherigen Maximaltangens fällt, kann kein Punkt weiter draußen
 * den Horizont noch anheben — selbst der höchste Gipfel der Welt nicht.
 */
function sunHorizon(sampler, x0, z0, h0, dirX, dirZ, maxHeight, maxDistance) {
  let bestTan = 0;
  let bestDistance = 0;
  let distance = SHADE.sunStep;
  let step = SHADE.sunStep;

  while (distance < maxDistance) {
    const h = sampler.at(x0 + dirX * distance, z0 + dirZ * distance);
    const tangent = (h - h0) / distance;
    if (tangent > bestTan) {
      bestTan = tangent;
      bestDistance = distance;
    }

    if ((maxHeight - h0) / distance <= bestTan) break;

    step *= SHADE.sunGrowth;
    distance += step;
  }

  return { tangent: bestTan, distance: bestDistance };
}

/**
 * Himmelssicht, kosinusgewichtet.
 *
 * Für einen Azimutschnitt mit Horizontwinkel θ ist der sichtbare Anteil der
 * kosinusgewichteten Hemisphäre genau cos²θ (das Integral über sinθ·cosθ von θ
 * bis π/2). Gemittelt über die Azimute ergibt das einen Verdeckungswert, der
 * direkt mit dem indirekten Licht multipliziert werden darf — im Gegensatz zu
 * einem bloßen „Anteil freier Richtungen", der Streiflicht überbewertet.
 */
function skyVisibility(sampler, x0, z0, h0, azimuths) {
  let sum = 0;
  const origin = h0 + SHADE.skyBias;

  for (let a = 0; a < azimuths.length; a++) {
    const dir = azimuths[a];
    let bestTan = 0;
    let distance = SHADE.skyStep;
    let step = SHADE.skyStep;

    while (distance < SHADE.skyRadius) {
      const h = sampler.at(x0 + dir[0] * distance, z0 + dir[1] * distance);
      const tangent = (h - origin) / distance;
      if (tangent > bestTan) bestTan = tangent;

      step *= SHADE.skyGrowth;
      distance += step;
    }

    // cos²θ aus dem Tangens, ohne atan: cos²θ = 1 / (1 + tan²θ).
    sum += 1 / (1 + bestTan * bestTan);
  }

  return sum / azimuths.length;
}

// ── Hauptlauf ────────────────────────────────────────────────────────────────

async function main() {
  const terrainDir = join(ROOT, 'assets/generated/terrain');

  const meta = JSON.parse(await readFile(join(terrainDir, 'meta.json'), 'utf8'));
  const raw = new Uint16Array(
    (await readFile(join(terrainDir, meta.heightmap.file))).buffer.slice(0),
  );

  const sunPath = join(
    ROOT,
    'assets/generated/lighting/industrial_sunset_02_puresky_4k.sun.json',
  );
  const sun = JSON.parse(await readFile(sunPath, 'utf8'));

  const heightRes = meta.heightmap.res;
  if (raw.length !== heightRes * heightRes) {
    throw new Error(
      `height.r16 hat ${raw.length} Werte, meta.json nennt ${heightRes}² = ${heightRes * heightRes}. ` +
        'Erst `npm run bake` laufen lassen.',
    );
  }

  const size = meta.world.size;
  const sampler = createSampler(
    raw,
    heightRes,
    size,
    meta.world.minHeight,
    meta.heightmap.heightRange,
  );

  // Die Sonnenrichtung zeigt **zur** Sonne (so setzt LightingRig das Licht).
  // Zum Verdecker marschiert man also in genau dieser Richtung.
  const [sx, , sz] = sun.direction;
  const horizontal = Math.hypot(sx, sz);
  if (horizontal < 1e-4) {
    throw new Error('Sonne steht im Zenit — ein Horizontwinkel ist dafür nicht definiert.');
  }
  const dirX = sx / horizontal;
  const dirZ = sz / horizontal;

  const azimuths = [];
  for (let i = 0; i < SHADE.skyDirections; i++) {
    const angle = (i / SHADE.skyDirections) * Math.PI * 2;
    azimuths.push([Math.cos(angle), Math.sin(angle)]);
  }

  const res = SHADE.res;
  const half = size / 2;
  const spacing = size / (res - 1);
  // Diagonale plus Reserve: weiter kann kein Verdecker innerhalb der Welt liegen.
  const maxDistance = size * Math.SQRT2;
  const maxHeight = meta.measured.maxHeight;

  console.log(c.bold('\nHorizont-Baker'));
  console.log(
    c.dim(
      `  Heightmap ${heightRes}²  ·  Ausgabe ${res}²  ·  Sonne ${sun.elevationDeg.toFixed(2)}° / ` +
        `${sun.azimuthDeg.toFixed(1)}° von N`,
    ),
  );

  const data = Buffer.alloc(res * res * 3);
  const started = Date.now();

  let litTexels = 0;
  let minVisibility = 1;
  const sunTan = Math.tan((sun.elevationDeg * Math.PI) / 180);

  for (let iz = 0; iz < res; iz++) {
    const z = -half + iz * spacing;

    for (let ix = 0; ix < res; ix++) {
      const x = -half + ix * spacing;
      const h0 = sampler.at(x, z);

      const horizon = sunHorizon(sampler, x, z, h0, dirX, dirZ, maxHeight, maxDistance);
      const visibility = skyVisibility(sampler, x, z, h0, azimuths);

      const horizonDeg = (Math.atan(horizon.tangent) * 180) / Math.PI;
      if (horizon.tangent < sunTan) litTexels++;
      if (visibility < minVisibility) minVisibility = visibility;

      const offset = (iz * res + ix) * 3;
      data[offset] = Math.round(
        255 * Math.sqrt(clamp(horizonDeg / SHADE.maxHorizonDeg, 0, 1)),
      );
      data[offset + 1] = Math.round(
        255 * Math.sqrt(clamp(horizon.distance / SHADE.maxOccluderDistance, 0, 1)),
      );
      data[offset + 2] = Math.round(255 * clamp(visibility, 0, 1));
    }

    if (iz % 128 === 0 && iz > 0) {
      const percent = ((iz / res) * 100).toFixed(0);
      process.stdout.write(c.dim(`  ${percent} %\r`));
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const buffer = writePng(data, res, res, 2);
  await writeFile(join(terrainDir, 'shade.png'), buffer);

  const shadeMeta = {
    file: 'shade.png',
    res,
    /** Weltposition von Texel i: −half + i · spacing. Wie bei allen Karten. */
    spacing,
    channels: ['horizon', 'occluderDistance', 'skyVisibility'],
    encoding: {
      horizon: `sqrt(deg / ${SHADE.maxHorizonDeg})`,
      occluderDistance: `sqrt(m / ${SHADE.maxOccluderDistance})`,
      skyVisibility: 'linear 0..1',
    },
    maxHorizonDeg: SHADE.maxHorizonDeg,
    maxOccluderDistance: SHADE.maxOccluderDistance,
    sun: {
      direction: sun.direction,
      elevationDeg: sun.elevationDeg,
      azimuthDeg: sun.azimuthDeg,
    },
    /**
     * Der Azimut steckt in der Karte. Wer ihn ändert, muss neu backen — die
     * Sonnenhöhe dagegen bleibt zur Laufzeit frei einstellbar, weil der
     * Vergleich Horizontwinkel gegen Sonnenhöhe erst im Shader passiert.
     */
    measured: {
      litFraction: litTexels / (res * res),
      minSkyVisibility: minVisibility,
      seconds: Number(seconds),
    },
    checksums: { 'shade.png': sha256(buffer) },
  };

  await writeFile(
    join(terrainDir, 'shade.json'),
    `${JSON.stringify(shadeMeta, null, 2)}\n`,
    'utf8',
  );

  const lit = (shadeMeta.measured.litFraction * 100).toFixed(1);
  console.log(`  ${c.green('✓')} shade.png    ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ${c.green('✓')} shade.json`);
  console.log(
    c.dim(
      `  ${lit} % der Fläche liegt bei ${sun.elevationDeg.toFixed(2)}° in der Sonne  ·  ` +
        `dunkelste Himmelssicht ${minVisibility.toFixed(2)}  ·  ${seconds} s\n`,
    ),
  );

  if (shadeMeta.measured.litFraction < 0.05) {
    console.warn(
      c.yellow(
        '  Fast alles liegt im Schatten. Prüfen, ob die Sonnenrichtung stimmt ' +
          '(tools/hdri-sun.mjs).\n',
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
