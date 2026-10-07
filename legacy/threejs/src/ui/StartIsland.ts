import { WORLD } from '@/config/world.config';
import islandUrl from '../../assets/generated/terrain/navigation-map.webp?url';
import { START_ZONES } from './startCopy';
import { START_RING, START_UNLOCKS } from './startRing';

/**
 * Die Insel in der Mitte des Ladebildschirms.
 *
 * Ganze Karte, kein Follow-Zoom (der hat den Ring abgeschnitten). Der
 * Fortschritt ist die Position des goldenen Autos auf der Ringstraße.
 * Aoki, Kurose und Takami fahren daneben — auf der Zeit, nicht auf dem Balken.
 */

const RING_COUNT = START_RING.length / 2;
const GOLD = '#ffd257';
const TRAIL = '#7ee7ff';
const TRAIL_DIM = 'rgba(180, 198, 210, 0.35)';
const FRAME_MS = 33;
const PAD = 0.06;

const NPCS: readonly { color: string; offset: number; speed: number }[] = [
  { color: '#c8102e', offset: 0.22, speed: 0.055 },
  { color: '#1e8fd5', offset: 0.48, speed: 0.044 },
  { color: '#e0b400', offset: 0.71, speed: 0.038 },
];

export class StartIsland {
  readonly canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #image = new Image();
  #imageReady = false;
  #progress = 0;
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
    const css = Math.max(180, Math.round(this.canvas.clientWidth || 420));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
    ctx.clearRect(0, 0, size, size);

    const pad = size * PAD;
    const inner = size - 2 * pad;
    const view = { size, pad, inner };
    const pose = poseOnRing(this.#progress);

    ctx.save();
    roundClip(ctx, size, size * 0.03);

    if (this.#imageReady) {
      ctx.drawImage(this.#image, 0, 0, this.#image.width, this.#image.height, pad, pad, inner, inner);
    } else {
      ctx.fillStyle = '#0a1418';
      ctx.fillRect(pad, pad, inner, inner);
    }

    ctx.fillStyle = `rgba(4, 10, 16, ${lerp(0.28, 0.12, this.#progress)})`;
    ctx.fillRect(0, 0, size, size);

    this.#drawRing(ctx, view, this.#progress);
    this.#drawZones(ctx, view, time);
    for (const npc of NPCS) {
      this.#drawCar(ctx, view, poseOnRing(npc.offset + time * npc.speed), npc.color, 0.72);
    }
    this.#drawCar(ctx, view, pose, GOLD, 1);
    ctx.restore();
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
    ctx.closePath();
    ctx.strokeStyle = TRAIL_DIM;
    ctx.lineWidth = Math.max(1.4, view.size * 0.007);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= drawn; i++) {
      const p = project(START_RING[i * 2]!, START_RING[i * 2 + 1]!, view);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = TRAIL;
    ctx.shadowColor = 'rgba(110, 220, 255, 0.7)';
    ctx.shadowBlur = view.size * 0.012;
    ctx.lineWidth = Math.max(2.4, view.size * 0.011);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  #drawZones(ctx: CanvasRenderingContext2D, view: View, time: number): void {
    for (const zone of START_ZONES) {
      const on = this.#unlocked.has(zone.id);
      const p = project(zone.x, zone.z, view);
      const pulse = on ? 0.55 + 0.45 * Math.sin(time * 2.6 + p.x * 0.01) : 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, view.size * (on ? 0.012 : 0.008), 0, Math.PI * 2);
      ctx.fillStyle = on ? `rgba(255, 210, 87, ${0.55 + 0.35 * pulse})` : 'rgba(220, 230, 240, 0.28)';
      ctx.fill();
    }
  }

  #drawCar(
    ctx: CanvasRenderingContext2D,
    view: View,
    pose: Pose,
    color: string,
    scale: number,
  ): void {
    const p = project(pose.x, pose.z, view);
    const len = view.size * 0.028 * scale;
    const wid = view.size * 0.015 * scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(pose.heading);
    if (scale === 1) {
      ctx.shadowColor = color;
      ctx.shadowBlur = view.size * 0.02;
    }
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(wid, len * 0.7);
    ctx.lineTo(0, len * 0.35);
    ctx.lineTo(-wid, len * 0.7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
}

interface View {
  readonly size: number;
  readonly pad: number;
  readonly inner: number;
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
  return {
    x: x0 + (x1 - x0) * a,
    z: z0 + (z1 - z0) * a,
    heading: Math.atan2(x1 - x0, -(z1 - z0)),
  };
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
    x: view.pad + u.x * view.inner,
    y: view.pad + u.y * view.inner,
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
