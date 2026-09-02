import { ROAD_TYPES, type RoadData, type RoadType } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import { mapToWorld, worldToMap, type MapPoint } from './navigationMapMath';
import './navigationMap.css';

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
  readonly setWaypoint: (x: number, z: number) => void;
  readonly getWaypoint: () => MapPoint | null;
  readonly onOpen: () => void;
}

const BASE_SIZE = 1024;
const MINI_SIZE = 384;
const MINI_SPAN = 920;
const UPDATE_INTERVAL = 0.1;
const BOUNDS = {
  minX: -WORLD.half,
  maxX: WORLD.half,
  minZ: -WORLD.half,
  maxZ: WORLD.half,
} as const;

/**
 * Spielerkarte und Minimap ohne zweite 3D-Kamera.
 *
 * Das Straßennetz wird genau einmal auf einen 1024²-Canvas gezeichnet. Im
 * Fahrbetrieb wird nur ein Ausschnitt davon kopiert und mit zwei kleinen
 * Markern ergänzt. Dadurch entstehen keine zusätzlichen WebGL-Draw-Calls und
 * auch keine zweite Welt, die LOD/Vegetation noch einmal aktualisieren müsste.
 */
export class NavigationMap {
  readonly #canvas: HTMLCanvasElement;
  readonly #isActive: () => boolean;
  readonly #getPose: () => NavigationPose;
  readonly #teleport: (x: number, z: number) => void;
  readonly #setWaypoint: (x: number, z: number) => void;
  readonly #getWaypoint: () => MapPoint | null;
  readonly #onOpen: () => void;

  readonly #base = document.createElement('canvas');
  readonly #mini: HTMLButtonElement;
  readonly #miniCanvas: HTMLCanvasElement;
  readonly #root: HTMLElement;
  readonly #fullCanvas: HTMLCanvasElement;
  readonly #actions: HTMLElement;
  readonly #selectionLabel: HTMLElement;

  #roads: readonly RoadData[] = [];
  #selected: MapPoint | null = null;
  #elapsed = UPDATE_INTERVAL;
  #openedWithMouse = true;
  #disposed = false;

