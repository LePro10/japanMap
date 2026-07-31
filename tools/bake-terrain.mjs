#!/usr/bin/env node
/**
 * Heightmap-Baker — PLAN.md P1 / 1.1
 *
 * Erzeugt das Terrain **einmalig und deterministisch** aus einem Seed. Zur
 * Laufzeit wird kein Noise gerechnet: das Terrain soll zwischen zwei Läufen
 * bitgleich sein und von Hand nacheditierbar bleiben.
 *
 *   node tools/bake-terrain.mjs --seed 20260725 --res 2048 --erosion 2000000
 *
 * Generierungs-Kette (Reihenfolge ist bedeutsam):
 *   1. Kontinentalbasis    großskaliges FBM, Land gegen Meer
 *   2. Küsten-Abfall       Südkante läuft unter den Meeresspiegel
 *   3. Gebirgsmassiv       Ridged Multifractal im Nordwesten, radial maskiert
 *   4. Ebenen-Einebnung    Reisfeld- und Stadtzone gegen einen Zielwert
 *   5. Hydraulische Erosion  Droplet-Simulation — der wichtigste Schritt
 *   6. Zonenmaske          4 Kanäle: Fels / Gras / Sand / Reisfeld
 *
 * Ausgabe → assets/generated/terrain/
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNoise2D } from 'simplex-noise';
import { PNG } from 'pngjs';
// Dieselbe Datei, die auch der Renderer liest — die Stadtplatte und die
// Einebnung darunter müssen auf den Zentimeter zusammenpassen.
import { CITY_PAD_FEATHER, CITY_PAD_Y, districtBlend } from '../src/config/city.mjs';

/**
 * PNG schreiben.
 *
 * `PNG.sync.write` liest seine Optionen ausschließlich aus dem zweiten
 * Argument — ein `colorType` im `new PNG({...})` bleibt wirkungslos. Ohne
 * `inputColorType` nimmt pngjs RGBA an und interpretiert einen Graustufen-
 * oder RGB-Puffer um: das Bild erscheint dann vervielfacht und in den oberen
 * Bildrand gestaucht. Deshalb hier immer beide Angaben, explizit.
 *
 * Farbtypen: 0 = Graustufen, 2 = RGB, 6 = RGBA.
 */
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

// ── Weltparameter ────────────────────────────────────────────────────────────
// Spiegelt src/config/world.config.ts. Die Werte landen in meta.json und werden
// vom TerrainSampler beim Laden gegen WORLD geprüft — laufen sie auseinander,
// bricht die Anwendung mit einer klaren Meldung ab statt still falsch zu rendern.
const WORLD_SIZE = 3072;
const SEA_LEVEL = 0;
const MIN_HEIGHT = -40;
const MAX_HEIGHT = 450;
const CHUNK_SIZE = 256;

const HEIGHT_RANGE = MAX_HEIGHT - MIN_HEIGHT;

// ── Zonen-Layout (SPEC §2.1, Norden ist -Z) ──────────────────────────────────
const ZONES = {
  /** Bergmassiv im Nordwesten — Serpentinen, 0 → 450 m. */
  mountain: { x: -820, z: -900, inner: 300, outer: 1080 },
  /** Wald + Tempel im Nordosten — Hochebene auf ~150 m. */
  forest: { x: 820, z: -940, inner: 340, outer: 900, height: 55 },
  /** Reisfelder im Westen — flach auf ~22 m. */
  rice: { x: -760, z: 60, halfX: 400, halfZ: 320, feather: 380, height: 22 },
  /** Stadt im Osten — 800 × 800 m Plateau auf ~30 m. */
  city: { x: 780, z: 90, halfX: 400, halfZ: 400, feather: 300, height: 30 },
};

/** Südküste: ab hier fällt das Terrain, ab `sea` liegt es unter Null. */
const COAST = { start: 600, sea: 1160, deep: 1536, shore: -2, floor: -38 };

/**
 * Kern des Stadtplateaus — PLAN.md P8.5c.
 *
 * Deckt `CITY_DISTRICT` (440…800 / −60…300) plus die 60-m-Feder von `padCity`
 * plus 20 m Reserve ab, also 360…880 / −140…380. Innerhalb davon bleibt die
 * Einebnung, wie sie war: die Bodenplatte der Stadt braucht 29,77 m als obere
 * Schranke, und ein Restrelief dort würde sie durchstoßen.
 *
 * **Außerhalb davon nicht.** Der Distrikt belegt 20 % seines eigenen Plateaus;
 * die übrigen 80 % sind eine planierte, kahle Fläche, die aus der Luft die
 * Wahrnehmung der ganzen Ostkarte bestimmt (am Bild geprüft,
 * `.cache/shots/p8_vorfeld_stadt_luft.png`).
 */
const CITY_CORE = { x: 620, z: 120, halfX: 260, halfZ: 260, feather: 200 };

/**
 * Wie das Vorfeld aussieht, wenn es nicht mehr planiert wird.
 *
 * `strength` ist der Anteil, mit dem das Vorfeld noch gegen die Zielhöhe
 * gezogen wird — 0,96 wie bisher ergäbe wieder eine Ebene, 0 ließe das Gelände
 * völlig unberührt und die Stadt läge an einem Hang. `relief` ist die Amplitude
 * des verbleibenden Kleinreliefs, `rise` der Anstieg zum Zonenrand hin: die
 * Stadt liegt danach in einer flachen Mulde statt auf einem Tisch.
 */
const CITY_APRON = { strength: 0.62, relief: 5.5, rise: 6 };

// ── Kleine Mathematik ────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * mulberry32 — kleiner, schneller PRNG mit 32 Bit Zustand.
 * Deterministisch und nicht von der Engine-Version abhängig, anders als
 * Math.random(). Jede Rausch-Schicht bekommt einen eigenen Strom, damit eine
 * Änderung an Schicht 3 nicht die Schichten 1 und 2 verschiebt.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed + Bezeichner → eigener Rausch-Strom. */
function stream(seed, salt) {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
  }
  return mulberry32(h);
}

function fbm(noise, x, y, octaves, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum / norm;
}

/**
 * Ridged Multifractal, normiert auf ~0..1.
 *
 * `1 - |noise|` faltet das Rauschen an der Null-Linie: aus weichen Tälern
 * werden scharfe Grate. Entscheidend ist `weight`: es koppelt jede Oktave an
 * die vorige, sodass Details nur dort entstehen, wo schon ein Grat ist — das
 * ist der Unterschied zwischen einem Gebirge und einer verrauschten Beule.
 *
 * `sharpness` (in libnoise schlicht "gain") steuert diese Kopplung. Mit 1.0
 * fällt das Gewicht so schnell ab, dass die hohen Oktaven kaum beitragen und
 * das Massiv flach bleibt; 2.0 hält die Grate durch alle Oktaven scharf.
 */
function ridged(noise, x, y, octaves, lacunarity = 2.07, gain = 0.5, sharpness = 2) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let weight = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise(x * frequency, y * frequency));
    n *= n;
    n *= weight;
    weight = clamp(n * sharpness, 0, 1);
    sum += n * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum / norm;
}

/**
 * Rechteckige Maske mit weichem Rand — für Ebenen mit gerader Kante.
 *
 * `jitter` verschiebt den Rand pro Position. Ohne diese Störung stanzt sich
 * die Zone als perfektes Rechteck ins Gelände, und genau so sieht sie dann
 * auch aus: nach Werkzeug, nicht nach Landschaft.
 */
function boxMask(x, z, zone, jitter = 0) {
  const dx = Math.abs(x - zone.x) - zone.halfX;
  const dz = Math.abs(z - zone.z) - zone.halfZ;
  const d = Math.max(dx, dz) + jitter;
  return 1 - smoothstep(0, zone.feather, d);
}

// ── Schritt 1–4: Höhenfeld ───────────────────────────────────────────────────

/**
 * Zwei Regler für den Terrain-Durchgang aus P8.5a.
 *
 * Sie stehen hier und nicht als feste Zahl im Code, weil die Entscheidung über
 * die Form des Massivs eine **Art-Direction-Frage** ist und keine, die man
 * nebenbei durch Umtippen einer Konstanten trifft. Mit `--out .cache/…` lassen
 * sich damit Varianten backen, ohne `assets/generated/` anzufassen, und
 * anschließend mit `inspect-map --profile` gegeneinander messen.
 *
 * Beide Vorgaben sind **1 bzw. 0**, also der ausgelieferte Stand. Wer sie
 * ändert, ändert das Höhenfeld — und damit Straßen, Verschattung, Vegetation
 * und Prop-Höhen.
 */
const EXPERIMENT = {
  /**
   * Faktor auf die Gratamplitude des Massivs.
   *
   * Gemessen ist er der **Haupthebel** für Serpentinen: die Traverse quer zur
   * Falllinie liegt bei z = −550 auf 84 % ihrer Länge über 30 % Neigung, und
   * das kommt von den Graten, nicht vom mittleren Gefälle (das mit 25 % bereits
   * dem Zielwert entspricht).
   */
  ridge: 1,
  /** Verschiebung der Reisfeldzone nach Süden, in Metern. Gibt der Flanke Länge. */
  riceShift: 0,
};

