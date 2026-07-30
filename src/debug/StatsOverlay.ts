import type { Scene, WebGLRenderer } from 'three';

import { BUDGETS, type Budget } from '@/config/quality.config';
import {
  evaluateBudget,
  formatCount,
  formatLimit,
  formatMegabytes,
  formatMillis,
  tallyCityCalls,
  type BudgetStatus,
} from './budgets';
import type { FrameTimer } from './FrameTimer';
import { estimateTextureMemory } from './textureMemory';

/** Aktualisierungsrate der Anzeige. 5 Hz ist schnell genug zum Reagieren und
 *  langsam genug zum Ablesen — bei 60 Hz flackern die Ziffern nur. */
const FLUSH_INTERVAL_MS = 200;

/** Die Texturspeicher-Schätzung läuft über die Szene; nicht jedes Flush wert. */
const MEMORY_INTERVAL_MS = 1000;

interface MetricSpec {
  readonly id: string;
  readonly label: string;
  readonly budget: Budget | null;
  readonly unitSuffix: string;
}

interface MetricGroup {
  readonly title: string;
  readonly metrics: readonly MetricSpec[];
}

const GROUPS: readonly MetricGroup[] = [
  {
    title: 'Frame',
    metrics: [
      { id: 'fps', label: 'FPS', budget: null, unitSuffix: '' },
      { id: 'cpu', label: 'CPU', budget: BUDGETS.frameTimeMs, unitSuffix: '' },
      { id: 'cpuPeak', label: 'CPU Spitze', budget: BUDGETS.frameTimeMs, unitSuffix: '' },
      { id: 'gpu', label: 'GPU', budget: BUDGETS.gpuMs, unitSuffix: '' },
      { id: 'gpuPeak', label: 'GPU Spitze', budget: BUDGETS.gpuMs, unitSuffix: '' },
    ],
  },
  {
    title: 'Szene',
    metrics: [
      { id: 'calls', label: 'Draw-Calls', budget: BUDGETS.drawCalls, unitSuffix: '' },
      { id: 'triangles', label: 'Dreiecke', budget: BUDGETS.triangles, unitSuffix: '' },
      // Das Teilbudget aus PLAN.md P6. Es steht neben der Gesamtzahl und nicht
      // in einer eigenen Gruppe, weil man beide zusammen liest: 158 von 800
      // sagt wenig, wenn nicht danebensteht, wie viel davon die Stadt ist.
      { id: 'cityCalls', label: 'davon Stadt', budget: BUDGETS.cityDrawCalls, unitSuffix: '' },
    ],
  },
  {
    title: 'Speicher',
    metrics: [
      {
        id: 'texMemory',
        label: 'Texturen (gesch.)',
        budget: BUDGETS.textureMemoryMb,
        unitSuffix: ' MB',
      },
      { id: 'textures', label: 'Texturen', budget: null, unitSuffix: '' },
      { id: 'geometries', label: 'Geometrien', budget: null, unitSuffix: '' },
      { id: 'programs', label: 'Programme', budget: null, unitSuffix: '' },
    ],
  },
];

interface RowElements {
  readonly row: HTMLElement;
  readonly value: HTMLElement;
}

export interface StatsOverlayOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly timer: FrameTimer;
  readonly container: HTMLElement;
  /** Geladene, aber evtl. noch nicht eingehängte Ressourcen (ResourceManager). */
  readonly extraTextures?: () => Iterable<unknown>;
}

/**
 * Das Debug-Overlay mit Budget-Ampel.
 *
 * Das ist die Kernfunktion aus PLAN.md P0/0.6, nicht bloß Zierrat: auf einer
 * RX 7900 XTX ist die Framerate kein Signal — alles läuft flüssig, auch was auf
 * der Zielhardware (GTX 1660 / RX 580) längst durchgefallen wäre. Die Zahlen
 * hier sind das Signal, und die Farbe daneben sagt, ob sie noch tragen.
 */
export class StatsOverlay {
  readonly #renderer: WebGLRenderer;
  readonly #scene: Scene;
  readonly #timer: FrameTimer;
  readonly #extraTextures: () => Iterable<unknown>;

