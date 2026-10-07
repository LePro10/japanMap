import './bayShutter.css';

/**
 * Das Rolltor der Open Bay — der Schnitt zwischen Welt und Garage.
 *
 * `TuningGarage` baut einen eigenen, geschlossenen Raum (`GarageStage`), und
 * bisher war der Wechsel dorthin ein harter Schnitt: eben noch Vorfeld, dann
 * Hebebühne. Ein Rolltor, das herunterfährt, **ist** der Schnitt — er wird zu
 * einem Ereignis in der Welt statt zu einem Ladebildschirm. Hinter dem
 * geschlossenen Tor darf dann alles passieren (Welt ausblenden, Kamera
 * setzen, Garage aufbauen), ohne dass es jemand sieht.
 *
 * DOM statt Geometrie: das Tor muss den **ganzen** Bildschirm schließen, auch
 * wenn die Kamera schräg steht, und es muss über der Garage-Oberfläche liegen,
 * die ebenfalls DOM ist.
 */
export class BayShutter {
  readonly #root = document.createElement('div');
  #timer = 0;

  constructor(container: HTMLElement) {
    this.#root.className = 'bay-shutter';
    this.#root.hidden = true;
    this.#root.setAttribute('aria-hidden', 'true');
    this.#root.innerHTML = `
      <div class="bay-shutter__door">
        <div class="bay-shutter__slats"></div>
        <div class="bay-shutter__plate">
          <span>オープンベイ</span>
          <strong>OPEN BAY</strong>
          <em>Bay 1 · Sakura Commons</em>
        </div>
        <div class="bay-shutter__hazard"></div>
      </div>`;
    container.append(this.#root);
  }

  /** Tor herunter. `done` läuft, wenn es unten ist. */
  close(done: () => void, ms = 620): void {
    window.clearTimeout(this.#timer);
    this.#root.hidden = false;
    this.#root.style.setProperty('--ms', `${ms}ms`);
    this.#root.classList.remove('is-down');
    void this.#root.offsetWidth;
    this.#root.classList.add('is-down');
    this.#timer = window.setTimeout(done, ms + 60);
  }

  /** Tor hoch. */
  open(delay = 120, ms = 900): void {
    window.clearTimeout(this.#timer);
    this.#root.style.setProperty('--ms', `${ms}ms`);
    this.#timer = window.setTimeout(() => {
      this.#root.classList.remove('is-down');
      this.#timer = window.setTimeout(() => {
        this.#root.hidden = true;
      }, ms + 60);
    }, delay);
  }

  get down(): boolean {
    return this.#root.classList.contains('is-down');
  }

  dispose(): void {
    window.clearTimeout(this.#timer);
    this.#root.remove();
  }
}
