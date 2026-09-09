import { BoxGeometry, CanvasTexture, ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, DoubleSide } from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { walkSpawnZone } from '@/config/walker.config';
import './sakuraCommons.css';

/** Kleine, bodengebundene Startkulisse; keine neue Terrainfläche. */
export class SakuraCommons implements System {
  readonly name = 'SakuraCommons';
  readonly group = new Group();
  readonly panel = document.createElement('div');
  readonly prompt = document.createElement('span');
  readonly action = document.createElement('button');
  readonly markers: Mesh[] = [];
  openShop: (tune: boolean) => void = () => {};
  #next = 0;
  #entered = false;
  #shop = -1;
  isPlaying: () => boolean = () => false;
  #messageTime = 0;
  constructor(readonly drive: DriveSystem, container: HTMLElement) {
    this.panel.className = 'commons-prompt';
    this.panel.hidden = true;
    this.prompt.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.prompt, this.action);
    container.append(this.panel);
  }
  init(context: EngineContext): void {
    const s = walkSpawnZone();
    const wood = new MeshStandardMaterial({ color: 0x624232, roughness: 0.9 });
    const roof = new MeshStandardMaterial({ color: 0x252f34, roughness: 0.85 });
    const glow = new MeshBasicMaterial({ color: 0xffc77c });
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: MeshStandardMaterial | MeshBasicMaterial) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
    };
    for (const [i, name] of ['Petal Motors', 'Open Bay'].entries()) {
      const x = s.x + (i === 0 ? -22 : 22), z = s.z - 32;
      const ground = this.drive.height(x, z);
      // Sockel steckt im Hang; die Fahrfläche bleibt das bestehende Terrain.
      box(x, ground + 1.5, z, 14, 5, 9, wood);
      box(x, ground + 4.15, z, 16, 0.5, 11, roof);
      box(x, ground + 1.5, z + 4.56, 4, 3, 0.08, glow);
      box(x, ground + 0.08, z + 5.5, 5, 0.1, 2, glow);
      this.drive.collision.addBox(x - 7, x + 7, z - 4.5, z + 4.5, ground - 1, ground + 4);
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#202b2d'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#ffe6be'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(name, 256, 64);
      ctx.font = '22px sans-serif'; ctx.fillText(i === 0 ? 'CARS' : 'TUNE', 256, 102);
      const sign = new Mesh(new PlaneGeometry(10, 2.5), new MeshBasicMaterial({ map: new CanvasTexture(canvas), side: DoubleSide }));
      sign.position.set(x, ground + 3.25, z + 4.62);
      this.group.add(sign);
    }
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
    if (event.code === 'Enter' && !event.repeat && !this.panel.hidden) {
      event.preventDefault(); this.#use();
    }
  };
  #use(): void {
    if (this.#shop >= 0) this.openShop(this.#shop === 1);
    else if (this.drive.walking) this.drive.board();
  }
  update(dt: number): void {
    const d = this.drive, s = walkSpawnZone();
    const p = d.walking ? d.walker.position : d.vehicle.position;
    this.panel.hidden = !this.isPlaying() || (!d.walking && !d.active) || Math.hypot(p.x - s.x, p.z - s.z) > 85;
    if (this.panel.hidden) return;
    this.#shop = -1;
    if (d.walking) for (let i = 0; i < 2; i++) {
      if (Math.hypot(p.x - (s.x + (i === 0 ? -22 : 22)), p.z - (s.z - 25)) < 5) this.#shop = i;
    }
    if (d.active) this.#entered = true;
    const marker = this.markers[this.#next];
    if (d.active && d.race.state === 'idle' && marker && Math.hypot(p.x - marker.position.x, p.z - marker.position.z) < 7) {
      marker.visible = false; this.#next++;
      if (this.#next === 5) this.#messageTime = 8;
    }
    this.#messageTime = Math.max(0, this.#messageTime - dt);
    this.action.hidden = !d.walking || (this.#shop < 0 && d.vehicleRange() > 4.2);
    this.action.textContent = this.#shop >= 0 ? `Enter ${this.#shop === 0 ? 'Cars' : 'Tune'}` : 'Enter car';
    this.prompt.textContent = this.#shop >= 0 ? (this.#shop === 0 ? 'Petal Motors' : 'Open Bay')
      : !this.#entered ? 'Your car. Take it out.'
      : this.#messageTime > 0 ? 'Nice start! Practice complete · Sparks rewards coming later.'
      : this.#next < 5 ? `Optional · Follow the gold sparks ${this.#next}/5 · Or take the open road.`
      : 'The island is yours. Call car is in the Play menu.';
  }
  dispose(): void {
    window.removeEventListener('keydown', this.#key);
    this.panel.remove(); this.group.removeFromParent();
    this.group.traverse(object => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const material = object.material as MeshBasicMaterial;
        material.map?.dispose(); material.dispose();
      }
    });
  }
}
