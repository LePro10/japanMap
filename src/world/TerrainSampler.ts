import type { Vector3 } from 'three';

import type { TerrainMeta } from '@/config/terrain.config';
import { WORLD } from '@/config/world.config';
import type { ResourceManager } from '@/core/ResourceManager';
import { TERRAIN_ASSETS } from './terrainAssets';

/**
 * Fehler beim Laden oder Prüfen der gebackenen Heightmap. Eigener Typ, damit
 * main.ts ihn von einem Netzwerkfehler unterscheiden kann.
 */
export class TerrainDataError extends Error {
  override readonly name = 'TerrainDataError';
}

/**
 * Die Heightmap auf der CPU.
 *
 * Liefert Höhe, Normale und Neigung an beliebigen Weltkoordinaten. Gebraucht
 * wird das von der Kamera-Kollision (P1), dem Straßen-Carving (P3), der
 * Vegetations-Streuung (P4) und später der Fahrzeugphysik.
 *
 * Zwei Eigenschaften sind nicht verhandelbar:
 *
 *  1. **Allokationsfrei.** `getHeightAt` läuft pro Frame hundertfach. Ein
 *     `new Vector3()` darin erzeugt Müll, den der GC in unregelmäßigen
 *     Abständen einsammelt — genau die Art Ruckler, die man später stundenlang
 *     an der falschen Stelle sucht.
 *
 *  2. **Identisch zum Shader.** Die bilineare Interpolation hier muss dieselben
 *     Werte liefern wie die im Vertex-Shader. Sonst schwebt oder versinkt alles,
 *     was per `getHeightAt` platziert wird — sichtbar, aber schwer zuzuordnen.
 *     Deshalb rechnet der Shader die Interpolation ebenfalls von Hand statt sie
 *     der Texturfilterung zu überlassen.
 */
export class TerrainSampler {
  readonly meta: TerrainMeta;
  /** Rohe 16-bit-Höhen. Wird von TerrainSystem direkt zur GPU hochgeladen. */
  readonly raw: Uint16Array;

  readonly #res: number;
  readonly #last: number;
  readonly #spacing: number;
  readonly #invSpacing: number;
  readonly #minHeight: number;
  readonly #scale: number;

  private constructor(meta: TerrainMeta, raw: Uint16Array) {
    this.meta = meta;
    this.raw = raw;
    this.#res = meta.heightmap.res;
    this.#last = meta.heightmap.res - 1;
    this.#spacing = meta.heightmap.spacing;
    this.#invSpacing = 1 / meta.heightmap.spacing;
    this.#minHeight = meta.world.minHeight;
    this.#scale = meta.heightmap.heightRange / 65535;
  }

  static async load(resources: ResourceManager): Promise<TerrainSampler> {
    const [meta, buffer] = await Promise.all([
      resources.json<TerrainMeta>(TERRAIN_ASSETS.meta),
      resources.binary(TERRAIN_ASSETS.height),
    ]);

    TerrainSampler.#validate(meta, buffer);
    return new TerrainSampler(meta, new Uint16Array(buffer));
  }

  /**
   * Prüft meta.json gegen world.config.ts.
   *
   * Der Baker ist ein eigenes Programm mit eigenen Konstanten. Laufen die
   * auseinander — jemand ändert WORLD.size, ohne neu zu backen — dann rendert
   * das Terrain nicht falsch, sondern *fast* richtig: leicht verschoben,
   * leicht zu hoch. Das ist der teuerste Fehlerfall, weil er nicht auffällt.
   * Also lieber hier laut abbrechen.
   */
  static #validate(meta: TerrainMeta, buffer: ArrayBuffer): void {
    const problems: string[] = [];

    if (meta.world.size !== WORLD.size) {
      problems.push(`Weltgröße ${meta.world.size} m statt ${WORLD.size} m`);
    }
    if (meta.heightmap.res !== WORLD.heightmapRes) {
      problems.push(`Auflösung ${meta.heightmap.res} statt ${WORLD.heightmapRes}`);
    }
    if (meta.world.minHeight !== WORLD.minHeight || meta.world.maxHeight !== WORLD.maxHeight) {
      problems.push(
        `Höhenbereich ${meta.world.minHeight}…${meta.world.maxHeight} m statt ` +
          `${WORLD.minHeight}…${WORLD.maxHeight} m`,
      );
    }
    if (Math.abs(meta.heightmap.spacing - WORLD.metersPerTexel) > 1e-6) {
      problems.push(
        `Texelabstand ${meta.heightmap.spacing} m statt ${WORLD.metersPerTexel} m`,
      );
    }

    const expectedBytes = meta.heightmap.res * meta.heightmap.res * 2;
    if (buffer.byteLength !== expectedBytes) {
      problems.push(`height.r16 hat ${buffer.byteLength} Bytes, erwartet ${expectedBytes}`);
    }

