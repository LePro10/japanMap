import { LOD } from '@/config/lod.config';
import { WORLD } from '@/config/world.config';
import type { TerrainSampler } from '../TerrainSampler';

/**
 * Min/Max-Höhe je Quadtree-Knoten, über alle Tiefen.
 *
 * Gebraucht wird das fürs Frustum-Culling: ein Knoten ist ein Quader, und ohne
 * seine tatsächliche Höhenausdehnung müsste man den vollen Höhenbereich der
 * Welt annehmen (−40 … 450 m). Über der Küstenebene wäre jeder Knoten dann
 * 490 m hoch, und beim flachen Blick nach vorn läge praktisch der halbe Baum im
 * Kegel — Culling, das nichts cullt.
 *
 * **Nicht aus `meta.json`.** Der Baker legt dort Min/Max je 256-m-Chunk ab
 * (PLAN.md P1 / 1.1), und 3072 / 256 = 12 ist keine Zweierpotenz: das Gitter
 * liegt schief zum Quadtree, dessen Knoten sich fortlaufend halbieren. Ein
 * 48-m-Blatt müsste dann bis zu vier Chunks vereinigen und bekäme deren
 * Extremwerte über die 25-fache Fläche zugeschlagen. Aus dem Höhenfeld selbst
 * gerechnet ist die Hülle knapp und liegt exakt auf den Knotengrenzen.
 *
 * Der Aufbau läuft einmal beim Laden: die feinste Stufe direkt über die Texel,
 * alle gröberen aus je vier Kindern. Das ist O(n) über die Heightmap und nicht
 * O(n·Tiefen) — gemessen 34 ms für 2048² auf dieser Maschine.
 */
export class HeightPyramid {
  /** `levels[d]` hält 2 Werte (min, max) je Knoten der Tiefe d, zeilenweise. */
  readonly #levels: Float32Array[] = [];

  private constructor(levels: Float32Array[]) {
    this.#levels = levels;
  }

  static build(sampler: TerrainSampler): HeightPyramid {
    const maxDepth = LOD.maxDepth;
    const levels: Float32Array[] = [];
    for (let depth = 0; depth <= maxDepth; depth++) {
      const grid = 1 << depth;
      levels.push(new Float32Array(grid * grid * 2));
    }

    const leafGrid = 1 << maxDepth;
    const leaf = levels[maxDepth]!;
    const res = sampler.resolution;
    const spacing = sampler.spacing;

    for (let nz = 0; nz < leafGrid; nz++) {
      // Texelbereich des Knotens, **inklusive** der Stützstellen auf beiden
      // Rändern. Der Knoten reicht bis an seine Nachbarn heran; ließe man die
      // rechte Spalte weg, fehlte der Hülle genau die Kante, an der zwei
      // Knoten eine Bergflanke teilen.
      const z0 = Math.max(0, Math.floor((nz * LOD.leafSize) / spacing));
      const z1 = Math.min(res - 1, Math.ceil(((nz + 1) * LOD.leafSize) / spacing));
      for (let nx = 0; nx < leafGrid; nx++) {
        const x0 = Math.max(0, Math.floor((nx * LOD.leafSize) / spacing));
        const x1 = Math.min(res - 1, Math.ceil(((nx + 1) * LOD.leafSize) / spacing));

        let min = Infinity;
        let max = -Infinity;
        for (let z = z0; z <= z1; z++) {
          const row = z * res;
          for (let x = x0; x <= x1; x++) {
            const raw = sampler.raw[row + x]!;
            if (raw < min) min = raw;
            if (raw > max) max = raw;
          }
        }
        const index = (nz * leafGrid + nx) * 2;
        leaf[index] = min;
        leaf[index + 1] = max;
      }
    }

    // Rohwerte erst hier in Meter wandeln: die innere Schleife oben läuft über
    // 4,2 Mio. Texel und soll nur Ganzzahlen vergleichen.
    const scale = sampler.meta.heightmap.heightRange / 65535;
    const offset = sampler.meta.world.minHeight;
    for (let i = 0; i < leaf.length; i++) leaf[i] = offset + leaf[i]! * scale;

    for (let depth = maxDepth - 1; depth >= 0; depth--) {
      const grid = 1 << depth;
      const here = levels[depth]!;
      const below = levels[depth + 1]!;
      const childGrid = grid * 2;
      for (let nz = 0; nz < grid; nz++) {
        for (let nx = 0; nx < grid; nx++) {
          let min = Infinity;
          let max = -Infinity;
          for (let cz = 0; cz < 2; cz++) {
            for (let cx = 0; cx < 2; cx++) {
              const c = ((nz * 2 + cz) * childGrid + (nx * 2 + cx)) * 2;
              if (below[c]! < min) min = below[c]!;
              if (below[c + 1]! > max) max = below[c + 1]!;
            }
          }
          const index = (nz * grid + nx) * 2;
          here[index] = min;
          here[index + 1] = max;
        }
      }
    }

    return new HeightPyramid(levels);
  }

  /** Kleinste Höhe im Knoten (depth, nx, nz) in Metern. */
  min(depth: number, nx: number, nz: number): number {
    const grid = 1 << depth;
    return this.#levels[depth]![(nz * grid + nx) * 2]!;
  }

  /** Größte Höhe im Knoten (depth, nx, nz) in Metern. */
  max(depth: number, nx: number, nz: number): number {
    const grid = 1 << depth;
    return this.#levels[depth]![(nz * grid + nx) * 2 + 1]!;
  }

  /** Weltkoordinate der Nordwest-Ecke eines Knotens. */
  static originX(depth: number, nx: number): number {
    return -WORLD.half + nx * (WORLD.size / (1 << depth));
  }

  static originZ(depth: number, nz: number): number {
    return -WORLD.half + nz * (WORLD.size / (1 << depth));
  }

  static nodeSize(depth: number): number {
    return WORLD.size / (1 << depth);
  }
}
