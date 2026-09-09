import {
  loadTune, saveTune, tunedArcade, loadSetup, saveSetup, setupsFor, SETUP_LABEL,
  TUNE_TIERS,
  type CarTune, type TuneCategory, type TuneTier, type SetupId,
} from '@/config/tuning.config';
import { topSpeed } from '@/config/arcade.config';
import aerialMapUrl from "../../assets/generated/terrain/navigation-map.webp?url";
import {
  QUALITY,
  QUALITY_LEVELS,
  CUSTOM_LIMITS,
  type QualityKey,
  type CustomQuality,
} from "@/config/quality.config";
import {
  VEHICLES,
  VEHICLE_ORDER,
  type VehicleId,
} from "@/config/vehicles.config";
import type { RaceEvent } from "@/config/events.config";
import type { AppBus } from "@/core/events";
import type { CameraPlacer } from "@/debug/viewpoints";
import { formatTime } from "@/game/BestTimes";
import {
  TouchControls,
  type TouchCameraTarget,
  type TouchDriveTarget,
} from "./TouchControls";
import {
  CONTROLS,
  DRIVE_CONTROLS,
  TOUCH_DRIVE_CONTROLS,
  controlTable,
} from "./controls";
import { CAR_COPY, carPortrait } from "./carPresentation";
import "./theme.css";
import "./playerMenu.css";

export interface QualityControl {
  readonly level: QualityKey;
  set(level: QualityKey): void;
  setCustom(patch: Partial<CustomQuality>): void;
  seedCustomFrom(level: QualityKey): void;
  reclassify(): void;
}
export interface DebugControl {
  statsVisible: boolean;
  paneVisible: boolean;
}
export interface DriveControl extends TouchDriveTarget {
  readonly vehicleId: VehicleId;
  setVehicle(id: VehicleId): void;
  setCarTune(tune:CarTune):void;
  setCarSetup?(setup: SetupId): void;
  /** Welt anhalten, solange das Menü offen ist. Optional, damit Prüfstände ohne Physik durchlaufen. */
  setPaused?(paused: boolean): void;
  hidePresentation?(hide: boolean): void;
}
export interface AudioControl {
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  click(): void;
  engineBlip?(): void;
}
export interface EventsControl {
  readonly list: readonly RaceEvent[];
  readonly yen: number;
  bestOf(eventId: string): number | null;
  driftBestOf(eventId: string): number;
  readonly runningEvent: string | null;
  start(eventId: string): void;
  abort(): void;
  owns(id: VehicleId): boolean;
  price(id: VehicleId): number;
  buy(id: VehicleId): boolean;
  enterCode(code: string): boolean;
  onChange(fn: () => void): void;
  spend?(amount: number): boolean;
  sandbox?(): boolean;
}
export interface PlayerUiOptions {
  readonly bus: AppBus;
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly quality: QualityControl;
  readonly drive?: DriveControl;
  readonly audio?: AudioControl;
  readonly hud?: { setMenuOpen(open: boolean): void };
  readonly camera: CameraPlacer & TouchCameraTarget;
  readonly debug?: DebugControl;
  readonly events?: EventsControl;
  readonly openMap?: () => void;
  readonly openPhoto?: (onExit: (resume?: boolean) => void) => void;
  readonly openTune?: (onExit: (resume?: boolean) => void) => void;
  readonly callCar?: () => string;
  /** Frameschleife anhalten, solange niemand am Menü sitzt. */
  readonly sleepWorld?: (sleeping: boolean) => void;
}
type Tab = "play" | "cars" | "map" | "records" | "photo" | "settings";
/** Ohne Eingabe im Pausenmenü: rAF aus. Der Canvas hält den letzten Frame. */
const MENU_SLEEP_MS = 30_000;
const TABS: readonly Tab[] = [
  "play",
  "cars",
  "map",
  "records",
  "photo",
  "settings",
];

/** Spieleroberfläche: Vorschau und ausdrückliche Aktionen bleiben getrennt. */
export class PlayerUi {
  readonly #o: PlayerUiOptions;
  readonly #menu: HTMLElement;
  readonly #touch: TouchControls;
  readonly #off: Array<() => void> = [];
  #started = false;
  #open = false;
  #map = false;
  #photo = false;
  #garage = false;
  #tab: Tab = "play";
  #catalogue: "owned" | "showroom" = "owned";
  #preview: VehicleId;
  #idleTimer: number | null = null;
  #worldSleeping = false;

