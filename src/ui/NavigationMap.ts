import type { RoadData } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import {
  MAP_LANDMARKS,
  formatMapDistance,
  nearestLandmark,
  type MapLandmark,
} from './navigationMapData';
import {
  MAP_MAX_SCALE,
  clampMapView,
  centerMapView,
  mapMinScale,
  mapToWorld,
  worldToMap,
  zoomMapView,
  type MapPoint,
  type MapView,
} from './navigationMapMath';
import {
  MAP_REGIONS,
  NavigationRegionLayer,
  regionAt,
  regionFocus,
  type MapRegion,
} from './navigationMapRegions';
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

export interface NavigationDockOptions {
  readonly focusPlayer?: boolean;
}

const BASE_SIZE = 1024;
const UPDATE_INTERVAL = 0.1;
/** Unter diesem Pixelabstand gilt ein Zeiger als Klick, darüber als Schwenk. */
const PAN_THRESHOLD_PX = 8;
const ZOOM_STEP = 1.28;
/** Nach dem Schwenken erst scharf nachziehen — nicht währenddessen. */
const HQ_DELAY_MS = 90;
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
 *
 * Pan/Zoom ist CSS-Transform der Plane. Die teure Aerial-Nachprobe läuft erst
 * nach einer Pause — sonst zeichnet jeder Pointermove den Filter-Pfad und der
 * Atlas hängt. Die 3D-Welt dahinter schläft (PlayerUi), diese Klasse braucht
 * kein rAF.
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
  readonly #base: HTMLCanvasElement;
  readonly #terrain: HTMLCanvasElement;
  readonly #marks: HTMLCanvasElement;
  readonly #actions: HTMLElement;
  readonly #selectionLabel: HTMLElement;
  readonly #selectionMeta: HTMLElement;
  readonly #teleportButton: HTMLElement;
  readonly #waypointButton: HTMLElement;
  readonly #places: HTMLElement;
  readonly #regions: HTMLElement;
  readonly #zoomIn: HTMLButtonElement;
  readonly #zoomOut: HTMLButtonElement;
  readonly #poiLayer: NavigationPoiLayer;
  readonly #roadLayer: NavigationRoadLayer;
  readonly #regionLayer: NavigationRegionLayer;
  readonly #backdrop: NavigationMapBackdrop;
  readonly #placeButtons = new Map<string, HTMLButtonElement>();
  readonly #regionButtons = new Map<string, HTMLButtonElement>();

  #selected: (MapPoint & { label?: string; landmarkId?: string; regionId?: string }) | null = null;
  #elapsed = UPDATE_INTERVAL;
  #openedWithMouse = true;
  #disposed = false;
  #docked = false;
  #viewState: MapView = { scale: 1, tx: 0, ty: 0 };
  #drag: { pointerId: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null =
    null;
  #resize: ResizeObserver | null = null;
  #hqTimer = 0;
  #interacting = false;

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
            <button type="button" data-map-fit aria-label="Show whole island">⛶</button>
            <button type="button" data-map-recenter aria-label="Recenter on you">◎</button>
            <button type="button" class="navmap__close" aria-label="Close map">×</button>
          </div>
        </header>
        <div class="navmap__body">
          <div class="navmap__stage">
            <canvas class="navmap__terrain" aria-hidden="true"></canvas>
            <div class="navmap__view">
              <div class="navmap__plane">
                <canvas class="navmap__base" width="${BASE_SIZE}" height="${BASE_SIZE}" aria-hidden="true"></canvas>
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
            <p class="navmap__sideKicker">Regions</p>
            <nav class="navmap__regionsList" aria-label="Regions"></nav>
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
    this.#base = this.#mustCanvas('.navmap__base');
    this.#terrain = this.#mustCanvas('.navmap__terrain');
    this.#marks = this.#mustCanvas('.navmap__marks');
    this.#actions = this.#must('.navmap__actions');
    this.#selectionLabel = this.#must('.navmap__selection');
    this.#selectionMeta = this.#must('.navmap__selectionMeta');
    this.#teleportButton = this.#must('[data-map-action="teleport"]');
    this.#waypointButton = this.#must('[data-map-action="waypoint"]');
    this.#places = this.#must('.navmap__places');
    this.#regions = this.#must('.navmap__regionsList');
    this.#zoomIn = this.#must('[data-map-zoom="in"]') as HTMLButtonElement;
    this.#zoomOut = this.#must('[data-map-zoom="out"]') as HTMLButtonElement;
    this.#regionLayer = new NavigationRegionLayer(this.#plane, BOUNDS, BASE_SIZE, (region) => {
      this.#selectRegion(region, true);
    });
    this.#roadLayer = new NavigationRoadLayer(this.#plane, BOUNDS, BASE_SIZE);
    this.#poiLayer = new NavigationPoiLayer(this.#plane, BOUNDS, BASE_SIZE, (landmark) => {
      this.#selectLandmark(landmark);
    });
    this.#backdrop = new NavigationMapBackdrop(() => {
      this.#drawBase();
      this.#drawNow();
    });
    this.#fillRegions();
    this.#fillPlaces();

    this.#stage.addEventListener('pointerdown', this.#onMapPointerDown);
    this.#fullCanvas.addEventListener('dblclick', this.#onDoubleClick);
    this.#must('.navmap__close').addEventListener('click', this.#onCloseClick);
    this.#teleportButton.addEventListener('click', this.#onTeleport);
    this.#waypointButton.addEventListener('click', this.#onWaypoint);
    this.#zoomIn.addEventListener('click', this.#onZoomIn);
    this.#zoomOut.addEventListener('click', this.#onZoomOut);
    this.#must('[data-map-recenter]').addEventListener('click', this.#onRecenter);
    this.#must('[data-map-fit]').addEventListener('click', this.#onFit);
    this.#stage.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('pointermove', this.#onMapPointerMove);
    window.addEventListener('pointerup', this.#onMapPointerUp);
    window.addEventListener('pointercancel', this.#onMapPointerUp);
    this.#resize = new ResizeObserver(() => {
      if (!this.open) return;
      this.#viewState = clampMapView(this.#viewState, this.#stageSize().width, this.#stageSize().height);
      this.#applyView();
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
    this.#drawNow();
  }

  update(dt: number): void {
    if (this.#disposed || !this.open || this.#interacting) return;
    this.#elapsed += dt;
    if (this.#elapsed < UPDATE_INTERVAL) return;
    this.#elapsed = 0;
    this.#drawMarks();
    this.#syncPlaceDistances();
  }

  openMap(mouseLike = true): void {
    if (!this.#isActive()) return;
    if (this.#docked) this.undock();
    if (this.open) {
      this.focusPlayer();
      return;
    }
    this.#openedWithMouse = mouseLike;
    // Erst das Ereignis, dann den Lock abgeben: `PlayerUi` liest den
    // Lock-Verlust sonst als Pause und legt das Menü über die Karte.
    this.#onOpen();
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#root.classList.remove('navmap--docked');
    this.#root.hidden = false;
    this.#container.append(this.#root);
    this.focusPlayer();
    this.#syncPlaceDistances();
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();
  }

  /**
   * Die Karte in das Pause-Menü hängen. Kein `map:open`: das Menü ist schon
   * offen, und dasselbe Ereignis würde es schließen.
   *
   * `focusPlayer` ist der Weg aus der Fahrt: Taste M soll denselben Weltpunkt
   * zeigen, an dem der Wagen steht — nicht den letzten Schwenk und nicht die
   * Cover-Ecke oben links.
   */
  dock(host: HTMLElement, options: NavigationDockOptions = {}): void {
    if (this.#disposed) return;
    const already = this.#docked && this.#root.parentElement === host;
    this.#docked = true;
    this.#root.classList.add('navmap--docked');
    this.#root.hidden = false;
    if (!already) {
      this.#selected = null;
      this.#actions.hidden = true;
      this.#drag = null;
      host.append(this.#root);
    }
    // Jedes `#render` dockt erneut. Ohne diesen Ausstieg würde jeder Tabwechsel
    // den Wagen zurück in die Mitte legen — und der Atlas wäre nicht schwenkbar.
    if (already && !options.focusPlayer) return;
    const paint = (): void => {
      if (!this.#docked) return;
      // M / minmap want the car. The Map tab is an atlas: the whole island,
      // not a crop around the last pose (that left a dark gutter on ultrawide).
      if (options.focusPlayer) this.focusPlayer();
      else if (!already) this.fitIsland();
      else {
        this.#applyView();
        this.#drawMarks();
        this.#syncPlaceDistances();
      }
    };
    // Erstes Dock: Layout der Pause-Fläche ist nach einem Frame oft noch 0×0.
    if (already) requestAnimationFrame(paint);
    else requestAnimationFrame(() => requestAnimationFrame(paint));
  }

  undock(): void {
    if (!this.#docked) return;
    this.#docked = false;
    this.#root.classList.remove('navmap--docked');
    this.#root.hidden = true;
    this.#selected = null;
    this.#actions.hidden = true;
    this.#drag = null;
    this.#clearHq();
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
    this.#clearHq();
    this.#onClose(resume);
    if (resume && this.#openedWithMouse && !isCoarsePointer()) this.#requestPointerLock();
  }

  /** Den Wagen in die Kartenmitte legen — Taste M und Recenter. */
  focusPlayer(scale?: number): void {
    const pose = this.#getPose();
    const stage = this.#stageSize();
    const openScale = scale ?? Math.max(2.15, mapMinScale(stage.width, stage.height) * 2.4);
    this.#focusWorld(pose.x, pose.z, openScale);
    this.#drawMarks();
    this.#syncPlaceDistances();
    this.#showSelection();
  }

  fitIsland(): void {
    const stage = this.#stageSize();
    this.#viewState = clampMapView(
      { scale: mapMinScale(stage.width, stage.height), tx: 0, ty: 0 },
      stage.width,
      stage.height,
    );
    this.#applyView();
    this.#drawMarks();
    this.#syncPlaceDistances();
  }

  #fillRegions(): void {
    this.#regions.replaceChildren();
    for (const region of MAP_REGIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `navmap__region navmap__region--${region.id}`;
      button.style.setProperty('--pin', region.color);
      button.innerHTML = `<i></i><span><strong>${escapeHtml(region.label)}</strong><em>${escapeHtml(region.kanji)}</em></span>`;
      button.addEventListener('click', () => this.#selectRegion(region, true));
      this.#regions.append(button);
      this.#regionButtons.set(region.id, button);
    }
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

  #selectRegion(region: MapRegion, zoom = false): void {
    this.#selected = {
      x: region.x,
      z: region.z,
      label: region.label,
      regionId: region.id,
    };
    this.#poiLayer.setSelected(null);
    this.#regionLayer.setSelected(region.id);
    this.#showSelection();
    if (zoom) {
      const focus = regionFocus(region);
      this.#focusWorld(focus.x, focus.z, focus.scale);
    }
    this.#drawMarks();
    this.#syncPlaceDistances();
  }

  #selectLandmark(landmark: MapLandmark, zoom = false): void {
    this.#selected = {
      x: landmark.x,
      z: landmark.z,
      label: landmark.label,
      landmarkId: landmark.id,
    };
    this.#poiLayer.setSelected(landmark.id);
    this.#regionLayer.setSelected(null);
    this.#showSelection();
    if (zoom) {
      this.#focusWorld(landmark.x, landmark.z, 2.6);
    }
    this.#drawMarks();
    this.#syncPlaceDistances();
  }

  #showSelection(): void {
    const selected = this.#selected;
    if (!selected) {
      this.#actions.hidden = true;
      this.#poiLayer.setSelected(null);
      this.#regionLayer.setSelected(null);
      return;
    }
    const pose = this.#getPose();
    const waypoint = this.#getWaypoint();
    const dist = formatMapDistance(distance(pose.x, pose.z, selected.x, selected.z));
    const name = selected.label ?? selectionName(selected);
    const region = selected.regionId
      ? MAP_REGIONS.find((entry) => entry.id === selected.regionId)
      : regionAt(selected.x, selected.z);
    this.#selectionLabel.textContent = name;
    this.#selectionMeta.textContent = region ? `${region.label} · ${dist}` : dist;
    this.#actions.hidden = false;
    this.#teleportButton.hidden = !this.#canTeleport();
    const same =
      waypoint !== null &&
      Math.hypot(waypoint.x - selected.x, waypoint.z - selected.z) < 12;
    this.#waypointButton.textContent = same ? 'Clear waypoint' : 'Set waypoint';
    this.#waypointButton.dataset.mode = same ? 'clear' : 'set';
  }

  #drawBase(): void {
    const ctx = context2d(this.#base);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#backdrop.draw(ctx, BASE_SIZE);
  }

  #syncTerrainSize(): void {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.#stage.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.#stage.clientHeight * dpr));
    if (this.#terrain.width !== width) this.#terrain.width = width;
    if (this.#terrain.height !== height) this.#terrain.height = height;
  }

  #drawTerrain(): void {
    if (!this.open || this.#interacting) return;
    const stage = this.#stageSize();
    // Contain-zoom leaves letterbox around the world square. Painting the
    // aerial into the stage (ocean fill outside 0..1) makes those bars sea
    // instead of empty UI chrome — the 1024 base stays as the pan preview.
    this.#terrain.hidden = false;
    this.#base.style.opacity = this.#backdrop.ready ? '0' : '1';
    this.#syncTerrainSize();
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

  #scheduleHq(): void {
    this.#clearHq();
    this.#hqTimer = window.setTimeout(() => {
      this.#hqTimer = 0;
      this.#drawTerrain();
    }, HQ_DELAY_MS);
  }

  #clearHq(): void {
    if (this.#hqTimer) {
      window.clearTimeout(this.#hqTimer);
      this.#hqTimer = 0;
    }
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

    const stageW = Math.max(1, this.#stage.clientWidth);
    const stageH = Math.max(1, this.#stage.clientHeight);
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
        const from = clampToStage(player.x, player.y, stageW, stageH, 16);
        const to = clampToStage(wp.x, wp.y, stageW, stageH, 16);
        drawGlowRoute(ctx, from.x, from.y, to.x, to.y, 4);
      }
      if (wp) {
        const to = clampToStage(wp.x, wp.y, stageW, stageH, 16);
        if (to.inside) {
          drawWaypointPin(ctx, wp.x, wp.y, 13);
          this.#drawCallout(
            ctx,
            wp.x,
            wp.y,
            `${(waypoint.label ?? 'Waypoint').toUpperCase()} · ${formatMapDistance(distance(pose.x, pose.z, waypoint.x, waypoint.z))}`,
          );
        }
      }
    }

    const you = clampToStage(player.x, player.y, stageW, stageH, 18);
    if (you.inside) drawPlayerChevron(ctx, player.x, player.y, pose.yaw, 13);
    else drawEdgeChevron(ctx, you.x, you.y, you.angle);

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
    if (this.open) {
      this.#drawMarks();
      this.#scheduleHq();
    }
  }

  #syncPlaceDistances(): void {
    const pose = this.#getPose();
    const here = regionAt(pose.x, pose.z);
    for (const landmark of MAP_LANDMARKS) {
      const button = this.#placeButtons.get(landmark.id);
      if (!button) continue;
      const dist = button.querySelector('b');
      if (dist) dist.textContent = formatMapDistance(distance(pose.x, pose.z, landmark.x, landmark.z));
      button.classList.toggle('is-selected', this.#selected?.landmarkId === landmark.id);
    }
    for (const region of MAP_REGIONS) {
      const button = this.#regionButtons.get(region.id);
      if (!button) continue;
      button.classList.toggle('is-selected', this.#selected?.regionId === region.id);
      button.classList.toggle('is-here', region.id === here.id);
    }
  }

  readonly #onMapPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.open) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) return;
    event.preventDefault();
    this.#openedWithMouse = event.pointerType !== 'touch';
    this.#interacting = true;
    this.#terrain.hidden = true;
    this.#base.style.opacity = '1';
    this.#clearHq();
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
    this.#applyView(false);
  };

  readonly #onMapPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#drag = null;
    this.#interacting = false;
    this.#scheduleHq();
    if (drag.moved || !this.open) {
      this.#drawMarks();
      return;
    }
    const point = this.#eventToWorld(event);
    if (!point) return;
    const landmark = nearestLandmark(point.x, point.z, 90);
    if (landmark) {
      this.#selectLandmark(landmark);
      return;
    }
    const region = regionAt(point.x, point.z);
    this.#selected = { x: point.x, z: point.z, label: selectionName(point), regionId: region.id };
    this.#poiLayer.setSelected(null);
    this.#regionLayer.setSelected(region.id);
    this.#showSelection();
    this.#drawMarks();
    this.#syncPlaceDistances();
  };

  readonly #onDoubleClick = (event: MouseEvent): void => {
    if (!this.open) return;
    event.preventDefault();
    const point = this.#eventToWorld(event);
    if (!point) return;
    const landmark = nearestLandmark(point.x, point.z, 90);
    this.#setWaypoint(landmark?.x ?? point.x, landmark?.z ?? point.z, landmark?.label ?? 'Waypoint');
    this.#drawMarks();
  };

  #eventToWorld(event: MouseEvent): MapPoint | null {
    const rect = this.#plane.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
    return mapToWorld(nx, ny, BOUNDS);
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
      this.#drawMarks();
      return;
    }
    const selected = this.#selected;
    if (!selected) return;
    this.#setWaypoint(selected.x, selected.z, selected.label ?? 'Waypoint');
    this.#showSelection();
    this.#drawMarks();
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
    this.focusPlayer(Math.max(this.#viewState.scale, 2.2));
  };

  readonly #onFit = (): void => {
    this.fitIsland();
  };

  readonly #onWheel = (event: WheelEvent): void => {
    if (!this.open) return;
    event.preventDefault();
    const stage = this.#stage.getBoundingClientRect();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.#interacting = true;
    this.#terrain.hidden = true;
    this.#base.style.opacity = '1';
    this.#zoomAt(factor, event.clientX - stage.left, event.clientY - stage.top);
    this.#interacting = false;
    this.#scheduleHq();
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (this.#docked || isTyping() || event.repeat) return;
    if (event.code === 'KeyM') {
      if (!this.open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closeMap(true);
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

  #applyView(hq = true): void {
    const { scale, tx, ty } = this.#viewState;
    this.#view.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    this.#root.dataset.zoom = scale < 1.05 ? 'far' : scale < 3 ? 'mid' : 'near';
    this.#root.classList.toggle('navmap--regionNames', scale < 1.08);
    this.#poiLayer.setViewScale(scale);
    this.#regionLayer.setViewScale(scale);
    this.#syncZoomButtons();
    this.#drawMarks();
    if (hq) this.#drawTerrain();
  }

  #syncZoomButtons(): void {
    const stage = this.#stageSize();
    const min = mapMinScale(stage.width, stage.height);
    this.#zoomOut.disabled = this.#viewState.scale <= min + 0.004;
    this.#zoomIn.disabled = this.#viewState.scale >= MAP_MAX_SCALE - 0.004;
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
    this.#clearHq();
    this.#resize?.disconnect();
    this.#resize = null;
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('pointermove', this.#onMapPointerMove);
    window.removeEventListener('pointerup', this.#onMapPointerUp);
    window.removeEventListener('pointercancel', this.#onMapPointerUp);
    this.#stage.removeEventListener('pointerdown', this.#onMapPointerDown);
    this.#fullCanvas.removeEventListener('dblclick', this.#onDoubleClick);
    this.#stage.removeEventListener('wheel', this.#onWheel);
    this.#poiLayer.dispose();
    this.#roadLayer.dispose();
    this.#regionLayer.dispose();
    this.#backdrop.dispose();
    this.#root.remove();
    this.#selected = null;
    this.#placeButtons.clear();
    this.#regionButtons.clear();
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NavigationMap: Canvas 2D ist nicht verfügbar.');
  return context;
}

function selectionName(point: MapPoint): string {
  const landmark = nearestLandmark(point.x, point.z, 130);
  return landmark ? landmark.label : regionAt(point.x, point.z).label;
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

function clampToStage(
  x: number,
  y: number,
  width: number,
  height: number,
  pad: number,
): { x: number; y: number; angle: number; inside: boolean } {
  const inside = x >= pad && y >= pad && x <= width - pad && y <= height - pad;
  const cx = clamp(x, pad, width - pad);
  const cy = clamp(y, pad, height - pad);
  return { x: cx, y: cy, angle: Math.atan2(y - height * 0.5, x - width * 0.5), inside };
}

function drawEdgeChevron(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI * 0.5);
  ctx.fillStyle = '#ffd257';
  ctx.strokeStyle = 'rgba(6, 12, 14, 0.92)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(6, 6);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
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
