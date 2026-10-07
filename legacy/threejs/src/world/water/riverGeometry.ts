import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

import { RIVER } from '@/config/water.config';

/** Struktur von assets/generated/terrain/river.json — Ausgabe von carveRiver(). */
export interface RiverFile {
  readonly length: number;
  readonly drop: number;
  readonly endedBy: string;
  /** Flach: x, y, z je Knoten. */
  readonly centerline: readonly number[];
  /** Halbe Bettbreite je Knoten, in Metern. */
  readonly halfWidths: readonly number[];
  /** Abschnitte, die als Stufe stehen geblieben sind. */
  readonly falls: readonly { readonly from: number; readonly to: number; readonly drop: number }[];
}

export interface RiverGeometryReport {
  readonly nodes: number;
  readonly triangles: number;
  /** Steilster Abschnitt der Wasserfläche, als Neigung (Δh je Meter Lauf). */
  readonly steepest: number;
  /** Länge der Abschnitte über der Schaumschwelle, in Metern. */
  readonly rapidsLength: number;
}

/**
 * Das Flussband — PLAN.md P8.6.
 *
 * Ein Streifen aus zwei Knotenreihen entlang der Mittellinie: je Knoten ein
 * Punkt links und rechts, um die halbe Bettbreite versetzt. Kein Ring, keine
 * Kappen — das Band endet an der Quelle und läuft im Meer aus, wo die
 * Meeresebene übernimmt.
 *
 * **Warum die Wasserfläche über der Bettsohle liegt.** `river.json` führt die
 * Sohle, nicht den Spiegel. Läge das Band exakt darauf, hätte der Fluss die
 * Tiefe null — und der Shader rechnet Farbe, Schaum und Uferblende aus genau
 * dieser Tiefe. `RIVER.surfaceRise` hebt es an; gemessen ist die Sohle im
 * Median 2,68 m unter dem Ufer, ein Spiegel 0,9 m darüber liegt also gut
 * innerhalb des Bettes.
 *
 * **Die Breite ist nicht die des Bettes.** Das Bett läuft als V aus; ein
 * Wasserspiegel, der bis zur Bettkante reicht, stünde am Ufer über dem
 * Gelände. `RIVER.widthFactor` zieht ihn ein.
 */
/**
 * Wasserspiegel je Knoten, aus dem Gelände gerechnet — Review 2026-09.
 *
 * ## Warum nicht einfach `y + surfaceRise`
 *
 * Die Knotenhöhe in `river.json` ist **nicht** die Sohle, sondern die Uferlinie
 * (der Baker schneidet `bedY − depth·(1−u²)`, der Knoten trägt `bedY`).
 * Nachgemessen über alle Knoten gegen `height.r16`:
 *
 * ```
 *                              p10     p50     p90
 *   Knoten − Gelände Mitte     1,54    2,57    3,40 m
 *   Knoten − Gelände 1,3·hw   −1,16   −0,16    0,84 m   ← Ufer
 *   Knoten − Gelände 0,78·hw   0,61    1,03    1,37 m   ← Rand des Bandes
 * ```
 *
 * Mit `+0,9` stand der Spiegel damit im Median **1,9 m über dem Gelände** am
 * Rand des Bandes: ein Papierstreifen über der Landschaft — genau der
 * „2D-Fluss" aus TODO.md. Die alte Begründung („Sohle 2,68 m unter dem Ufer")
 * hatte die Einschnitttiefe für den Abstand Knoten–Sohle gehalten.
 *
 * Eine feste Zahl passt nicht: in einem Zehntel der Knoten ist das Bett nur
 * 1,5 m tief. Also je Knoten: höchstens `surfaceRise` über dem Knoten, und
 * **unter** dem Gelände am Bandrand, damit die Uferlinie im Hang verschwindet.
 * Über einer Stelle, an der das Bett tiefer liegt als `RIVER.maxDepth`
 * (Straßeneinschnitt am Bergpass, Kopf eines Wasserfalls), gibt es keinen
 * Spiegel — `NaN`, das Band setzt dort aus, und die Physik flutet dort nicht.
 *
 * Bild (`buildRiverGeometry`) und Physik (`WaterField`) lesen **dieselbe**
 * Rechnung; zwei Rechnungen wären zwei Flüsse.
 */
