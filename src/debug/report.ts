import { InstancedMesh, Mesh, Vector2, type Object3D, type Scene, type WebGLRenderer } from 'three';

import {
  QUALITY,
  QUALITY_LEVELS,
  type QualityKey,
  type QualityLevel,
} from '@/config/quality.config';
import type { DeviceEstimate } from '@/render/deviceTier';
import { estimateTextureMemory } from './textureMemory';
import { postToDevServer, probeFrame, captureFramePng, type CaptureTarget, type FrameProbe } from './capture';
import { applyViewpoint, VIEWPOINTS } from './viewpoints';
import type { CameraPlacer } from './viewpoints';

/**
 * Der Messlauf — PLAN.md P10 / 10.0.
 *
 * ## Wozu er da ist
 *
 * Diese Entwicklungsmaschine rendert über ANGLE auf dem *Microsoft Basic Render
 * Driver* und hat kein `EXT_disjoint_timer_query_webgl2`. Zwei Akzeptanzzeilen
 * aus P7 sind deshalb seit Monaten offen, und **jede** Aussage über Bildrate
 * oder GPU-Zeit wäre hier erfunden (CLAUDE.md, „Umgebung"). Das ist keine
 * Wissenslücke, sondern eine Werkzeuglücke: die Zahlen existieren, nur nicht auf
 * dieser Maschine.
 *
 * Also nicht raten, sondern ein Werkzeug bauen, das **anderswo** läuft und eine
 * Datei hinterlässt. `japanMap.report()` fährt eine Matrix ab — Blickpunkte ×
 * Qualitätsstufen — und schreibt eine JSON-Datei plus je ein PNG nach
 * `.cache/reports/`. Wer eine echte GPU hat, startet `npm run dev`, tippt einen
 * Aufruf und schickt den Ordner zurück.
 *
 * ## Warum er auf der laufenden Schleife misst und nicht auf `loop.tick()`
 *
 * `frameTiming.ts` misst die andere Frage: was kostet ein Zustand gegen einen
 * anderen. Es rendert ohne Vsync, so schnell es geht, und sagt über die Bildrate
 * ausdrücklich nichts. Hier ist die Bildrate aber genau die Frage — **hält die
 * Maschine 60 Hz?** — und dazu gehören Vsync, der Verbund mit dem Compositor und
 * alles, was der Browser zwischen zwei Bildern sonst noch tut. Gemessen wird
 * deshalb der **Abstand zwischen zwei rAF-Frames** auf der normal laufenden
 * Schleife, so wie es die Ersteinstufung in `quality.config.ts` schon tut.
 *
 * ## Drei Fallen, in die dieses Projekt schon getreten ist
 *
 * Sie sind hier als Code eingebaut, nicht als Merksatz:
 *
 *  1. **`renderer.info.render` ist eine lebende Referenz.** In P8.11 meldete die
 *     Stufentabelle 909 338 Dreiecke statt 623 628, weil der Wert nach einem
 *     Lauf über dreizehn fremde Blickpunkte gelesen wurde. Hier wird er
 *     **kopiert**, und zwar bevor `probe()` oder `shot()` einen weiteren Frame
 *     rendern. Die Reihenfolge in `measureCell()` ist deshalb nicht beliebig.
 *  2. **Ein vollständiges Bild ist kein vollständiger Zustand.** In P8.9 stand
 *     die Vegetation auf Ultra bei 0 Instanzen, und `probe()` meldete
 *     `anteilNichtSchwarz = 1`. Vor jeder Messung wird deshalb gewartet, bis die
 *     **Instanzzahl steht** — nicht, bis das Bild vollständig aussieht.
 *  3. **Ein verdecktes Fenster bekommt rAF im Sekundentakt.** Der Lauf
 *     verweigert bei `document.hidden` den Dienst und bricht ab, wenn das Fenster
 *     mittendrin verdeckt wird. Eine Zahl aus einem gedrosselten Tab ist keine
 *     Messung, und sie sieht wie eine aus.
 *
 * Fehlt die Timer-Erweiterung, stehen die GPU-Felder als `null` in der Datei und
 * `gpuTiming.available` auf `false` **mit Begründung** — nicht als 0, die nach
 * „kostet nichts" aussieht, und nicht als fehlendes Feld, das nach „vergessen"
 * aussieht. Dass der Lauf das auf dieser Maschine korrekt tut, ist sein eigener
 * Selbsttest: ein Messwerkzeug, das seine eigene Blindheit nicht meldet, ist
 * gefährlicher als keines.
 */

