import { SCATTER, SPECIES } from '@/config/vegetation.config';
import { WORLD } from '@/config/world.config';
import type { PropClearance } from '../props/PropClearance';
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

/**
 * Acht Werte je Instanz:
 * `x, y, z, scaleXZ, scaleY, rotationY, lean, variante`.
 *
 * Der Farbwurf steht **nicht** dabei: er wird im Shader aus der Position
 * gehasht (vegetation_tint.glsl) und kostet damit weder Speicher noch eine
 * Kopie beim Umsortieren. Waagerechte und senkrechte Skalierung sind getrennt,
 * weil das Seitenverhältnis der billigste Varianz-Hebel ist — er steht in der
 * Matrix, die ohnehin geschrieben wird.
 */
export const INSTANCE_STRIDE = 8;

/** Geteiltes leeres Feld für Arten, die in einem Chunk nicht gestreut wurden. */
const EMPTY = new Float32Array(0);

export interface ScatterChunk {
  /**
   * Welche Arten in diesem Chunk gestreut wurden, als Bitmaske über den Index in
   * `SPECIES`.
   *
   * **Der Grund, warum das nicht immer „alle" ist, war die teuerste Messung
   * dieser Phase.** Ein Chunk auf 400 m Entfernung erzeugte 6400
   * Gras-Kandidaten, obwohl Gras nur bis 160 m gezeichnet wird — 98 % der Arbeit
   * für Instanzen, die nie in einen Puffer wandern. Über den ganzen
   * Vegetations-Umkreis waren das 1,33 Mio. Gras-Kandidaten statt 125 000.
   *
   * Gemessen an der Füllphase, Median der CPU-Zeit des Streu-Systems je Frame:
   * **12,7 ms ohne Maske, 0,4 ms mit.** Im eingeschwungenen Zustand 0,10 ms
   * (Mittel 0,29 · 95. Perzentil 2,3 · Spitze 3,5), vorher 0,30 ms bei Spitze
   * 18,2 ms.
   *
   * Weil die Streuung je Art einen eigenen Zufallsstrom benutzt, ist ein
   * Teilstreuen deterministisch und ein Nachstreuen später folgenlos: kommt die
   * Kamera näher, wird der Chunk mit einer größeren Maske neu erzeugt und die
   * bereits gestreuten Arten landen bitgleich wieder an derselben Stelle.
   */
  readonly generated: number;
  /** Ein Feld je Art, Reihenfolge wie `SPECIES`. Leer, wo die Maske es sagt. */
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
  /** Freiflächen um Props (P5). `null`, solange sie noch nicht bekannt sind. */
  readonly clearance: PropClearance | null;
  /** Dichtefaktor aus der Qualitätsstufe, 0…1. */
  readonly density: number;
}

export function scatterChunk(
  cx: number,
  cz: number,
  mask: number,
  input: ScatterInputs,
): ScatterChunk {
  const originX = -WORLD.half + cx * SCATTER.chunkSize;
  const originZ = -WORLD.half + cz * SCATTER.chunkSize;

  const instances: Float32Array[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  SPECIES.forEach((species, index) => {
    if ((mask & (1 << index)) === 0) {
      instances.push(EMPTY);
      return;
    }
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
        // **Alle Würfe passieren vor den Filtern, auch für verworfene
        // Kandidaten.** Das kostet ein paar Rechenschritte an Stellen, an denen
        // nichts wächst, hält aber den Zufallsstrom an die *Zelle* gebunden
        // statt an die Reihenfolge der Annahmen. Nur so ändert eine Änderung am
        // Zonenfilter nicht die Form jedes Baums dahinter.
        const aspectRoll = random() * 2 - 1;
        const leanRoll = random();
        const variantRoll = random();

        // Reihenfolge der Filter: **billigste Ablehnung zuerst** (PLAN.md 4.2).
        //
        // Kosten je Kandidat:
        //   Höhe            1 bilineare Abfrage (4 Array-Zugriffe)
        //   Zonen + Wurf    4 Array-Zugriffe, ohne Interpolation
        //   Neigung         **4 bilineare Abfragen** — der teuerste Filter
        //   Straßenabstand  Gitterabfrage aus P3, für weitab liegende Punkte
        //                   25 Zugriffe auf leere Zellen
        //
        // Der erste Entwurf prüfte die Neigung **vor** der Zonenmaske und
        // bezahlte damit vier Höhenabfragen für Kandidaten, die der billige
        // Zufallswurf ohnehin verworfen hätte. Bei einem Grasbüschel liegt die
        // Annahmequote selbst in seiner Zone unter der Hälfte.
        //
        // **Der Gewinn daraus ist nicht isoliert gemessen.** Er wurde zusammen
        // mit der Artenmaske eingebaut, und die hat den Löwenanteil gebracht
        // (Median der Füllphase 12,7 ms → 0,4 ms). Die Reihenfolge ist trotzdem
        // richtig so, und die Kostentabelle oben sagt, warum.
        const y = input.sampler.getHeightAt(x, z);
        if (y < species.minHeight || y > species.maxHeight) continue;

        const suitability =
          input.zones.weight(x, z, 0) * species.zones.rock +
          input.zones.weight(x, z, 1) * species.zones.grass +
          input.zones.weight(x, z, 2) * species.zones.sand +
          input.zones.weight(x, z, 3) * species.zones.paddy;
        if (roll >= suitability * input.density) continue;

        const slope = input.sampler.getSlopeAt(x, z);
        if (slope > species.maxSlopeDeg * RAD_PER_DEG) continue;

        if (
          input.network !== null &&
          input.network.distanceToNearestRoad(x, z, species.roadClearance) <
            species.roadClearance
        ) {
          continue;
        }

        // **Zuletzt: Freiflächen um Props** (P5). Der Test ist eine
        // Rasterabfrage und damit billiger als der Straßenabstand — er steht
        // trotzdem dahinter, weil er nur an wenigen hundert Stellen der Karte
        // überhaupt etwas verwirft, während die Straßen sie durchziehen. Ohne
        // ihn wachsen Bäume durch die Tempelhalle; das war der Zustand beim
        // ersten Lauf.
        if (input.clearance !== null && input.clearance.blocks(x, z)) continue;

        const base = species.minScale + (species.maxScale - species.minScale) * scaleRoll;
        // Das Seitenverhältnis dreht Höhe und Breite gegeneinander, statt beide
        // gemeinsam zu verändern — sonst wäre es nur eine zweite Größenstreuung.
        const aspect = 1 + species.aspectJitter * aspectRoll;

        const at = count * INSTANCE_STRIDE;
        buffer[at] = x;
        buffer[at + 1] = y;
        buffer[at + 2] = z;
        buffer[at + 3] = base / aspect;
        buffer[at + 4] = base * aspect;
        buffer[at + 5] = rotation;
        buffer[at + 6] = Math.tan((species.leanDeg * RAD_PER_DEG) * leanRoll);
        buffer[at + 7] = Math.min(species.variants - 1, Math.floor(variantRoll * species.variants));
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

  return { generated: mask, instances, minY, maxY, lastUsed: 0 };
}