function buildHeightField(res, seed, spacing) {
  const height = new Float32Array(res * res);

  const nBase = createNoise2D(stream(seed, 'continent'));
  const nWarp = createNoise2D(stream(seed, 'warp'));
  const nRidge = createNoise2D(stream(seed, 'ridge'));
  const nMassif = createNoise2D(stream(seed, 'massif'));
  const nHills = createNoise2D(stream(seed, 'hills'));
  const nCoast = createNoise2D(stream(seed, 'coastline'));
  const nField = createNoise2D(stream(seed, 'field'));

  const half = WORLD_SIZE / 2;

  for (let iy = 0; iy < res; iy++) {
    const z = -half + iy * spacing;
    for (let ix = 0; ix < res; ix++) {
      const x = -half + ix * spacing;

      // Domain-Warping: verschiebt die Abtastposition mit langsamem Rauschen.
      // Kostet zwei Noise-Aufrufe und nimmt dem Ergebnis den gitterartigen
      // Charakter, den reines FBM immer behält.
      const wx = x + nWarp(x / 1700, z / 1700) * 260;
      const wz = z + nWarp(x / 1700 + 91.3, z / 1700 - 47.1) * 260;

      // 1 — Kontinentalbasis. Der Anstieg nach Norden endet bewusst schon bei
      // z ≈ 200: die Zonen Reisfeld und Stadt liegen im flachen Mittelband,
      // und eine Ebene auf 22 m in einem Gelände auf 60 m wäre keine Ebene,
      // sondern eine rechteckige Grube.
      let h = 26 + fbm(nBase, wx / 2600, wz / 2600, 4) * 30;
      // Die Geländestufe zum Hochland darf nicht auf einer Linie liegen —
      // ohne diese Verschiebung zieht sie sich als lineal­gerade Kante quer
      // über die ganze Karte.
      h += smoothstep(200, -1450, z + fbm(nBase, x / 1400, 311.7, 3) * 430) * 95;
      h += fbm(nHills, wx / 520, wz / 520, 5) * 21;
      h += fbm(nHills, wx / 180 + 63.2, wz / 180 - 18.5, 3) * 6;

      // 3 — Gebirgsmassiv im Nordwesten.
      const m = ZONES.mountain;
      const dm = Math.hypot(x - m.x, z - m.z);
      // Die Radialmaske allein ergäbe einen Kreiskegel; das zweite Rauschen
      // zerlegt den Rand in Ausläufer und Vorgebirge.
      const massifShape = 0.55 + 0.45 * fbm(nMassif, x / 1150, z / 1150, 3);
      const massif = smoothstep(m.outer, m.inner, dm) * clamp(massifShape, 0, 1);
      if (massif > 0.001) {
        // Zwei Anteile: eine breite Wölbung, die dem Massiv Masse gibt, und
        // die Grate obendrauf. Nur Grate ergäben ein Gebirge aus Zacken ohne
        // Körper — von unten sähe man Klingen statt Bergen.
        const r = ridged(nRidge, wx / 880, wz / 880, 6);
        h += massif * massif * 130;
        h += r * 645 * EXPERIMENT.ridge * massif;
      }

      // 3b — Waldhochebene im Nordosten. Bewusst weich: hier soll später ein
      // Tempelpfad liegen, kein Kletterfels.
      const f = ZONES.forest;
      const df = Math.hypot(x - f.x, z - f.z);
      h += smoothstep(f.outer, f.inner, df) * f.height;

      // 2 — Küsten-Abfall. Die Kantenlage wird verrauscht, sonst liegt die
      // Küstenlinie als Lineal quer durch die Karte.
      const coastJitter = fbm(nCoast, x / 900, 0, 3) * 150;
      const zc = z + coastJitter;
      const shore = lerp(
        COAST.shore,
        COAST.floor,
        smoothstep(COAST.sea, COAST.deep, zc),
      );
      h = lerp(h, shore, smoothstep(COAST.start, COAST.sea, zc));

      // 4 — Ebenen-Einebnung. Reisfelder und Stadt brauchen eine Fläche, auf
      // der ab P3/P6 überhaupt etwas gebaut werden kann.
      const edgeJitter = fbm(nField, x / 340, z / 340, 3) * 190;

      const rice = ZONES.rice;
      const riceMask = boxMask(x, z, rice, edgeJitter);
      if (riceMask > 0.001) {
        const terrace = rice.height + fbm(nField, x / 130, z / 130, 2) * 1.4;
        h = lerp(h, terrace, riceMask * 0.94);
      }

      // Stadt. Zwei Stufen statt einer: der Kern wird eingeebnet wie bisher,
      // das Vorfeld behält Restrelief und steigt zum Zonenrand hin leicht an.
      // Ein `lerp` über die ganze Zone hat 640 000 m² Tischplatte erzeugt, von
      // denen der Distrikt 130 000 belegt.
      const city = ZONES.city;
      const cityMask = boxMask(x, z, city, edgeJitter * 0.5);
      if (cityMask > 0.001) {
        const core = boxMask(x, z, CITY_CORE, edgeJitter * 0.3);
        const apron = 1 - core;
        const target =
          city.height +
          apron * (fbm(nField, x / 190, z / 190, 3) * CITY_APRON.relief + apron * CITY_APRON.rise);
        h = lerp(h, target, cityMask * lerp(CITY_APRON.strength, 0.96, core));
      }

      height[iy * res + ix] = h;
    }
  }

  return height;
}

// ── Schritt 5: Hydraulische Erosion ──────────────────────────────────────────

/**
 * Parameter der Droplet-Simulation. Die Werte folgen der üblichen Umsetzung
 * nach Hans Theobald Beyer ("Implementation of a method for hydraulic erosion").
 */
const EROSION = {
  /** Trägheit: 0 = Tropfen folgt exakt dem Gefälle, 1 = fliegt geradeaus. */
  inertia: 0.06,
  /** Wieviel Sediment ein Tropfen bei gegebenem Gefälle tragen kann. */
  capacityFactor: 4,
  /** Untergrenze des Gefälles — ohne sie stoppt jede Ebene die Erosion sofort. */
  minSlope: 0.01,
  erodeSpeed: 0.3,
  depositSpeed: 0.3,
  evaporation: 0.012,
  gravity: 4,
  /** Schrittzahl je Tropfen. Länger = längere, zusammenhängende Rinnen. */
  maxLifetime: 42,
  radius: 3,
  startWater: 1,
  startSpeed: 1,
};

/** Kreisrunder Pinsel mit linearem Abfall — verteilt Abtrag auf die Nachbarn. */
function makeBrush(radius) {
  const dx = [];
  const dy = [];
  const weights = [];
  let total = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const sq = x * x + y * y;
      if (sq >= radius * radius) continue;
      const w = 1 - Math.sqrt(sq) / radius;
      dx.push(x);
      dy.push(y);
      weights.push(w);
      total += w;
    }
  }
  return {
    dx: Int32Array.from(dx),
    dy: Int32Array.from(dy),
    w: Float32Array.from(weights, (w) => w / total),
  };
}

function erode(height, res, droplets, seed, onProgress) {
  const random = stream(seed, 'erosion');
  const brush = makeBrush(EROSION.radius);
  const brushCount = brush.w.length;
  const last = res - 1;

  // Tropfen starten nur über Land. Im Meer erodiert nichts, und jeder dort
  // verbrauchte Tropfen fehlt am Hang.
  const spawnLimit = 24;
  const report = Math.max(1, Math.floor(droplets / 40));

  for (let d = 0; d < droplets; d++) {
    let posX = 0;
    let posY = 0;
    for (let attempt = 0; attempt < spawnLimit; attempt++) {
      posX = random() * last;
      posY = random() * last;
      const idx = Math.floor(posY) * res + Math.floor(posX);
      if (height[idx] > SEA_LEVEL + 1) break;
    }

    let dirX = 0;
    let dirY = 0;
    let speed = EROSION.startSpeed;
    let water = EROSION.startWater;
    let sediment = 0;

    for (let life = 0; life < EROSION.maxLifetime; life++) {
      const nodeX = Math.floor(posX);
      const nodeY = Math.floor(posY);
      const cellX = posX - nodeX;
      const cellY = posY - nodeY;

      const nw = nodeY * res + nodeX;
      const ne = nw + 1;
      const sw = nw + res;
      const se = sw + 1;

      const hNW = height[nw];
      const hNE = height[ne];
      const hSW = height[sw];
      const hSE = height[se];

      // Gradient der bilinearen Fläche — analytisch, nicht per Differenz.
      const gradX = (hNE - hNW) * (1 - cellY) + (hSE - hSW) * cellY;
      const gradY = (hSW - hNW) * (1 - cellX) + (hSE - hNE) * cellX;

      const oldHeight =
        hNW * (1 - cellX) * (1 - cellY) +
        hNE * cellX * (1 - cellY) +
        hSW * (1 - cellX) * cellY +
        hSE * cellX * cellY;

      dirX = dirX * EROSION.inertia - gradX * (1 - EROSION.inertia);
      dirY = dirY * EROSION.inertia - gradY * (1 - EROSION.inertia);

      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len < 1e-8) break;
      dirX /= len;
      dirY /= len;

      posX += dirX;
      posY += dirY;
      if (posX < 0 || posY < 0 || posX >= last || posY >= last) break;

      const nX = Math.floor(posX);
      const nY = Math.floor(posY);
      const fX = posX - nX;
      const fY = posY - nY;
      const bNW = nY * res + nX;
      const newHeight =
        height[bNW] * (1 - fX) * (1 - fY) +
        height[bNW + 1] * fX * (1 - fY) +
        height[bNW + res] * (1 - fX) * fY +
        height[bNW + res + 1] * fX * fY;

      const deltaHeight = newHeight - oldHeight;

      const capacity = Math.max(
        -deltaHeight * speed * water * EROSION.capacityFactor,
        EROSION.minSlope,
      );

      if (sediment > capacity || deltaHeight > 0) {
        // Bergauf oder übersättigt: ablagern. Bergauf höchstens so viel, dass
        // die Senke gefüllt und nicht überfüllt wird — sonst entstehen Türme.
        const amount =
          deltaHeight > 0
            ? Math.min(deltaHeight, sediment)
            : (sediment - capacity) * EROSION.depositSpeed;
        sediment -= amount;

        height[nw] += amount * (1 - cellX) * (1 - cellY);
        height[ne] += amount * cellX * (1 - cellY);
        height[sw] += amount * (1 - cellX) * cellY;
        height[se] += amount * cellX * cellY;
      } else {
        // Abtrag über den Pinsel: nie mehr als das Gefälle hergibt, sonst
        // gräbt der Tropfen ein Loch statt einer Rinne.
        const amount = Math.min((capacity - sediment) * EROSION.erodeSpeed, -deltaHeight);
        for (let b = 0; b < brushCount; b++) {
          const bx = nodeX + brush.dx[b];
          const by = nodeY + brush.dy[b];
          if (bx < 0 || by < 0 || bx > last || by > last) continue;
          const bi = by * res + bx;
          const take = Math.min(height[bi], amount * brush.w[b]);
          height[bi] -= take;
          sediment += take;
        }
      }

      speed = Math.sqrt(Math.max(0, speed * speed + -deltaHeight * EROSION.gravity));
      water *= 1 - EROSION.evaporation;
      if (water < 0.01) break;
    }

    if (d % report === 0) onProgress(d / droplets);
  }
  onProgress(1);
}

