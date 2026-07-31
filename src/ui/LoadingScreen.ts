import type { AppBus } from '@/core/events';

/**
 * Ladebildschirm — PLAN.md P7 / 7.3.
 *
 * ## „Echter Fortschritt, keine gefälschte Animation"
 *
 * Das ist die Vorgabe, und sie ist der ganze Entwurf. Zwei Quellen kämen in
 * Frage, und nur eine taugt als Balken:
 *
 *  - **`resources:progress`** liefert `loaded / total`. Klingt richtig, ist es
 *    aber nicht: `total` wächst, während geladen wird, weil jedes System seine
 *    Dateien erst anfordert, wenn es an der Reihe ist. Der Quotient springt
 *    dabei zurück — nach dem zweiten geladenen von zwei sind es 100 %, und der
 *    nächste Systemstart macht daraus 67 %. Ein Balken, der rückwärts läuft,
 *    ist schlimmer als gar keiner.
 *  - **`engine:loading`** zählt initialisierte Systeme. Deren Zahl steht beim
 *    Start fest, sie laufen der Reihe nach, und der Quotient ist damit echt und
 *    monoton.
 *
 * Also: Balken aus den Systemen, **Text** aus beidem — die Datei, die gerade
 * geladen wird, ist die interessantere Information, sie kann nur keinen Balken
 * tragen. Prozentzahl und Dateizahl stehen nebeneinander, statt eine aus der
 * anderen zu schätzen.
 *
 * ## Warum kein Balken für die Bytes
 *
 * Der ehrlichste Balken wäre „übertragene Bytes von insgesamt". Dafür müsste
 * die Gesamtgröße vorab bekannt sein — also ein erzeugtes Manifest, das bei
 * jeder Änderung an den Assets mitgezogen wird. Das gehört zu 7.5
 * (Auslieferung) und nicht hierher; solange es fehlt, wäre eine Byte-Anzeige
 * geraten, und geraten ist genau das, was der Plan ausschließt.
 */
export class LoadingScreen {
  readonly #root: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #stepLabel: HTMLElement;
  readonly #detail: HTMLElement;
  readonly #percent: HTMLElement;

  #done = false;
  #started = performance.now();
  /** Der Balken darf nie zurückspringen — auch nicht bei einem Fehler. */
  #highest = 0;

  constructor(bus: AppBus, container: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'loading';
    this.#root.innerHTML = `
      <div class="loading__box">
        <p class="loading__title">japanMap</p>
        <div class="loading__track"><div class="loading__bar"></div></div>
        <p class="loading__step"><span class="loading__stepText">Motor startet</span><span class="loading__percent">0 %</span></p>
        <p class="loading__detail">&nbsp;</p>
      </div>`;
    container.appendChild(this.#root);

    this.#bar = this.#must('.loading__bar');
    this.#stepLabel = this.#must('.loading__stepText');
    this.#detail = this.#must('.loading__detail');
    this.#percent = this.#must('.loading__percent');

    bus.on('engine:loading', ({ step, total, label }) => {
      this.#setProgress(step / total);
      this.#stepLabel.textContent = label;
    });

    bus.on('resources:progress', ({ loaded, total, url }) => {
      this.#detail.textContent = `${loaded} / ${total} Dateien · ${basename(url)}`;
    });

    bus.on('resources:error', ({ url }) => {
      // Nicht verschweigen. Ein fehlendes Asset endet sonst in einer Szene, in
      // der etwas fehlt, ohne dass jemand weiß, wo es abgeblieben ist.
      this.#detail.textContent = `konnte nicht geladen werden: ${basename(url)}`;
      this.#detail.classList.add('loading__detail--error');
    });

    bus.on('engine:warmedup', () => {
      this.finish();
    });
  }

  /**
   * Ausblenden und aus dem DOM nehmen.
   *
   * Erst nach dem Aufwärmframe: bis dahin steht im Canvas noch nichts, und ein
   * Ladebildschirm, der vor dem ersten Bild verschwindet, zeigt eine
   * Hintergrundfarbe.
   */
  finish(): void {
    if (this.#done) return;
    this.#done = true;
    this.#setProgress(1);
    this.#stepLabel.textContent = 'fertig';
    console.info(`Ladebildschirm: ${((performance.now() - this.#started) / 1000).toFixed(1)} s.`);

    this.#root.classList.add('loading--done');
    this.#root.addEventListener(
      'transitionend',
      () => {
        this.#root.remove();
      },
      { once: true },
    );
    // Rückfall, falls die Transition nicht feuert (reduzierte Bewegung, Tab im
    // Hintergrund). Ein Ladebildschirm, der liegen bleibt, verdeckt die Karte.
    setTimeout(() => {
      this.#root.remove();
    }, 1200);
  }

  dispose(): void {
    this.#root.remove();
    this.#done = true;
  }

  #setProgress(ratio: number): void {
    this.#highest = Math.max(this.#highest, Math.min(1, Math.max(0, ratio)));
    this.#bar.style.width = `${(this.#highest * 100).toFixed(1)}%`;
    this.#percent.textContent = `${Math.round(this.#highest * 100)} %`;
  }

  #must(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Ladebildschirm: "${selector}" fehlt.`);
    return element;
  }
}

function basename(url: string): string {
  return url.split('/').pop() ?? url;
}
