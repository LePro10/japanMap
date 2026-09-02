import { DRIFT_ZONES, RAMPS } from '@/config/stunt.config';
import type { RoadData } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import { MAP_LANDMARKS, formatMapDistance } from './navigationMapData';
import {
  clampMapView,
  mapToWorld,
  worldToMap,
  zoomMapView,
  type MapPoint,
  type MapView,
} from './navigationMapMath';
import { NavigationPoiLayer } from './NavigationPoiLayer';
import './navigationMap.css';
import './navigationMapPolish.css';

export interface NavigationPose {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface NavigationMapOptions {
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly isActive: () => boolean;
  readonly getPose: () => NavigationPose;
  readonly teleport: (x: number, z: number) => void;
  readonly canTeleport: () => boolean;
  readonly setWaypoint: (x: number, z: number) => void;
  readonly getWaypoint: () => MapPoint | null;
  readonly onOpen: () => void;
  readonly onClose: (resume: boolean) => void;
}

const BASE_SIZE = 1024;
const UPDATE_INTERVAL = 0.1;
/** Unter diesem Pixelabstand gilt ein Zeiger als Klick, darüber als Schwenk. */
const PAN_THRESHOLD_PX = 8;
const ZOOM_STEP = 1.28;
/** Dieselben Grautöne wie die HUD-Minikarte — P25. */
const ROAD_COLOR = '#8d8f96';
const ROAD_MAIN = '#c9ccd4';
const PLAYER_COLOR = '#ffd257';
const WAYPOINT_COLOR = '#d8dee9';
const BOUNDS = {
  minX: -WORLD.half,
  maxX: WORLD.half,
  minZ: -WORLD.half,
  maxZ: WORLD.half,
} as const;

/**
 * Vollkarte — dieselbe Zeichnung wie die HUD-Minikarte unten links, nur größer.
 *
 * Keine zweite Mini, keine Aerial-Textur. Die Minikarte aus P25 bleibt die
 * einzige Mini; diese Overlay-Karte ist ihr vergrößerter, zoombarer Zustand.
 */
export class NavigationMap {
  readonly #canvas: HTMLCanvasElement;
  readonly #isActive: () => boolean;
  readonly #getPose: () => NavigationPose;
  readonly #teleport: (x: number, z: number) => void;
  readonly #canTeleport: () => boolean;
  readonly #setWaypoint: (x: number, z: number) => void;
  readonly #getWaypoint: () => MapPoint | null;
  readonly #onOpen: () => void;
  readonly #onClose: (resume: boolean) => void;

  readonly #base = document.createElement('canvas');
  readonly #root: HTMLElement;
  readonly #view: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #fullCanvas: HTMLCanvasElement;
  readonly #actions: HTMLElement;
  readonly #selectionLabel: HTMLElement;
  readonly #teleportButton: HTMLElement;
  readonly #poiLayer: NavigationPoiLayer;

  #roads: readonly RoadData[] = [];
  #selected: MapPoint | null = null;
  #elapsed = UPDATE_INTERVAL;
  #openedWithMouse = true;
  #disposed = false;
  #viewState: MapView = { scale: 1, tx: 0, ty: 0 };
  #drag: { pointerId: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null =
    null;