// ── Schritt 6 und Ausgabe ────────────────────────────────────────────────────

/** Sobel-Normale in Weltkoordinaten. Glatter als die zentrale Differenz. */
function computeNormals(height, res, spacing) {
  const out = Buffer.alloc(res * res * 3);
  const at = (x, y) => height[clamp(y, 0, res - 1) * res + clamp(x, 0, res - 1)];

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dhdx = (tr + 2 * r + br - (tl + 2 * l + bl)) / (8 * spacing);
      const dhdz = (bl + 2 * b + br - (tl + 2 * t + tr)) / (8 * spacing);

      let nx = -dhdx;
      let ny = 1;
      let nz = -dhdz;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;

      const o = (y * res + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

/**
 * Splat-Gewichte: R = Fels, G = Gras, B = Sand, A = Reisfeld.
 *
 * Die Gewichte werden am Ende auf die Summe 1 normiert. Ohne das kann der
 * Shader nicht davon ausgehen, dass die Kanäle eine Mischung beschreiben —
 * dunkle oder ausgewaschene Flecken wären die Folge.
 */
function computeZones(height, res, spacing, zoneRes, seed) {
  // **Drei Kanäle, nicht vier.** Der vierte (Reisfeld) ist redundant, weil die
  // Gewichte auf 255 normiert werden — er ergibt sich als Rest. Ihn trotzdem
  // in den Alphakanal zu schreiben war ein Fehler mit weiter Folge: eine
  // PNG-Alpha ist für den Browser **Transparenz**, und jeder Weg über ein
  // Canvas (drawImage → getImageData) multipliziert RGB damit und rechnet es
  // wieder heraus. Wo Alpha null war — also fast überall — kam RGB als **0**
  // zurück. Die GPU war nie betroffen (three lädt ohne Premultiplikation), die
  // CPU-Seite dagegen vollständig: die Zonenneigung der Vegetationsstreuung
  // hat nie gewirkt. Siehe src/world/scatter/ZoneMap.ts.
  const data = Buffer.alloc(zoneRes * zoneRes * 3);
  const nBreak = createNoise2D(stream(seed, 'splat'));
  // Derselbe Strom wie im Höhenfeld: die Reisfeld-Maske muss exakt dort
  // liegen, wo auch eingeebnet wurde, sonst wandert die Textur über die Kante.
  const nField = createNoise2D(stream(seed, 'field'));
  const half = WORLD_SIZE / 2;
  const step = (res - 1) / (zoneRes - 1);

  for (let zy = 0; zy < zoneRes; zy++) {
    for (let zx = 0; zx < zoneRes; zx++) {
      const hx = Math.round(zx * step);
      const hy = Math.round(zy * step);
      const x = -half + hx * spacing;
      const z = -half + hy * spacing;

      const h = height[hy * res + hx];
      const hL = height[hy * res + clamp(hx - 1, 0, res - 1)];
      const hR = height[hy * res + clamp(hx + 1, 0, res - 1)];
      const hU = height[clamp(hy - 1, 0, res - 1) * res + hx];
      const hD = height[clamp(hy + 1, 0, res - 1) * res + hx];
      const dhdx = (hR - hL) / (2 * spacing);
      const dhdz = (hD - hU) / (2 * spacing);
      const slope = Math.sqrt(dhdx * dhdx + dhdz * dhdz);

      // Rauschen bricht die Grenzen auf. Ohne das zeichnen Höhen- und
      // Steilheitsschwellen als saubere Höhenlinien durch die Landschaft.
      const jitter = fbm(nBreak, x / 220, z / 220, 3) * 0.16;

      const steep = smoothstep(0.5, 1.0, slope + jitter);
      const alpine = smoothstep(300, 400, h);
      let rock = clamp(Math.max(steep, alpine * 0.85), 0, 1);

      const flat = 1 - smoothstep(0.12, 0.35, slope);
      let sand = (1 - rock) * flat * (1 - smoothstep(1.5, 7 + jitter * 12, h));

      const riceZone = boxMask(x, z, ZONES.rice, fbm(nField, x / 340, z / 340, 3) * 190);
      let paddy = (1 - rock) * flat * riceZone * smoothstep(8, 14, h);

      let grass = Math.max(0, 1 - rock - sand - paddy);

      const sum = rock + grass + sand + paddy;
      const inv = sum > 1e-5 ? 255 / sum : 0;

      const o = (zy * zoneRes + zx) * 3;
      data[o] = Math.round(rock * inv);
      data[o + 1] = Math.round(grass * inv);
      data[o + 2] = Math.round(sand * inv);
      // Reisfeld steht nicht in der Datei. Wer es braucht, rechnet
      // `max(0, 1 − rock − grass − sand)` — so machen es Shader und ZoneMap.
    }
  }
  return data;
}

/** Min/Max je 256-m-Chunk — Grundlage des Frustum-Cullings ab P4. */
function chunkBounds(height, res, spacing) {
  const perAxis = WORLD_SIZE / CHUNK_SIZE;
  const bounds = [];
  for (let cz = 0; cz < perAxis; cz++) {
    for (let cx = 0; cx < perAxis; cx++) {
      // Die Ränder überlappen um ein Texel: ein Chunk muss die Höhen seiner
      // eigenen Kante kennen, sonst reißt die Hülle an der Naht auf.
      const x0 = Math.floor((cx * CHUNK_SIZE) / spacing);
      const x1 = Math.min(res - 1, Math.ceil(((cx + 1) * CHUNK_SIZE) / spacing));
      const z0 = Math.floor((cz * CHUNK_SIZE) / spacing);
      const z1 = Math.min(res - 1, Math.ceil(((cz + 1) * CHUNK_SIZE) / spacing));

      let min = Infinity;
      let max = -Infinity;
      for (let y = z0; y <= z1; y++) {
        for (let x = x0; x <= x1; x++) {
          const h = height[y * res + x];
          if (h < min) min = h;
          if (h > max) max = h;
        }
      }
      bounds.push([Math.round(min * 100) / 100, Math.round(max * 100) / 100]);
    }
  }
  return { perAxis, chunkSize: CHUNK_SIZE, minMax: bounds };
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

// ── Schritt 5a: Die Bank ─────────────────────────────────────────────────────

/**
 * Maße der Bank — PLAN.md P8.5a.
 *
 * `tolerance` ist der eigentliche Regler: gekappt wird nicht auf den
 * Querschnittsmedian, sondern auf **Median + tolerance**. Eine Bank, die exakt
 * auf den Median zieht, ergäbe ein perfekt glattes Band durch ein raues
 * Gelände — sichtbar als Fläche, die dort nichts zu suchen hat. Mit Toleranz
 * bleibt Kleinrelief stehen und nur die Grate fallen.
 */
const BENCH = {
  /**
   * Kernbreite je Seite in Metern.
   *
   * **Der dominante Regler**, und die erste Schätzung (30 m) war zu klein: sie
   * deckt sich fast mit der Straßenböschung (±20 m), die danach ohnehin alles
   * überschreibt. Erst jenseits davon fängt die Bank an zu wirken.
   */
  halfWidth: 60,
  /** Kosinus-Auslauf darüber hinaus, damit die Bank keine Kante bekommt. */
  feather: 25,
  /** Was über dem Querschnittsmedian stehen bleiben darf, in Metern. */
  tolerance: 8,
  /** Abtastschritt im Querschnitt beim Bilden des Medians, in Metern. */
  sampleStep: 3,
};

/**
 * Das Relief im Trassenkorridor glätten — PLAN.md P8.5a, Variante B.
 *
 * **Warum überhaupt.** Die Traverse quer zur Falllinie liegt am Massiv auf 84 %
 * ihrer Länge über 30 % Neigung, bei einem Median von 104 %. Das mittlere
 * Gefälle der Flanke ist mit 25 % dagegen bereits am Zielwert — das Problem ist
 * also nicht, dass der Berg zu steil wäre, sondern dass er quer zur Fahrtrichtung
 * ein Waschbrett aus Graten und Rinnen ist. Eine Variantenserie über
 * Gratamplitude und Reiszonenlage hat gezeigt, dass sich das **global** nicht
 * lösen lässt: die beste Kombination kam auf 44 % Median und kostete dafür 38 %
 * der Gipfelhöhe. Das Problem ist lokal, also gehört die Lösung an den Ort.
 *
 * **Warum kappen und nicht zwingen.** `carveRoads` zieht das Gelände auf
 * Fahrbahnhöhe. Dasselbe über 60 m Breite zu tun wäre der naheliegende Weg und
 * ist der teure: neben der Trasse steigt der Hang steil an, „auf Fahrbahnhöhe"
 * heißt dort 50 bis 100 m Abtrag. Gemessen auf dem ausgelieferten Höhenfeld
 * entlang der `toge`-Mittellinie, je halber Breite ±30 m:
 *
 * | | Median | 95 % | Maximum | > 20 m | Volumen |
 * |---|---|---|---|---|---|
 * | auf Fahrbahnhöhe zwingen | 5,5 m | 54,7 m | 102,8 m | 22 % | 2,18 Mm³ |
 * | über Querschnittsmedian kappen | **0,0 m** | 31,8 m | 96,7 m | 9 % | 1,05 Mm³ |
 *
 * Das Kappen lässt den Hang stehen und nimmt nur, was über seinem *eigenen*
 * Querschnitt herausragt: halbes Volumen, halber Anteil über 20 m, und der
 * Median fällt auf null — der größte Teil des Korridors bleibt unberührt.
 * Umsonst ist es trotzdem nicht, 95 % liegen bei 31,8 m.
 *
 * **Was die Bank nicht tut.** Sie bringt keine zusätzlichen Kehren. Die
 * Trassierung läuft in `npm run world` auf dem *sauberen* Feld, die Bank erst
 * im zweiten Bake danach — die Linienführung kennt sie also gar nicht. Sie
 * beseitigt den Steinbruch, nicht die Ursache seiner Lage. Wer die Kehren
 * will, bräuchte einen dritten Durchgang (backen → trassieren → backen mit Bank
 * → erneut trassieren), und dafür ist SPEC §2.1 die falsche Stelle zum
 * Nachgeben: siehe die Notiz zu „≥ 8 Kehren" in PLAN.md.
 *
 * **Nur kappen, nie auffüllen.** Rinnen aufzufüllen würde aus dem Korridor eine
 * Rampe machen und den Erdbau verdoppeln; gemessen wurde Variante B als reiner
 * Abtrag, und gebaut wird, was gemessen wurde.
 *
 * ## Woher die Maße kommen
 *
 * Die erste Messgröße war falsch gewählt. „Relief im Korridor" und „Neigung
 * quer zur Fahrtrichtung" bewegten sich kaum (45,1 → 42,7 m Median bei ±30 m),
 * und beinahe wäre daraus „das Verfahren taugt nicht" geworden. Beides misst
 * innerhalb ±20 m aber gar nicht die Bank, sondern den **Straßeneinschnitt**,
 * der danach läuft und den Korridor ohnehin planiert. Was am Pass wirklich
 * stört, ist der **Anschnitt**: wie hoch das Gelände neben der Fahrbahn über
 * ihr aufragt. Alle sechs Varianten, `toge`, Band ±60 m:
 *
 * | Bank | Median | 95 % | Maximum | > 20 m | > 50 m | Abtrag |
 * |---|---|---|---|---|---|---|
 * | ohne              | 41,5 m | 97,4 m | 185,4 m | 90 % | 42 % | — |
 * | ±30 m, Toleranz 8 | 38,7 m | 92,2 m | 185,4 m | 88 % | 37 % | 0,90 Mm³ |
 * | ±30 m, Toleranz 2 | 37,8 m | 91,4 m | 185,4 m | 86 % | 36 % | 1,59 Mm³ |
 * | ±45 m, Toleranz 4 | 33,4 m | 73,5 m | 134,5 m | 74 % | 28 % | 2,51 Mm³ |
 * | **±60 m, Toleranz 8** | **23,7 m** | **65,9 m** | **90,7 m** | **59 %** | **15 %** | **3,30 Mm³** |
 * | ±60 m, Toleranz 2 | 20,0 m | 61,5 m |  84,7 m | 50 % | 12 % | 4,89 Mm³ |
 * | ±80 m, Toleranz 2 | 20,5 m | 59,9 m |  86,6 m | 51 % | 12 % | 8,00 Mm³ |
 *
 * Drei Ablesungen:
 *
 *  - **Die Breite entscheidet, nicht die Toleranz.** Bei ±30 m bringt eine
 *    Toleranz von 2 statt 8 fast nichts (38,7 → 37,8 m); von ±30 auf ±60 m
 *    halbiert sich der Anschnitt.
 *  - **±80 m ist verschenkt.** 8,00 statt 4,89 Mm³ und derselbe Wert (20,5
 *    gegen 20,0 m). Die Kurve sättigt bei ±60 m.
 *  - **Toleranz 8 statt 2 spart ein Drittel des Erdbaus** (3,30 gegen 4,89
 *    Mm³) und kostet 3,7 m Anschnitt. Sie ist außerdem das, was die Bank in der
 *    Ebene harmlos hält: gemessen bleibt `ring` bei 15,6 → 15,4 m Relief und
 *    `dorf` bei 2,0 → 2,0 m — dort ragt nichts über den Querschnittsmedian
 *    hinaus, also wird auch nichts abgetragen. Die Bank braucht deshalb keine
 *    Beschränkung auf bestimmte Straßen.
 *
 * Was sie **nicht** verbessert: den Erdbau der Fahrbahn selbst. `carveRoads`
 * meldet ⌀ 5,8 → 5,4 m und tiefsten Einschnitt −96,4 → −82,9 m über die ganze
 * Serie. Die Bank nimmt die Wand daneben weg, nicht den Graben darunter.
 */
function benchRoads(height, res, spacing, roadFile) {
  const half = WORLD_SIZE / 2;
  const reach = BENCH.halfWidth + BENCH.feather;
  const last = res - 1;

  // Nächster Texel genügt: gebildet wird ein Median über Dutzende Proben, und
  // eine bilineare Interpolation verschöbe ihn um Bruchteile eines Meters.
  const sample = (x, z) => {
    const ix = clamp(Math.round((x + half) / spacing), 0, last);
    const iz = clamp(Math.round((z + half) / spacing), 0, last);
    return height[iz * res + ix];
  };

  // ── 1. Je Knoten den Querschnittsmedian, auf dem **unveränderten** Feld.
  // Erst alle Mediane, dann anwenden: sonst hinge der Median eines Knotens
  // davon ab, ob sein Nachbar schon gekappt wurde, und das Ergebnis liefe mit
  // der Reihenfolge der Straßen in der Datei davon.
  const levels = new Map();
  for (const road of roadFile.roads) {
    const line = road.centerline;
    const count = line.length / 3;
    const perNode = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const ax = line[i * 3];
      const az = line[i * 3 + 2];
      // Tangente aus den Nachbarn — an den Enden einseitig.
      const p = road.closed ? (i - 1 + count) % count : Math.max(0, i - 1);
      const n = road.closed ? (i + 1) % count : Math.min(count - 1, i + 1);
      let tx = line[n * 3] - line[p * 3];
      let tz = line[n * 3 + 2] - line[p * 3 + 2];
      const length = Math.hypot(tx, tz) || 1;
      tx /= length;
      tz /= length;
      const nx = -tz;
      const nz = tx;

      const cross = [];
      for (let d = -BENCH.halfWidth; d <= BENCH.halfWidth; d += BENCH.sampleStep) {
        cross.push(sample(ax + nx * d, az + nz * d));
      }
      cross.sort((a, b) => a - b);
      perNode[i] = cross[cross.length >> 1];
    }
    levels.set(road.id, perNode);
  }

  // ── 2. Rasterisieren, „nächster gewinnt" wie bei `carveRoads`.
  const benchLevel = new Float32Array(res * res);
  const benchDistance = new Float32Array(res * res).fill(Infinity);

  for (const road of roadFile.roads) {
    const line = road.centerline;
    const perNode = levels.get(road.id);
    const count = line.length / 3;
    const lastSegment = road.closed ? count : count - 1;

    for (let i = 0; i < lastSegment; i++) {
      const j = road.closed ? (i + 1) % count : i + 1;
      const ax = line[i * 3];
      const az = line[i * 3 + 2];
      const bx = line[j * 3];
      const bz = line[j * 3 + 2];

      const minX = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / spacing));
      const maxX = Math.min(last, Math.ceil((Math.max(ax, bx) + reach + half) / spacing));
      const minZ = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / spacing));
      const maxZ = Math.min(last, Math.ceil((Math.max(az, bz) + reach + half) / spacing));

      const dx = bx - ax;
      const dz = bz - az;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared < 1e-8) continue;

      for (let iz = minZ; iz <= maxZ; iz++) {
        const wz = -half + iz * spacing;
        for (let ix = minX; ix <= maxX; ix++) {
          const wx = -half + ix * spacing;
          const t = clamp(((wx - ax) * dx + (wz - az) * dz) / lengthSquared, 0, 1);
          const distance = Math.hypot(wx - (ax + dx * t), wz - (az + dz * t));
          if (distance >= reach) continue;

          const index = iz * res + ix;
          if (distance >= benchDistance[index]) continue;
          benchDistance[index] = distance;
          benchLevel[index] = perNode[i] + (perNode[j] - perNode[i]) * t;
        }
      }
    }
  }

  // ── 3. Kappen.
  let touched = 0;
  let volume = 0;
  let deepest = 0;
  const cuts = [];

  for (let index = 0; index < height.length; index++) {
    const distance = benchDistance[index];
    if (!Number.isFinite(distance)) continue;

    let weight;
    if (distance <= BENCH.halfWidth) {
      weight = 1;
    } else {
      const t = (distance - BENCH.halfWidth) / BENCH.feather;
      if (t >= 1) continue;
      weight = 0.5 * (1 + Math.cos(Math.PI * t));
    }

    const before = height[index];
    const ceiling = benchLevel[index] + BENCH.tolerance;
    if (before <= ceiling) continue;

    const after = before + (ceiling - before) * weight;
    height[index] = after;

    const cut = before - after;
    cuts.push(cut);
    volume += cut * spacing * spacing;
    if (cut > deepest) deepest = cut;
    touched++;
  }

  cuts.sort((a, b) => a - b);
  return {
    touched,
    deepest,
    volume,
    percentile95: cuts[Math.floor(cuts.length * 0.95)] ?? 0,
    median: cuts[cuts.length >> 1] ?? 0,
  };
}

