/**
 * Hintergrund des Ladebildschirms: vier echte Shots der Karte.
 *
 * Kein Video im Startdownload — das hat den Start verlangsamt und blieb auf
 * einem Poster kleben. Die Bilder wechseln mit dem Fortschritt, und zusätzlich
 * alle 1,4 s, damit ein langer Download nicht auf Aerial sitzen bleibt.
 */
const base = import.meta.env.BASE_URL;

const SHOTS = [
  { src: `${base}start/aerial.webp`, until: 0.28 },
  { src: `${base}start/toge.webp`, until: 0.52 },
  { src: `${base}start/city.webp`, until: 0.76 },
  { src: `${base}start/drive.webp`, until: 1.01 },
] as const;

const SHOT_MS = 1400;

export class StartCinematic {
  readonly #root: HTMLElement;
  readonly #shots: HTMLImageElement[] = [];
  #active = 0;
  #progress = 0;
  #gone = false;
  #t0 = performance.now();
  #timer = 0;
  #reduced: boolean;

  constructor(container: HTMLElement) {
    this.#reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.#root = document.createElement('div');
    this.#root.className = 'start__cine';
    this.#root.setAttribute('aria-hidden', 'true');

    for (const [i, shot] of SHOTS.entries()) {
      const img = document.createElement('img');
      img.className = 'start__shot';
      img.alt = '';
      img.decoding = 'async';
      img.src = shot.src;
      img.loading = i === 0 ? 'eager' : 'lazy';
      if (i === 0) img.classList.add('is-on');
      this.#shots.push(img);
      this.#root.append(img);
    }

    container.prepend(this.#root);
    if (!this.#reduced) this.#timer = window.setInterval(this.#tick, 250);
  }

  setProgress(ratio: number): void {
    this.#progress = Math.max(this.#progress, Math.min(1, ratio));
    this.#apply();
  }

  dispose(): void {
    this.#gone = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#root.remove();
  }

  readonly #tick = (): void => {
    if (!this.#gone) this.#apply();
  };

  #apply(): void {
    let byProgress = 0;
    for (const [i, shot] of SHOTS.entries()) {
      if (this.#progress < shot.until) {
        byProgress = i;
        break;
      }
    }
    const elapsed = performance.now() - this.#t0;
    const byTime = this.#reduced ? 0 : Math.floor(elapsed / SHOT_MS) % SHOTS.length;
    const index = Math.max(byProgress, byTime);
    if (index === this.#active) return;
    this.#shots[this.#active]?.classList.remove('is-on');
    this.#shots[index]?.classList.add('is-on');
    this.#active = index;
  }
}
