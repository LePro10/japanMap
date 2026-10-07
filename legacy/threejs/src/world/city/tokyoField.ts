/**
 * Abstandsfelder und Höhenlinien für Neo-Tokio v2 (docs/TOKYO.md).
 *
 * ## Warum ein Feld und nicht Polygon-Verschneidung
 *
 * Generator v1 kannte nur achsparallele Zellen zwischen Rasterlinien. Jede
 * Straße, die nicht auf einer Linie lag — die Diagonale in die Scramble, der
 * ebenerdige Ring, ein Kurvenbogen —, zerlegte ihre Zelle in 2-m-Kacheln, und
 * im Bild standen Treppenstufen am Bordstein (Rückmeldung nach dem Teilstück,
 * Bild 1). Eine exakte Verschneidung beliebiger Straßenbänder wäre der
 * „richtige" Weg und zugleich der fehleranfälligste: Einmündungen, Bögen,
 * Enden, die in einer anderen Fahrbahn liegen.
 *
 * Hier wird stattdessen ein **Abstandsfeld** auf einem 1-m-Gitter gerechnet —
 * je Knoten der Abstand zur nächsten Fahrbahnkante — und der Bordstein ist
 * seine Nulllinie. Gerade Straßen ergeben bei linearer Interpolation exakt
 * gerade Linien, Bögen weiche Kurven, und Einmündungen ergeben sich von selbst.
 * Die Straßen verschiedener Achsen werden **weich** vereinigt (`smin`): das
 * rundet die Blockecken, wie ein echter Bordstein an einer Kreuzung.
 */

export const FIELD_RES = 1;

export interface FieldGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly data: Float32Array;
}

export function createField(x0: number, z0: number, x1: number, z1: number, fill: number): FieldGrid {
  const nx = Math.round((x1 - x0) / FIELD_RES) + 1;
  const nz = Math.round((z1 - z0) / FIELD_RES) + 1;
  return { x0, z0, nx, nz, data: new Float32Array(nx * nz).fill(fill) };
}

/** Bilinear abgetastet, außerhalb geklemmt. */
export function sampleField(f: FieldGrid, x: number, z: number): number {
  let gx = (x - f.x0) / FIELD_RES;
  let gz = (z - f.z0) / FIELD_RES;
  gx = Math.max(0, Math.min(f.nx - 1.0001, gx));
  gz = Math.max(0, Math.min(f.nz - 1.0001, gz));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const tx = gx - i;
  const tz = gz - j;
  const d = f.data;
  const k = j * f.nx + i;
  const a = d[k]! + (d[k + 1]! - d[k]!) * tx;
  const b = d[k + f.nx]! + (d[k + f.nx + 1]! - d[k + f.nx]!) * tx;
  return a + (b - a) * tz;
}

/** Gradient (zentrale Differenz über einen Knotenabstand). */
export function gradField(f: FieldGrid, x: number, z: number): [number, number] {
  const e = FIELD_RES * 0.5;
  return [sampleField(f, x + e, z) - sampleField(f, x - e, z), sampleField(f, x, z + e) - sampleField(f, x, z - e)];
}

/**
 * Weiches Minimum (polynomial, k = Übergangsbreite in Metern).
 *
 * Für zwei rechtwinklig kreuzende Straßen ergibt k ≈ 6 m einen Bordsteinradius
 * von rund 3 m — gemessen am Plan, nicht hergeleitet. Innerhalb **einer**
 * Straße wird hart vereinigt: sonst wölbte sich der Bordstein an jeder
 * Segmentfuge um k/4 in die Fahrbahn.
 */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export interface Band {
  /** x,z-Paare eines Polygonzugs. */
  readonly points: readonly number[];
  /** Abstand der Kante von der Mittellinie. */
  readonly half: number;
  /** Zusätzlicher Versatz — z. B. Gehwegbreite für die Baulinie. */
  readonly offset: number;
}

/**
 * Ein Band in das Feld einrechnen: `min_Segmente(Abstand − half − offset)`,
 * dann weich mit dem Bestand vereinigt. `reach` begrenzt, wie weit in die Blöcke
 * hinein gerechnet wird — dahinter bleibt der Füllwert stehen, und der ist
 * groß genug, um „weit weg von jeder Straße" zu bedeuten.
 */
