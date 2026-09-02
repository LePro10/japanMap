import { CITY_DISTRICT } from '@/config/city.config';
import { ROAD_TYPES, type RoadData, type RoadType } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import { NavigationMapBackdrop } from './NavigationMapBackdrop';
import { MAP_LANDMARKS, formatMapDistance, type MapLandmarkIcon } from './navigationMapData';
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
const MINI_SIZE = 384;
const MINI_SPAN = 920;
const UPDATE_INTERVAL = 0.1;
/** Unter diesem Pixelabstand gilt ein Zeiger als Klick, darüber als Schwenk. */
const PAN_THRESHOLD_PX = 8;
const ZOOM_STEP = 1.28;
const BOUNDS = {
  minX: -WORLD.half,
  maxX: WORLD.half,
  minZ: -WORLD.half,
  maxZ: WORLD.half,
} as const;

/**
 * Spielerkarte und Minimap ohne zweite 3D-Kamera.
 *
 * Der Hintergrund ist eine kleine, offline aus dem echten Heightfield, den
 * Terrain-Zonen und dem Fluss gebackene Vogelperspektive. Straßen werden einmal
 * darüber gezeichnet; im Fahrbetrieb kopiert die Minimap nur einen Ausschnitt
 * dieses statischen Canvas. SVG-POIs liegen ausschließlich über der Vollkarte.
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
  readonly #mini: HTMLButtonElement;
  readonly #miniCanvas: HTMLCanvasElement;
  readonly #miniDistance: HTMLElement;
  readonly #root: HTMLElement;
  readonly #view: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #fullCanvas: HTMLCanvasElement;
  readonly #actions: HTMLElement;
  readonly #selectionLabel: HTMLElement;
  readonly #teleportButton: HTMLElement;
  readonly #backdrop: NavigationMapBackdrop;
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

    this.#mini = document.createElement('button');
    this.#mini.type = 'button';
    this.#mini.className = 'navmap-mini';
    this.#mini.hidden = true;
    this.#mini.setAttribute('aria-label', 'Karte öffnen (M)');
    this.#mini.innerHTML = `
      <span class="navmap-mini__distance" hidden></span>
      <span class="navmap-mini__key">M</span>`;
    this.#miniCanvas = document.createElement('canvas');
    this.#miniCanvas.className = 'navmap-mini__canvas';
    this.#miniCanvas.width = MINI_SIZE;
    this.#miniCanvas.height = MINI_SIZE;
    this.#mini.prepend(this.#miniCanvas);
    options.container.append(this.#mini);
    const miniDistance = this.#mini.querySelector<HTMLElement>('.navmap-mini__distance');
    if (!miniDistance) throw new Error('NavigationMap: Minimap-Distanz fehlt.');
    this.#miniDistance = miniDistance;

    this.#root = document.createElement('div');
    this.#root.className = 'navmap';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <section class="navmap__panel" role="dialog" aria-modal="true" aria-label="Map">
        <header class="navmap__head">
          <div>
            <p class="navmap__eyebrow">Navigation · Aerial</p>
            <h2 class="navmap__title">Japan Map</h2>
          </div>
          <div class="navmap__headActions">
            <span class="navmap__hint">Drag to pan · scroll to zoom · click to pin</span>
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
    this.#backdrop = new NavigationMapBackdrop(() => {
      this.#drawBase();
      this.#drawNow();
    });

    this.#mini.addEventListener('pointerup', this.#onMiniPointerUp);
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
    if (this.#disposed) return;
    const active = this.#isActive();
    // Mini nur am Desktop mit Lock: auf Touch ist die HUD-Minikarte der
    // Öffner (sonst lägen zwei Karten übereinander, P25 hat die HUD-Karte
    // auf dem Telefon nach oben gelegt).
    const canShowMini =
      active && !this.open && !isCoarsePointer() && document.pointerLockElement === this.#canvas;
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
    // Erst das Ereignis, dann den Lock abgeben: `PlayerUi` liest den
    // Lock-Verlust sonst als Pause und legt das Menü über die Karte.
    this.#onOpen();
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#viewState = { scale: 1, tx: 0, ty: 0 };
    this.#root.hidden = false;
    this.#mini.hidden = true;
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
    ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
    this.#backdrop.draw(ctx, BASE_SIZE);

    // Der echte 360 × 360-m-Stadtdistrikt bekommt einen sehr zurückhaltenden
    // Rahmen. Die Aerial-Textur zeigt das Gelände; dieser Layer zeigt Struktur.
    const cityNW = worldToMap(CITY_DISTRICT.minX, CITY_DISTRICT.minZ, BOUNDS);
    const citySE = worldToMap(CITY_DISTRICT.maxX, CITY_DISTRICT.maxZ, BOUNDS);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 173, 78, 0.055)';
    ctx.strokeStyle = 'rgba(255, 183, 95, 0.34)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    const cityX = cityNW.x * BASE_SIZE;
    const cityY = cityNW.y * BASE_SIZE;
    const cityWidth = (citySE.x - cityNW.x) * BASE_SIZE;
    const cityHeight = (citySE.y - cityNW.y) * BASE_SIZE;
    ctx.fillRect(cityX, cityY, cityWidth, cityHeight);
    ctx.strokeRect(cityX, cityY, cityWidth, cityHeight);
    ctx.restore();

    // Straßencasing zuerst für das ganze Netz, dann die farbige Fahrbahn. So
    // bleiben Kreuzungen als zusammenhängendes Netz lesbar.
    for (const road of this.#roads) this.#drawRoad(ctx, road, true);
    for (const road of this.#roads) this.#drawRoad(ctx, road, false);

    ctx.save();
    ctx.strokeStyle = 'rgba(232, 245, 247, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (i / 4) * BASE_SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, BASE_SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(BASE_SIZE, p);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(225, 240, 246, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, BASE_SIZE - 2, BASE_SIZE - 2);
    ctx.restore();
  }

  #drawRoad(ctx: CanvasRenderingContext2D, road: RoadData, casing: boolean): void {
    if (road.centerline.length < 6) return;
    const settings = ROAD_TYPES[road.type];
    const width = Math.max(1.4, (settings.width / WORLD.size) * BASE_SIZE * 2.1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = casing ? 'rgba(5, 11, 14, 0.72)' : roadColor(road.type);
    ctx.lineWidth = casing ? width + 3.1 : width;
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
    this.#drawMiniLandmarks(ctx, sx, sy, crop);

    const px = ((normalized.x * BASE_SIZE - sx) / crop) * MINI_SIZE;
    const py = ((normalized.y * BASE_SIZE - sy) / crop) * MINI_SIZE;
    this.#drawPlayer(ctx, px, py, pose.yaw, 12);

    const waypoint = this.#getWaypoint();
    if (waypoint) {
      const wp = worldToMap(waypoint.x, waypoint.z, BOUNDS);
      const rawX = ((wp.x * BASE_SIZE - sx) / crop) * MINI_SIZE;
      const rawY = ((wp.y * BASE_SIZE - sy) / crop) * MINI_SIZE;
      const margin = 20;
      const markerX = clamp(rawX, margin, MINI_SIZE - margin);
      const markerY = clamp(rawY, margin, MINI_SIZE - margin);
      const edge = rawX !== markerX || rawY !== markerY;
      this.#drawWaypoint(ctx, markerX, markerY, edge, 11);
      this.#miniDistance.hidden = false;
      this.#miniDistance.textContent = `WAYPOINT · ${formatMapDistance(distance(pose.x, pose.z, waypoint.x, waypoint.z))}`;
    } else {
      this.#miniDistance.hidden = true;
      this.#miniDistance.textContent = '';
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, MINI_SIZE - 2, MINI_SIZE - 2);
  }

  #drawMiniLandmarks(ctx: CanvasRenderingContext2D, sx: number, sy: number, crop: number): void {
    for (const landmark of MAP_LANDMARKS) {
      const point = worldToMap(landmark.x, landmark.z, BOUNDS);
      const x = ((point.x * BASE_SIZE - sx) / crop) * MINI_SIZE;
      const y = ((point.y * BASE_SIZE - sy) / crop) * MINI_SIZE;
      if (x < 8 || y < 8 || x > MINI_SIZE - 8 || y > MINI_SIZE - 8) continue;
      ctx.save();
      ctx.fillStyle = landmarkColor(landmark.icon);
      ctx.strokeStyle = 'rgba(3, 9, 12, 0.92)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.restore();
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
    ctx.fillStyle = '#f6fbff';
    ctx.strokeStyle = 'rgba(3, 8, 12, 0.96)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = radius * 0.7;
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
    ctx.shadowColor = '#168cff';
    ctx.shadowBlur = radius * 2.3;
    ctx.fillStyle = '#168cff';
    ctx.strokeStyle = '#dff1ff';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, -radius * 0.32, radius, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.quadraticCurveTo(radius * 0.68, radius * 0.65, 0, radius * 1.45);
    ctx.quadraticCurveTo(-radius * 0.68, radius * 0.65, -radius * 0.99, -radius * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e6f4ff';
    ctx.beginPath();
    ctx.arc(0, -radius * 0.34, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();

    if (edge) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(226, 242, 255, 0.95)';
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
    ctx.fillStyle = 'rgba(4, 12, 18, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 165, 255, 0.82)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#e4f3ff';
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
    if (!this.#mini.hidden) this.#drawMini();
    if (this.open) this.#drawFull();
  }

  readonly #onMiniPointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.openMap(event.pointerType !== 'touch');
  };

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
    this.#mini.removeEventListener('pointerup', this.#onMiniPointerUp);
    this.#fullCanvas.removeEventListener('pointerdown', this.#onMapPointerDown);
    this.#stage.removeEventListener('wheel', this.#onWheel);
    this.#poiLayer.dispose();
    this.#backdrop.dispose();
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
      return 'rgba(255, 205, 122, 0.96)';
    case 'city':
      return 'rgba(238, 239, 226, 0.94)';
    case 'mountain':
      return 'rgba(220, 226, 218, 0.9)';
    case 'village':
      return 'rgba(219, 205, 168, 0.88)';
    case 'dirt':
      return 'rgba(187, 145, 91, 0.9)';
    case 'pfad':
      return 'rgba(159, 129, 88, 0.78)';
  }
}

function landmarkColor(icon: MapLandmarkIcon): string {
  switch (icon) {
    case 'city':
      return '#ffb75f';
    case 'temple':
      return '#ff6b66';
    case 'mountain':
      return '#e2e5df';
    case 'paddy':
      return '#8bd5a4';
    case 'village':
      return '#f3cf86';
    case 'coast':
      return '#78ccef';
    case 'forest':
      return '#77c995';
  }
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
