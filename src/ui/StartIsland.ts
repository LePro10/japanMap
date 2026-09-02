import { WORLD } from '@/config/world.config';
import islandUrl from '../../assets/generated/terrain/navigation-map.webp?url';
import { START_ZONES } from './startCopy';
import { START_RING, START_UNLOCKS } from './startRing';

/**
 * Die lebende Insel auf dem Ladebildschirm.
 *
 * Der Hintergrund ist die gebackene Aerial-Karte (dieselbe Datei wie die
 * Navigationskarte). Darüber liegt die Ringstraße als Leuchtspur: der
 * Fortschritt **ist** die Position des Autos. Die Kamera startet weit oben
 * und geht in eine Verfolgeransicht über — das ist der Flug durch die Map,
 * ohne ein zweites Video, das den Startdownload sprengen würde.
 *
 * Fortschritt kommt von außen und ist monoton. Die Animation dazwischen
 * (Scan, Ken-Burns in der Totalen, Puls der Zonen) behauptet nichts über
 * den Stand; sie füllt nur die Zeit zwischen zwei echten Schritten.
 */

const RING_COUNT = START_RING.length / 2;
const GOLD = '#ffd257';
const TRAIL = '#7ee7ff';
const TRAIL_DIM = 'rgba(180, 198, 210, 0.28)';

export class StartIsland {
  readonly canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #image = new Image();
  #imageReady = false;
  #progress = 0;
  #ready = false;
  #gone = false;
  #raf = 0;
  #t0 = performance.now();
  #dpr = 1;
  #reduced: boolean;
  readonly #ro: ResizeObserver;
  #unlocked = new Set<string>();
  readonly #onUnlock: (id: string) => void;