export function addBand(f: FieldGrid, band: Band, k: number, reach: number): void {
  const p = band.points;
  if (p.length < 4) return;
  const r = band.half + band.offset + reach;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]!);
    maxX = Math.max(maxX, p[i]!);
    minZ = Math.min(minZ, p[i + 1]!);
    maxZ = Math.max(maxZ, p[i + 1]!);
  }
  const i0 = Math.max(0, Math.floor((minX - r - f.x0) / FIELD_RES));
  const i1 = Math.min(f.nx - 1, Math.ceil((maxX + r - f.x0) / FIELD_RES));
  const j0 = Math.max(0, Math.floor((minZ - r - f.z0) / FIELD_RES));
  const j1 = Math.min(f.nz - 1, Math.ceil((maxZ + r - f.z0) / FIELD_RES));
  if (i1 < i0 || j1 < j0) return;
  const w = i1 - i0 + 1;
  const local = new Float32Array(w * (j1 - j0 + 1)).fill(Infinity);
  // Je Segment nur sein eigener Kasten — der ganze Kasten der Straße wäre bei
  // einer 1-km-Achse eine Million Knoten je Segment.
  for (let s = 0; s + 3 < p.length; s += 2) {
    const ax = p[s]!, az = p[s + 1]!, bx = p[s + 2]!, bz = p[s + 3]!;
    const dx = bx - ax, dz = bz - az;
    const q = dx * dx + dz * dz || 1e-9;
    const si0 = Math.max(i0, Math.floor((Math.min(ax, bx) - r - f.x0) / FIELD_RES));
    const si1 = Math.min(i1, Math.ceil((Math.max(ax, bx) + r - f.x0) / FIELD_RES));
    const sj0 = Math.max(j0, Math.floor((Math.min(az, bz) - r - f.z0) / FIELD_RES));
    const sj1 = Math.min(j1, Math.ceil((Math.max(az, bz) + r - f.z0) / FIELD_RES));
    for (let j = sj0; j <= sj1; j++) {
      const z = f.z0 + j * FIELD_RES;
      for (let i = si0; i <= si1; i++) {
        const x = f.x0 + i * FIELD_RES;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        const k2 = (j - j0) * w + (i - i0);
        if (d < local[k2]!) local[k2] = d;
      }
    }
  }
  const off = band.half + band.offset;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = local[(j - j0) * w + (i - i0)]!;
      if (v === Infinity) continue;
      const idx = j * f.nx + i;
      f.data[idx] = k > 0 ? smin(f.data[idx]!, v - off, k) : Math.min(f.data[idx]!, v - off);
    }
  }
}

/**
 * Eine Straße in **beide** Felder zugleich einrechnen — Bordstein (G, Versatz 0)
 * und Baulinie (H, Versatz = Gehweg).
 *
 * Gemessen: zwei getrennte `addBand`-Läufe mit `Math.hypot` je Knoten kosteten
 * 1,2…1,45 s beim Laden, gegen 0,9 s für den **ganzen** v1-Aufbau. Ein Lauf mit
 * quadrierten Abständen und einer Wurzel je Knoten statt je Segment rechnet
 * dasselbe Feld.
 */
export function addRoad(G: FieldGrid, H: FieldGrid, points: readonly number[], half: number, walk: number, kG: number, kH: number, reach: number): void {
  const p = points;
  if (p.length < 4) return;
  const r = half + walk + reach;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]!); maxX = Math.max(maxX, p[i]!);
    minZ = Math.min(minZ, p[i + 1]!); maxZ = Math.max(maxZ, p[i + 1]!);
  }
  const f = G;
  const i0 = Math.max(0, Math.floor((minX - r - f.x0) / FIELD_RES));
  const i1 = Math.min(f.nx - 1, Math.ceil((maxX + r - f.x0) / FIELD_RES));
  const j0 = Math.max(0, Math.floor((minZ - r - f.z0) / FIELD_RES));
  const j1 = Math.min(f.nz - 1, Math.ceil((maxZ + r - f.z0) / FIELD_RES));
  if (i1 < i0 || j1 < j0) return;
  const w = i1 - i0 + 1;
  const local = new Float32Array(w * (j1 - j0 + 1)).fill(Infinity);
  const r2 = r * r;
  for (let s = 0; s + 3 < p.length; s += 2) {
    const ax = p[s]!, az = p[s + 1]!, bx = p[s + 2]!, bz = p[s + 3]!;
    const dx = bx - ax, dz = bz - az;
    const inv = 1 / (dx * dx + dz * dz || 1e-9);
    const si0 = Math.max(i0, Math.floor((Math.min(ax, bx) - r - f.x0) / FIELD_RES));
    const si1 = Math.min(i1, Math.ceil((Math.max(ax, bx) + r - f.x0) / FIELD_RES));
    const sj0 = Math.max(j0, Math.floor((Math.min(az, bz) - r - f.z0) / FIELD_RES));
    const sj1 = Math.min(j1, Math.ceil((Math.max(az, bz) + r - f.z0) / FIELD_RES));
    for (let j = sj0; j <= sj1; j++) {
      const qz = f.z0 + j * FIELD_RES - az;
      const row = (j - j0) * w - i0;
      for (let i = si0; i <= si1; i++) {
        const qx = f.x0 + i * FIELD_RES - ax;
        let t = (qx * dx + qz * dz) * inv;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - dx * t, ez = qz - dz * t;
        const d2 = ex * ex + ez * ez;
        if (d2 < local[row + i]! && d2 < r2) local[row + i] = d2;
      }
    }
  }
  const gOff = half, hOff = half + walk;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v2 = local[(j - j0) * w + (i - i0)]!;
      if (v2 === Infinity) continue;
      const v = Math.sqrt(v2);
      const idx = j * f.nx + i;
      G.data[idx] = smin(G.data[idx]!, v - gOff, kG);
      H.data[idx] = smin(H.data[idx]!, v - hOff, kH);
    }
  }
}

