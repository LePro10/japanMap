import { WORLD } from '@/config/world.config';
import { RIVER } from '@/config/water.config';
import { WATER_PHYS } from '@/config/vehicle.config';
import { TERRAIN_ASSETS } from '@/world/terrainAssets';
import type { RiverFile } from '@/world/water/riverGeometry';
import type { ResourceManager } from '@/core/ResourceManager';

/**
 * Wo auf der Karte Wasser steht — Meer, Fluss, Reisfeld.
 *
 * ## Warum das nicht das WaterSystem fragt
 *
 * Das WaterSystem zeichnet. Eine Abfrage „wie tief ist es hier" gehört nicht
 * in seinen Shader und nicht in sein Mesh. DriveSystem und VehicleFx brauchen
 * dieselbe Antwort, und zwei Implementierungen wären zwei Uferlinien — dieselbe
 * Falle wie Sampler gegen CDLOD-Gitter.
 *
 * ## Kosten
 *
 *  - Meer: eine Höhenprobe, die der Aufrufer schon hat.
 *  - Reisfeld: ein Byte aus einer 1024²-Maske (1 MB). Dieselbe Datei lädt
 *    `RicePaddy` fürs Mesh; hier liegt nur der Nasskanal, keine GPU-Textur.
 *  - Fluss: 422 Knoten, linear. 422 mal `x²+z²` je Abfrage, vier Räder, 60 Hz
 *    sind rund 100 000 Vergleiche/s — unter einer Zehntelmillisekunde.
 *
 * Ein Gitter wie in `CollisionWorld` würde sich erst lohnen, wenn der Fluss
 * zehntausend Knoten hätte.
 */

export type WaterKind = 'trocken' | 'meer' | 'fluss' | 'paddy';

export interface WaterSample {
  depth: number;
  surfaceY: number;
  kind: WaterKind;
}

interface PaddyMeta {
  readonly paddies: { readonly res: number; readonly waterDepth: number } | null;
}

export class WaterField {
  readonly sample: WaterSample = { depth: 0, surfaceY: 0, kind: 'trocken' };

  #ready = false;
  #riverX: Float32Array | null = null;
  #riverY: Float32Array | null = null;
  #riverZ: Float32Array | null = null;
  #riverHalf: Float32Array | null = null;
  #riverCount = 0;
  #riverMinX = 0;
  #riverMaxX = 0;
  #riverMinZ = 0;
  #riverMaxZ = 0;

  #paddy: Uint8Array | null = null;
  #paddyRes = 0;
  #paddyDepth = 0.3;

  get ready(): boolean {
    return this.#ready;
  }

  async load(resources: ResourceManager): Promise<void> {
    const [river, meta] = await Promise.all([
      resources.json<RiverFile>(TERRAIN_ASSETS.river),
      resources.json<PaddyMeta>(TERRAIN_ASSETS.meta),
    ]);

    const nodes = river.centerline.length / 3;
    const riverX = new Float32Array(nodes);
    const riverY = new Float32Array(nodes);
    const riverZ = new Float32Array(nodes);
    const riverHalf = new Float32Array(nodes);
    for (let i = 0; i < nodes; i++) {
      riverX[i] = river.centerline[i * 3]!;
      riverY[i] = river.centerline[i * 3 + 1]!;
      riverZ[i] = river.centerline[i * 3 + 2]!;
      riverHalf[i] = (river.halfWidths[i] ?? 4) * RIVER.widthFactor;
    }
    this.#riverX = riverX;
    this.#riverY = riverY;
    this.#riverZ = riverZ;
    this.#riverHalf = riverHalf;
    this.#riverCount = nodes;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < nodes; i++) {
      const x = riverX[i]!;
      const z = riverZ[i]!;
      const pad = riverHalf[i]! + 2;
      if (x - pad < minX) minX = x - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (z - pad < minZ) minZ = z - pad;
      if (z + pad > maxZ) maxZ = z + pad;
    }
    this.#riverMinX = minX;
    this.#riverMaxX = maxX;
    this.#riverMinZ = minZ;
    this.#riverMaxZ = maxZ;

