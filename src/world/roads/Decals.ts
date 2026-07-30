import {
  CanvasTexture,
  Color,
  LinearFilter,
  Matrix4,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';

import { DECALS, ROAD_MESH, ROAD_TYPES, type RoadData } from '@/config/roads.config';

/**
 * Straßendecals — PLAN.md P6 / 6.6.
 *
 * Fahrbahnmarkierungen, Gullys, Flicken und Reifenspuren. Alle vier sind
 * **projizierte Vierecke in einem einzigen instanzierten Mesh**: 2 Dreiecke je
 * Decal, ein Draw-Call für das ganze Netz. Der Plan verlangt genau das
 * („gruppiert instanziert"), und der Grund ist die Menge — auf 10,9 km Netz
 * kommen ein paar tausend Marken zusammen, und jede einzeln gezeichnet wäre
 * die Hälfte des Draw-Call-Budgets für Striche.
 *
 * ## Warum sie flach auf der Fahrbahn liegen und trotzdem nicht flackern
 *
 * Ein Decal, das auf derselben Höhe wie die Fahrbahn liegt, streitet mit ihr im
 * Tiefenpuffer — derselbe Fehler, gegen den P3 den Rücksprung an Kreuzungen
 * eingeführt hat. Angehoben wird es trotzdem nicht: 2 cm über der Fahrbahn
 * ergäben bei 2,23° Sonnenstand einen 50 cm langen Schattenstrich neben jeder
 * Markierung. Stattdessen `polygonOffset` — die Verschiebung passiert erst im
 * Tiefenpuffer, die Geometrie bleibt, wo sie hingehört.
 *
 * ## Die Marken kennen die Straße, nicht die Textur
 *
 * Wo ein Decal liegt, entscheidet die **Mittellinie** aus `roads.json`: Position
 * und Richtung kommen aus der Bogenlänge, die Querlage aus der Fahrbahnbreite
 * des Straßentyps. Damit sitzt die Randlinie auf jeder Strecke am richtigen
 * Fleck, auch wenn sich die Breite eines Typs ändert — und in einer Kurve läuft
 * sie mit, statt sich abzuschneiden.
 */

/** Ein Feld im Decal-Atlas. */
interface DecalCell {
  readonly u: number;
  readonly v: number;
  readonly du: number;
  readonly dv: number;
}

export interface DecalResult {
  readonly matrices: readonly Matrix4[];
  readonly rects: Float32Array;
  readonly tints: Float32Array;
  readonly counts: Readonly<Record<string, number>>;
}

const CELLS = {
  line: 0,
  gully: 1,
  patch: 2,
  tire: 3,
} as const;

/** 2 × 2 Felder auf einer quadratischen Textur. */
function cellRect(index: number): DecalCell {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return { u: column * 0.5, v: 1 - (row + 1) * 0.5, du: 0.5, dv: 0.5 };
}

export function buildDecalAtlas(): Texture {
  const size = DECALS.atlasSize;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Kein 2D-Kontext für den Decal-Atlas.');
  g.clearRect(0, 0, size, size);

  // ── Feld 0: Markierungsstrich ────────────────────────────────────────
  // Ein Balken über die volle Zellhöhe mit weichen Längskanten. Weich, weil
  // eine Fahrbahnmarkierung aus 200 m Entfernung sonst zu flimmern anfängt und
  // aus 2 m wie mit dem Lineal geschnitten aussieht — beides ist falsch.
  {
    const gradient = g.createLinearGradient(0, 0, half, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.22, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.78, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, half, half);
    // Abnutzung: die Farbe ist nicht überall gleich dick.
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * half;
      const y = Math.random() * half;
      g.globalAlpha = 0.1 + Math.random() * 0.35;
      g.beginPath();
      g.arc(x, y, 2 + Math.random() * 7, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ── Feld 1: Gully ────────────────────────────────────────────────────
  {
    const cx = half + half / 2;
    const cy = half / 2;
    const r = half * 0.36;
    g.fillStyle = 'rgba(38,38,40,0.96)';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,120,124,0.9)';
    g.lineWidth = r * 0.09;
    g.beginPath();
    g.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(96,96,100,0.85)';
    g.lineWidth = r * 0.11;
    for (let i = 0; i < 7; i++) {
      const t = -0.62 + (1.24 * i) / 6;
      g.beginPath();
      g.moveTo(cx + t * r * 0.86, cy - Math.sqrt(Math.max(0, 1 - t * t)) * r * 0.8);
      g.lineTo(cx + t * r * 0.86, cy + Math.sqrt(Math.max(0, 1 - t * t)) * r * 0.8);
      g.stroke();
    }
  }

  // ── Feld 2: Flicken ──────────────────────────────────────────────────
  {
    const cx = half / 2;
    const cy = half + half / 2;
    g.fillStyle = 'rgba(24,24,26,0.8)';
    g.beginPath();
    const corners = 11;
    for (let i = 0; i <= corners; i++) {
      const a = (i / corners) * Math.PI * 2;
      const r = half * (0.22 + 0.16 * Math.abs(Math.sin(a * 2.7 + 1.3)));
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }

  // ── Feld 3: Reifenspur ───────────────────────────────────────────────
  {
    const x0 = half;
    const y0 = half;
    for (const offset of [0.3, 0.62]) {
      const gradient = g.createLinearGradient(x0 + half * (offset - 0.09), 0, x0 + half * (offset + 0.09), 0);
      gradient.addColorStop(0, 'rgba(16,16,18,0)');
      gradient.addColorStop(0.5, 'rgba(16,16,18,0.62)');
      gradient.addColorStop(1, 'rgba(16,16,18,0)');
      g.fillStyle = gradient;
      g.fillRect(x0 + half * (offset - 0.09), y0, half * 0.18, half);
    }
    // An den Enden ausblenden, sonst hört eine Bremsspur mit einer Kante auf.
    const fade = g.createLinearGradient(0, y0, 0, y0 + half);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.18, 'rgba(0,0,0,0)');
    fade.addColorStop(0.82, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(x0, y0, half, half);
    g.globalCompositeOperation = 'source-over';
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  texture.name = 'DecalAtlas';
  return texture;
}

/** Deterministischer Strom — dieselbe Straße ergibt dieselben Flicken. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WHITE = new Color().setHex(0xd8d5cc, SRGBColorSpace);
const GREY = new Color().setHex(0x9a9a9a, SRGBColorSpace);
const DARK = new Color().setHex(0x6a6a6a, SRGBColorSpace);

export function buildDecals(roads: readonly RoadData[]): DecalResult {
  const random = mulberry32(DECALS.seed);
  const matrices: Matrix4[] = [];
  const rectValues: number[] = [];
  const tintValues: number[] = [];
  const counts: Record<string, number> = {
    strich: 0,
    gully: 0,
    flicken: 0,
    spur: 0,
    ueberweg: 0,
  };

  const position = new Vector3();
  const tangent = new Vector3();
  const right = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  const basis = new Matrix4();

  const push = (cell: number, tint: Color): void => {
    const rect = cellRect(cell);
    rectValues.push(rect.u, rect.v, rect.du, rect.dv);
    tintValues.push(tint.r, tint.g, tint.b);
  };

  /**
   * Ein Decal an einer Bogenlänge ablegen.
   *
   * `lateral` ist der Querversatz in Metern, `length` die Ausdehnung längs.
   * Gedreht wird um die **Flächennormale der Fahrbahn**, nicht um die
   * Welt-Y-Achse: auf einer geneigten Straße läge eine Markierung sonst schief
   * im Asphalt.
   */
  const place = (
    line: readonly number[],
    index: number,
    count: number,
    closed: boolean,
    lateral: number,
    width: number,
    length: number,
    cell: number,
    tint: Color,
    yaw = 0,
  ): void => {
    const previous = closed ? (index - 1 + count) % count : Math.max(index - 1, 0);
    const next = closed ? (index + 1) % count : Math.min(index + 1, count - 1);
    tangent
      .set(
        line[next * 3]! - line[previous * 3]!,
        line[next * 3 + 1]! - line[previous * 3 + 1]!,
        line[next * 3 + 2]! - line[previous * 3 + 2]!,
      )
      .normalize();
    right.crossVectors(tangent, up).normalize();
    const normal = new Vector3().crossVectors(right, tangent).normalize();

    position
      .set(line[index * 3]!, line[index * 3 + 1]!, line[index * 3 + 2]!)
      .addScaledVector(right, lateral)
      // **Auf die Fahrbahn, nicht auf die Mittellinie.** `roads.json` führt die
      // Achse; das Straßen-Mesh liegt seit P3 um `surfaceOffset` darüber, damit
      // Fahrbahn und eingeschnittenes Gelände sich nicht um jedes Pixel
      // streiten. Wer diesen Versatz vergisst, legt seine Markierungen 6 cm
      // **unter** den Asphalt — und dann rendert three sie brav und man sieht
      // kein einziges Pixel. Genau das war der erste Lauf: 3339 Instanzen an
      // richtiger Stelle, richtige Skalierung, richtiges Material, und die
      // Differenz gegen ein Bild ohne sie war null.
      .addScaledVector(normal, ROAD_MESH.surfaceOffset + DECALS.lift);

    // Das Viereck liegt in der xy-Ebene; x quer, y längs, z ist die Normale.
    basis.makeBasis(right, tangent, normal);
    quaternion.setFromRotationMatrix(basis);
    if (yaw !== 0) quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), yaw));
    scale.set(width, length, 1);

    matrices.push(new Matrix4().compose(position, quaternion, scale));
    push(cell, tint);
  };

  for (const road of roads) {
    const settings = ROAD_TYPES[road.type];
    const line = road.centerline;
    const count = line.length / 3;
    if (count < 4) continue;
    const spacing = road.length / (road.closed ? count : Math.max(count - 1, 1));
    const half = settings.width / 2;
    const marked = DECALS.markedTypes.includes(road.type);

    // ── Randlinien ────────────────────────────────────────────────────
    if (marked) {
      const step = Math.max(1, Math.round(DECALS.edgeLength / spacing));
      for (let i = 0; i < count; i += step) {
        for (const side of [-1, 1]) {
          place(
            line,
            i,
            count,
            road.closed,
            side * (half - DECALS.edgeInset),
            DECALS.lineWidth,
            DECALS.edgeLength * 1.04,
            CELLS.line,
            WHITE,
          );
          counts.strich!++;
        }
      }

      // ── Mittelstrich, gestrichelt ───────────────────────────────────
      const dashStep = Math.max(1, Math.round(DECALS.dashPitch / spacing));
      for (let i = 0; i < count; i += dashStep) {
        place(
          line,
          i,
          count,
          road.closed,
          0,
          DECALS.lineWidth,
          DECALS.dashLength,
          CELLS.line,
          WHITE,
        );
        counts.strich!++;
      }
    }

    // ── Gullys ────────────────────────────────────────────────────────
    const gullyStep = Math.max(1, Math.round(DECALS.gullyPitch / spacing));
    let side = 1;
    for (let i = Math.floor(gullyStep / 2); i < count; i += gullyStep) {
      place(
        line,
        i,
        count,
        road.closed,
        side * (half - DECALS.gullyInset),
        DECALS.gullySize,
        DECALS.gullySize,
        CELLS.gully,
        GREY,
      );
      counts.gully!++;
      side = -side;
    }

    // ── Flicken ───────────────────────────────────────────────────────
    const patchStep = Math.max(1, Math.round(DECALS.patchPitch / spacing));
    for (let i = 0; i < count; i += patchStep) {
      if (random() > 0.62) continue;
      const size = DECALS.patchSize[0] + random() * (DECALS.patchSize[1] - DECALS.patchSize[0]);
      place(
        line,
        i,
        count,
        road.closed,
        (random() * 2 - 1) * (half - 0.4),
        size,
        size * (0.7 + random() * 0.8),
        CELLS.patch,
        DARK,
        random() * Math.PI,
      );
      counts.flicken!++;
    }

    // ── Fußgängerüberwege an den Kreuzungen ───────────────────────────
    //
    // `roads.json` sagt, wo eine Strecke an eine andere anschließt und wie weit
    // ihr Mesh dafür zurückspringt. Genau dort — hinter dem Rücksprung, also am
    // Anfang der eigenen Fahrbahn — gehört der Überweg hin. Ihn aus einer
    // eigenen Positionsliste zu setzen hieße, dieselbe Kreuzung ein zweites Mal
    // zu beschreiben; genau diese Sorte Doppelung hat in P3 die Rinne neben das
    // Straßen-Mesh gelegt.
    const cw = DECALS.crosswalk;
    for (const junction of road.junctions) {
      const trim = junction.at === 'start' ? road.trimStart : road.trimEnd;
      const fromEnd = Math.round((trim + cw.offset) / spacing);
      const index = junction.at === 'start' ? fromEnd : count - 1 - fromEnd;
      if (index < 1 || index > count - 2) continue;

      // So viele Streifen, wie zwischen die Fahrbahnränder passen — gerundet,
      // damit der Überweg mittig sitzt und nicht an einer Seite ausfranst.
      const usable = settings.width - 2 * DECALS.edgeInset;
      const pitch = cw.stripe + cw.gap;
      const stripes = Math.max(2, Math.floor(usable / pitch));
      const start = -((stripes - 1) * pitch) / 2;
      for (let s = 0; s < stripes; s++) {
        place(line, index, count, road.closed, start + s * pitch, cw.stripe, cw.length,
          CELLS.line, WHITE);
        counts.strich!++;
      }

      // Haltelinie **nur auf der eigenen Seite** der Fahrbahn: wer aus der
      // Nebenstraße kommt, hält; wer auf der Hauptstrecke fährt, nicht.
      const stopIndex =
        junction.at === 'start'
          ? index + Math.round((cw.length / 2 + cw.stopGap) / spacing)
          : index - Math.round((cw.length / 2 + cw.stopGap) / spacing);
      if (stopIndex > 0 && stopIndex < count - 1) {
        place(line, stopIndex, count, road.closed, half / 2, half - DECALS.edgeInset,
          cw.stopWidth, CELLS.line, WHITE);
        counts.strich!++;
      }
      counts.ueberweg!++;
    }

    // ── Reifenspuren in Kurven ────────────────────────────────────────
    //
    // Wo gebremst und gedriftet wird, sagt die **Krümmung** der Mittellinie —
    // dieselbe Größe, an der P3 die Querneigung bemisst. Eine Bremsspur auf der
    // Geraden wäre Dekoration; in der Kurve ist sie eine Aussage über die
    // Strecke.
    const spurStep = Math.max(1, Math.round(DECALS.tirePitch / spacing));
    for (let i = spurStep; i < count - spurStep; i += spurStep) {
      const ax = line[i * 3]! - line[(i - spurStep) * 3]!;
      const az = line[i * 3 + 2]! - line[(i - spurStep) * 3 + 2]!;
      const bx = line[(i + spurStep) * 3]! - line[i * 3]!;
      const bz = line[(i + spurStep) * 3 + 2]! - line[i * 3 + 2]!;
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      if (la < 1e-4 || lb < 1e-4) continue;
      const turn = Math.abs(Math.atan2((ax * bz - az * bx) / (la * lb), (ax * bx + az * bz) / (la * lb)));
      const curvature = turn / ((la + lb) / 2);
      if (curvature < DECALS.tireCurvature) continue;
      place(
        line,
        i,
        count,
        road.closed,
        0,
        settings.width * 0.62,
        DECALS.tireLength,
        CELLS.tire,
        DARK,
      );
      counts.spur!++;
    }
  }

  return {
    matrices,
    rects: new Float32Array(rectValues),
    tints: new Float32Array(tintValues),
    counts,
  };
}
