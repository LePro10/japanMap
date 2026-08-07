import type { RoadFile } from '@/config/roads.config';
import { SCATTER } from '@/config/vegetation.config';
import { WORLD } from '@/config/world.config';
import type { PropClearance } from '../props/PropClearance';
import type { TerrainSampler } from '../TerrainSampler';
import { TERRAIN_ASSETS } from '../terrainAssets';
import type { ScatterChunk } from './scatterChunk';
import type { ScatterFromWorker, ScatterToWorker } from './scatterWorkerProtocol';

/**
 * Der Hauptthread-Teil des Streu-Workers — PLAN.md P7 / 7.2.
 *
 * ## Die Warteschlange
 *
 * Der Plan verlangt „Prioritätswarteschlange nach Distanz und Blickrichtung"
 * und „Zeitbudget von 2 ms pro Frame". Mit einem Worker wird aus dem Zeitbudget
 * eine **Anzahl gleichzeitiger Aufträge**: der Hauptthread verbringt in der
 * Streuung nur noch die Zeit, die das Auspacken einer Antwort kostet, und die
 * ist mit einem `Float32Array` je Art eine Kopie und keine Rechnung.
 *
 * Die Grenze bleibt trotzdem, aus einem anderen Grund: der Worker arbeitet
 * seine Nachrichten in der Reihenfolge ab, in der sie ankommen. Schickte man
 * ihm auf einmal 600 Chunks, stünde die dringendste Anfrage am Ende einer
 * Schlange, die zehn Sekunden lang ist — die Priorität wäre dann eine
 * Sortierung, die niemand mehr sieht. Wenige Aufträge gleichzeitig heißt: die
 * Reihenfolge wird bei **jedem** Nachschub neu entschieden.
 *
 * ## Warum ein Rückfallweg
 *
 * `new Worker(new URL(...))` scheitert in Umgebungen ohne Modul-Worker, und ein
 * Fehler beim Aufbau (Höhenfeld, `zones.png`) ist genauso möglich wie im
 * Hauptthread. Beides darf nicht heißen, dass die Karte kahl bleibt. Der Client
 * meldet dann `available === false`, und das ScatterSystem streut selbst weiter
 * — dieselbe Funktion, dasselbe Ergebnis, nur wieder mit der Spitze.
 */
export class ScatterWorkerClient {
  #worker: Worker | null = null;
  #ready = false;
  #failed: string | null = null;
  #nextId = 1;

  /** Angeforderte, noch nicht beantwortete Chunks. Schlüssel ist der Chunk-Key. */
  readonly #inFlight = new Map<number, number>();

  #lastCostMs = 0;
  #delivered = 0;

