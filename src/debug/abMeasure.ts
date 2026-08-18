import type { Scene, WebGLRenderer } from 'three';

import {
  customFromSettings,
  QUALITY,
  type CustomQuality,
  type QualityKey,
} from '@/config/quality.config';
import { postToDevServer, type CaptureTarget } from './capture';
import {
  advancer,
  countScene,
  percentileOf,
  settle,
  type AdvanceMode,
} from './measureCommon';

/**
 * Interleavte A/B-Messung der GPU-Zeit — PLAN.md P12 / 12.0.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Seit dieser Rechner eine echte GPU hat, ist `EXT_disjoint_timer_query_webgl2`
 * vorhanden und GPU-Zeit endlich messbar. Der erste Lauf damit hat allerdings
 * gezeigt, dass eine **Messreihe** trotzdem nicht einfach ablesbar ist. Zwei
 * Störungen liegen darüber, und beide addieren nur — sie ziehen nie ab:
 *
 * ### 1. Die GPU gehört nicht uns allein
 *
 * Gemessen am 2026-08-16, während im Hintergrund ein LLM in LM Studio auf
 * derselben Karte lief: eine Serie aus acht Eingriffen bei 3840 × 2160 stieg
 * **monoton an**, unabhängig davon, was abgeschaltet wurde — „nur Gitter 17²"
 * (31 % weniger Dreiecke) kam auf 19,5 ms gegen 12,5 ms der Basis davor.
 * Dieselbe Basis, 21-mal über einen Lauf verteilt gemessen, streute
 * **3,75…11,98 ms**.
 *
 * Eine sequenzielle Reihe ist unter diesen Umständen wertlos: sie misst, wann
 * gemessen wurde. Deshalb wird hier **jede Variante zwischen zwei Basiswerte
 * gesetzt** und gegen deren Mittel verglichen. Ein linearer Drift kürzt sich
 * damit heraus; was übrig bleibt, ist der Eingriff.
 *
 * ### 2. `lastGpuMs` ist nicht immer *ein* Frame
 *
 * `StatsProfiler.update()` ruft je Frame `processGpuQueries()`, und das setzt
 * `totalGpuDuration = 0` und **summiert alle Abfragen, die gerade fertig
 * geworden sind** (`node_modules/stats-gl/dist/core.js`). Eine Zeitabfrage wird
 * typischerweise ein bis drei Frames später fertig. Im eingeschwungenen Zustand
 * ist das eine je Frame — aber es sind auch **null** (dann steht 0 da) oder
 * **zwei** (dann steht die doppelte Frame-Zeit da).
 *
 * ### Was daraus für den Schätzer folgt
 *
 * Beide Störungen können einen Messwert nur **vergrößern**. Es gibt keinen
 * Mechanismus, der ihn zu klein macht: die Abfrage umspannt immer den ganzen
 * Frame, und alle Frames leisten in einem eingeschwungenen Zustand dieselbe
 * Arbeit. Also ist nicht der Median der richtige Schätzer, sondern ein
 * **niedriges Perzentil** der Werte über null — der Frame, in dem genau eine
 * Abfrage fertig wurde und niemand sonst die Karte benutzte.
 *
 * Der Median steht trotzdem mit in der Ausgabe. Wer beide nebeneinander sieht,
 * sieht auch, wie stark gestört wurde; eine einzelne Zahl verbirgt das.
 *
 * ## Und das Rauschband wird nicht geschätzt, sondern gemessen
 *
 * Aus den aufeinanderfolgenden Basiswerten: `|b[k+1] − b[k]|`, davon das 90.
 * Perzentil. Das ist die Auflösungsgrenze dieses Messstands unter den
 * Bedingungen **dieses** Laufs. Ein Δ darunter wird als *nicht messbar*
 * ausgewiesen und **nicht** als Ergebnis — genau der Fehler, der in P11 zweimal
 * fast passiert wäre („Gras halbe Reichweite: +1,6 %" ist keine
 * Verschlechterung, sondern Rauschen).
 */

export interface AbDeps {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly capture: CaptureTarget;
  /** Ohne Debug-Host gibt es keine GPU-Zeit — dann wirft der Lauf. */
  readonly timing: { readonly lastGpuMs: number | null } | null;
  readonly quality: {
    readonly level: QualityKey;
    setCustom(patch: Partial<CustomQuality>): void;
    set(level: QualityKey): void;
  };
  /** Arbeitet die Streuung noch? Siehe `settle()`. */
  readonly streaming?: () => boolean;
  /** Verworfene Instanzen — muss 0 sein, siehe `ScatterSystem.dropped`. */
  readonly dropped?: () => number;
}