    if (meta.paddies) {
      this.#paddyRes = meta.paddies.res;
      this.#paddyDepth = meta.paddies.waterDepth;
      const bitmap = await createImageBitmap(await (await fetch(TERRAIN_ASSETS.paddy)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const drawing = canvas.getContext('2d', { willReadFrequently: true });
      if (!drawing) throw new Error('WaterField: kein 2D-Kontext für paddy.png.');
      drawing.drawImage(bitmap, 0, 0);
      const pixels = drawing.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      const wet = new Uint8Array(this.#paddyRes * this.#paddyRes);
      for (let i = 0; i < wet.length; i++) wet[i] = pixels[i * 4]! > 127 ? 1 : 0;
      this.#paddy = wet;
    }

    this.#ready = true;
  }

  /**
   * Wassertiefe an einer Weltposition.
   *
   * `groundY` ist die **feste** Höhe (Sampler / Stadtplatte), nicht das
   * Ergebnis von `DriveSystem.height()` — sonst würde die Wasserfläche sich
   * selbst als Boden lesen und die Tiefe wäre immer null.
   *
   * Schreibt nach `this.sample` und gibt dasselbe Objekt zurück. Wer zwei
   * Proben vergleichen will, muss die Zahlen herauskopieren.
   */
  at(x: number, z: number, groundY: number): WaterSample {
    const out = this.sample;
    out.depth = 0;
    out.surfaceY = groundY;
    out.kind = 'trocken';

    // Meer zuerst: an der Mündung übernimmt die Ebene, der Fluss endet dort.
    if (groundY < WORLD.seaLevel) {
      out.kind = 'meer';
      out.surfaceY = WORLD.seaLevel;
      out.depth = WORLD.seaLevel - groundY;
      return out;
    }

    if (this.#inRiver(x, z, groundY, out)) return out;

    if (this.#paddyWet(x, z)) {
      out.kind = 'paddy';
      out.depth = this.#paddyDepth;
      out.surfaceY = groundY + this.#paddyDepth;
      return out;
    }

    return out;
  }

  #inRiver(x: number, z: number, groundY: number, out: WaterSample): boolean {
    const xs = this.#riverX;
    const ys = this.#riverY;
    const zs = this.#riverZ;
    const hs = this.#riverHalf;
    if (!xs || !ys || !zs || !hs) return false;
    // Die allermeisten Abfragen liegen weit weg — 422 Knoten je Rad wären
    // sonst 12 × 422 je Schritt. Die Hülle kostet vier Vergleiche.
    if (x < this.#riverMinX || x > this.#riverMaxX || z < this.#riverMinZ || z > this.#riverMaxZ) {
      return false;
    }

    let best = Infinity;
    let bestI = -1;
    const count = this.#riverCount;
    for (let i = 0; i < count; i++) {
      const dx = x - xs[i]!;
      const dz = z - zs[i]!;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bestI = i;
      }
    }
    if (bestI < 0) return false;
    const reach = hs[bestI]! + 1.2;
    if (best > reach * reach) return false;

    // Tiefe gegen das Gelände, nicht gegen die Sohle: am Ufer steht man über
    // dem Spiegel, auch wenn der nächste Knoten nah ist.
    const surfaceY = ys[bestI]! + RIVER.surfaceRise;
    const depth = surfaceY - groundY;
    if (depth <= WATER_PHYS.wetThreshold) return false;
    // **Und nicht tiefer als ein Bett** — P21. Die Suche oben kennt nur XZ; am
    // Kopf eines Wasserfalls ist ein Knoten damit auch für die Felswand 21 m
    // unter ihm der nächste. Begründung und Messung bei `RIVER.maxDepth`.
    if (depth > RIVER.maxDepth) return false;

    out.kind = 'fluss';
    out.surfaceY = surfaceY;
    out.depth = depth;
    return true;
  }

  #paddyWet(x: number, z: number): boolean {
    const mask = this.#paddy;
    if (!mask) return false;
    const last = this.#paddyRes - 1;
    const ix = Math.round(((x + WORLD.half) / WORLD.size) * last);
    const iz = Math.round(((z + WORLD.half) / WORLD.size) * last);
    if (ix < 0 || iz < 0 || ix > last || iz > last) return false;
    return mask[iz * this.#paddyRes + ix] === 1;
  }
}
