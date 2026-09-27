import { hasTouch } from '../controls';
import './introOverlay.css';

/**
 * Die Oberfläche des Intros — Letterbox, Titelkarte, Tastenhinweis, Ziel.
 *
 * Reines DOM, keine Logik: was wann erscheint, entscheidet `FirstDrive`.
 * Getrennt, weil die Oberfläche strukturell geprüft wird (CLAUDE.md, „Die
 * Oberfläche prüfen") und der Ablauf an der Physik — zwei Prüfwege, zwei
 * Dateien.
 *
 * Ein Hinweis trägt **eine** Aktion. Das ist die ganze Didaktik: wer „W, Shift
 * und Space" in einem Kasten liest, liest keinen davon.
 */
export interface IntroKey {
  /** Tastatur. */
  readonly key: string;
  /** Finger — der Name des Knopfs im Bedienfeld. */
  readonly touch: string;
}

export class IntroOverlay {
  readonly root = document.createElement('div');
  readonly #prompt: HTMLElement;
  readonly #keys: HTMLElement;
  readonly #label: HTMLElement;
  readonly #hint: HTMLElement;
  readonly #toast: HTMLElement;
  readonly #objective: HTMLElement;
  readonly #objTitle: HTMLElement;
  readonly #objMeta: HTMLElement;
  readonly #steps: HTMLElement;
  readonly #skipRing: HTMLElement;
  readonly #touch = hasTouch();
  #toastTimer = 0;

  constructor(container: HTMLElement, onSkip: () => void) {
    this.root.className = 'intro';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `
      <div class="intro__bar intro__bar--top" aria-hidden="true"></div>
      <div class="intro__bar intro__bar--bottom" aria-hidden="true"></div>
      <div class="intro__slow" aria-hidden="true"><span>Slow motion</span></div>
      <div class="intro__title">
        <p class="intro__kicker">First drive · Blue hour</p>
        <h1>japanMap</h1>
        <p class="intro__sub">An island, a car and a road to the sea.</p>
      </div>
      <div class="intro__prompt" hidden>
        <div class="intro__keys"></div>
        <p class="intro__label"></p>
        <p class="intro__hint"></p>
      </div>
      <p class="intro__toast" hidden></p>
      <div class="intro__objective" hidden>
        <span>Objective</span>
        <strong></strong>
        <em></em>
      </div>
      <ol class="intro__steps" aria-label="Intro progress">
        <li>Drive</li><li>Nitro</li><li>Jump</li><li>Drift</li><li>Home</li>
      </ol>
      <button type="button" class="intro__skip">
        ${this.#touch ? '' : '<kbd>Tab</kbd>'} ${this.#touch ? 'Skip intro' : 'hold to skip'}
        <i class="intro__skipRing" aria-hidden="true"></i>
      </button>`;
    container.append(this.root);
    const q = <T extends HTMLElement>(s: string): T => {
      const el = this.root.querySelector<T>(s);
      if (!el) throw new Error(`Intro: „${s}" fehlt.`);
      return el;
    };
    this.#prompt = q('.intro__prompt');
    this.#keys = q('.intro__keys');
    this.#label = q('.intro__label');
    this.#hint = q('.intro__hint');
    this.#toast = q('.intro__toast');
    this.#objective = q('.intro__objective');
    this.#objTitle = q('.intro__objective strong');
    this.#objMeta = q('.intro__objective em');
    this.#steps = q('.intro__steps');
    this.#skipRing = q('.intro__skipRing');
    q<HTMLButtonElement>('.intro__skip').onclick = () => onSkip();
  }

  get touch(): boolean {
    return this.#touch;
  }

  show(): void {
    this.root.hidden = false;
    document.body.classList.add('intro-running');
    // Ein Frame Abstand, sonst sieht die Transition den Anfangszustand nicht.
    requestAnimationFrame(() => this.root.classList.add('is-on'));
  }

