import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export type Point = readonly [number, number, number];
type Triangle = { a: Point; b: Point; c: Point; nx: number; ny: number; nz: number; det: number };

/** Gemeinsame Dreiecke für sichtbare Böden, Räder und Füße; kein Terrain-Bake. */
export class LocalSurfaces {
  readonly positions: number[] = [];
  readonly #cells = new Map<string, Triangle[]>();
  #hit: Triangle | null = null;
  quad(a: Point, b: Point, c: Point, d: Point): void {
    this.#triangle(a, c, b); this.#triangle(a, d, c);
  }
  #triangle(a: Point, b: Point, c: Point): void {
    const n = new Vector3().subVectors(new Vector3(...b), new Vector3(...a))
      .cross(new Vector3().subVectors(new Vector3(...c), new Vector3(...a))).normalize();
    if (n.y < 0) n.negate();
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(det) < 1e-8) return;
    const t = { a, b, c, nx: n.x, ny: n.y, nz: n.z, det };
    this.positions.push(...a, ...b, ...c);
    for (let x = Math.floor(Math.min(a[0], b[0], c[0]) / 16); x <= Math.floor(Math.max(a[0], b[0], c[0]) / 16); x++)
      for (let z = Math.floor(Math.min(a[2], b[2], c[2]) / 16); z <= Math.floor(Math.max(a[2], b[2], c[2]) / 16); z++) {
        const key = `${x},${z}`, cell = this.#cells.get(key);
        if (cell) cell.push(t); else this.#cells.set(key, [t]);
      }
  }
  height(x: number, z: number): number {
    let top = -Infinity; this.#hit = null;
    const cell = this.#cells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    if (!cell) return top;
    for (const t of cell) {
      const { a, b, c, det } = t;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
      if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
      const y = u * a[1] + v * b[1] + (1 - u - v) * c[1];
      if (y > top) { top = y; this.#hit = t; }
    }
    return top;
  }
  normal(x: number, z: number, out: Vector3): boolean {
    this.height(x, z);
    if (!this.#hit) return false;
    out.set(this.#hit.nx, this.#hit.ny, this.#hit.nz); return true;
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.computeVertexNormals(); return g;
  }
}