/**
 * Wie die Frames zustande kommen — und damit, welche Zahlen der Lauf liefert.
 *
 * **`live`** läuft auf der normalen Frameschleife und misst den rAF-Abstand. Das
 * ist die Betriebsart, für die dieses Werkzeug gebaut ist: sie beantwortet „hält
 * die Maschine die Bildrate", inklusive Vsync und Compositor. Sie verlangt ein
 * **sichtbares** Fenster.
 *
 * **`driven`** treibt die Schleife von Hand (`loop.tick()` mit einem Makrotask
 * dazwischen, damit der Streu-Worker antworten kann). Nötig, weil in einer
 * ausgeblendeten Vorschau **gar kein** rAF mehr kommt — nachgemessen am
 * 2026-08-07: fünf angeforderte Frames kamen in 30 s nicht zustande. Genau der
 * Zustand, an dem in P8.9 die Vegetation auf 0 Instanzen stand.
 *
 * > **In `driven` ist `pacing` `null`, und das ist keine Auslassung.** Ohne
 * > Vsync und ohne die Lücke zwischen zwei Bildern gibt es keinen Frame-Abstand,
 * > der etwas über eine Bildrate sagt — er wäre die Rechenzeit der Schleife, so
 * > schnell sie eben läuft. Genau diese Verwechslung steht in `frameTiming.ts`
 * > als widerlegte Annahme. Was `driven` liefert, sind die **exakten Zähler**:
 * > Draw-Calls, Dreiecke, Instanzen, Texturspeicher, Puffergröße und das Bild.
 * > Das ist der Anteil, über den diese Entwicklungsmaschine eine Aussage
 * > zulässt — und für die Stufenarbeit aus P10.1 genau der richtige.
 */
export type ReportMode = 'live' | 'driven';

/** Was ein Lauf über die Maschine festhält, auf der er entstanden ist. */
export interface ReportMachine {
  readonly userAgent: string;
  /** Aus `WEBGL_debug_renderer_info` — die einzige Angabe, die die GPU benennt. */
  readonly renderer: string | null;
  readonly vendor: string | null;
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency: number;
  readonly deviceMemoryGb: number | null;
  /** CSS-Größe des Canvas. Der Zeichenpuffer steht je Zelle daneben. */
  readonly canvas: { readonly width: number; readonly height: number };
}

export interface GpuTimingState {
  readonly available: boolean;
  readonly reason: string;
}

export interface Stats {
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  readonly samples: number;
}

export interface SettleResult {
  /** Falsch, wenn die Welt bis zum Zeitlimit nicht fertig geladen war. */
  readonly stable: boolean;
  readonly frames: number;
  readonly ms: number;
  readonly instances: number;
  /**
   * Strömte am Ende noch etwas nach?
   *
   * Getrennt von `stable` ausgewiesen, weil die beiden verschiedene Fragen
   * beantworten: `streaming` kommt aus dem Streusystem selbst, `stable` aus der
   * beobachteten Instanzzahl. Solange beide zusammenpassen, ist alles gut — und
   * wo sie auseinanderlaufen, will man es sehen und nicht wegmitteln.
   */
  readonly streaming: boolean;
  /**
   * Mittlerer Frame-Abstand **während des Wartens**, in Millisekunden.
   *
   * **Nachgetragen, weil das Werkzeug ohne diesen Wert die falsche Ursache
   * gemeldet hat.** Im ersten `live`-Lauf auf der GPU-Maschine (2026-08-07)
   * blieben zwei Zellen unfertig, und die Warnung sagte „die Welt war nicht
   * fertig geladen". Nachgerechnet aus `frames` und `ms` stand da aber etwas
   * ganz anderes:
   *
   * | Zelle | Frames | Dauer | je Frame |
   * |---|---|---|---|
   * | `medium @ pass` | 16 | 24 803 ms | **1550 ms** |
   * | `medium @ stadt-neon` | 99 | 114 863 ms | **1160 ms** |
   * | jede Messschleife desselben Laufs | 60 | ~1000 ms | 16,7 ms |
   *
   * Der Browser hat während dieser Wartephasen schlicht nicht gezeichnet —
   * rund 0,7 Hz, also die rAF-Drosselung. `document.hidden` blieb dabei
   * **falsch**, die Schutzabfrage griff also nicht: ein verdecktes oder
   * weggeklicktes Fenster meldet nicht zuverlässig `hidden`, wird aber sehr
   * wohl gedrosselt.
   *
   * Die Zahl stand die ganze Zeit in der Datei, nur ungeteilt — `frames` und
   * `ms` nebeneinander, und niemand hat dividiert. Sie steht jetzt ausgerechnet
   * da, und die Warnung nennt die Ursache, die dazu passt.
   */
  readonly frameIntervalMs: number;
}

