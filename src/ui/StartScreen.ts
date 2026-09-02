import type { AppBus } from '@/core/events';
import { TOUCH_CONTROLS, controlTable, hasTouch } from './controls';
import { StartCinematic } from './StartCinematic';
import { StartIsland } from './StartIsland';
import { START_ZONES, startStepLabel } from './startCopy';

/**
 * Ladebildschirm **und** Startbildschirm — PLAN.md P7 / 7.3, umgebaut in P13,
 * visuell neu in dieser Runde.
 *
 * ## Was sich nicht geändert hat
 *
 * Der Fortschritt kommt weiter aus `engine:loading` und ist monoton. Ein Balken
 * aus `resources:progress` würde rückwärts laufen, sobald das nächste System
 * Dateien anfordert — die Begründung steht seit P7.3 in dieser Datei und gilt.
 * Der „Play"-Knopf bleibt die Nutzergeste für `requestPointerLock`.
 *
 * ## Was neu ist
 *
 * Der Ladebildschirm ist kein zentrierter Kasten mehr. Unten liegt ein Trailer
 * aus echten Shots der Karte (Ken-Burns, optional das gebackene Video). Darüber
 * fliegt die Aerial-Insel: die Ringstraße leuchtet mit dem Fortschritt, das Auto
 * *ist* der Prozentwert. Dateinamen gehören nicht auf diesen Bildschirm — sie
 * sind für uns, nicht für den ersten Frame auf CrazyGames.
 */
export class StartScreen {
  readonly #root: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #stepLabel: HTMLElement;
  readonly #percent: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #cinematic: StartCinematic;
  readonly #island: StartIsland;

  #ready = false;
  #gone = false;
  #started = performance.now();
  /** Der Balken darf nie zurückspringen — auch nicht bei einem Fehler. */
  #highest = 0;

  #onStart: (() => void) | null = null;
  /**
   * Wurde der Knopf gedrückt, bevor jemand zugehört hat?
   *
   * Der Startbildschirm entsteht **vor** `Engine.init()` — er soll ja den
   * Fortschritt von Anfang an zeigen —, sein Abnehmer (`PlayerUi`) aber erst
   * danach. Dazwischen liegt der Aufwärmframe, und der sendet `engine:warmedup`
   * noch **innerhalb** von `Engine.start()`: der Knopf steht also einen
   * Wimpernschlag lang da, ohne dass ein Handler hängt. Statt den Knopf
   * abzuschalten (und damit einen Zustand mehr zu haben) wird der Druck
   * gemerkt und nachgeholt.
   */
  #pending = false;

