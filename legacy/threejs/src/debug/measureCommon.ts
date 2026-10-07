import { InstancedMesh, Mesh, type Object3D, type Scene } from 'three';

import type { CaptureTarget } from './capture';

/**
 * Was der Messlauf (P10.0) und die A/B-Messung (P12.0) gemeinsam brauchen.
 *
 * Herausgelöst, als die zweite dazukam. CLAUDE.md verlangt das ausdrücklich:
 * was zwei Werkzeuge brauchen, wird nicht zweimal geschrieben — sonst driften
 * die beiden Antworten auf „ist die Welt fertig geladen" auseinander, und genau
 * diese Frage hat in P10.0 schon einmal eine leere Welt für eine fertige
 * gehalten.
 */

/**
 * Wie die Frames zustande kommen.
 *
 * **`live`** läuft auf der normalen Frameschleife und misst den rAF-Abstand —
 * die einzige Betriebsart, die etwas über die *Bildrate* sagt. Sie verlangt ein
 * sichtbares Fenster.
 *
 * **`driven`** treibt die Schleife von Hand. Nötig, weil in einer
 * ausgeblendeten Vorschau **gar kein** rAF mehr kommt (nachgemessen 2026-08-07:
 * fünf angeforderte Frames in 30 s nicht zustande gekommen). Ohne Vsync gibt es
 * dort keinen Frame-Abstand, der eine Bildrate wäre — was `driven` liefert, sind
 * die exakten Zähler und, wo der Treiber sie hergibt, die GPU-Zeit.
 */
export type AdvanceMode = 'live' | 'driven';

export class HiddenWindowError extends Error {
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
export function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Ein Makrotask über `MessageChannel`.
 *
 * **Nicht `setTimeout`** — der wird in einem verdeckten Fenster auf ≥ 1 s
 * gedrosselt und machte aus jedem Worker-Umlauf eine Sekunde. Ein
 * `MessageChannel`-Port hat diese Klemmung nicht (CLAUDE.md, P8.9).
 */
export function macrotask(): Promise<void> {
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
export function advancer(mode: AdvanceMode, capture: CaptureTarget): () => Promise<number> {
  if (mode === 'live') return nextFrame;
  return async (): Promise<number> => {
    capture.tick();
    await macrotask();
    return performance.now();
  };
}

export interface SceneCount {
  readonly instances: number;
  readonly drawableMeshes: number;
  readonly byGroup: Readonly<Record<string, number>>;
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
export function countScene(scene: Scene): SceneCount {
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
   * blieben zwei Zellen unfertig, und die Meldung nannte „die Welt war nicht
   * fertig geladen". Nachgerechnet lag der Frame-Abstand bei 1550 bzw. 1160 ms
   * gegen 16,7 ms in derselben Messschleife — der Browser war gedrosselt, und
   * `document.hidden` stand dabei auf `false`.
   */
  readonly frameIntervalMs: number;
}

/**
 * Warten, bis die Welt fertig geladen ist.
 *
 * Die Streuung strömt in der Frameschleife nach; direkt nach einem Sprung an
 * einen neuen Blickpunkt — oder nach einem Stufenwechsel — ist die Welt halb
 * gefüllt. Wer da misst, misst den Füllvorgang.
 *
 * **Zwei Bedingungen, und die erste allein hat nicht gereicht.** Der erste
 * Entwurf wartete nur darauf, dass die Instanzzahl über N Frames unverändert
 * bleibt. Am 2026-08-07 meldete er am Blickpunkt `reisfeld` auf Ultra
 * `stable: true` bei **0 Vegetationsinstanzen**: *unverändert bei null* ist von
 * *fertig* nicht zu unterscheiden. Deshalb wird zusätzlich das Streusystem
 * **gefragt**, ob es noch arbeitet.
 */
export async function settle(
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

export interface Stats {
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  readonly samples: number;
}

/** Perzentil einer **unsortierten** Stichprobe. */
export function percentileOf(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

export function statsOf(samples: readonly number[]): Stats {
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
