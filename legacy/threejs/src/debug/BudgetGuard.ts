import type { Scene, WebGLRenderer } from 'three';

import { BUDGETS, type Budget } from '@/config/quality.config';
import { estimateTextureMemory } from './textureMemory';
import { formatCount, formatMegabytes, tallyCityCalls, tallySubtree } from './budgets';

/** Was der Guard beobachtet. Reihenfolge = Reihenfolge im Banner. */
interface WatchedMetric {
  readonly id: string;
  readonly label: string;
  readonly budget: Budget;
  readonly format: (value: number) => string;
}

const WATCHED: readonly WatchedMetric[] = [
  { id: 'calls', label: 'Draw-Calls', budget: BUDGETS.drawCalls, format: formatCount },
  { id: 'triangles', label: 'Dreiecke', budget: BUDGETS.triangles, format: formatCount },
  {
    id: 'cityCalls',
    label: 'Draw-Calls Stadt',
    budget: BUDGETS.cityDrawCalls,
    format: formatCount,
  },
  {
    id: 'texMemory',
    label: 'Texturspeicher',
    budget: BUDGETS.textureMemoryMb,
    format: formatMegabytes,
  },
];

/** Wie oft der Texturspeicher geschätzt wird — der Lauf geht über die Szene. */
const MEMORY_INTERVAL_MS = 1000;

/**
 * Wie viele Frames eine Metrik über dem Limit liegen muss, bevor der Guard
 * anschlägt.
 *
 * Nicht null: der erste Frame nach einem Materialwechsel, einem Fenster-Resize
 * oder dem Imposter-Bake sieht anders aus als der Dauerzustand, und eine
 * Warnung, die bei jedem Reload einmal aufblitzt, liest irgendwann keiner mehr.
 * 30 Frames sind eine halbe Sekunde bei 60 Hz und länger als jeder solche
 * Einschwingvorgang.
 */
const SUSTAIN_FRAMES = 30;

/**
 * Budget-Durchsetzung — PLAN.md P4 / 4.6.
 *
 * **Bewusst laut.** Die Begründung steht im Plan und ist die Lehre aus P1: dort
 * hat die Budget-Ampel einen Planungsfehler gefunden (4.186.128 Dreiecke gegen
 * 3 Mio. Budget), aber erst, weil jemand hingesehen hat. Eine Überschreitung,
 * die niemand bemerkt, fällt Wochen später auf — und dann ist nicht mehr
 * zuzuordnen, welche Änderung sie verursacht hat.
 *
 * Der Guard tut deshalb zwei Dinge, die die Ampel nicht tut:
 *
 *  1. Er legt ein **Banner über das Overlay**, das man nicht übersehen kann.
 *  2. Er schreibt **einmal je Metrik** in die Konsole, mit einer Aufschlüsselung
 *     nach Verursacher — welche Gruppe der Szene wie viele Draw-Calls und
 *     Dreiecke beisteuert. Das ist der Teil, der die Zuordnung möglich macht:
 *     „800 Draw-Calls" ist eine Zahl, „Vegetation: 612" ist ein Hinweis.
 */
export class BudgetGuard {
  readonly #renderer: WebGLRenderer;
  readonly #scene: Scene;
  readonly #extraTextures: () => Iterable<unknown>;
  readonly #banner: HTMLElement;

  readonly #over = new Map<string, number>();
  readonly #reported = new Set<string>();