export interface ReportCell {
  readonly viewpoint: string;
  readonly level: QualityLevel;
  readonly settle: SettleResult;
  /** rAF-Abstand: die Frage „hält die Maschine die Bildrate". `null` in `driven`. */
  readonly pacing: Stats | null;
  /** Aus `pacing` gerechnet — `null`, wo es keinen Frame-Abstand gibt. */
  readonly fps: number | null;
  /** `null`, wenn `EXT_disjoint_timer_query_webgl2` fehlt. */
  readonly gpu: Stats | null;
  /** JS-Arbeit je Frame aus stats-gl. `null` ohne Debug-Host. */
  readonly cpu: Stats | null;
  readonly counters: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly lines: number;
    readonly points: number;
    readonly programs: number;
    readonly geometries: number;
    readonly textures: number;
  };
  readonly scene: {
    readonly instances: number;
    readonly drawableMeshes: number;
    readonly byGroup: Readonly<Record<string, number>>;
    /**
     * Instanzen ohne Pufferplatz — **muss null sein**.
     *
     * `null`, wenn die Anwendung den Zähler nicht liefert. Siehe
     * `ScatterSystem.dropped`: ein Überlauf verwirft stillschweigend und sieht
     * im Bild aus wie eine Lichtung, die es nicht gibt.
     */
    readonly dropped: number | null;
  };
  readonly drawingBuffer: { readonly width: number; readonly height: number };
  readonly textureMemoryMb: number;
  readonly probe: FrameProbe;
  readonly shot: string | null;
}

export interface Report {
  readonly version: 1;
  readonly createdAt: string;
  readonly mode: ReportMode;
  readonly machine: ReportMachine;
  readonly gpuTiming: GpuTimingState;
  readonly deviceEstimate: DeviceEstimate | null;
  readonly settings: {
    readonly mode: ReportMode;
    readonly frames: number;
    readonly settleFrames: number;
    readonly settleTimeoutMs: number;
    readonly shots: boolean;
  };
  readonly cells: readonly ReportCell[];
  /** Alles, was den Lauf angreifbar macht — leer ist das Ziel. */
  readonly warnings: readonly string[];
}

export interface ReportOptions {
  /**
   * Standard `live`. `driven` nur, wo kein rAF kommt — und dann ohne
   * Bildraten-Aussage, siehe `ReportMode`.
   */
  readonly mode?: ReportMode;
  readonly viewpoints?: readonly string[];
  readonly levels?: readonly QualityLevel[];
  /** Gemessene Frames je Zelle. 60 ist bei 60 Hz eine Sekunde. */
  readonly frames?: number;
  /** So viele Frames muss die Instanzzahl unverändert bleiben. */
  readonly settleFrames?: number;
  readonly settleTimeoutMs?: number;
  readonly shots?: boolean;
  /** Dateiname ohne Endung. */
  readonly name?: string;
}

/**
 * Blickpunkte, an denen die Stufen sich überhaupt unterscheiden können.
 *
 * **`stadt-neon` ist bewusst nicht der erste.** Er ist der Money-Shot der Karte,
 * aber für die Stufenfrage der schlechteste Ort: dort stehen auf Ultra 1493
 * Vegetationsinstanzen, und P8.1 hat gemessen, dass Niedrig und Minimal sich an
 * dieser Stelle um 9 Dreiecke unterscheiden. Wer die Stufen dort abliest, misst
 * die Postprocessing-Kette und hält das Ergebnis für eine Aussage über die
 * Vegetation. `start`, `reisfeld` und `pass` tragen den Bewuchs (8805 Instanzen
 * am Reisfeld); `stadt-neon` bleibt drin, weil die Kette auch gemessen gehört.
 */
const DEFAULT_VIEWPOINTS = ['start', 'reisfeld', 'pass', 'kueste', 'stadt-neon'] as const;

const DEFAULTS = {
  frames: 60,
  settleFrames: 20,
  /**
   * Zeitlimit für das Warten je Zelle.
   *
   * **30 s und nicht 15.** Die 15 s waren geschätzt; im ersten `live`-Lauf
   * brauchte `medium @ reisfeld` gemessen 2,0 s, `medium @ start` aber 4,8 s
   * und `medium @ kueste` 3,3 s — und das auf einer schnellen Maschine mit
   * ungedrosselten Frames. Ein Zeitlimit, das ein langsames Gerät reihenweise
   * reißt, macht aus jeder Zelle eine Warnung und aus dem Lauf eine Datei ohne
   * Aussage.
   */
  settleTimeoutMs: 30_000,
  shots: true,
} as const;