// ── Schritt 5b: Straßen einschneiden ─────────────────────────────────────────

/** Seitliches Auslaufen der Böschung in Metern — Spiegel von ROAD_MESH.embankment. */
const EMBANKMENT = 15;

/**
 * Straßen ins Höhenfeld einschneiden — PLAN.md P3 / 3.3.
 *
 * Läuft **nach** der Erosion. Der Plan nannte als Alternative, die Splines
 * vorher als Zwangsbedingung einzuspeisen; das wäre nötig, wenn die Erosion
 * die Straße wieder zerfressen würde. Sie tut es nicht — sie läuft nur einmal
 * und vorher. Nachher einzuschneiden hat dafür einen handfesten Vorteil: die
 * Rinnen der Erosion bleiben erhalten und laufen sichtbar an die Böschung
 * heran, statt von ihr überschrieben zu werden.
 *
 * Verfahren: pro Segment die betroffenen Texel bestimmen, den Abstand zur
 * Segmentachse messen und **den nächstliegenden Straßenpunkt gewinnen lassen**.
 * Das „nächster gewinnt" ist der Grund, warum Kreuzungen ohne Sonderbehandlung
 * funktionieren: wo zwei Straßen sich treffen, entscheidet schlicht, welche
 * näher liegt.
 *
 * Der Übergang ist ein Kosinus. Eine lineare Rampe hinterlässt am oberen Ende
 * einen Knick, und bei 2,2° Sonnenstand zeichnet jeder Knick eine harte
 * Lichtkante — dieselbe Beobachtung wie überall sonst in diesem Projekt.
 */