  hide(): void {
    this.root.classList.remove('is-on', 'is-cinema', 'is-slow', 'is-title');
    document.body.classList.remove('intro-running', 'intro-cinema');
    this.prompt(null);
    this.objective(null);
    window.setTimeout(() => {
      if (!this.root.classList.contains('is-on')) this.root.hidden = true;
    }, 700);
  }

  /** Letterbox und ausgeblendetes HUD — für Titel und Absprung. */
  cinema(on: boolean): void {
    this.root.classList.toggle('is-cinema', on);
    document.body.classList.toggle('intro-cinema', on);
  }

  title(on: boolean): void {
    this.root.classList.toggle('is-title', on);
  }

  slow(on: boolean): void {
    this.root.classList.toggle('is-slow', on);
  }

  /** Welcher Schritt der fünf gerade läuft (0…4), −1 = keiner. */
  step(index: number): void {
    this.#steps.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('is-done', i < index);
      li.classList.toggle('is-now', i === index);
    });
  }

  /**
   * Der Tastenhinweis. `null` blendet ihn aus.
   *
   * `big` ist für den einen Moment, in dem die Welt stillsteht (Zeitlupe):
   * dort darf der Hinweis das Bild beherrschen, sonst sitzt er unten.
   */
  prompt(
    next: { keys: readonly IntroKey[]; label: string; hint?: string; big?: boolean; times?: number } | null,
  ): void {
    if (!next) {
      this.#prompt.classList.remove('is-shown');
      this.#prompt.dataset.key = '';
      window.setTimeout(() => {
        if (!this.#prompt.classList.contains('is-shown')) this.#prompt.hidden = true;
      }, 260);
      return;
    }
    const id = next.keys.map((k) => k.key).join('+') + next.label;
    if (this.#prompt.dataset.key === id && !this.#prompt.hidden) return;
    this.#prompt.dataset.key = id;
    this.#keys.innerHTML =
      next.keys
        .map((k) => `<kbd class="intro__key${(this.#touch ? k.touch : k.key).length > 3 ? ' intro__key--wide' : ''}">${this.#touch ? k.touch : k.key}</kbd>`)
        .join('<span class="intro__plus">+</span>') +
      (next.times ? `<span class="intro__times">×${next.times}</span>` : '');
    this.#label.textContent = next.label;
    this.#hint.textContent = next.hint ?? '';
    this.#hint.hidden = !next.hint;
    this.#prompt.classList.toggle('is-big', next.big === true);
    this.#prompt.hidden = false;
    this.#prompt.classList.remove('is-shown', 'is-hit');
    void this.#prompt.offsetWidth;
    this.#prompt.classList.add('is-shown');
  }

  /** Der Hinweis wurde befolgt — kurzes Aufleuchten, dann weg. */
  hit(): void {
    this.#prompt.classList.add('is-hit');
    window.setTimeout(() => this.prompt(null), 380);
  }

  toast(text: string, gold = false): void {
    this.#toast.textContent = text;
    this.#toast.classList.toggle('is-gold', gold);
    this.#toast.hidden = false;
    this.#toast.classList.remove('is-shown');
    void this.#toast.offsetWidth;
    this.#toast.classList.add('is-shown');
    window.clearTimeout(this.#toastTimer);
    this.#toastTimer = window.setTimeout(() => {
      this.#toast.hidden = true;
    }, 2200);
  }

  objective(next: { title: string; meta: string } | null): void {
    this.#objective.hidden = !next;
    if (!next) return;
    this.#objTitle.textContent = next.title;
    this.#objMeta.textContent = next.meta;
  }

  /** 0…1 — Fortschritt des gehaltenen Tab. */
  skipProgress(ratio: number): void {
    this.#skipRing.style.setProperty('--p', `${Math.round(ratio * 100)}%`);
  }

  dispose(): void {
    window.clearTimeout(this.#toastTimer);
    document.body.classList.remove('intro-running', 'intro-cinema');
    this.root.remove();
  }
}
