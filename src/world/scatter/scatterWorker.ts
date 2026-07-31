/// <reference lib="webworker" />

import { PropClearance } from '../props/PropClearance';
import { RoadNetwork } from '../roads/RoadNetwork';
import { TerrainSampler } from '../TerrainSampler';
import { scatterChunk } from './scatterChunk';
import type { ScatterFromWorker, ScatterToWorker } from './scatterWorkerProtocol';
import { ZoneMap } from './ZoneMap';

/**
 * Der Streu-Worker — PLAN.md P7 / 7.2.
 *
 * ## Warum überhaupt
 *
 * Die Streuung eines Nahchunks mit Gräsern kostet gemessen rund 12 ms, und ein
 * Zeitbudget von 2 ms je Frame verteilt das, statt es zu beseitigen: **ein**
 * Chunk wird immer erzeugt, auch wenn das Budget schon aufgebraucht ist, sonst
 * käme die Streuung bei langsamen Frames nie hinterher. Die Spitze liegt damit
 * bei Budget plus einem Chunk. Der Kommentar bei `SCATTER.newChunkBudgetMs`
 * sagt seit P4, dass ein Worker der einzige Weg ist, der sie wirklich beseitigt.
 *
 * ## Was hier läuft, und was nicht
 *
 * Ausschließlich `scatterChunk` und die vier Datenstrukturen, die es abfragt.
 * Kein three.js, kein Renderer. Das ist keine Sparsamkeit, sondern
 * Voraussetzung: `scatterChunk` ist seit P4 eine **freie Funktion ohne
 * Zustand**, und genau diese Eigenschaft macht sie hier verschiebbar. Wäre sie
 * eine Methode auf dem System, gäbe es diese Datei nicht.
 *
 * ## Die Zusage, die dabei nicht brechen darf
 *
 * „Zweimal laden = identische Platzierung." Der Worker rechnet deshalb auf
 * **denselben** Daten, nicht auf eigenen: das Höhenfeld kommt als Kopie
 * herüber, das Straßennetz als dieselbe `roads.json`, die Freihaltekreise als
 * Rohliste, die mit demselben `add()` wieder ins Raster gehen. Einzig
 * `zones.png` lädt der Worker selbst — die Datei liegt im HTTP-Cache, und sie
 * ist dieselbe Datei. Ein Nachbau der Strukturen wäre die Doppelimplementierung,
 * die in P3 schon einmal die Rinne neben die Straße gelegt hat.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

let sampler: TerrainSampler | null = null;
let zones: ZoneMap | null = null;
let network: RoadNetwork | null = null;
let clearance: PropClearance | null = null;

function post(message: ScatterFromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function buildClearance(circles: Float32Array): PropClearance {
  const built = new PropClearance();
  for (let i = 0; i + 2 < circles.length; i += 3) {
    built.add(circles[i]!, circles[i + 1]!, circles[i + 2]!);
  }
  return built;
}

scope.onmessage = (event: MessageEvent<ScatterToWorker>): void => {
  const message = event.data;

  if (message.type === 'init') {
    void (async () => {
      try {
        sampler = TerrainSampler.fromRaw(message.meta, new Uint16Array(message.height));
        zones = await ZoneMap.load(message.zonesUrl);
        if (message.roads) network = new RoadNetwork(message.roads);
        if (message.clearance) clearance = buildClearance(message.clearance);
        post({ type: 'ready' });
      } catch (error) {
        // Laut scheitern, nicht still: der Client fällt daraufhin auf die
        // synchrone Streuung zurück. Ein Worker, der nichts liefert und nichts
        // sagt, sähe wie eine Karte ohne Vegetation aus.
        post({ type: 'failed', reason: String(error) });
      }
    })();
    return;
  }

  if (message.type === 'update') {
    if (message.roads) network = new RoadNetwork(message.roads);
    if (message.clearance) clearance = buildClearance(message.clearance);
    return;
  }

  if (!sampler || !zones) {
    post({ type: 'failed', reason: 'Streuanfrage vor der Initialisierung.' });
    return;
  }

  const started = performance.now();
  const chunk = scatterChunk(message.cx, message.cz, message.mask, {
    sampler,
    zones,
    network,
    clearance,
    density: message.density,
  });

  // `subarray` liefert Sichten auf **einen** Puffer je Art. Übertragen wird
  // deshalb je Art eine eigene Kopie: einen Puffer zu übergeben, von dem noch
  // eine zweite Sicht existiert, macht beide unbrauchbar.
  const instances = chunk.instances.map((view) => new Float32Array(view));
  post(
    {
      type: 'chunk',
      id: message.id,
      cx: message.cx,
      cz: message.cz,
      generated: chunk.generated,
      minY: chunk.minY,
      maxY: chunk.maxY,
      instances,
      costMs: performance.now() - started,
    },
    instances.map((array) => array.buffer),
  );
};