export interface RiverSurface {
  /** Spiegelhöhe je Knoten; `NaN` = kein Wasser an diesem Knoten. */
  readonly level: Float32Array;
  /** Halbe Breite des Wasserbandes je Knoten, in Metern. */
  readonly halfWidth: Float32Array;
}

export function riverSurface(
  file: RiverFile,
  heightAt: (x: number, z: number) => number,
): RiverSurface {
  const c = file.centerline;
  const count = c.length / 3;
  const raw = new Float32Array(count);
  const halfWidth = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = c[i * 3]!, y = c[i * 3 + 1]!, z = c[i * 3 + 2]!;
    const a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
    let tx = c[b * 3]! - c[a * 3]!, tz = c[b * 3 + 2]! - c[a * 3 + 2]!;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const bed = heightAt(x, z);
    const full = (file.halfWidths[i] ?? 4) * RIVER.widthFactor;
    // **Am Hang schmaler statt gar nicht.** Liegt eine Uferseite tiefer als die
    // Mitte (Bergbach quer zum Hang), fände ein Spiegel unter beiden Rändern
    // keinen Platz über der Sohle. Dann das Band einziehen, bis er passt —
    // gemessen betraf das 86 von 422 Knoten, fast alle oberhalb des Passes.
    let level = Number.NaN;
    let width = full;
    for (let k = 0; k < 6; k++) {
      const w = full * (1 - k * 0.14);
      const edge = Math.min(heightAt(x - tz * w, z + tx * w), heightAt(x + tz * w, z - tx * w));
      const candidate = Math.min(y + RIVER.surfaceRise, edge - RIVER.edgeSink);
      if (candidate - bed >= RIVER.minDepth || k === 5) {
        level = candidate;
        width = w;
        if (candidate - bed >= RIVER.minDepth) break;
      }
    }
    const depth = level - bed;
    raw[i] = depth > RIVER.maxDepth || depth < RIVER.minDepth ? Number.NaN : level;
    halfWidth[i] = width;
  }
  // Glätten: Minimum über ±2 Knoten, dann Mittel über ±1 — sonst trüge jede
  // Bodenwelle am Ufer eine Stufe in den Spiegel. Das Minimum zuerst, damit
  // das Mitteln nirgends über das Gelände hebt. Lücken (`NaN`) bleiben Lücken
  // und ziehen ihre Nachbarn nicht mit.
  const low = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let m = raw[i]!;
    for (let k = -2; k <= 2; k++) {
      const v = raw[Math.min(count - 1, Math.max(0, i + k))]!;
      if (v < m) m = v;
    }
    low[i] = m;
  }
  const level = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (Number.isNaN(raw[i]!)) {
      level[i] = Number.NaN;
      continue;
    }
    let sum = 0, n = 0;
    for (let k = -1; k <= 1; k++) {
      const v = low[Math.min(count - 1, Math.max(0, i + k))]!;
      if (!Number.isNaN(v)) {
        sum += v;
        n++;
      }
    }
    level[i] = n > 0 ? Math.min(raw[i]!, sum / n) : raw[i]!;
  }
  return { level, halfWidth };
}