  constructor(
    private readonly onChunk: (key: number, chunk: ScatterChunk) => void,
    private readonly onFailure: (reason: string) => void,
  ) {
    try {
      this.#worker = new Worker(new URL('./scatterWorker.ts', import.meta.url), {
        type: 'module',
        name: 'Streuung',
      });
      this.#worker.onmessage = this.#onMessage;
      this.#worker.onerror = (event) => {
        this.#fail(event.message || 'Worker-Fehler ohne Meldung');
      };
    } catch (error) {
      this.#fail(String(error));
    }
  }

  get available(): boolean {
    return this.#worker !== null && this.#failed === null;
  }

  get ready(): boolean {
    return this.#ready;
  }

  get pending(): number {
    return this.#inFlight.size;
  }

  get lastCostMs(): number {
    return this.#lastCostMs;
  }

  get delivered(): number {
    return this.#delivered;
  }

  /** Freie Plätze in der Warteschlange. 0 heißt: dieser Frame fordert nichts an. */
  get slots(): number {
    if (!this.#ready) return 0;
    return Math.max(0, SCATTER.workerQueueDepth - this.#inFlight.size);
  }

  init(sampler: TerrainSampler, roads: RoadFile | null, clearance: PropClearance | null): void {
    const worker = this.#worker;
    if (!worker) return;

    // **Kopie, nicht Übergabe.** Der Hauptthread braucht dasselbe Höhenfeld
    // weiter — Kamera-Kollision, Props, Reisfelder. Ein übergebener Puffer wäre
    // hier danach leer, und der Fehler zeigte sich erst beim nächsten
    // `getHeightAt` als Höhe null.
    const height = sampler.raw.slice().buffer;
    const circles = clearance ? clearance.circles : null;

    const message: ScatterToWorker = {
      type: 'init',
      meta: sampler.meta,
      height,
      zonesUrl: new URL(TERRAIN_ASSETS.zones, location.href).href,
      roads,
      clearance: circles,
    };
    worker.postMessage(message, [height]);
  }

  /** Straßen oder Freiflächen nachreichen, wenn sie später fertig werden. */
  update(roads: RoadFile | null, clearance: PropClearance | null): void {
    if (!this.#worker) return;
    const message: ScatterToWorker = {
      type: 'update',
      ...(roads ? { roads } : {}),
      ...(clearance ? { clearance: clearance.circles } : {}),
    };
    this.#worker.postMessage(message);
  }

  /** Ist dieser Chunk bereits unterwegs? */
  isPending(key: number): boolean {
    return this.#inFlight.has(key);
  }

  /** Wie viele Aufträge noch unbeantwortet sind — für `ScatterSystem.streaming`. */
  get inFlight(): number {
    return this.#inFlight.size;
  }

  request(key: number, cx: number, cz: number, mask: number, density: number): void {
    const worker = this.#worker;
    if (!worker || !this.#ready) return;
    // Eine bereits laufende Anfrage wird **nicht** ersetzt. Sie könnte eine
    // kleinere Artenmaske tragen als jetzt gebraucht wird; der Nachschlag
    // passiert dann beim nächsten Durchlauf, und die Streuung je Art ist
    // deterministisch — das bereits Gestreute landet bitgleich wieder dort.
    if (this.#inFlight.has(key)) return;

    const id = this.#nextId++;
    this.#inFlight.set(key, id);
    const message: ScatterToWorker = { type: 'scatter', id, cx, cz, mask, density };
    worker.postMessage(message);
  }

  /**
   * Alle laufenden Anfragen verwerfen.
   *
   * Nach einem Stufenwechsel: die Antworten wären mit der alten Dichte gestreut,
   * und ein Chunk mit 100 % Dichte neben einem mit 25 % ist genau die Art
   * Fehler, die man für einen Zufall hält.
   */
  discard(): void {
    this.#inFlight.clear();
  }

  dispose(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#inFlight.clear();
    this.#ready = false;
  }

  readonly #onMessage = (event: MessageEvent<ScatterFromWorker>): void => {
    const message = event.data;

    if (message.type === 'ready') {
      this.#ready = true;
      return;
    }

    if (message.type === 'failed') {
      this.#fail(message.reason);
      return;
    }

    const key = this.#keyOf(message.cx, message.cz);
    const expected = this.#inFlight.get(key);
    this.#inFlight.delete(key);
    // Verworfene Anfragen (Stufenwechsel) kommen trotzdem zurück. Sie hier
    // fallen zu lassen ist billiger, als dem Worker eine Absage zu schicken.
    if (expected !== message.id) return;

    this.#lastCostMs = message.costMs;
    this.#delivered++;
    this.onChunk(key, {
      generated: message.generated,
      instances: message.instances,
      minY: message.minY,
      maxY: message.maxY,
      lastUsed: 0,
    });
  };

  #keyOf(cx: number, cz: number): number {
    return cz * WORLD_CHUNKS_PER_AXIS + cx;
  }

  #fail(reason: string): void {
    if (this.#failed) return;
    this.#failed = reason;
    this.#ready = false;
    this.#worker?.terminate();
    this.#worker = null;
    this.#inFlight.clear();
    this.onFailure(reason);
  }
}

/**
 * Derselbe Schlüssel wie im ScatterSystem — aus derselben Konfiguration
 * gerechnet, nicht abgeschrieben. Ein Import des Systems käme hier nicht in
 * Frage: es ist das System, das diesen Client benutzt.
 */
const WORLD_CHUNKS_PER_AXIS = WORLD.size / SCATTER.chunkSize;
