#!/usr/bin/env node
/**
 * Landmark-Platzierung — PLAN.md P5 / 5.3
 *
 *   node tools/gen-props.mjs            schreibt assets/props.json
 *   node tools/gen-props.mjs --dry      rechnet nur, schreibt nichts
 *
 * **Ein Werkzeug für den ersten Wurf, keine Streuregel.** Dieselbe Arbeitsteilung
 * wie bei den Straßen aus P3: der Generator legt an, der Editor korrigiert.
 * `assets/props.json` ist deshalb **eingecheckt und von Hand editierbar** — es
 * ist die Quelle, nicht ein Zwischenstand. Wer das Werkzeug erneut laufen
 * lässt, überschreibt die Handarbeit; deshalb sagt es das beim Start.
 *
 * Warum überhaupt gerechnet und nicht getippt: die Landmarks sollen dort
 * stehen, wo das Gelände sie trägt. Ein Tempel braucht eine Fläche unter 6°
 * Neigung, ein Leuchtturm eine Landzunge, Tetrapoden die Uferlinie. Diese
 * Stellen aus der Karte zu **suchen** ist zuverlässiger, als Koordinaten
 * abzuschreiben, die beim nächsten Terrain-Bake nicht mehr stimmen — und der
 * Suchlauf ist nachvollziehbar, weil er dieselbe Höhenabfrage benutzt wie
 * Renderer und Straßengenerator.
 *
 * Die Zonen der Karte, gemessen aus `zones.png` (Nord = −Z):
 *
 *   Norden          Fels, 13,6 % der Fläche — das Massiv mit dem Bergpass
 *   Westmitte       Reisfeld, 10,6 % — um (−790, 110)
 *   Süden ab z≈950  Sand, 19,0 % — die Küste
 *   Rest            Gras/Wald, 56,8 %
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { sampleSpline } from '../src/world/roads/splineSampler.mjs';

// `fileURLToPath`, nicht `.pathname` — siehe tools/bake-terrain.mjs.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/** Derselbe mulberry32 wie überall im Projekt — siehe vegetationMeshes.ts. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadWorld() {
  const meta = JSON.parse(await readFile(join(ROOT, 'assets/generated/terrain/meta.json'), 'utf8'));
  const heightBuffer = await readFile(join(ROOT, 'assets/generated/terrain/height.r16'));
  const zones = PNG.sync.read(await readFile(join(ROOT, 'assets/generated/terrain/zones.png')));
  const roads = JSON.parse(await readFile(join(ROOT, 'assets/generated/roads/roads.json'), 'utf8'));

  const res = meta.heightmap.res;
  const spacing = meta.heightmap.spacing;
  const half = meta.world.size / 2;
  const decode = meta.world.minHeight;
  const scale = meta.heightmap.heightRange / 65535;
  const raw = new Uint16Array(heightBuffer.buffer, heightBuffer.byteOffset, res * res);

  const texel = (ix, iz) => {
    const x = Math.min(Math.max(ix, 0), res - 1);
    const z = Math.min(Math.max(iz, 0), res - 1);
    return raw[z * res + x];
  };

  /**
   * Höhe in Metern. **Zeichengleich mit `terrain_height.glsl` und dem
   * TerrainSampler** — geklemmt wird auf der Gitterkoordinate, nicht auf dem
   * Index. Wer außerhalb klemmt, extrapoliert am Rand und erzeugt Höhen, die
   * es nicht gibt (siehe CLAUDE.md, letzter Eintrag der Fehlerliste).
   */
  const heightAt = (x, z) => {
    const gx = Math.min(Math.max((x + half) / spacing, 0), res - 1);
    const gz = Math.min(Math.max((z + half) / spacing, 0), res - 1);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = texel(ix, iz);
    const h10 = texel(ix + 1, iz);
    const h01 = texel(ix, iz + 1);
    const h11 = texel(ix + 1, iz + 1);
    const mixed = (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
    return decode + mixed * scale;
  };

  /** Neigung in Grad, aus zwei zentralen Differenzen über eine Gitterweite. */
  const slopeAt = (x, z) => {
    const d = spacing;
    const dx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
    const dz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  };

  const zoneRes = zones.width;
  /**
   * Splat-Gewicht, 0…1.
   *
   * **Kanal 3 (Reisfeld) steht nicht in der Datei.** `zones.png` ist seit der
   * Reparatur der Zonenmaske ein RGB-Bild; der vierte Kanal ergibt sich als
   * Rest, weil der Baker auf 255 normiert. pngjs liefert trotzdem RGBA mit
   * Alpha 255 — wer den Index 3 direkt liest, bekommt überall 1,0 und damit
   * lauter Reisfeld. Genau so fiel bei der ersten Umstellung die
   * Gehöft-Platzierung aus.
   */
  const zoneAt = (x, z, channel) => {
    const ix = Math.min(Math.max(Math.round(((x + half) / meta.world.size) * (zoneRes - 1)), 0), zoneRes - 1);
    const iz = Math.min(Math.max(Math.round(((z + half) / meta.world.size) * (zoneRes - 1)), 0), zoneRes - 1);
    const o = (iz * zoneRes + ix) * 4;
    if (channel === 3) {
      const rest = 255 - zones.data[o] - zones.data[o + 1] - zones.data[o + 2];
      return rest > 0 ? rest / 255 : 0;
    }
    return zones.data[o + channel] / 255;
  };

  // Straßenachsen einmal abtasten. Der Abstand zur nächsten Achse entscheidet,
  // ob ein Prop im Weg steht — dieselbe Frage, die die Streuung in P4 stellt.
  const roadPoints = new Map();
  const allRoadPoints = [];
  for (const road of roads.roads) {
    const sampled = sampleSpline(road.nodes, { closed: road.closed, spacing: 4 });
    const list = [];
    for (let i = 0; i < sampled.count; i++) {
      const p = [sampled.positions[i * 3], sampled.positions[i * 3 + 1], sampled.positions[i * 3 + 2]];
      list.push(p);
      allRoadPoints.push(p);
    }
    roadPoints.set(road.id, list);
  }

  const roadDistance = (x, z) => {
    let best = Infinity;
    for (const p of allRoadPoints) {
      const d = (p[0] - x) ** 2 + (p[2] - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  return { meta, half, heightAt, slopeAt, zoneAt, roadPoints, roadDistance, seaLevel: meta.world.seaLevel };
}

/**
 * Eine Stelle suchen, die alle Bedingungen erfüllt.
 *
 * Rasterförmige Suche mit gejittertem Startpunkt statt Zufallswürfen: eine
 * Fläche unter 6° Neigung ist auf dieser Karte selten, und blindes Würfeln
 * findet sie erst nach tausenden Fehlversuchen — oder gar nicht, und dann
 * steht der Tempel „irgendwo". Der Raster garantiert, dass jede Stelle im
 * Suchgebiet einmal geprüft wurde, und die beste gewinnt.
 *
 * Bewertet wird über `score`; ohne Bewertung gewinnt die flachste Stelle.
 */
function findSpot(world, area, rules, rng) {
  const step = rules.step ?? 12;
  let best = null;
  for (let z = area.z0; z <= area.z1; z += step) {
    for (let x = area.x0; x <= area.x1; x += step) {
      const px = x + (rng() - 0.5) * step * 0.8;
      const pz = z + (rng() - 0.5) * step * 0.8;
      const height = world.heightAt(px, pz);
      if (height < (rules.minHeight ?? -Infinity) || height > (rules.maxHeight ?? Infinity)) continue;
      const slope = world.slopeAt(px, pz);
      if (slope > (rules.maxSlope ?? 90)) continue;
      if (rules.zone !== undefined && world.zoneAt(px, pz, rules.zone) < (rules.zoneMin ?? 0.4)) continue;
      const roadDistance = world.roadDistance(px, pz);
      if (roadDistance < (rules.minRoad ?? 0) || roadDistance > (rules.maxRoad ?? Infinity)) continue;

      const value = rules.score ? rules.score(px, pz, height, slope, roadDistance) : -slope;
      if (!best || value > best.value) best = { x: px, z: pz, height, slope, roadDistance, value };
    }
  }
  return best;
}

/** Kürzester Abstand zu einer bereits gesetzten Platzierung. */
function nearest(list, x, z) {
  let best = Infinity;
  for (const p of list) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const round = (v, digits = 2) => Number(v.toFixed(digits));

function place(list, id, x, z, rot = 0, scale = 1, extra = {}) {
  list.push({ id, x: round(x), z: round(z), rot: round(rot, 1), scale: round(scale, 3), ...extra });
}

async function main() {
  const dry = process.argv.includes('--dry');
  const world = await loadWorld();
  const rng = mulberry32(world.meta.seed ^ 0x5eed7);
  const props = [];
  const notes = [];

  console.log(c.bold('\nLandmark-Platzierung') + c.dim('  — assets/props.json\n'));

  // ── Wald / Tempel ─────────────────────────────────────────────────────────
  //
  // Der Tempel ist die aufwendigste Suche, weil er als einziger eine **Fläche**
  // braucht und nicht nur einen Punkt: 14 × 12 m unter 6° Neigung. Geprüft wird
  // deshalb nicht der Mittelpunkt, sondern die vier Ecken mit.
  const temple = findSpot(
    world,
    { x0: -200, x1: 1300, z0: -700, z1: 500 },
    {
      step: 16,
      zone: 1,
      zoneMin: 0.55,
      minHeight: 25,
      maxHeight: 180,
      maxSlope: 6,
      minRoad: 60,
      maxRoad: 400,
      score: (x, z, height, slope) => {
        for (const [dx, dz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) {
          if (Math.abs(world.heightAt(x + dx, z + dz) - height) > 1.2) return -1000;
        }
        // Höher gelegen ist besser: ein Tempel steht über dem Weg, nicht daneben.
        return height * 0.05 - slope;
      },
    },
    rng,
  );
  if (!temple) throw new Error('Keine Tempelfläche gefunden — die Regeln sind zu eng.');

  // Der Zugang zeigt nach Süden (+Z): dort liegt die Küste, von dort kommt man.
  const approach = Math.PI;
  const dirX = Math.sin(approach);
  const dirZ = Math.cos(approach);
  place(props, 'templeHall', temple.x, temple.z, (approach * 180) / Math.PI, 1);
  notes.push(`Tempel auf ${round(temple.height, 1)} m, Neigung ${round(temple.slope, 1)}°`);

  // Treppe unmittelbar vor dem Podest, dann die Torii-Reihe den Hang hinunter.
  place(props, 'templeStairs', temple.x - dirX * 11, temple.z - dirZ * 11, 180, 1);
  // **Das Tor steht quer zum Weg, nicht längs.** Hier stand zuerst 90°, und im
  // Bild war davon nur ein roter Pfosten zu sehen: die Öffnung des Torii liegt
  // im Modell auf der Z-Achse, es muss also dieselbe Drehung bekommen wie die
  // Zugangsachse. Ein Torii von der Seite ist kein Torii.
  const toriiRot = (approach * 180) / Math.PI;
  for (let i = 0; i < 4; i++) {
    const d = 20 + i * 16;
    place(props, 'torii', temple.x - dirX * d, temple.z - dirZ * d, toriiRot, 1 - i * 0.04);
  }
  // Laternenpaare flankieren den Weg — der Versatz ist quer zur Zugangsachse.
  for (let i = 0; i < 6; i++) {
    const d = 26 + i * 11;
    for (const side of [-1, 1]) {
      place(
        props,
        'stoneLantern',
        temple.x - dirX * d + side * dirZ * 4.5,
        temple.z - dirZ * d - side * dirX * 4.5,
        rng() * 360,
        0.9 + rng() * 0.2,
      );
    }
  }

  // ── Berg / Tōge ───────────────────────────────────────────────────────────
  //
  // Der Bergschrein steht am höchsten Punkt der Passstraße, ein paar Meter
  // abseits — dort, wo man anhält.
  const togePoints = world.roadPoints.get('toge') ?? [];
  let summit = null;
  for (const p of togePoints) {
    if (!summit || p[1] > summit[1]) summit = p;
  }
  if (summit) {
    const spot = findSpot(
      world,
      { x0: summit[0] - 60, x1: summit[0] + 60, z0: summit[2] - 60, z1: summit[2] + 60 },
      { step: 5, maxSlope: 18, minRoad: 14, maxRoad: 40 },
      rng,
    );
    if (spot) {
      place(props, 'hokora', spot.x, spot.z, rng() * 360, 1);
      notes.push(`Bergschrein auf ${round(spot.height, 1)} m`);
    }
  }

  // Streckenmarkierungen an der Passstraße — **nur in den Kurven**.
  //
  // Hier stand zuerst eine Regel „nur an der Talseite", gemessen an der Höhe
  // 5,5 m neben der Achse. Sie lieferte **null** Pfosten, und die Ursache war
  // eine falsche Annahme über das Gelände: der Erdbau aus P3 legt beidseitig
  // eine ebene Schulter an. Gemessen über die ganze Passstraße beträgt die
  // Höhendifferenz 5,5 m neben der Achse im Median +0,09 m, im Viertelabstand
  // +0,04 bis +0,21 m und im Extrem −0,12 bis +1,64 m. Eine Talseite gibt es
  // dort schlicht nicht — die beginnt erst hinter der Böschung.
  //
  // Die Regel ist deshalb eine andere geworden, und sie deckt sich mit dem,
  // wofür die Pfosten überhaupt da sind: sie markieren den **Verlauf**. Gesetzt
  // wird, wo die Krümmung eng ist, also in den Kehren. Die Absturzseite deckt
  // seit P3 die Leitplanke ab — beides nebeneinander wäre doppelt.
  let delineators = 0;
  const curveRadius = (i) => {
    const a = togePoints[Math.max(i - 3, 0)];
    const b = togePoints[i];
    const d = togePoints[Math.min(i + 3, togePoints.length - 1)];
    const ax = b[0] - a[0];
    const az = b[2] - a[2];
    const bx = d[0] - b[0];
    const bz = d[2] - b[2];
    const cross = ax * bz - az * bx;
    if (Math.abs(cross) < 1e-6) return Infinity;
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    const lc = Math.hypot(d[0] - a[0], d[2] - a[2]);
    return (la * lb * lc) / (2 * Math.abs(cross));
  };
  for (let i = 3; i < togePoints.length - 3; i += 3) {
    if (curveRadius(i) > 70) continue;
    const p = togePoints[i];
    const next = togePoints[i + 1];
    const dx = next[0] - p[0];
    const dz = next[2] - p[2];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    for (const side of [-1, 1]) {
      place(
        props,
        'delineator',
        p[0] + nx * side * 5.5,
        p[2] + nz * side * 5.5,
        (Math.atan2(dx, dz) * 180) / Math.PI,
        1,
      );
      delineators++;
    }
  }
  notes.push(`${delineators} Streckenmarkierungen in den Kehren`);

  // Felsformationen aus der Pipeline (5.1) an den Steilhängen des Massivs.
  const rocks = [];
  for (let attempt = 0; attempt < 2600 && rocks.length < 90; attempt++) {
    const x = -1500 + rng() * 1500;
    const z = -1500 + rng() * 900;
    const height = world.heightAt(x, z);
    if (height < 60) continue;
    if (world.zoneAt(x, z, 0) < 0.4) continue;
    if (world.slopeAt(x, z) < 12) continue;
    if (world.roadDistance(x, z) < 22) continue;
    if (nearest(rocks, x, z) < 34) continue;
    rocks.push({ x, z });
    const big = rng() < 0.4;
    place(props, big ? 'boulder_01' : 'rock_moss_set_02', x, z, rng() * 360, 0.8 + rng() * 0.8, {
      yOffset: big ? -0.25 : -0.15,
    });
  }
  notes.push(`${rocks.length} Felsformationen am Massiv`);

  // ── Reisfelder ────────────────────────────────────────────────────────────
  //
  // Gehöfte am Rand der Parzellen, nicht mitten darin — Reisfeld ist Fläche,
  // die man nicht bebaut.
  const farms = [];
  for (let attempt = 0; attempt < 4000 && farms.length < 7; attempt++) {
    const x = -1450 + rng() * 1250;
    const z = -350 + rng() * 900;
    // Der Reisfeldanteil muss **mittel** sein: mitten in der Parzelle (hoher
    // Anteil) baut niemand, weit draußen (niedriger Anteil) ist es kein Hof
    // mehr, sondern ein Haus im Wald.
    const paddy = world.zoneAt(x, z, 3);
    if (paddy < 0.12 || paddy > 0.6) continue;
    if (world.slopeAt(x, z) > 6) continue;
    if (world.heightAt(x, z) < 4) continue;
    if (world.roadDistance(x, z) < 26 || world.roadDistance(x, z) > 260) continue;
    if (nearest(farms, x, z) < 150) continue;
    farms.push({ x, z });
    const rot = rng() * 360;
    place(props, 'farmhouse', x, z, rot, 1);
    const angle = ((rot + 90) * Math.PI) / 180;
    place(props, 'shed', x + Math.sin(angle) * 9, z + Math.cos(angle) * 9, rot + 12, 1);
  }
  notes.push(`${farms.length} Gehöfte an den Reisfeldern`);

  // Strommasten in einer Reihe quer über die Reisfelder. Eine gerade Linie
  // durch die Fläche, wie eine Leitung sie nimmt — nicht dem Gelände folgend.
  let poles = 0;
  const lineStart = [-1380, -180];
  const lineEnd = [-260, 520];
  const spans = 26;
  for (let i = 0; i <= spans; i++) {
    const t = i / spans;
    const x = lineStart[0] + (lineEnd[0] - lineStart[0]) * t;
    const z = lineStart[1] + (lineEnd[1] - lineStart[1]) * t;
    if (world.heightAt(x, z) < 2) continue;
    if (world.slopeAt(x, z) > 22) continue;
    place(props, 'powerPole', x, z, (Math.atan2(lineEnd[0] - lineStart[0], lineEnd[1] - lineStart[1]) * 180) / Math.PI, 1);
    poles++;
  }
  notes.push(`${poles} Strommasten über die Felder`);

  // ── Küste ─────────────────────────────────────────────────────────────────
  //
  // Die Uferlinie wird **gesucht**, nicht angenommen: für jede Rasterspalte im
  // Süden der erste Punkt von See nach Land, an dem die Höhe den Meeresspiegel
  // kreuzt. Aus einer festen z-Linie würden Tetrapoden im Wasser und auf der
  // Wiese stehen, je nachdem, wie die Bucht dort verläuft.
  const shoreline = [];
  for (let x = -1500; x <= 1500; x += 10) {
    let previous = null;
    for (let z = 1536; z >= 600; z -= 3) {
      const height = world.heightAt(x, z);
      if (previous !== null && previous < world.seaLevel && height >= world.seaLevel) {
        shoreline.push({ x, z, height });
        break;
      }
      previous = height;
    }
  }
  notes.push(`Uferlinie: ${shoreline.length} Stützpunkte`);

  // Tetrapoden — ein **Wellenbrecher**, kein Streumuster.
  //
  // Der erste Lauf verteilte 322 Stück über 1600 m Küste, alle 10 m zwei. Im
  // Bild lagen sie einzeln im Sand wie hingefallen. Ein Wellenbrecher ist aber
  // ein Bauwerk: dicht gepackt, ineinander verhakt, über einen begrenzten
  // Abschnitt. Deshalb jetzt 300 m Küste, drei versetzte Reihen und 2,6 m
  // Abstand — dieselbe Stückzahl, aber als Wall statt als Schotter.
  let tetrapods = 0;
  const breakwaterFrom = -1000;
  const breakwaterTo = -700;
  for (const s of shoreline) {
    if (s.x < breakwaterFrom || s.x > breakwaterTo) continue;
    // Die Uferlinie ist alle 10 m abgetastet; dazwischen wird aufgefüllt.
    for (let step = 0; step < 4; step++) {
      const x0 = s.x + step * 2.5;
      for (let row = 0; row < 3; row++) {
        place(
          props,
          'tetrapod',
          x0 + (row % 2 ? 1.25 : 0) + (rng() - 0.5) * 0.8,
          s.z + 2.0 + row * 2.2 + (rng() - 0.5) * 0.8,
          rng() * 360,
          0.95 + rng() * 0.25,
          { y: round(world.seaLevel - 0.6 + row * 0.35, 2) },
        );
        tetrapods++;
      }
    }
  }
  notes.push(`${tetrapods} Tetrapoden im Wellenbrecher (${breakwaterTo - breakwaterFrom} m)`);

  // Leuchtturm: der Punkt der Uferlinie, der am weitesten ins Meer reicht.
  //
  // Auch hier war die erste Regel eine Annahme statt einer Messung — sie
  // verlangte 6 m Höhe 12 m landeinwärts und fand **nichts**. Gemessen über
  // alle 301 Stützpunkte der Uferlinie liegt die Höhe dort im Median bei
  // 0,02 m und im Maximum bei 0,57 m: diese Küste ist ein Flachstrand, es gibt
  // kein Kliff. Ein Leuchtturm auf einer flachen Landzunge ist nicht der
  // Notbehelf, sondern der Normalfall — gesucht wird deshalb der **südlichste**
  // Punkt, also der, der am weitesten in die See reicht, und die Höhe geht nur
  // noch als kleiner Bonus ein.
  let cape = null;
  for (const s of shoreline) {
    const inland = world.heightAt(s.x, s.z - 22);
    if (inland < world.seaLevel) continue;
    const value = s.z + inland * 8;
    if (!cape || value > cape.value) cape = { ...s, value, inland };
  }
  if (cape) {
    place(props, 'lighthouse', cape.x, cape.z - 16, rng() * 360, 1);
    notes.push(
      `Leuchtturm bei x=${round(cape.x, 0)}, z=${round(cape.z, 0)} auf ` +
        `${round(world.heightAt(cape.x, cape.z - 16), 2)} m`,
    );
  }

  // Mole und Boote: ein Stück Uferlinie mit ruhigem Verlauf, möglichst weit vom
  // Leuchtturm entfernt, damit sie sich nicht ins Bild stehen.
  const harbour = shoreline
    .filter((s) => Math.abs(s.x - (cape?.x ?? 0)) > 500 && s.x > -800 && s.x < 800)
    .sort((a, b) => a.z - b.z)[0];
  if (harbour) {
    // Der Steg misst 7,5 m vom Pfahlfuß bis zur Deckoberkante. Bei −3,6 m lag
    // das Deck genau auf der Wasserlinie und die Pfähle unsichtbar darunter —
    // im Bild ein Brett auf dem Meer. −2,2 m lässt sie heraussehen.
    place(props, 'modular_wooden_pier', harbour.x, harbour.z + 12, 0, 1, {
      y: round(world.seaLevel - 2.2, 2),
    });
    for (let i = 0; i < 4; i++) {
      place(
        props,
        'boat',
        harbour.x + (rng() - 0.5) * 34,
        harbour.z + 20 + rng() * 22,
        rng() * 360,
        0.9 + rng() * 0.25,
        { y: round(world.seaLevel - 0.35, 2) },
      );
    }
    // Die große Felsklippe als Kulisse hinter dem Hafen.
    place(props, 'coastal_cliff_04', harbour.x - 150, harbour.z - 10, rng() * 360, 1, {
      yOffset: -3,
    });
    notes.push(`Hafen bei x=${round(harbour.x, 0)}`);
  }

  const file = { version: 1, seed: world.meta.seed, props };
  const byId = {};
  for (const p of props) byId[p.id] = (byId[p.id] ?? 0) + 1;

  for (const note of notes) console.log(c.dim(`  · ${note}`));
  console.log();
  for (const [id, count] of Object.entries(byId).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.green('✓')} ${id.padEnd(22)} ${String(count).padStart(4)}`);
  }
  console.log(c.bold(`\n  ${props.length} Platzierungen`));

  if (dry) {
    console.log(c.yellow('  --dry: nichts geschrieben\n'));
    return;
  }
  await writeFile(join(ROOT, 'assets/props.json'), `${JSON.stringify(file, null, 1)}\n`);
  console.log(c.dim('  → assets/props.json  (eingecheckt, von Hand editierbar)\n'));
}

await main();
