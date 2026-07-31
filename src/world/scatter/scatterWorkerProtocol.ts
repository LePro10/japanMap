import type { RoadFile } from '@/config/roads.config';
import type { TerrainMeta } from '@/config/terrain.config';

/**
 * Nachrichten zwischen ScatterSystem und Streu-Worker — PLAN.md P7 / 7.2.
 *
 * Bewusst eine eigene Datei: Worker und Hauptthread sind zwei Programme, die
 * sich nur über diese Typen kennen. Läge das Protokoll in einem von beiden,
 * zöge der Import die jeweils andere Seite mit — im Fall des Workers also die
 * halbe Renderer-Kette in ein Bundle, das kein `window` hat.
 */

/** Was der Worker einmalig braucht, um streuen zu können. */
export interface ScatterInitMessage {
  readonly type: 'init';
  readonly meta: TerrainMeta;
  /** Kopie von `height.r16`. Übertragen, nicht kopiert — siehe Client. */
  readonly height: ArrayBuffer;
  readonly zonesUrl: string;
  /** `roads.json`, unverändert. Der Worker baut `RoadNetwork` daraus neu auf. */
  readonly roads: RoadFile | null;
  /** Freihaltekreise als `x, z, radius`. */
  readonly clearance: Float32Array | null;
}

/** Nachträglich, wenn Straßen oder Props später fertig werden als der Worker. */
export interface ScatterUpdateMessage {
  readonly type: 'update';
  readonly roads?: RoadFile;
  readonly clearance?: Float32Array;
}

export interface ScatterRequestMessage {
  readonly type: 'scatter';
  /** Laufende Nummer. Antworten dürfen in beliebiger Reihenfolge kommen. */
  readonly id: number;
  readonly cx: number;
  readonly cz: number;
  readonly mask: number;
  readonly density: number;
}

export type ScatterToWorker = ScatterInitMessage | ScatterUpdateMessage | ScatterRequestMessage;

export interface ScatterReadyMessage {
  readonly type: 'ready';
}

export interface ScatterResultMessage {
  readonly type: 'chunk';
  readonly id: number;
  readonly cx: number;
  readonly cz: number;
  readonly generated: number;
  readonly minY: number;
  readonly maxY: number;
  /** Ein Feld je Art, Reihenfolge wie `SPECIES`. */
  readonly instances: Float32Array[];
  /** Reine Streuzeit im Worker, in Millisekunden. */
  readonly costMs: number;
}

export interface ScatterFailedMessage {
  readonly type: 'failed';
  readonly reason: string;
}

export type ScatterFromWorker = ScatterReadyMessage | ScatterResultMessage | ScatterFailedMessage;
