import { ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { VehicleId } from '@/config/vehicles.config';
import { VEHICLES } from '@/config/vehicles.config';
import { walkSpawnZone } from '@/config/walker.config';
import { SurfaceStack } from '../settlements/LocalSurfaces';
import { buildSakuraLobby, type SakuraLobby, type ShowroomPad } from './sakuraLobby';
import { sparkMark } from '@/ui/sparkIcon';
import './sakuraCommons.css';

/** Walk-in auto house and court on the existing sakura bowl. No new terrain. */
export class SakuraCommons implements System {
  readonly name = 'SakuraCommons';
  readonly group = new Group();
  readonly panel = document.createElement('div');
  readonly prompt = document.createElement('span');
  readonly action = document.createElement('button');
  readonly markers: Mesh[] = [];
  openShop: (tune: boolean) => void = () => {};
  owns: (id: VehicleId) => boolean = () => false;
  buy: (id: VehicleId) => boolean = () => false;
  wallet: () => number = () => 0;
  #next = 0;
  #entered = false;
  #shop = -1;
  #pad: ShowroomPad | null = null;
  #bayDwell = 0;
  #bayCool = 0;
  #messageTime = 0;
  #message = '';
  #time = 0;
  #lobby: SakuraLobby | null = null;
  #stack = new SurfaceStack();
  #previous: DriveSystem['ground']['localSurfaces'] = null;
  #context: EngineContext | null = null;
  isPlaying: () => boolean = () => false;
  constructor(readonly drive: DriveSystem, container: HTMLElement) {
    this.panel.className = 'commons-prompt';
    this.panel.hidden = true;
    this.prompt.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.prompt, this.action);
    container.append(this.panel);
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

    const gold = new MeshBasicMaterial({ color: 0xffcf68 });
    for (const [dx, dz] of [[16, -16], [35, -10], [42, 12], [28, 34], [0, 44]]) {
      const x = s.x + dx!, z = s.z + dz!;
      const marker = new Mesh(new ConeGeometry(0.65, 1.6, 6), gold);
      marker.position.set(x, this.drive.height(x, z) + 1.8, z);
      this.markers.push(marker); this.group.add(marker);
      for (const side of [-1, 1]) {
        const cx = x + side * 5;
        const cone = new Mesh(new ConeGeometry(0.35, 0.85, 6), new MeshStandardMaterial({ color: 0xee783f }));
        cone.position.set(cx, this.drive.height(cx, z) + 0.425, z);
        this.group.add(cone);
      }
    }
    context.scene.add(this.group);
    window.addEventListener('keydown', this.#key);
  }
  readonly #key = (event: KeyboardEvent): void => {
    if (this.panel.hidden) return;
    if (event.code === 'Enter' && !event.repeat) {
      event.preventDefault(); this.#use();
    }
    if (event.code === 'KeyF' && !event.repeat && (this.#pad || this.#shop >= 0)) {
      event.preventDefault(); this.#use();
    }
  };
  #use(): void {
    if (this.#pad) {
      this.#usePad(this.#pad);
      return;
    }
    if (this.#shop >= 0) this.openShop(this.#shop === 1);
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
  update(dt: number): void {
    const d = this.drive, s = walkSpawnZone(), lobby = this.#lobby;
    const p = d.walking ? d.walker.position : d.vehicle.position;
    this.#time += dt;
    this.#bayCool = Math.max(0, this.#bayCool - dt);
    this.#messageTime = Math.max(0, this.#messageTime - dt);
    this.panel.hidden = !this.isPlaying() || (!d.walking && !d.active) || Math.hypot(p.x - s.x, p.z - s.z) > 85;
    if (this.panel.hidden) return;
    if (lobby) {
      lobby.update(dt, this.#time, (x, z) => this.drive.height(x, z));
      this.#clampCamera(p.x, p.y, p.z, lobby);
    }
    this.#shop = -1;
    this.#pad = null;
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
    }
    const bay = lobby?.bay;
    const inBay = bay ? Math.hypot(p.x - bay.x, p.z - bay.z) < 6 : false;
    if (d.active && !d.walking && inBay && d.vehicle.telemetry.speed < 10 / 3.6 && this.#bayCool === 0) {
      this.#bayDwell += dt;
      if (this.#bayDwell > 0.5) {
        this.#bayDwell = 0;
        this.#bayCool = 6;
        this.openShop(true);
        return;
      }
    } else this.#bayDwell = 0;
    if (d.walking && lobby && Math.hypot(p.x - lobby.bench.x, p.z - lobby.bench.z) < 2.4) this.#shop = 1;
    if (d.active) this.#entered = true;
    const marker = this.markers[this.#next];
    if (d.active && d.race.state === 'idle' && marker && Math.hypot(p.x - marker.position.x, p.z - marker.position.z) < 7) {
      marker.visible = false; this.#next++;
      if (this.#next === 5) this.#messageTime = 8;
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
    const lobby = this.#lobby;
    const p = d.walking ? d.walker.position : d.vehicle.position;
    const inHall = !!lobby && (
      (Math.abs(p.x - lobby.petal.x) < lobby.petal.w / 2 && Math.abs(p.z - lobby.petal.z) < lobby.petal.d / 2)
      || (Math.abs(p.x - lobby.bay.x) < lobby.bay.w / 2 && Math.abs(p.z - lobby.bay.z) < lobby.bay.d / 2)
    );
    this.action.hidden = !d.walking || (this.#shop < 0 && d.vehicleRange() > 4.2);
    this.action.textContent = this.#shop >= 0 ? `Enter ${this.#shop === 0 ? 'Cars' : 'Tune'}` : 'Enter car';
    this.prompt.textContent = this.#shop >= 0 ? (this.#shop === 0 ? 'Petal Motors' : 'Open Bay')
      : this.#messageTime > 0 && this.#message ? this.#message
      : inHall ? 'Walk up to a car to inspect or buy.'
      : !this.#entered ? 'Your car. Take it out.'
      : this.#messageTime > 0 ? 'Nice start! Practice complete · Sparks rewards coming later.'
      : this.#next < 5 ? `Optional · Follow the gold sparks ${this.#next}/5 · Or take the open road.`
      : 'The island is yours. Call car is in the Play menu.';
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
