import {
  CanvasTexture, CatmullRomCurve3, DoubleSide, Group, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { PropFile, PropPlacement } from '@/config/props.config';
import { PROP_ASSETS } from '../props/propAssets';
import { LocalSurfaces, type Point } from './LocalSurfaces';
import { HOMES, MILL, MILL_LANE, POND } from './settlementLayout';
import { SettlementKit } from './SettlementKit';
import './settlements.css';

const WOOD = 0x654731, TRIM = 0x342c25, PLASTER = 0xc0ac83, STONE = 0x777b6c;
const ROOF = 0x384746, WATER = 0x4b9a93, GOLD = 0xfbd397;
type Actor = { mesh: InstancedMesh; spots: readonly (readonly [number, number, number])[]; kind: 'goat' | 'chicken' | 'worker' };

/** WP5: kleine, begehbare Orte auf dem vorhandenen Gelände. */
export class StillwaterVillage implements System {
  readonly name = 'StillwaterVillage';
  readonly village = new Group();
  readonly harbour = new Group();
  readonly wheel = new Group();
  readonly lever = new Group();
  readonly floors = new LocalSurfaces();
  readonly laneSamples: Vector3[] = [];
  readonly panel = document.createElement('div');
  readonly label = document.createElement('span');
  readonly action = document.createElement('button');
  readonly actors: Actor[] = [];
  isPlaying: () => boolean = () => false;
  sluiceOpen = true;
  millY = 0;
  pondY = 0;
  #context: EngineContext | null = null;
  #time = 0;
  #wheelSpeed = Math.PI / 3;
  #spot = '';
  #message = '';
  #messageUntil = 0;
  readonly #material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  readonly #waterMaterial = new MeshStandardMaterial({ color: WATER, roughness: 0.24, metalness: 0.25, side: DoubleSide });
  readonly #matrix = new Matrix4();
  readonly #flow = new Group();
  readonly #villageSigns = new SettlementKit();
  readonly #harbourSigns = new SettlementKit();

  constructor(readonly drive: DriveSystem, container: HTMLElement) {
    this.panel.className = 'settlement-prompt'; this.panel.hidden = true;
    this.label.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.label, this.action); container.append(this.panel);
  }
  #ground(x: number, z: number): number { return this.drive.terrain!.getHeightAt(x, z); }
  #maxGround(x: number, z: number, w: number, d: number): number {
    let y = -Infinity;
    for (let dx = -w / 2; dx <= w / 2; dx += 1) for (let dz = -d / 2; dz <= d / 2; dz += 1)
      y = Math.max(y, this.#ground(x + dx, z + dz));
    return y;
  }
  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.village.name = 'Stillwater Village'; this.harbour.name = 'Tideglass Harbour';
    context.scene.add(this.village, this.harbour);
    const file = await context.resources.json<PropFile>(PROP_ASSETS.placements);
    this.#buildVillage(); this.#buildHarbour(file.props);
    this.drive.ground.localSurfaces = this.floors;
    window.addEventListener('keydown', this.#key);
  }
  #solid(k: SettlementKit, x: number, y: number, z: number, w: number, h: number, d: number, color: number): void {
    k.box(x, y, z, w, h, d, color);
    this.drive.collision.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y - h / 2, y + h / 2);
  }
  #floor(k: SettlementKit, x: number, z: number, w: number, d: number, y: number, color = STONE): void {
    const base = Math.min(this.#ground(x - w / 2, z - d / 2), this.#ground(x + w / 2, z + d / 2)) - 0.4;
    k.box(x, (y + base) / 2, z, w, y - base, d, color);
    // Unregelmäßige Steinlagen machen hohe Terrassensockel zu Mauerwerk.
    if (color === STONE) for (let row = 0; row < Math.ceil((y - base) / 0.52); row++) {
      const by = y - 0.28 - row * 0.52;
      for (const s of [-1, 1]) {
        for (let dx = -w / 2 + 0.5; dx < w / 2; dx += 1.05) {
          const bx = x + dx + (row % 2) * 0.18;
          if (by < this.#ground(bx, z + s * d / 2) - 0.3) continue;
          k.box(bx, by, z + s * (d / 2 + 0.025), 0.94, 0.43, 0.09, [0x8c8a77, 0x717d70, 0x999783][(row + Math.floor(dx + w)) % 3]!);
        }
        for (let dz = -d / 2 + 0.5; dz < d / 2; dz += 1.05) {
          if (by < this.#ground(x + s * w / 2, z + dz) - 0.3) continue;
          k.box(x + s * (w / 2 + 0.025), by, z + dz, 0.09, 0.43, 0.94, row % 2 ? 0x8a8d79 : 0x717d70);
        }
      }
    }
    this.floors.quad([x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]);
  }
  #roof(k: SettlementKit, x: number, y: number, z: number, w: number, d: number, color = ROOF): void {
    const pitch = 0.43, span = w / 2 + 1.05, rise = Math.sin(pitch) * span;
    for (const s of [-1, 1]) {
      k.gable(x, y - 0.08, z + s * d / 2, w, Math.tan(pitch) * w / 2 + 0.2, 0.22, PLASTER);
      k.box(x, y + rise * 0.43, z + s * (d / 2 + 0.13), 0.2, rise * 0.9, 0.16, WOOD);
      k.box(x, y + 0.04, z + s * (d / 2 + 0.15), w + 0.1, 0.2, 0.2, WOOD);
    }
    for (const s of [-1, 1]) {
      k.box(x + s * span * Math.cos(pitch) / 2, y + rise / 2, z, span, 0.24, d + 2.2, color, 0, 0, -s * pitch);
      for (let j = -d / 2 - 0.9; j <= d / 2 + 1; j += 1.1)
        k.box(x + s * span * Math.cos(pitch) / 2, y + rise / 2 + 0.15, z + j, span + 0.08, 0.1, 0.12, color, 0, 0, -s * pitch);
    }
    k.box(x, y + rise + 0.14, z, 0.45, 0.32, d + 2.5, TRIM);
  }
  #house(k: SettlementKit, x: number, z: number, w: number, d: number, index: number): void {
    const y = this.#maxGround(x, z, w, d) + 0.15, h = 3.7 + (index % 3) * 0.4;
    this.#floor(k, x, z, w + 0.6, d + 0.6, y);
    this.#solid(k, x, y + h / 2, z, w, h, d, index % 3 === 0 ? 0x9d7961 : PLASTER);
    this.#roof(k, x, y + h, z, w, d, index % 4 === 0 ? 0x665c47 : ROOF);
    for (const s of [-1, 1]) {
      for (let dx = -w / 2; dx <= w / 2; dx += w / 4) k.box(x + dx, y + h / 2, z + s * (d / 2 + 0.08), 0.17, h, 0.18, WOOD);
      k.box(x, y + 0.65, z + s * (d / 2 + 0.08), w, 0.85, 0.18, WOOD);
      for (const dx of [-w * 0.28, w * 0.28]) {
        k.box(x + dx, y + 2.2, z + s * (d / 2 + 0.11), 1.7, 1.35, 0.12, GOLD);
        for (const t of [-0.6, 0, 0.6]) k.box(x + dx + t, y + 2.2, z + s * (d / 2 + 0.2), 0.08, 1.45, 0.12, TRIM);
      }
      k.box(x, y + 1.15, z + s * (d / 2 + 0.12), 1.4, 2.3, 0.16, TRIM);
      k.box(x, y + 2.55, z + s * (d / 2 + 0.65), 3.2, 0.14, 1.5, WOOD, s * 0.12);
      for (const dx of [-w * 0.4, w * 0.4]) {
        k.box(x + dx, y + 0.32, z + s * (d / 2 + 0.65), 1.4, 0.5, 0.7, 0x846348);
        for (let j = 0; j < 3; j++) k.ball(x + dx - 0.45 + j * 0.45, y + 0.65, z + s * (d / 2 + 0.65), 0.26, index % 2 ? 0xcbb882 : 0x869766);
      }
    }
  }
  #lane(k: SettlementKit, nodes: readonly (readonly [number, number])[], width: number, group: Group, color: number, record = false): void {
    const curve = new CatmullRomCurve3(nodes.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
    const count = Math.ceil(curve.getLength() / 1.5), points = curve.getSpacedPoints(count);
    const ys = points.map(p => {
      this.drive.ground.refresh(p.x, p.z, 0);
      return Math.max(this.#maxGround(p.x, p.z, width + 1, width + 1) + 0.38, this.drive.height(p.x, p.z) + 0.5);
    });
    // Oberhalb des Geländes bleiben, aber Terrassenkanten mit einer fahrbaren Steigung überbrücken.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= count; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! - points[i]!.distanceTo(points[i - 1]!) * 0.12);
      for (let i = count - 1; i >= 0; i--) ys[i] = Math.max(ys[i]!, ys[i + 1]! - points[i]!.distanceTo(points[i + 1]!) * 0.12);
    }
    for (const end of [0]) {
      const p = points[end]!; this.drive.ground.refresh(p.x, p.z, 0);
      const offset = ys[end]! - this.drive.height(p.x, p.z) - 0.025;
      for (let j = 0; j < 8; j++) { const i = end === 0 ? j : count - j; ys[i] = ys[i]! - offset * (1 - j / 8); }
    }
    const surface = new LocalSurfaces();
    let prevL: Point | null = null, prevR: Point | null = null;
    for (let i = 0; i <= count; i++) {
      const p = points[i]!, before = points[Math.max(0, i - 1)]!, after = points[Math.min(count, i + 1)]!;
      const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz);
      const nx = dz / len, nz = -dx / len, y = ys[i]!;
      const l: Point = [p.x + nx * width / 2, y, p.z + nz * width / 2];
      const r: Point = [p.x - nx * width / 2, y, p.z - nz * width / 2];
      if (prevL && prevR) { surface.quad(prevL, prevR, r, l); this.floors.quad(prevL, prevR, r, l); }
      if (record) this.laneSamples.push(new Vector3(p.x, y, p.z));
      if (i % 3 === 0) for (const s of [-1, 1]) {
        const x = p.x + nx * width / 2 * s, z = p.z + nz * width / 2 * s;
        const base = this.#ground(x, z) - 0.2;
        k.box(x, (base + y) / 2, z, 0.4, Math.max(0.2, y - base), 4.6, STONE, 0, Math.atan2(dx, dz));
        k.box(x, y + 0.05, z, 0.42, 0.1, 4.6, 0xb3ad94, 0, Math.atan2(dx, dz));
      }
      if (i % 2 === 0) k.box(p.x, y + 0.015, p.z, width - 0.25, 0.025, 0.05, 0x8e8d79, 0, Math.atan2(dx, dz));
      if (record && i > 0 && i < count) {
        const pitch = Math.atan2(ys[i + 1]! - ys[i - 1]!, before.distanceTo(after));
        for (let j = 0; j < 7; j++) {
          const offset = (j - 3) * 0.94;
          k.add(new PlaneGeometry(0.87, 1.36), [0xb2aa91, 0xa59d88, 0xbbb197, 0x969988][(i * 13 + j * 7) % 4]!, p.x + nx * offset, y + 0.018, p.z + nz * offset, -Math.PI / 2 - pitch, Math.atan2(dx, dz));
        }
      }
      prevL = l; prevR = r;
    }
    const mesh = new Mesh(surface.geometry(), new MeshStandardMaterial({ color, roughness: 0.95, side: DoubleSide }));
    mesh.name = record ? 'Mill Lane · shared driving surface' : 'Harbour working lane'; group.add(mesh);
  }
  #sign(group: Group, x: number, y: number, z: number, title: string, sub: string, width = 4): void {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 172;
    const c = canvas.getContext('2d')!;
    c.scale(2 / 3, 2 / 3);
    c.fillStyle = '#253c3b'; c.fillRect(0, 0, 768, 256);
    c.strokeStyle = '#c7ae79'; c.lineWidth = 5; c.strokeRect(12, 12, 744, 232);
    c.fillStyle = '#ffe4b4'; c.textAlign = 'center'; c.font = '600 56px Georgia'; c.fillText(title, 384, 108);
    c.font = '27px sans-serif'; c.fillText(sub, 384, 178);
    const material = new MeshBasicMaterial({ map: new CanvasTexture(canvas) });
    const mesh = new Mesh(new PlaneGeometry(width, width / 3), material);
    mesh.position.set(x, y, z + 0.03); group.add(mesh);
    const back = mesh.clone(); back.rotation.y = Math.PI; back.position.z = z - 0.03; group.add(back);
    const k = group === this.village ? this.#villageSigns : this.#harbourSigns;
    k.box(x, y, z, width + 0.16, width / 3 + 0.16, 0.045, WOOD);
    // Fassadenschilder brauchen keine Pfosten; freie Wegweiser schon.
    if (!(x === -1244 || (x === 784 && z > 1009))) for (const s of [-1, 1]) {
      const ground = Math.max(this.#ground(x + s * width * 0.4, z), this.floors.height(x + s * width * 0.4, z));
      k.box(x + s * width * 0.4, (ground + y) / 2, z, 0.13, Math.max(0.1, y - ground), 0.13, WOOD);
    }
  }
  #water(group: Group, x: number, y: number, z: number, w: number, d: number): void {
    const m = new Mesh(new PlaneGeometry(w, d), this.#waterMaterial);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); group.add(m);
  }
  #boat(k: SettlementKit, x: number, y: number, z: number): void {
    k.box(x, y, z, 1.45, 0.18, 4.5, 0x443c2e);
    for (const s of [-1, 1]) {
      k.box(x + s * 0.75, y + 0.3, z, 0.16, 0.6, 4.5, WOOD, 0, 0, s * -0.12);
      k.box(x, y + 0.3, z + s * 2.1, 1.5, 0.6, 0.16, WOOD);
      k.box(x, y + 0.35, z + s * 0.95, 1.45, 0.12, 0.32, 0xa08762);
    }
    k.box(x + 0.3, y + 0.5, z, 0.09, 0.1, 5.8, 0xc4ae7c, 0, 0.22);
    k.cylinder(x - 0.3, y + 0.32, z, 0.3, 0.45, 0x687763);
  }
  #fence(k: SettlementKit, x: number, z: number, w: number, d: number): void {
    for (const s of [-1, 1]) {
      for (let dx = -w / 2; dx <= w / 2; dx += 2) {
        const y = this.#ground(x + dx, z + s * d / 2);
        this.#solid(k, x + dx, y + 0.65, z + s * d / 2, 0.16, 1.3, 0.16, WOOD);
      }
      for (const h of [0.4, 0.9]) {
        const y = this.#ground(x, z + s * d / 2);
        k.box(x, y + h, z + s * d / 2, w, 0.12, 0.12, WOOD);
      }
      const y = this.#ground(x + s * w / 2, z);
      this.#solid(k, x + s * w / 2, y + 0.7, z, 0.14, 0.14, d, WOOD);
    }
  }
  #buildVillage(): void {
    const k = new SettlementKit();
    this.#lane(k, MILL_LANE, 7, this.village, 0xaaa28a, true);
    HOMES.forEach(([x, z, w, d], i) => this.#house(k, x, z, w, d, i));
    this.millY = this.#maxGround(MILL.x, MILL.z, 14, 10) + 0.18;
    const y = this.millY;
    this.#floor(k, MILL.x, MILL.z, 14, 10, y, 0x8d8068);
    // Breite Schwelle, dazu eine kurze Rampe zum vorhandenen Fahrweg.
    this.#floor(k, -1247, 417, 20, 6, y);
    const entry = this.laneSamples.reduce((a, b) => Math.hypot(a.x + 1266, a.z - 417) < Math.hypot(b.x + 1266, b.z - 417) ? a : b);
    const ramp = new LocalSurfaces();
    const corners: [Point, Point, Point, Point] = [[entry.x, entry.y + 0.025, 414], [-1257, y, 414], [-1257, y, 420], [entry.x, entry.y + 0.025, 420]];
    this.floors.quad(...corners); ramp.quad(...corners);
    this.village.add(new Mesh(ramp.geometry(), new MeshStandardMaterial({ color: 0xaaa28a, side: DoubleSide })));
    // Südportal, Nordfenster und Wellenöffnung bleiben echte Löcher, auch in der Kollision.
    for (const x of [-1249.35, -1238.65]) this.#solid(k, x, y + 2.2, 414, 3.3, 4.4, 0.3, PLASTER);
    this.#solid(k, -1244, y + 3.85, 414, 7.4, 1.1, 0.3, PLASTER);
    this.#solid(k, -1237, y + 2.2, 409, 0.3, 4.4, 10, PLASTER);
    this.#solid(k, -1251, y + 2.2, 410.5, 0.3, 4.4, 7, PLASTER);
    this.#solid(k, -1251, y + 3.9, 405.5, 0.3, 1, 3, PLASTER);
    for (const z of [404, 407, 410.5, 414]) k.box(-1251.2, y + 2.2, z, 0.18, 4.45, 0.22, WOOD);
    for (const h of [0.45, 1, 3.7]) k.box(-1251.2, y + h, 410.5, 0.18, 0.17, 6.8, WOOD);
    for (let z = 407.3; z < 414; z += 0.3) k.box(-1251.23, y + 0.55, z, 0.12, 1.1, 0.15, WOOD);
    k.box(-1251.3, y + 2.35, 411, 0.12, 1.4, 1.8, GOLD);
    for (const z of [410.3, 411, 411.7]) k.box(-1251.39, y + 2.35, z, 0.12, 1.45, 0.07, TRIM);
    this.#solid(k, -1244, y + 0.5, 404, 14, 1, 0.3, WOOD);
    this.#solid(k, -1244, y + 3.9, 404, 14, 1, 0.3, PLASTER);
    for (const x of [-1250, -1238]) this.#solid(k, x, y + 2.2, 404, 2, 2.5, 0.3, PLASTER);
    for (const x of [-1251, -1247.5, -1240.5, -1237]) for (const z of [404, 414]) k.box(x, y + 2.2, z, 0.23, 4.5, 0.38, TRIM);
    for (const z of [405, 409, 413]) k.box(-1244, y + 4.35, z, 14.4, 0.28, 0.3, WOOD);
    this.#roof(k, -1244, y + 4.5, 409, 14, 10);
    for (let x = -1250.5; x < -1237; x += 0.48) k.box(x, y + 0.015, 409, 0.025, 0.03, 9.8, 0x655b4b);
    for (const x of [-1247.7, -1240]) {
      k.cylinder(x, y + 0.45, 407, 1.1, 0.75, STONE);
      k.cylinder(x, y + 0.88, 407, 0.95, 0.18, 0xb0ae94);
      this.drive.collision.addCylinder(x, 407, 1.1, y, y + 1.05);
      k.cylinder(x, y + 1.6, 407, 0.11, 2, WOOD);
      k.cylinder(x, y + 2.5, 407, 0.32, 0.9, WOOD, 0, 0, 0.85);
      k.box(x, y + 1.25, 408.4, 0.6, 0.2, 1.8, WOOD, -0.35);
    }
    k.cylinder(-1247, y + 1.65, 405.5, 0.16, 10, WOOD, 0, Math.PI / 2);
    for (let i = 0; i < 7; i++) k.cylinder(-1238.3 - (i % 2) * 0.85, y + 0.4 + Math.floor(i / 4) * 0.7, 410 + Math.floor(i / 2) * 0.75, 0.4, 0.75, 0xb4a07a);
    k.box(-1248.7, y + 1.05, 410.6, 0.65, 0.8, 0.6, WOOD);
    const leverKit = new SettlementKit();
    leverKit.box(0, 0.35, 0, 0.12, 0.9, 0.12, 0xd4a45c);
    leverKit.ball(0, 0.8, 0, 0.14, WOOD);
    leverKit.finish(this.lever, this.#material, 'Sluice lever');
    this.lever.position.set(-1248.7, y + 1.25, 410.6); this.village.add(this.lever);
    this.#sign(this.village, -1244, y + 3.7, 414.22, 'Stillwater Mill', 'ENTER · GRAIN / WATER / QUIET', 4.6);
    this.#sign(this.village, -1244, y + 0.5, 404.2, 'The mill pond', 'TERRACE WATER · RETURN TO THE RIVER', 2.8);
    const glow = new MeshBasicMaterial({ color: GOLD });
    for (const x of [-1247, -1241]) {
      const lamp = new Mesh(new PlaneGeometry(0.65, 0.9), glow); lamp.position.set(x, y + 2.4, 414.25); this.village.add(lamp);
    }
    this.#buildWheel(y);
    this.#buildWaterworks(k);
    // Pond walk: kleine Stufen verbinden den unteren Teich mit dem Mühlhof.
    const pondWalkY = this.pondY + 0.18;
    this.#floor(k, -1257, 396.8, 2.6, 2.6, pondWalkY);
    this.#floor(k, -1260, 398, 3.8, 2.6, pondWalkY, WOOD);
    for (let i = 0; i < 19; i++) {
      const z = 398.4 + i * 0.84, top = pondWalkY + (y - pondWalkY) * (i + 1) / 19;
      this.#floor(k, -1257, z, 2.6, 0.9, top);
      if (i % 3 === 0) k.box(-1255.6, top + 0.52, z, 0.12, 1.04, 0.12, WOOD);
    }
    this.#tree(k, -1267, 378, 1, 0xb78457);
    this.#tree(k, -1235, 418, 0.85, 0xa19360);
    this.#tree(k, -1280, 409, 0.9, 0x80956b);
    // Sitznische vor dem Wasser: Blick aufs Rad statt Dekoration mitten in der Fahrspur.
    const seatY = this.floors.height(-1263, 398);
    k.box(-1263, seatY + 0.52, 399.1, 2.5, 0.16, 0.55, WOOD);
    for (const dx of [-0.9, 0.9]) k.box(-1263 + dx, seatY + 0.26, 399.1, 0.15, 0.52, 0.42, TRIM);
    this.#house(k, -1300, 415, 7, 6, 2); this.#house(k, -1284, 446, 7, 5, 1);
    this.#fence(k, -1304, 393, 10, 12);
    // Kleine Gemüsebeete und Obstbäume an den Hausrändern, keine neue Biomfläche.
    for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) {
      const x = -1320 + i * 3.7, z = 435 + j * 3.5, g = this.#ground(x, z);
      k.box(x, g + 0.06, z, 2.8, 0.12, 2.7, 0x61543b);
      for (let n = 0; n < 3; n++) k.ball(x - 0.7 + n * 0.7, g + 0.28, z, 0.32, 0x819256);
    }
    for (let i = 0; i < 6; i++) {
      const x = -1312 + i * 5, z = 367 - i * 1.4, g = this.#ground(x, z);
      k.cylinder(x, g + 1.4, z, 0.16, 2.8, WOOD);
      k.ball(x, g + 3.1, z, 1.9, i % 2 ? 0x8e9f61 : 0xa4aa71);
      for (let j = 0; j < 5; j++) k.ball(x + Math.cos(j * 1.3) * 1.5, g + 2.7, z + Math.sin(j * 1.3) * 1.5, 0.16, 0xd4a15f);
    }
    for (let i = 20; i < this.laneSamples.length; i += 29) {
      const p = this.laneSamples[i]!;
      k.box(p.x - 4.4, p.y + 1.2, p.z, 0.18, 2.4, 0.18, TRIM);
      k.box(p.x - 4.4, p.y + 2.2, p.z, 0.55, 0.65, 0.55, GOLD);
      k.box(p.x - 4.4, p.y + 2.6, p.z, 0.8, 0.14, 0.8, ROOF);
    }
    this.#sign(this.village, -1150, this.#ground(-1150, 140) + 2.5, 140, 'Stillwater Village', 'MILL LANE · FOLLOW THE STONE PATH', 5);
    this.#sign(this.village, -1267, this.#ground(-1267, 425) + 2.8, 425, 'Stillwater Village', 'PARK BY THE MILL · EXPLORE ON FOOT', 4);
    k.finish(this.village, this.#material, 'Timber homes, mill, gardens and waterworks');
    this.#villageSigns.finish(this.village, this.#material, 'Sign frames and posts');
    this.#actors('goat', [[-1306, 392, 0.4], [-1302, 396, 2.4]], this.village);
    this.#actors('chicken', [[-1284, 434, 0], [-1281, 436, 1.2], [-1286, 438, 2.1], [-1280, 432, 4]], this.village);
    this.#actors('worker', [[-1242, 411, 2.8], [-1307, 439, 0.2], [-1311, 446, 1.2], [-1247, 381, 2], [-1250, 381, 0.5], [-1264.4, 397.3, 2.9], [-1269, 371, 0.4], [-1278, 410, 2.6]], this.village);
  }
  #tree(k: SettlementKit, x: number, z: number, scale: number, color: number): void {
    const y = Math.max(this.#ground(x, z), this.floors.height(x, z));
    k.cylinder(x, y + 2.4 * scale, z, 0.23 * scale, 4.8 * scale, WOOD, 0, 0.1);
    for (let j = 0; j < 11; j++) {
      const a = j * 2.4, r = (j % 3 + 1) * 0.8 * scale;
      const g = new SphereGeometry(1, 7, 5); g.scale(2.1 * scale, 0.8 * scale, 1.8 * scale);
      k.add(g, j % 3 === 0 ? 0xc2a26b : color, x + Math.cos(a) * r, y + (4.2 + (j % 3) * 0.6) * scale, z + Math.sin(a) * r);
    }
    this.drive.collision.addCylinder(x, z, 0.25 * scale, y, y + 4 * scale);
  }
  #buildWheel(y: number): void {
    this.wheel.name = 'Waterwheel · shaft enters mill wall';
    this.wheel.position.set(-1251.7, y + 1.65, 405.5);
    const k = new SettlementKit();
    for (const x of [-0.48, 0.48]) k.add(new TorusGeometry(1.5, 0.11, 5, 20), WOOD, x, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      k.box(0, Math.cos(a) * 1.43, Math.sin(a) * 1.43, 1.2, 0.16, 0.52, i === 0 ? 0xe9ddbb : WOOD, a);
      k.box(0, 0, 0, 0.18, 2.85, 0.12, WOOD, a);
    }
    k.cylinder(0, 0, 0, 0.28, 1.5, TRIM, 0, Math.PI / 2);
    k.finish(this.wheel, this.#material, 'Twelve paddles'); this.village.add(this.wheel);
  }
  #buildWaterworks(k: SettlementKit): void {
    this.pondY = this.#maxGround(POND.x, POND.z, POND.w, POND.d) + 0.36;
    const y = this.pondY;
    // Flacher, gefasster Teich; Boden und Rand verdecken das unveränderte Reiswasser darunter.
    this.#floor(k, POND.x, POND.z, POND.w + 1, POND.d + 1, y - 0.27, 0x596855);
    this.#water(this.village, POND.x, y, POND.z, POND.w, POND.d);
    for (const s of [-1, 1]) {
      this.#floor(k, POND.x, POND.z + s * 7.55, 24, 1.1, y + 0.13);
      this.#floor(k, POND.x + s * 11.55, POND.z, 1.1, 14, y + 0.13);
    }
    this.#boat(k, -1250, y + 0.03, 389); this.#boat(k, -1257, y + 0.03, 386);
    for (let i = 0; i < 9; i++) {
      const x = -1262 + (i % 3) * 0.85, z = 383 + Math.floor(i / 3) * 0.7;
      k.cylinder(x, y + 0.03, z, 0.27, 0.025, i % 2 ? 0x78976a : 0x678777);
      if (i % 4 === 0) k.ball(x, y + 0.13, z, 0.12, 0xe4c5a0);
    }
    for (const [x, z] of [[-1250, 386.5], [-1257, 383.5], [-1245, 392]] as const)
      k.add(new TorusGeometry(0.65, 0.014, 3, 24), 0x9fbbb0, x, y + 0.025, z, Math.PI / 2);
    this.#floor(k, -1263, 398, 6, 4, y + 0.18, WOOD);
    for (let i = 0; i < 9; i++) k.box(-1265.8 + i * 0.65, y + 0.2, 398, 0.03, 0.025, 4, TRIM);
    for (const x of [-1259, -1249]) k.box(x, y + 1.6, 380.5, 0.16, 3.2, 0.16, WOOD);
    k.box(-1254, y + 3, 380.5, 10.5, 0.12, 0.12, WOOD);
    for (let i = 0; i < 21; i++) k.box(-1259 + i * 0.5, y + 2, 380.5, 0.035, 1.8, 0.035, 0x928c72);
    for (let i = 0; i < 5; i++) k.box(-1254, y + 1.1 + i * 0.4, 380.5, 10, 0.035, 0.035, 0x928c72);
    // Der gebackene Fluss liegt tiefer: sichtbare Förderleitung statt Wasser bergauf.
    const tankY = this.millY + 3.25;
    k.cylinder(-1249, tankY + 0.55, 401.5, 0.85, 1.1, WOOD);
    for (const h of [0.1, 0.8]) k.add(new TorusGeometry(0.87, 0.045, 4, 12), TRIM, -1249, tankY + h, 401.5, Math.PI / 2);
    for (const x of [-1249.7, -1248.3]) for (const z of [400.8, 402.2]) {
      const base = this.#ground(x, z);
      k.box(x, (base + tankY) / 2, z, 0.22, tankY - base, 0.22, WOOD);
    }
    k.box(-1249, tankY - 0.5, 401.5, 2, 0.18, 2, WOOD);
    // Leitung liegt entlang des Hangs; nur der letzte Steigstrang führt zum Fass.
    for (let i = 0; i < 15; i++) {
      const x = -1219 - i * 2, a = this.#ground(x, 398) + 0.25, b = this.#ground(x - 2, 398) + 0.25;
      k.box(x - 1, (a + b) / 2, 398, Math.hypot(2, b - a), 0.18, 0.18, 0x536c68, 0, 0, -Math.atan2(b - a, 2));
    }
    const pipeBase = this.#ground(-1249, 398);
    k.cylinder(-1249, (pipeBase + tankY) / 2, 398, 0.1, tankY - pipeBase, 0x536c68);
    k.box(-1249, tankY, 399.6, 0.18, 0.18, 3.3, 0x536c68);
    // Kurze, abgestützte Kopfrinne direkt in die Wandöffnung.
    k.box(-1250.6, tankY + 0.05, 402.6, 3.3, 0.18, 1.5, WOOD);
    for (const z of [401.8, 403.4]) k.box(-1250.6, tankY + 0.28, z, 3.4, 0.5, 0.12, WOOD);
    this.#water(this.village, -1250.6, tankY + 0.16, 402.6, 3.3, 1.45);
    k.box(-1252, tankY + 0.05, 403.7, 1.2, 0.18, 1.6, WOOD);
    this.#water(this.village, -1252, tankY + 0.16, 403.7, 1.15, 1.6);
    for (const x of [-1252.7, -1251.3]) k.box(x, tankY + 0.28, 403.7, 0.12, 0.5, 1.6, WOOD);
    const stream = new Mesh(new PlaneGeometry(0.7, 1.5), new MeshBasicMaterial({ color: 0xb3ded0, transparent: true, opacity: 0.7, side: DoubleSide }));
    stream.rotation.y = Math.PI / 2; stream.position.set(-1252, tankY - 0.6, 404.4);
    this.#flow.add(stream); this.village.add(this.#flow);
    // Unterwasser vom Rad zum Teich: derselbe sichtbare Abstieg in Wasser und Holz.
    const tail = new LocalSurfaces(), tailTop = this.millY + 0.08;
    tail.quad([-1253, y, 395], [-1251, y, 395], [-1251, tailTop, 405], [-1253, tailTop, 405]);
    this.village.add(new Mesh(tail.geometry(), this.#waterMaterial));
    const fallAngle = Math.atan2(tailTop - y, 10), tailLength = Math.hypot(10, tailTop - y);
    k.box(-1252, (tailTop + y) / 2 - 0.14, 400, 2.1, 0.2, tailLength, WOOD, -fallAngle);
    for (const x of [-1253.1, -1250.9]) k.box(x, (tailTop + y) / 2 + 0.16, 400, 0.12, 0.6, tailLength, WOOD, -fallAngle);
    for (const z of [397, 400, 403]) for (const x of [-1253.1, -1250.9]) {
      const top = y + (tailTop - y) * (z - 395) / 10, base = this.#ground(x, z);
      k.box(x, (base + top) / 2, z, 0.16, Math.max(0.2, top - base), 0.16, WOOD);
    }
    // Ein schmaler Überlauf fällt zurück an den westlichen Fluss, keine globale Wasserfläche.
    const drain = new LocalSurfaces();
    drain.quad([-1242, y - 0.15, 391], [-1219, 20, 391], [-1219, 20, 393], [-1242, y - 0.15, 393]);
    this.village.add(new Mesh(drain.geometry(), this.#waterMaterial));
    for (let i = 0; i < 12; i++) {
      const x = -1242 + i * 2, dy = y - 0.15 + (20 - y + 0.15) * i * 2 / 23;
      for (const z of [390.9, 393.1]) k.box(x, dy - 0.1, z, 2.2, 0.6, 0.25, STONE, 0, 0, Math.atan2(20 - y, 23));
    }
    this.#sign(this.village, -1263, y + 2, 400.2, 'The terrace leat', 'RIVER LIFT · MILL POND · RIVER RETURN', 3.5);
  }
  #actors(kind: Actor['kind'], spots: Actor['spots'], group: Group): void {
    const k = new SettlementKit();
    if (kind === 'worker') {
      k.box(0, 1.05, 0, 0.48, 0.65, 0.28, 0x587a79); k.ball(0, 1.65, 0, 0.21, 0xba9473);
      k.cylinder(0, 1.84, 0, 0.38, 0.12, 0xc6ae7b, 0, 0, 0.2);
      for (const s of [-1, 1]) { k.box(s * 0.15, 0.4, 0, 0.16, 0.75, 0.19, 0x404745); k.box(s * 0.32, 1, 0.18, 0.15, 0.55, 0.15, 0x8c7b58, -0.5); }
    } else if (kind === 'goat') {
      k.box(0, 0.65, 0, 0.55, 0.55, 1, 0xd5cdb5); k.box(0, 1, 0.52, 0.33, 0.4, 0.4, 0xc5bda3);
      for (const s of [-1, 1]) {
        k.box(s * 0.2, 1.06, 0.58, 0.29, 0.08, 0.16, 0xafa790, 0, 0, s * 0.3);
        k.cylinder(s * 0.12, 1.34, 0.48, 0.045, 0.35, TRIM, -0.3, 0, 0.008);
        for (const z of [-0.34, 0.34]) k.box(s * 0.2, 0.24, z, 0.1, 0.5, 0.1, 0x6c6556);
        k.ball(s * 0.18, 1.04, 0.65, 0.035, 0x252623);
      }
    } else {
      k.ball(0, 0.3, 0, 0.22, 0xe0cfa5); k.ball(0, 0.52, 0.18, 0.12, 0xe5d8b8);
      k.box(0, 0.64, 0.19, 0.06, 0.12, 0.1, 0xb05838); k.box(0, 0.5, 0.31, 0.08, 0.06, 0.12, 0xc79240);
      k.box(0, 0.39, -0.23, 0.15, 0.24, 0.16, 0x79684a, -0.5);
      for (const s of [-1, 1]) k.box(s * 0.09, 0.1, 0, 0.035, 0.2, 0.04, 0xc79240);
    }
    const mesh = new InstancedMesh(k.geometry(), this.#material, spots.length); mesh.name = kind;
    mesh.frustumCulled = false; group.add(mesh); this.actors.push({ mesh, spots, kind });
    this.#updateActors(0);
  }
  #buildHarbour(placements: readonly PropPlacement[]): void {
    const k = new SettlementKit();
    this.#lane(k, [[722, 962], [722, 980], [716, 998], [716, 1018]], 6, this.harbour, 0x818580);
    this.#lane(k, [[700, 1026], [732, 1011], [770, 986], [800, 984], [840, 995]], 7, this.harbour, 0x818580);
    // Alle neun Hütten behalten Standort, Maßstab und Körper; nur Arbeitsfronten ergänzen.
    const huts = placements.filter(p => p.id === 'fishHut');
    huts.forEach((p, i) => {
      const detail = new SettlementKit();
      detail.box(0, 2.8, 2.7, 6.1, 0.18, 2.4, i % 2 ? 0x5f777a : 0x777969, -0.13);
      for (const dx of [-2.8, 2.8]) detail.box(dx, 1.35, 3.7, 0.14, 2.7, 0.14, 0x52625f);
      detail.box(2.2, 0.9, 3.2, 2.1, 0.15, 1, 0x798278);
      for (let j = 0; j < 3; j++) {
        detail.box(-2.5 + j * 0.6, 0.4, 3.2, 0.5, 0.65, 0.65, 0x7f8b83);
        detail.add(new TorusGeometry(0.27, 0.045, 4, 10), 0xb7ac83, -2.4 + j * 0.65, 0.8, 3.3, Math.PI / 2);
      }
      const geometry = detail.geometry(); geometry.scale(p.scale, p.scale, p.scale);
      geometry.rotateY(p.rot * Math.PI / 180); geometry.translate(p.x, this.#ground(p.x, p.z), p.z); k.parts.push(geometry);
    });
    // Net House ist ein offener Arbeitsschuppen am vorhandenen Hafenweg.
    const x = 784, z = 1006, y = this.#maxGround(x, z, 10, 8) + 0.1;
    this.#floor(k, x, z, 10, 8, y, 0x7e8278);
    // Schwellenrampe: Net House bleibt ohne Sprung von der Arbeitsfläche erreichbar.
    const apron = new LocalSurfaces(), front = Math.max(this.#ground(x, 1018), this.drive.height(x, 1018)) + 0.1;
    const corners: [Point, Point, Point, Point] = [[779, y, 1010], [789, y, 1010], [789, front, 1018], [779, front, 1018]];
    apron.quad(...corners); this.floors.quad(...corners);
    this.harbour.add(new Mesh(apron.geometry(), new MeshStandardMaterial({ color: 0x8d9185, side: DoubleSide })));
    this.#solid(k, x, y + 1.8, z - 4, 10, 3.6, 0.25, 0x6f7f7c);
    for (const s of [-1, 1]) this.#solid(k, x + s * 5, y + 1.8, z, 0.22, 3.6, 8, 0x6f7f7c);
    k.box(x, y + 3.8, z, 11.5, 0.22, 9.5, 0x556c72, 0.08);
    for (let i = 0; i < 13; i++) k.box(x - 3 + i * 0.5, y + 1.7, z - 2, 0.025, 2.3, 0.025, 0xa6a791);
    for (let i = 0; i < 7; i++) k.box(x, y + 0.65 + i * 0.33, z - 2, 6, 0.025, 0.025, 0xa6a791);
    for (let i = 0; i < 3; i++) {
      k.box(x + 2 + i * 0.6, y + 2, z + 1, 0.05, 2.8, 0.05, 0xbeb08a);
      for (let j = 0; j <= i; j++) k.ball(x + 2 + i * 0.6, y + 1.1 + j * 0.2, z + 1, 0.09, 0xbeb08a);
    }
    this.#sign(this.harbour, x, y + 3.2, z + 4.15, 'Net House', 'ENTER · NETS / ROPES / TIDE', 4);
    this.#sign(this.harbour, 795, this.#ground(795, 1025) + 2, 1025, 'Tideglass tide board', 'WORKING QUAY · KEEP THE LANDING CLEAR', 4);
    this.#sign(this.harbour, 830, this.#ground(830, 977) + 1.8, 977, 'Tideglass Harbour', 'OCEAN PORT · FISH MARKET →', 4);
    k.finish(this.harbour, this.#material, 'Nine upgraded huts and Net House');
    this.#harbourSigns.finish(this.harbour, this.#material, 'Harbour sign frames');
    this.#actors('worker', [[780, 1007, 1], [788, 1007, 2], [792, 1027, 0.5], [824, 978, 2]], this.harbour);
  }
  #updateActors(t: number): void {
    for (const actor of this.actors) actor.spots.forEach(([x, z, angle], i) => {
      const bob = actor.kind === 'chicken' ? Math.max(0, Math.sin(t * 3 + i)) * 0.06 : Math.sin(t * 1.3 + i) * 0.018;
      const y = Math.max(this.#ground(x, z), this.floors.height(x, z));
      this.#matrix.makeRotationY(angle + Math.sin(t * 0.6 + i) * 0.12);
      this.#matrix.setPosition(x, y + bob, z); actor.mesh.setMatrixAt(i, this.#matrix);
      actor.mesh.instanceMatrix.needsUpdate = true;
    });
  }
  readonly #key = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' && !e.repeat && !this.panel.hidden && !this.action.hidden) { e.preventDefault(); this.#use(); }
  };
  #use(): void {
    if (!this.isPlaying() || !this.drive.walking) return;
    if (this.#spot === 'sluice') {
      this.sluiceOpen = !this.sluiceOpen;
      this.#message = this.sluiceOpen ? 'Sluice open. The paddles turn and the mill comes alive.' : 'Sluice closed. Watch the wheel settle.';
    } else if (this.#spot === 'pond') this.#message = 'River water is lifted to this terrace, feeds the mill, then returns downhill. Two skiffs wait by the slip.';
    else if (this.#spot === 'nets') this.#message = 'One, two, three knots: the net-menders mark their ropes by touch.';
    else if (this.#spot === 'tide') this.#message = 'Tideglass Harbour · Six ocean boats, one working quay. The mountain mill is inland.';
    else if (this.#spot === 'market') this.#message = 'Harbour card found: Net House, boat ramp and the ocean landing.';
    this.#messageUntil = this.#time + 7;
  }
  update(dt: number): void {
    this.#time += dt;
    const p = this.drive.walking ? this.drive.walker.position : this.drive.vehicle.position;
    const camera = this.#context!.camera;
    this.village.visible = Math.hypot(camera.position.x + 1244, camera.position.z - 409) < 1800;
    this.harbour.visible = Math.hypot(camera.position.x - 784, camera.position.z - 1006) < 1300;
    this.#wheelSpeed += ((this.sluiceOpen ? Math.PI / 3 : 0) - this.#wheelSpeed) * (1 - Math.exp(-2.5 * dt));
    this.wheel.rotation.x -= dt * this.#wheelSpeed;
    this.lever.rotation.x = this.sluiceOpen ? 0.35 : -0.45;
    this.#flow.visible = this.sluiceOpen;
    if (Math.hypot(p.x + 1244, p.z - 409) < 220 || Math.hypot(p.x - 784, p.z - 1006) < 180) this.#updateActors(this.#time);
    // Kurzer Innenraum-Boom: keine Wand vor der Kamera, keine zweite Welt.
    if (this.drive.walking && p.x > -1250.7 && p.x < -1237.3 && p.z > 404.2 && p.z < 414 && this.isPlaying()) {
      const h = this.drive.walkCamera.heading;
      camera.position.set(Math.max(-1250.5, Math.min(-1237.5, p.x - Math.sin(h) * 1.6)), p.y + 2.3, Math.max(404.5, Math.min(413.8, p.z - Math.cos(h) * 1.6)));
      camera.lookAt(p.x + Math.sin(h) * 2, p.y + 1.2, p.z + Math.cos(h) * 2);
    }
    const nearVillage = Math.hypot(p.x + 1244, p.z - 409) < 105, nearHarbour = Math.hypot(p.x - 784, p.z - 1006) < 85;
    this.panel.hidden = !this.isPlaying() || (!nearVillage && !nearHarbour);
    this.#spot = '';
    if (this.drive.walking) {
      for (const [id, x, z, r] of [['sluice', -1248.7, 410.6, 2.8], ['pond', -1263, 398, 3], ['nets', 784, 1007, 4], ['tide', 795, 1025, 3], ['market', 830, 977, 3]] as const)
        if (Math.hypot(p.x - x, p.z - z) < r) this.#spot = id;
    }
    this.action.hidden = !this.#spot;
    this.action.textContent = this.#spot === 'sluice' ? (this.sluiceOpen ? 'Close sluice · Enter' : 'Open sluice · Enter') : 'Inspect · Enter';
    this.label.textContent = this.#time < this.#messageUntil ? this.#message
      : this.#spot === 'sluice' ? 'Stillwater Mill · Use the lever. Watch the wheel through the wall.'
      : nearVillage ? 'Stillwater Village · Follow the bent lane. Park at the mill and walk inside.'
      : 'Tideglass Harbour · Working waterfront. Visit Net House and the tide board.';
  }
  dispose(): void {
    window.removeEventListener('keydown', this.#key); this.panel.remove();
    this.drive.ground.localSurfaces = null;
    const materials = new Set<MeshStandardMaterial | MeshBasicMaterial>();
    for (const group of [this.village, this.harbour]) {
      group.removeFromParent(); group.traverse(o => {
        if (o instanceof Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); }
      });
    }
    for (const m of materials) { m.map?.dispose(); m.dispose(); }
  }
}