    if (problems.length > 0) {
      throw new TerrainDataError(
        `Gebackenes Terrain passt nicht zur Konfiguration:\n  · ${problems.join('\n  · ')}\n` +
          'Neu backen mit:  npm run bake',
      );
    }
  }

  get resolution(): number {
    return this.#res;
  }

  get spacing(): number {
    return this.#spacing;
  }

  /** Höhe an einer Gitterstelle. Indizes werden auf den Rand geklemmt. */
  heightAtTexel(ix: number, iz: number): number {
    const x = ix < 0 ? 0 : ix > this.#last ? this.#last : ix;
    const z = iz < 0 ? 0 : iz > this.#last ? this.#last : iz;
    // Non-null: x und z sind hier nachweislich im Bereich, aber
    // noUncheckedIndexedAccess kennt die Klemmung oben nicht.
    return this.#minHeight + this.raw[z * this.#res + x]! * this.#scale;
  }

  /** Höhe in Metern an einer beliebigen Weltposition, bilinear interpoliert. */
  getHeightAt(x: number, z: number): number {
    const gx = (x + WORLD.half) * this.#invSpacing;
    const gz = (z + WORLD.half) * this.#invSpacing;

    const cx = gx < 0 ? 0 : gx > this.#last ? this.#last : gx;
    const cz = gz < 0 ? 0 : gz > this.#last ? this.#last : gz;

    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const fx = cx - x0;
    const fz = cz - z0;

    const h00 = this.heightAtTexel(x0, z0);
    const h10 = this.heightAtTexel(x0 + 1, z0);
    const h01 = this.heightAtTexel(x0, z0 + 1);
    const h11 = this.heightAtTexel(x0 + 1, z0 + 1);

    const top = h00 + (h10 - h00) * fx;
    const bottom = h01 + (h11 - h01) * fx;
    return top + (bottom - top) * fz;
  }

  /**
   * Normale an einer Weltposition, in `target` geschrieben.
   *
   * Zentrale Differenz über einen Texelabstand. Das ist bewusst *nicht*
   * dieselbe Rechnung wie in normal.png (dort Sobel über 3×3): die Textur
   * dient der Schattierung und darf glätten, diese Normale beschreibt die
   * Fläche, auf der etwas steht, und muss zu `getHeightAt` passen.
   */
  getNormalAt(x: number, z: number, target: Vector3): Vector3 {
    const d = this.#spacing;
    const dhdx = (this.getHeightAt(x + d, z) - this.getHeightAt(x - d, z)) / (2 * d);
    const dhdz = (this.getHeightAt(x, z + d) - this.getHeightAt(x, z - d)) / (2 * d);
    return target.set(-dhdx, 1, -dhdz).normalize();
  }

  /** Neigung gegen die Waagerechte, in Radiant. */
  getSlopeAt(x: number, z: number): number {
    const d = this.#spacing;
    const dhdx = (this.getHeightAt(x + d, z) - this.getHeightAt(x - d, z)) / (2 * d);
    const dhdz = (this.getHeightAt(x, z + d) - this.getHeightAt(x, z - d)) / (2 * d);
    return Math.atan(Math.sqrt(dhdx * dhdx + dhdz * dhdz));
  }

  /** Liegt die Position innerhalb der Weltgrenzen? */
  contains(x: number, z: number): boolean {
    return x >= -WORLD.half && x <= WORLD.half && z >= -WORLD.half && z <= WORLD.half;
  }

  /**
   * Strahl gegen die Geländeoberfläche, Treffer in `target`.
   *
   * Kein Dreiecks-Raycast, sondern ein Marsch entlang des Strahls mit
   * anschließender Bisektion. Für ein Höhenfeld ist das schneller und braucht
   * keine Beschleunigungsstruktur: die Schrittweite darf so groß sein wie der
   * aktuelle Abstand zum Boden, denn näher als das kann die Oberfläche nicht
   * kommen. Über flachem Gelände sind das eine Handvoll Schritte statt
   * Tausender.
   *
   * `direction` muss normiert sein.
   */
  raycast(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDistance: number,
    target: Vector3,
  ): boolean {
    let t = 0;
    let previousT = 0;
    let previousDelta = originY - this.getHeightAt(originX, originZ);
    if (previousDelta <= 0) return false;

    while (t < maxDistance) {
      t = Math.min(t + Math.max(this.#spacing, previousDelta * 0.75), maxDistance);
      const delta =
        originY + dirY * t - this.getHeightAt(originX + dirX * t, originZ + dirZ * t);

      if (delta <= 0) {
        let low = previousT;
        let high = t;
        for (let i = 0; i < 20; i++) {
          const mid = (low + high) * 0.5;
          const above =
            originY + dirY * mid - this.getHeightAt(originX + dirX * mid, originZ + dirZ * mid);
          if (above <= 0) high = mid;
          else low = mid;
        }
        target.set(originX + dirX * high, originY + dirY * high, originZ + dirZ * high);
        return true;
      }

      previousT = t;
      previousDelta = delta;
    }
    return false;
  }
}