/**
 * Ab diesem mittleren Frame-Abstand gilt der Browser als **gedrosselt**.
 *
 * 500 ms trennt die beiden Fälle sauber, und beide sind gemessen: der
 * Software-Rasterisierer dieser Entwicklungsmaschine kommt auf rund 170 ms je
 * Frame (`frameTiming.ts`), die beobachtete Drosselung auf 1160 und 1550 ms.
 * Dazwischen liegt ein Faktor sieben; die Schwelle in der Mitte ist gegen beide
 * Seiten robust.
 *
 * Bewusst **kein Abbruch, sondern eine Diagnose.** Ein wirklich langsames Gerät
 * soll gemessen werden dürfen — genau dafür ist das Werkzeug da. Was nicht
 * passieren darf, ist eine Drosselung, die als „langsame Welt" in die Datei
 * wandert.
 */
const THROTTLED_FRAME_MS = 500;

/** Was der Messlauf von der Anwendung braucht. */
export interface ReportDeps {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: CameraPlacer;
  readonly capture: CaptureTarget;
  readonly quality: {
    /**
     * `QualityKey`, nicht `QualityLevel`: seit P10.2 kann eine eigene Stufe
     * eingestellt sein. Der Lauf **misst** sie nicht — seine Matrix sind die
     * fünf Voreinstellungen —, aber er muss sie am Ende wiederherstellen
     * können. Ein Messlauf, der dem Nutzer seine Einstellungen wegnimmt, wäre
     * ein Werkzeug mit Nebenwirkung.
     */
    readonly level: QualityKey;
    readonly estimate: DeviceEstimate | null;
    readonly classifying: boolean;
    set(level: QualityKey): void;
  };
  /** Die Debug-UI liefert CPU- und GPU-Zeit. Ohne sie bleiben beide `null`. */
  readonly timing: {
    readonly lastGpuMs: number | null;
    readonly lastCpuMs: number | null;
  } | null;
  /** Zusätzliche Texturkandidaten, üblicherweise `ResourceManager.tracked`. */
  readonly extraTextures?: () => Iterable<unknown>;
  /**
   * Arbeitet die Streuung noch? Ohne dieses Signal wartet der Lauf allein auf
   * eine unveränderte Instanzzahl — und hält dann eine leere Welt für eine
   * fertige. Siehe `settle()`.
   */
  readonly streaming?: () => boolean;
  /** Verworfene Instanzen der Streuung — siehe `ScatterSystem.dropped`. */
  readonly dropped?: () => number;
}

class HiddenWindowError extends Error {
  constructor(when: string) {
    super(
      `Messlauf ${when}: das Fenster ist verdeckt (document.hidden). ` +
        'Der Browser drosselt requestAnimationFrame dann auf wenige Hertz — ' +
        'jede Zahl daraus wäre die Drosselung, nicht die Maschine. ' +
        'Fenster in den Vordergrund holen und erneut starten.',
    );
    this.name = 'HiddenWindowError';
  }
}

/** Ein Frame auf der laufenden Schleife abwarten. */
function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Ein Makrotask über `MessageChannel`.
 *
 * **Nicht `setTimeout`** — der wird in einem verdeckten Fenster auf ≥ 1 s
 * gedrosselt und machte aus jedem Worker-Umlauf eine Sekunde. Ein
 * `MessageChannel`-Port hat diese Klemmung nicht (CLAUDE.md, P8.9).
 */
function macrotask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (): void => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * Der Frame-Vorschub der jeweiligen Betriebsart.
 *
 * In `live` wird gewartet, in `driven` wird gerendert. Der Makrotask dazwischen
 * ist Pflicht und nicht Höflichkeit: die Streuung antwortet aus einem Worker,
 * und ohne Rückkehr in die Ereignisschleife käme keine einzige Antwort an — die
 * Instanzzahl käme nie zur Ruhe, und `settle()` liefe in sein Zeitlimit.
 */
function advancer(mode: ReportMode, capture: CaptureTarget): () => Promise<number> {
  if (mode === 'live') return nextFrame;
  return async (): Promise<number> => {
    capture.tick();
    await macrotask();
    return performance.now();
  };
}

function statsOf(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
  return {
    medianMs: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    worstMs: sorted[sorted.length - 1] ?? 0,
    samples: sorted.length,
  };
}

/**
 * Instanzen und zeichenbare Meshes aus der Szene, nach oberster Gruppe getrennt.
 *
 * Bewusst über die Szene und nicht über die Systeme: kein System muss dafür eine
 * Schnittstelle bekommen, und gezählt wird, was **wirklich in der Szene hängt**
 * — nicht, was ein System über sich selbst berichtet. Genau diese Trennung hat
 * in P8.11 die zwei rückseitig gewickelten Flächen sichtbar gemacht, die jede
 * System-Auskunft für gesund hielt.
 *
 * `InstancedMesh.count` ist die Zahl, die gezeichnet wird — nicht die
 * Puffergröße. Unsichtbare Zweige werden übersprungen, samt Kindern.
 */