function carveRoads(height, res, spacing, roadFile) {
  const half = WORLD_SIZE / 2;
  const roadHeight = new Float32Array(res * res);
  const roadDistance = new Float32Array(res * res).fill(Infinity);
  const roadHalfWidth = new Float32Array(res * res);

  for (const road of roadFile.roads) {
    const line = road.centerline;
    const count = line.length / 3;
    const last = road.closed ? count : count - 1;

    for (let i = 0; i < last; i++) {
      const j = road.closed ? (i + 1) % count : i + 1;
      const ax = line[i * 3];
      const ay = line[i * 3 + 1];
      const az = line[i * 3 + 2];
      const bx = line[j * 3];
      const by = line[j * 3 + 1];
      const bz = line[j * 3 + 2];

      // Halbe Breite inklusive Bankett; die Straßendatei führt die Breite mit,
      // damit ein späterer Editor sie je Knoten verändern kann.
      const halfWidth = (road.widths[i] ?? 6) / 2 + 1.6;
      const reach = halfWidth + EMBANKMENT;

      const minX = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / spacing));
      const maxX = Math.min(res - 1, Math.ceil((Math.max(ax, bx) + reach + half) / spacing));
      const minZ = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / spacing));
      const maxZ = Math.min(res - 1, Math.ceil((Math.max(az, bz) + reach + half) / spacing));

      const dx = bx - ax;
      const dz = bz - az;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared < 1e-8) continue;

      for (let iz = minZ; iz <= maxZ; iz++) {
        const wz = -half + iz * spacing;
        for (let ix = minX; ix <= maxX; ix++) {
          const wx = -half + ix * spacing;

          const t = clamp(((wx - ax) * dx + (wz - az) * dz) / lengthSquared, 0, 1);
          const px = ax + dx * t;
          const pz = az + dz * t;
          const distance = Math.hypot(wx - px, wz - pz);
          if (distance >= reach) continue;

          const index = iz * res + ix;
          if (distance >= roadDistance[index]) continue;
          roadDistance[index] = distance;
          roadHeight[index] = ay + (by - ay) * t;
          roadHalfWidth[index] = halfWidth;
        }
      }
    }
  }

  let carved = 0;
  let deepestCut = 0;
  let highestFill = 0;
  let sumAbsolute = 0;
  const magnitudes = [];

  for (let index = 0; index < height.length; index++) {
    const distance = roadDistance[index];
    if (!Number.isFinite(distance)) continue;

    const halfWidth = roadHalfWidth[index];
    let weight;
    if (distance <= halfWidth) {
      weight = 1;
    } else {
      const t = (distance - halfWidth) / EMBANKMENT;
      if (t >= 1) continue;
      weight = 0.5 * (1 + Math.cos(Math.PI * t));
    }

    const before = height[index];
    height[index] = before + (roadHeight[index] - before) * weight;
    const delta = height[index] - before;
    if (delta < deepestCut) deepestCut = delta;
    if (delta > highestFill) highestFill = delta;
    sumAbsolute += Math.abs(delta);
    magnitudes.push(Math.abs(delta));
    carved++;
  }

  // Nicht nur der Extremwert. Er entsteht dort, wo die Böschung eine der
  // Erosionsnadeln streift, die die Heightmap in Steilhängen stehen lässt — ein
  // einzelner Texel, der 168 m abgetragen bekommt, sagt über die Trasse nichts.
  // Erst Mittelwert und 95. Perzentil trennen „eine Nadel gesprengt" von „die
  // Straße liegt auf ganzer Länge im Graben".
  magnitudes.sort((a, b) => a - b);
  const percentile95 = magnitudes[Math.floor(magnitudes.length * 0.95)] ?? 0;

  return {
    carved,
    deepestCut,
    highestFill,
    mean: sumAbsolute / Math.max(carved, 1),
    percentile95,
    // Wird von den Reisfeld-Terrassen gebraucht: eine Parzelle, die bis an die
    // Achse heranreicht, hübe die Fahrbahn mit an.
    roadDistance,
  };
}

// ── Schritt 5d: Stadtplateau ─────────────────────────────────────────────────

/**
 * Den Distrikt auf eine feste Höhe legen — PLAN.md P6 / 6.1.
 *
 * Die Stadt bringt ihre eigene Bodenplatte mit, eine exakt ebene Fläche bei
 * `CITY_SLAB_Y`. Darunter darf kein Gelände stehen. „Darunter" heißt dabei
 * nicht „tiefer im Höhenfeld", sondern **tiefer im gerenderten Gitter**, und
 * das ist ein Unterschied: das Terrain wird an den Stützstellen des
 * CDLOD-Gitters ausgelenkt, zwischen denen eine Gerade über der Kurve liegt.
 * Der erste Entwurf gab der Platte 3 cm Abstand, sauber aus 14 641 Proben
 * gerechnet — im Bild stand die Stadt trotzdem auf Gras.
 *
 * **Nach dem Straßeneinschnitt**, und das ist der ganze Grund für einen eigenen
 * Schritt: die Böschung der Stadtstraße füllt das Gelände sonst wieder auf
 * Fahrbahnhöhe auf und steht damit erneut Zentimeter unter der Platte. Hier
 * wird sie überschrieben. Die Fahrbahn selbst bleibt, wo sie ist — sie ist
 * Geometrie, kein Höhenfeld.
 */
function padCity(height, res, spacing) {
  const half = (res - 1) * spacing * 0.5;
  let touched = 0;
  let lowered = 0;
  let raised = 0;
  let deepest = 0;
  let highest = 0;

  for (let j = 0; j < res; j++) {
    const z = j * spacing - half;
    for (let i = 0; i < res; i++) {
      const x = i * spacing - half;
      const blend = districtBlend(x, z, CITY_PAD_FEATHER);
      if (blend <= 0) continue;

      const index = j * res + i;
      const before = height[index];
      const after = before + (CITY_PAD_Y - before) * blend;
      height[index] = after;

      touched++;
      const delta = after - before;
      if (delta < 0) {
        lowered++;
        if (delta < deepest) deepest = delta;
      } else if (delta > 0) {
        raised++;
        if (delta > highest) highest = delta;
      }
    }
  }

  return { touched, lowered, raised, deepest, highest };
}

// ── Schritt 5c: Reisfeld-Terrassen ───────────────────────────────────────────

