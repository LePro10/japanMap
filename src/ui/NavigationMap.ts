import type { RoadData } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import {
  MAP_LANDMARKS,
  formatMapDistance,
  nearestLandmark,
  type MapLandmark,
} from './navigationMapData';
import {
  clampMapView,
  centerMapView,
  mapToWorld,
  worldToMap,
  zoomMapView,
  type MapPoint,
  type MapView,
} from './navigationMapMath';
import { NavigationMapBackdrop } from './NavigationMapBackdrop';
import { NavigationPoiLayer } from './NavigationPoiLayer';
import { NavigationRoadLayer } from './navigationMapRoads';
import {
  MAP_INK,
  drawGlowRoute,
  drawPathRoute,
  drawPlayerChevron,
  drawWaypointPin,
} from './mapDraw';
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
  readonly setWaypoint: (x: number, z: number, label?: string) => void;
  readonly clearWaypoint: () => void;
  readonly getWaypoint: () => (MapPoint & { label?: string }) | null;
  readonly getRoute?: () => Float32Array | null;
  readonly onOpen: () => void;
  readonly onClose: (resume: boolean) => void;
}

const BASE_SIZE = 1024;
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
 * Vollkarte — Aerial-Gelände plus Straßen, Zoom, Waypoint-Route.
 *
 * Overlay (Taste M) und Pause-Tab teilen dieselbe Instanz. Docked hängt das
 * Panel in das Menü; Overlay legt es über die Welt. Zwei Wirte, eine Zeichnung.
 */
export class NavigationMap {
  readonly #canvas: HTMLCanvasElement;
  readonly #container: HTMLElement;
  readonly #isActive: () => boolean;
  readonly #getPose: () => NavigationPose;
  readonly #teleport: (x: number, z: number) => void;
  readonly #canTeleport: () => boolean;
  readonly #setWaypoint: (x: number, z: number, label?: string) => void;
  readonly #clearWaypoint: () => void;
  readonly #getWaypoint: () => (MapPoint & { label?: string }) | null;
  readonly #getRoute: () => Float32Array | null;
  readonly #onOpen: () => void;
  readonly #onClose: (resume: boolean) => void;

  readonly #root: HTMLElement;
  readonly #view: HTMLElement;
  readonly #plane: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #fullCanvas: HTMLCanvasElement;
  readonly #terrain: HTMLCanvasElement;
  readonly #marks: HTMLCanvasElement;
  readonly #actions: HTMLElement;
  readonly #selectionLabel: HTMLElement;
  readonly #selectionMeta: HTMLElement;
  readonly #teleportButton: HTMLElement;
  readonly #waypointButton: HTMLElement;
  readonly #places: HTMLElement;
  readonly #poiLayer: NavigationPoiLayer;
  readonly #roadLayer: NavigationRoadLayer;
  readonly #backdrop: NavigationMapBackdrop;
  readonly #placeButtons = new Map<string, HTMLButtonElement>();

  #selected: (MapPoint & { label?: string; landmarkId?: string }) | null = null;
  #elapsed = UPDATE_INTERVAL;
  #openedWithMouse = true;
  #disposed = false;
  #docked = false;
  #viewState: MapView = { scale: 1, tx: 0, ty: 0 };
  #drag: { pointerId: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null =
    null;
  #resize: ResizeObserver | null = null;