function countScene(scene: Scene): {
  instances: number;
  drawableMeshes: number;
  byGroup: Record<string, number>;
} {
  let instances = 0;
  let drawableMeshes = 0;
  const byGroup: Record<string, number> = {};

  const groupOf = (object: Object3D): string => {
    let node: Object3D | null = object;
    let name = object.name || object.type;
    while (node && node.parent && node.parent !== scene) {
      node = node.parent;
      if (node.name) name = node.name;
    }
    if (node?.parent === scene && node.name) name = node.name;
    return name || '(ohne Namen)';
  };

  const walk = (object: Object3D): void => {
    if (!object.visible) return;
    if (object instanceof InstancedMesh) {
      instances += object.count;
      drawableMeshes++;
      const key = groupOf(object);
      byGroup[key] = (byGroup[key] ?? 0) + object.count;
    } else if (object instanceof Mesh) {
      drawableMeshes++;
    }
    for (const child of object.children) walk(child);
  };

  for (const child of scene.children) walk(child);
  return { instances, drawableMeshes, byGroup };
}

function readGpuTiming(renderer: WebGLRenderer, timing: ReportDeps['timing']): GpuTimingState {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as object | null;
  if (!ext) {
    return {
      available: false,
      reason:
        'EXT_disjoint_timer_query_webgl2 fehlt — der Treiber liefert keine GPU-Zeit. ' +
        'Auf dieser Entwicklungsmaschine ist das der Normalfall (ANGLE / Microsoft Basic Render Driver).',
    };
  }
  if (!timing) {
    return {
      available: false,
      reason:
        'Die Erweiterung ist da, aber kein Debug-Host misst damit. ' +
        'Der Messlauf braucht das Debug-Panel (nur im Dev-Build).',
    };
  }
  if (timing.lastGpuMs === null) {
    return {
      available: false,
      reason:
        'Die Erweiterung ist da, liefert aber dauerhaft Nullen — ' +
        'FrameTimer wertet das als defekten Timer (siehe STALLED_SAMPLE_THRESHOLD).',
    };
  }
  return { available: true, reason: 'EXT_disjoint_timer_query_webgl2 vorhanden und liefert Werte.' };
}

function readMachine(renderer: WebGLRenderer): ReportMachine {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const size = renderer.getSize(new Vector2());
  // `navigator.deviceMemory` ist nicht überall vorhanden und steht nicht im
  // Standard-Typ — daher die enge Zusicherung statt eines `any`.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;

  return {
    userAgent: navigator.userAgent,
    renderer: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
    vendor: info ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : null,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: memory,
    canvas: { width: Math.round(size.x), height: Math.round(size.y) },
  };
}

/**
 * Warten, bis die Welt fertig geladen ist.
 *
 * Die Streuung strömt in der Frameschleife nach; direkt nach einem Sprung an
 * einen neuen Blickpunkt ist die Welt halb gefüllt. Wer da misst, misst den
 * Füllvorgang — und bekommt eine Draw-Call-Zahl, die zu keinem Bild gehört.
 *
 * **Zwei Bedingungen, und die erste allein hat nicht gereicht.** Der erste
 * Entwurf wartete nur darauf, dass die Instanzzahl über N Frames unverändert
 * bleibt. Am 2026-08-07 meldete er am Blickpunkt `reisfeld` auf Ultra
 * `stable: true` bei **0 Vegetationsinstanzen**: der Worker hatte in 267 ms
 * noch nichts geliefert, und *unverändert bei null* ist von *fertig* nicht zu
 * unterscheiden. Gefunden hat das kein Argument, sondern der erste Lauf des
 * Werkzeugs gegen sich selbst.
 *
 * Deshalb wird zusätzlich das Streusystem **gefragt**, ob es noch arbeitet
 * (`ScatterSystem.streaming`). Der Zähler beobachtet das Ergebnis, das Signal
 * kennt die Arbeit — und nur zusammen beantworten sie die Frage.
 */
async function settle(
  scene: Scene,
  streamingOf: (() => boolean) | undefined,
  advance: () => Promise<number>,
  live: boolean,
  settleFrames: number,
  timeoutMs: number,
): Promise<SettleResult> {
  const started = performance.now();
  let previous = -1;
  let stable = 0;
  let frames = 0;

  for (;;) {
    await advance();
    if (live && document.hidden) throw new HiddenWindowError('abgebrochen');
    frames++;

    const { instances } = countScene(scene);
    const streaming = streamingOf?.() ?? false;
    stable = instances === previous && !streaming ? stable + 1 : 0;
    previous = instances;

    const ms = performance.now() - started;
    const frameIntervalMs = ms / frames;
    if (stable >= settleFrames) {
      return { stable: true, frames, ms, instances, streaming, frameIntervalMs };
    }
    if (ms > timeoutMs) {
      return { stable: false, frames, ms, instances, streaming, frameIntervalMs };
    }
  }
}

