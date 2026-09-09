import { Vector3 } from 'three';

import { FreeFlyController } from '@/camera/FreeFlyController';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { Engine } from '@/core/Engine';
import type { DriveSystem } from '@/game/DriveSystem';
import { GarageStage } from '@/game/GarageStage';
import { walkSpawnZone } from '@/config/walker.config';
import { VEHICLES, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';
import {
  SETUP_LABEL,
  STOCK_TUNE,
  TUNE_CATEGORIES,
  TUNE_COPY,
  TUNE_PRICE,
  TUNE_TIERS,
  anyTuned,
  loadSetup,
  loadTune,
  saveSetup,
  saveTune,
  setupsFor,
  tunePackageCost,
  tuneReadout,
  tunesEqual,
  type CarTune,
  type SetupId,
  type TuneCategory,
  type TuneTier,
} from '@/config/tuning.config';
import { CAR_COPY } from './carPresentation';
import './tuningGarage.css';

export type BayShot = 'hero' | 'engine' | 'wheels' | 'front' | 'rear' | 'orbit';

interface Shot {
  yaw: number;
  pitch: number;
  radius: number;
  fov: number;
  hood: number;
}

const SHOTS: Record<Exclude<BayShot, 'orbit'>, Shot> = {
  hero: { yaw: 0.62, pitch: 0.18, radius: 6.6, fov: 38, hood: 0 },
  engine: { yaw: 0.28, pitch: 0.36, radius: 3.2, fov: 32, hood: 1 },
  wheels: { yaw: 1.22, pitch: 0.07, radius: 3.55, fov: 34, hood: 0 },
  front: { yaw: 0.1, pitch: 0.14, radius: 5.15, fov: 36, hood: 0 },
  rear: { yaw: 2.95, pitch: 0.16, radius: 5.35, fov: 36, hood: 0 },
};

const LOOK = 0.005;
const PITCH_MIN = 0.02;
const PITCH_MAX = 0.72;
const RADIUS_MIN = 2.8;
const RADIUS_MAX = 10;

function flyOf(engine: Engine): FreeFlyController | null {
  for (const system of engine.systems) {
    if (system instanceof FreeFlyController) return system;
  }
  return null;
}

function ease(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export interface TuningGarageOptions {
  readonly engine: Engine;
  readonly drive: DriveSystem;
  readonly atmosphere: AtmosphereUniforms;
  readonly container: HTMLElement;
  owns(id: VehicleId): boolean;
  spend(amount: number): boolean;
  wallet(): number;
  sandbox(): boolean;
  click(): void;
  engineBlip(): void;
  hideWorld?(hidden: boolean): void;
}

/**
 * Cinematic Open Bay — PhotoMode's sibling.
 *
 * The world loop stops (`engine.stop`), DriveSystem is paused, and this class
 * drives `previewFrame` so the bay can orbit without the car rolling off the
 * lift. DOM is the HUD; the car is the real renderer.
 */
export class TuningGarage {
  readonly #o: TuningGarageOptions;
  #close: (() => void) | null = null;

  constructor(options: TuningGarageOptions) {
    this.#o = options;
  }

  get open(): boolean {
    return this.#close !== null;
  }

  dispose(): void {
    this.#close?.();
  }

  show(vehicleId: VehicleId, onExit: (resume?: boolean) => void): void {
    if (this.#close) return;
    const { engine, drive, atmosphere, container } = this.#o;
    const id = this.#o.owns(vehicleId)
      ? vehicleId
      : (VEHICLE_ORDER.find((car) => this.#o.owns(car)) ?? 'touge');
    const camera = engine.camera;
    const savedPos = camera.position.clone();
    const savedQuat = camera.quaternion.clone();
    const savedFov = camera.fov;
    const fly = flyOf(engine);
    const flyWasOn = fly?.enabled ?? false;
    fly?.setEnabled(false);
    if (document.pointerLockElement) document.exitPointerLock();

    const stage = new GarageStage(atmosphere);
    const zone = walkSpawnZone();
    const bayX = zone.x + 22;
    const bayZ = zone.z - 32;
    const bayY = drive.height(bayX, bayZ);
    stage.attach(engine.scene, bayX, bayY, bayZ);
    stage.setCar(id);
    this.#o.hideWorld?.(true);
    drive.hidePresentation?.(true);

    const reduced =
      document.documentElement.classList.contains('reduce-motion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let fitted = loadTune(id);
    let preview: CarTune = { ...fitted };
    let setup = loadSetup(id);
    let filter: TuneCategory | 'all' | 'setup' = 'all';
    let shot: BayShot = 'hero';
    let compare = false;
    let autoOrbit = false;
    let yaw = SHOTS.hero.yaw;
    let pitch = SHOTS.hero.pitch;
    let radius = SHOTS.hero.radius;
    let hood = 0;
    let lift = reduced ? 1 : 0;
    let intro = reduced ? 1 : 0;
    let target: Shot = { ...SHOTS.hero };
    const look = new Vector3();
    const toastTimer = { id: 0 };

    const root = document.createElement('div');
    root.className = 'tune-garage';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Open Bay tuning');
    root.innerHTML = this.#markup(id);
    container.append(root);

    const stageEl = root.querySelector<HTMLElement>('.tune-garage__stage')!;
    const toast = root.querySelector<HTMLElement>('[data-toast]')!;
    const letter = root.querySelector<HTMLElement>('.tune-garage__letter')!;
    let closed = false;

    const showToast = (text: string): void => {
      toast.textContent = text;
      toast.hidden = false;
      window.clearTimeout(toastTimer.id);
      toastTimer.id = window.setTimeout(() => {
        toast.hidden = true;
      }, 1800);
    };

    const shownTune = (): CarTune => (compare ? fitted : preview);

    const applyShot = (next: BayShot, snap = false): void => {
      shot = next;
      autoOrbit = next === 'orbit';
      if (next !== 'orbit') target = { ...SHOTS[next] };
      if (snap) {
        yaw = target.yaw;
        pitch = target.pitch;
        radius = target.radius;
        hood = target.hood;
        camera.fov = target.fov;
        camera.updateProjectionMatrix();
      }
      for (const button of root.querySelectorAll<HTMLElement>('[data-shot]')) {
        button.classList.toggle('is-on', button.dataset.shot === next);
      }
    };

    const paintHud = (): void => {
      if (closed || !root.isConnected) return;
      const live = shownTune();
      const read = tuneReadout(id, live);
      const stock = tuneReadout(id, STOCK_TUNE);
      root.querySelector('[data-car-name]')!.textContent = CAR_COPY[id].name;
      root.querySelector('[data-wallet]')!.textContent = this.#o
        .wallet()
        .toLocaleString('en-US');
      const cost = tunePackageCost(fitted, preview);
      const buy = root.querySelector<HTMLButtonElement>('[data-action="buy"]')!;
      const same = tunesEqual(fitted, preview);
      buy.disabled = same || (cost > 0 && this.#o.wallet() < cost && !this.#o.sandbox());
      buy.textContent = same
        ? 'Fitted'
        : cost === 0
          ? 'Fit'
          : `Buy and fit · ${cost.toLocaleString('en-US')}`;
      const tuned = anyTuned(live);
      root.querySelector<HTMLElement>('[data-badge]')!.hidden = !tuned;
      root.classList.toggle('is-tuned', tuned);
      const bars = root.querySelectorAll<HTMLElement>('[data-bar]');
      for (const bar of bars) {
        const key = bar.dataset.bar as TuneCategory | 'speed';
        bar.style.setProperty('--fill', `${read.bars[key]}%`);
      }
      root.querySelector('[data-stat-speed]')!.textContent = `${Math.round(read.speedKmh)} km/h`;
      root.querySelector('[data-stat-grip]')!.textContent = `${read.latG.toFixed(2)} g`;
      root.querySelector('[data-stat-brake]')!.textContent = `${read.brakeG.toFixed(2)} g`;
      const dSpeed = read.speedKmh - stock.speedKmh;
      const dGrip = read.latG - stock.latG;
      root.querySelector('[data-delta]')!.textContent = compare
        ? 'Holding fitted setup'
        : `${dSpeed >= 0 ? '+' : ''}${dSpeed.toFixed(1)} km/h · ${dGrip >= 0 ? '+' : ''}${dGrip.toFixed(2)} g`;
      this.#paintRail(root, id, fitted, preview, setup, filter, cost);
      const focus: TuneCategory | 'setup' | null =
        shot === 'engine' ? 'engine'
        : shot === 'wheels' ? 'tyres'
        : filter === 'all' ? null
        : filter;
      stage.setTuneVisual(live, focus);
    };

    const placeCamera = (): void => {
      stage.carCenter(look);
      look.y += 0.15;
      const cp = Math.cos(pitch);
      camera.position.set(
        look.x + Math.sin(yaw) * cp * radius,
        look.y + Math.sin(pitch) * radius,
        look.z - Math.cos(yaw) * cp * radius,
      );
      camera.lookAt(look);
    };

    engine.stop();
    let frame = 0;
    let previous = performance.now();
    let pointer: { id: number; x: number; y: number } | null = null;

    const tick = (now: number): void => {
      if (closed) return;
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (!reduced && intro < 1) {
        intro = Math.min(1, intro + dt / 1.55);
        lift = ease(intro / 0.55);
        const door: Shot = { yaw: 0.04, pitch: 0.1, radius: 9.2, fov: 42, hood: 0 };
        const k = ease((intro - 0.18) / 0.82);
        yaw = door.yaw + (SHOTS.hero.yaw - door.yaw) * k;
        pitch = door.pitch + (SHOTS.hero.pitch - door.pitch) * k;
        radius = door.radius + (SHOTS.hero.radius - door.radius) * k;
        camera.fov = door.fov + (SHOTS.hero.fov - door.fov) * k;
        camera.updateProjectionMatrix();
        letter.style.setProperty('--letter', `${(1 - ease(intro)) * 9 + 3.5}vh`);
      } else {
        lift = 1;
        letter.style.setProperty('--letter', '3.5vh');
        if (autoOrbit) yaw += dt * 0.22;
        else {
          const follow = 1 - Math.pow(0.0008, dt);
          yaw += (target.yaw - yaw) * follow;
          pitch += (target.pitch - pitch) * follow;
          radius += (target.radius - radius) * follow;
          hood += (target.hood - hood) * follow;
          camera.fov += (target.fov - camera.fov) * follow;
          camera.updateProjectionMatrix();
        }
      }
      stage.setLift(lift);
      stage.setHood(hood);
      stage.update(dt);
      placeCamera();
      engine.previewFrame(dt);
      frame = requestAnimationFrame(tick);
    };

    const close = (resume = false): void => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(toastTimer.id);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
      stage.dispose();
      this.#o.hideWorld?.(false);
      drive.hidePresentation?.(false);
      root.remove();
      this.#close = null;
      fly?.setEnabled(flyWasOn);
      engine.start();
      onExit(resume);
    };

    const onKey = (event: KeyboardEvent): void => {
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        event.preventDefault();
        if (event.type === 'keydown') close(false);
        return;
      }
      if (event.type !== 'keydown' || event.repeat) return;
      if (event.code === 'KeyQ') applyShot('hero');
      if (event.code === 'KeyE') applyShot('engine');
      if (event.code === 'KeyC') compare = event.type === 'keydown';
    };

    stageEl.onpointerdown = (event) => {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      stageEl.setPointerCapture(event.pointerId);
      autoOrbit = false;
      shot = 'hero';
    };
    stageEl.onpointermove = (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      yaw -= dx * LOOK;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * LOOK));
      target.yaw = yaw;
      target.pitch = pitch;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    stageEl.onpointerup = () => {
      pointer = null;
    };
    stageEl.onpointercancel = () => {
      pointer = null;
    };
    stageEl.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        radius = Math.max(
          RADIUS_MIN,
          Math.min(RADIUS_MAX, radius + Math.sign(event.deltaY) * 0.45),
        );
        target.radius = radius;
      },
      { passive: false },
    );

    root.onclick = (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      this.#o.click();
      const action = button.dataset.action;
      const nextShot = button.dataset.shot as BayShot | undefined;
      const nextFilter = button.dataset.filter as typeof filter | undefined;
      const tier = button.dataset.tier;
      const cat = button.dataset.cat as TuneCategory | undefined;
      const nextSetup = button.dataset.setup as SetupId | undefined;
      if (action === 'exit') close(false);
      if (action === 'drive') close(true);
      if (action === 'restore') {
        preview = { ...STOCK_TUNE };
        paintHud();
        showToast('Factory preview');
      }
      if (action === 'buy') {
        const cost = tunePackageCost(fitted, preview);
        if (tunesEqual(fitted, preview)) return;
        if (!this.#o.spend(cost)) {
          showToast('Not enough Sparks');
          return;
        }
        const engineChanged = preview.engine !== fitted.engine;
        fitted = { ...preview };
        saveTune(id, fitted);
        if (drive.vehicleId === id) drive.setCarTune(fitted);
        stage.pulseInstall();
        if (engineChanged) this.#o.engineBlip();
        applyShot(engineChanged ? 'engine' : shot === 'orbit' ? 'orbit' : 'hero');
        showToast(cost === 0 ? 'Fitted' : `−${cost.toLocaleString('en-US')} Sparks`);
        paintHud();
      }
      if (nextShot) applyShot(nextShot);
      if (nextFilter) {
        filter = nextFilter;
        if (nextFilter === 'engine') applyShot('engine');
        else if (nextFilter === 'tyres' || nextFilter === 'brakes') applyShot('wheels');
        else if (nextFilter === 'steering') applyShot('front');
        paintHud();
      }
      if (cat && tier !== undefined) {
        if (filter === 'all') filter = cat;
        else preview = { ...preview, [cat]: Number(tier) as TuneTier };
        if (cat === 'engine') applyShot('engine');
        if (cat === 'tyres' || cat === 'brakes') applyShot('wheels');
        if (cat === 'steering') applyShot('front');
        paintHud();
      }
      if (nextSetup) {
        setup = nextSetup;
        saveSetup(id, setup);
        if (drive.vehicleId === id) drive.setCarSetup?.(setup);
        filter = 'setup';
        paintHud();
        showToast(`${SETUP_LABEL[setup]} setup`);
      }
    };

    const compareBtn = root.querySelector<HTMLButtonElement>('[data-action="compare"]');
    const holdCompare = (down: boolean): void => {
      compare = down;
      compareBtn?.classList.toggle('is-on', down);
      paintHud();
    };
    if (compareBtn) {
      compareBtn.onpointerdown = (event) => {
        event.preventDefault();
        compareBtn.setPointerCapture(event.pointerId);
        holdCompare(true);
      };
      compareBtn.onpointerup = () => holdCompare(false);
      compareBtn.onpointercancel = () => holdCompare(false);
    }

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    applyShot('hero', reduced);
    paintHud();
    this.#close = () => close(false);
    frame = requestAnimationFrame(tick);
  }

  #markup(id: VehicleId): string {
    const copy = CAR_COPY[id];
    const spec = VEHICLES[id];
    const tools: Array<[BayShot, string, string]> = [
      ['hero', '▣', 'Showroom'],
      ['engine', '⎔', 'Engine'],
      ['wheels', '◎', 'Wheels'],
      ['front', '⌃', 'Front'],
      ['rear', '⌄', 'Rear'],
      ['orbit', '↻', 'Orbit'],
    ];
    const bars: Array<[string, string]> = [
      ['engine', 'Engine'],
      ['brakes', 'Brakes'],
      ['steering', 'Steer'],
      ['tyres', 'Tyres'],
      ['speed', 'Speed'],
    ];
    return `
      <div class="tune-garage__letter" aria-hidden="true"></div>
      <div class="tune-garage__vignette" aria-hidden="true"></div>
      <div class="tune-garage__stage" aria-label="Drag to orbit the car"></div>
      <header class="tune-garage__top">
        <div class="tune-garage__brand">
          <span>Open Bay</span>
          <strong>Tune</strong>
        </div>
        <div class="tune-garage__title">
          <span>Bay 1 · ${spec.category}</span>
          <strong data-car-name>${copy.name}</strong>
        </div>
        <div class="tune-garage__wallet">
          <span>Sparks</span>
          <strong data-wallet>0</strong>
        </div>
        <button type="button" data-action="drive">Take it out</button>
        <button type="button" data-action="exit">Leave bay</button>
      </header>
      <aside class="tune-garage__stats">
        <p class="tune-garage__kicker">Output</p>
        <div class="tune-garage__read">
          <span><strong data-stat-speed>—</strong>top</span>
          <span><strong data-stat-grip>—</strong>grip</span>
          <span><strong data-stat-brake>—</strong>stop</span>
        </div>
        ${bars
          .map(
            ([key, label]) =>
              `<label class="tune-garage__bar">${label}<i data-bar="${key}"></i></label>`,
          )
          .join('')}
        <p class="tune-garage__delta" data-delta></p>
      </aside>
      <aside class="tune-garage__tools">
        ${tools
          .map(
            ([shot, icon, label]) =>
              `<button type="button" data-shot="${shot}" title="${label}" aria-label="${label}"><span aria-hidden="true">${icon}</span></button>`,
          )
          .join('')}
      </aside>
      <div class="tune-garage__badge" data-badge hidden>TUNED</div>
      <footer class="tune-garage__dock">
        <div class="tune-garage__filters" role="tablist" aria-label="Parts">
          <button type="button" data-filter="all" class="is-on">All</button>
          <button type="button" data-filter="engine">Engine</button>
          <button type="button" data-filter="brakes">Brakes</button>
          <button type="button" data-filter="steering">Steering</button>
          <button type="button" data-filter="tyres">Tyres</button>
          <button type="button" data-filter="setup">Setup</button>
        </div>
        <div class="tune-garage__rail" data-rail></div>
        <div class="tune-garage__buy">
          <button type="button" data-action="compare">Hold to compare</button>
          <button type="button" data-action="restore">Factory</button>
          <button type="button" class="tune-garage__fit" data-action="buy">Buy and fit</button>
        </div>
      </footer>
      <p class="tune-garage__toast" data-toast hidden></p>
    `;
  }

  #paintRail(
    root: HTMLElement,
    id: VehicleId,
    fitted: CarTune,
    preview: CarTune,
    setup: SetupId,
    filter: TuneCategory | 'all' | 'setup',
    _cost: number,
  ): void {
    const rail = root.querySelector('[data-rail]')!;
    const cards: string[] = [];
    const filters = root.querySelectorAll<HTMLElement>('[data-filter]');
    for (const button of filters) {
      button.classList.toggle('is-on', button.dataset.filter === filter);
    }
    if (filter === 'setup') {
      for (const value of setupsFor(id)) {
        const on = setup === value;
        cards.push(
          `<button type="button" class="tune-garage__card${on ? ' is-fitted is-on' : ''}" data-setup="${value}">
            <span class="tune-garage__icon" data-kind="setup"></span>
            <b>Handling</b>
            <strong>${SETUP_LABEL[value]}</strong>
            <em>${on ? 'Active' : 'Free'}</em>
            <i class="tune-garage__fill" style="--fill:${on ? 100 : 0}%"></i>
          </button>`,
        );
      }
    } else {
      const cats = filter === 'all' ? TUNE_CATEGORIES : [filter];
      for (const cat of cats) {
        const copy = TUNE_COPY[cat];
        for (let tier = 0 as TuneTier; tier <= 2; tier = (tier + 1) as TuneTier) {
          if (filter === 'all' && tier !== preview[cat]) continue;
          const on = preview[cat] === tier;
          const owned = fitted[cat] >= tier;
          const price = TUNE_PRICE[cat][tier]!;
          const fill = ([0, 50, 100] as const)[tier]!;
          cards.push(
            `<button type="button" class="tune-garage__card${on ? ' is-on' : ''}${owned ? ' is-fitted' : ''}" data-cat="${cat}" data-tier="${tier}">
              <span class="tune-garage__icon" data-kind="${cat}"></span>
              <b>${copy.part}</b>
              <strong>${copy.title} · ${TUNE_TIERS[tier]}</strong>
              <em>${owned ? 'Owned' : price === 0 ? 'Stock' : `${price.toLocaleString('en-US')} Sparks`}</em>
              <i class="tune-garage__fill" style="--fill:${fill}%"></i>
            </button>`,
          );
        }
      }
    }
    rail.innerHTML = cards.join('');
  }
}