  constructor(options: NavigationMapOptions) {
    this.#canvas = options.canvas;
    this.#container = options.container;
    this.#isActive = options.isActive;
    this.#getPose = options.getPose;
    this.#teleport = options.teleport;
    this.#canTeleport = options.canTeleport;
    this.#setWaypoint = options.setWaypoint;
    this.#clearWaypoint = options.clearWaypoint;
    this.#getWaypoint = options.getWaypoint;
    this.#getRoute = options.getRoute ?? (() => null);
    this.#onOpen = options.onOpen;
    this.#onClose = options.onClose;

    this.#root = document.createElement('div');
    this.#root.className = 'navmap';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <section class="navmap__panel" role="dialog" aria-modal="true" aria-label="Island map">
        <header class="navmap__head">
          <div class="navmap__brand">
            <p class="navmap__kicker">After the rain</p>
            <h2 class="navmap__title">Island Atlas</h2>
          </div>
          <div class="navmap__headActions">
            <span class="navmap__hint">Drag · scroll · click a pin</span>
            <button type="button" data-map-recenter aria-label="Recenter on you">◎</button>
            <button type="button" class="navmap__close" aria-label="Close map">×</button>
          </div>
        </header>
        <div class="navmap__body">
          <div class="navmap__stage">
            <canvas class="navmap__terrain" aria-hidden="true"></canvas>
            <div class="navmap__view">
              <div class="navmap__plane">
                <canvas class="navmap__canvas" width="${BASE_SIZE}" height="${BASE_SIZE}"></canvas>
              </div>
            </div>
            <canvas class="navmap__marks" aria-hidden="true"></canvas>
            <div class="navmap__zoom">
              <button type="button" data-map-zoom="in" aria-label="Zoom in">+</button>
              <button type="button" data-map-zoom="out" aria-label="Zoom out">−</button>
            </div>
            <div class="navmap__compass" aria-hidden="true">N</div>
            <div class="navmap__actions" hidden>
              <div class="navmap__selectionBlock">
                <span class="navmap__selection"></span>
                <span class="navmap__selectionMeta"></span>
              </div>
              <button type="button" data-map-action="teleport" hidden>Travel</button>
              <button type="button" data-map-action="waypoint">Set waypoint</button>
            </div>
          </div>
          <aside class="navmap__side">
            <p class="navmap__sideKicker">Places</p>
            <nav class="navmap__places" aria-label="Places"></nav>
          </aside>
        </div>
        <footer class="navmap__footer">
          <span><i class="navmap__legend navmap__legend--player"></i>You</span>
          <span><i class="navmap__legend navmap__legend--waypoint"></i>Waypoint</span>
          <span><i class="navmap__legend navmap__legend--poi"></i>Place</span>
          <span><i class="navmap__legend navmap__legend--route"></i>Route</span>
          <span class="navmap__footerKey"><kbd>M</kbd> Map</span>
        </footer>
      </section>`;
    options.container.append(this.#root);

    this.#view = this.#must('.navmap__view');
    this.#plane = this.#must('.navmap__plane');
    this.#stage = this.#must('.navmap__stage');
    this.#fullCanvas = this.#mustCanvas('.navmap__canvas');
    this.#terrain = this.#mustCanvas('.navmap__terrain');
    this.#marks = this.#mustCanvas('.navmap__marks');
    this.#actions = this.#must('.navmap__actions');
    this.#selectionLabel = this.#must('.navmap__selection');
    this.#selectionMeta = this.#must('.navmap__selectionMeta');
    this.#teleportButton = this.#must('[data-map-action="teleport"]');
    this.#waypointButton = this.#must('[data-map-action="waypoint"]');
    this.#places = this.#must('.navmap__places');
    this.#roadLayer = new NavigationRoadLayer(this.#plane, BOUNDS, BASE_SIZE);
    this.#poiLayer = new NavigationPoiLayer(this.#plane, BOUNDS, BASE_SIZE, (landmark) => {
      this.#selectLandmark(landmark);
    });
    this.#backdrop = new NavigationMapBackdrop(() => {
      this.#drawBase();
      this.#drawNow();
    });
    this.#fillPlaces();

    this.#fullCanvas.addEventListener('pointerdown', this.#onMapPointerDown);
    this.#fullCanvas.addEventListener('dblclick', this.#onDoubleClick);
    this.#must('.navmap__close').addEventListener('click', this.#onCloseClick);
    this.#teleportButton.addEventListener('click', this.#onTeleport);
    this.#waypointButton.addEventListener('click', this.#onWaypoint);
    this.#must('[data-map-zoom="in"]').addEventListener('click', this.#onZoomIn);
    this.#must('[data-map-zoom="out"]').addEventListener('click', this.#onZoomOut);
    this.#must('[data-map-recenter]').addEventListener('click', this.#onRecenter);
    this.#stage.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('pointermove', this.#onMapPointerMove);
    window.addEventListener('pointerup', this.#onMapPointerUp);
    window.addEventListener('pointercancel', this.#onMapPointerUp);
    this.#resize = new ResizeObserver(() => {
      this.#viewState = clampMapView(this.#viewState, this.#stageSize().width, this.#stageSize().height);
      this.#applyView();
      this.#drawNow();
    });
    this.#resize.observe(this.#stage);

    this.#drawBase();
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  get docked(): boolean {
    return this.#docked;
  }

  setRoads(roads: readonly RoadData[]): void {
    this.#roadLayer.setRoads(roads);
    this.#drawBase();
    this.#drawNow();
  }

  update(dt: number): void {
    if (this.#disposed || !this.open) return;
    this.#elapsed += dt;
    if (this.#elapsed < UPDATE_INTERVAL) return;
    this.#elapsed = 0;
    this.#drawFull();
    this.#syncPlaceDistances();
  }

  openMap(mouseLike = true): void {
    if (!this.#isActive()) return;
    if (this.#docked) this.undock();
    if (this.open) return;
    this.#openedWithMouse = mouseLike;
    // Erst das Ereignis, dann den Lock abgeben: `PlayerUi` liest den
    // Lock-Verlust sonst als Pause und legt das Menü über die Karte.
    this.#onOpen();
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#viewState = { scale: 1, tx: 0, ty: 0 };
    this.#root.classList.remove('navmap--docked');
    this.#root.hidden = false;
    this.#container.append(this.#root);
    this.#applyView();
    this.#drawFull();
    this.#syncPlaceDistances();
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
  }

  /**
   * Die Karte in das Pause-Menü hängen. Kein `map:open`: das Menü ist schon
   * offen, und dasselbe Ereignis würde es schließen.
   */
  dock(host: HTMLElement): void {
    if (this.#disposed) return;
    if (this.#docked && this.#root.parentElement === host) {
      this.#drawNow();
      return;
    }
    this.#docked = true;
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#viewState = { scale: 1, tx: 0, ty: 0 };
    this.#root.classList.add('navmap--docked');
    this.#root.hidden = false;
    host.append(this.#root);
    requestAnimationFrame(() => {
      if (!this.#docked) return;
      this.#applyView();
      this.#drawFull();
      this.#syncPlaceDistances();
    });
  }

  undock(): void {
    if (!this.#docked) return;
    this.#docked = false;
    this.#root.classList.remove('navmap--docked');
    this.#root.hidden = true;
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#container.append(this.#root);
  }

  closeMap(resume: boolean): void {
    if (this.#docked) {
      this.undock();
      return;
    }
    if (!this.open) return;
    this.#root.hidden = true;
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#elapsed = UPDATE_INTERVAL;
    this.#onClose(resume);
    if (resume && this.#openedWithMouse && !isCoarsePointer()) this.#requestPointerLock();
  }

  #fillPlaces(): void {
    this.#places.replaceChildren();
    for (const landmark of MAP_LANDMARKS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `navmap__place navmap__place--${landmark.icon}`;
      button.innerHTML = `<i></i><span><strong>${escapeHtml(landmark.label)}</strong><em>${escapeHtml(landmark.kanji)}</em></span><b>—</b>`;
      button.addEventListener('click', () => this.#selectLandmark(landmark, true));
      this.#places.append(button);
      this.#placeButtons.set(landmark.id, button);
    }
  }

  #selectLandmark(landmark: MapLandmark, zoom = false): void {
    this.#selected = {
      x: landmark.x,
      z: landmark.z,
      label: landmark.label,
      landmarkId: landmark.id,
    };
    this.#poiLayer.setSelected(landmark.id);
    this.#showSelection();
    if (zoom) {
      this.#focusWorld(landmark.x, landmark.z, 2.6);
    }
    this.#drawFull();
  }

  #showSelection(): void {
    const selected = this.#selected;
    if (!selected) {
      this.#actions.hidden = true;
      this.#poiLayer.setSelected(null);
      return;
    }
    const pose = this.#getPose();
    const waypoint = this.#getWaypoint();
    const dist = formatMapDistance(distance(pose.x, pose.z, selected.x, selected.z));
    const name = selected.label ?? selectionName(selected);
    this.#selectionLabel.textContent = name;
    this.#selectionMeta.textContent = dist;
    this.#actions.hidden = false;
    this.#teleportButton.hidden = !this.#canTeleport();
    const same =
      waypoint !== null &&
      Math.hypot(waypoint.x - selected.x, waypoint.z - selected.z) < 12;
    this.#waypointButton.textContent = same ? 'Clear waypoint' : 'Set waypoint';
    this.#waypointButton.dataset.mode = same ? 'clear' : 'set';
  }

  #drawBase(): void {
    this.#drawTerrain();
  }

  #syncTerrainSize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.#stage.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.#stage.clientHeight * dpr));
    if (this.#terrain.width !== width) this.#terrain.width = width;
    if (this.#terrain.height !== height) this.#terrain.height = height;
  }

  #drawTerrain(): void {
    this.#syncTerrainSize();
    const stage = this.#stageSize();
    const plane = Math.max(stage.width, stage.height);
    const left = (stage.width - plane) * 0.5;
    const top = (stage.height - plane) * 0.5;
    const { scale, tx, ty } = this.#viewState;
    const nx0 = (0 - tx) / scale - left;
    const ny0 = (0 - ty) / scale - top;
    const nx1 = (stage.width - tx) / scale - left;
    const ny1 = (stage.height - ty) / scale - top;
    const ctx = context2d(this.#terrain);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#backdrop.drawVisible(
      ctx,
      this.#terrain.width,
      this.#terrain.height,
      nx0 / plane,
      ny0 / plane,
      nx1 / plane,
      ny1 / plane,
    );
  }

  #drawFull(): void {
    this.#drawMarks();
    this.#showSelection();
  }

  #syncMarksSize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.#stage.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.#stage.clientHeight * dpr));
    if (this.#marks.width !== width) this.#marks.width = width;
    if (this.#marks.height !== height) this.#marks.height = height;
  }

  #worldToStage(x: number, z: number): { x: number; y: number } | null {
    const plane = this.#plane.getBoundingClientRect();
    const stage = this.#stage.getBoundingClientRect();
    if (plane.width <= 0 || plane.height <= 0) return null;
    const point = worldToMap(x, z, BOUNDS);
    return {
      x: plane.left - stage.left + point.x * plane.width,
      y: plane.top - stage.top + point.y * plane.height,
    };
  }

  #focusWorld(x: number, z: number, scale: number): void {
    const stage = this.#stageSize();
    const plane = Math.max(stage.width, stage.height);
    const point = worldToMap(x, z, BOUNDS);
    const localX = (stage.width - plane) * 0.5 + point.x * plane;
    const localY = (stage.height - plane) * 0.5 + point.y * plane;
    this.#viewState = centerMapView(localX, localY, scale, stage.width, stage.height);
    this.#applyView();
  }

  #drawMarks(): void {
    this.#syncMarksSize();
    const ctx = context2d(this.#marks);
    const dpr = this.#marks.width / Math.max(1, this.#stage.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#marks.width, this.#marks.height);
    ctx.scale(dpr, dpr);

    const pose = this.#getPose();
    const player = this.#worldToStage(pose.x, pose.z);
    if (!player) return;

    const waypoint = this.#getWaypoint();
    if (waypoint) {
      const wp = this.#worldToStage(waypoint.x, waypoint.z);
      const route = this.#getRoute();
      if (route && route.length >= 4) {
        drawPathRoute(
          ctx,
          route,
          (x, z) => this.#worldToStage(x, z) ?? { x: -999, y: -999 },
          MAP_INK.route,
          3.6,
        );
      } else if (wp) {
        drawGlowRoute(ctx, player.x, player.y, wp.x, wp.y, 4);
      }
      if (wp) {
        drawWaypointPin(ctx, wp.x, wp.y, 13);
        this.#drawCallout(
          ctx,
          wp.x,
          wp.y,
          `${(waypoint.label ?? 'Waypoint').toUpperCase()} · ${formatMapDistance(distance(pose.x, pose.z, waypoint.x, waypoint.z))}`,
        );
      }
    }

    drawPlayerChevron(ctx, player.x, player.y, pose.yaw, 13);

    if (this.#selected) {
      const selected = this.#worldToStage(this.#selected.x, this.#selected.z);
      if (selected) this.#drawSelection(ctx, selected.x, selected.y);
    }
  }

  #drawCallout(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    ctx.save();
    ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
    const paddingX = 12;
    const width = ctx.measureText(text).width + paddingX * 2;
    const height = 30;
    const stageW = Math.max(1, this.#stage.clientWidth);
    const stageH = Math.max(1, this.#stage.clientHeight);
    let left = x + 22;
    if (left + width > stageW - 12) left = x - width - 22;
    left = clamp(left, 12, stageW - width - 12);
    const top = clamp(y - height - 18, 12, stageH - height - 12);
    roundedRect(ctx, left, top, width, height, 7);
    ctx.fillStyle = 'rgba(6, 20, 24, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(102, 215, 244, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#eaf6f8';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + paddingX, top + height * 0.52);
    ctx.restore();
  }

  #drawSelection(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.strokeStyle = MAP_INK.waypointHot;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  #drawNow(): void {
    if (this.open) this.#drawFull();
  }

  #syncPlaceDistances(): void {
    const pose = this.#getPose();
    for (const landmark of MAP_LANDMARKS) {
      const button = this.#placeButtons.get(landmark.id);
      if (!button) continue;
      const dist = button.querySelector('b');
      if (dist) dist.textContent = formatMapDistance(distance(pose.x, pose.z, landmark.x, landmark.z));
      button.classList.toggle('is-selected', this.#selected?.landmarkId === landmark.id);
    }
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
    const point = this.#eventToWorld(event);
    if (!point) return;
    const landmark = nearestLandmark(point.x, point.z, 90);
    if (landmark) {
      this.#selectLandmark(landmark);
      return;
    }
    this.#selected = { x: point.x, z: point.z, label: selectionName(point) };
    this.#poiLayer.setSelected(null);
    this.#showSelection();
    this.#drawFull();
  };

  readonly #onDoubleClick = (event: MouseEvent): void => {
    if (!this.open) return;
    event.preventDefault();
    const point = this.#eventToWorld(event);
    if (!point) return;
    const landmark = nearestLandmark(point.x, point.z, 90);
    this.#setWaypoint(landmark?.x ?? point.x, landmark?.z ?? point.z, landmark?.label ?? 'Waypoint');
    this.#drawFull();
  };

  #eventToWorld(event: MouseEvent): MapPoint | null {
    const rect = this.#fullCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return mapToWorld(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      BOUNDS,
    );
  }

  readonly #onTeleport = (): void => {
    const selected = this.#selected;
    if (!selected || !this.#canTeleport()) return;
    this.#teleport(selected.x, selected.z);
    if (!this.#docked) this.closeMap(true);
  };

  readonly #onWaypoint = (): void => {
    if (this.#waypointButton.dataset.mode === 'clear') {
      this.#clearWaypoint();
      this.#showSelection();
      this.#drawFull();
      return;
    }
    const selected = this.#selected;
    if (!selected) return;
    this.#setWaypoint(selected.x, selected.z, selected.label ?? 'Waypoint');
    this.#showSelection();
    this.#drawFull();
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

  readonly #onRecenter = (): void => {
    const pose = this.#getPose();
    this.#focusWorld(pose.x, pose.z, Math.max(this.#viewState.scale, 2.2));
  };

  readonly #onWheel = (event: WheelEvent): void => {
    if (!this.open) return;
    event.preventDefault();
    const stage = this.#stage.getBoundingClientRect();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.#zoomAt(factor, event.clientX - stage.left, event.clientY - stage.top);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (this.#docked || isTyping() || event.repeat) return;
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
    this.#root.dataset.zoom = scale < 1.35 ? 'far' : scale < 3 ? 'mid' : 'near';
    this.#poiLayer.setViewScale(scale);
    this.#drawTerrain();
    this.#drawMarks();
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
    this.#resize?.disconnect();
    this.#resize = null;
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('pointermove', this.#onMapPointerMove);
    window.removeEventListener('pointerup', this.#onMapPointerUp);
    window.removeEventListener('pointercancel', this.#onMapPointerUp);
    this.#fullCanvas.removeEventListener('pointerdown', this.#onMapPointerDown);
    this.#fullCanvas.removeEventListener('dblclick', this.#onDoubleClick);
    this.#stage.removeEventListener('wheel', this.#onWheel);
    this.#poiLayer.dispose();
    this.#roadLayer.dispose();
    this.#backdrop.dispose();
    this.#root.remove();
    this.#selected = null;
    this.#placeButtons.clear();
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NavigationMap: Canvas 2D ist nicht verfügbar.');
  return context;
}

function selectionName(point: MapPoint): string {
  const landmark = nearestLandmark(point.x, point.z, 130);
  return landmark ? landmark.label : `${Math.round(point.x)} / ${Math.round(point.z)} m`;
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