  constructor(options: NavigationMapOptions) {
    this.#canvas = options.canvas;
    this.#isActive = options.isActive;
    this.#getPose = options.getPose;
    this.#teleport = options.teleport;
    this.#canTeleport = options.canTeleport;
    this.#setWaypoint = options.setWaypoint;
    this.#getWaypoint = options.getWaypoint;
    this.#onOpen = options.onOpen;
    this.#onClose = options.onClose;

    this.#base.width = BASE_SIZE;
    this.#base.height = BASE_SIZE;

    this.#root = document.createElement('div');
    this.#root.className = 'navmap';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <section class="navmap__panel" role="dialog" aria-modal="true" aria-label="Map">
        <header class="navmap__head">
          <h2 class="navmap__title">Map</h2>
          <div class="navmap__headActions">
            <span class="navmap__hint">Drag · scroll · click</span>
            <button type="button" class="navmap__close" aria-label="Close map">×</button>
          </div>
        </header>
        <div class="navmap__stage">
          <div class="navmap__view">
            <canvas class="navmap__canvas" width="${BASE_SIZE}" height="${BASE_SIZE}"></canvas>
          </div>
          <div class="navmap__zoom">
            <button type="button" data-map-zoom="in" aria-label="Zoom in">+</button>
            <button type="button" data-map-zoom="out" aria-label="Zoom out">−</button>
          </div>
          <div class="navmap__actions" hidden>
            <span class="navmap__selection"></span>
            <button type="button" data-map-action="teleport" hidden>Teleport</button>
            <button type="button" data-map-action="waypoint">Set waypoint</button>
          </div>
        </div>
        <footer class="navmap__footer">
          <span><i class="navmap__legend navmap__legend--player"></i>You</span>
          <span><i class="navmap__legend navmap__legend--waypoint"></i>Waypoint</span>
          <span><i class="navmap__legend navmap__legend--poi"></i>Place</span>
          <span class="navmap__footerKey"><kbd>M</kbd> Map</span>
        </footer>
      </section>`;
    options.container.append(this.#root);

    this.#view = this.#must('.navmap__view');
    this.#stage = this.#must('.navmap__stage');
    this.#fullCanvas = this.#mustCanvas('.navmap__canvas');
    this.#actions = this.#must('.navmap__actions');
    this.#selectionLabel = this.#must('.navmap__selection');
    this.#teleportButton = this.#must('[data-map-action="teleport"]');
    this.#poiLayer = new NavigationPoiLayer(this.#view, BOUNDS, BASE_SIZE);

    this.#fullCanvas.addEventListener('pointerdown', this.#onMapPointerDown);
    this.#must('.navmap__close').addEventListener('click', this.#onCloseClick);
    this.#teleportButton.addEventListener('click', this.#onTeleport);
    this.#must('[data-map-action="waypoint"]').addEventListener('click', this.#onWaypoint);
    this.#must('[data-map-zoom="in"]').addEventListener('click', this.#onZoomIn);
    this.#must('[data-map-zoom="out"]').addEventListener('click', this.#onZoomOut);
    this.#stage.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('pointermove', this.#onMapPointerMove);
    window.addEventListener('pointerup', this.#onMapPointerUp);
    window.addEventListener('pointercancel', this.#onMapPointerUp);

    this.#drawBase();
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  setRoads(roads: readonly RoadData[]): void {
    this.#roads = roads;
    this.#drawBase();
    this.#drawNow();
  }

  update(dt: number): void {
    if (this.#disposed || !this.open) return;
    this.#elapsed += dt;
    if (this.#elapsed < UPDATE_INTERVAL) return;
    this.#elapsed = 0;
    this.#drawFull();
  }

  openMap(mouseLike = true): void {
    if (!this.#isActive() || this.open) return;
    this.#openedWithMouse = mouseLike;
    // Erst das Ereignis, dann den Lock abgeben: `PlayerUi` liest den
    // Lock-Verlust sonst als Pause und legt das Menü über die Karte.
    this.#onOpen();
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#viewState = { scale: 1, tx: 0, ty: 0 };
    this.#root.hidden = false;
    this.#applyView();
    this.#drawFull();
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
  }

  closeMap(resume: boolean): void {
    if (!this.open) return;
    this.#root.hidden = true;
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#elapsed = UPDATE_INTERVAL;
    this.#onClose(resume);
    if (resume && this.#openedWithMouse && !isCoarsePointer()) this.#requestPointerLock();
  }

  #drawBase(): void {
    const ctx = context2d(this.#base);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE);

    ctx.strokeStyle = 'rgba(216, 222, 233, 0.16)';
    ctx.lineWidth = 2;
    for (const zone of DRIFT_ZONES) {
      const p = worldToMap(zone.x, zone.z, BOUNDS);
      ctx.beginPath();
      ctx.arc(p.x * BASE_SIZE, p.y * BASE_SIZE, (zone.radius / WORLD.size) * BASE_SIZE, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of this.#roads) {
      if (road.centerline.length < 6) continue;
      const main = road.length > 2000;
      ctx.strokeStyle = main ? ROAD_MAIN : ROAD_COLOR;
      ctx.lineWidth = main ? 5.5 : 3.2;
      ctx.beginPath();
      for (let i = 0; i < road.centerline.length; i += 12) {
        const point = worldToMap(road.centerline[i]!, road.centerline[i + 2]!, BOUNDS);
        const x = point.x * BASE_SIZE;
        const y = point.y * BASE_SIZE;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (road.closed) ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = ROAD_MAIN;
    for (const ramp of RAMPS) {
      const p = worldToMap(ramp.x, ramp.z, BOUNDS);
      ctx.beginPath();
      ctx.arc(p.x * BASE_SIZE, p.y * BASE_SIZE, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawFull(): void {
    const ctx = context2d(this.#fullCanvas);
    ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
    ctx.drawImage(this.#base, 0, 0);

    const pose = this.#getPose();
    const player = worldToMap(pose.x, pose.z, BOUNDS);
    this.#drawPlayer(ctx, player.x * BASE_SIZE, player.y * BASE_SIZE, pose.yaw, 15);

    const waypoint = this.#getWaypoint();
    if (waypoint) {
      const wp = worldToMap(waypoint.x, waypoint.z, BOUNDS);
      const x = wp.x * BASE_SIZE;
      const y = wp.y * BASE_SIZE;
      this.#drawWaypoint(ctx, x, y, false, 14);
      this.#drawWaypointCallout(
        ctx,
        x,
        y,
        `WAYPOINT · ${formatMapDistance(distance(pose.x, pose.z, waypoint.x, waypoint.z))}`,
      );
    }

    if (this.#selected) {
      const selected = worldToMap(this.#selected.x, this.#selected.z, BOUNDS);
      this.#drawSelection(ctx, selected.x * BASE_SIZE, selected.y * BASE_SIZE);
    }
  }

  #drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, radius: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - yaw);
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.72, radius * 0.75);
    ctx.lineTo(0, radius * 0.48);
    ctx.lineTo(-radius * 0.72, radius * 0.75);
    ctx.closePath();
    ctx.fillStyle = PLAYER_COLOR;
    ctx.strokeStyle = 'rgba(6, 8, 12, 0.92)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = radius * 0.4;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  #drawWaypoint(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    edge: boolean,
    radius: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = radius * 0.8;
    ctx.fillStyle = WAYPOINT_COLOR;
    ctx.strokeStyle = '#0a0d12';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, -radius * 0.32, radius, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.quadraticCurveTo(radius * 0.68, radius * 0.65, 0, radius * 1.45);
    ctx.quadraticCurveTo(-radius * 0.68, radius * 0.65, -radius * 0.99, -radius * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0d12';
    ctx.beginPath();
    ctx.arc(0, -radius * 0.34, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();

    if (edge) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(216, 222, 233, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawWaypointCallout(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    ctx.save();
    ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, monospace';
    const paddingX = 12;
    const width = ctx.measureText(text).width + paddingX * 2;
    const height = 34;
    let left = x + 24;
    if (left + width > BASE_SIZE - 12) left = x - width - 24;
    left = clamp(left, 12, BASE_SIZE - width - 12);
    const top = clamp(y - height - 12, 12, BASE_SIZE - height - 12);

    roundedRect(ctx, left, top, width, height, 8);
    ctx.fillStyle = 'rgba(10, 13, 18, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#d8dee9';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + paddingX, top + height * 0.51);
    ctx.restore();
  }

  #drawSelection(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 23, y);
    ctx.lineTo(x + 23, y);
    ctx.moveTo(x, y - 23);
    ctx.lineTo(x, y + 23);
    ctx.stroke();
    ctx.restore();
  }

  #drawNow(): void {
    if (this.open) this.#drawFull();
  }

  readonly #onMapPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.open) return;
    event.preventDefault();
    this.#openedWithMouse = event.pointerType !== 'touch';
    this.#drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      tx: this.#viewState.tx,
      ty: this.#viewState.ty,
      moved: false,
    };
  };

  readonly #onMapPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && dx * dx + dy * dy < PAN_THRESHOLD_PX * PAN_THRESHOLD_PX) return;
    drag.moved = true;
    const stage = this.#stageSize();
    this.#viewState = clampMapView(
      { scale: this.#viewState.scale, tx: drag.tx + dx, ty: drag.ty + dy },
      stage.width,
      stage.height,
    );
    this.#applyView();
  };

  readonly #onMapPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#drag = null;
    if (drag.moved || !this.open) return;
    const rect = this.#fullCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = mapToWorld(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      BOUNDS,
    );
    this.#selected = point;
    this.#selectionLabel.textContent = selectionLabel(point);
    this.#actions.hidden = false;
    this.#teleportButton.hidden = !this.#canTeleport();
    this.#drawFull();
  };

  readonly #onTeleport = (): void => {
    const selected = this.#selected;
    if (!selected || !this.#canTeleport()) return;
    this.#teleport(selected.x, selected.z);
    this.closeMap(true);
  };

  readonly #onWaypoint = (): void => {
    const selected = this.#selected;
    if (!selected) return;
    this.#setWaypoint(selected.x, selected.z);
    this.closeMap(true);
  };

  readonly #onCloseClick = (): void => {
    this.closeMap(true);
  };

  readonly #onZoomIn = (): void => {
    this.#zoomBy(ZOOM_STEP);
  };

  readonly #onZoomOut = (): void => {
    this.#zoomBy(1 / ZOOM_STEP);
  };

  readonly #onWheel = (event: WheelEvent): void => {
    if (!this.open) return;
    event.preventDefault();
    const stage = this.#stage.getBoundingClientRect();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.#zoomAt(factor, event.clientX - stage.left, event.clientY - stage.top);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (isTyping() || event.repeat) return;
    if (event.code === 'KeyM') {
      if (!this.#isActive() && !this.open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.open) this.closeMap(true);
      else this.openMap(true);
      return;
    }
    if (!this.open) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Nach Escape blockiert Chrome eine sofortige neue Pointer-Lock-Anfrage.
      this.closeMap(false);
      return;
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault();
      this.#zoomBy(ZOOM_STEP);
      return;
    }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      this.#zoomBy(1 / ZOOM_STEP);
    }
  };

  #zoomBy(factor: number): void {
    const stage = this.#stageSize();
    this.#zoomAt(factor, stage.width * 0.5, stage.height * 0.5);
  }

  #zoomAt(factor: number, focusX: number, focusY: number): void {
    const stage = this.#stageSize();
    this.#viewState = zoomMapView(this.#viewState, factor, focusX, focusY, stage.width, stage.height);
    this.#applyView();
  }

  #stageSize(): { width: number; height: number } {
    return {
      width: Math.max(1, this.#stage.clientWidth),
      height: Math.max(1, this.#stage.clientHeight),
    };
  }

  #applyView(): void {
    const { scale, tx, ty } = this.#viewState;
    this.#view.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  #requestPointerLock(): void {
    if (!this.#isActive() || typeof this.#canvas.requestPointerLock !== 'function') return;
    const result: unknown = this.#canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(() => undefined);
  }

  #must(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`NavigationMap: "${selector}" fehlt.`);
    return element;
  }

  #mustCanvas(selector: string): HTMLCanvasElement {
    const element = this.#root.querySelector<HTMLCanvasElement>(selector);
    if (!element) throw new Error(`NavigationMap: "${selector}" fehlt.`);
    return element;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('pointermove', this.#onMapPointerMove);
    window.removeEventListener('pointerup', this.#onMapPointerUp);
    window.removeEventListener('pointercancel', this.#onMapPointerUp);
    this.#fullCanvas.removeEventListener('pointerdown', this.#onMapPointerDown);
    this.#stage.removeEventListener('wheel', this.#onWheel);
    this.#poiLayer.dispose();
    this.#root.remove();
    this.#roads = [];
    this.#selected = null;
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NavigationMap: Canvas 2D ist nicht verfügbar.');
  return context;
}

function selectionLabel(point: MapPoint): string {
  let closestLabel = '';
  let closest = 130;
  for (const landmark of MAP_LANDMARKS) {
    const d = distance(point.x, point.z, landmark.x, landmark.z);
    if (d < closest) {
      closest = d;
      closestLabel = landmark.label;
    }
  }
  if (closestLabel) return `${closestLabel} · ${formatMapDistance(closest)}`;
  return `${Math.round(point.x)} / ${Math.round(point.z)} m`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function distance(x0: number, z0: number, x1: number, z1: number): number {
  return Math.hypot(x1 - x0, z1 - z0);
}

function isCoarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function isTyping(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
