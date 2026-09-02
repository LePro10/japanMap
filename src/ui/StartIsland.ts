import { WORLD } from '@/config/world.config';
import islandUrl from '../../assets/generated/terrain/navigation-map.webp?url';
import { START_ZONES } from './startCopy';
import { START_RING, START_UNLOCKS } from './startRing';

/**
 * Radar-HUD auf dem Ladebildschirm — nicht die Hauptfläche.
 *
 * Das Video trägt die Immersion. Hier liegt nur die Ringstraße als GPS:
 * der Spieler folgt dem echten Fortschritt, drei NPCs (Aoki, Kurose, Takami)
 * fahren **auf der Zeit**, damit das Pack lebt, auch wenn der Balken steht.
 *
 * Gezeichnet mit 30 Hz, ohne `shadowBlur` an den NPCs — der Ladebildschirm
 * darf den Hauptthread nicht stehlen, während die Systeme initialisieren.
 */

const RING_COUNT = START_RING.length / 2;
const GOLD = '#ffd257';
const TRAIL = '#7ee7ff';
const TRAIL_DIM = 'rgba(180, 198, 210, 0.28)';
const FRAME_MS = 33;

const NPCS: readonly { name: string; color: string; offset: number; speed: number }[] = [
  { name: 'Aoki', color: '#c8102e', offset: 0.22, speed: 0.062 },
  { name: 'Kurose', color: '#1e8fd5', offset: 0.48, speed: 0.05 },
  { name: 'Takami', color: '#e0b400', offset: 0.71, speed: 0.044 },
];

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
  #lastDraw = 0;
  #reduced: boolean;
  readonly #ro: ResizeObserver;
  #unlocked = new Set<string>();
  readonly #onUnlock: (id: string) => void;

  constructor(container: HTMLElement, onUnlock: (id: string) => void) {
    this.#onUnlock = onUnlock;
    this.#reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const wrap = document.createElement('div');
    wrap.className = 'start__radar';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `<p class="start__radarLabel">Ring · live pack</p>`;

    const canvas = document.createElement('canvas');
    canvas.className = 'start__island';
    wrap.append(canvas);
    container.append(wrap);
    this.canvas = canvas;

    const ctx = canvas.getContext('2d', { alpha: false });
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
    this.canvas.parentElement?.remove();
  }

  readonly #onResize = (): void => {
    this.#resize();
    if (this.#reduced) this.#draw(0);
  };

  #resize(): void {
    const css = Math.max(120, Math.round(Math.min(this.canvas.clientWidth || 180, 280)));
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(css * dpr);
    this.canvas.height = Math.round(css * dpr);
  }

  readonly #tick = (now: number): void => {
    if (this.#gone) return;
    this.#raf = requestAnimationFrame(this.#tick);
    if (document.hidden) return;
    if (now - this.#lastDraw < FRAME_MS) return;
    this.#lastDraw = now;
    this.#draw((now - this.#t0) / 1000);
  };

  #draw(time: number): void {
    const ctx = this.#ctx;
    const size = this.canvas.width;
    if (size < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#081418';
    ctx.fillRect(0, 0, size, size);

    const pose = poseOnRing(this.#progress);
    const follow = this.#ready ? 0.55 : smoothstep(0.4, 0.95, this.#progress) * 0.45;
    const idleX = 0.5 + 0.01 * Math.sin(time * 0.11);
    const idleY = 0.5 + 0.01 * Math.cos(time * 0.09);
    const car = worldToUnit(pose.x, pose.z);
    const zoom = lerp(1.04, 1.55, follow);
    const cx = lerp(idleX, car.x, follow);
    const cy = lerp(idleY, car.y, follow);
    const view = { cx, cy, zoom, size };

    ctx.save();
    roundClip(ctx, size, size * 0.04);

    if (this.#imageReady) {
      const img = this.#image;
      const srcW = img.width / zoom;
      const srcH = img.height / zoom;
      const srcX = clamp((cx - 0.5 / zoom) * img.width, 0, Math.max(0, img.width - srcW));
      const srcY = clamp((cy - 0.5 / zoom) * img.height, 0, Math.max(0, img.height - srcH));
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
    }

    ctx.fillStyle = `rgba(4, 10, 16, ${lerp(0.38, 0.22, this.#progress)})`;
    ctx.fillRect(0, 0, size, size);

    this.#drawRing(ctx, view, this.#progress);
    this.#drawZones(ctx, view);
    for (const npc of NPCS) {
      const t = wrap01(npc.offset + time * npc.speed);
      this.#drawChevron(ctx, view, poseOnRing(t), npc.color, 0.7);
    }
    this.#drawChevron(ctx, view, pose, GOLD, 1);

    ctx.restore();
  }

  #drawRing(ctx: CanvasRenderingContext2D, view: View, progress: number): void {
    const step = view.zoom < 1.25 ? 2 : 1;
    const drawn = Math.max(2, Math.floor(progress * (RING_COUNT - 1)));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < RING_COUNT; i += step) {
      const p = project(START_RING[i * 2]!, START_RING[i * 2 + 1]!, view);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = TRAIL_DIM;
    ctx.lineWidth = Math.max(1.1, view.size * 0.01);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= drawn; i += step) {
      const p = project(START_RING[i * 2]!, START_RING[i * 2 + 1]!, view);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = TRAIL;
    ctx.lineWidth = Math.max(1.8, view.size * 0.016);
    ctx.stroke();
  }

  #drawZones(ctx: CanvasRenderingContext2D, view: View): void {
    for (const zone of START_ZONES) {
      const on = this.#unlocked.has(zone.id);
      const p = project(zone.x, zone.z, view);
      ctx.beginPath();
      ctx.arc(p.x, p.y, view.size * (on ? 0.016 : 0.01), 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(255, 210, 87, 0.7)' : 'rgba(220, 230, 240, 0.2)';
      ctx.fill();
    }
  }

  #drawChevron(
    ctx: CanvasRenderingContext2D,
    view: View,
    pose: Pose,
    color: string,
    scale: number,
  ): void {
    const p = project(pose.x, pose.z, view);
    const len = view.size * 0.038 * scale;
    const wid = view.size * 0.02 * scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(pose.heading);
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(wid, len * 0.7);
    ctx.lineTo(0, len * 0.35);
    ctx.lineTo(-wid, len * 0.7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 244, 200, 0.85)';
    ctx.beginPath();
    ctx.arc(-wid * 0.35, -len * 0.15, Math.max(0.8, view.size * 0.006), 0, Math.PI * 2);
    ctx.arc(wid * 0.35, -len * 0.15, Math.max(0.8, view.size * 0.006), 0, Math.PI * 2);
    ctx.fill();
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
  const clamped = Math.min(0.999, Math.max(0, wrap01(t)));
  const f = clamped * (RING_COUNT - 1);
  const i = Math.floor(f);
  const a = f - i;
  const x0 = START_RING[i * 2]!;
  const z0 = START_RING[i * 2 + 1]!;
  const x1 = START_RING[(i + 1) * 2]!;
  const z1 = START_RING[(i + 1) * 2 + 1]!;
  const x = x0 + (x1 - x0) * a;
  const z = z0 + (z1 - z0) * a;
  return { x, z, heading: Math.atan2(x1 - x0, -(z1 - z0)) };
}

function wrap01(value: number): number {
  const t = value % 1;
  return t < 0 ? t + 1 : t;
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
  const r = Math.min(radius, size / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.clip();
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