/** Eine geschlossene Höhenlinie als x,z-Folge, Fläche mit Vorzeichen. */
export interface Loop {
  readonly points: number[];
  readonly area: number;
}

/**
 * Marching Squares mit Verkettung: alle geschlossenen Nulllinien, das Innere
 * (Wert > 0) liegt **links** der Laufrichtung, von oben (+Y) auf x/z gesehen
 * gegen den Uhrzeigersinn also außen herum. Die Richtung ist über die Zellen
 * einheitlich: eine Kante, über die man in einer Zelle *eintritt*, ist in der
 * Nachbarzelle eine, über die man *austritt* — die Nachbarzelle läuft ihre Ecken
 * in umgekehrter Richtung ab. Daher schließen sich die Stücke ohne Suche.
 */
export function contours(f: FieldGrid): Loop[] {
  const { nx, nz, data } = f;
  const next = new Int32Array(nx * nz * 2).fill(-1);
  const edgeId = (i: number, j: number, vertical: boolean): number => (j * nx + i) * 2 + (vertical ? 1 : 0);
  const starts: number[] = [];
  const inside = (i: number, j: number): boolean => data[j * nx + i]! > 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c0 = inside(i, j), c1 = inside(i + 1, j), c2 = inside(i + 1, j + 1), c3 = inside(i, j + 1);
      if (c0 === c1 && c1 === c2 && c2 === c3) continue;
      // Kanten in Eckreihenfolge: e0 = v0→v1, e1 = v1→v2, e2 = v2→v3, e3 = v3→v0.
      const edges = [edgeId(i, j, false), edgeId(i + 1, j, true), edgeId(i, j + 1, false), edgeId(i, j, true)];
      const corner = [c0, c1, c2, c3];
      const entries: number[] = [];
      const exits: number[] = [];
      for (let e = 0; e < 4; e++) {
        const a = corner[e]!, b = corner[(e + 1) % 4]!;
        if (!a && b) entries.push(e);
        if (a && !b) exits.push(e);
      }
      if (entries.length === 1) {
        next[edges[entries[0]!]!] = edges[exits[0]!]!;
        starts.push(edges[entries[0]!]!);
      } else {
        // Sattel: zusammenhängend (Mitte innen) → zum vorigen Austritt, sonst zum nächsten.
        const centre = (data[j * nx + i]! + data[j * nx + i + 1]! + data[(j + 1) * nx + i + 1]! + data[(j + 1) * nx + i]!) / 4 > 0;
        for (const en of entries) {
          const ex = centre ? (en + 3) % 4 : (en + 1) % 4;
          next[edges[en]!] = edges[ex]!;
          starts.push(edges[en]!);
        }
      }
    }
  }
  const point = (id: number): [number, number] => {
    const node = id >> 1;
    const i = node % nx;
    const j = (node - i) / nx;
    const a = data[node]!;
    const bIdx = id & 1 ? node + nx : node + 1;
    const b = data[bIdx]!;
    const t = a === b ? 0.5 : a / (a - b);
    const x = f.x0 + (i + (id & 1 ? 0 : t)) * FIELD_RES;
    const z = f.z0 + (j + (id & 1 ? t : 0)) * FIELD_RES;
    return [x, z];
  };
  const loops: Loop[] = [];
  const seen = new Uint8Array(next.length);
  for (const s of starts) {
    if (seen[s]) continue;
    const pts: number[] = [];
    let e = s;
    let guard = 0;
    while (e >= 0 && !seen[e] && guard++ < 2_000_000) {
      seen[e] = 1;
      const [x, z] = point(e);
      pts.push(x, z);
      e = next[e]!;
    }
    if (pts.length < 6) continue;
    loops.push({ points: pts, area: signedArea(pts) });
  }
  return loops;
}