const PADDY = {
  /** Mittlerer Abstand der Saatpunkte in Metern — die Parzellengröße. */
  spacing: 34,
  /** Versatz der Saatpunkte gegen das Raster, als Anteil davon. */
  jitter: 0.4,
  /** Halbe Dammbreite in Metern. */
  dam: 1.7,
  /** Höhe des Damms über dem Parzellenniveau. */
  damHeight: 0.55,
  /**
   * Terrassenstufe in Metern.
   *
   * Parzellenhöhen werden darauf gerastert. Ohne diese Rasterung bekäme jede
   * Parzelle ihre eigene Höhe, und der Hang liefe stufenlos durch — sichtbar
   * wäre dann nur ein Muster aus Dämmen, keine Terrasse. Mit 0,6 m fallen
   * benachbarte Parzellen entweder zusammen oder springen um eine erkennbare
   * Stufe.
   */
  step: 0.6,
  /**
   * Ab welchem Reisfeldgewicht eingeebnet wird.
   *
   * **Dieser Wert entscheidet über die Kehren am Bergpass**, und das war nicht
   * vorhersehbar. Die Reisfeldzone hat einen 380 m breiten weichen Rand; wo er
   * hinreicht, ändert das Einebnen die Kostenfläche, auf der der
   * Straßengenerator seine Trasse sucht. Gemessen, jeweils `bake:clean` gefolgt
   * von `gen-roads`:
   *
   * | Schwelle | Parzellen | Niveaubereich | Tōge | Kehren |
   * |---|---|---|---|---|
   * | keine Terrassen | — | — | 2983 m | **2** |
   * | 0,40 | 937 | 17,4…117,0 m | 3073 m | **1** |
   * | 0,55 | 841 | 18,6…58,8 m | 3003 m | **3** |
   *
   * 0,40 kostete eine Kehre und ließ Parzellen bis auf 117 m klettern — also
   * bis weit in die Hänge hinein, wo sie den Fuß des Passes verändern. 0,55
   * hält sie im Tal (58,8 m) und gibt sogar eine Kehre mehr her als das
   * unberührte Gelände.
   *
   * Der Zusammenhang gehört hierher notiert, weil er nicht zu erraten ist: wer
   * an dieser Zahl dreht, dreht am Bergpass mit und muss `npm run world`
   * ansehen, nicht nur die Reisfelder.
   */
  minWeight: 0.55,
  /** Abstand zur Straßenachse, in Metern. */
  roadClearance: 16,
  /** Auflösung der Wassermaske. 1024 über 3072 m sind 3 m je Texel. */
  maskRes: 1024,
};

/**
 * Reisfeld-Parzellen einebnen — PLAN.md P5 / 5.4.
 *
 * **Warum im Baker und nicht zur Laufzeit.** Der naheliegende Weg wäre, eine
 * flache Wasserfläche über das Gelände zu legen. Gemessen trägt die
 * Reisfeldzone 101,2 ha bei einer Höhenspanne von 17,7 bis 123,8 m, und die
 * Höhendifferenz innerhalb einer 30-m-Zelle liegt im Median bei 1,10 m, im
 * 95. Perzentil aber bei **7,41 m** und im Extrem bei 33,85 m. Eine ebene
 * Fläche darüber würde an jedem zwanzigsten Feld vom Gelände durchstoßen.
 * Eingeebnet werden muss das Gelände selbst — und dann sehen es auch
 * Vegetationsstreuung, Prop-Platzierung und Höhenabfrage.
 *
 * Verfahren: Voronoi über gejitterte Saatpunkte. Jede Zelle bekommt das
 * gerasterte Mittel ihrer eigenen Höhen; auf der Zellgrenze bleibt ein Damm
 * stehen. „Nächster Saatpunkt gewinnt" ist dieselbe Regel wie beim
 * Straßeneinschnitt, und sie löst dasselbe Problem: Grenzen entstehen von
 * selbst, ohne Sonderfall.
 *
 * Läuft **nach** dem Straßeneinschnitt und hält Abstand zur Achse — sonst
 * hübe eine Parzelle die Fahrbahn mit an.
 */
