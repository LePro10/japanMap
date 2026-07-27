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
import { createNoise2D } from 'simplex-noise';
import { PNG } from 'pngjs';

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
        h += r * 645 * massif;
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

      const city = ZONES.city;
      const cityMask = boxMask(x, z, city, edgeJitter * 0.5);
      if (cityMask > 0.001) {
        h = lerp(h, city.height, cityMask * 0.96);
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
  const data = Buffer.alloc(zoneRes * zoneRes * 4);
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

      const o = (zy * zoneRes + zx) * 4;
      data[o] = Math.round(rock * inv);
      data[o + 1] = Math.round(grass * inv);
      data[o + 2] = Math.round(sand * inv);
      data[o + 3] = Math.round(paddy * inv);
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
  const outDir = join(new URL('..', import.meta.url).pathname, opts.out ?? 'assets/generated/terrain');

  if (!Number.isInteger(seed)) throw new Error('--seed muss eine ganze Zahl sein.');
  if (res < 64) throw new Error('--res ist zu klein.');

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
  const zoneBuffer = writePng(zones, zoneRes, zoneRes, 6);
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
    zones: { file: 'zones.png', res: zoneRes, channels: ['rock', 'grass', 'sand', 'paddy'] },
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
    },
  };

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, 'height.r16'), rawBuffer),
    writeFile(join(outDir, 'height_preview.png'), previewBuffer),
    writeFile(join(outDir, 'normal.png'), normalBuffer),
    writeFile(join(outDir, 'zones.png'), zoneBuffer),
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