export function buildRiverGeometry(file: RiverFile, surface?: RiverSurface): {
  geometry: BufferGeometry;
  report: RiverGeometryReport;
} {
  const count = file.centerline.length / 3;
  const node = (i: number): Vector3 =>
    new Vector3(file.centerline[i * 3], file.centerline[i * 3 + 1], file.centerline[i * 3 + 2]);

  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);

  let runningLength = 0;
  let steepest = 0;
  let rapidsLength = 0;

  const tangent = new Vector3();
  const side = new Vector3();
  const normal = new Vector3();

  for (let i = 0; i < count; i++) {
    const here = node(i);
    const previous = node(Math.max(0, i - 1));
    const next = node(Math.min(count - 1, i + 1));

    tangent.subVectors(next, previous);
    const run = Math.hypot(tangent.x, tangent.z) || 1;
    const slope = Math.max(0, previous.y - next.y) / run;
    if (slope > steepest) steepest = slope;

    if (i > 0) {
      const step = here.distanceTo(previous);
      runningLength += step;
      if (slope > RIVER.foamSlope) rapidsLength += step;
    }

    // Querrichtung in XZ. Die Normale steht senkrecht auf Tangente und
    // Querrichtung und kippt damit mit dem Bett — genau das liest der Shader
    // als `vWaterSurfaceN`.
    side.set(-tangent.z, 0, tangent.x).normalize();
    normal.crossVectors(side, tangent).normalize();
    if (normal.y < 0) normal.negate();

    const halfWidth = surface?.halfWidth[i] ?? (file.halfWidths[i] ?? 4) * RIVER.widthFactor;
    const level = surface?.level[i];
    const y = level === undefined ? here.y + RIVER.surfaceRise : Number.isNaN(level) ? here.y : level;

    for (const sign of [-1, 1]) {
      const v = i * 2 + (sign < 0 ? 0 : 1);
      positions[v * 3] = here.x + side.x * halfWidth * sign;
      positions[v * 3 + 1] = y;
      positions[v * 3 + 2] = here.z + side.z * halfWidth * sign;
      normals[v * 3] = normal.x;
      normals[v * 3 + 1] = normal.y;
      normals[v * 3 + 2] = normal.z;
      uvs[v * 2] = sign < 0 ? 0 : 1;
      uvs[v * 2 + 1] = runningLength / 30;
    }
  }

  /**
   * Wickelrichtung — **hier lag der Fluss ein ganzes Kapitel lang falsch.**
   *
   * Bis P8.11 stand hier `[a, a+2, a+1, a+1, a+2, a+3]`. Das ist im Uhrzeigersinn
   * von oben gesehen, und three zeichnet Vorderseiten gegen den Uhrzeigersinn:
   * das Band zeigte mit seiner **Vorderseite nach unten** und verschwand von
   * oben vollständig im Backface-Culling.
   *
   * Nachgerechnet für Fließrichtung +Z (`side` = (−t.z, 0, t.x) zeigt dann
   * nach −X, also liegt Vertex `a` auf +X und `a+1` auf −X):
   *
   *   alt  [a, a+2, a+1]:  (P1−P0) × (P2−P0) = (0, −2·hw·d, 0)   → nach unten
   *   neu  [a, a+1, a+2]:  (P1−P0) × (P2−P0) = (0, +2·hw·d, 0)   → nach oben
   *
   * Für das zweite Dreieck genauso. Die Vorzeichen hängen nicht an der
   * Fließrichtung: `side` ist immer die um −90° gedrehte Tangente, links und
   * rechts sind also relativ zur Strömung fest.
   *
   * **Warum es niemandem auffiel:** das `normal`-Attribut oben wird
   * ausdrücklich nach oben gedreht (`if (normal.y < 0) normal.negate()`). Die
   * Beleuchtung war damit rechnerisch richtig, die Fläche nur unsichtbar —
   * und P8.6 hat den fehlenden Fluss am Bild gesucht und als „farblich nicht
   * von den Reisfeldern zu unterscheiden" abgelegt. Er war nie gezeichnet.
   * Dieselbe Falle steht in CLAUDE.md schon für das Straßen-Mesh.
   */
  // Ein Abschnitt ohne Spiegel an einem seiner Enden entfällt (siehe
  // `riverSurface`) — über dem Straßeneinschnitt am Bergpass stand das Band
  // sonst 20…31 m in der Luft.
  const quads: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    if (surface && (Number.isNaN(surface.level[i]!) || Number.isNaN(surface.level[i + 1]!))) continue;
    const a = i * 2;
    quads.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const indices = new Uint32Array(quads);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return {
    geometry,
    report: {
      nodes: count,
      triangles: (count - 1) * 2,
      steepest,
      rapidsLength,
    },
  };
}