export interface AbOptions {
  /**
   * Die Vergleichsgrundlage. Ohne Angabe die **gerade geltende** Stufe.
   *
   * Bewusst ein vollständiger Satz Werte und keine Stufenbezeichnung: der Lauf
   * stellt zwischen zwei Messungen dutzendfach um, und `QualitySystem.set()`
   * bricht ab, wenn die Stufe schon gilt. Über `setCustom` wird **immer**
   * gesendet — dieselbe Unterscheidung, die P10.2 an den Reglern gelernt hat.
   */
  readonly base?: Partial<CustomQuality>;
  /** Die Eingriffe. Jeder ist ein Patch **auf die Basis**, nicht auf den Vorgänger. */
  readonly variants: Readonly<Record<string, Partial<CustomQuality>>>;
  /** Wie oft die ganze Matrix wiederholt wird. Default 3. */
  readonly rounds?: number;
  /** Gemessene Frames je Zustand. Default 60. */
  readonly frames?: number;
  /** Verworfene Frames nach jedem Zustandswechsel. Default 12. */
  readonly warmup?: number;
  /** Perzentil des Schätzers, 0…1. Default 0,10 — Begründung im Kopf. */
  readonly percentile?: number;
  readonly settleFrames?: number;
  readonly settleTimeoutMs?: number;
  /** Default `driven` — in der eingebetteten Vorschau kommt kein rAF. */
  readonly mode?: AdvanceMode;
  /** Gesetzt: JSON zusätzlich nach `.cache/reports/`. */
  readonly name?: string;
}

export interface AbCounters {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly instances: number;
  readonly drawingBuffer: string;
  readonly dropped: number | null;
}

export interface AbRow {
  readonly label: string;
  /** Schätzer der Variante, in Millisekunden. */
  readonly gpuMs: number;
  /** Median derselben Stichprobe — zum Vergleich, siehe Kopf. */
  readonly gpuMedianMs: number;
  /** Gegen das Mittel der beiden **benachbarten** Basiswerte. */
  readonly deltaMs: number;
  readonly percent: number;
  /**
   * Liegt |Δ| über dem gemessenen Rauschband?
   *
   * Falsch heißt **nicht** „kein Effekt", sondern „mit diesem Messstand unter
   * diesen Bedingungen nicht auflösbar". Der Unterschied ist der ganze Punkt.
   */
  readonly significant: boolean;
  readonly counters: AbCounters;
  /** Die Einzelwerte je Runde — damit man die Streuung sehen kann. */
  readonly perRound: readonly number[];
}

export interface AbReport {
  readonly version: 1;
  readonly createdAt: string;
  readonly renderer: string | null;
  readonly mode: AdvanceMode;
  readonly percentile: number;
  readonly baselineMs: number;
  /** Auflösungsgrenze dieses Laufs — siehe Kopf. */
  readonly noiseBandMs: number;
  readonly baselineSamples: readonly number[];
  readonly baseCounters: AbCounters;
  readonly rows: readonly AbRow[];
  readonly warnings: readonly string[];
}

const DEFAULTS = {
  rounds: 3,
  frames: 60,
  warmup: 12,
  percentile: 0.1,
  settleFrames: 20,
  settleTimeoutMs: 30_000,
  mode: 'driven' as AdvanceMode,
};

