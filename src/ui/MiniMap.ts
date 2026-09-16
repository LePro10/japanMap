import { DRIFT_ZONES, RAMPS } from '@/config/stunt.config';
import type { RoadFile } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import { NavigationMapBackdrop } from './NavigationMapBackdrop';
import {
  MAP_INK,
  drawGlowRoute,
  drawLocalRoads,
  drawNorthMark,
  drawPlayerChevron,
  drawWaypointPin,
} from './mapDraw';

/**
 * Die Minikarte — spielerzentriert, Straßen in Anzeigeauflösung.
 *
 * ## Warum nicht die 1024er-Weltkarte beschneiden
 *
 * 480 m Sicht auf 3072 m Welt sind 16 % der Atlasbreite, also ~160 Quellpixel
 * auf 190 CSS-Pixel. Das ist der matschige Look. Gran Turismo zeichnet die
 * Strecke als Vektor auf das HUD — dieselbe Lösung hier: Splines lokal
 * projizieren, Aerial nur als Farbgrund.
 */

const SIZE = 190;
/** Dieselbe Sicht zu Fuß und im Auto. 160 m gegen 420 m war ein Sprung
 *  beim Ein-/Aussteigen — die Karte darf den Wechsel nicht zeigen. */
const VIEW_DRIVE = 420;
const VIEW_FAST = 640;
const FAST_MS = 50;
const AERIAL_SIZE = 2048;
const REDRAW_INTERVAL = 1 / 15;

export interface MiniMapMark {
  readonly x: number;
  readonly z: number;
  readonly label?: string;
}

export class MiniMap {
  readonly root: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #aerial = document.createElement('canvas');
  readonly #backdrop: NavigationMapBackdrop;
  #world = WORLD.size;
  #dpr = 1;
  #roadsDrawn = 0;
  #since = Number.POSITIVE_INFINITY;
  #file: RoadFile | null = null;
  #onFoot = false;

  constructor(container: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.className = 'hud__map';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    this.root = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MiniMap: kein 2D-Kontext.');
    this.#ctx = ctx;
    this.#aerial.width = AERIAL_SIZE;
    this.#aerial.height = AERIAL_SIZE;
    this.#resize();
    this.#backdrop = new NavigationMapBackdrop(() => this.#paintAerial());
    this.#paintAerial();
  }

  #resize(): void {
    this.#dpr = Math.min(3, window.devicePixelRatio || 1);
    this.root.width = Math.round(SIZE * this.#dpr);
    this.root.height = Math.round(SIZE * this.#dpr);
  }

  setNetwork(file: RoadFile | null): void {
    if (!file) return;
    this.#world = WORLD.size;
    this.#file = file;
    this.#roadsDrawn = file.roads.length;
  }

  get roadsDrawn(): number {
    return this.#roadsDrawn;
  }

  #paintAerial(): void {
    const ctx = this.#aerial.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#backdrop.draw(ctx, AERIAL_SIZE);
  }

  #projectLocal(x: number, z: number, originX: number, originZ: number, span: number): { x: number; y: number } {
    return {
      x: ((x - originX) / span + 0.5) * SIZE,
      y: ((z - originZ) / span + 0.5) * SIZE,
    };
  }

  update(
    x: number,
    z: number,
    heading: number,
    rivals: readonly MiniMapMark[],
    target: MiniMapMark | null,
    dt = 0,
    waypoint: MiniMapMark | null = null,
    speed = 0,
    onFoot = false,
  ): void {
    const modeChanged = onFoot !== this.#onFoot;
    this.#onFoot = onFoot;
    this.#since += dt;
    if (!modeChanged && dt > 0 && this.#since < REDRAW_INTERVAL) return;
    this.#since = 0;

    const fast = Math.min(1, Math.max(0, (speed - 8) / (FAST_MS - 8)));
    const span = VIEW_DRIVE + (VIEW_FAST - VIEW_DRIVE) * fast;
    const radius = SIZE * 0.5;

    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.root.width, this.root.height);
    ctx.scale(this.#dpr, this.#dpr);

    ctx.save();
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
    ctx.clip();

    const worldPx = (x / this.#world + 0.5) * AERIAL_SIZE;
    const worldPy = (z / this.#world + 0.5) * AERIAL_SIZE;
    const crop = (span / this.#world) * AERIAL_SIZE;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.#aerial, worldPx - crop * 0.5, worldPy - crop * 0.5, crop, crop, 0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(6, 18, 22, 0.28)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    if (this.#file) {
      this.#roadsDrawn = drawLocalRoads(ctx, this.#file.roads, x, z, span, SIZE);
    }

    ctx.fillStyle = MAP_INK.ramp;
    for (const ramp of RAMPS) {
      if (Math.hypot(ramp.x - x, ramp.z - z) > span) continue;
      const p = this.#projectLocal(ramp.x, ramp.z, x, z, span);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 4);
      ctx.lineTo(p.x + 3.4, p.y + 3);
      ctx.lineTo(p.x - 3.4, p.y + 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = MAP_INK.zone;
    ctx.lineWidth = 1.6;
    for (const zone of DRIFT_ZONES) {
      if (Math.hypot(zone.x - x, zone.z - z) > span + zone.radius) continue;
      const p = this.#projectLocal(zone.x, zone.z, x, z, span);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (zone.radius / span) * SIZE, 0, Math.PI * 2);
      ctx.stroke();
    }

    const local = (wx: number, wz: number) => this.#projectLocal(wx, wz, x, z, span);

    if (waypoint) {
      const from = local(x, z);
      const to = local(waypoint.x, waypoint.z);
      const clamped = clampToCircle(to.x, to.y, radius, radius, radius - 12);
      drawGlowRoute(ctx, from.x, from.y, clamped.x, clamped.y, 4.2);
      if (clamped.inside) drawWaypointPin(ctx, to.x, to.y, 7);
      else drawEdgeChevron(ctx, clamped.x, clamped.y, clamped.angle, MAP_INK.waypoint);
    }

    if (target) {
      const p = local(target.x, target.z);
      const clamped = clampToCircle(p.x, p.y, radius, radius, radius - 10);
      if (clamped.inside) {
        ctx.strokeStyle = MAP_INK.target;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        drawEdgeChevron(ctx, clamped.x, clamped.y, clamped.angle, MAP_INK.target);
      }
    }

    ctx.fillStyle = MAP_INK.rival;
    for (const rival of rivals) {
      const p = local(rival.x, rival.z);
      if ((p.x - radius) ** 2 + (p.y - radius) ** 2 > (radius - 6) ** 2) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPlayerChevron(ctx, radius, radius, heading, 10);
    drawNorthMark(ctx, radius, radius + 20, 8);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(210, 236, 242, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  dispose(): void {
    this.root.remove();
    this.#backdrop.dispose();
    this.#file = null;
  }
}

function clampToCircle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number; angle: number; inside: boolean } {
  const dx = x - cx;
  const dy = y - cy;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  if (len <= radius) return { x, y, angle, inside: true };
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
    angle,
    inside: false,
  };
}

function drawEdgeChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI * 0.5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(5, 5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
