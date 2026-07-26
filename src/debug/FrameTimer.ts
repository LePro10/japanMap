import { StatsProfiler } from 'stats-gl';
import type { WebGLRenderer } from 'three';

export interface FrameSample {
  readonly fps: number;
  readonly cpuMs: number;
  /** GPU-Zeit in Millisekunden, oder null wenn der Treiber nicht misst. */
  readonly gpuMs: number | null;
}

/**
 * Misst CPU- und GPU-Zeit pro Frame.
 *
 * Nutzt `stats-gl` als Messwerk, aber nicht dessen Panel — die Anzeige macht
 * StatsOverlay, damit alle Zahlen in einer Tabelle mit den Budgets stehen.
 *
 * Wichtig ist die Art der Initialisierung: `init(renderer)` würde
 * `renderer.render` per Monkey-Patch umbiegen und damit nur einzelne
 * render()-Aufrufe messen. Sobald in P2 der PostFX-Composer mehrere Durchläufe
 * pro Frame macht, wäre das Ergebnis der letzte Pass statt des Frames. Deshalb
 * bekommt stats-gl direkt den WebGL2-Kontext, und wir setzen die
 * Frame-Grenzen selbst.
 *
 * Die GPU-Messung nutzt EXT_disjoint_timer_query_webgl2. Die Extension ist
 * nicht überall verfügbar (auf einigen Treibern und in manchen Browsern
 * abgeschaltet). Dann liefert `gpuMs` null — das Overlay schreibt "n/a" hin,
 * statt eine 0 anzuzeigen, die nach "kostenlos" aussieht.
 */
/**
 * So viele Messungen exakt 0,000 ms hintereinander gelten als "Timer liefert
 * nichts". Eine echte Messung ist nie exakt null — selbst ein leerer Frame
 * kostet einige Zehntausend Nanosekunden.
 */
const STALLED_SAMPLE_THRESHOLD = 180;

export class FrameTimer {
  readonly #stats: StatsProfiler;
  #gpuAvailable = false;
  #ready = false;
  #zeroSamples = 0;

  private constructor(stats: StatsProfiler) {
    this.#stats = stats;
  }

  static async create(renderer: WebGLRenderer): Promise<FrameTimer> {
    const stats = new StatsProfiler({
      trackGPU: true,
      trackCPT: false,
      trackHz: false,
      logsPerSecond: 10,
      samplesLog: 30,
      samplesGraph: 10,
      precision: 2,
    });

    const timer = new FrameTimer(stats);
    await stats.init(renderer.getContext());

    // `ext` ist null, wenn EXT_disjoint_timer_query_webgl2 fehlt.
    timer.#gpuAvailable = stats.ext !== null && stats.ext !== undefined;
    timer.#ready = true;
    return timer;
  }

  /**
   * Falsch, wenn die Extension fehlt — oder wenn sie da ist, aber dauerhaft
   * Nullen liefert. Der zweite Fall kommt auf manchen Treibern und in
   * virtualisierten Umgebungen vor und ist der gefährlichere: eine 0 im Overlay
   * liest sich wie "kostet nichts".
   */
  get gpuTimingAvailable(): boolean {
    return this.#gpuAvailable && this.#zeroSamples < STALLED_SAMPLE_THRESHOLD;
  }

  begin(): void {
    if (this.#ready) this.#stats.begin();
  }

  end(): void {
    if (!this.#ready) return;
    this.#stats.end();
    this.#stats.update();
  }

  sample(): FrameSample {
    const data = this.#stats.getData();

    if (this.#gpuAvailable && this.#zeroSamples < STALLED_SAMPLE_THRESHOLD) {
      this.#zeroSamples = data.gpu === 0 ? this.#zeroSamples + 1 : 0;
    }

    return {
      fps: data.fps,
      cpuMs: data.cpu,
      gpuMs: this.gpuTimingAvailable ? data.gpu : null,
    };
  }

  dispose(): void {
    this.#ready = false;
    this.#stats.dispose();
  }
}