export function signedArea(p: readonly number[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    a += p[i]! * p[j + 1]! - p[j]! * p[i + 1]!;
  }
  return a / 2;
}

/** Douglas–Peucker für geschlossene Züge. */
export function simplifyLoop(p: readonly number[], tolerance: number): number[] {
  const n = p.length / 2;
  if (n < 4) return p.slice();
  // Aufteilen am am weitesten entfernten Punktepaar, damit der Schluss keine Kante verschluckt.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(p[i * 2]! - p[0]!, p[i * 2 + 1]! - p[1]!);
    if (d > best) { best = d; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[(a % n) * 2]!, az = p[(a % n) * 2 + 1]!;
    const bx = p[(b % n) * 2]!, bz = p[(b % n) * 2 + 1]!;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1e-9;
    let worst = -1;
    let at = -1;
    for (let k = a + 1; k < b; k++) {
      const x = p[(k % n) * 2]!, z = p[(k % n) * 2 + 1]!;
      const d = Math.abs((x - ax) * dz - (z - az) * dx) / len;
      if (d > worst) { worst = d; at = k; }
    }
    if (worst > tolerance && at > 0) {
      keep[at % n] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2]!, p[i * 2 + 1]!);
  return out;
}

export function pointInLoop(p: readonly number[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i]!, zi = p[i + 1]!, xj = p[j]!, zj = p[j + 1]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * Belegungsraster in 0,5 m — wer hier steht, steht. Häuser, Freiflächen,
 * Bahn und Hochstraßenpfeiler tragen sich ein; der Generator fragt, bevor er
 * setzt. 0,5 m und nicht 1 m: zwei Häuser, die eine Wand teilen, müssen beide
 * passen, und bei 1 m fiele die gemeinsame Kante in dieselbe Zelle.
 */
export class Occupancy {
  static readonly RES = 0.5;
  readonly nx: number;
  readonly nz: number;
  readonly cells: Uint8Array;
  constructor(readonly x0: number, readonly z0: number, x1: number, z1: number) {
    this.nx = Math.ceil((x1 - x0) / Occupancy.RES);
    this.nz = Math.ceil((z1 - z0) / Occupancy.RES);
    this.cells = new Uint8Array(this.nx * this.nz);
  }
  at(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / Occupancy.RES);
    const j = Math.floor((z - this.z0) / Occupancy.RES);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 255;
    return this.cells[j * this.nx + i]!;
  }
  /** Gedrehtes Rechteck eintragen: Zellen, deren Mitte darin liegt. */
  markRect(cx: number, cz: number, ux: number, uz: number, hu: number, hv: number, value: number): void {
    const ex = Math.abs(ux) * hu + Math.abs(uz) * hv;
    const ez = Math.abs(uz) * hu + Math.abs(ux) * hv;
    const i0 = Math.max(0, Math.floor((cx - ex - this.x0) / Occupancy.RES));
    const i1 = Math.min(this.nx - 1, Math.floor((cx + ex - this.x0) / Occupancy.RES));
    const j0 = Math.max(0, Math.floor((cz - ez - this.z0) / Occupancy.RES));
    const j1 = Math.min(this.nz - 1, Math.floor((cz + ez - this.z0) / Occupancy.RES));
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * Occupancy.RES - cz;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * Occupancy.RES - cx;
        if (Math.abs(x * ux + z * uz) <= hu && Math.abs(-x * uz + z * ux) <= hv) this.cells[j * this.nx + i] = value;
      }
    }
  }
  markPolygon(poly: readonly number[], value: number): void {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      minX = Math.min(minX, poly[i]!); maxX = Math.max(maxX, poly[i]!);
      minZ = Math.min(minZ, poly[i + 1]!); maxZ = Math.max(maxZ, poly[i + 1]!);
    }
    for (let z = Math.floor(minZ); z <= maxZ; z += Occupancy.RES) {
      for (let x = Math.floor(minX); x <= maxX; x += Occupancy.RES) {
        const cx = x + Occupancy.RES / 2, cz = z + Occupancy.RES / 2;
        if (pointInLoop(poly, cx, cz)) {
          const i = Math.floor((cx - this.x0) / Occupancy.RES), j = Math.floor((cz - this.z0) / Occupancy.RES);
          if (i >= 0 && j >= 0 && i < this.nx && j < this.nz) this.cells[j * this.nx + i] = value;
        }
      }
    }
  }
}