  constructor(options: PlayerUiOptions) {
    this.#o = options;
    this.#preview = options.drive?.vehicleId ?? "touge";
    this.#menu = this.#build();
    options.container.append(this.#menu);
    this.#touch = new TouchControls({
      canvas: options.canvas,
      container: options.container,
      camera: options.camera,
      onMenu: () => this.#show(),
      ...(options.drive ? { drive: options.drive } : {}),
    });
    this.#off.push(
      options.bus.on("quality:changed", () => this.#syncQuality()),
      options.bus.on("drive:mode", () => this.#syncDrive()),
      options.bus.on("walk:mode", () => this.#syncDrive()),
      options.bus.on("drive:vehicle", () => {
        this.#preview = options.drive?.vehicleId ?? "touge";
        this.#cars();
      }),
      options.bus.on("map:open", () => {
        this.#map = true;
        this.#open = false;
        this.#render();
      }),
      options.bus.on("map:close", ({ resume }) => {
        this.#map = false;
        if (!resume) this.#show();
        else this.#render();
      }),
    );
    options.events?.onChange(() => {
      this.#syncIdentity();
      if (this.#open) {
        this.#cars();
        this.#records();
      }
    });
    document.addEventListener("pointerlockchange", this.#lockChanged);
    document.addEventListener("pointerlockerror", this.#lockError);
    window.addEventListener("keydown", this.#key, true);
    document.addEventListener("visibilitychange", this.#onVisibility);
    this.#menu.addEventListener("pointerdown", this.#onMenuActivity, {
      capture: true,
    });
    this.#menu.addEventListener("keydown", this.#onMenuActivity, {
      capture: true,
    });
    this.#menu.addEventListener("wheel", this.#onMenuActivity, {
      capture: true,
      passive: true,
    });
    this.#qualityControls();
    this.#syncQuality();
    this.#syncDrive();
    this.#cars();
    this.#records();
    this.#events();
    this.#syncIdentity();
    this.#render();
  }
  begin(): void {
    this.#started = true;
    this.#resume();
  }
  openCommonsShop(tune: boolean): void {
    if (tune && this.#o.openTune) {
      this.#enterTune();
      return;
    }
    this.#show();
    if (document.pointerLockElement) document.exitPointerLock();
    this.#tab = "cars";
    const title = this.#el('[data-panel="cars"] h1');
    title.textContent = tune ? "Open Bay · Tune" : "Petal Motors · Cars";
    const note = this.#el('[data-panel="cars"] .menu__garageNote');
    note.textContent = tune
      ? "Open Bay · Tune — Engine, Brakes, Steering, Tyres. Fit Stock, Street or Sport to each owned car for free."
      : "Petal Motors · Browse your cars or the showroom.";
    title.insertAdjacentElement("afterend", note);
    this.#el('[data-panel="cars"]').scrollTop = 0;
    this.#render();
  }
  get playing(): boolean {
    return this.#started && !this.#open && !this.#map && !this.#photo && !this.#garage;
  }
  #show(): void {
    this.#open = true;
    this.#tab = "play";
    this.#events();
    this.#cars();
    this.#records();
    this.#syncDrive();
    this.#syncIdentity();
    this.#render();
    this.#el(".menu__resume").focus();
  }
  #resume(requestLock = true): void {
    this.#open = false;
    this.#render();
    if (!requestLock || this.#touch.enabled) return;
    if (typeof this.#o.canvas.requestPointerLock !== "function") return;
    const result: unknown = this.#o.canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(() => this.#lockError());
  }
  readonly #lockChanged = (): void => {
    if (document.pointerLockElement === this.#o.canvas) {
      this.#started = true;
      this.#open = false;
      this.#render();
    } else if (
      this.#started &&
      !this.#touch.enabled &&
      !this.#map &&
      !this.#photo &&
      !this.#garage
    ) {
      if (this.#open) this.#render();
      else this.#show();
    }
  };
  readonly #lockError = (): void => {
    if (!this.#photo && !this.#map && !this.#garage) this.#show();
  };
  readonly #key = (event: KeyboardEvent): void => {
    if (!this.#started || this.#map || this.#photo || this.#garage) return;
    if (event.code === "Escape") {
      // Nur ohne Lock: mit Lock gibt der Browser den Zeiger frei, und
      // `#lockChanged` öffnet das Menü. Escape *im* Menü darf den Lock nicht
      // anfordern — Chrome lehnt eine Lock-Anfrage in derselben Escape-Geste
      // ab, `#lockError` riss das Menü dann sofort wieder auf.
      if (document.pointerLockElement === this.#o.canvas) return;
      event.preventDefault();
      if (this.#open) this.#resume(false);
      else this.#show();
      return;
    }
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    if (event.code === "KeyP") {
      event.preventDefault();
      this.#enterPhoto();
    }
  };
  #render(): void {
    this.#menu.hidden =
      !this.#open || document.pointerLockElement === this.#o.canvas;
    this.#touch.setVisible(
      this.#started && !this.#open && !this.#map && !this.#photo && !this.#garage,
    );
    this.#o.hud?.setMenuOpen(this.#open || this.#photo || this.#map || this.#garage);
    this.#o.drive?.setPaused?.(this.#open || this.#photo || this.#map || this.#garage);
    if (this.#open && !this.#photo && !this.#garage) this.#armIdleSleep();
    else {
      this.#clearIdleSleep();
      if (!this.#photo && !this.#garage) this.#setWorldSleep(false);
    }
    for (const panel of this.#menu.querySelectorAll<HTMLElement>(
      "[data-panel]",
    ))
      panel.hidden = panel.dataset.panel !== this.#tab;
    for (const button of this.#menu.querySelectorAll<HTMLElement>(
      "[data-tab]",
    )) {
      button.classList.toggle("is-active", button.dataset.tab === this.#tab);
      button.setAttribute(
        "aria-current",
        button.dataset.tab === this.#tab ? "page" : "false",
      );
    }
  }
  #build(): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "menu player-menu";
    menu.hidden = true;
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", "Player menu");
    const icons = ["▷", "▰", "◇", "◷", "◎", "⚙"];
    menu.innerHTML = `<div class="menu__box">
      <div class="menu__wash" aria-hidden="true"></div>
      <header class="menu__identity">
        <div class="menu__now">
          <div class="menu__nowArt" data-now-art></div>
          <div>
            <p class="menu__eyebrow">Current car</p>
            <p class="menu__nowName" data-now-name></p>
            <p class="menu__nowMeta" data-now-meta></p>
          </div>
        </div>
        <div class="menu__brand">
          <button class="menu__title" aria-label="japanMap">japanMap</button>
          <p class="menu__eyebrow">After the rain</p>
          <form class="menu__code" hidden><input aria-label="Code" maxlength="12" autocomplete="off" /></form>
        </div>
        <div class="menu__wallet">
          <span class="menu__walletLabel">Sparks</span>
          <strong data-wallet>0</strong>
        </div>
      </header>
      <nav class="menu__tabs" aria-label="Main destinations">${TABS.map((key, i) => `<button class="menu__tab" aria-label="${key[0]!.toUpperCase() + key.slice(1)}" data-tab="${key}" data-icon="${icons[i]}">${key[0]!.toUpperCase() + key.slice(1)}</button>`).join("")}</nav>
      <button class="menu__resume">Continue <span aria-hidden="true">↗</span></button>
      <section class="menu__panel" data-panel="play">
        <div class="menu__hub">
          <button type="button" class="menu__tile menu__tile--hero" data-go="cars">
            <div class="menu__tileArt" data-hero-art></div>
            <span class="menu__tileKicker">Garage</span>
            <span class="menu__tileTitle">Change Car</span>
            <span class="menu__tileMeta" data-owned-count></span>
          </button>
          <button type="button" class="menu__tile menu__tile--sakura" data-go="cars" data-open-tune>
            <span class="menu__tileKicker">Open Bay</span>
            <span class="menu__tileTitle">Tune Car</span>
            <span class="menu__tileMeta">Cinematic bay · Engine · Brakes · Tyres</span>
          </button>
          <button type="button" class="menu__drive menu__tile menu__tile--paddy" aria-label="Enter car">
            <span class="menu__tileTitle">Enter car</span>
            <span class="menu__tileMeta">Take the wheel</span>
          </button>
          <button type="button" class="menu__call menu__tile menu__tile--call" aria-label="Call car">
            <span class="menu__tileTitle">Call car</span>
            <span class="menu__tileMeta">Spawn it beside you</span>
          </button>
          <button type="button" class="menu__explore menu__tile menu__tile--map">
            <span class="menu__tileKicker">Island</span>
            <span class="menu__tileTitle">Island Map</span>
            <span class="menu__tileMeta">Pass, coast, village</span>
          </button>
          <button type="button" class="menu__tile menu__tile--records" data-go="records">
            <span class="menu__tileTitle">Records</span>
            <span class="menu__tileMeta">Times, scores, bests</span>
          </button>
          <button type="button" class="menu__tile menu__tile--photo" data-go="photo">
            <span class="menu__tileTitle">Photo Mode</span>
            <span class="menu__tileMeta">Freeze the world</span>
          </button>
        </div>
        <h2 class="menu__hubHead">Pick a drive</h2>
        <div class="menu__events"></div>
        <p class="menu__status" role="status"></p>
      </section>
      <section class="menu__panel" data-panel="cars" hidden><p class="menu__eyebrow">YOUR GARAGE</p><h1>Find your line.</h1><div class="menu__switch"><button data-catalogue="owned">Owned</button><button data-catalogue="showroom">Showroom</button></div><div class="menu__carDetail"></div><div class="menu__cars"></div><p class="menu__note menu__garageNote">Ten original cars. Purchases use Sparks. Tune in Open Bay — Street and Sport are incremental buys on this car's own stock.</p></section>
      <section class="menu__panel" data-panel="map" hidden><p class="menu__eyebrow">TAKE A DIFFERENT TURN</p><h1>Beyond the neon.</h1><div class="menu__mapHero"><img src="${aerialMapUrl}" alt="Aerial map of the island" loading="lazy" /></div><p class="menu__intro">Trace the pass, set a waypoint, or follow the coast. Opening the map keeps you where you are.</p><button class="menu__openMap">Open map</button><p class="menu__note">Stillwater Village lies on the western paddies. Tideglass Harbour is the working port on the east coast.</p></section>
      <section class="menu__panel" data-panel="records" hidden><p class="menu__eyebrow">MAKE IT PERSONAL</p><h1>Your best moments.</h1><h2>Event records</h2><div class="menu__records"></div><p class="menu__note">Saved event bests appear here. Driving milestones, discoveries and the garage wall are not tracked yet.</p></section>
      <section class="menu__panel" data-panel="photo" hidden><p class="menu__eyebrow">KEEP THE VIEW</p><h1>Stay a little longer.</h1><div class="menu__photoHero" aria-hidden="true">＋</div><p class="menu__intro">Freeze the world, fly with WASD, Space and Shift, zoom with the wheel and keep a clean PNG. Return to exactly the view you left.</p><button class="menu__openPhoto">Enter Photo mode</button><p class="menu__note">Capture High fills trees and grass in view at cinema density, then puts your graphics preset back.</p></section>
      <section class="menu__panel" data-panel="settings" hidden><p class="menu__eyebrow">MAKE YOURSELF AT HOME</p><h1>Settings</h1><details open><summary>Graphics</summary><div class="menu__levels"></div><p class="menu__effect"></p><details><summary>Custom graphics</summary><div class="menu__sliders"></div></details><button class="menu__reclassify">Recalibrate</button></details><details><summary>Audio</summary><button class="menu__mute">Sound on</button></details><details><summary>Accessibility</summary><label class="menu__row">UI scale<select class="menu__scale"><option value="90">90%</option><option value="100" selected>100%</option><option value="115">115%</option><option value="130">130%</option></select></label><label class="menu__row">Speed units<select class="menu__units"><option value="kmh">km/h</option><option value="mph">mph</option></select></label><label class="menu__row">Reduced motion<input class="menu__motion" type="checkbox" /></label></details><details><summary>Controls</summary><h3>On foot</h3>${controlTable(CONTROLS, "keytable")}<h3>Driving</h3>${controlTable(DRIVE_CONTROLS, "keytable")}${controlTable(TOUCH_DRIVE_CONTROLS, "keytable")}<h3>Photo</h3><p>WASD fly, Space / Shift up / down, wheel zoom, drag to look. On a phone the on-screen pad remains. P opens Photo; Escape leaves it.</p></details><details><summary>Progress</summary><p class="menu__note">Event bests and owned cars use this browser's existing save. Sparks purchases and tuning are saved in this browser.</p></details></section>
    </div>`;
    const el = (s: string): HTMLElement => menu.querySelector<HTMLElement>(s)!;
    el(".menu__resume").onclick = () => this.#resume();
    el(".menu__drive").onclick = () => {
      this.#o.drive?.toggleVehicle();
      this.#resume();
    };
    el(".menu__call").onclick = () => {
      el(".menu__status").textContent =
        this.#o.callCar?.() ?? "Call car is unavailable here.";
    };
    el(".menu__explore").onclick = () => {
      this.#tab = "map";
      this.#render();
    };
    el(".menu__openMap").onclick = () => this.#o.openMap?.();
    el(".menu__openPhoto").onclick = () => this.#enterPhoto();
    el(".menu__reclassify").onclick = () => this.#o.quality.reclassify();
    el(".menu__mute").onclick = () => {
      const audio = this.#o.audio;
      if (audio) {
        audio.setMuted(!audio.muted);
        el(".menu__mute").textContent = audio.muted ? "Sound off" : "Sound on";
      }
    };
    el(".menu__title").onclick = () => {
      el(".menu__code").hidden = !el(".menu__code").hidden;
      if (!el(".menu__code").hidden)
        menu.querySelector<HTMLInputElement>(".menu__code input")?.focus();
    };
    menu.querySelector<HTMLFormElement>(".menu__code")!.onsubmit = (event) => {
      event.preventDefault();
      const input = menu.querySelector<HTMLInputElement>(".menu__code input")!;
      if (this.#o.events?.enterCode(input.value)) {
        input.value = "";
        el(".menu__code").hidden = true;
        this.#cars();
      } else {
        input.setCustomValidity("Code not recognised");
        input.reportValidity();
        input.oninput = () => input.setCustomValidity("");
      }
    };
    for (const button of menu.querySelectorAll<HTMLButtonElement>("[data-tab]"))
      button.onclick = () => {
        this.#tab = button.dataset.tab as Tab;
        this.#render();
      };
    for (const button of menu.querySelectorAll<HTMLButtonElement>("[data-go]"))
      button.onclick = () => {
        if (button.hasAttribute("data-open-tune") && this.#o.openTune) {
          this.#enterTune();
          return;
        }
        this.#tab = button.dataset.go as Tab;
        if (button.hasAttribute("data-open-tune")) this.#catalogue = "owned";
        if (this.#tab === "cars") this.#cars();
        this.#render();
        if (button.hasAttribute("data-open-tune")) {
          const tune = menu.querySelector<HTMLDetailsElement>(".menu__tune");
          if (tune) tune.open = true;
        }
      };
    for (const button of menu.querySelectorAll<HTMLButtonElement>(
      "[data-catalogue]",
    ))
      button.onclick = () => {
        this.#catalogue = button.dataset.catalogue as "owned" | "showroom";
        this.#cars();
      };
    const scale = menu.querySelector<HTMLSelectElement>(".menu__scale")!,
      units = menu.querySelector<HTMLSelectElement>(".menu__units")!,
      motion = menu.querySelector<HTMLInputElement>(".menu__motion")!;
    try {
      scale.value = localStorage.getItem("japanMap.uiScale") ?? "100";
      units.value = localStorage.getItem("japanMap.units") ?? "kmh";
      motion.checked =
        localStorage.getItem("japanMap.reducedMotion") === "true";
    } catch {
      /* Sitzung bleibt bedienbar. */
    }
    const prefs = (): void => {
      const n = Number(scale.value) || 100;
      menu.style.setProperty("--ui-scale", String(n / 100));
      document.documentElement.style.setProperty(
        "--player-ui-scale",
        String(n / 100),
      );
      menu.classList.toggle("player-menu--large", n > 100);
      document.documentElement.dataset.speedUnits = units.value;
      document.documentElement.classList.toggle(
        "reduce-motion",
        motion.checked,
      );
      try {
        localStorage.setItem("japanMap.uiScale", String(n));
        localStorage.setItem("japanMap.units", units.value);
        localStorage.setItem("japanMap.reducedMotion", String(motion.checked));
      } catch {
        /* Nur Sitzung. */
      }
    };
    [scale, units, motion].forEach((input) =>
      input.addEventListener("change", prefs),
    );
    prefs();
    menu.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const items = [
        ...menu.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,summary",
        ),
      ].filter((e) => e.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    return menu;
  }
  #enterTune(): void {
    if (!this.#o.openTune || this.#garage) return;
    this.#garage = true;
    this.#open = false;
    this.#render();
    if (document.pointerLockElement) document.exitPointerLock();
    this.#o.openTune((resume) => {
      this.#garage = false;
      if (resume) {
        this.#resume();
        return;
      }
      this.#open = true;
      this.#tab = "cars";
      this.#catalogue = "owned";
      this.#cars();
      this.#render();
    });
  }
  #enterPhoto(): void {
    if (!this.#o.openPhoto || this.#photo) return;
    this.#photo = true;
    this.#open = false;
    this.#render();
    this.#o.openPhoto((resume) => {
      this.#photo = false;
      if (resume) {
        this.#resume();
        return;
      }
      this.#open = true;
      this.#tab = "photo";
      this.#render();
      this.#el(".menu__openPhoto").focus();
    });
  }
  #syncDrive(): void {
    const drive = this.#o.drive;
    const label = drive?.active ? "Get out" : "Enter car";
    const button = this.#el(".menu__drive");
    button.setAttribute("aria-label", label);
    const title = button.querySelector(".menu__tileTitle");
    if (title) title.textContent = label;
    else button.textContent = label;
    const meta = button.querySelector(".menu__tileMeta");
    if (meta)
      meta.textContent = drive?.active ? "Leave it parked" : "Take the wheel";
    this.#el(".menu__call").hidden = !drive?.walking;
    this.#menu.classList.toggle("is-walking", Boolean(drive?.walking));
    this.#touch.setDriveMode(drive?.active ?? false, drive?.walking ?? false);
    this.#syncIdentity();
  }
  #syncIdentity(): void {
    const id = this.#o.drive?.vehicleId ?? this.#preview;
    const spec = VEHICLES[id];
    const copy = CAR_COPY[id];
    const art = carPortrait(id);
    this.#el("[data-now-art]").innerHTML = art;
    this.#el("[data-now-name]").textContent = copy.name;
    this.#el("[data-now-meta]").textContent = this.#o.drive?.walking
      ? `${spec.category} · On foot`
      : spec.category;
    this.#el("[data-wallet]").textContent = (
      this.#o.events?.yen ?? 0
    ).toLocaleString("en-US");
    const hero = this.#menu.querySelector("[data-hero-art]");
    if (hero) hero.innerHTML = art;
    const owned = this.#menu.querySelector("[data-owned-count]");
    if (owned) {
      const n = VEHICLE_ORDER.filter((vehicle) => this.#owns(vehicle)).length;
      owned.textContent = `${n} car${n === 1 ? "" : "s"} owned`;
    }
  }
  #owns(id: VehicleId): boolean {
    return this.#o.events?.owns(id) ?? id === this.#o.drive?.vehicleId;
  }
  #cars(): void {
    if (this.#catalogue === "owned" && !this.#owns(this.#preview))
      this.#preview = this.#o.drive?.vehicleId ?? "touge";
    const list = this.#el(".menu__cars");
    list.replaceChildren();
    for (const id of VEHICLE_ORDER) {
      if (this.#catalogue === "owned" && !this.#owns(id)) continue;
      const button = document.createElement("button");
      button.className = "menu__car";
      button.dataset.vehicle = id;
      button.innerHTML = `${carPortrait(id)}<span class="menu__carName">${CAR_COPY[id].name}</span><span class="menu__carFacts">${this.#owns(id) ? "Owned" : `${VEHICLES[id].price.toLocaleString("en-US")} Sparks`}${id === this.#o.drive?.vehicleId ? " · Selected" : ""}</span>`;
      button.onclick = () => {
        this.#preview = id;
        this.#carDetail();
      };
      list.append(button);
    }
    for (const button of this.#menu.querySelectorAll<HTMLElement>(
      "[data-catalogue]",
    )) {
      button.classList.toggle(
        "is-active",
        button.dataset.catalogue === this.#catalogue,
      );
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.catalogue === this.#catalogue),
      );
    }
    this.#carDetail();
  }
  #carDetail(): void {
    const id = this.#preview,
      spec = VEHICLES[id],
      owned = this.#owns(id),
      copy = CAR_COPY[id];
    const host = this.#el(".menu__carDetail");
    const tune=loadTune(id), setup=loadSetup(id), arcade=tunedArcade(id,tune), balance=this.#o.events?.yen??0;
    const canBuy=!!this.#o.events && balance>=spec.price;
    const chooseLabel = owned
      ? id === this.#o.drive?.vehicleId
        ? "Selected"
        : "Select car"
      : `Buy · ${spec.price.toLocaleString("en-US")} Sparks`;
    const tuneBlock = !owned
      ? ""
      : this.#o.openTune
        ? `<p class="menu__note">Open Bay · ${TUNE_TIERS[tune.engine]} engine · ${TUNE_TIERS[tune.brakes]} brakes · ${TUNE_TIERS[tune.steering]} steering · ${TUNE_TIERS[tune.tyres]} tyres · ${SETUP_LABEL[setup]}</p><button type="button" class="menu__choose" data-bay>Tune in Open Bay</button>`
        : `<details class="menu__tune"><summary>Tune · Free tuning preview</summary><p>Fit tiers to this car. Engine adds force and speed; brakes shorten stops; steering responds sooner; tyres add road grip. Mass and wheelbase stay the same.</p>${(["engine","brakes","steering","tyres"] as TuneCategory[]).map(key=>`<label class="menu__row">${key[0]!.toUpperCase()+key.slice(1)}<select data-tune="${key}" aria-label="${key} tier">${["Stock","Street","Sport"].map((tier,i)=>`<option value="${i}" ${tune[key]===i?"selected":""}>${tier}</option>`).join("")}</select></label>`).join("")}<p class="menu__note">Setup sits on top of owned parts. Needle has Safe Return instead of Dirt.</p><div class="menu__row" role="radiogroup" aria-label="Setup">${setupsFor(id).map(s=>`<label><input type="radio" name="car-setup" value="${s}" ${setup===s?"checked":""}>${SETUP_LABEL[s]}</label>`).join("")}</div><p class="menu__note">Free to fit and saved per car. No Sparks spent.</p></details>`;
    host.innerHTML = `<div class="menu__carStage">${carPortrait(id)}<span>${spec.category} · ${owned ? "OWNED" : "SHOWROOM"}</span></div><h2>${copy.name}</h2><p class="menu__intro">${copy.role}</p><div class="menu__carSpecs"><span><strong>${spec.chassis.mass.toLocaleString("en-US")}</strong>kg</span><span><strong>${spec.drivetrain.layout.toUpperCase()}</strong>Drivetrain</span><span><strong>${Math.round(topSpeed(arcade,spec.chassis.mass)*3.6)}</strong>km/h · estimated</span><span><strong>${arcade.latG.toFixed(2)}</strong>g · road grip</span><span><strong>${Math.round(spec.dirt*100)}</strong>% · dirt grip</span><span><strong>${spec.clearance.toFixed(2)}</strong>m · clearance · ${spec.ford.toFixed(2)}m ford</span></div><p>${balance.toLocaleString("en-US")} Sparks available · Saved in this browser</p><button class="menu__choose" ${owned ? "" : 'aria-label="Buy"'} ${owned||canBuy ? "" : "disabled"}>${chooseLabel}</button>${!owned&&!canBuy ? `<p class="menu__note">${(spec.price-balance).toLocaleString("en-US")} more Sparks needed.</p>` : ""}${tuneBlock}`;
    host.querySelector<HTMLButtonElement>(".menu__choose")!.onclick=()=>{
      if(!owned&&!this.#o.events?.buy(id))return;
      this.#o.drive?.setVehicle(id);this.#cars();
    };
    host.querySelector<HTMLButtonElement>("[data-bay]")?.addEventListener("click", () => this.#enterTune());
    for(const select of host.querySelectorAll<HTMLSelectElement>("[data-tune]"))select.onchange=()=>{
      const next={...loadTune(id),[select.dataset.tune as TuneCategory]:Number(select.value) as TuneTier};
      saveTune(id,next);
      if(this.#o.drive?.vehicleId===id)this.#o.drive.setCarTune(next);
      this.#carDetail();host.querySelector<HTMLDetailsElement>(".menu__tune")!.open=true;
    };
    for(const radio of host.querySelectorAll<HTMLInputElement>("[name=car-setup]"))radio.onchange=()=>{
      const next=radio.value as SetupId;
      saveSetup(id,next);
      if(this.#o.drive?.vehicleId===id)this.#o.drive.setCarSetup?.(next);
      this.#carDetail();host.querySelector<HTMLDetailsElement>(".menu__tune")!.open=true;
    };
    for (const button of this.#menu.querySelectorAll<HTMLElement>(
      "[data-vehicle]",
    ))
      button.classList.toggle("is-active", button.dataset.vehicle === id);
    this.#syncIdentity();
  }
  #records(): void {
    const list = this.#el(".menu__records");
    list.replaceChildren();
    for (const event of this.#o.events?.list ?? []) {
      const row = document.createElement("div");
      row.className = "menu__record";
      const name = document.createElement("span");
      name.textContent = event.name;
      const value = document.createElement("strong");
      const best = this.#o.events!.bestOf(event.id),
        score = this.#o.events!.driftBestOf(event.id);
      value.textContent =
        event.kind === "drift"
          ? score > 0
            ? `${score.toLocaleString("en-US")} pts`
            : "No score yet"
          : best === null
            ? "No time yet"
            : formatTime(best);
      row.append(name, value);
      list.append(row);
    }
    if (!list.children.length)
      list.textContent =
        "Your first drive starts the story. No event records yet.";
  }
  #events(): void {
    const list = this.#el(".menu__events");
    list.replaceChildren();
    for (const event of this.#o.events?.list ?? []) {
      const running = this.#o.events!.runningEvent === event.id;
      const button = document.createElement("button");
      button.className = "menu__event";
      const title = document.createElement("span");
      title.className = "menu__eventName";
      title.textContent = event.name;
      const facts = document.createElement("span");
      facts.className = "menu__eventFacts";
      facts.textContent = `${event.kind === "race" ? `${event.rivals} rivals` : event.kind === "drift" ? "Drift run" : "Time trial"} · ${event.laps} lap${event.laps > 1 ? "s" : ""}`;
      const action = document.createElement("span");
      action.className = "menu__eventGo";
      action.textContent = running ? "Leave event" : "Start drive ↗";
      button.append(title, facts, action);
      button.onclick = () => {
        if (running) this.#o.events?.abort();
        else this.#o.events?.start(event.id);
        this.#resume();
      };
      list.append(button);
    }
  }
  #qualityControls(): void {
    const levels = this.#el(".menu__levels");
    for (const level of [...QUALITY_LEVELS, "custom"] as QualityKey[]) {
      const button = document.createElement("button");
      button.dataset.level = level;
      button.textContent =
        level === "custom"
          ? "Custom"
          : level[0]!.toUpperCase() + level.slice(1);
      button.onclick = () => {
        if (level === "custom") {
          this.#o.quality.seedCustomFrom(this.#o.quality.level);
          this.#o.quality.setCustom({});
        } else this.#o.quality.set(level);
      };
      levels.append(button);
    }
    const fields = [
      ["renderScale", "Resolution"],
      ["vegetationFullRadius", "Full tree density up to"],
      ["vegetationFarKeep", "Distant tree density"],
      ["vegetationGroundRange", "Grass and shrub range"],
      ["vegetationRange", "Tree range"],
      ["lodBias", "Detail distance"],
    ] as const;
    for (const [field, label] of fields) {
      const limits = CUSTOM_LIMITS[field];
      const row = document.createElement("label");
      row.className = "menu__row";
      const text = document.createElement("span");
      text.textContent = label;
      const input = document.createElement("input");
      input.type = "range";
      input.dataset.field = field;
      input.min = String(limits.min);
      input.max = String(limits.max);
      input.step = String(limits.step);
      const value = document.createElement("output");
      input.oninput = () => {
        value.textContent = input.value;
      };
      input.onchange = () =>
        this.#o.quality.setCustom({ [field]: Number(input.value) });
      row.append(text, input, value);
      this.#el(".menu__sliders").append(row);
    }
    for (const [field, label, values] of [
      ["ao", "Ambient occlusion", ["off", "low", "medium", "high"]],
      ["postFx", "Effects", ["off", "compact", "lean", "reduced", "full"]],
    ] as const) {
      const row = document.createElement("label");
      row.className = "menu__row";
      row.textContent = label;
      const select = document.createElement("select");
      select.dataset.field = field;
      for (const val of values) {
        const option = document.createElement("option");
        option.value = val;
        option.textContent = val[0]!.toUpperCase() + val.slice(1);
        select.append(option);
      }
      select.onchange = () =>
        this.#o.quality.setCustom({
          [field]: select.value,
        } as Partial<CustomQuality>);
      row.append(select);
      this.#el(".menu__sliders").append(row);
    }
    const reflectionRow = document.createElement("label");
    reflectionRow.className = "menu__row";
    reflectionRow.textContent = "Wet road reflections";
    const reflections = document.createElement("input");
    reflections.type = "checkbox";
    reflections.dataset.field = "reflections";
    reflections.disabled = matchMedia("(pointer: coarse)").matches;
    reflections.onchange = () =>
      this.#o.quality.setCustom({ reflections: reflections.checked });
    reflectionRow.append(reflections);
    this.#el(".menu__sliders").append(reflectionRow);
    if (reflections.disabled) {
      const note = document.createElement("p");
      note.className = "menu__note";
      note.textContent =
        "Use Low or Minimal on phones to keep reflections off and driving smooth.";
      this.#el(".menu__sliders").append(note);
    }
  }
  #syncQuality(): void {
    const level = this.#o.quality.level,
      settings = QUALITY[level];
    for (const button of this.#menu.querySelectorAll<HTMLElement>(
      "[data-level]",
    ))
      button.classList.toggle("is-active", button.dataset.level === level);
    this.#el(".menu__effect").textContent =
      `${Math.round(settings.renderScale * 100)}% resolution · ${settings.reflections ? "Reflections on" : "Reflections off"} · ${settings.postFx} effects`;
    for (const input of this.#menu.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("[data-field]")) {
      const value = settings[input.dataset.field as keyof typeof settings];
      if (input instanceof HTMLInputElement && input.type === "checkbox")
        input.checked = Boolean(value);
      else input.value = String(value);
      if (input instanceof HTMLInputElement)
        input.dispatchEvent(new Event("input"));
    }
    this.#el(".menu__mute").textContent = this.#o.audio?.muted
      ? "Sound off"
      : "Sound on";
  }
  #el(selector: string): HTMLElement {
    const element = this.#menu.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Player menu: missing ${selector}`);
    return element;
  }
  readonly #onMenuActivity = (): void => {
    if (this.#open && !this.#photo) this.#armIdleSleep();
  };
  readonly #onVisibility = (): void => {
    if (this.#photo || this.#garage) return;
    if (document.hidden) {
      this.#clearIdleSleep();
      this.#setWorldSleep(true);
      return;
    }
    this.#setWorldSleep(false);
    if (this.#open) this.#armIdleSleep();
  };
  #armIdleSleep(): void {
    this.#clearIdleSleep();
    this.#idleTimer = window.setTimeout(() => this.#setWorldSleep(true), MENU_SLEEP_MS);
  }
  #clearIdleSleep(): void {
    if (this.#idleTimer === null) return;
    window.clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
  }
  #setWorldSleep(sleeping: boolean): void {
    if (this.#worldSleeping === sleeping) return;
    this.#worldSleeping = sleeping;
    this.#menu.classList.toggle("is-sleeping", sleeping);
    this.#o.sleepWorld?.(sleeping);
  }
  dispose(): void {
    this.#clearIdleSleep();
    this.#setWorldSleep(false);
    this.#off.forEach((off) => off());
    document.removeEventListener("pointerlockchange", this.#lockChanged);
    document.removeEventListener("pointerlockerror", this.#lockError);
    document.removeEventListener("visibilitychange", this.#onVisibility);
    window.removeEventListener("keydown", this.#key, true);
    this.#menu.removeEventListener("pointerdown", this.#onMenuActivity, true);
    this.#menu.removeEventListener("keydown", this.#onMenuActivity, true);
    this.#menu.removeEventListener("wheel", this.#onMenuActivity, true);
    this.#touch.dispose();
    this.#menu.remove();
  }
}