  #textureMemoryMb = 0;
  #lastMemoryScan = 0;
  #bannerText = '';

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    container: HTMLElement,
    extraTextures?: () => Iterable<unknown>,
  ) {
    this.#renderer = renderer;
    this.#scene = scene;
    this.#extraTextures = extraTextures ?? ((): Iterable<unknown> => []);

    this.#banner = document.createElement('p');
    this.#banner.className = 'budget-guard';
    this.#banner.hidden = true;
    container.appendChild(this.#banner);
  }

  /** Pro Frame aufrufen, nach dem Rendern. */
  update(): void {
    const now = performance.now();
    if (now - this.#lastMemoryScan >= MEMORY_INTERVAL_MS) {
      this.#lastMemoryScan = now;
      this.#textureMemoryMb =
        estimateTextureMemory(this.#scene, this.#extraTextures()) / (1024 * 1024);
    }

    const info = this.#renderer.info;
    const values: Record<string, number> = {
      calls: info.render.calls,
      triangles: info.render.triangles,
      cityCalls: this.#cityCalls(),
      texMemory: this.#textureMemoryMb,
    };

    const breached: string[] = [];
    for (const metric of WATCHED) {
      const value = values[metric.id] ?? 0;
      if (value > metric.budget.limit) {
        const streak = (this.#over.get(metric.id) ?? 0) + 1;
        this.#over.set(metric.id, streak);
        if (streak >= SUSTAIN_FRAMES) {
          breached.push(
            `${metric.label} ${metric.format(value)} / ${metric.format(metric.budget.limit)}`,
          );
          if (!this.#reported.has(metric.id)) {
            this.#reported.add(metric.id);
            this.#report(metric, value);
          }
        }
      } else {
        this.#over.set(metric.id, 0);
        // Der Konsolen-Eintrag wird wieder freigegeben, sobald die Metrik zurück
        // im Budget ist. Sonst bliebe eine reparierte Überschreitung für den
        // Rest der Sitzung stumm — und genau dann will man wissen, ob sie
        // wiederkommt.
        this.#reported.delete(metric.id);
      }
    }

    const text = breached.length === 0 ? '' : `BUDGET ÜBERSCHRITTEN — ${breached.join(' · ')}`;
    if (text !== this.#bannerText) {
      this.#bannerText = text;
      this.#banner.textContent = text;
      this.#banner.hidden = text === '';
    }
  }

  set visible(value: boolean) {
    // Wenn das Overlay ausgeblendet ist, verschwindet das Banner mit. Es hängt
    // im selben Container, und ein Warnstreifen über einem versteckten Overlay
    // wäre ein Element ohne Kontext.
    this.#banner.style.display = value ? '' : 'none';
  }

  /**
   * Draw-Calls der Stadt — das Teilbudget aus PLAN.md P6.
   *
   * Läuft über zwei Gruppen mit zusammen rund 30 Objekten und kostet damit
   * nichts, was ein Frame merkt. Bewusst **ohne** Frustum-Culling: das Budget
   * soll die Bauweise prüfen, nicht die Blickrichtung. Gemessen im fertigen
   * Zustand sind es **28 von 300** — 25 Blöcke, Bürgersteige, Bodenplatte, dazu
   * ein Aufruf für alle 297 Neonschilder.
   */
  #cityCalls(): number {
    return tallyCityCalls(this.#scene);
  }

  /**
   * Aufschlüsselung nach Verursacher.
   *
   * Gruppiert wird nach den **direkten Kindern der Szene** — genau das sind die
   * Systeme (`Terrain`, `Straßen`, `Vegetation`, `Meer`). Tiefer zu gehen wäre
   * genauer und weniger nützlich: gefragt ist, welches System man sich ansehen
   * muss, nicht welches Mesh.
   */
  #report(metric: WatchedMetric, value: number): void {
    const rows: { Gruppe: string; 'Draw-Calls': number; Dreiecke: number }[] = [];
    for (const child of this.#scene.children) {
      const tally = tallySubtree(child);
      if (tally.calls === 0 && tally.triangles === 0) continue;
      rows.push({
        Gruppe: child.name || child.type,
        'Draw-Calls': tally.calls,
        Dreiecke: tally.triangles,
      });
    }
    rows.sort((a, b) => b['Draw-Calls'] - a['Draw-Calls']);

    console.warn(
      `[BudgetGuard] ${metric.label}: ${metric.format(value)} über dem Limit von ` +
        `${metric.format(metric.budget.limit)} (SPEC §4). Verursacher:`,
    );
    console.table(rows);
  }


  dispose(): void {
    this.#banner.remove();
    this.#over.clear();
    this.#reported.clear();
  }
}