function terracePaddies(height, res, spacing, seed, roadDistance) {
  const half = WORLD_SIZE / 2;
  const nField = createNoise2D(stream(seed, 'field'));
  const rng = mulberry32((seed ^ 0x9d2c5680) >>> 0);

  // 1. Maske: wo darf überhaupt eingeebnet werden? Dieselbe Formel wie in
  //    `computeZones`, nur auf dem Höhengitter statt auf dem Zonengitter — die
  //    Zonen entstehen erst danach und sähen sonst ein Gelände, das es zum
  //    Zeitpunkt ihrer Berechnung noch nicht gab.
  const weight = new Float32Array(res * res);
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const index = iz * res + ix;
      const x = -half + ix * spacing;
      const z = -half + iz * spacing;
      const h = height[index];
      const hL = height[iz * res + clamp(ix - 1, 0, res - 1)];
      const hR = height[iz * res + clamp(ix + 1, 0, res - 1)];
      const hU = height[clamp(iz - 1, 0, res - 1) * res + ix];
      const hD = height[clamp(iz + 1, 0, res - 1) * res + ix];
      const slope = Math.hypot((hR - hL) / (2 * spacing), (hD - hU) / (2 * spacing));

      const flat = 1 - smoothstep(0.12, 0.35, slope);
      const zone = boxMask(x, z, ZONES.rice, fbm(nField, x / 340, z / 340, 3) * 190);
      let w = flat * zone * smoothstep(8, 14, h);
      if (roadDistance) {
        w *= smoothstep(PADDY.roadClearance, PADDY.roadClearance + 12, roadDistance[index]);
      }
      weight[index] = w;
    }
  }

  // 2. Saatpunkte auf einem gejitterten Raster. Ein echtes Poisson-Sampling
  //    wäre gleichmäßiger und hier ohne Wert: die Parzellen sollen ohnehin
  //    ungleich groß sein.
  const seeds = [];
  const grid = PADDY.spacing;
  for (let z = -half; z < half; z += grid) {
    for (let x = -half; x < half; x += grid) {
      const sx = x + grid * (0.5 + (rng() - 0.5) * 2 * PADDY.jitter);
      const sz = z + grid * (0.5 + (rng() - 0.5) * 2 * PADDY.jitter);
      const ix = Math.round((sx + half) / spacing);
      const iz = Math.round((sz + half) / spacing);
      if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
      if (weight[iz * res + ix] < PADDY.minWeight) continue;
      seeds.push({ x: sx, z: sz, heights: [], count: 0, level: 0 });
    }
  }
  if (!seeds.length) return null;

  // Suchraster über die Saatpunkte: sonst kostet „nächster Saatpunkt" für jeden
  // der 4,2 Mio. Texel einen Durchlauf über alle Punkte.
  const cellSize = PADDY.spacing * 2;
  const columns = Math.ceil(WORLD_SIZE / cellSize) + 1;
  const buckets = new Map();
  seeds.forEach((s, index) => {
    const key =
      Math.floor((s.z + half) / cellSize) * columns + Math.floor((s.x + half) / cellSize);
    const list = buckets.get(key);
    if (list) list.push(index);
    else buckets.set(key, [index]);
  });

  /** Die zwei nächsten Saatpunkte zu einer Weltposition. */
  const nearestTwo = (x, z) => {
    const cx = Math.floor((x + half) / cellSize);
    const cz = Math.floor((z + half) / cellSize);
    let best = -1;
    let d1 = Infinity;
    let d2 = Infinity;
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        const list = buckets.get((cz + oz) * columns + (cx + ox));
        if (!list) continue;
        for (const index of list) {
          const s = seeds[index];
          const d = Math.hypot(s.x - x, s.z - z);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = index;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
    }
    return { index: best, d1, d2 };
  };

  // 3. Erster Durchlauf: jede Zelle sammelt die Höhen ihrer eigenen Texel.
  const owner = new Int32Array(res * res).fill(-1);
  const border = new Float32Array(res * res);
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const index = iz * res + ix;
      if (weight[index] < 0.05) continue;
      const x = -half + ix * spacing;
      const z = -half + iz * spacing;
      const { index: seedIndex, d1, d2 } = nearestTwo(x, z);
      if (seedIndex < 0) continue;
      owner[index] = seedIndex;
      // Abstand zur Zellgrenze: bei Voronoi ist (d2 − d1) / 2 genau das.
      border[index] = (d2 - d1) * 0.5;
      // **Nur volle Texel zählen mit.** Der Rand einer Zone ist ausgefranst;
      // nähme man ihn ins Mittel, zöge er das Niveau der ganzen Parzelle mit
      // sich.
      if (weight[index] >= PADDY.minWeight) seeds[seedIndex].heights.push(height[index]);
      seeds[seedIndex].count++;
    }
  }
  for (const s of seeds) {
    if (!s.heights.length) {
      s.count = 0;
      continue;
    }
    // **Median statt Mittel.** Eine Parzelle, die über eine Geländestufe
    // hinweg liegt, hat zwei Höhenniveaus; das Mittel landet dazwischen und
    // gehört zu keinem von beiden — die Parzelle würde auf der einen Hälfte
    // ausgehoben und auf der anderen aufgeschüttet. Der Median wählt das
    // Niveau, auf dem die Mehrheit der Fläche ohnehin schon liegt.
    s.heights.sort((a, b) => a - b);
    const median = s.heights[Math.floor(s.heights.length / 2)];
    s.level = Math.round(median / PADDY.step) * PADDY.step;
  }

  // 4. Zweiter Durchlauf: einebnen, Damm stehen lassen, Wassermaske schreiben.
  const mask = Buffer.alloc(PADDY.maskRes * PADDY.maskRes);
  const maskStep = (res - 1) / (PADDY.maskRes - 1);
  let levelled = 0;
  let deepest = 0;
  let highest = 0;

  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const index = iz * res + ix;
      const seedIndex = owner[index];
      if (seedIndex < 0) continue;
      const s = seeds[seedIndex];
      if (!s.count) continue;

      // Der Damm ist ein Rücken auf der Zellgrenze: voll auf der Grenze, in
      // `dam` Metern Abstand wieder auf Parzellenniveau. Ein Kosinus statt einer
      // Rampe, aus demselben Grund wie beim Straßeneinschnitt — ein Knick
      // zeichnet bei 2,23° Sonnenstand eine harte Lichtkante.
      const t = clamp(border[index] / PADDY.dam, 0, 1);
      const crest = 0.5 * (1 + Math.cos(Math.PI * t));
      const target = s.level + PADDY.damHeight * crest;

      const before = height[index];
      // **Was zu weit vom Parzellenniveau abweicht, bleibt stehen.**
      //
      // Ohne diese Sperre hat der erste Lauf 113,3 m tief abgetragen und 55,8 m
      // hoch aufgeschüttet: eine Parzelle, deren Zelle über eine Steilkante
      // reicht, ebnet den Abhang mit ein. Das Ergebnis wäre keine Terrasse,
      // sondern ein Krater. Mit der Sperre hört die Parzelle dort auf, wo das
      // Gelände nicht mehr zu ihr passt — und genau so enden echte Terrassen
      // auch: an der Böschung.
      const fit = 1 - smoothstep(2.5, 6, Math.abs(before - s.level));
      const blend = smoothstep(0.05, PADDY.minWeight, weight[index]) * fit;
      if (blend < 0.01) continue;
      height[index] = before + (target - before) * blend;
      const delta = height[index] - before;
      if (delta < deepest) deepest = delta;
      if (delta > highest) highest = delta;
      levelled++;
    }
  }

  // Die Wassermaske entsteht aus dem **eingeebneten** Feld: Wasser steht dort,
  // wo die Parzelle voll durchgesetzt ist und kein Damm im Weg liegt.
  for (let my = 0; my < PADDY.maskRes; my++) {
    for (let mx = 0; mx < PADDY.maskRes; mx++) {
      const ix = Math.round(mx * maskStep);
      const iz = Math.round(my * maskStep);
      const index = iz * res + ix;
      const seedIndex = owner[index];
      let value = 0;
      if (seedIndex >= 0 && seeds[seedIndex].heights.length) {
        // Dieselben drei Bedingungen wie beim Einebnen: volle Zone, kein Damm,
        // und das Gelände muss zur Parzelle passen. Ein Wasserspiegel über
        // nicht eingeebnetem Boden wäre eine Pfütze am Hang.
        const full = weight[index] >= PADDY.minWeight ? 1 : 0;
        const dry = border[index] < PADDY.dam ? 0 : 1;
        const fits = Math.abs(height[index] - seeds[seedIndex].level) < 0.4 ? 1 : 0;
        value = full * dry * fits * 255;
      }
      mask[my * PADDY.maskRes + mx] = value;
    }
  }

  const used = seeds.filter((s) => s.count).length;
  const levels = seeds.filter((s) => s.count).map((s) => s.level);
  return {
    mask,
    maskRes: PADDY.maskRes,
    parcels: used,
    levelled,
    deepest,
    highest,
    minLevel: Math.min(...levels),
    maxLevel: Math.max(...levels),
    /** Wasserstand über dem Parzellenniveau — die Laufzeit legt ihn darauf. */
    waterDepth: 0.3,
    damHeight: PADDY.damHeight,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return opts;
}

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const seed = Number(opts.seed ?? 20260725);
  const res = Number(opts.res ?? 2048);
  const droplets = Number(opts.erosion ?? 2_000_000);
  const zoneRes = Number(opts.zones ?? 1024);
  // `fileURLToPath`, nicht `.pathname`: unter Windows liefert letzteres
  // `/P:/projects/japanMap/` — mit führendem Schrägstrich vor dem Laufwerk.
  // `join` hält das für einen relativen Pfad und hängt es an das aktuelle
  // Verzeichnis; heraus kommt `P:\P:\projects\…`, und mkdir bricht mit ENOENT
  // ab. Auf POSIX sind beide Wege identisch.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const outDir = join(root, opts.out ?? 'assets/generated/terrain');

  if (!Number.isInteger(seed)) throw new Error('--seed muss eine ganze Zahl sein.');
  if (res < 64) throw new Error('--res ist zu klein.');

  // P8.5a-Regler. Der Reisversatz wirkt über `ZONES` und damit an allen drei
  // Stellen, die die Zone lesen (Einebnung, Zonenmaske, Reisfeld-Parzellen) —
  // eine einzelne davon zu verschieben ergäbe eine Zone, die je nach Frage
  // woanders liegt.
  EXPERIMENT.ridge = Number(opts.ridge ?? 1);
  EXPERIMENT.riceShift = Number(opts['rice-shift'] ?? 0);
  BENCH.halfWidth = Number(opts['bench-width'] ?? BENCH.halfWidth);
  BENCH.tolerance = Number(opts['bench-tolerance'] ?? BENCH.tolerance);
  ZONES.rice.z += EXPERIMENT.riceShift;
  if (EXPERIMENT.ridge !== 1 || EXPERIMENT.riceShift !== 0) {
    console.log(
      c.yellow(
        `  Versuchsaufbau: Gratamplitude ×${EXPERIMENT.ridge}, ` +
          `Reiszone ${EXPERIMENT.riceShift >= 0 ? '+' : ''}${EXPERIMENT.riceShift} m nach Süden.`,
      ),
    );
  }

  // Abstand zweier Abtastpunkte. Bewusst size/(res-1) und nicht size/res:
  // die Heightmap ist ein Gitter von Stützstellen, dessen äußerste Reihe genau
  // auf der Weltkante liegt. Nur so decken bilineare Interpolation auf CPU und
  // GPU exakt [-half, +half] ab — sonst fehlt am Rand ein halbes Texel und das
  // Terrain bekommt dort eine Naht.
  const spacing = WORLD_SIZE / (res - 1);

  console.log(c.bold('\njapanMap — Terrain backen'));
  console.log(
    c.dim(
      `  Seed ${seed} · ${res}×${res} · ${spacing.toFixed(4)} m/Texel · ` +
        `${droplets.toLocaleString('de-DE')} Tropfen\n`,
    ),
  );

  const t0 = Date.now();
  process.stdout.write('  1-4  Höhenfeld … ');
  const height = buildHeightField(res, seed, spacing);
  console.log(c.green('fertig') + c.dim(` ${((Date.now() - t0) / 1000).toFixed(1)} s`));

  const t1 = Date.now();
  erode(height, res, droplets, seed, (ratio) => {
    const done = Math.round(ratio * 30);
    const eta = ratio > 0.02 ? ((Date.now() - t1) / ratio) * (1 - ratio) / 1000 : NaN;
    process.stdout.write(
      `\r  5    Erosion  [${'█'.repeat(done)}${'·'.repeat(30 - done)}] ` +
        `${(ratio * 100).toFixed(0).padStart(3)} %` +
        (Number.isFinite(eta) ? c.dim(`  noch ~${eta.toFixed(0)} s   `) : '        '),
    );
  });
  console.log(c.green('  fertig') + c.dim(` ${((Date.now() - t1) / 1000).toFixed(1)} s`));

  // Nach der Erosion clampen: einzelne Tropfen können Senken minimal unter den
  // Meeresboden graben oder Grate überhöhen.
  let actualMin = Infinity;
  let actualMax = -Infinity;
  let clamped = 0;
  for (let i = 0; i < height.length; i++) {
    const h = height[i];
    if (h < MIN_HEIGHT || h > MAX_HEIGHT) clamped++;
    const v = clamp(h, MIN_HEIGHT, MAX_HEIGHT);
    height[i] = v;
    if (v < actualMin) actualMin = v;
    if (v > actualMax) actualMax = v;
  }
  if (clamped > 0) {
    const percent = ((clamped / height.length) * 100).toFixed(3);
    console.log(c.yellow(`  ⚠ ${clamped} Texel (${percent} %) auf den Höhenbereich beschnitten.`));
  }

  // Straßen einschneiden. Fehlt roads.json, wird das Terrain ohne Straßen
  // gebacken — genau so entsteht der erste Durchlauf, denn der Generator
  // braucht seinerseits ein fertiges Höhenfeld. Die Reihenfolge nach einem
  // frischen Clone ist deshalb: bake → gen-roads → bake.
  //
  // `--no-roads` erzwingt den Zustand *vor* dem Einschneiden. Ohne diesen
  // Schalter frisst sich die Kette selbst auf: `npm run world` bäckt, erzeugt
  // Straßen, bäckt erneut — und der **erste** Bake schnitt die Straßen des
  // vorherigen Laufs bereits ein. Der Generator trassierte dann durch eigene
  // Einschnitte, und das Ergebnis wanderte bei jedem Lauf weiter. Sichtbar
  // wurde es an der Dorfstraße: ihr Mindestradius fiel von 21,8 m auf 8,1 m,
  // ohne dass sich an ihrem Quelltext etwas geändert hätte.
  const roadPath = join(outDir, '..', 'roads', 'roads.json');
  let roadReport = null;
  try {
    if (opts['no-roads']) throw Object.assign(new Error('übersprungen'), { code: 'ENOENT' });
    const roadFile = JSON.parse(await readFile(roadPath, 'utf8'));

    // Bank **vor** dem Einschnitt: sie glättet das Umfeld, der Einschnitt legt
    // danach die Fahrbahn hinein. Andersherum würde die Bank die frisch
    // planierte Fahrbahn wieder gegen ihren eigenen Querschnittsmedian kappen
    // und das Straßenprofil zerstören.
    if (opts['no-bench']) {
      console.log(c.dim('  5a   --no-bench: Korridor ungeglättet.'));
    } else {
      process.stdout.write('  5a   Bank … ');
      const benchReport = benchRoads(height, res, spacing, roadFile);
      console.log(
        c.green('fertig') +
          c.dim(
            ` ${benchReport.touched.toLocaleString('de-DE')} Texel · ` +
              `Median ${benchReport.median.toFixed(1)} m · ` +
              `95 % unter ${benchReport.percentile95.toFixed(1)} m · ` +
              `tiefster Abtrag ${benchReport.deepest.toFixed(1)} m · ` +
              `${(benchReport.volume / 1e6).toFixed(2)} Mm³`,
          ),
      );
    }

    process.stdout.write('  5b   Straßen einschneiden … ');
    roadReport = carveRoads(height, res, spacing, roadFile);
    console.log(
      c.green('fertig') +
        c.dim(
          ` ${roadReport.carved.toLocaleString('de-DE')} Texel · ` +
            `⌀ ${roadReport.mean.toFixed(1)} m · ` +
            `95 % unter ${roadReport.percentile95.toFixed(1)} m · ` +
            `Einschnitt bis ${roadReport.deepestCut.toFixed(1)} m · ` +
            `Auftrag bis ${roadReport.highestFill.toFixed(1)} m`,
        ),
    );

    actualMin = Infinity;
    actualMax = -Infinity;
    for (let i = 0; i < height.length; i++) {
      const v = clamp(height[i], MIN_HEIGHT, MAX_HEIGHT);
      height[i] = v;
      if (v < actualMin) actualMin = v;
      if (v > actualMax) actualMax = v;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(
      c.dim(
        opts['no-roads']
          ? '  5b   --no-roads: Terrain ohne Einschnitte.'
          : '  5b   Keine roads.json — Terrain ohne Straßen.',
      ),
    );
  }

  // Reisfeld-Terrassen. **Nach** dem Straßeneinschnitt, damit die Parzellen um
  // die Fahrbahn herum aufhören statt sie mit anzuheben — und vor der
  // Zonenmaske, damit die eingeebnete Fläche als Reisfeld texturiert wird.
  process.stdout.write('  5c   Reisfeld-Terrassen … ');
  const paddyReport = terracePaddies(height, res, spacing, seed, roadReport?.roadDistance ?? null);
  if (paddyReport) {
    console.log(
      c.green('fertig') +
        c.dim(
          ` ${paddyReport.parcels} Parzellen · ` +
            `${paddyReport.levelled.toLocaleString('de-DE')} Texel · ` +
            `Niveau ${paddyReport.minLevel.toFixed(1)}…${paddyReport.maxLevel.toFixed(1)} m · ` +
            `Abtrag bis ${paddyReport.deepest.toFixed(1)} m · ` +
            `Auftrag bis ${paddyReport.highest.toFixed(1)} m`,
        ),
    );
    actualMin = Infinity;
    actualMax = -Infinity;
    for (let i = 0; i < height.length; i++) {
      const v = clamp(height[i], MIN_HEIGHT, MAX_HEIGHT);
      height[i] = v;
      if (v < actualMin) actualMin = v;
      if (v > actualMax) actualMax = v;
    }
  } else {
    console.log(c.dim('keine Parzellen gefunden.'));
  }

  // Stadtplateau. **Nach** dem Straßeneinschnitt — Begründung bei `padCity`.
  process.stdout.write('  5d   Stadtplateau … ');
  const cityReport = padCity(height, res, spacing);
  console.log(
    c.green('fertig') +
      c.dim(
        ` ${cityReport.touched.toLocaleString('de-DE')} Texel auf ${CITY_PAD_Y} m · ` +
          `${cityReport.lowered.toLocaleString('de-DE')} abgetragen (bis ${cityReport.deepest.toFixed(2)} m) · ` +
          `${cityReport.raised.toLocaleString('de-DE')} aufgefüllt (bis +${cityReport.highest.toFixed(2)} m)`,
      ),
  );

  process.stdout.write('  6    Zonenmaske, Normalen, Kodierung … ');

  // height.r16 — roh, 16 Bit, little endian. Der Wertebereich ist der
  // *konfigurierte* (MIN_HEIGHT..MAX_HEIGHT), nicht der gemessene: nur so
  // kennt die Laufzeit den Dekodierfaktor, ohne meta.json abzuwarten.
  const raw = new Uint16Array(height.length);
  for (let i = 0; i < height.length; i++) {
    raw[i] = Math.round(clamp((height[i] - MIN_HEIGHT) / HEIGHT_RANGE, 0, 1) * 65535);
  }
  const rawBuffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);

  const preview = Buffer.alloc(res * res);
  for (let i = 0; i < height.length; i++) preview[i] = raw[i] >> 8;

  const normals = computeNormals(height, res, spacing);
  const zones = computeZones(height, res, spacing, zoneRes, seed);

  const previewBuffer = writePng(preview, res, res, 0);
  const normalBuffer = writePng(normals, res, res, 2);
  const zoneBuffer = writePng(zones, zoneRes, zoneRes, 2);
  // Wassermaske der Reisfelder, Graustufen. Die **Höhe** steht nicht darin: das
  // Gelände ist innerhalb einer Parzelle exakt eben, die Laufzeit holt sie
  // deshalb aus derselben Heightmap wie alles andere und schlägt den
  // Wasserstand auf. Zwei Quellen für dieselbe Zahl wären genau die
  // Doppelimplementierung, die dieses Projekt schon zweimal eingeholt hat.
  const paddyBuffer = paddyReport ? writePng(paddyReport.mask, paddyReport.maskRes, paddyReport.maskRes, 0) : null;
  console.log(c.green('fertig'));

  const meta = {
    generator: 'tools/bake-terrain.mjs',
    seed,
    /**
     * Sind in diesem Höhenfeld bereits Straßen eingeschnitten?
     *
     * Steht hier, damit der Straßengenerator es **prüfen** kann statt es
     * anzunehmen. Die Kette ist zirkulär — der Generator braucht ein Höhenfeld,
     * der Baker braucht die Straßen — und wird durch zweimaliges Backen
     * aufgelöst. Wer den Generator gegen ein schon eingeschnittenes Feld laufen
     * lässt, trassiert durch eigene Einschnitte und bekommt Zahlen, die niemand
     * reproduzieren kann. Genau das ist mehrfach passiert.
     */
    carved: roadReport !== null,
    world: {
      size: WORLD_SIZE,
      seaLevel: SEA_LEVEL,
      minHeight: MIN_HEIGHT,
      maxHeight: MAX_HEIGHT,
    },
    heightmap: {
      file: 'height.r16',
      res,
      spacing,
      encoding: 'uint16le',
      /** h = minHeight + (raw / 65535) * heightRange */
      heightRange: HEIGHT_RANGE,
    },
    normals: { file: 'normal.png', res, encoding: 'rgb8-world-normal' },
    zones: {
      file: 'zones.png',
      res: zoneRes,
      encoding: 'rgb8-splat',
      channels: ['rock', 'grass', 'sand'],
      /** Der vierte Kanal ergibt sich als Rest — siehe computeZones. */
      impliedChannel: 'paddy',
    },
    paddies: paddyReport
      ? {
          file: 'paddy.png',
          res: paddyReport.maskRes,
          encoding: 'gray8-wassermaske',
          parcels: paddyReport.parcels,
          waterDepth: paddyReport.waterDepth,
          damHeight: paddyReport.damHeight,
          levelRange: [paddyReport.minLevel, paddyReport.maxLevel],
        }
      : null,
    measured: {
      minHeight: Math.round(actualMin * 100) / 100,
      maxHeight: Math.round(actualMax * 100) / 100,
      clampedTexels: clamped,
    },
    erosion: { droplets, ...EROSION },
    chunks: chunkBounds(height, res, spacing),
    // Prüfsummen der Binärausgaben. Zwei Läufe mit gleichem Seed müssen
    // dieselben Werte liefern — das ist das Akzeptanzkriterium aus PLAN.md P1.
    checksums: {
      'height.r16': sha256(rawBuffer),
      'height_preview.png': sha256(previewBuffer),
      'normal.png': sha256(normalBuffer),
      'zones.png': sha256(zoneBuffer),
      ...(paddyBuffer ? { 'paddy.png': sha256(paddyBuffer) } : {}),
    },
  };

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, 'height.r16'), rawBuffer),
    writeFile(join(outDir, 'height_preview.png'), previewBuffer),
    writeFile(join(outDir, 'normal.png'), normalBuffer),
    writeFile(join(outDir, 'zones.png'), zoneBuffer),
    ...(paddyBuffer ? [writeFile(join(outDir, 'paddy.png'), paddyBuffer)] : []),
    writeFile(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`),
  ]);

  const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
  console.log(c.bold('\n  Ausgabe'));
  console.log(`    height.r16          ${mb(rawBuffer.length).padStart(9)}  ${c.dim(meta.checksums['height.r16'].slice(0, 16))}`);
  console.log(`    height_preview.png  ${mb(previewBuffer.length).padStart(9)}  ${c.dim(meta.checksums['height_preview.png'].slice(0, 16))}`);
  console.log(`    normal.png          ${mb(normalBuffer.length).padStart(9)}  ${c.dim(meta.checksums['normal.png'].slice(0, 16))}`);
  console.log(`    zones.png           ${mb(zoneBuffer.length).padStart(9)}  ${c.dim(meta.checksums['zones.png'].slice(0, 16))}`);
  console.log(
    c.dim(
      `\n  Höhe gemessen: ${meta.measured.minHeight} … ${meta.measured.maxHeight} m` +
        `  ·  Gesamt ${((Date.now() - t0) / 1000).toFixed(1)} s\n`,
    ),
  );
}

main().catch((error) => {
  console.error(`\n${error.stack ?? error.message}`);
  process.exitCode = 1;
});