async function measureCell(
  deps: ReportDeps,
  viewpoint: string,
  level: QualityLevel,
  options: Required<Omit<ReportOptions, 'viewpoints' | 'levels' | 'name'>>,
): Promise<ReportCell> {
  const live = options.mode === 'live';
  const advance = advancer(options.mode, deps.capture);

  deps.quality.set(level);
  applyViewpoint(deps.camera, viewpoint);

  const settleResult = await settle(
    deps.scene,
    deps.streaming,
    advance,
    live,
    options.settleFrames,
    options.settleTimeoutMs,
  );

  // Ein Frame verwerfen: der erste Abstand nach dem Warten enthält die Zeit, die
  // das Warten selbst gekostet hat.
  let last = await advance();

  const pacing: number[] = [];
  const gpu: number[] = [];
  const cpu: number[] = [];

  for (let i = 0; i < options.frames; i++) {
    const now = await advance();
    if (live && document.hidden) throw new HiddenWindowError('abgebrochen');
    // **Nur in `live`.** Ohne Vsync ist der Abstand die Rechenzeit der Schleife
    // und keine Bildrate — die Verwechslung, die `frameTiming.ts` als widerlegt
    // führt. Was hier nicht gemessen werden kann, wird nicht gesammelt.
    if (live) pacing.push(now - last);
    last = now;

    const gpuMs = deps.timing?.lastGpuMs ?? null;
    if (gpuMs !== null) gpu.push(gpuMs);
    const cpuMs = deps.timing?.lastCpuMs ?? null;
    if (cpuMs !== null) cpu.push(cpuMs);
  }

  // **Ab hier wird kopiert, bevor irgendetwas noch einen Frame rendert.**
  // `renderer.info.render` ist eine lebende Referenz (P8.11) — und `probe()` und
  // `shot()` unten rendern beide. Die Reihenfolge dieser Zeilen ist die Messung.
  const info = deps.renderer.info;
  const counters = {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    lines: info.render.lines,
    points: info.render.points,
    programs: info.programs?.length ?? 0,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };

  const gl = deps.renderer.getContext();
  const drawingBuffer = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  const scene = { ...countScene(deps.scene), dropped: deps.dropped?.() ?? null };
  const textureMemoryMb =
    estimateTextureMemory(deps.scene, deps.extraTextures?.() ?? []) / (1024 * 1024);

  // Erst jetzt: beides rendert einen zusätzlichen Frame.
  const probe = probeFrame(deps.capture);
  let shot: string | null = null;
  if (options.shots) {
    shot = await postToDevServer(
      '/__shot',
      `report_${viewpoint.replace(/[^a-z0-9]/gi, '')}_${level}`,
      captureFramePng(deps.capture),
    );
  }

  const pacingStats = pacing.length > 0 ? statsOf(pacing) : null;
  return {
    viewpoint,
    level,
    settle: settleResult,
    pacing: pacingStats,
    fps: pacingStats && pacingStats.medianMs > 0 ? 1000 / pacingStats.medianMs : null,
    gpu: gpu.length > 0 ? statsOf(gpu) : null,
    cpu: cpu.length > 0 ? statsOf(cpu) : null,
    counters,
    scene,
    drawingBuffer,
    textureMemoryMb,
    probe,
    shot,
  };
}

/**
 * Den Messlauf fahren und die Datei schreiben.
 *
 * Gibt den Bericht zurück **und** legt ihn als JSON ab, damit er auch dann
 * vorliegt, wenn niemand die Konsolenausgabe kopiert.
 */