  constructor(options: NavigationMapOptions) {
    this.#canvas = options.canvas;
    this.#isActive = options.isActive;
    this.#getPose = options.getPose;
    this.#teleport = options.teleport;
    this.#setWaypoint = options.setWaypoint;
    this.#getWaypoint = options.getWaypoint;
    this.#onOpen = options.onOpen;

    this.#base.width = BASE_SIZE;
    this.#base.height = BASE_SIZE;

    this.#mini = document.createElement('button');
    this.#mini.type = 'button';
    this.#mini.className = 'navmap-mini';
    this.#mini.hidden = true;
    this.#mini.setAttribute('aria-label', 'Karte öffnen (M)');
    this.#mini.innerHTML = '<span class="navmap-mini__key">M</span>';
    this.#miniCanvas = document.createElement('canvas');
    this.#miniCanvas.className = 'navmap-mini__canvas';
    this.#miniCanvas.width = MINI_SIZE;
    this.#miniCanvas.height = MINI_SIZE;
    this.#mini.prepend(this.#miniCanvas);
    options.container.append(this.#mini);

    this.#root = document.createElement('div');
    this.#root.className = 'navmap';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <section class="navmap__panel" role="dialog" aria-modal="true" aria-label="Karte">
        <header class="navmap__head">
          <div>
            <p class="navmap__eyebrow">Navigation</p>
            <h2 class="navmap__title">Karte</h2>
          </div>
          <div class="navmap__headActions">
            <span class="navmap__hint">Ort anklicken</span>
            <button type="button" class="navmap__close" aria-label="Karte schließen">×</button>
          </div>
        </header>
        <div class="navmap__stage">
          <canvas class="navmap__canvas" width="${BASE_SIZE}" height="${BASE_SIZE}"></canvas>
          <div class="navmap__actions" hidden>
            <span class="navmap__selection"></span>
            <button type="button" data-map-action="teleport">Teleportieren</button>
            <button type="button" data-map-action="waypoint">Waypoint setzen</button>
          </div>
        </div>
        <footer class="navmap__footer">
          <span><i class="navmap__legend navmap__legend--player"></i>Du</span>
          <span><i class="navmap__legend navmap__legend--waypoint"></i>Waypoint</span>
          <span class="navmap__footerKey"><kbd>M</kbd> Karte</span>
        </footer>
      </section>`;
    options.container.append(this.#root);

    this.#fullCanvas = this.#mustCanvas('.navmap__canvas');
    this.#actions = this.#must('.navmap__actions');
    this.#selectionLabel = this.#must('.navmap__selection');

    this.#mini.addEventListener('pointerup', this.#onMiniPointerUp);
    this.#fullCanvas.addEventListener('pointerup', this.#onMapPointerUp);
    this.#must('.navmap__close').addEventListener('click', this.#onCloseClick);
    this.#must('[data-map-action="teleport"]').addEventListener('click', this.#onTeleport);
    this.#must('[data-map-action="waypoint"]').addEventListener('click', this.#onWaypoint);
    window.addEventListener('keydown', this.#onKeyDown);

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
    if (this.#disposed) return;
    const active = this.#isActive();
    const touch = isCoarsePointer();
    const canShowMini = active && !this.open && (touch || document.pointerLockElement === this.#canvas);
    this.#mini.hidden = !canShowMini;

    this.#elapsed += dt;
    if (this.#elapsed < UPDATE_INTERVAL) return;
    this.#elapsed = 0;
    if (canShowMini) this.#drawMini();
    if (this.open) this.#drawFull();
  }

  openMap(mouseLike = true): void {
    if (!this.#isActive() || this.open) return;
    this.#openedWithMouse = mouseLike;
    this.#onOpen();
    this.#selected = null;
    this.#actions.hidden = true;
    this.#root.hidden = false;
    this.#mini.hidden = true;
    this.#drawFull();
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
  }

  closeMap(resume: boolean): void {
    if (!this.open) return;
    this.#root.hidden = true;
    this.#selected = null;
    this.#actions.hidden = true;
    this.#elapsed = UPDATE_INTERVAL;
    if (resume && this.#openedWithMouse && !isCoarsePointer()) this.#requestPointerLock();
  }

  #drawBase(): void {
    const ctx = context2d(this.#base);
    ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
    ctx.fillStyle = '#081018';
    ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE);

    const gradient = ctx.createRadialGradient(
      BASE_SIZE * 0.48,
      BASE_SIZE * 0.45,
      BASE_SIZE * 0.08,
      BASE_SIZE * 0.5,
      BASE_SIZE * 0.5,
      BASE_SIZE * 0.7,
    );
    gradient.addColorStop(0, 'rgba(31, 48, 58, 0.58)');
    gradient.addColorStop(1, 'rgba(3, 8, 13, 0.92)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE);

    ctx.strokeStyle = 'rgba(164, 190, 204, 0.055)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (i / 8) * BASE_SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, BASE_SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(BASE_SIZE, p);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(126, 161, 177, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, BASE_SIZE - 2, BASE_SIZE - 2);

    for (const road of this.#roads) this.#drawRoad(ctx, road);
  }

  #drawRoad(ctx: CanvasRenderingContext2D, road: RoadData): void {
    if (road.centerline.length < 6) return;
    const settings = ROAD_TYPES[road.type];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = roadColor(road.type);
    ctx.lineWidth = Math.max(1.25, (settings.width / WORLD.size) * BASE_SIZE * 1.7);
    ctx.beginPath();
    for (let i = 0; i + 2 < road.centerline.length; i += 3) {
      const point = worldToMap(road.centerline[i]!, road.centerline[i + 2]!, BOUNDS);
      const x = point.x * BASE_SIZE;
      const y = point.y * BASE_SIZE;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (road.closed) ctx.closePath();
    ctx.stroke();
  }

  #drawMini(): void {
    const ctx = context2d(this.#miniCanvas);
    const pose = this.#getPose();
    const normalized = worldToMap(pose.x, pose.z, BOUNDS);
    const crop = (MINI_SPAN / WORLD.size) * BASE_SIZE;
    const maxOrigin = BASE_SIZE - crop;
    const sx = clamp(normalized.x * BASE_SIZE - crop * 0.5, 0, maxOrigin);
    const sy = clamp(normalized.y * BASE_SIZE - crop * 0.5, 0, maxOrigin);

    ctx.clearRect(0, 0, MINI_SIZE, MINI_SIZE);
    ctx.drawImage(this.#base, sx, sy, crop, crop, 0, 0, MINI_SIZE, MINI_SIZE);

    const px = ((normalized.x * BASE_SIZE - sx) / crop) * MINI_SIZE;
    const py = ((normalized.y * BASE_SIZE - sy) / crop) * MINI_SIZE;
    this.#drawPlayer(ctx, px, py, pose.yaw, 12);

    const waypoint = this.#getWaypoint();
    if (waypoint) {
      const wp = worldToMap(waypoint.x, waypoint.z, BOUNDS);
      const rawX = ((wp.x * BASE_SIZE - sx) / crop) * MINI_SIZE;
      const rawY = ((wp.y * BASE_SIZE - sy) / crop) * MINI_SIZE;
      const margin = 18;
      this.#drawWaypoint(
        ctx,
        clamp(rawX, margin, MINI_SIZE - margin),
        clamp(rawY, margin, MINI_SIZE - margin),
        rawX !== clamp(rawX, margin, MINI_SIZE - margin) || rawY !== clamp(rawY, margin, MINI_SIZE - margin),
        10,
      );
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, MINI_SIZE - 2, MINI_SIZE - 2);
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
      this.#drawWaypoint(ctx, wp.x * BASE_SIZE, wp.y * BASE_SIZE, false, 13);
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
    ctx.fillStyle = '#f6fbff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = radius * 0.7;
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
    ctx.shadowColor = '#168cff';
    ctx.shadowBlur = radius * 1.8;
    ctx.fillStyle = '#168cff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8edff';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = 'rgba(216, 237, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    if (!this.#mini.hidden) this.#drawMini();
    if (this.open) this.#drawFull();
  }

  readonly #onMiniPointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.openMap(event.pointerType !== 'touch');
  };

  readonly #onMapPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.#openedWithMouse = event.pointerType !== 'touch';
    const rect = this.#fullCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = mapToWorld(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      BOUNDS,
    );
    this.#selected = point;
    this.#selectionLabel.textContent = `${Math.round(point.x)} / ${Math.round(point.z)} m`;
    this.#actions.hidden = false;
    this.#drawFull();
  };

  readonly #onTeleport = (): void => {
    const selected = this.#selected;
    if (!selected) return;
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
    if (event.code === 'Escape' && this.open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Nach Escape blockiert Chrome eine sofortige neue Pointer-Lock-Anfrage.
      // Deshalb nur die Karte schließen; das Pausenmenü darunter übernimmt.
      this.closeMap(false);
    }
  };

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
    this.#mini.removeEventListener('pointerup', this.#onMiniPointerUp);
    this.#fullCanvas.removeEventListener('pointerup', this.#onMapPointerUp);
    this.#mini.remove();
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

function roadColor(type: RoadType): string {
  switch (type) {
    case 'highway':
      return 'rgba(231, 239, 242, 0.82)';
    case 'city':
      return 'rgba(196, 218, 226, 0.72)';
    case 'mountain':
      return 'rgba(183, 207, 216, 0.72)';
    case 'village':
      return 'rgba(159, 190, 201, 0.64)';
    case 'dirt':
      return 'rgba(183, 158, 119, 0.58)';
    case 'pfad':
      return 'rgba(145, 128, 102, 0.45)';
  }
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