  constructor(container: HTMLElement, onUnlock: (id: string) => void) {
    this.#onUnlock = onUnlock;
    this.#reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'start__island';
    canvas.setAttribute('aria-hidden', 'true');
    container.append(canvas);
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Startbildschirm: kein 2D-Kontext für die Insel.');
    this.#ctx = ctx;

    this.#image.decoding = 'async';
    this.#image.onload = () => {
      this.#imageReady = true;
      if (this.#reduced) this.#draw(0);
    };
    this.#image.src = islandUrl;

    this.#resize();
    this.#ro = new ResizeObserver(() => this.#onResize());
    this.#ro.observe(this.canvas);
    if (!this.#reduced) this.#raf = requestAnimationFrame(this.#tick);
    else this.#draw(0);
  }

  setProgress(ratio: number): void {
    this.#progress = Math.max(this.#progress, Math.min(1, ratio));
    for (const zone of START_ZONES) {
      const at = START_UNLOCKS[zone.id] ?? 1;
      if (this.#progress + 0.04 >= at && !this.#unlocked.has(zone.id)) {
        this.#unlocked.add(zone.id);
        this.#onUnlock(zone.id);
      }
    }
    if (this.#reduced) this.#draw(0);
  }

  setReady(): void {
    this.#ready = true;
    this.setProgress(1);
  }

  dispose(): void {
    this.#gone = true;
    cancelAnimationFrame(this.#raf);
    this.#ro.disconnect();
    this.canvas.remove();
  }

  readonly #onResize = (): void => {
    this.#resize();
    if (this.#reduced) this.#draw(0);
  };

  #resize(): void {
    const css = Math.max(160, Math.round(Math.min(this.canvas.clientWidth || 320, 720)));
    this.#dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(css * this.#dpr);
    this.canvas.height = Math.round(css * this.#dpr);
  }

  readonly #tick = (now: number): void => {
    if (this.#gone) return;
    this.#raf = requestAnimationFrame(this.#tick);
    this.#draw((now - this.#t0) / 1000);
  };

  #draw(time: number): void {
    const ctx = this.#ctx;
    const size = this.canvas.width;
    if (size < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const pose = poseOnRing(this.#progress);
    const follow = this.#ready ? 1 : smoothstep(0.32, 0.82, this.#progress);
    const idleX = 0.5 + 0.018 * Math.sin(time * 0.11);
    const idleY = 0.48 + 0.014 * Math.cos(time * 0.09);
    const car = worldToUnit(pose.x, pose.z);
    const zoom = lerp(1.02, this.#ready ? 2.7 : 2.15, follow);
    const cx = lerp(idleX, car.x, follow);
    const cy = lerp(idleY, car.y, follow);
    const view = { cx, cy, zoom, size };

    ctx.save();
    roundClip(ctx, size, size * 0.028);

    if (this.#imageReady) {
      const img = this.#image;
      const srcW = img.width / zoom;
      const srcH = img.height / zoom;
      const srcX = clamp((cx - 0.5 / zoom) * img.width, 0, Math.max(0, img.width - srcW));
      const srcY = clamp((cy - 0.5 / zoom) * img.height, 0, Math.max(0, img.height - srcH));
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#081418';
      ctx.fillRect(0, 0, size, size);
    }

    // Nacht über der Aerial — hebt die Leuchtspur, ohne die Form zu fressen.
    ctx.fillStyle = `rgba(4, 10, 16, ${lerp(0.42, 0.18, this.#progress)})`;
    ctx.fillRect(0, 0, size, size);

    this.#drawRing(ctx, view, this.#progress);
    this.#drawZones(ctx, view, time);
    this.#drawScan(ctx, view, time);
    this.#drawCar(ctx, view, pose);

    ctx.restore();
    this.#drawBezel(ctx, size);
  }

  #drawRing(ctx: CanvasRenderingContext2D, view: View, progress: number): void {
    const drawn = Math.max(2, Math.floor(progress * (RING_COUNT - 1)));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < RING_COUNT; i++) {
      const p = project(START_RING[i * 2]!, START_RING[i * 2 + 1]!, view);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = TRAIL_DIM;
    ctx.lineWidth = Math.max(1.2, view.size * 0.0045);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= drawn; i++) {
      const p = project(START_RING[i * 2]!, START_RING[i * 2 + 1]!, view);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = TRAIL;
    ctx.shadowColor = 'rgba(110, 220, 255, 0.85)';
    ctx.shadowBlur = view.size * 0.018;
    ctx.lineWidth = Math.max(2.2, view.size * 0.009);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  #drawZones(ctx: CanvasRenderingContext2D, view: View, time: number): void {
    for (const zone of START_ZONES) {
      const on = this.#unlocked.has(zone.id);
      const p = project(zone.x, zone.z, view);
      const pulse = on ? 0.55 + 0.45 * Math.sin(time * 3 + p.x) : 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, view.size * (on ? 0.018 : 0.011), 0, Math.PI * 2);
      ctx.fillStyle = on ? `rgba(255, 210, 87, ${0.35 + 0.35 * pulse})` : 'rgba(220, 230, 240, 0.22)';
      ctx.fill();
      if (on) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, view.size * (0.028 + 0.01 * pulse), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 210, 87, ${0.45 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  #drawScan(ctx: CanvasRenderingContext2D, view: View, time: number): void {
    if (this.#reduced || this.#ready) return;
    const angle = time * 0.7;
    const origin = project(0, 0, view);
    const reach = view.size * 0.72;
    const gradient = ctx.createLinearGradient(
      origin.x,
      origin.y,
      origin.x + Math.sin(angle) * reach,
      origin.y + Math.cos(angle) * reach,
    );
    gradient.addColorStop(0, 'rgba(126, 231, 255, 0)');
    gradient.addColorStop(0.7, 'rgba(126, 231, 255, 0.07)');
    gradient.addColorStop(1, 'rgba(126, 231, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, reach, angle - 0.32, angle + 0.02);
    ctx.closePath();
    ctx.fill();
  }

  #drawCar(ctx: CanvasRenderingContext2D, view: View, pose: Pose): void {
    const p = project(pose.x, pose.z, view);
    const len = view.size * 0.028;
    const wid = view.size * 0.016;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(pose.heading);
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = view.size * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(wid, len * 0.7);
    ctx.lineTo(0, len * 0.35);
    ctx.lineTo(-wid, len * 0.7);
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.restore();
  }

  #drawBezel(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 236, 244, 0.22)';
    ctx.lineWidth = Math.max(2, size * 0.008);
    roundRectPath(ctx, 1.5, 1.5, size - 3, size - 3, size * 0.028);
    ctx.stroke();
    ctx.restore();
  }
}

interface View {
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
  readonly size: number;
}

interface Pose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

function poseOnRing(t: number): Pose {
  const clamped = Math.min(0.999, Math.max(0, t));
  const f = clamped * (RING_COUNT - 1);
  const i = Math.floor(f);
  const a = f - i;
  const x0 = START_RING[i * 2]!;
  const z0 = START_RING[i * 2 + 1]!;
  const x1 = START_RING[(i + 1) * 2]!;
  const z1 = START_RING[(i + 1) * 2 + 1]!;
  const x = x0 + (x1 - x0) * a;
  const z = z0 + (z1 - z0) * a;
  // Canvas: −Y ist Norden (−Z). Winkel von „oben“ zur Fahrtrichtung (dx, dz).
  return { x, z, heading: Math.atan2(x1 - x0, -(z1 - z0)) };
}

function worldToUnit(x: number, z: number): { x: number; y: number } {
  return {
    x: x / WORLD.size + 0.5,
    y: z / WORLD.size + 0.5,
  };
}

function project(x: number, z: number, view: View): { x: number; y: number } {
  const u = worldToUnit(x, z);
  return {
    x: (u.x - (view.cx - 0.5 / view.zoom)) * view.zoom * view.size,
    y: (u.y - (view.cy - 0.5 / view.zoom)) * view.zoom * view.size,
  };
}

function roundClip(ctx: CanvasRenderingContext2D, size: number, radius: number): void {
  roundRectPath(ctx, 0, 0, size, size, radius);
  ctx.clip();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
