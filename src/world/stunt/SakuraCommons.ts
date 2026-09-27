import { Group, Mesh, type MeshBasicMaterial } from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { DriveInput } from '@/game/Vehicle';
import type { VehicleId } from '@/config/vehicles.config';
import { VEHICLES } from '@/config/vehicles.config';
import { walkSpawnZone } from '@/config/walker.config';
import { SurfaceStack } from '../settlements/LocalSurfaces';
import { buildSakuraLobby, type SakuraLobby, type ShowroomPad } from './sakuraLobby';
import { CommonsBeacons, type Beacon } from './commonsBeacons';
import { BayShutter } from '@/ui/bayShutter';
import { hasTouch } from '@/ui/controls';
import { sparkMark } from '@/ui/sparkIcon';
import './sakuraCommons.css';

/**
 * Wie weit die Einfahrt der Open Bay vor dem Tor liegt, in Metern — Ziel des
 * Heimwegs im Intro und Mittelpunkt der Auslösezone.
 */
const APRON_AHEAD = 4.5;
/**
 * Auslöseradius um die Einfahrt, m. ~~6,5~~ — gemessen rollte ein Wagen, der
 * mit 15 km/h anrollt und das Gas lässt, 6,6 m vor der Einfahrt aus und dann
 * den flachen Hang zurück. 9 m fassen das Vorfeld (8,8 m breit) samt der
 * Stelle, an der man natürlicherweise stehen bleibt.
 */
const APRON_RADIUS = 9;
/** Nur, wer langsam anrollt, will hinein — 32 km/h. */
const APRON_SPEED = 32 / 3.6;
/** Nach dem Herausrollen so lange nicht erneut auslösen, s. */
const BAY_COOLDOWN = 7;
/** So weit rollt der Wagen nach dem Tuning vor das Tor, m. */
const ROLL_OUT = 9;

type BayPhase = 'idle' | 'in' | 'closing' | 'garage' | 'out';

/**
 * Die Sakura Commons — die Basis. Petal Motors (Autos), Open Bay (Tuning),
 * die Veranstaltungstafel (Rennen) und der Hof dazwischen.
 *
 * ## Was hier seit „First Drive" anders ist
 *
 * - **Die Open Bay ist eine Einfahrt, kein Menüauslöser.** Wer langsam vor das
 *   Tor rollt, wird hineingefahren, das Rolltor schließt, drinnen hebt die
 *   Bühne den Wagen. Beim Verlassen öffnet das Tor und der Wagen rollt in den
 *   Hof. Die Kamera sieht dabei nie einen harten Schnitt — der Schnitt ist das
 *   Tor (`BayShutter`).
 * - **Wegweiser** über jedem Ort (`CommonsBeacons`) statt eines Satzes „Your
 *   car. Take it out."
 * - **Die Veranstaltungstafel** im Hof öffnet die Rennen; bisher gab es in der
 *   Basis keinen Ort dafür.
 * - **Die fünf Goldkegel sind weg.** Die „optionale Tour" erklärte nichts und
 *   stand als Verkehrshütchen auf der Wiese; das Intro übernimmt ihre Aufgabe.
 */
