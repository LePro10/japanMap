import { SCATTER, SPECIES } from '@/config/vegetation.config';
import { WORLD } from '@/config/world.config';
import type { RoadNetwork } from '../roads/RoadNetwork';
import type { TerrainSampler } from '../TerrainSampler';
import type { ZoneMap } from './ZoneMap';

/**
 * Streuung eines Chunks — PLAN.md P4 / 4.2.
 *
 * Bewusst eine freie Funktion und keine Methode: sie hat keinen Zustand außer
 * ihren Eingaben, und **genau das** ist die Eigenschaft, auf der das
 * Akzeptanzkriterium „zweimal laden = identische Platzierung" beruht. Nichts
 * wird gespeichert, nichts wandert zwischen Aufrufen; derselbe Chunk entsteht
 * beim tausendsten Betreten so wie beim ersten.
 */

/** Sechs Werte je Instanz: Position, Skalierung, Drehung um Y, Farbwurf. */
export const INSTANCE_STRIDE = 6;

export interface ScatterChunk {
  readonly cx: number;
  readonly cz: number;
  /** Ein Feld je Art, Reihenfolge wie `SPECIES`. */
  readonly instances: readonly Float32Array[];
  /** Kleinste und größte Höhe der Instanzen — für das Culling des Chunks. */
  readonly minY: number;
  readonly maxY: number;
  lastUsed: number;
}

/**
 * mulberry32, wie im Terrain-Baker.
 *
 * Nicht `Math.random()`: dessen Zustandsfolge ist nicht Teil der
 * Sprachspezifikation und hat sich zwischen V8-Versionen schon geändert. Eine
 * Vegetation, die nach einem Browser-Update anders steht, wäre kein Fehler, den
 * man je fände.
 */
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

/**
 * Chunk-Koordinaten zu einem Startwert verrühren.
 *
 * Die Multiplikation mit großen Primzahlen ist nötig, weil benachbarte Chunks
 * benachbarte Zahlen sind: `mulberry32(n)` und `mulberry32(n+1)` liefern
 * *unterschiedliche*, aber die ersten Werte hängen sichtbar zusammen. Ohne das
 * Verrühren stehen die Bäume zweier Nachbarchunks in erkennbar ähnlichen
 * Mustern — ein Streifenmuster über die ganze Karte.
 */
function chunkSeed(cx: number, cz: number, salt: number): number {
  let h = (SCATTER.seed ^ Math.imul(cx | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ Math.imul(cz | 0, 0x165667b1), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ salt, 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

const RAD_PER_DEG = Math.PI / 180;

export interface ScatterInputs {
  readonly sampler: TerrainSampler;
  readonly zones: ZoneMap;
  readonly network: RoadNetwork | null;
  /** Dichtefaktor aus der Qualitätsstufe, 0…1. */
  readonly density: number;
}

export function scatterChunk(cx: number, cz: number, input: ScatterInputs): ScatterChunk {
  const originX = -WORLD.half + cx * SCATTER.chunkSize;
  const originZ = -WORLD.half + cz * SCATTER.chunkSize;

  const instances: Float32Array[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  SPECIES.forEach((species, index) => {
    const random = mulberry32(chunkSeed(cx, cz, index * 0x9e37 + 1));
    const cells = Math.max(1, Math.round(SCATTER.chunkSize / species.cellSize));
    const cell = SCATTER.chunkSize / cells;
    // Obergrenze statt Nachwachsen: ein Feld je Art wird einmal in voller Größe
    // angelegt und am Ende auf die tatsächliche Zahl beschnitten. `push` auf ein
    // Array wäre bei 3400 Kandidaten je Chunk und Art die teuerste Zeile im
    // ganzen System.
    const buffer = new Float32Array(cells * cells * INSTANCE_STRIDE);
    let count = 0;

    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const x = originX + (i + random()) * cell;
        const z = originZ + (j + random()) * cell;
        const roll = random();
        const scaleRoll = random();
        const rotation = random() * Math.PI * 2;
        const tint = random();

        // Reihenfolge der Filter: **billigste Ablehnung zuerst** (PLAN.md 4.2).
        // Höhe ist eine Texturabfrage, Neigung sind vier, die Zonenmaske eine,
        // und der Straßenabstand läuft über das Gitter aus P3. Die Sortierung
        // ist keine Kosmetik: 94 % aller Kandidaten fallen durch, und wo sie
        // durchfallen, entscheidet über die Laufzeit der ganzen Streuung.
        const y = input.sampler.getHeightAt(x, z);
        if (y < species.minHeight || y > species.maxHeight) continue;

        const slope = input.sampler.getSlopeAt(x, z);
        if (slope > species.maxSlopeDeg * RAD_PER_DEG) continue;

        const suitability =
          input.zones.weight(x, z, 0) * species.zones.rock +
          input.zones.weight(x, z, 1) * species.zones.grass +
          input.zones.weight(x, z, 2) * species.zones.sand +
          input.zones.weight(x, z, 3) * species.zones.paddy;
        if (roll >= suitability * input.density) continue;

        if (
          input.network !== null &&
          input.network.distanceToNearestRoad(x, z, species.roadClearance) <
            species.roadClearance
        ) {
          continue;
        }

        const at = count * INSTANCE_STRIDE;
        buffer[at] = x;
        buffer[at + 1] = y;
        buffer[at + 2] = z;
        buffer[at + 3] = species.minScale + (species.maxScale - species.minScale) * scaleRoll;
        buffer[at + 4] = rotation;
        buffer[at + 5] = tint;
        count++;

        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    instances.push(buffer.subarray(0, count * INSTANCE_STRIDE));
  });

  // Leerer Chunk (Meer, Fels, Straße): eine Hülle, die nichts einschließt, wäre
  // in der Auswahl ein Sonderfall. Die Chunkhöhe auf das Gelände zu setzen ist
  // billiger und immer richtig.
  if (minY > maxY) {
    minY = 0;
    maxY = 0;
  }

  return { cx, cz, instances, minY, maxY, lastUsed: 0 };
}
