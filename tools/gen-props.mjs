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

  /**
   * Tiefster Geländepunkt unter dem **Grundriss** eines Props — P8.9.
   *
   * Props stehen mit ihrem Pivot auf der Geländehöhe *ihres Mittelpunkts*. Bei
   * einem Torii von 6,92 m Spannweite auf einem Hang heißt das: eine Säule
   * schwebt, die andere steckt im Boden. Ein negativer `yOffset` in Höhe der
   * größten Absenkung behebt das — das Bauwerk sinkt so weit ein, dass kein Fuß
   * mehr in der Luft steht. Auf der Bergseite sitzt es dann tiefer, und genau so
   * gräbt man ein Fundament in einen Hang.
   *
   * **Der Grundriss ist gerichtet, und das ist hier der ganze Punkt.** Der
   * erste Versuch tastete einen Kreis mit 2,4 m Radius ab und lieferte bis zu
   * **1,00 m** Absenkung. Nachgemessen war der Ring antisymmetrisch — −1,00 m
   * in +Z, +0,87 m in −Z —, die Absenkung kam also **längs** des Weges, wo der
   * Sandō steigt. Quer gemessen, wo das Torii tatsächlich breit ist, beträgt
   * die größte Differenz über die volle Spannweite **0,54 m (4,4°)**.
   *
   * Ein Torii ist 6,92 m breit und 0,88 m tief. Es 1 m einzugraben, weil der
   * Weg vor ihm steigt, hätte ihm ein Fünftel seiner Höhe genommen — für ein
   * Problem, das es nicht hat.
   */
  const groundFootprint = (x, z, dirX, dirZ, halfAlong, halfAcross) => {
    const nx = dirZ;
    const nz = -dirX;
    let lowest = heightAt(x, z);
    for (const a of [-1, 0, 1]) {
      for (const b of [-1, 0, 1]) {
        if (a === 0 && b === 0) continue;
        const px = x + dirX * a * halfAlong + nx * b * halfAcross;
        const pz = z + dirZ * a * halfAlong + nz * b * halfAcross;
        const h = heightAt(px, pz);
        if (h < lowest) lowest = h;
      }
    }
    return lowest;
  };

  return {
    meta,
    half,
    heightAt,
    slopeAt,
    zoneAt,
    groundFootprint,
    roadPoints,
    roadDistance,
    seaLevel: meta.world.seaLevel,
  };
}

/**
 * Bogenlänge entlang einer abgetasteten Strecke, vom Ende her.
 *
 * Der Sandō ist mit 4 m Schrittweite abgetastet, aber nicht gleichmäßig — die
 * Spline-Abtastung liefert kürzere Schritte in den Kurven. Wer Torii „alle
 * 16 m" setzen will, muss deshalb die tatsächliche Länge aufsummieren und darf
 * nicht jeden vierten Stützpunkt nehmen.
 */
function arcFromEnd(points) {
  const out = new Array(points.length).fill(0);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    out[i] = out[i + 1] + Math.hypot(b[0] - a[0], b[2] - a[2]);
  }
  return out;
}

