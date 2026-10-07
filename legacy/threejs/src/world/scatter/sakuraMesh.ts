import { BufferAttribute, BufferGeometry, Color } from 'three';

/**
 * Kirschbaum-Geometrie — dieselbe Silhouette wie der Stunt-Ring aus P26,
 * jetzt als Vegetationsart mit LOD.
 *
 * Die Form bleibt hier, nicht in StuntSystem: Commons-Schale und Stadtgarten
 * teilen sie, und der Imposter-Baker braucht Variante 0 als Mesh, nicht als
 * Instanz. `detail` wählt nur die Kronendichte; die Ballen sitzen auf derselben
 * Spirale, damit der Stufenwechsel die Gestalt nicht kippt.
 */

export const SAKURA_HEIGHT = 5.4;
export const SAKURA_TRUNK = 0x5b483a;
export const SAKURA_TONES = [0xffc9dd, 0xf7aecb, 0xe391b4] as const;

interface BoxSpec {
  readonly positions: number[];
  readonly colors: number[];
}

export function createSakuraGeometry(rng: () => number, detail: number): BufferGeometry {
  const trunkScale = 0.92 + rng() * 0.16;
  const parts: BoxSpec[] = [
    box(0.62 * trunkScale, 1.9, 0.62 * trunkScale, 0, 0.95, 0, SAKURA_TRUNK),
    box(0.46 * trunkScale, 1.1, 0.46 * trunkScale, 0, 2.3, 0, SAKURA_TRUNK),
  ];
  if (detail > 0) {
    parts.push(
      boxY(0.3, 1.0, 0.3, 0.42, 2.55, -0.16, 0.55, SAKURA_TRUNK),
      boxY(0.28, 0.9, 0.28, -0.38, 2.5, 0.28, -0.75, SAKURA_TRUNK),
    );
  }

  const CROWN_N = 11;
  const CROWN_Y = 3.4;
  const CROWN_RX = 2.0 + rng() * 0.2;
  const CROWN_RY = 1.04 + rng() * 0.12;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const phase = rng() * GOLDEN;

  for (let i = 0; i < CROWN_N; i++) {
    // Gerade Indizes bleiben auf der groben Stufe — dieselben Orte wie nah.
    if (detail < 1 && i % 2 === 1) continue;
    const t = (i + 0.5) / CROWN_N;
    const winkel = i * GOLDEN + phase;
    const hoehe = Math.cos(t * Math.PI * 0.72);
    const ring = Math.sqrt(Math.max(0, 1 - hoehe * hoehe));
    const x = Math.cos(winkel) * ring * CROWN_RX;
    const z = Math.sin(winkel) * ring * CROWN_RX;
    const y = CROWN_Y + hoehe * CROWN_RY;
    const groesse = 1.72 - ring * 0.25;
    const wahl = (i * 7 + (hoehe > 0.55 ? 2 : 0)) % SAKURA_TONES.length;
    const ton = SAKURA_TONES[hoehe > 0.55 ? Math.min(wahl, 1) : wahl]!;
    parts.push(blob(groesse, groesse * 0.74, groesse * 0.94, x, y, z, ton));
  }

  return mergeBoxes(parts);
}

function box(
  w: number,
  h: number,
  d: number,
  ox: number,
  oy: number,
  oz: number,
  hex: number,
): BoxSpec {
  const x0 = ox - w / 2;
  const x1 = ox + w / 2;
  const y0 = oy - h / 2;
  const y1 = oy + h / 2;
  const z0 = oz - d / 2;
  const z1 = oz + d / 2;
  const v = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const faces: [number, number, number][][] = [
    [v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0)],
    [v(x0, y0, z1), v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1)],
    [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)],
    [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)],
    [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)],
    [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color(hex);
  for (const [a, b, cc, dd] of faces as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ][]) {
    positions.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
    for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
  }
  return { positions, colors };
}

function boxY(
  w: number,
  h: number,
  d: number,
  ox: number,
  oy: number,
  oz: number,
  turn: number,
  hex: number,
): BoxSpec {
  const spec = box(w, h, d, 0, oy, 0, hex);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const p = spec.positions;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const z = p[i + 2]!;
    p[i] = x * cos - z * sin + ox;
    p[i + 2] = x * sin + z * cos + oz;
  }
  return spec;
}

function blob(
  rx: number,
  ry: number,
  rz: number,
  ox: number,
  oy: number,
  oz: number,
  hex: number,
): BoxSpec {
  const t = (1 + Math.sqrt(5)) / 2;
  const roh: [number, number, number][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const v = roh.map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [(x / l) * rx, (y / l) * ry, (z / l) * rz] as [number, number, number];
  });
  const flaechen: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color(hex);
  for (const [ia, ib, ic] of flaechen) {
    const a = v[ia]!;
    let b = v[ib]!;
    let d = v[ic]!;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const wx = d[0] - a[0];
    const wy = d[1] - a[1];
    const wz = d[2] - a[2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    if (nx * a[0] + ny * a[1] + nz * a[2] < 0) {
      const hilf = b;
      b = d;
      d = hilf;
    }
    positions.push(
      a[0] + ox, a[1] + oy, a[2] + oz,
      b[0] + ox, b[1] + oy, b[2] + oz,
      d[0] + ox, d[1] + oy, d[2] + oz,
    );
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  return { positions, colors };
}

function mergeBoxes(specs: BoxSpec[]): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const spec of specs) {
    positions.push(...spec.positions);
    colors.push(...spec.colors);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(Float32Array.from(colors), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