  constructor(bus: AppBus, container: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'start';
    this.#root.dataset.phase = 'laden';

    const touch = hasTouch();
    this.#root.innerHTML = `
      <div class="start__veil"></div>
      <div class="start__grain"></div>

      <header class="start__brand">
        <p class="start__eyebrow">Blue hour · 9.4 km²</p>
        <h1 class="start__title">japanMap</h1>
      </header>

      <ul class="start__zones" aria-hidden="true">
        ${START_ZONES.map((zone) => `<li data-zone="${zone.id}">${zone.label}</li>`).join('')}
      </ul>

      <div class="start__progress">
        <p class="start__percent">
          <span class="start__percentNum">0</span><span class="start__percentMark">%</span>
        </p>
        <p class="start__step">
          <span class="start__stepText">Starting engine</span>
        </p>
        <p class="start__detail" hidden></p>
        <div class="start__track"><div class="start__bar"></div></div>
      </div>

      <div class="start__ready">
        <button type="button" class="start__button">Play</button>
        <p class="start__hint">F get in the car · W A S D drive · Space handbrake</p>
        <div class="start__keys">
          ${touch ? controlTable(TOUCH_CONTROLS, 'keytable') : ''}
        </div>
      </div>`;
    container.appendChild(this.#root);
    document.getElementById('boot')?.remove();

    this.#cinematic = new StartCinematic(this.#root);
    this.#island = new StartIsland(this.#root, (id) => {
      this.#root.querySelector(`[data-zone="${id}"]`)?.classList.add('is-on');
    });

    this.#bar = this.#must('.start__bar');
    this.#stepLabel = this.#must('.start__stepText');
    this.#percent = this.#must('.start__percentNum');
    this.#button = this.#must('.start__button') as HTMLButtonElement;

    this.#button.addEventListener('click', this.#onClick);

    bus.on('engine:loading', ({ step, total, label }) => {
      this.#setProgress(step / total);
      this.#stepLabel.textContent = startStepLabel(label);
    });

    bus.on('resources:error', ({ url }) => {
      const detail = this.#must('.start__detail');
      detail.hidden = false;
      detail.textContent = `could not load ${basename(url)}`;
      detail.classList.add('start__detail--error');
    });

    bus.on('engine:warmedup', () => {
      this.ready();
    });
  }

  /**
   * Wer auf „Play" reagiert.
   *
   * Der Handler läuft **synchron im Klick-Ereignis** — das ist Bedingung, nicht
   * Stilfrage: `requestPointerLock()` verlangt eine Nutzergeste, und die ist
   * nach dem ersten `await` verbraucht.
   */
  onStart(handler: () => void): void {
    this.#onStart = handler;
    if (this.#pending) {
      this.#pending = false;
      handler();
      this.#leave();
    }
  }

  /**
   * Fertig geladen: aus dem Ladebildschirm wird der Startbildschirm.
   *
   * Erst nach dem Aufwärmframe, sonst steht im Canvas hinter der halb
   * durchsichtigen Fläche noch nichts — und ein Startbildschirm, der auf eine
   * Hintergrundfarbe blendet, sieht aus wie ein Fehler.
   */
  ready(): void {
    if (this.#ready) return;
    this.#ready = true;
    this.#setProgress(1);
    this.#stepLabel.textContent = startStepLabel('fertig');
    this.#island.setReady();
    console.info(`Ladebildschirm: ${((performance.now() - this.#started) / 1000).toFixed(1)} s.`);

    this.#root.dataset.phase = 'bereit';
    this.#button.focus();
  }

  dispose(): void {
    this.#button.removeEventListener('click', this.#onClick);
    this.#cinematic.dispose();
    this.#island.dispose();
    this.#root.remove();
    this.#gone = true;
    this.#ready = true;
  }

  readonly #onClick = (): void => {
    if (this.#gone) return;
    if (!this.#onStart) {
      this.#pending = true;
      return;
    }
    this.#onStart();
    this.#leave();
  };

  /**
   * Ausblenden und aus dem DOM nehmen.
   *
   * Das Entfernen hängt an der Transition **und** an einer Zeitschranke: bei
   * `prefers-reduced-motion` oder in einem Hintergrund-Tab feuert
   * `transitionend` nicht, und eine liegengebliebene Fläche verdeckt die Karte.
   */
  #leave(): void {
    if (this.#gone) return;
    this.#gone = true;
    this.#root.classList.add('start--done');
    this.#root.addEventListener(
      'transitionend',
      () => {
        this.#cinematic.dispose();
        this.#island.dispose();
        this.#root.remove();
      },
      { once: true },
    );
    setTimeout(() => {
      this.#cinematic.dispose();
      this.#island.dispose();
      this.#root.remove();
    }, 700);
  }

  #setProgress(ratio: number): void {
    this.#highest = Math.max(this.#highest, Math.min(1, Math.max(0, ratio)));
    this.#bar.style.width = `${(this.#highest * 100).toFixed(1)}%`;
    this.#percent.textContent = `${Math.round(this.#highest * 100)}`;
    this.#cinematic.setProgress(this.#highest);
    this.#island.setProgress(this.#highest);
  }

  #must(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Startbildschirm: "${selector}" fehlt.`);
    return element;
  }
}

function basename(url: string): string {
  return url.split('/').pop() ?? url;
}