/** Punkt und Richtung auf einer Strecke, `distance` Meter vor dem Ende. */
function alongFromEnd(points, arc, distance) {
  for (let i = points.length - 2; i >= 0; i--) {
    if (arc[i] < distance) continue;
    const span = arc[i] - arc[i + 1] || 1;
    const t = (arc[i] - distance) / span;
    const a = points[i];
    const b = points[i + 1];
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    // Richtung **bergauf**, also zum Tempel hin.
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    return { x, z, dx: dx / len, dz: dz / len };
  }
  const a = points[0];
  const b = points[Math.min(1, points.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  return { x: a[0], z: a[2], dx: (b[0] - a[0]) / len, dz: (b[2] - a[2]) / len };
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
  // Der Jitter bricht das Raster auf und ist bei groben Schritten richtig. Bei
  // einer **seltenen** Bedingung ist er es nicht: die Tempelfläche am Sandō
  // trifft 1 von 709 Rasterpunkten, und ±0,8 m Versatz gehen daran vorbei.
  // `jitter: 0` schaltet ihn ab — dann ist die Suche vollständig und
  // deterministisch (siehe P8.9).
  const jitter = rules.jitter ?? 0.8;
  let best = null;
  for (let z = area.z0; z <= area.z1; z += step) {
    for (let x = area.x0; x <= area.x1; x += step) {
      const px = x + (rng() - 0.5) * step * jitter;
      const pz = z + (rng() - 0.5) * step * jitter;
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
  // **Der Pfad bestimmt den Ort, nicht die freie Suche.** Bis P8.9 stand hier
  // eine Suche über die halbe Karte (x −200…1300, z −700…500). Sie war nicht
  // falsch, aber sie kannte den Sandō nicht, den 8.7 gebaut hat — und der
  // endet auf der Waldhochebene bei (820, −952). Gemessen lag der Tempel bei
  // (519, −689): **300 m neben dem Weg, der zu ihm führen sollte.** Der
  // Blickpunkt `tempel` zeigte derweil auf das Pfadende, also auf leeren Wald.
  //
  // Die Abnahmezeile von 8.9 lautet „Fischerdorf und Sandō stehen und sind
  // erreichbar — ein Pfad führt hin". Erreichbarkeit lässt sich nicht
  // nachträglich prüfen, wenn beide Enden unabhängig gesucht werden; sie muss
  // aus der Konstruktion folgen. Deshalb ist das Suchgebiet jetzt ein Kreis um
  // das Pfadende.
  //
  // Gemessen im Umkreis von 30 m: **1 von 709** Rasterpunkten trägt eine
  // Tempelfläche, nämlich (820, −954) mit 1,82° — 2 m vom letzten Knoten. Der
  // Aufgang endet also genau auf der einzigen ebenen Stelle, die er erreicht.
  const sandoPoints = world.roadPoints.get('sando') ?? [];
  if (sandoPoints.length < 4) throw new Error('Der Sandō fehlt in roads.json — erst `npm run roads`.');
  const sandoEnd = sandoPoints[sandoPoints.length - 1];

  // Richtung, in der der Pfad ausläuft — über die letzten 12 m gemittelt, damit
  // ein einzelner Knoten die Achse nicht verdreht.
  const endArc = arcFromEnd(sandoPoints);
  const endDir = alongFromEnd(sandoPoints, endArc, 12);

  /**
   * Erster Versuch, verworfen: `score = −slope − Abstand × 0,35`.
   *
   * Er wählte (799,8, −992,8) — eine breite ebene Fläche, aber **45 m neben
   * der Achse** des Aufgangs. Im Bild hieße das: man geht die Torii-Reihe
   * hinauf, sie hört auf, und der Tempel steht seitlich daneben. Der Abstand
   * allein ist das falsche Maß; entscheidend ist, ob der Bau **in der Flucht**
   * liegt.
   *
   * Deshalb getrennte Strafen: quer zur Achse teuer (×2,2), längs billig
   * (×0,10), und rückwärts den Pfad hinunter sehr teuer (×0,8) — ein Tempel
   * unterhalb seines eigenen Aufgangs wäre keiner.
   */
  const temple = findSpot(
    world,
    { x0: sandoEnd[0] - 45, x1: sandoEnd[0] + 45, z0: sandoEnd[2] - 45, z1: sandoEnd[2] + 45 },
    {
      step: 1,
      jitter: 0,
      maxSlope: 6,
      score: (x, z, height, slope) => {
        for (const [dx, dz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) {
          if (Math.abs(world.heightAt(x + dx, z + dz) - height) > 1.2) return -1000;
        }
        const ox = x - sandoEnd[0];
        const oz = z - sandoEnd[2];
        const along = ox * endDir.dx + oz * endDir.dz;
        const lateral = Math.abs(ox * endDir.dz - oz * endDir.dx);
        return -slope - lateral * 2.2 - (along >= 0 ? along * 0.1 : -along * 0.8);
      },
    },
    rng,
  );
  if (!temple) throw new Error('Keine Tempelfläche am Sandō-Ende — die Regeln sind zu eng.');

  /**
   * Die Achse des Aufgangs ist der Pfad **plus die Verlängerung zum Tempel**.
   *
   * Ohne sie liefen die Torii dem Pfad nach und der Tempel stünde am Ende
   * daneben — und das ist genau der Fehler, den 8.9 behebt. Mit ihr sind alle
   * Abstände unten Meter **vom Tempel** aus gemessen, und die Reihe endet dort,
   * wo sie hinführt.
   *
   * Die Verlängerung ist kein Weg: sie ist der Vorplatz. Wie lang sie ist,
   * steht unten in der Ausgabe — wird sie groß, gehört ein Wegpunkt in
   * `gen-roads.mjs`, und dann ist es dort zu sehen statt hier zu ahnen.
   */
  const sandoAxis = [...sandoPoints, [temple.x, temple.height, temple.z]];
  const sandoArc = arcFromEnd(sandoAxis);
  const forecourt = Math.hypot(temple.x - sandoEnd[0], temple.z - sandoEnd[2]);

  // Die Zugangsachse zeigt **vom Tempel weg**, den Aufgang hinunter.
  const uphill = alongFromEnd(sandoAxis, sandoArc, Math.min(12, forecourt * 0.9));
  const dirX = -uphill.dx;
  const dirZ = -uphill.dz;
  const approachDeg = (Math.atan2(dirX, dirZ) * 180) / Math.PI;
  place(props, 'templeHall', temple.x, temple.z, approachDeg, 1);
  notes.push(
    `Tempel auf ${round(temple.height, 1)} m, Neigung ${round(temple.slope, 1)}°, ` +
      `Vorplatz ${round(forecourt, 1)} m ab letztem Pfadknoten`,
  );

  // Treppe unmittelbar vor dem Podest.
  place(props, 'templeStairs', temple.x + dirX * 11, temple.z + dirZ * 11, approachDeg, 1);

  /**
   * Ein Prop auf den Sandō setzen — P8.9.
   *
   * `offset` ist der Versatz **quer** zum Weg (rechts positiv), `half` das
   * Paar [längs, quer] des halben Grundrisses. Alles, was breiter als der
   * 1,8 m schmale Pfad ist, bekommt damit ein eingegrabenes Fundament statt
   * eines schwebenden Fußes — und zwar nur so tief, wie es quer wirklich
   * ausladet (siehe `groundFootprint`).
   *
   * **Das Tor steht quer zum Weg, nicht längs.** Hier stand vor P5 einmal 90°,
   * und im Bild war davon nur ein roter Pfosten zu sehen: die Öffnung des
   * Torii liegt im Modell auf der Z-Achse, es bekommt also dieselbe Drehung
   * wie die Wegrichtung. Ein Torii von der Seite ist kein Torii.
   */
  let maxSink = 0;
  const onSando = (id, distance, offset, scale, half, rot = null) => {
    const p = alongFromEnd(sandoAxis, sandoArc, distance);
    // Normale in der Ebene: (dz, −dx) zeigt nach rechts, wenn (dx, dz) vorwärts zeigt.
    const x = p.x + p.dz * offset;
    const z = p.z - p.dx * offset;
    const heading = (Math.atan2(-p.dx, -p.dz) * 180) / Math.PI;
    const extra = {};
    if (half) {
      const [along, across] = half;
      const drop =
        world.groundFootprint(x, z, p.dx, p.dz, along * scale, across * scale) - world.heightAt(x, z);
      if (drop < -0.03) {
        extra.yOffset = round(drop, 2);
        if (-drop > maxSink) maxSink = -drop;
      }
    }
    place(props, id, x, z, rot ?? heading, scale, extra);
  };

  // Torii im 16-m-Raster, für das `PROP_CLEARANCE.torii` (8 m) ausgelegt ist:
  // die Kreise überlappen sich zu einem durchgehend freien Korridor statt zu
  // einer Kette von Lichtungen. Neun statt vier — der Aufgang misst 450 m, und
  // vier Tore auf 48 m sind eine Gruppe am Ende, keine Reihe.
  const toriiCount = 9;
  for (let i = 0; i < toriiCount; i++) {
    const d = 22 + i * 16;
    // Halber Grundriss: 0,44 m längs, 3,46 m quer — die gemessenen 6,92 × 0,88 m.
    onSando('torii', d, 0, 1 - i * 0.015, [0.44, 3.46]);
  }
  notes.push(`Sandō: ${toriiCount} Torii im 16-m-Raster über ${22 + (toriiCount - 1) * 16} m`);

  // Laternenpaare flankieren den Weg. 2,6 m Versatz und nicht 4,5 wie vor 8.9:
  // der Pfad ist 1,8 m breit, und Laternen 9 m auseinander stehen nicht mehr
  // an einem Weg, sondern auf einer Wiese.
  for (let i = 0; i < 10; i++) {
    const d = 28 + i * 13;
    for (const side of [-1, 1]) {
      onSando('stoneLantern', d, side * 2.6, 0.9 + rng() * 0.2, [0.52, 0.45], rng() * 360);
    }
  }

  // Chōzuya und Glocke stehen **nicht** in der Achse, sondern seitlich davon —
  // in einer echten Anlage stehen sie neben dem Weg, kurz vor dem Bezirk.
  onSando('chozuya', 20, -9, 1, [1.63, 1.63]);
  onSando('bellTower', 30, 11, 1, [1.77, 1.77]);
  notes.push(`Sandō: Chōzuya und Shōrō gesetzt, größte Fundamentabsenkung ${round(maxSink, 2)} m`);

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

    // ── Fischerdorf — P8.9 ──────────────────────────────────────────────────
    //
    // **Es steht am Hafen, nicht am Leuchtturm.** PLAN 8.9 schreibt „an der
    // Südküste beim Leuchtturm", begründet es aber mit einem Satz, der woanders
    // hinzeigt: „Die Boote bekommen einen Ort, an den sie gehören." Die Boote
    // liegen am Hafen, und zwischen Hafen (x = 790) und Leuchtturm (x = −180)
    // liegen **gemessene 977 m** — die beiden sind nicht einmal im selben Bild.
    // Ein Dorf am Leuchtturm ließe Steg, Mole und vier Boote unbewohnt, also
    // genau den Befund, den 8.9 beheben soll.
    //
    // Der Leuchtturm bleibt, was er ist: ein einzelner Fixpunkt auf einer
    // Landzunge. Das ist kein Versehen der Karte, sondern der Normalfall.
    //
    // Gebaut wird **entlang der gemessenen Uferlinie**, nicht auf einem
    // Rechteck: die Bucht verläuft schräg, und Hütten in Reih und Glied auf
    // gleichem z stünden teils im Wasser, teils 40 m im Land.
    const village = shoreline
      // ±90 m statt ±130: acht Hütten über 195 m sind eine Streusiedlung. Auf
      // 145 m stehen sie in Rufweite, und genau das unterscheidet ein Dorf von
      // acht Häusern am selben Strand.
      .filter((s) => Math.abs(s.x - harbour.x) < 90)
      .sort((a, b) => a.x - b.x);

    /**
     * Vom Ufer aus landeinwärts gehen, bis der Boden trägt.
     *
     * „Landeinwärts" heißt hier −Z, weil die Uferlinie von Süden gesucht wurde.
     * Abgebrochen wird nach 90 m: wo in 90 m die Schwelle nicht erreicht ist,
     * ist die Bucht zu flach für ein Haus, und der Platz entfällt ersatzlos
     * statt an einer schlechteren Stelle besetzt zu werden.
     *
     * **Die Schwelle ist gemessen, nicht gewählt.** Der erste Versuch verlangte
     * 1,4 m, und das schob die Hütten 70…130 m ins Hinterland — ein Fischerdorf
     * ohne Blick aufs Wasser. Das Profil dieser Bucht erklärt es:
     *
     * | x | Ufer z | +10 m | +30 m | +50 m | +70 m | +90 m |
     * |---|---|---|---|---|---|---|
     * | 700 | 1090 | 0,00 | 0,04 | 0,36 | 0,89 | 1,72 |
     * | 790 | 1037 | 0,02 | 0,18 | 0,67 | 1,49 | 2,93 |
     * | 870 | 1055 | 0,03 | 0,41 | 0,78 | 1,16 | 1,72 |
     *
     * Ein Flachstrand mit rund 2 % Gefälle; 1,4 m liegen dort erst nach 70…90 m.
     * 0,25 m sind nach 25…35 m erreicht, und die Hütte steht ohnehin auf
     * Pfählen (0,45 m, siehe `landmarkMeshes.ts`) — der Fußboden liegt damit
     * 0,7 m über der Wasserlinie. So stehen Fischerhäuser an einer Flachküste.
     */
    const inland = (x, z0, minHeight, maxSlope) => {
      for (let d = 8; d <= 90; d += 3) {
        const z = z0 - d;
        if (world.heightAt(x, z) < minHeight) continue;
        if (world.slopeAt(x, z) > maxSlope) continue;
        return { x, z, d, height: world.heightAt(x, z) };
      }
      return null;
    };

    const huts = [];
    // Zwei versetzte Reihen: die vordere am Wasser, die hintere dahinter. Eine
    // einzelne Reihe liest sich als Straßenzeile, zwei als Ort.
    for (let i = 0; i < 11 && huts.length < 9; i++) {
      const anchor = village[Math.floor((i / 11) * village.length)];
      if (!anchor) continue;
      const back = i % 3 === 2;
      const spot = inland(anchor.x + (rng() - 0.5) * 9, anchor.z, back ? 0.55 : 0.25, 12);
      if (!spot) continue;
      const z = spot.z - (back ? 26 : 0);
      if (world.slopeAt(spot.x, z) > 14) continue;
      if (nearest(huts, spot.x, z) < 12) continue;
      huts.push({ x: spot.x, z });
      // Die Hütten sehen aufs Wasser, also nach +Z, mit etwas Streuung.
      const rot = 180 + (rng() - 0.5) * 26;
      place(props, 'fishHut', spot.x, z, rot, 0.92 + rng() * 0.2);
      // Beiwerk am Haus: Netzgestell und Kisten wechseln sich ab. Ohne sie
      // stehen acht Hütten in der Landschaft, und das ist eine Siedlung, kein
      // Fischerdorf.
      const a = ((rot + 90) * Math.PI) / 180;
      if (i % 2 === 0) {
        place(props, 'netRack', spot.x + Math.sin(a) * 8, z + Math.cos(a) * 8, rot + 90, 1);
      } else {
        place(props, 'crateStack', spot.x + Math.sin(a) * 7, z + Math.cos(a) * 7, rng() * 360, 1);
      }
    }
    notes.push(`Fischerdorf: ${huts.length} Hütten um x=${round(harbour.x, 0)}`);

    // Netzgestelle **am Wasser**, quer zur Uferlinie — dort trocknen sie, nicht
    // zwischen den Häusern.
    let racks = 0;
    for (let i = 1; i < 6; i++) {
      const anchor = village[Math.floor((i / 6) * village.length)];
      if (!anchor) continue;
      const spot = inland(anchor.x, anchor.z, 0.12, 16);
      if (!spot) continue;
      place(props, 'netRack', spot.x, spot.z - 2, 90 + (rng() - 0.5) * 20, 0.95 + rng() * 0.15);
      racks++;
    }

    // Bootsrampe: dort, wo das Ufer am flachsten ist — sonst steht die Platte
    // schräg im Hang statt im Wasser. Der Pivot der Rampe sitzt oben, das
    // untere Ende darf untergehen.
    const rampSpot = village
      .map((s) => ({ s, slope: world.slopeAt(s.x, s.z - 6) }))
      .sort((a, b) => a.slope - b.slope)[0];
    if (rampSpot) {
      place(props, 'boatRamp', rampSpot.s.x, rampSpot.s.z - 4, 0, 1);
      place(props, 'crateStack', rampSpot.s.x + 7, rampSpot.s.z - 9, rng() * 360, 1);
    }

    // Der zweite, kleine Steg — 70 m neben der Mole, damit beide ins selbe Bild
    // passen, ohne sich zu decken. Deckoberkante 0,9 m über der Wasserlinie:
    // der Pivot liegt beim `jetty` auf dem Deck (siehe `landmarkMeshes.ts`),
    // anders als beim 24-m-Fremdmodell, dessen Pivot am Pfahlfuß sitzt.
    const jettyX = harbour.x + 70;
    const jettyShore = village.reduce(
      (best, s) => (best && Math.abs(best.x - jettyX) <= Math.abs(s.x - jettyX) ? best : s),
      null,
    );
    if (jettyShore) {
      place(props, 'jetty', jettyShore.x, jettyShore.z + 7, 0, 1, {
        y: round(world.seaLevel + 0.9, 2),
      });
      place(props, 'crateStack', jettyShore.x - 4, jettyShore.z - 4, rng() * 360, 1);
      // Zwei weitere Boote am neuen Steg. Vier Boote an einer Mole waren die
      // „Zutaten ohne den Hafen"; sechs an zwei Anlegern sind eine Flotte.
      for (let i = 0; i < 2; i++) {
        place(props, 'boat', jettyShore.x + (i ? 3.2 : -3.2), jettyShore.z + 9 + rng() * 4, 8 + rng() * 14, 0.9 + rng() * 0.2, {
          y: round(world.seaLevel - 0.35, 2),
        });
      }
    }
    notes.push(`Fischerdorf: ${racks} Netzgestelle am Wasser, Rampe und zweiter Steg`);
  }

  // ── Stadtrand — P8.9, aus dem Befund von 8.8 ──────────────────────────────
  //
  // 8.8 hat am Bild geprüft, dass die Silhouette bereits abgestuft ist (17 → 2
  // Geschosse von `coreRadius` 60 nach `edgeRadius` 220), und den naheliegenden
  // Regler deshalb **nicht** angefasst. Was dort im Bild stand, war eine Kante
  // **am Boden**: die Bebauung hört auf, daneben liegt leere Fläche.
  //
  // Der Distrikt misst 360 m um (620, 120), also x 440…800 und z −60…300. Das
  // Vorfeld aus 8.5c ebnet ±260 m mit 200 m Auslauf.
  //
  // **Der Ring beginnt bei 215 m, nicht bei 195.** Die Bodenplatte endet zwar
  // bei 180 m, aber `CITY.ground.skirt` legt eine 24 m breite Schürze darum,
  // die auf Geländehöhe ausläuft — bis 204 m. Ein Prop dort stünde auf dem
  // Höhenfeld und damit **unter** der Schürze. Das ist Fall 2 aus der
  // Fehlerliste in CLAUDE.md („eine Fläche unter einer anderen"), und er kostet
  // dort jedes Mal einen halben Tag, weil alle Zahlen richtig aussehen.
  // 215 m lassen 11 m Luft.
  //
  // Bebaut wird also 215…330 m: rund 115 m Tiefe — dieselbe Größenordnung,
  // über die große Titel eine Stadt verjüngen.
  //
  // **Was hier steht, ist absichtlich unauffällig.** Der Rand einer japanischen
  // Kleinstadt ist Lagerhalle, Gewächshaus und Grundstücksmauer, nicht ein
  // kleineres Hochhaus. Ein weiteres Gebäude vom Typ des Distrikts würde die
  // Kante nur verschieben.
  const CITY = { x: 620, z: 120, inner: 215, outer: 330 };
  const fringe = [];
  const cityRing = (x, z) => Math.max(Math.abs(x - CITY.x), Math.abs(z - CITY.z));

  const fringePlace = (id, minGap, rules) => {
    for (let attempt = 0; attempt < 900; attempt++) {
      const side = Math.floor(rng() * 4);
      // **Nach innen gewichtet.** Gleichverteilt über 115 m Tiefe sah der Ring
      // im Bild aus wie verstreute Kisten auf leerem Feld — die Fläche wächst
      // quadratisch nach außen, die Dichte fällt also von selbst. `^1.8` dreht
      // das um: rund die Hälfte aller Plätze liegt in den inneren 30 m, wo die
      // Bebauung an den Distrikt anschließen soll.
      const von = rules.inner ?? CITY.inner;
      const depth = von + Math.pow(rng(), 1.8) * (CITY.outer - von);
      const along = (rng() - 0.5) * 2 * depth;
      const x = CITY.x + (side === 0 ? depth : side === 1 ? -depth : along);
      const z = CITY.z + (side === 2 ? depth : side === 3 ? -depth : along);
      if (cityRing(x, z) < von || cityRing(x, z) > CITY.outer) continue;
      const height = world.heightAt(x, z);
      if (height < 6) continue; // nicht in die Bucht bauen
      if (world.slopeAt(x, z) > (rules.maxSlope ?? 7)) continue;
      // Abstand zur Fahrbahn: die Zufahrt und die Ringstraße laufen durch den
      // Ring, und ein Gewächshaus auf der Straße ist schlimmer als eine Kante.
      const road = world.roadDistance(x, z);
      if (road < (rules.minRoad ?? 16) || road > (rules.maxRoad ?? Infinity)) continue;
      if (nearest(fringe, x, z) < minGap) continue;
      fringe.push({ x, z });
      return { x, z, height };
    }
    return null;
  };

  const fringeCounts = {};
  const fringeAdd = (id, count, minGap, rules, extra = () => ({})) => {
    let done = 0;
    for (let i = 0; i < count; i++) {
      const spot = fringePlace(id, minGap, rules);
      if (!spot) continue;
      const { rot = rng() * 360, scale = 1, ...rest } = extra(spot, i);
      place(props, id, spot.x, spot.z, rot, scale, rest);
      done++;
    }
    fringeCounts[id] = done;
    return done;
  };

  // Reihenfolge nach Größe: die Hallen belegen zuerst die guten Plätze, der
  // Kleinkram füllt auf. Umgekehrt fände die Halle am Ende keinen Platz mehr.
  //
  // Die Ausrichtung folgt dem Blockraster der Stadt (0°/90°) mit wenigen Grad
  // Streuung. Zufällig gedrehte Hallen sehen aus wie hingefallen — ein
  // Gewerbegebiet ist das Gegenteil davon.
  const gridRot = (spot, i) => ({ rot: round((i % 2 ? 90 : 0) + (rng() - 0.5) * 8, 1) });
  fringeAdd('warehouse', 11, 48, { maxSlope: 5, minRoad: 30 }, gridRot);
  fringeAdd('greenhouse', 26, 20, { maxSlope: 6, minRoad: 22 }, gridRot);
  // **Schuppen und Mauern rücken bis 208 m heran.** Gemessen war die Kante im
  // Bild nicht der Ring, sondern der 35 m breite kahle Streifen zwischen
  // Distriktkante (180 m) und Ringbeginn (215 m). Die Schürze endet bei 204 m;
  // 208 m lassen 4 m Luft und schließen den Streifen mit dem Kleinkram, für den
  // er groß genug ist. Die Hallen bleiben draußen — eine 21-m-Halle direkt an
  // der Bordsteinkante wäre wieder eine Kante, nur eine andere.
  fringeAdd('shed', 34, 12, { maxSlope: 9, inner: 208 }, gridRot);
  // Mauern in kurzen Reihen zu dritt: eine einzelne 8-m-Mauer ist ein Fragment,
  // drei in einer Flucht sind eine Parzellengrenze.
  let walls = 0;
  for (let i = 0; i < 18; i++) {
    const spot = fringePlace('concreteWall', 24, { maxSlope: 8, minRoad: 12, inner: 208 });
    if (!spot) continue;
    const rot = (i % 2 ? 90 : 0) + (rng() - 0.5) * 6;
    const a = (rot * Math.PI) / 180;
    const run = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < run; k++) {
      const t = k - (run - 1) / 2;
      place(props, 'concreteWall', spot.x + Math.cos(a) * t * 8.4, spot.z - Math.sin(a) * t * 8.4, round(rot, 1), 1);
      walls++;
    }
  }
  fringeCounts.concreteWall = walls;
  // Strommasten in den Ring: sie ziehen die Blicklinie über die Kante hinweg.
  fringeAdd('powerPole', 16, 28, { maxSlope: 12, minRoad: 10 }, () => ({ rot: round(rng() * 360, 1) }));

  notes.push(
    'Stadtrand: ' +
      Object.entries(fringeCounts)
        .map(([id, n]) => `${n}× ${id}`)
        .join(', '),
  );

  const file = { version: 1, seed: world.meta.seed, props };
  const byId = {};
  for (const p of props) byId[p.id] = (byId[p.id] ?? 0) + 1;

  for (const note of notes) console.log(c.dim(`  · ${note}`));
  console.log();
  /**
   * Pufferprüfung — P8.9.
   *
   * `PROPS.capacity` ist 512 **je Asset und Stufe**, und ein Überlauf verwirft
   * Props **still**: es fehlt dann ein Stück Mole oder eine Hütte, ohne dass
   * irgendwo etwas gemeldet wird. Genau die Art Fehler, die dieses Projekt
   * zweimal erst nach Monaten gefunden hat. Deshalb prüft das Werkzeug hier und
   * nicht der Renderer — hier gibt es die Zahl umsonst.
   *
   * Die Zahl steht hart in `src/config/props.config.ts`; ein Import scheidet
   * aus, weil `tools/*.mjs` reines Node-ESM ohne TypeScript ist (CLAUDE.md,
   * „Codebasis-Regeln"). Wer sie dort ändert, muss sie hier nachziehen — der
   * Kommentar dort sagt das ebenfalls.
   */
  const CAPACITY = 512;
  let overflow = 0;
  for (const [id, count] of Object.entries(byId).sort((a, b) => b[1] - a[1])) {
    const mark = count > CAPACITY ? c.yellow('✗') : c.green('✓');
    const hint = count > CAPACITY ? c.yellow(`  > PROPS.capacity (${CAPACITY})`) : '';
    if (count > CAPACITY) overflow++;
    console.log(`  ${mark} ${id.padEnd(22)} ${String(count).padStart(4)}${hint}`);
  }
  console.log(c.bold(`\n  ${props.length} Platzierungen`) + c.dim(`, ${Object.keys(byId).length} Assets`));
  if (overflow > 0) {
    console.log(c.yellow(`  ${overflow} Asset(s) über der Kapazität — Props würden still verworfen.\n`));
    process.exitCode = 1;
  }

  if (dry) {
    console.log(c.yellow('  --dry: nichts geschrieben\n'));
    return;
  }
  await writeFile(join(ROOT, 'assets/props.json'), `${JSON.stringify(file, null, 1)}\n`);
  console.log(c.dim('  → assets/props.json  (eingecheckt, von Hand editierbar)\n'));
}

await main();
