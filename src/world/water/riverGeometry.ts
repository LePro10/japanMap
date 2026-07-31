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
export function buildRiverGeometry(file: RiverFile): {
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

    const halfWidth = (file.halfWidths[i] ?? 4) * RIVER.widthFactor;
    const y = here.y + RIVER.surfaceRise;

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

  const indices = new Uint32Array((count - 1) * 6);
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  }

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