export async function runReport(deps: ReportDeps, options: ReportOptions = {}): Promise<Report> {
  const mode = options.mode ?? 'live';
  if (mode === 'live' && document.hidden) throw new HiddenWindowError('nicht gestartet');

  const viewpoints = options.viewpoints ?? DEFAULT_VIEWPOINTS;
  const levels = options.levels ?? QUALITY_LEVELS;
  const settings = {
    mode,
    frames: options.frames ?? DEFAULTS.frames,
    settleFrames: options.settleFrames ?? DEFAULTS.settleFrames,
    settleTimeoutMs: options.settleTimeoutMs ?? DEFAULTS.settleTimeoutMs,
    shots: options.shots ?? DEFAULTS.shots,
  };

  // **Vor dem ersten Frame prüfen, nicht in Zelle 17.** Ein Lauf über 25 Zellen
  // dauert Minuten; ein Tippfehler im Blickpunktnamen soll ihn nicht am Ende
  // verwerfen.
  for (const name of viewpoints) {
    if (!(name in VIEWPOINTS)) {
      throw new Error(
        `Unbekannter Blickpunkt „${name}". Bekannt: ${Object.keys(VIEWPOINTS).join(', ')}`,
      );
    }
  }
  for (const level of levels) {
    if (!(level in QUALITY)) {
      throw new Error(`Unbekannte Qualitätsstufe „${level}". Bekannt: ${QUALITY_LEVELS.join(', ')}`);
    }
  }

  // Die Ersteinstufung stuft selbsttätig herunter, solange sie läuft — sie würde
  // dem Lauf die Stufe unter den Füßen wegziehen. Abwarten statt abbrechen: sie
  // dauert höchstens ein paar Sekunden.
  const advance = advancer(mode, deps.capture);
  if (deps.quality.classifying) {
    console.info('[report] Die Ersteinstufung läuft noch — warte, bis sie fertig ist.');
    const bis = performance.now() + 30_000;
    while (deps.quality.classifying && performance.now() < bis) await advance();
    if (deps.quality.classifying) {
      throw new Error('Die Ersteinstufung ist nach 30 s nicht fertig — Lauf abgebrochen.');
    }
  }

  const levelBefore = deps.quality.level;
  const warnings: string[] = [];
  const gpuTiming = readGpuTiming(deps.renderer, deps.timing);
  if (!gpuTiming.available) warnings.push(`GPU-Zeit nicht messbar: ${gpuTiming.reason}`);
  if (!deps.timing) warnings.push('Kein Debug-Host — CPU-Zeit je Frame fehlt ebenfalls.');
  if (mode === 'driven') {
    warnings.push(
      'Betriebsart „driven": die Schleife wurde von Hand getrieben, ohne Vsync. ' +
        'Es gibt deshalb keinen Frame-Abstand und keine Bildrate — `pacing` und `fps` ' +
        'stehen als null in der Datei. Belastbar sind die exakten Zähler ' +
        '(Draw-Calls, Dreiecke, Instanzen, Texturspeicher, Puffergröße) und das Bild.',
    );
  }

  const total = viewpoints.length * levels.length;
  console.info(
    `[report] ${mode} · ${total} Zellen (${levels.length} Stufen × ${viewpoints.length} Blickpunkte), ` +
      `je ${settings.frames} Frames. GPU-Zeit: ${gpuTiming.available ? 'ja' : 'nein'}.`,
  );

  const cells: ReportCell[] = [];
  try {
    let index = 0;
    for (const level of levels) {
      for (const viewpoint of viewpoints) {
        index++;
        console.info(`[report] ${index}/${total} — ${level} @ ${viewpoint}`);
        const cell = await measureCell(deps, viewpoint, level, settings);
        cells.push(cell);

        // **Drei verschiedene Ursachen, drei verschiedene Sätze.** Die erste
        // Fassung dieser Warnung kannte nur eine („die Welt war nicht fertig
        // geladen") und hat damit im ersten Lauf zweimal danebengetippt: in
        // Wahrheit war der Browser gedrosselt. Siehe `SettleResult.frameIntervalMs`.
        if (!cell.settle.stable) {
          const s = cell.settle;
          const kopf = `${level} @ ${viewpoint}:`;
          if (s.frameIntervalMs > THROTTLED_FRAME_MS) {
            warnings.push(
              `${kopf} der Browser hat während des Wartens praktisch nicht gezeichnet — ` +
                `${s.frames} Frames in ${(s.ms / 1000).toFixed(1)} s, also ` +
                `${s.frameIntervalMs.toFixed(0)} ms je Frame. Das ist rAF-Drosselung, keine ` +
                'langsame Welt (`document.hidden` blieb dabei falsch). Fenster im Vordergrund ' +
                'lassen und die Zelle wiederholen.',
            );
          } else if (s.streaming) {
            warnings.push(
              `${kopf} die Streuung war nach ${(s.ms / 1000).toFixed(1)} s noch nicht fertig ` +
                `(zuletzt ${s.instances} Instanzen bei ${s.frameIntervalMs.toFixed(1)} ms je ` +
                'Frame). Zeitlimit erhöhen — die Zahlen dieser Zelle gehören einem halb ' +
                'gefüllten Zustand.',
            );
          } else {
            warnings.push(
              `${kopf} die Instanzzahl kam nicht zur Ruhe, **obwohl die Streuung ruht** ` +
                `(zuletzt ${s.instances}, ${s.frameIntervalMs.toFixed(1)} ms je Frame). Da ` +
                'schwankt etwas anderes — vermutlich die LOD-Puffer, die je Durchlauf neu ' +
                'gesetzt werden. Ungeklärt, und deshalb hier benannt statt weggemittelt.',
            );
          }
        }

        // Ein Überlauf ist kein Messfehler, sondern ein Bildfehler: die
        // verworfenen Instanzen fehlen im Bild, und zwar bevorzugt dort, wo es
        // dicht ist. Die Zahl gehört deshalb nach ganz oben in die Warnliste.
        if (cell.scene.dropped !== null && cell.scene.dropped > 0) {
          warnings.push(
            `${level} @ ${viewpoint}: ${cell.scene.dropped} Instanzen ohne Pufferplatz ` +
              'VERWORFEN. Die Puffer werden einmal beim Start bemessen, die LOD-Grenzen hängen ' +
              'an der Stufe — siehe `ScatterSystem.#capacity` und `LOD_BIAS_MIN`. Im Bild fehlt ' +
              'Bewuchs, den es geben müsste.',
          );
        }

        // Die Instanzzahl beim Warten gegen die beim Zählen. Laufen sie
        // auseinander, hat sich die Welt zwischen Wartephase und Messung noch
        // verändert — dann gehören Zähler und Bild nicht zusammen. Im ersten
        // Lauf standen hier 8409 gegen 4580.
        const abweichung = Math.abs(cell.settle.instances - cell.scene.instances);
        if (cell.settle.instances > 0 && abweichung / cell.settle.instances > 0.05) {
          warnings.push(
            `${level} @ ${viewpoint}: beim Warten ${cell.settle.instances} Instanzen, beim ` +
              `Zählen ${cell.scene.instances} — ${((abweichung / cell.settle.instances) * 100).toFixed(0)} % ` +
              'Unterschied. Die Welt hat sich zwischen beiden Schritten noch verändert; Zähler ' +
              'und Bild dieser Zelle gehören nicht sicher zusammen.',
          );
        }
        // Ein Flächenanteil auf einem beschnittenen Bild ist ein Anteil an etwas
        // anderem (P8.2). Geprüft wird deshalb, dass überhaupt das ganze Bild da
        // ist — **nicht**, dass es hell ist.
        //
        // **Die Schwelle stand zuerst auf 0,999 und war zu scharf.** Am
        // Blickpunkt `wald` meldete sie 0,993 und damit einen Fehler, den es
        // nicht gab: auf Augenhöhe in einem Wald zur blauen Stunde fallen 0,7 %
        // der Pixel unter Luma 2, weil dort Baumsilhouetten im Gegenlicht
        // stehen. Das Bild war vollständig — nachgesehen, nicht angenommen.
        //
        // Der Fehler, gegen den die Zeile wacht, sieht völlig anders aus: der
        // vergessene Viewport aus P8.2 ließ ein Fünftel des Bildes schwarz und
        // ergab **0,800**. Zwischen 0,800 und 0,993 liegt reichlich Platz; 0,95
        // trennt beide Fälle mit weitem Abstand nach jeder Seite.
        if (cell.probe.anteilNichtSchwarz < 0.95) {
          warnings.push(
            `${level} @ ${viewpoint}: anteilNichtSchwarz = ` +
              `${cell.probe.anteilNichtSchwarz.toFixed(3)} statt 1,000 — das Bild ist unvollständig, ` +
              'jede Pixelmessung daraus ist es auch.',
          );
        }
      }
    }
  } finally {
    // Auch nach einem Abbruch: die Stufe gehört zurückgestellt, sonst sitzt der
    // Nutzer nach einem abgebrochenen Lauf still auf „Minimal".
    deps.quality.set(levelBefore);
  }

  const report: Report = {
    version: 1,
    createdAt: new Date().toISOString(),
    mode,
    machine: readMachine(deps.renderer),
    gpuTiming,
    deviceEstimate: deps.quality.estimate,
    settings,
    cells,
    warnings,
  };

  const name = options.name ?? `report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`;
  const path = await postToDevServer('/__report', name, JSON.stringify(report, null, 2));
  console.info(`[report] geschrieben nach: ${path}`);
  if (warnings.length > 0) {
    console.warn(`[report] ${warnings.length} Einschränkung(en):`);
    for (const warning of warnings) console.warn(`  · ${warning}`);
  }
  console.table(
    cells.map((cell) => ({
      Stufe: cell.level,
      Blickpunkt: cell.viewpoint,
      'ms/Frame': cell.pacing ? cell.pacing.medianMs.toFixed(1) : 'n/a',
      FPS: cell.fps === null ? 'n/a' : cell.fps.toFixed(0),
      'GPU ms': cell.gpu ? cell.gpu.medianMs.toFixed(2) : 'n/a',
      'CPU ms': cell.cpu ? cell.cpu.medianMs.toFixed(2) : 'n/a',
      Calls: cell.counters.drawCalls,
      Dreiecke: cell.counters.triangles,
      Instanzen: cell.scene.instances,
      Puffer: `${cell.drawingBuffer.width}×${cell.drawingBuffer.height}`,
    })),
  );

  return report;
}