export class SakuraCommons implements System {
  readonly name = 'SakuraCommons';
  readonly group = new Group();
  readonly panel = document.createElement('div');
  readonly prompt = document.createElement('span');
  readonly action = document.createElement('button');
  openShop: (tune: boolean, after?: (resume: boolean) => void) => void = () => {};
  openEvents: () => void = () => {};
  owns: (id: VehicleId) => boolean = () => false;
  buy: (id: VehicleId) => boolean = () => false;
  wallet: () => number = () => 0;
  isPlaying: () => boolean = () => false;
  /** Der Wagen rollt in die Bay — das Intro hört mit. */
  onDriveIn: () => void = () => {};
  /** … und wieder heraus. */
  onDriveOut: () => void = () => {};
  /** Zeigt die Garage beim nächsten Öffnen einen Tipp (erstes Mal)? */
  garageTip = false;
  #shop = -1;
  #board = false;
  #pad: ShowroomPad | null = null;
  #bayCool = 0;
  #messageTime = 0;
  #message = '';
  #time = 0;
  #lobby: SakuraLobby | null = null;
  #stack = new SurfaceStack();
  #previous: DriveSystem['ground']['localSurfaces'] = null;
  #context: EngineContext | null = null;
  #container: HTMLElement;
  #beacons: CommonsBeacons | null = null;
  #shutter: BayShutter;
  #welcome: HTMLElement | null = null;
  #bay: BayPhase = 'idle';
  #bayT = 0;
  readonly #script: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  constructor(readonly drive: DriveSystem, container: HTMLElement) {
    this.#container = container;
    this.panel.className = 'commons-prompt';
    this.panel.hidden = true;
    this.prompt.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.prompt, this.action);
    container.append(this.panel);
    this.#shutter = new BayShutter(container);
  }

  /** Wo die Einfahrt liegt — Ziel für Intro und Wegpunkt. */
  get bayApron(): { x: number; z: number } {
    const lobby = this.#lobby;
    if (!lobby) {
      const s = walkSpawnZone();
      return { x: s.x + 22, z: s.z - 32 + 7 + APRON_AHEAD };
    }
    return { x: lobby.bay.x, z: lobby.bay.z + lobby.bay.d / 2 + APRON_AHEAD };
  }

  /** Läuft gerade die Ein- oder Ausfahrt? Dann gehört die Eingabe dem Skript. */
  get bayBusy(): boolean {
    return this.#bay !== 'idle';
  }

  init(context: EngineContext): void {
    this.#context = context;
    const s = walkSpawnZone();
    this.#lobby = buildSakuraLobby(s, (x, z) => this.drive.height(x, z));
    this.group.add(this.#lobby.group);
    for (const box of this.#lobby.colliders)
      this.drive.collision.addBox(box.minX, box.maxX, box.minZ, box.maxZ, box.y0, box.y1);
    this.#previous = this.drive.ground.localSurfaces;
    this.#stack.layers.length = 0;
    if (this.#previous) this.#stack.layers.push(this.#previous);
    this.#stack.layers.push(this.#lobby.floors);
    this.drive.ground.localSurfaces = this.#stack;
    this.#refreshOwned();
    context.scene.add(this.group);
    window.addEventListener('keydown', this.#key);

    const L = this.#lobby;
    const beacons: Beacon[] = [
      { id: 'cars', x: L.petal.x, y: L.petal.y + 6.4, z: L.petal.z + L.petal.d / 2, title: 'Petal Motors', sub: 'Buy & pick cars', tone: 'amber' },
      { id: 'tune', x: L.bay.x, y: L.bay.y + 6.2, z: L.bay.z + L.bay.d / 2, title: 'Open Bay', sub: 'Drive in · tune', tone: 'nitro' },
      { id: 'events', x: L.board.x, y: L.board.y + 4.1, z: L.board.z, title: 'Event Board', sub: 'Race · drift · time trial', tone: 'sakura' },
    ];
    // Die Ausfahrt: das Ende der Zufahrt `commons-drive`, wo sie auf die
    // Stadtstraße trifft — „wo geht es raus" ist die erste Frage im Hof.
    // **Nicht über `roads:ready`**: die Commons initialisiert nach dem
    // RoadSystem, das Ereignis ist dann längst gesendet. Das Netz liegt schon
    // im Fahrmodus.
    const exit = this.drive.roads?.roads.find((r) => r.id === 'commons-drive');
    if (exit && exit.centerline.length >= 6) {
      const c = exit.centerline;
      const i = Math.floor((c.length / 3) * 0.85) * 3;
      beacons.push({
        id: 'road', x: c[i]!, y: this.drive.height(c[i]!, c[i + 2]!) + 3.4, z: c[i + 2]!,
        title: 'Open Road', sub: 'To the island', tone: 'paddy',
      });
    }
    this.#beacons = new CommonsBeacons(this.#container, beacons);
  }

  readonly #key = (event: KeyboardEvent): void => {
    if (this.#welcome && !event.repeat && (event.code === 'Enter' || event.code === 'Escape')) {
      this.#closeWelcome();
      if (event.code === 'Enter') event.preventDefault();
      return;
    }
    if (this.panel.hidden) return;
    if (event.code === 'Enter' && !event.repeat) {
      event.preventDefault(); this.#use();
    }
    if (event.code === 'KeyF' && !event.repeat && (this.#pad || this.#shop >= 0 || this.#board)) {
      event.preventDefault(); this.#use();
    }
  };

  #use(): void {
    if (this.#pad) {
      this.#usePad(this.#pad);
      return;
    }
    if (this.#board) this.openEvents();
    else if (this.#shop >= 0) this.openShop(this.#shop === 1);
    else if (this.drive.walking) this.drive.board();
  }

  #usePad(pad: ShowroomPad): void {
    const id = pad.id;
    if (this.owns(id)) {
      this.drive.setVehicle(id);
      this.#flash(`${VEHICLES[id].name} is waiting in the court.`);
      return;
    }
    if (this.buy(id)) {
      this.drive.setVehicle(id);
      this.#flash(`${VEHICLES[id].name} is yours. Take it from the court.`);
      this.#refreshOwned();
      return;
    }
    const need = VEHICLES[id].price - this.wallet();
    this.#flash(`Need ${need.toLocaleString('en-US')} more Sparks for ${VEHICLES[id].name}.`);
  }

  #flash(text: string): void {
    this.#message = text;
    this.#messageTime = 5;
  }

  syncOwned(): void { this.#refreshOwned(); }

  #refreshOwned(): void {
    const owned = new Set<VehicleId>();
    for (const id of Object.keys(VEHICLES) as VehicleId[]) if (this.owns(id)) owned.add(id);
    this.#lobby?.setOwned(owned);
  }

  // ── Die Begrüßung ──────────────────────────────────────────────────────

  /**
   * Die Karte „Willkommen in der Basis" — nach dem Intro oder beim ersten
   * Start ohne Intro. Sie sagt in vier Zeilen, was die Wegweiser zeigen, und
   * geht mit Enter, einem Klick oder nach 14 s.
   */
  showWelcome(earned = 0): void {
    this.#closeWelcome();
    const touch = hasTouch();
    const el = document.createElement('div');
    el.className = 'commons-welcome';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Welcome to Sakura Commons');
    el.innerHTML = `
      <p class="commons-welcome__kicker">Your base</p>
      <h2>Sakura Commons</h2>
      <p>${earned > 0 ? `You earned ${sparkMark(earned)} on the way in. ` : ''}Everything starts here — the markers show the way.</p>
      <ul>
        <li style="--tone: var(--nitro)"><b>Open Bay</b><span>Roll in slowly to tune engine, brakes, tyres.</span></li>
        <li style="--tone: var(--amber)"><b>Petal Motors</b><span>Walk in to browse and buy new cars.</span></li>
        <li style="--tone: var(--sakura)"><b>Event Board</b><span>Races, drift runs and time trials for Sparks.</span></li>
        <li style="--tone: var(--leaf)"><b>The island</b><span>${touch ? 'Minimap' : '<kbd>M</kbd>'} for the map, ${touch ? '🚗' : '<kbd>F</kbd>'} to get in or out.</span></li>
      </ul>
      <button type="button">Let's go</button>`;
    el.querySelector('button')!.onclick = () => this.#closeWelcome();
    this.#container.append(el);
    this.#welcome = el;
    requestAnimationFrame(() => el.classList.add('is-on'));
    window.setTimeout(() => {
      if (this.#welcome === el) this.#closeWelcome();
    }, 14000);
  }

  #closeWelcome(): void {
    const el = this.#welcome;
    if (!el) return;
    this.#welcome = null;
    el.classList.remove('is-on');
    window.setTimeout(() => el.remove(), 600);
  }

  // ── Ein- und Ausfahrt der Open Bay ─────────────────────────────────────

  /**
   * Vor dem Tor, langsam, Nase grob zum Tor: dann will er hinein.
   *
   * Die Richtung gehört dazu — wer rückwärts über das Vorfeld rangiert oder
   * quer vorbeirollt, meint nicht die Werkstatt. `cos` > 0,35 heißt ±70°.
   */
  #wantsBay(): boolean {
    const d = this.drive, lobby = this.#lobby;
    if (!lobby || !d.active || d.walking || this.#bayCool > 0 || d.race.state !== 'idle') return false;
    const apron = this.bayApron;
    const p = d.vehicle.position;
    if (Math.hypot(p.x - apron.x, p.z - apron.z) > APRON_RADIUS) return false;
    if (d.vehicle.telemetry.speed > APRON_SPEED) return false;
    // Zum Tor heißt nach −Z (Norden): forward = (sin ψ, cos ψ), also cos ψ < 0.
    return -Math.cos(d.vehicle.yaw) > 0.35;
  }

  #beginDriveIn(): void {
    this.#bay = 'in';
    this.#bayT = 0;
    this.drive.introLock = true;
    this.drive.setScriptedInput(this.#script);
    this.onDriveIn();
  }

  /**
   * Das Skript der Einfahrt: auf die Mittelachse der Bay lenken, langsam
   * rollen. Ein einfacher Folgeregler auf einen Punkt 5 m voraus auf der
   * Achse — die Einfahrt ist 4,1 m breit, ein Wagen 1,8 m.
   */
  #steerTo(tx: number, tz: number, speed: number): void {
    const v = this.drive.vehicle;
    const p = v.position;
    let err = Math.atan2(tx - p.x, tz - p.z) - v.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    // ψ wächst beim Linkslenken ⇒ err > 0 heißt links ⇒ steer < 0.
    this.#script.steer = Math.max(-1, Math.min(1, -err * 2.2));
    const vNow = v.telemetry.forwardSpeed;
    this.#script.throttle = vNow < speed ? Math.min(1, (speed - vNow) * 0.6) : 0;
    this.#script.brake = vNow > speed + 1.5 ? 0.6 : 0;
    this.#script.handbrake = false;
    this.#script.boost = false;
  }

  #stepBay(dt: number): void {
    const lobby = this.#lobby;
    if (!lobby) return;
    const d = this.drive;
    const p = d.vehicle.position;
    this.#bayT += dt;
    const doorZ = lobby.bay.z + lobby.bay.d / 2;
    switch (this.#bay) {
      case 'in': {
        // Punkt voraus auf der Achse, mindestens bis zur Hallenmitte.
        const tz = Math.max(lobby.bay.z, Math.min(p.z - 5, doorZ));
        this.#steerTo(lobby.bay.x, tz, 4);
        if (p.z < doorZ - 0.5 || this.#bayT > 3.2) {
          this.#bay = 'closing';
          this.#bayT = 0;
          this.#shutter.close(() => this.#enterGarage());
        }
        break;
      }
      case 'closing':
        this.#steerTo(lobby.bay.x, lobby.bay.z - 3, 1.5);
        break;
      case 'out': {
        const outZ = doorZ + ROLL_OUT;
        if (p.z < outZ - 1) this.#steerTo(lobby.bay.x, p.z + 6, 3.5);
        else {
          this.#script.throttle = 0;
          this.#script.brake = 1;
          this.#script.steer = 0;
        }
        if ((p.z >= outZ - 1 && d.vehicle.telemetry.speed < 0.6) || this.#bayT > 6) {
          this.#bay = 'idle';
          this.#bayCool = BAY_COOLDOWN;
          d.setScriptedInput(null);
          d.introLock = false;
          this.onDriveOut();
        }
        break;
      }
      default:
        break;
    }
  }

  #enterGarage(): void {
    const lobby = this.#lobby;
    if (!lobby) return;
    this.#bay = 'garage';
    this.drive.setScriptedInput(null);
    // Hinter dem geschlossenen Tor: den Wagen in die Hallenmitte stellen, damit
    // die Ausfahrt immer an derselben Stelle beginnt — auch wenn die Einfahrt
    // schief war.
    this.drive.placeAt(lobby.bay.x, lobby.bay.z - 1.5, 0);
    this.openShop(true, () => this.#driveOut());
    this.#shutter.open(260, 700);
  }

  /** Aus der Garage zurück: Tor zu, Wagen rollt aus, Tor auf. */
  #driveOut(): void {
    const lobby = this.#lobby;
    if (!lobby) return;
    this.#bay = 'out';
    this.#bayT = 0;
    // Das Tor kommt einmal herunter und geht dann in der Welt wieder auf —
    // derselbe Schnitt wie auf dem Hinweg, rückwärts gelesen.
    this.#shutter.close(() => {
      this.drive.placeAt(lobby.bay.x, lobby.bay.z - 1.5, 0);
      this.drive.introLock = true;
      this.drive.setScriptedInput(this.#script);
      this.#shutter.open(150, 1000);
    }, 1);
  }

  // ── Je Frame ───────────────────────────────────────────────────────────

  update(dt: number): void {
    const d = this.drive, s = walkSpawnZone(), lobby = this.#lobby;
    const p = d.walking ? d.walker.position : d.vehicle.position;
    this.#time += dt;
    this.#bayCool = Math.max(0, this.#bayCool - dt);
    this.#messageTime = Math.max(0, this.#messageTime - dt);
    const near = Math.hypot(p.x - s.x, p.z - s.z) < 90;
    if (lobby) lobby.update(dt, this.#time, (x, z) => this.drive.height(x, z));

    if (this.#bay !== 'idle' && this.#bay !== 'garage') this.#stepBay(dt);
    else if (this.#bay === 'idle' && this.isPlaying() && this.#wantsBay()) this.#beginDriveIn();

    const context = this.#context;
    if (context && this.#beacons) {
      const canvas = context.renderer.domElement;
      const slow = d.walking || (d.active && d.vehicle.telemetry.speed < 60 / 3.6);
      this.#beacons.update(
        context.camera,
        canvas.clientWidth,
        canvas.clientHeight,
        p.x,
        p.z,
        // Aus, solange ein Aktionshinweis steht: dann ist man am Ort, und ein
        // Etikett für einen anderen Ort, das durch die Wand scheint, steht
        // gemessen genau über dem Knopf (Tür von Petal Motors, „Open Road").
        near && slow && this.isPlaying() && this.#bay === 'idle' &&
          (this.panel.hidden || (!this.#pad && this.#shop < 0 && !this.#board)) &&
          !document.body.classList.contains('intro-running'),
      );
    }

    this.panel.hidden = !this.isPlaying() || (!d.walking && !d.active) || !near || this.#bay !== 'idle';
    if (this.panel.hidden) return;
    if (lobby) this.#clampCamera(p.x, p.y, p.z, lobby);
    this.#shop = -1;
    this.#pad = null;
    this.#board = false;
    if (d.walking && lobby) {
      let best = 4.1, hit: ShowroomPad | null = null;
      for (const pad of lobby.pads) {
        const dist = Math.hypot(p.x - pad.x, p.z - pad.z);
        if (dist < best) { best = dist; hit = pad; }
      }
      this.#pad = hit;
      if (!this.#pad) {
        for (let i = 0; i < 2; i++) {
          const door = lobby.doors[i]!;
          if (Math.hypot(p.x - door.x, p.z - door.z) < 5) this.#shop = i;
        }
      }
      if (Math.hypot(p.x - lobby.bench.x, p.z - lobby.bench.z) < 2.4) this.#shop = 1;
      if (!this.#pad && this.#shop < 0 && Math.hypot(p.x - lobby.board.x, p.z - lobby.board.z) < 3.4) this.#board = true;
    }
    // Im Auto nur Meldungen und der Hinweis vor dem Tor — ein Dauerbanner über
    // der Windschutzscheibe verdeckt Straße und HUD.
    if (d.active) {
      const apron = this.bayApron;
      const dApron = Math.hypot(p.x - apron.x, p.z - apron.z);
      if (this.#messageTime > 0 && this.#message) {
        this.action.hidden = true;
        this.prompt.textContent = this.#message;
        return;
      }
      if (dApron < 22 && this.#bayCool === 0) {
        this.action.hidden = true;
        this.prompt.innerHTML = '<strong>Open Bay</strong> · Roll slowly up to the door to tune';
        return;
      }
      this.panel.hidden = true;
      return;
    }
    this.#paintPrompt(d);
  }

  #paintPrompt(d: DriveSystem): void {
    const pad = this.#pad;
    if (pad) {
      const spec = VEHICLES[pad.id];
      const owned = this.owns(pad.id);
      const canBuy = !owned && this.wallet() >= spec.price;
      this.action.hidden = false;
      this.action.disabled = !owned && !canBuy;
      this.action.textContent = owned ? (d.vehicleId === pad.id ? 'Selected' : 'Select') : canBuy ? 'Buy' : 'Need Sparks';
      this.prompt.innerHTML = owned
        ? `<strong>${spec.name}</strong> · Owned · Walk around it, then take yours from the court.`
        : `<strong>${spec.name}</strong> · ${sparkMark(spec.price)} · ${sparkMark(this.wallet())} on hand`;
      return;
    }
    this.action.disabled = false;
    if (this.#board) {
      this.action.hidden = false;
      this.action.textContent = 'Open events';
      this.prompt.innerHTML = '<strong>Event Board</strong> · Races, drift runs, time trials';
      return;
    }
    const lobby = this.#lobby;
    const p = d.walker.position;
    const inHall = !!lobby && (
      (Math.abs(p.x - lobby.petal.x) < lobby.petal.w / 2 && Math.abs(p.z - lobby.petal.z) < lobby.petal.d / 2)
      || (Math.abs(p.x - lobby.bay.x) < lobby.bay.w / 2 && Math.abs(p.z - lobby.bay.z) < lobby.bay.d / 2)
    );
    const carNear = d.vehicleRange() <= 4.2;
    this.action.hidden = this.#shop < 0 && !carNear;
    this.action.textContent = this.#shop >= 0 ? `Enter ${this.#shop === 0 ? 'Cars' : 'Tune'}` : 'Enter car';
    if (this.action.hidden && this.#messageTime <= 0 && !inHall) {
      // Nichts in Reichweite: kein Banner. Die Wegweiser sagen, wo es was gibt.
      this.panel.hidden = true;
      return;
    }
    this.prompt.innerHTML = this.#shop >= 0
      ? (this.#shop === 0 ? '<strong>Petal Motors</strong> · Browse and buy cars' : '<strong>Open Bay</strong> · Tune on foot, or drive your car in')
      : this.#messageTime > 0 && this.#message ? this.#message
      : inHall ? 'Walk up to a car to inspect or buy.'
      : `<strong>${VEHICLES[d.vehicleId].name}</strong> · Your car`;
  }

  #clampCamera(x: number, y: number, z: number, lobby: SakuraLobby): void {
    if (!this.drive.walking || !this.#context) return;
    const inside = (b: { x: number; z: number; w: number; d: number }): boolean =>
      Math.abs(x - b.x) < b.w / 2 - 0.4 && Math.abs(z - b.z) < b.d / 2 - 0.4;
    const room = inside(lobby.petal) ? lobby.petal : inside(lobby.bay) ? lobby.bay : null;
    if (!room) return;
    const camera = this.#context.camera;
    const h = this.drive.walkCamera.heading;
    camera.position.set(
      Math.max(room.x - room.w / 2 + 0.45, Math.min(room.x + room.w / 2 - 0.45, x - Math.sin(h) * 1.55)),
      y + 2.25,
      Math.max(room.z - room.d / 2 + 0.45, Math.min(room.z + room.d / 2 - 0.45, z - Math.cos(h) * 1.55)),
    );
    camera.lookAt(x + Math.sin(h) * 2, y + 1.15, z + Math.cos(h) * 2);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#key);
    this.panel.remove();
    this.#beacons?.dispose();
    this.#shutter.dispose();
    this.#welcome?.remove();
    if (this.drive.ground.localSurfaces === this.#stack) this.drive.ground.localSurfaces = this.#previous;
    this.#lobby?.dispose();
    this.group.removeFromParent();
    this.group.traverse(object => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const material = object.material as MeshBasicMaterial;
        material.map?.dispose(); material.dispose();
      }
    });
  }
}
