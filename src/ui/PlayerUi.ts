import { loadTune, saveTune, tunedArcade, type CarTune, type TuneCategory, type TuneTier } from '@/config/tuning.config';
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
  /** Welt anhalten, solange das Menü offen ist. Optional, damit Prüfstände ohne Physik durchlaufen. */
  setPaused?(paused: boolean): void;
}
export interface AudioControl {
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  click(): void;
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
  readonly callCar?: () => string;
}
type Tab = "play" | "cars" | "map" | "records" | "photo" | "settings";
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
  #tab: Tab = "play";
  #catalogue: "owned" | "showroom" = "owned";
  #preview: VehicleId;

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
      if (this.#open) {
        this.#cars();
        this.#records();
      }
    });
    document.addEventListener("pointerlockchange", this.#lockChanged);
    document.addEventListener("pointerlockerror", this.#lockError);
    window.addEventListener("keydown", this.#key, true);
    this.#qualityControls();
    this.#syncQuality();
    this.#syncDrive();
    this.#cars();
    this.#records();
    this.#events();
    this.#render();
  }
  begin(): void {
    this.#started = true;
    this.#resume();
  }
  openCommonsShop(tune: boolean): void {
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
    return this.#started && !this.#open && !this.#map && !this.#photo;
  }
  #show(): void {
    this.#open = true;
    this.#tab = "play";
    this.#events();
    this.#cars();
    this.#records();
    this.#syncDrive();
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
      !this.#photo
    ) {
      if (this.#open) this.#render();
      else this.#show();
    }
  };
  readonly #lockError = (): void => {
    if (!this.#photo && !this.#map) this.#show();
  };
  readonly #key = (event: KeyboardEvent): void => {
    if (!this.#started || this.#map || this.#photo) return;
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
      this.#started && !this.#open && !this.#map && !this.#photo,
    );
    this.#o.hud?.setMenuOpen(this.#open || this.#photo || this.#map);
    this.#o.drive?.setPaused?.(this.#open || this.#photo || this.#map);
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
      <header class="menu__head"><div><button class="menu__title" aria-label="japanMap">japanMap</button><p class="menu__eyebrow">AFTER THE RAIN</p><form class="menu__code" hidden><input aria-label="Code" maxlength="12" autocomplete="off" /></form></div></header>
      <nav class="menu__tabs" aria-label="Main destinations">${TABS.map((key, i) => `<button class="menu__tab" aria-label="${key[0]!.toUpperCase() + key.slice(1)}" data-tab="${key}" data-icon="${icons[i]}">${key[0]!.toUpperCase() + key.slice(1)}</button>`).join("")}</nav>
      <button class="menu__resume">Continue <span aria-hidden="true">↗</span></button>
      <section class="menu__panel" data-panel="play"><p class="menu__eyebrow">YOUR NEXT TURN</p><h1>The road is yours.</h1><p class="menu__intro">Find a mountain line, a quiet coast, or your next personal best.</p>
        <div class="menu__roadHero"><div><span>FREE DRIVE</span><h2>One island.<br>Room to wander.</h2><button class="menu__explore">Explore the map ↗</button></div><svg viewBox="0 0 500 230" aria-hidden="true"><path d="M0 210 L110 85 L180 150 L300 20 L430 160 L500 80 V230 H0Z" fill="#303e48"/><path d="M60 240 C390 175 130 140 310 65" fill="none" stroke="#dcad72" stroke-width="7"/><path d="M60 240 C390 175 130 140 310 65" fill="none" stroke="#171e27" stroke-width="2" stroke-dasharray="7 9"/></svg></div>
        <div class="menu__playActions"><button class="menu__drive">Enter car</button><button class="menu__call">Call car</button></div><p class="menu__status" role="status"></p><h2>Pick a drive</h2><div class="menu__events"></div></section>
      <section class="menu__panel" data-panel="cars" hidden><p class="menu__eyebrow">YOUR GARAGE</p><h1>Find your line.</h1><div class="menu__switch"><button data-catalogue="owned">Owned</button><button data-catalogue="showroom">Showroom</button></div><div class="menu__carDetail"></div><div class="menu__cars"></div><p class="menu__note menu__garageNote">Ten original cars. Purchases use Sparks. Try free Street and Sport tuning on each owned car.</p></section>
      <section class="menu__panel" data-panel="map" hidden><p class="menu__eyebrow">TAKE A DIFFERENT TURN</p><h1>Beyond the neon.</h1><div class="menu__mapHero"><img src="${aerialMapUrl}" alt="Aerial map of the island" loading="lazy" /></div><p class="menu__intro">Trace the pass, set a waypoint, or follow the coast. Opening the map keeps you where you are.</p><button class="menu__openMap">Open map</button><p class="menu__note">Stillwater Village lies on the western paddies. Tideglass Harbour is the working port on the east coast.</p></section>
      <section class="menu__panel" data-panel="records" hidden><p class="menu__eyebrow">MAKE IT PERSONAL</p><h1>Your best moments.</h1><h2>Event records</h2><div class="menu__records"></div><p class="menu__note">Saved event bests appear here. Driving milestones, discoveries and the garage wall are not tracked yet.</p></section>
      <section class="menu__panel" data-panel="photo" hidden><p class="menu__eyebrow">KEEP THE VIEW</p><h1>Stay a little longer.</h1><div class="menu__photoHero" aria-hidden="true">＋</div><p class="menu__intro">Freeze the world, find your angle and keep a clean PNG. Return to exactly the view you left.</p><button class="menu__openPhoto">Enter Photo mode</button><p class="menu__note">High captures use more pixels without changing your graphics preset.</p></section>
      <section class="menu__panel" data-panel="settings" hidden><p class="menu__eyebrow">MAKE YOURSELF AT HOME</p><h1>Settings</h1><details open><summary>Graphics</summary><div class="menu__levels"></div><p class="menu__effect"></p><details><summary>Custom graphics</summary><div class="menu__sliders"></div></details><button class="menu__reclassify">Recalibrate</button></details><details><summary>Audio</summary><button class="menu__mute">Sound on</button></details><details><summary>Accessibility</summary><label class="menu__row">UI scale<select class="menu__scale"><option value="90">90%</option><option value="100" selected>100%</option><option value="115">115%</option><option value="130">130%</option></select></label><label class="menu__row">Speed units<select class="menu__units"><option value="kmh">km/h</option><option value="mph">mph</option></select></label><label class="menu__row">Reduced motion<input class="menu__motion" type="checkbox" /></label></details><details><summary>Controls</summary><h3>On foot</h3>${controlTable(CONTROLS, "keytable")}<h3>Driving</h3>${controlTable(DRIVE_CONTROLS, "keytable")}${controlTable(TOUCH_DRIVE_CONTROLS, "keytable")}<h3>Photo</h3><p>Drag to look. Use the on-screen controls to move. P opens Photo; Escape leaves it.</p></details><details><summary>Progress</summary><p class="menu__note">Event bests and owned cars use this browser's existing save. Sparks purchases and tuning are saved in this browser.</p></details></section>
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
    this.#el(".menu__drive").textContent = drive?.active
      ? "Get out"
      : "Enter car";
    this.#el(".menu__call").hidden = !drive?.walking;
    this.#touch.setDriveMode(drive?.active ?? false, drive?.walking ?? false);
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
    const tune=loadTune(id), arcade=tunedArcade(id,tune), balance=this.#o.events?.yen??0;
    const canBuy=!!this.#o.events && balance>=spec.price;
    host.innerHTML = `<div class="menu__carStage">${carPortrait(id)}<span>${spec.category} · ${owned ? "OWNED" : "SHOWROOM"}</span></div><h2>${copy.name}</h2><p class="menu__intro">${copy.role}</p><div class="menu__carSpecs"><span><strong>${spec.chassis.mass.toLocaleString("en-US")}</strong>kg</span><span><strong>${spec.drivetrain.layout.toUpperCase()}</strong>Drivetrain</span><span><strong>${Math.round(topSpeed(arcade,spec.chassis.mass)*3.6)}</strong>km/h · estimated</span><span><strong>${arcade.latG.toFixed(2)}</strong>g · road grip</span></div><p>${balance.toLocaleString("en-US")} Sparks available · Saved in this browser</p><button class="menu__choose" ${owned||canBuy ? "" : "disabled"}>${owned ? (id === this.#o.drive?.vehicleId ? "Selected" : "Select car") : `Buy · ${spec.price.toLocaleString("en-US")} Sparks`}</button>${!owned&&!canBuy ? `<p class="menu__note">${(spec.price-balance).toLocaleString("en-US")} more Sparks needed.</p>` : ""}${owned ? `<details class="menu__tune"><summary>Tune · Free tuning preview</summary><p>Fit tiers to this car. Engine adds force and speed; brakes shorten stops; steering responds sooner; tyres add road grip. Mass and wheelbase stay the same.</p>${(["engine","brakes","steering","tyres"] as TuneCategory[]).map(key=>`<label class="menu__row">${key[0]!.toUpperCase()+key.slice(1)}<select data-tune="${key}" aria-label="${key} tier">${["Stock","Street","Sport"].map((tier,i)=>`<option value="${i}" ${tune[key]===i?"selected":""}>${tier}</option>`).join("")}</select></label>`).join("")}<p class="menu__note">Free to fit and saved per car. No Sparks spent.</p></details>` : ""}`;
    host.querySelector<HTMLButtonElement>(".menu__choose")!.onclick=()=>{
      if(!owned&&!this.#o.events?.buy(id))return;
      this.#o.drive?.setVehicle(id);this.#cars();
    };
    for(const select of host.querySelectorAll<HTMLSelectElement>("[data-tune]"))select.onchange=()=>{
      const next={...loadTune(id),[select.dataset.tune as TuneCategory]:Number(select.value) as TuneTier};
      saveTune(id,next);
      if(this.#o.drive?.vehicleId===id)this.#o.drive.setCarTune(next);
      this.#carDetail();host.querySelector<HTMLDetailsElement>(".menu__tune")!.open=true;
    };
    for (const button of this.#menu.querySelectorAll<HTMLElement>(
      "[data-vehicle]",
    ))
      button.classList.toggle("is-active", button.dataset.vehicle === id);
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
  dispose(): void {
    this.#off.forEach((off) => off());
    document.removeEventListener("pointerlockchange", this.#lockChanged);
    document.removeEventListener("pointerlockerror", this.#lockError);
    window.removeEventListener("keydown", this.#key, true);
    this.#touch.dispose();
    this.#menu.remove();
  }
}