export async function runAb(deps: AbDeps, options: AbOptions): Promise<AbReport> {
  const mode = options.mode ?? DEFAULTS.mode;
  const rounds = options.rounds ?? DEFAULTS.rounds;
  const frames = options.frames ?? DEFAULTS.frames;
  const warmup = options.warmup ?? DEFAULTS.warmup;
  const percentile = options.percentile ?? DEFAULTS.percentile;
  const settleFrames = options.settleFrames ?? DEFAULTS.settleFrames;
  const settleTimeoutMs = options.settleTimeoutMs ?? DEFAULTS.settleTimeoutMs;

  if (!deps.timing) {
    throw new Error(
      'A/B-Messung braucht den Debug-Host (nur im Dev-Build) — ohne ihn gibt es keine GPU-Zeit.',
    );
  }
  const labels = Object.keys(options.variants);
  if (labels.length === 0) throw new Error('A/B-Messung ohne Varianten.');

  // **Die Basis wird zu einem vollständigen Wertesatz aufgefüllt.**
  // `setCustomQuality` übernimmt fehlende Felder aus dem *vorherigen* Zustand
  // der eigenen Stufe — bei einer teilweisen Basis hinge das Ergebnis also
  // davon ab, was jemand vor dem Lauf im Menü eingestellt hatte. Ein Messstand,
  // dessen Basis von der Vorgeschichte abhängt, ist keiner.
  const base: CustomQuality = {
    ...customFromSettings(QUALITY[deps.quality.level]),
    ...(options.base ?? {}),
  };
  const advance = advancer(mode, deps.capture);
  const warnings: string[] = [];

  const gl = deps.renderer.getContext();
  if (!gl.getExtension('EXT_disjoint_timer_query_webgl2')) {
    throw new Error(
      'EXT_disjoint_timer_query_webgl2 fehlt — auf dieser Maschine ist GPU-Zeit nicht messbar. ' +
        'Die A/B-Messung würde Nullen vergleichen.',
    );
  }
  if (mode === 'live' && document.hidden) {
    throw new Error('Fenster verdeckt — in `live` käme rAF im Sekundentakt. `mode: "driven"` nehmen.');
  }

  /** Einen Zustand herstellen, abwarten und messen. */
  const measure = async (patch: Partial<CustomQuality>): Promise<{
    value: number;
    median: number;
    counters: AbCounters;
    stable: boolean;
  }> => {
    deps.quality.setCustom(patch);
    const settled = await settle(
      deps.scene,
      deps.streaming,
      advance,
      mode === 'live',
      settleFrames,
      settleTimeoutMs,
    );
    // Aufwärmen **nach** dem Warten: der erste Frame nach einem
    // Zustandswechsel enthält Shader-Übersetzungen und Puffer-Neuanlagen.
    for (let i = 0; i < warmup; i++) await advance();

    const samples: number[] = [];
    for (let i = 0; i < frames; i++) {
      await advance();
      const value = deps.timing?.lastGpuMs ?? null;
      // **Nullen gehören verworfen, nicht gemittelt.** Eine 0 heißt „in diesem
      // Frame ist keine Abfrage fertig geworden" und nicht „hat nichts
      // gekostet" — mitgemittelt zöge sie den Schätzer beliebig weit herunter.
      if (value !== null && value > 0) samples.push(value);
    }
    if (samples.length < 5) {
      warnings.push(
        `Nur ${samples.length} verwertbare GPU-Messwerte aus ${frames} Frames — ` +
          'der Treiber liefert kaum Abfrageergebnisse. Mehr Frames messen.',
      );
    }

    const info = deps.renderer.info;
    const counters: AbCounters = {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      instances: countScene(deps.scene).instances,
      drawingBuffer: `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
      dropped: deps.dropped?.() ?? null,
    };
    return {
      value: percentileOf(samples, percentile),
      median: percentileOf(samples, 0.5),
      counters,
      stable: settled.stable,
    };
  };

  const levelBefore = deps.quality.level;
  const baselineSamples: number[] = [];
  const perRound: Record<string, number[]> = {};
  const perRoundMedian: Record<string, number[]> = {};
  const lastCounters: Record<string, AbCounters> = {};
  let baseCounters: AbCounters | null = null;
  let baseStableWarned = false;
  const deltas: Record<string, number[]> = {};
  for (const label of labels) {
    perRound[label] = [];
    perRoundMedian[label] = [];
    deltas[label] = [];
  }

  try {
    let previousBase = await measure(base);
    baselineSamples.push(previousBase.value);
    baseCounters = previousBase.counters;

    for (let round = 0; round < rounds; round++) {
      for (const label of labels) {
        const patch = options.variants[label] ?? {};
        const variant = await measure({ ...base, ...patch });
        // **Direkt danach wieder die Basis.** Sie ist der zweite Klammerwert;
        // der Eingriff wird gegen das Mittel seiner beiden Nachbarn gerechnet,
        // nicht gegen einen Wert vom Anfang des Laufs.
        const nextBase = await measure(base);
        baselineSamples.push(nextBase.value);

        const localBase = (previousBase.value + nextBase.value) / 2;
        perRound[label]?.push(variant.value);
        perRoundMedian[label]?.push(variant.median);
        deltas[label]?.push(variant.value - localBase);
        lastCounters[label] = variant.counters;

        if (!variant.stable && !baseStableWarned) {
          warnings.push(
            `„${label}": die Welt kam im Zeitlimit nicht zur Ruhe — die Zahlen dieser ` +
              'Variante gehören einem halb gefüllten Zustand.',
          );
          baseStableWarned = true;
        }
        if (variant.counters.dropped !== null && variant.counters.dropped > 0) {
          warnings.push(
            `„${label}": ${variant.counters.dropped} Instanzen ohne Pufferplatz VERWORFEN — ` +
              'im Bild fehlt Bewuchs, den es geben müsste (siehe `LOD_BIAS_MIN`).',
          );
        }

        previousBase = nextBase;
      }
    }
  } finally {
    // Auch nach einem Abbruch: der Nutzer soll nicht auf einer Messstufe sitzen
    // bleiben, die er nie gewählt hat.
    deps.quality.set(levelBefore);
  }

  // Das Rauschband aus dem Lauf selbst: der Abstand zweier **benachbarter**
  // Messungen desselben Zustands.
  const steps: number[] = [];
  for (let i = 1; i < baselineSamples.length; i++) {
    steps.push(Math.abs((baselineSamples[i] ?? 0) - (baselineSamples[i - 1] ?? 0)));
  }
  const noiseBandMs = steps.length > 0 ? percentileOf(steps, 0.9) : 0;
  const baselineMs = percentileOf(baselineSamples, 0.5);

  if (noiseBandMs > baselineMs * 0.25) {
    warnings.push(
      `Das Rauschband ist ${noiseBandMs.toFixed(2)} ms bei einer Basis von ` +
        `${baselineMs.toFixed(2)} ms (${((noiseBandMs / baselineMs) * 100).toFixed(0)} %). ` +
        'Benutzt gerade etwas anderes dieselbe GPU? Alles unterhalb dieser Schwelle ist ' +
        'in diesem Lauf nicht auflösbar.',
    );
  }

  const rows: AbRow[] = labels
    .map((label) => {
      const values = perRound[label] ?? [];
      const delta = percentileOf(deltas[label] ?? [], 0.5);
      const counters = lastCounters[label] ?? {
        drawCalls: 0,
        triangles: 0,
        instances: 0,
        drawingBuffer: '—',
        dropped: null,
      };
      return {
        label,
        gpuMs: percentileOf(values, 0.5),
        gpuMedianMs: percentileOf(perRoundMedian[label] ?? [], 0.5),
        deltaMs: delta,
        percent: baselineMs > 0 ? (delta / baselineMs) * 100 : 0,
        significant: Math.abs(delta) > noiseBandMs,
        counters,
        perRound: values,
      } satisfies AbRow;
    })
    .sort((a, b) => a.deltaMs - b.deltaMs);

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const report: AbReport = {
    version: 1,
    createdAt: new Date().toISOString(),
    renderer: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
    mode,
    percentile,
    baselineMs,
    noiseBandMs,
    baselineSamples,
    baseCounters: baseCounters ?? {
      drawCalls: 0,
      triangles: 0,
      instances: 0,
      drawingBuffer: '—',
      dropped: null,
    },
    rows,
    warnings,
  };

  console.info(
    `[ab] Basis ${baselineMs.toFixed(2)} ms · Rauschband ±${noiseBandMs.toFixed(2)} ms · ` +
      `${rounds} Runden × ${labels.length} Varianten, ${frames} Frames je Zustand.`,
  );
  console.table(
    rows.map((row) => ({
      Eingriff: row.label,
      'GPU ms': row.gpuMs.toFixed(2),
      'Δ ms': row.deltaMs.toFixed(2),
      'Δ %': row.significant ? `${row.percent.toFixed(1)} %` : 'im Rauschen',
      Calls: row.counters.drawCalls,
      Dreiecke: row.counters.triangles,
      Instanzen: row.counters.instances,
    })),
  );
  for (const warning of report.warnings) console.warn(`[ab] ${warning}`);

  if (options.name) {
    const path = await postToDevServer('/__report', options.name, JSON.stringify(report, null, 2));
    console.info(`[ab] geschrieben nach: ${path}`);
  }
  return report;
}
