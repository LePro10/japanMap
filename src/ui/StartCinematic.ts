/**
 * Trailer-Schicht des Ladebildschirms.
 *
 * Das Video **ist** die Welt — vollflächig, Ken-Burns aus echten Shots.
 * Stills werden nur geladen, wenn das Video ausfällt (Chromebook ohne Decoder,
 * `prefers-reduced-motion`). Drei NPC-Karosserien kreuzen den Shot, damit der
 * Trailer nicht wie eine Postkarte wirkt.
 */
const base = import.meta.env.BASE_URL;
const POSTER = `${base}start/drive.webp`;
const TRAILER = `${base}start/trailer.mp4`;

const SHOTS = [
  { src: `${base}start/aerial.webp`, until: 0.22 },
  { src: `${base}start/toge.webp`, until: 0.44 },
  { src: `${base}start/city.webp`, until: 0.72 },
  { src: POSTER, until: 1.01 },
] as const;

const NPCS = [
  { name: 'Aoki', color: '#c8102e', delay: '0s', duration: '5.1s', bottom: '30%' },
  { name: 'Kurose', color: '#1e8fd5', delay: '1.7s', duration: '6.4s', bottom: '36%' },
  { name: 'Takami', color: '#e0b400', delay: '3.4s', duration: '4.6s', bottom: '24%' },
] as const;

export class StartCinematic {
  readonly #root: HTMLElement;
  readonly #video: HTMLVideoElement;
  readonly #poster: HTMLImageElement;
  readonly #shots: HTMLImageElement[] = [];
  #active = 0;
  #reduced: boolean;
  #gone = false;
  #tries = 0;
  #usingVideo = false;
  #fallback = false;

  constructor(container: HTMLElement) {
    this.#reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.#root = document.createElement('div');
    this.#root.className = 'start__cine';
    this.#root.setAttribute('aria-hidden', 'true');

    this.#video = document.createElement('video');
    this.#video.className = 'start__video';
    this.#video.muted = true;
    this.#video.defaultMuted = true;
    this.#video.loop = true;
    this.#video.playsInline = true;
    this.#video.autoplay = !this.#reduced;
    this.#video.preload = this.#reduced ? 'none' : 'auto';
    this.#video.poster = POSTER;
    this.#video.setAttribute('disablepictureinpicture', '');
    this.#video.src = TRAILER;
    this.#video.addEventListener('playing', this.#onPlaying);
    this.#video.addEventListener('error', this.#onError);
    this.#root.append(this.#video);

    this.#poster = document.createElement('img');
    this.#poster.className = 'start__shot is-on';
    this.#poster.alt = '';
    this.#poster.decoding = 'async';
    this.#poster.loading = 'eager';
    this.#poster.src = POSTER;
    this.#root.append(this.#poster);

    container.prepend(this.#root);

    if (!this.#reduced) {
      const lane = document.createElement('div');
      lane.className = 'start__lane';
      for (const npc of NPCS) {
        const car = document.createElement('span');
        car.className = 'start__npc';
        car.style.setProperty('--c', npc.color);
        car.style.setProperty('--d', npc.delay);
        car.style.setProperty('--dur', npc.duration);
        car.style.bottom = npc.bottom;
        car.title = npc.name;
        lane.append(car);
      }
      container.append(lane);

      const speed = document.createElement('div');
      speed.className = 'start__speed';
      container.append(speed);
    }
    if (!this.#reduced) this.#kick();
  }

  setProgress(ratio: number): void {
    if (this.#usingVideo || this.#shots.length === 0) return;
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
    this.#gone = true;
    this.#video.removeEventListener('playing', this.#onPlaying);
    this.#video.removeEventListener('error', this.#onError);
    this.#video.pause();
    this.#video.removeAttribute('src');
    this.#video.load();
    this.#root.remove();
  }

  readonly #onPlaying = (): void => {
    this.#usingVideo = true;
    this.#root.classList.add('start__cine--video');
  };

  readonly #onError = (): void => {
    this.#fallbackStills();
  };

  readonly #kick = (): void => {
    if (this.#gone || this.#usingVideo) return;
    void this.#video.play().then(this.#onPlaying).catch(() => {
      this.#tries += 1;
      if (this.#tries < 10) setTimeout(this.#kick, 280);
      else this.#fallbackStills();
    });
  };

  #fallbackStills(): void {
    if (this.#fallback || this.#gone || this.#usingVideo) return;
    this.#fallback = true;
    this.#poster.remove();
    for (const [i, shot] of SHOTS.entries()) {
      const img = document.createElement('img');
      img.className = 'start__shot';
      img.alt = '';
      img.decoding = 'async';
      img.src = shot.src;
      if (i === 0) img.classList.add('is-on');
      img.style.animationDelay = `${-i * 2.6}s`;
      this.#shots.push(img);
      this.#root.append(img);
    }
  }
}
