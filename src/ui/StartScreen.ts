import type { AppBus } from '@/core/events';
import { CONTROLS, TOUCH_CONTROLS, controlTable, hasTouch } from './controls';

/**
 * Ladebildschirm **und** Startbildschirm — PLAN.md P7 / 7.3, umgebaut in P13.
 *
 * ## Was sich gegenüber `LoadingScreen` geändert hat, und warum
 *
 * Bis P13 verschwand diese Fläche von selbst, sobald der Aufwärmframe durch war,
 * und übergab an einen zentrierten Kasten mit der Aufschrift „Klick ins Bild".
 * Das war ein Zustand zu viel: der Kasten lag im fertigen Bild, sah aus wie ein
 * Menü und verlangte eine Geste, die der Ladebildschirm ohnehin schon hätte
 * einsammeln können. Jetzt endet der Ladevorgang in einem **Knopf**.
 *
 * Der Knopf ist nicht Kosmetik, er löst ein echtes Problem: `requestPointerLock`
 * verlangt eine Nutzergeste. Solange die Geste ein Klick irgendwohin ins Bild
 * war, musste die Anwendung erklären, wohin zu klicken ist — und der erklärende
 * Kasten durfte den Klick dann nicht selbst verschlucken (siehe die Notiz zu
 * `#overlay > .hint` in `style.css`, gefunden mit `getComputedStyle`). Ein Knopf
 * *ist* das Ziel des Klicks; die Frage stellt sich nicht mehr.
 *
 * ## „Echter Fortschritt, keine gefälschte Animation"
 *
 * Das ist die Vorgabe aus P7.3 und gilt unverändert. Zwei Quellen kämen in
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
 * tragen.
 *
 * ## Warum kein Balken für die Bytes
 *
 * Der ehrlichste Balken wäre „übertragene Bytes von insgesamt". Dafür müsste
 * die Gesamtgröße vorab bekannt sein — also ein erzeugtes Manifest, das bei
 * jeder Änderung an den Assets mitgezogen wird. Das gehört zu 7.5
 * (Auslieferung) und nicht hierher; solange es fehlt, wäre eine Byte-Anzeige
 * geraten, und geraten ist genau das, was der Plan ausschließt.
 */
export class StartScreen {
  readonly #root: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #stepLabel: HTMLElement;
  readonly #detail: HTMLElement;
  readonly #percent: HTMLElement;
  readonly #button: HTMLButtonElement;

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
      <div class="start__box">
        <p class="start__title">japanMap</p>
        <p class="start__subtitle">Drift, race and jump across 9.4 km² of rural Japan</p>

        <div class="start__progress">
          <div class="start__track"><div class="start__bar"></div></div>
          <p class="start__step">
            <span class="start__stepText">Starting engine</span>
            <span class="start__percent">0 %</span>
          </p>
          <p class="start__detail">&nbsp;</p>
        </div>

        <div class="start__ready">
          <button type="button" class="start__button">Play</button>
          <div class="start__keys">
            ${touch ? controlTable(TOUCH_CONTROLS, 'keytable') : ''}
            ${controlTable(CONTROLS, 'keytable')}
          </div>
        </div>
      </div>`;
    container.appendChild(this.#root);

    this.#bar = this.#must('.start__bar');
    this.#stepLabel = this.#must('.start__stepText');
    this.#detail = this.#must('.start__detail');
    this.#percent = this.#must('.start__percent');
    this.#button = this.#must('.start__button') as HTMLButtonElement;

    this.#button.addEventListener('click', this.#onClick);

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
      this.#detail.classList.add('start__detail--error');
    });

    bus.on('engine:warmedup', () => {
      this.ready();
    });
  }

  /**
   * Wer auf „Starten" reagiert.
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
    this.#stepLabel.textContent = 'fertig';
    console.info(`Ladebildschirm: ${((performance.now() - this.#started) / 1000).toFixed(1)} s.`);

    this.#root.dataset.phase = 'bereit';
    // Damit Leertaste und Eingabetaste den Knopf bedienen, ohne dass jemand ihn
    // erst mit der Maus sucht.
    this.#button.focus();
  }

  dispose(): void {
    this.#button.removeEventListener('click', this.#onClick);
    this.#root.remove();
    this.#gone = true;
    this.#ready = true;
  }

  // ── Intern ─────────────────────────────────────────────────────────────

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
        this.#root.remove();
      },
      { once: true },
    );
    setTimeout(() => {
      this.#root.remove();
    }, 600);
  }

  #setProgress(ratio: number): void {
    this.#highest = Math.max(this.#highest, Math.min(1, Math.max(0, ratio)));
    this.#bar.style.width = `${(this.#highest * 100).toFixed(1)}%`;
    this.#percent.textContent = `${Math.round(this.#highest * 100)} %`;
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
