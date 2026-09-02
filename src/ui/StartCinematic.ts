/**
 * Trailer-Schicht des Ladebildschirms.
 *
 * Ein Ken-Burns-Loop aus echten Shots der Karte, und — wenn vorhanden — das
 * gebackene `trailer.mp4` darunter. Beides ist derselbe Inhalt (Pass, Stadt,
 * Ring), nur einmal als Video und einmal als Fallback, das auf einem
 * Chromebook ohne Video-Decoder und bei `prefers-reduced-motion` noch steht.
 *
 * Welches Still oben liegt, hängt am echten Lade-Fortschritt: die Insel
 * „schaltet" Zonen durch, statt eine Timeline abzuspielen, die länger wäre
 * als der Download.
 */
const base = import.meta.env.BASE_URL;

const SHOTS = [
  { src: `${base}start/aerial.webp`, until: 0.22 },
  { src: `${base}start/toge.webp`, until: 0.44 },
  { src: `${base}start/torii.webp`, until: 0.58 },
  { src: `${base}start/city.webp`, until: 0.78 },
  { src: `${base}start/drive.webp`, until: 1.01 },
] as const;

const TRAILER = `${base}start/trailer.mp4`;

export class StartCinematic {
  readonly #root: HTMLElement;
  readonly #shots: HTMLImageElement[] = [];
  readonly #video: HTMLVideoElement;
  #active = 0;
  #reduced: boolean;

  constructor(container: HTMLElement) {
    this.#reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.#root = document.createElement('div');
    this.#root.className = 'start__cine';
    this.#root.setAttribute('aria-hidden', 'true');

    this.#video = document.createElement('video');
    this.#video.className = 'start__video';
    this.#video.muted = true;
    this.#video.loop = true;
    this.#video.playsInline = true;
    this.#video.autoplay = !this.#reduced;
    this.#video.preload = 'auto';
    this.#video.poster = SHOTS[0].src;
    this.#video.setAttribute('disablepictureinpicture', '');
    const source = document.createElement('source');
    source.src = TRAILER;
    source.type = 'video/mp4';
    this.#video.append(source);
    this.#video.addEventListener('playing', () => {
      this.#root.classList.add('start__cine--video');
    });
    this.#root.append(this.#video);

    for (const [i, shot] of SHOTS.entries()) {
      const img = document.createElement('img');
      img.className = 'start__shot';
      img.alt = '';
      img.decoding = 'async';
      img.src = shot.src;
      if (i === 0) {
        img.loading = 'eager';
        img.classList.add('is-on');
      } else {
        img.loading = 'lazy';
      }
      img.style.animationDelay = `${-i * 3.4}s`;
      this.#shots.push(img);
      this.#root.append(img);
    }

    container.prepend(this.#root);
    if (!this.#reduced) void this.#video.play().catch(() => undefined);
  }

  setProgress(ratio: number): void {
    let index = 0;
    for (const [i, shot] of SHOTS.entries()) {
      if (ratio < shot.until) {
        index = i;
        break;
      }
    }
    if (index === this.#active) return;
    this.#shots[this.#active]?.classList.remove('is-on');
    this.#shots[index]?.classList.add('is-on');
    this.#active = index;
  }

  dispose(): void {
    this.#video.pause();
    this.#video.removeAttribute('src');
    this.#video.load();
    this.#root.remove();
  }
}