  readonly #root: HTMLElement;
  readonly #rows = new Map<string, RowElements>();
  readonly #note: HTMLElement;
  readonly #lastText = new Map<string, string>();

  #lastFlush = 0;
  #lastMemoryScan = 0;
  #lastGpuMs: number | null = null;
  #textureMemoryMb = 0;
  #cpuPeakMs = 0;
  #gpuPeakMs = 0;

  constructor(options: StatsOverlayOptions) {
    this.#renderer = options.renderer;
    this.#scene = options.scene;
    this.#timer = options.timer;
    this.#extraTextures = options.extraTextures ?? ((): Iterable<unknown> => []);

    this.#root = document.createElement('div');
    this.#root.className = 'stats';

    for (const group of GROUPS) {
      this.#root.appendChild(this.#buildGroup(group));
    }

    this.#note = document.createElement('p');
    this.#note.className = 'stats__note';
    this.#root.appendChild(this.#note);
    this.#updateNote();

    options.container.appendChild(this.#root);
  }

  get element(): HTMLElement {
    return this.#root;
  }

  /**
   * GPU-Zeit des letzten Frames.
   *
   * Wird hier durchgereicht statt neu gemessen: `sample()` zählt intern mit,
   * wie oft der Timer Nullen liefert, um einen kaputten Treiber zu erkennen.
   * Ein zweiter Aufruf pro Frame verdoppelte diesen Zähler und ließe den Timer
   * doppelt so schnell als defekt gelten.
   */
  get lastGpuMs(): number | null {
    return this.#lastGpuMs;
  }

  set visible(value: boolean) {
    this.#root.hidden = !value;
  }

  /**
   * Pro Frame aufrufen.
   *
   * Gemessen wird jeden Frame, geschrieben nur alle FLUSH_INTERVAL_MS: die
   * Spitzenwerte sind das eigentliche Signal, und ein Ruckler zwischen zwei
   * DOM-Aktualisierungen wäre sonst unsichtbar.
   */
  update(): void {
    const sample = this.#timer.sample();
    this.#lastGpuMs = sample.gpuMs;
    this.#cpuPeakMs = Math.max(this.#cpuPeakMs, sample.cpuMs);
    if (sample.gpuMs !== null) this.#gpuPeakMs = Math.max(this.#gpuPeakMs, sample.gpuMs);

    const now = performance.now();
    if (now - this.#lastFlush < FLUSH_INTERVAL_MS) return;
    this.#lastFlush = now;

    if (now - this.#lastMemoryScan >= MEMORY_INTERVAL_MS) {
      this.#lastMemoryScan = now;
      const bytes = estimateTextureMemory(this.#scene, this.#extraTextures());
      this.#textureMemoryMb = bytes / (1024 * 1024);
    }

    const info = this.#renderer.info;

    // FPS hat kein warn/limit-Budget — mehr ist besser. Die Schwellen sind die
    // Kehrwerte des Frame-Time-Budgets: 60 FPS Ziel, unter 45 wird es sichtbar.
    const fpsStatus: BudgetStatus =
      sample.fps === 0 ? 'none' : sample.fps >= 58 ? 'ok' : sample.fps >= 45 ? 'warn' : 'over';

    this.#set('fps', formatCount(sample.fps), fpsStatus);
    this.#set('cpu', formatMillis(sample.cpuMs), evaluateBudget(sample.cpuMs, BUDGETS.frameTimeMs));
    this.#set(
      'cpuPeak',
      formatMillis(this.#cpuPeakMs),
      evaluateBudget(this.#cpuPeakMs, BUDGETS.frameTimeMs),
    );
    this.#cpuPeakMs = 0;

    if (sample.gpuMs === null) {
      this.#set('gpu', 'n/a', 'none');
      this.#set('gpuPeak', 'n/a', 'none');
    } else {
      this.#set('gpu', formatMillis(sample.gpuMs), evaluateBudget(sample.gpuMs, BUDGETS.gpuMs));
      this.#set(
        'gpuPeak',
        formatMillis(this.#gpuPeakMs),
        evaluateBudget(this.#gpuPeakMs, BUDGETS.gpuMs),
      );
    }
    this.#gpuPeakMs = 0;

    this.#set('calls', formatCount(info.render.calls), evaluateBudget(info.render.calls, BUDGETS.drawCalls));
    this.#set(
      'triangles',
      formatCount(info.render.triangles),
      evaluateBudget(info.render.triangles, BUDGETS.triangles),
    );

    // Dieselbe Zählung wie im BudgetGuard, aus derselben Funktion — zwei
    // Zählungen wären zwei Wahrheiten, und die Ampel im Overlay muss dieselbe
    // Schwelle meinen wie das Banner darüber.
    const cityCalls = tallyCityCalls(this.#scene);
    this.#set(
      'cityCalls',
      formatCount(cityCalls),
      evaluateBudget(cityCalls, BUDGETS.cityDrawCalls),
    );

    this.#set(
      'texMemory',
      formatMegabytes(this.#textureMemoryMb),
      evaluateBudget(this.#textureMemoryMb, BUDGETS.textureMemoryMb),
    );
    this.#set('textures', formatCount(info.memory.textures), 'none');
    this.#set('geometries', formatCount(info.memory.geometries), 'none');
    this.#set('programs', formatCount(info.programs?.length ?? 0), 'none');

    this.#updateNote();
  }

  /**
   * Der GPU-Timer kann auch nachträglich als unbrauchbar auffallen (Extension
   * vorhanden, liefert aber nur Nullen). Die Notiz sagt das dann, statt still
   * eine 0 stehen zu lassen.
   */
  #updateNote(): void {
    const available = this.#timer.gpuTimingAvailable;
    const text = available
      ? 'F1 blendet die Debug-UI aus.'
      : 'GPU-Timer liefert keine Werte (EXT_disjoint_timer_query_webgl2). · F1 blendet aus.';
    if (this.#note.textContent === text) return;
    this.#note.textContent = text;
    this.#note.classList.toggle('stats__note--warn', !available);
  }

  dispose(): void {
    this.#root.remove();
    this.#rows.clear();
    this.#lastText.clear();
  }

  // ── DOM ────────────────────────────────────────────────────────────────

  #buildGroup(group: MetricGroup): HTMLElement {
    const section = document.createElement('div');
    section.className = 'stats__group';

    const title = document.createElement('p');
    title.className = 'stats__title';
    title.textContent = group.title;
    section.appendChild(title);

    for (const metric of group.metrics) {
      const row = document.createElement('div');
      row.className = 'stats__row';

      const flag = document.createElement('span');
      flag.className = 'stats__flag';

      const label = document.createElement('span');
      label.className = 'stats__label';
      label.textContent = metric.label;

      const value = document.createElement('span');
      value.className = 'stats__value';
      value.textContent = '—';

      const limit = formatLimit(metric.budget, metric.unitSuffix);
      if (limit) {
        const budgetHint = document.createElement('span');
        budgetHint.className = 'stats__budget';
        budgetHint.textContent = ` ${limit}`;
        value.appendChild(budgetHint);
      }

      row.append(flag, label, value);
      section.appendChild(row);
      this.#rows.set(metric.id, { row, value });
    }

    return section;
  }

  #set(id: string, text: string, status: BudgetStatus): void {
    const entry = this.#rows.get(id);
    if (!entry) return;

    const stamp = `${text}|${status}`;
    if (this.#lastText.get(id) === stamp) return;
    this.#lastText.set(id, stamp);

    // Die Budget-Spalte ist ein eigenes Kind und soll erhalten bleiben.
    const hint = entry.value.querySelector('.stats__budget');
    entry.value.textContent = text;
    if (hint) entry.value.appendChild(hint);

    entry.row.classList.remove('stats__row--ok', 'stats__row--warn', 'stats__row--over');
    if (status !== 'none') entry.row.classList.add(`stats__row--${status}`);
  }
}
