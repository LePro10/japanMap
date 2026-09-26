import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute,
  Box3, Euler, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PlaneGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { QualityKey } from '@/config/quality.config';
import { LocalSurfaces, SurfaceStack, type Point } from '../LocalSurfaces';
import { SettlementKit } from '../SettlementKit';
import { CONCRETE, Parts, STONE, TIMBER_DARK, WARM, ball, jitter, place, plate, rng, setInteriorTiles, shade, tilePlate, type Rng } from '../wago/wagoKit';
import { clothMaterial, weatheredMaterial } from '../wago/wagoMaterial';
import { T, buildFunauraAtlas, tile } from './funauraAtlas';
import { FunauraLife, type LifePath } from './funauraLife';
import {
  EAST_MOLE, FUNAURA, FUNAYA, FUNAYA_BACK, FUNAYA_FRONT, HARBOUR_LANE, VILLAGE_HOUSES, LIGHT_RED, LIGHT_WHITE, MOLE_Y, PIER,
  PINES, PLATFORM, QUAY_Y, RIVER_ROAD, SHRINE, SHRINE_PATH, SLIPWAY, WEST_MOLE,
} from './funauraLayout';
import {
  blackPine, breakwaterLight, cat, ebisuShrine, fisher, fishingBoat, funaya, gull, house, marketHall, skiff, tetrapod,
} from './funauraBuildings';
import '../settlements.css';

/**
 * Sichtweite der Nahschicht je Qualitätsstufe. Die Masse (Wände, Dächer,
 * Kiefern) steht immer bis 2,6 km — der Umriss des Dorfes gehört zur Küste.
 * Werte wie bei den Tokio-Straßenmöbeln, weil beides dieselbe Art Kleinkram ist.
 */
// Minimal/Low kürzer als bei den Tokio-Möbeln: gemessen kostete das Dorf auf Minimal
// an der Hafenstraße sonst +233 k Dreiecke (Tokio-Kern auf Minimal: 474…673 k gesamt).
const RANGE: Readonly<Record<QualityKey, number>> = { ultra: 700, high: 480, medium: 340, low: 230, minimal: 160, custom: 480 };
const MASS_RANGE = 2600;
/** Oberflächenstruktur (Parts.fine): auf Minimal gar nicht, sonst nur aus der Nähe. */
const FINE_RANGE: Readonly<Record<QualityKey, number>> = { ultra: 380, high: 260, medium: 170, low: 100, minimal: 0, custom: 260 };
// 96 m statt 64: bei 64 m kostete das Dorf aus der Luft +133 Draw-Calls (gemessen).
const CHUNK = 96;
const EULER = new Euler();
/** Lücken in der Kaikante (x-Bereiche an der Südseite): Steg und Slipanlage. */
const QUAY_GAPS: readonly (readonly [number, number])[] = [[PIER.x - PIER.w / 2, PIER.x + PIER.w / 2], [SLIPWAY.x - SLIPWAY.w / 2, SLIPWAY.x + SLIPWAY.w / 2]];

type Chunk = { x: number; z: number; parts: Parts; mass: Mesh | null; near: Object3D[]; fine: Mesh | null; box: Box3 };
type Boat = { x: number; z: number; yaw: number; big: boolean; variant: number };
type Actor = { mesh: InstancedMesh; spots: readonly (readonly [number, number, number])[]; kind: 'fisher' | 'cat' };
type Spot = 'shrine' | 'market' | 'light' | 'funaya' | 'pier';

/** Funaura (舟浦) — Fischerdorf an der Flussmündung. docs/DOERFER.md §1. */
export class FunauraVillage implements System {
  readonly name = 'FunauraVillage';
  readonly group = new Group();
  readonly floors = new LocalSurfaces();
  readonly roadSamples: Vector3[] = [];
  readonly panel = document.createElement('div');
  readonly label = document.createElement('span');
  readonly action = document.createElement('button');
  isPlaying: () => boolean = () => false;
  readonly #stack = new SurfaceStack();
  #previous: DriveSystem['ground']['localSurfaces'] = null;
  #context: EngineContext | null = null;
  #range = RANGE.high;
  #fineRange = FINE_RANGE.high;
  #time = 0;
  #spot: Spot | '' = '';
  #message = '';
  #messageUntil = 0;
  readonly #chunks = new Map<string, Chunk>();
  // Verwittert statt lackiert: siehe wagoMaterial.ts.
  readonly #solid = weatheredMaterial();
  readonly #glass = new MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.55 });
  readonly #glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  readonly #boatMaterial = weatheredMaterial({ roughness: 0.5, strength: 0.45, doubleSide: true });
  readonly #timeU = { value: 0 };
  readonly #cloth = clothMaterial(this.#timeU);
  #signMat: MeshStandardMaterial | null = null;
  #signGlow: MeshBasicMaterial | null = null;
  #life: FunauraLife | null = null;
  readonly #near = new Group();
  readonly #boats: Boat[] = [];
  readonly #boatMeshes: { big: InstancedMesh[]; small: InstancedMesh[] } = { big: [], small: [] };
  readonly #actors: Actor[] = [];
  #gulls: InstancedMesh | null = null;
  readonly #lamps: Mesh[] = [];
  readonly #matrix = new Matrix4();
  readonly #q = new Quaternion();
  readonly #v = new Vector3();
  readonly #s = new Vector3(1, 1, 1);
  readonly #signKit = new SettlementKit();
  readonly #r: Rng = rng(0xf0a0a);

  constructor(readonly drive: DriveSystem, container: HTMLElement) {
    this.panel.className = 'settlement-prompt'; this.panel.hidden = true;
    this.label.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.label, this.action); container.append(this.panel);
  }

  #ground(x: number, z: number): number { return this.drive.terrain!.getHeightAt(x, z); }
  #maxGround(x: number, z: number, w: number, d: number): number {
    let y = -Infinity;
    for (let dx = -w / 2; dx <= w / 2; dx += 1) for (let dz = -d / 2; dz <= d / 2; dz += 1) y = Math.max(y, this.#ground(x + dx, z + dz));
    return y;
  }
  #minGround(x: number, z: number, w: number, d: number): number {
    let y = Infinity;
    for (let dx = -w / 2; dx <= w / 2; dx += 2) for (let dz = -d / 2; dz <= d / 2; dz += 2) y = Math.min(y, this.#ground(x + dx, z + dz));
    return y;
  }
  #chunk(x: number, z: number): Parts {
    const gx = Math.floor(x / CHUNK), gz = Math.floor(z / CHUNK), key = `${gx},${gz}`;
    let c = this.#chunks.get(key);
    if (!c) { c = { x: (gx + 0.5) * CHUNK, z: (gz + 0.5) * CHUNK, parts: new Parts(), mass: null, near: [], fine: null, box: new Box3() }; this.#chunks.set(key, c); }
    return c.parts;
  }
  #quad(k: SettlementKit, a: Point, b: Point, c: Point, d: Point, color: number): void {
    // Nach oben zeigen lassen: Bodenflächen werden von oben gesehen, egal in
    // welcher Umlaufrichtung der Aufrufer die Ecken liefert.
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    const up = uz * vx - ux * vz > 0;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(up ? [...a, ...b, ...c, ...a, ...c, ...d] : [...a, ...c, ...b, ...a, ...d, ...c], 3));
    g.computeVertexNormals();
    k.add(g, color, 0, 0, 0);
  }
  #floorQuad(k: SettlementKit, a: Point, b: Point, c: Point, d: Point, color: number): void {
    this.floors.quad(a, b, c, d); this.#quad(k, a, b, c, d, color);
  }
  #inPlatform(x: number, z: number): boolean {
    if (x < PLATFORM.minX || x > PLATFORM.maxX || z < PLATFORM.minZ) return false;
    return z <= (x < PLATFORM.split ? PLATFORM.faceWest : PLATFORM.faceEast);
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.group.name = 'Funaura fishing village';
    this.#near.name = 'Funaura near layer';
    context.scene.add(this.group); this.group.add(this.#near);
    context.bus.on('quality:changed', ({ level }) => {
      this.#range = RANGE[level as QualityKey] ?? RANGE.medium;
      this.#fineRange = FINE_RANGE[level as QualityKey] ?? FINE_RANGE.medium;
      // Auf den schwachen Stufen fällt die unterste Tetrapodenlage weg — sie liegt
      // unter Wasser und ist aus dem Auto kaum zu sehen.
      if (this.#pods) this.#pods.count = level === 'low' || level === 'minimal' ? this.#podsVisible : this.tetrapods;
    });
    const started = performance.now();
    const atlas = buildFunauraAtlas();
    this.#signMat = new MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.8, alphaTest: 0.5 });
    this.#signGlow = new MeshBasicMaterial({ vertexColors: true, map: atlas, toneMapped: false });
    setInteriorTiles([tile(T.room1), tile(T.room2), tile(T.room3)]);
    this.#buildPlatform();
    this.#buildFunaya();
    this.#buildHouses();
    this.#buildWorkingPort();
    this.#buildMoles();
    this.#buildRoad();
    this.#buildShrine();
    this.#buildPines();
    this.#buildGardens();
    this.#buildProps();
    this.#buildWires();
    this.#buildBoats();
    this.#buildActors();
    this.#buildSigns();
    this.#buildStreetDetail();
    this.#buildLife();
    this.#finishChunks();
    this.#previous = this.drive.ground.localSurfaces;
    this.#stack.layers.length = 0;
    if (this.#previous) this.#stack.layers.push(this.#previous);
    this.#stack.layers.push(this.floors);
    this.drive.ground.localSurfaces = this.#stack;
    window.addEventListener('keydown', this.#key);
    this.buildMs = performance.now() - started;
  }
  buildMs = 0;
  /** Für Messläufe: welche Reichweiten gerade gelten. */
  get lod(): { range: number; fine: number; pods: number } { return { range: this.#range, fine: this.#fineRange, pods: this.#pods?.count ?? 0 }; }

  // ── Kaiplatte ────────────────────────────────────────────────────────────

  /**
   * Aufgeschüttete Platte auf QUAY_Y. Nordrand als flache Böschung zum Strand
   * (1:8), damit Auto und Fußgänger vom Sand hinauf kommen, ohne Stufe.
   * Kaimauern aus Quadern mit Algenband, Pollern und Reifenfendern.
   */
  #buildPlatform(): void {
    const r = this.#r, cell = 8;
    for (let x = PLATFORM.minX; x < PLATFORM.maxX - 0.01; x += cell) {
      const x1 = Math.min(PLATFORM.maxX, x + cell), face = x < PLATFORM.split ? PLATFORM.faceWest : PLATFORM.faceEast;
      for (let z = PLATFORM.minZ; z < face - 0.01; z += cell) {
        const z1 = Math.min(face, z + cell), k = this.#chunk((x + x1) / 2, (z + z1) / 2).mass;
        this.#floorQuad(k, [x, QUAY_Y, z], [x1, QUAY_Y, z], [x1, QUAY_Y, z1], [x, QUAY_Y, z1], jitter(CONCRETE, r, 0.025));
      }
      // Böschung nach Norden: von der Platte hinunter auf den Strand.
      const k = this.#chunk((x + x1) / 2, PLATFORM.minZ).mass, zN = PLATFORM.minZ - 12;
      this.#floorQuad(k, [x, this.#ground(x, zN) + 0.04, zN], [x1, this.#ground(x1, zN) + 0.04, zN], [x1, QUAY_Y, PLATFORM.minZ], [x, QUAY_Y, PLATFORM.minZ], jitter(0x9a968b, r, 0.06));
    }
    // Farbmarkierungen der Hafenstraße. (Fugenlinien alle 4 m gab es in der ersten
    // Fassung — auf Augenhöhe lasen sie sich als Parkplatzraster und sind raus.)
    for (const z of [HARBOUR_LANE.z0, HARBOUR_LANE.z1]) for (let x = HARBOUR_LANE.minX; x < HARBOUR_LANE.maxX; x += 16)
      this.#chunk(x + 8, z).detail.box(x + 8, QUAY_Y + 0.015, z, 15.8, 0.02, 0.15, 0xe8e3d2);
    for (let x = HARBOUR_LANE.minX + 4; x < HARBOUR_LANE.maxX; x += 9)
      this.#chunk(x, 1082).detail.box(x, QUAY_Y + 0.015, (HARBOUR_LANE.z0 + HARBOUR_LANE.z1) / 2, 3, 0.02, 0.12, 0xd8b240);
    // Gebrauchsspuren: Öl- und Wasserflecken, am dichtesten um Halle und Slip.
    // Ohne sie ist die Platte eine einzige graue Fläche — so stand sie im ersten Luftbild.
    for (let i = 0; i < 70; i++) {
      const wet = i < 30, x = wet ? -1195 + (r() - 0.5) * 50 : PLATFORM.minX + r() * (PLATFORM.maxX - PLATFORM.minX);
      const z = wet ? 1085 + r() * 18 : PLATFORM.minZ + 4 + r() * 50;
      if (!this.#inPlatform(x, z)) continue;
      const g = new PlaneGeometry(1.5 + r() * 4, 1 + r() * 3);
      this.#chunk(x, z).detail.add(g, wet ? 0x6f7272 : shade(CONCRETE, 0.8 + r() * 0.1), x, QUAY_Y + 0.006 + i * 0.0002, z, -Math.PI / 2, r() * 3);
    }
    // Kaimauern: Süden (zwei Stufen), Ost, West, und die Ecke am Split.
    this.#quayWall(PLATFORM.minX, PLATFORM.faceWest, PLATFORM.split, PLATFORM.faceWest, 1);
    this.#quayWall(PLATFORM.split, PLATFORM.faceEast, PLATFORM.maxX, PLATFORM.faceEast, 1);
    this.#quayWall(PLATFORM.split, PLATFORM.faceWest, PLATFORM.split, PLATFORM.faceEast, -1);
    this.#quayWall(PLATFORM.maxX, PLATFORM.minZ, PLATFORM.maxX, PLATFORM.faceEast, 1);
    this.#quayWall(PLATFORM.minX, PLATFORM.minZ, PLATFORM.minX, PLATFORM.faceWest, -1);
  }

  /** Kaimauer von a nach b; `out` ±1 zeigt, auf welcher Seite das Wasser liegt (+x/+z). */
  #quayWall(ax: number, az: number, bx: number, bz: number, out: number): void {
    const r = this.#r, alongX = az === bz, len = alongX ? bx - ax : bz - az;
    for (let u = 0; u < len; u += 4) {
      const seg = Math.min(4, len - u), cx = alongX ? ax + u + seg / 2 : ax, cz = alongX ? az : az + u + seg / 2;
      const bed = Math.min(-0.4, this.#ground(cx + (alongX ? 0 : out * 3), cz + (alongX ? out * 3 : 0))) - 0.3;
      const p = this.#chunk(cx, cz), h = QUAY_Y - bed, cy = (QUAY_Y + bed) / 2;
      const ox = alongX ? 0 : out * 0.5, oz = alongX ? out * 0.5 : 0;
      p.mass.box(cx - ox, cy, cz - oz, alongX ? seg : 1, h, alongX ? 1 : seg, 0x8e8a80);
      // Quader über dem Wasser, dunkles Algenband darunter.
      for (let row = 0; row < 4; row++) {
        const y = QUAY_Y - 0.28 - row * 0.5;
        for (let v = 0; v < seg; v += 1.3) {
          const w = Math.min(1.25, seg - v), off = (row % 2) * 0.6;
          const px = alongX ? ax + u + ((v + off) % seg) + w / 2 : cx + out * 0.03, pz = alongX ? cz + out * 0.03 : az + u + ((v + off) % seg) + w / 2;
          plate(p.fine, px, y, pz, w - 0.05, 0.44, alongX ? 'z' : 'x', out, jitter(0x9a968a, r, 0.14));
        }
      }
      p.detail.box(cx + (alongX ? 0 : out * 0.04), -0.25, cz + (alongX ? out * 0.04 : 0), alongX ? seg : 0.06, 0.7, alongX ? 0.06 : seg, 0x3c4a3b);
      // Kante: Betonschwelle; Poller alle 12 m, Reifen alle 6 m. Wo Steg und Slip
      // anschließen, hat die Kante eine Lücke — sonst kommt kein Auto hinüber
      // (so im Fahrtest gefunden: das Auto stand vor dem Steg).
      const gap = alongX && QUAY_GAPS.some(([g0, g1]) => cx + seg / 2 > g0 && cx - seg / 2 < g1);
      if (!gap) {
        p.mass.box(cx - ox * 0.4, QUAY_Y + 0.12, cz - oz * 0.4, alongX ? seg : 0.4, 0.24, alongX ? 0.4 : seg, 0xb9b5aa);
        this.drive.collision.addWall(alongX ? cx - seg / 2 : cx, alongX ? cz : cz - seg / 2, alongX ? cx + seg / 2 : cx, alongX ? cz : cz + seg / 2, 0.2, QUAY_Y, QUAY_Y + 0.24);
      }
      if (!gap && Math.round(u) % 12 === 4) {
        const bxp = cx - ox * 1.4, bzp = cz - oz * 1.4;
        p.detail.add(new CylinderGeometry(0.18, 0.22, 0.55, 8), 0x2b2d2e, bxp, QUAY_Y + 0.28, bzp);
        p.detail.add(new CylinderGeometry(0.3, 0.3, 0.1, 8), 0x2b2d2e, bxp, QUAY_Y + 0.58, bzp);
        this.drive.collision.addCylinder(bxp, bzp, 0.25, QUAY_Y, QUAY_Y + 0.6);
      }
      if (Math.round(u) % 6 === 2) p.detail.add(new TorusGeometry(0.4, 0.13, 5, 10), 0x1c1c1c, cx + (alongX ? 0 : out * 0.15), 0.9, cz + (alongX ? out * 0.15 : 0), 0, alongX ? 0 : Math.PI / 2);
    }
    // Die Schwelle ist niedrig; ein Auto springt darüber ins Wasser, wenn es will.
  }

  // ── Bootshäuser ──────────────────────────────────────────────────────────

  #buildFunaya(): void {
    FUNAYA.forEach(([x, w, variant, balcony], i) => {
      // Leicht versetzt: in Ine folgt die Reihe der Bucht, nicht einem Lineal.
      const dz = ((i * 37) % 5) * 0.3, cz = (FUNAYA_BACK + FUNAYA_FRONT) / 2 + dz, back = FUNAYA_BACK + dz, front = FUNAYA_FRONT + dz;
      const r = rng(0xb0a7 + i * 97), p = new Parts();
      const bed = Math.min(this.#ground(x, cz + 6), -0.8);
      funaya(p, w, variant, balcony, -QUAY_Y, bed - QUAY_Y, r);
      place(p, this.#chunk(x, cz), x, QUAY_Y, cz, 0);
      // Kollision: Seiten- und Rückwand, die Garage bleibt offen (dort ist Wasser).
      const y0 = QUAY_Y - 3, y1 = QUAY_Y + 5.7;
      this.drive.collision.addBox(x - w / 2, x + w / 2, back, back + 0.3, y0, y1);
      for (const s of [-1, 1]) this.drive.collision.addBox(x + s * w / 2 - 0.2, x + s * w / 2 + 0.2, back, front + 0.3, y0, y1);
      this.drive.collision.addBox(x - w / 2, x + w / 2, back, front + 0.3, QUAY_Y + 2.7, y1);
      this.#boats.push({ x: x + (i % 2 ? 0.4 : -0.4), z: front - 3.2 + (i % 3) * 0.5, yaw: 0, big: false, variant: i });
    });
  }

  // ── Wohnhäuser, Läden, Genossenschaft ────────────────────────────────────

  #buildHouses(): void {
    VILLAGE_HOUSES.forEach(([x, z, w, d, yaw, kind, floors], i) => {
      const r = rng(0x40c5e + i * 131), p = new Parts();
      const onPlatform = this.#inPlatform(x, z);
      let y = QUAY_Y;
      if (!onPlatform) {
        const reach = Math.hypot(w, d) / 2;
        y = this.#maxGround(x, z, reach * 2, reach * 2) + 0.15;
        this.#terrace(x, z, w + 2.4, d + 3, y, yaw, i, true);
      }
      house(p, w, d, kind, floors, r);
      place(p, this.#chunk(x, z), x, y, z, yaw);
      const top = kind === 'ice' ? 8.5 : kind === 'coop' ? 7.3 : 3.3 + (floors > 1 ? 2.6 : 0) + 2;
      this.drive.collision.addOrientedBox(x, z, -yaw, w / 2, d / 2, y - 1, y + top);
    });
  }

  /**
   * Steinterrasse (Ishigaki) unter einem Haus am Hang — trägt das Haus und
   * gibt dem Weg davor eine ebene Fläche. Mauerwerk statt Erdkeil: genau das
   * Bild aus Ine und Tomonoura, wo jedes Haus auf seiner eigenen Stufe steht.
   */
  #terrace(x: number, z: number, w: number, d: number, y: number, yaw: number, seed: number, fence = false): void {
    const r = rng(0x7e44 + seed), p = new Parts();
    const low = this.#minGround(x, z, w + 2, d + 2) - 0.4, h = y - low;
    p.mass.box(0, (low - y) / 2, 0, w, h, d, 0x7d7a70);
    for (let row = 0; row * 0.45 < h; row++) {
      const by = -0.25 - row * 0.45;
      for (const s of [-1, 1]) {
        for (let u = -w / 2 + 0.4; u < w / 2; u += 0.85) plate(p.fine, u + (row % 2) * 0.3, by, s * (d / 2 + 0.03), 0.8, 0.4, 'z', s, jitter(STONE, r, 0.16));
        for (let u = -d / 2 + 0.4; u < d / 2; u += 0.85) plate(p.fine, s * (w / 2 + 0.03), by, u + (row % 2) * 0.3, 0.8, 0.4, 'x', s, jitter(STONE, r, 0.16));
      }
    }
    p.mass.box(0, 0.05, 0, w + 0.1, 0.1, d + 0.1, 0x9b978b);
    if (fence) {
      // Itabei: Bretterzaun an den Seiten, vorn eine niedrige Mauer mit Durchgang
      // und Topfpflanzen — so sieht jede Gasse in Ine und Manabe aus.
      const wood = [0x4a3d31, 0x5b4c3d, 0x3a322b][seed % 3]!;
      for (const s of [-1, 1]) {
        p.mass.box(s * (w / 2 - 0.1), 0.85, 0, 0.08, 1.7, d - 0.4, wood);
        for (let u = -d / 2 + 0.3; u < d / 2 - 0.2; u += 0.9) p.detail.box(s * (w / 2 - 0.06), 0.85, u, 0.06, 1.72, 0.07, shade(wood, 0.7));
        p.detail.box(s * (w / 2 - 0.1), 1.74, 0, 0.2, 0.08, d - 0.3, shade(wood, 0.8));
        p.mass.box(s * w * 0.3, 0.3, d / 2 - 0.2, w * 0.35, 0.6, 0.35, 0x8b877c);
        for (let j = 0; j < 2; j++) {
          p.detail.add(new CylinderGeometry(0.22, 0.16, 0.36, 8), 0x8b5a3c, s * (w * 0.18 + j * 0.55), 0.18, d / 2 - 0.7);
          ball(p.detail, s * (w * 0.18 + j * 0.55), 0.58, d / 2 - 0.7, 0.3, j ? 0x4f6b3a : 0x5f7d45, 6);
        }
      }
    }
    place(p, this.#chunk(x, z), x, y, z, yaw);
    const c = Math.cos(yaw), s = Math.sin(yaw), corner = (u: number, v: number): Point => [x + u * c + v * s, y, z - u * s + v * c];
    this.floors.quad(corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2));
  }

  // ── Arbeitshafen ─────────────────────────────────────────────────────────

  #buildWorkingPort(): void {
    const r = this.#r;
    // Fischhalle zwischen Hafenstraße und Kaimauer, Autos dürfen hindurch.
    const hx = -1180, hz = 1095.5, hw = 26, hd = 13;
    const p = new Parts(); marketHall(p, hw, hd, r); place(p, this.#chunk(hx, hz), hx, QUAY_Y, hz, 0);
    for (let x = -hw / 2; x <= hw / 2 + 0.01; x += hw / 5) for (const z of [-hd / 2, 0, hd / 2])
      this.drive.collision.addCylinder(hx + x, hz + z, 0.3, QUAY_Y, QUAY_Y + 5.2);
    // Steg.
    const pk = this.#chunk(PIER.x, (PIER.z0 + PIER.z1) / 2);
    const [x0, x1] = [PIER.x - PIER.w / 2, PIER.x + PIER.w / 2];
    this.#floorQuad(pk.mass, [x0, QUAY_Y, PIER.z0], [x1, QUAY_Y, PIER.z0], [x1, QUAY_Y, PIER.z1], [x0, QUAY_Y, PIER.z1], 0xb2aea3);
    pk.mass.box(PIER.x, QUAY_Y - 0.35, (PIER.z0 + PIER.z1) / 2, PIER.w, 0.7, PIER.z1 - PIER.z0, 0xa29e93);
    for (let z = PIER.z0 + 4; z < PIER.z1; z += 6) for (const x of [x0 + 0.5, x1 - 0.5]) {
      const bed = this.#ground(x, z) - 0.3;
      pk.mass.box(x, (QUAY_Y - 0.7 + bed) / 2, z, 0.6, QUAY_Y - 0.7 - bed, 0.6, 0x8d897f);
      pk.detail.box(x, -0.2, z, 0.64, 0.6, 0.64, 0x3c4a3b);
    }
    for (let z = PIER.z0 + 3; z < PIER.z1; z += 8) for (const x of [x0 + 0.35, x1 - 0.35]) {
      pk.detail.add(new CylinderGeometry(0.17, 0.2, 0.5, 8), 0x2b2d2e, x, QUAY_Y + 0.25, z);
      this.drive.collision.addCylinder(x, z, 0.22, QUAY_Y, QUAY_Y + 0.5);
      pk.detail.add(new TorusGeometry(0.38, 0.12, 5, 10), 0x1c1c1c, x + Math.sign(x - PIER.x) * 0.4, 1.0, z, 0, Math.PI / 2);
    }
    for (const s of [-1, 1]) this.drive.collision.addWall(PIER.x + s * PIER.w / 2, PIER.z0, PIER.x + s * PIER.w / 2, PIER.z1, 0.15, QUAY_Y, QUAY_Y + 0.22);
    this.drive.collision.addWall(x0, PIER.z1, x1, PIER.z1, 0.15, QUAY_Y, QUAY_Y + 0.22);
    // Laternen am Steg und an der Hafenstraße.
    for (const [lx, lz] of [[PIER.x - 3, PIER.z1 - 2], [PIER.x + 3, PIER.z0 + 20], [-1300, 1075], [-1266, 1075], [-1232, 1075], [-1150, 1075]] as const) this.#streetLamp(lx, QUAY_Y, lz);
    // Slipanlage mit einem aufgeslippten Boot auf Böcken.
    const sk = this.#chunk(SLIPWAY.x, SLIPWAY.z1);
    const sx0 = SLIPWAY.x - SLIPWAY.w / 2, sx1 = SLIPWAY.x + SLIPWAY.w / 2, zTop = PLATFORM.faceEast, zBot = SLIPWAY.z1 + 6, yBot = -1.4;
    this.#floorQuad(sk.mass, [sx0, QUAY_Y, zTop], [sx1, QUAY_Y, zTop], [sx1, yBot, zBot], [sx0, yBot, zBot], 0x9b978c);
    for (const x of [SLIPWAY.x - 1.2, SLIPWAY.x + 1.2]) {
      const len = Math.hypot(zBot - zTop, QUAY_Y - yBot);
      sk.detail.box(x, (QUAY_Y + yBot) / 2 + 0.08, (zTop + zBot) / 2, 0.14, 0.12, len, 0x5a4e44, Math.atan2(QUAY_Y - yBot, zBot - zTop));
    }
    const boat = new SettlementKit(), glow = new SettlementKit(), plateKit = new SettlementKit(true), flagKit = new SettlementKit();
    fishingBoat(boat, glow, plateKit, flagKit, 1);
    const hauled = boat.geometry(); hauled.rotateX(-0.12); hauled.translate(SLIPWAY.x, QUAY_Y + 1.45, zTop - 7.5);
    sk.detail.parts.push(hauled);
    for (const [kit, into] of [[plateKit, sk.sign], [flagKit, sk.cloth]] as const) { const g = kit.geometry(); g.rotateX(-0.12); g.translate(SLIPWAY.x, QUAY_Y + 1.45, zTop - 7.5); into.parts.push(g); }
    glow.parts.forEach(g => g.dispose());
    for (const z of [-11, -7.5, -4]) for (const s of [-1, 1]) sk.detail.box(SLIPWAY.x + s * 1.1, QUAY_Y + 0.35, zTop + z, 0.3, 0.7, 0.3, 0x6b5a48);
    this.drive.collision.addOrientedBox(SLIPWAY.x, zTop - 7.5, 0, 1.7, 6, QUAY_Y, QUAY_Y + 3.5);
    // Schiffe am Steg und an der Ostkaimauer.
    for (let i = 0; i < 4; i++) this.#boats.push({ x: PIER.x + (i % 2 ? 1 : -1) * (PIER.w / 2 + 1.9), z: PIER.z0 + 14 + Math.floor(i / 2) * 20, yaw: i % 2 ? 0 : Math.PI, big: true, variant: i });
    this.#boats.push({ x: -1158, z: PLATFORM.faceEast + 2, yaw: Math.PI / 2, big: true, variant: 2 });
    // Der Platz mitten im Becken gehört dem auslaufenden Boot (funauraLife.ts).
    this.#boats.push({ x: -1300, z: 1165, yaw: 0.3, big: true, variant: 0 });
    for (const [x, z, yaw] of [[-1196, 1112, 0.2], [-1150, 1118, 2.9], [-1300, 1130, -0.4]] as const) this.#boats.push({ x, z, yaw, big: false, variant: Math.round(x) });
    // Zwei schwimmende Fischkäfige (Ikesu) im Becken, wie vor Ine.
    for (const [ix, iz] of [[-1262, 1150], [-1248, 1172]] as const) {
      const k = this.#chunk(ix, iz).detail;
      for (const s of [-1, 1]) { k.box(ix + s * 4, 0.12, iz, 0.4, 0.3, 8.4, 0x3a3a38); k.box(ix, 0.12, iz + s * 4, 8.4, 0.3, 0.4, 0x3a3a38); }
      for (let j = 0; j < 8; j++) ball(k, ix + (j % 4 - 1.5) * 2.6, 0.15, iz + (j < 4 ? -4.4 : 4.4), 0.3, 0xe0612d, 6);
      k.box(ix, 0.02, iz, 7.6, 0.02, 7.6, 0x2c4540);
    }
  }

  #streetLamp(x: number, y: number, z: number): void {
    const p = this.#chunk(x, z);
    p.detail.add(new CylinderGeometry(0.07, 0.09, 5.2, 6), 0x5b6064, x, y + 2.6, z);
    p.detail.box(x, y + 5.25, z + 0.45, 0.12, 0.1, 1.0, 0x5b6064);
    p.glow.box(x, y + 5.1, z + 0.9, 0.35, 0.12, 0.5, 0xffe6b5);
    this.drive.collision.addCylinder(x, z, 0.12, y, y + 5);
  }

  // ── Molen, Tetrapoden, Molenfeuer ────────────────────────────────────────

  #buildMoles(): void {
    // [Matrix, Lage]: Lage 0/1 liegt über oder an der Wasserlinie, Lage 2 darunter.
    const pods: [Matrix4, number][] = [];
    const POD = new Vector3(1.45, 1.45, 1.45);
    const basin = { x: -1235, z: 1150 };
    for (const [line, lightAt, color, lamp] of [[WEST_MOLE, LIGHT_WHITE, 0xf1f0ea, 0x66ff8a], [EAST_MOLE, LIGHT_RED, 0xc8352b, 0xff4a3a]] as const) {
      const r = this.#r;
      let travelled = 0;
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!;
        const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
        let nx = -tz, nz = tx;
        // Außen ist die Seite vom Becken weg: dort liegen die Tetrapoden.
        if (nx * ((ax + bx) / 2 - basin.x) + nz * ((az + bz) / 2 - basin.z) < 0) { nx = -nx; nz = -nz; }
        const steps = Math.ceil(len / 3);
        for (let j = 0; j < steps; j++) {
          const u0 = j * len / steps, u1 = (j + 1) * len / steps;
          const yA = this.#moleY(line, travelled + u0, ax + tx * u0, az + tz * u0), yB = this.#moleY(line, travelled + u1, ax + tx * u1, az + tz * u1);
          const pa: Point[] = [], pb: Point[] = [];
          for (const s of [-1, 1]) { pa.push([ax + tx * u0 + nx * s * 2.5, yA, az + tz * u0 + nz * s * 2.5]); pb.push([ax + tx * u1 + nx * s * 2.5, yB, az + tz * u1 + nz * s * 2.5]); }
          const cx = ax + tx * (u0 + u1) / 2, cz = az + tz * (u0 + u1) / 2, k = this.#chunk(cx, cz);
          this.#floorQuad(k.mass, pa[0]!, pa[1]!, pb[1]!, pb[0]!, jitter(0xb4b0a5, r, 0.04));
          const bed = Math.min(this.#ground(cx, cz), 0) - 0.6, ym = (yA + yB) / 2;
          k.mass.box(cx, (ym + bed) / 2, cz, 5, ym - bed, u1 - u0 + 0.02, 0x9d998e, 0, Math.atan2(tx, tz));
          // Wellenschutzmauer auf der Außenseite.
          k.mass.box(cx + nx * 2.2, ym + 0.6, cz + nz * 2.2, 0.6, 1.2, u1 - u0 + 0.02, 0xaaa69b, 0, Math.atan2(tx, tz));
          if (j % 2 === 0) k.detail.box(cx - nx * 2.45, ym - 0.6, cz - nz * 2.45, 0.08, 1.1, 0.4, 0x3c4a3b, 0, Math.atan2(tx, tz));
          // Tetrapoden: zwei versetzte Lagen vor der Außenseite, im Wasser.
          if (this.#ground(cx + nx * 5, cz + nz * 5) < 0.4) for (const [off, yOff, layer] of [[4.4, 1.4, 0], [6.3, 0.5, 1], [8.3, -0.6, 1], [10.2, -1.5, 2]] as const) {
            const along = u0 + (r() * 0.8 + 0.1) * (u1 - u0);
            const px = ax + tx * along + nx * (off + r() * 0.6), pz = az + tz * along + nz * (off + r() * 0.6);
            const e = new Matrix4().makeRotationFromEuler(EULER.set(r() * 6.28, r() * 6.28, r() * 6.28));
            e.scale(POD).setPosition(px, Math.max(this.#ground(px, pz) + 0.6, -2) + yOff + 0.3, pz);
            pods.push([e, layer]);
          }
        }
        this.drive.collision.addWall(ax + nx * 2.2, az + nz * 2.2, bx + nx * 2.2, bz + nz * 2.2, 0.35, MOLE_Y - 1, MOLE_Y + 1.2);
        travelled += len;
      }
      // Kopf: Tetrapodenhaufen rund um das Molenfeuer.
      for (let j = 0; j < 22; j++) {
        const a = j * 0.9, rr = 4.5 + (j % 3) * 1.8, px = lightAt.x + Math.cos(a) * rr, pz = lightAt.z + Math.sin(a) * rr;
        if (Math.hypot(px - basin.x, pz - basin.z) < Math.hypot(lightAt.x - basin.x, lightAt.z - basin.z) - 2) continue;
        const e = new Matrix4().makeRotationFromEuler(EULER.set(r() * 6.28, r() * 6.28, r() * 6.28));
        e.scale(POD).setPosition(px, this.#ground(px, pz) + 1.4 + (j % 3 === 0 ? 1.4 : 0), pz); pods.push([e, 0]);
      }
      const p = new Parts(); breakwaterLight(p, color); place(p, this.#chunk(lightAt.x, lightAt.z), lightAt.x, MOLE_Y, lightAt.z, 0);
      this.drive.collision.addCylinder(lightAt.x, lightAt.z, 1.3, MOLE_Y, MOLE_Y + 10);
      const lampMesh = new Mesh(new SphereGeometry(0.34, 10, 8), new MeshBasicMaterial({ color: lamp, toneMapped: false }));
      lampMesh.position.set(lightAt.x, MOLE_Y + 9.15, lightAt.z); lampMesh.name = 'Molenfeuer'; this.group.add(lampMesh); this.#lamps.push(lampMesh);
      // Ein Angler am Molenkopf — jeder japanische Molenkopf hat einen.
      this.#actorSpots.push([lightAt.x + (color === 0xc8352b ? 3 : -3), lightAt.z - 4, color === 0xc8352b ? 2.6 : -2.2]);
    }
    const k = new SettlementKit(); tetrapod(k);
    pods.sort((a, b) => a[1] - b[1]);
    const mesh = new InstancedMesh(k.geometry(), this.#solid, pods.length);
    const tint = new Color();
    pods.forEach(([m], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, tint.setScalar(0.82 + this.#r() * 0.22)); });
    this.#pods = mesh; this.#podsVisible = pods.filter(([, l]) => l < 2).length;
    mesh.name = `Tetrapoden ×${pods.length}`; mesh.computeBoundingSphere(); mesh.receiveShadow = true;
    this.#near.add(mesh);
    this.tetrapods = pods.length;
  }
  tetrapods = 0;
  #pods: InstancedMesh | null = null;
  #podsVisible = 0;
  readonly #actorSpots: [number, number, number][] = [];

  /**
   * Höhe der Molenkrone.
   *
   * Erste Fassung: überall von QUAY_Y auf MOLE_Y. Der Fahr- und Gehtest hat
   * gezeigt, dass die Westmole damit unerreichbar war — sie beginnt am Strand
   * (0,6 m), die Krone stand 1,3 m darüber, und zwischen Kaiplatte und Mole
   * lag eine Lücke. Die Figur lief daneben über den Meeresgrund zum Leuchtfeuer.
   * Jetzt: Westmole mit Rampe vom Strand, auf Kaihöhe entlang der Platte (die
   * schließt bündig an), erst jenseits der Kaimauer der Anstieg.
   */
  #moleY(line: readonly (readonly [number, number])[], travelled: number, x: number, z: number): number {
    const ramp = (a: number, b: number, f: number): number => a + (b - a) * Math.max(0, Math.min(1, f));
    if (line === WEST_MOLE) {
      const shore = this.#ground(line[0]![0], line[0]![1]) + 0.06;
      if (travelled < 10) return ramp(shore, QUAY_Y, travelled / 10);
      return ramp(QUAY_Y, MOLE_Y, (z - PLATFORM.faceWest) / 22);
    }
    void x;
    return ramp(QUAY_Y, MOLE_Y, travelled / 22);
  }

  // ── Straße von Stillwater durchs Dorf ────────────────────────────────────

  /**
   * Derselbe Weg wie die Mill Lane (`StillwaterVillage.#lane`): eine eigene
   * Fahrfläche knapp über dem Gelände, Steigung auf 12 % begrenzt, Anfang auf
   * der vorhandenen Fläche, Ende auf der Kaiplatte. Im Dorf (z > 880) wird
   * sie zur gepflasterten Gasse mit Rinnstein.
   */
  #buildRoad(): void {
    const width = 6.2, curve = new CatmullRomCurve3(RIVER_ROAD.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
    const count = Math.ceil(curve.getLength() / 1.5), pts = curve.getSpacedPoints(count);
    const ys = pts.map(p => { this.drive.ground.refresh(p.x, p.z, 0); return Math.max(this.#maxGround(p.x, p.z, width + 1, width + 1) + 0.38, this.drive.height(p.x, p.z) + 0.3); });
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i <= count; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! - pts[i]!.distanceTo(pts[i - 1]!) * 0.11);
      for (let i = count - 1; i >= 0; i--) ys[i] = Math.max(ys[i]!, ys[i + 1]! - pts[i]!.distanceTo(pts[i + 1]!) * 0.11);
    }
    // Anfang: auf der Mill Lane aufsetzen. Ende: auf der Kaiplatte.
    const p0 = pts[0]!; this.drive.ground.refresh(p0.x, p0.z, 0);
    const startOff = ys[0]! - this.drive.height(p0.x, p0.z) - 0.02;
    for (let j = 0; j < 10; j++) ys[j] = ys[j]! - startOff * (1 - j / 10);
    const endOff = ys[count]! - QUAY_Y;
    for (let j = 0; j < 14; j++) ys[count - j] = ys[count - j]! - endOff * (1 - j / 14);
    const surface = new LocalSurfaces(), r = this.#r;
    let prevL: Point | null = null, prevR: Point | null = null;
    for (let i = 0; i <= count; i++) {
      const p = pts[i]!, before = pts[Math.max(0, i - 1)]!, after = pts[Math.min(count, i + 1)]!;
      const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz), nx = dz / len, nz = -dx / len, y = ys[i]!;
      const l: Point = [p.x + nx * width / 2, y, p.z + nz * width / 2], rr: Point = [p.x - nx * width / 2, y, p.z - nz * width / 2];
      const village = p.z > 880, k = this.#chunk(p.x, p.z);
      if (prevL && prevR) { surface.quad(prevL, prevR, rr, l); this.#quad(k.mass, prevL, prevR, rr, l, village ? jitter(0x8f8a7e, r, 0.05) : jitter(0x8a806b, r, 0.07)); }
      this.floors.quad(prevL ?? l, prevR ?? rr, rr, l);
      this.roadSamples.push(new Vector3(p.x, y, p.z));
      const yaw = Math.atan2(dx, dz);
      if (i % 3 === 0) for (const s of [-1, 1]) {
        const x = p.x + nx * width / 2 * s, z = p.z + nz * width / 2 * s, base = this.#ground(x, z) - 0.2;
        k.mass.box(x, (base + y) / 2, z, 0.45, Math.max(0.2, y - base), 4.6, village ? 0x7f7c72 : STONE, 0, yaw);
        k.detail.box(x, y + 0.06, z, 0.47, 0.12, 4.6, 0x8d897e, 0, yaw);
      }
      // Im Dorf: Pflastersteine quer, Rinnstein mit Abdeckplatten.
      if (village && i % 2 === 0) {
        const pitch = Math.atan2(ys[Math.min(count, i + 1)]! - ys[Math.max(0, i - 1)]!, before.distanceTo(after));
        for (let j = 0; j < 6; j++) {
          const o = (j - 2.5) * 0.95;
          k.detail.add(new PlaneGeometry(0.9, 1.4), jitter(0x9d9788, r, 0.1), p.x + nx * o, y + 0.018, p.z + nz * o, -Math.PI / 2 - pitch, yaw);
        }
        k.detail.box(p.x + nx * (width / 2 - 0.45), y + 0.03, p.z + nz * (width / 2 - 0.45), 0.5, 0.04, 1.4, 0x6c6a63, 0, yaw);
      }
      prevL = l; prevR = rr;
    }
    // Wegweiser-Laternen alle ~60 m auf freier Strecke, Straßenlaternen im Dorf.
    for (let i = 25; i < this.roadSamples.length - 5; i += 40) {
      const p = this.roadSamples[i]!, q = this.roadSamples[i + 1]!, dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz);
      const x = p.x - dz / l * 4.3, z = p.z + dx / l * 4.3, g = Math.max(this.#ground(x, z), p.y - 0.4);
      const k = this.#chunk(x, z);
      k.detail.box(x, g + 1.1, z, 0.16, 2.2, 0.16, TIMBER_DARK);
      k.glow.box(x, g + 2.15, z, 0.44, 0.5, 0.44, WARM);
      k.detail.box(x, g + 2.5, z, 0.7, 0.14, 0.7, 0x3f474d);
    }
  }

  // ── Schrein ──────────────────────────────────────────────────────────────

  #buildShrine(): void {
    const y = this.#maxGround(SHRINE.x, SHRINE.z, 12, 11) + 0.1;
    this.#terrace(SHRINE.x, SHRINE.z, 13, 12, y - 0.1, SHRINE.yaw, 99);
    const p = new Parts(); ebisuShrine(p, this.#r); place(p, this.#chunk(SHRINE.x, SHRINE.z), SHRINE.x, y - 0.1, SHRINE.z, SHRINE.yaw);
    const c = Math.cos(SHRINE.yaw), s = Math.sin(SHRINE.yaw);
    const plat: [number, number][] = [[-6, -5.5], [6, -5.5], [6, 5.5], [-6, 5.5]];
    this.floors.quad(...plat.map(([u, v]) => [SHRINE.x + u * c + v * s, y + 0.6, SHRINE.z - u * s + v * c] as Point) as [Point, Point, Point, Point]);
    const hallX = SHRINE.x + (-1.5) * s, hallZ = SHRINE.z + (-1.5) * c;
    this.drive.collision.addOrientedBox(hallX, hallZ, -SHRINE.yaw, 2.9, 2.3, y, y + 6);
    for (const u of [-1.8, 1.8]) this.drive.collision.addCylinder(SHRINE.x + u * c + 5 * s, SHRINE.z - u * s + 5 * c, 0.3, y, y + 5);
    // Fußweg mit Stufen vom Hauptweg hinauf.
    const k = this.#chunk(SHRINE.x, SHRINE.z);
    const path = [...SHRINE_PATH, [SHRINE.x + 5.8 * s, SHRINE.z + 5.8 * c] as const];
    let prev: [number, number, number] | null = null;
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1]!, [bx, bz] = path[i]!, len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 1.2);
      for (let j = 0; j <= n; j++) {
        const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n;
        const gy = i === path.length - 1 && j === n ? y + 0.6 : this.#ground(x, z) + 0.12;
        if (prev) {
          const [px, py, pz] = prev, dx = x - px, dz = z - pz, l = Math.hypot(dx, dz) || 1, nx = dz / l * 1.2, nz = -dx / l * 1.2;
          this.#floorQuad(k.mass, [px + nx, py, pz + nz], [px - nx, py, pz - nz], [x - nx, gy, z - nz], [x + nx, gy, z + nz], jitter(0x9b968a, this.#r, 0.08));
          k.detail.box((px + x) / 2, Math.max(py, gy) - 0.05, (pz + z) / 2, 2.5, 0.12, 0.3, 0x7d7a70, 0, Math.atan2(dx, dz));
        }
        prev = [x, gy, z];
      }
    }
  }

  // ── Kiefern ──────────────────────────────────────────────────────────────

  #buildPines(): void {
    PINES.forEach(([x, z, sc], i) => {
      const r = rng(0x9e1 + i * 7), y = Math.max(this.#ground(x, z), this.floors.height(x, z)) - 0.2;
      blackPine(this.#chunk(x, z).mass, x, y, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.3 * sc, y, y + 5 * sc);
    });
  }

  /**
   * Gemüseterrassen in den Lücken am Hang. Leere Grasflächen zwischen den
   * Häusern waren im Bild aus der Gasse das, was am wenigsten nach Dorf aussah;
   * in Ine ist jede ebene Stelle ein Beet.
   */
  #buildGardens(): void {
    const r = rng(0x6a7d);
    let plots = 0;
    // Höchstens 36 Beete, nur in Hausnähe: die erste Fassung füllte mit 115 Beeten
    // den ganzen Hang und kostete allein ~94 k Dreiecke (gemessen), die Hälfte der Nahschicht.
    for (let x = -1322; x < -1212 && plots < 36; x += 8.5) for (let z = 900; z < 1008 && plots < 36; z += 6.5) {
      const px = x + (r() - 0.5) * 2, pz = z + (r() - 0.5) * 1.5;
      const clear = VILLAGE_HOUSES.every(([hx, hz, w, d]) => Math.hypot(px - hx, pz - hz) > Math.hypot(w, d) / 2 + 5.5)
        && this.roadSamples.every(p => Math.hypot(p.x - px, p.z - pz) > 8)
        && SHRINE_PATH.every(([sx, sz]) => Math.hypot(sx - px, sz - pz) > 7) && Math.hypot(SHRINE.x - px, SHRINE.z - pz) > 13
        && PINES.every(([tx, tz]) => Math.hypot(tx - px, tz - pz) > 3.5)
        && VILLAGE_HOUSES.some(([hx, hz, w, d]) => Math.hypot(px - hx, pz - hz) < Math.hypot(w, d) / 2 + 16);
      if (!clear) continue;
      const lo = this.#minGround(px, pz, 6.5, 4.5), hi = this.#maxGround(px, pz, 6.5, 4.5);
      if (hi - lo > 2.2) continue;
      const y = (hi + lo) / 2 + 0.15, k = this.#chunk(px, pz);
      k.mass.box(px, (y + lo - 0.3) / 2, pz, 6.5, y - lo + 0.3, 4.5, 0x5e5140);
      for (const s of [-1, 1]) { k.detail.box(px, y + 0.05, pz + s * 2.3, 6.6, 0.18, 0.2, 0x8a877c); k.detail.box(px + s * 3.3, y + 0.05, pz, 0.2, 0.18, 4.6, 0x8a877c); }
      for (let row = 0; row < 4; row++) {
        const rz = pz - 1.5 + row;
        k.detail.box(px, y + 0.12, rz, 5.8, 0.14, 0.45, 0x4d4130);
        const crop = [0x5d7f42, 0x6f8f4a, 0x86a052, 0x4c6b3a][(plots + row) % 4]!;
        for (let c = 0; c < 6; c++) ball(k.detail, px - 2.5 + c, y + 0.32, rz, 0.26 + r() * 0.1, crop, 4);
      }
      plots++;
    }
    this.gardens = plots;
  }
  gardens = 0;

  // ── Kleinkram auf dem Kai ────────────────────────────────────────────────

  #buildProps(): void {
    const r = this.#r;
    // Tintenfisch-Trockengestelle (Yobuko, Hakodate): Stangen mit weißen Körpern.
    for (const [x, z] of [[-1296, 1089.2], [-1243, 1089.2], [-1165, 1074.5]] as const) {
      const k = this.#chunk(x, z).detail;
      k.add(new CylinderGeometry(0.06, 0.08, 2.6, 6), 0x8a8f90, x, QUAY_Y + 1.3, z);
      for (let a = 0; a < 6; a++) {
        const ang = a * Math.PI / 3;
        k.box(x + Math.cos(ang) * 0.6, QUAY_Y + 2.3, z + Math.sin(ang) * 0.6, 1.2, 0.03, 0.03, 0x8a8f90, 0, -ang);
        for (let j = 0; j < 4; j++) k.box(x + Math.cos(ang) * (0.3 + j * 0.25), QUAY_Y + 2.0, z + Math.sin(ang) * (0.3 + j * 0.25), 0.12, 0.45, 0.03, 0xf2eadb, 0, -ang);
      }
    }
    // Netze, Bojen, Kisten, Fässer im Arbeitshof hinter den Bootshäusern, nie auf der Fahrbahn.
    for (let i = 0; i < 22; i++) {
      const x = PLATFORM.minX + 4 + i * 4.6 + r() * 1.5, z = HARBOUR_LANE.z1 + 1.7 + r() * 0.5;
      if (x > PLATFORM.split - 2) break;
      if (Math.abs(x + 1243) < 2.5 || Math.abs(x + 1296) < 2.5) continue;
      const k = this.#chunk(x, z).detail, kind = i % 4;
      if (kind === 0) { const g = new SphereGeometry(1, 7, 4); g.scale(1.4, 0.45, 1.0); k.add(g, [0x3f6b5a, 0x2d5a78, 0x5d7b4a][i % 3]!, x, QUAY_Y + 0.2, z); }
      else if (kind === 1) for (let j = 0; j < 7; j++) ball(k, x + (j % 3) * 0.45, QUAY_Y + 0.25 + Math.floor(j / 3) * 0.4, z + (j % 2) * 0.3, 0.24, j % 3 ? 0xe0612d : 0xe5b43a, 6);
      else if (kind === 2) for (let j = 0; j < 3 + (i % 3); j++) k.box(x, QUAY_Y + 0.18 + j * 0.34, z, 0.95, 0.32, 0.62, j % 2 ? 0x2f6fb0 : 0x3a82c4, 0, r() * 0.3);
      else for (let j = 0; j < 3; j++) k.add(new CylinderGeometry(0.3, 0.3, 0.9, 10), [0x2f5d8a, 0x9b3a2e, 0x5d6e5a][j]!, x + j * 0.65, QUAY_Y + 0.45, z);
      this.drive.collision.addCylinder(x, z, 0.7, QUAY_Y, QUAY_Y + 1);
    }
    // Ausgelegte Netze zum Trocknen auf dem Ostkai.
    for (let i = 0; i < 3; i++) { const k = this.#chunk(-1225 + i * 7, 1068).detail; k.box(-1225 + i * 7, QUAY_Y + 0.03, 1068, 5.5, 0.05, 3.2, [0x3f6b5a, 0x516f8a, 0x6b7a3f][i]!); }
    // Kei-Trucks und ein Gabelstapler — Arbeitshafen, nicht Freilichtmuseum. Die
    // Einmündung der Dorfstraße (x ≈ −1263) bleibt frei: dort stand in einer ersten
    // Fassung ein Truck, und der Fahrtest kam nicht auf die Hafenstraße.
    for (const [x, z, yaw, color] of [[-1190, 1068, 0.1, 0xf1f1ec], [-1168, 1070, -0.2, 0xe9ecef], [-1232.5, 1075.3, Math.PI / 2, 0xf1f1ec]] as const) this.#keiTruck(x, z, yaw, color);
    const fk = this.#chunk(-1200, 1102).detail;
    fk.box(-1199, QUAY_Y + 0.7, 1073.5, 1.1, 1.0, 2.0, 0xd9a321); fk.box(-1199, QUAY_Y + 1.6, 1073.5, 1.0, 0.08, 1.2, 0x333333);
    for (const s of [-1, 1]) fk.box(-1199 + s * 0.45, QUAY_Y + 1.1, 1074.7, 0.06, 2.1, 0.06, 0x333333);
    this.drive.collision.addOrientedBox(-1199, 1073.5, 0, 0.6, 1.1, QUAY_Y, QUAY_Y + 2);
    // Fahrräder an den Häusern.
    for (const [x, z] of [[-1293, 1074], [-1244, 1074], [-1232, 1074.5]] as const) {
      const k = this.#chunk(x, z).detail;
      for (const s of [-0.5, 0.5]) k.add(new TorusGeometry(0.32, 0.03, 4, 12), 0x222222, x + s, QUAY_Y + 0.34, z, 0, 0);
      k.box(x, QUAY_Y + 0.6, z, 0.9, 0.04, 0.04, 0x7a8a9a, 0, 0, 0.3); k.box(x + 0.35, QUAY_Y + 0.85, z, 0.25, 0.05, 0.3, 0x1f1f1f);
    }
    // Roter Briefkasten vor dem Laden.
    const mk = this.#chunk(-1249, 1074).detail;
    mk.box(-1244.2, QUAY_Y + 0.65, 1073.6, 0.42, 1.3, 0.38, 0xd23a2a); mk.box(-1244.2, QUAY_Y + 1.35, 1073.6, 0.5, 0.1, 0.46, 0xd23a2a);
    // Graue Treppe (Gangi) an der Kaimauer vor der Halle, wie in Tomonoura.
    const gk = this.#chunk(-1213, 1101);
    for (let i = 0; i < 8; i++) gk.mass.box(-1212.5 + 0.8, QUAY_Y - 0.25 - i * 0.28, PLATFORM.faceWest + 0.4 + i * 0.4, 1.6, 0.28, 0.8, jitter(0x9a968a, r, 0.1));
  }

  #keiTruck(x: number, z: number, yaw: number, color: number): void {
    const p = new Parts();
    p.mass.box(0, 0.75, 1.15, 1.45, 1.1, 1.3, color);
    p.glass.box(0, 1.0, 1.81, 1.3, 0.5, 0.04, 0x2f3d45);
    for (const s of [-1, 1]) p.glass.box(s * 0.73, 1.0, 1.2, 0.03, 0.45, 0.9, 0x2f3d45);
    p.mass.box(0, 0.6, -0.55, 1.45, 0.15, 2.1, shade(color, 0.9));
    for (const s of [-1, 1]) p.mass.box(s * 0.7, 0.85, -0.55, 0.06, 0.45, 2.1, shade(color, 0.85));
    p.mass.box(0, 0.85, -1.58, 1.45, 0.45, 0.06, shade(color, 0.85));
    for (const s of [-1, 1]) for (const zz of [1.0, -1.0]) p.detail.add(new CylinderGeometry(0.28, 0.28, 0.2, 10), 0x1a1a1a, s * 0.65, 0.28, zz, 0, 0, Math.PI / 2);
    p.detail.box(0, 0.95, -0.6, 1.2, 0.5, 1.4, 0x2f6fb0);
    place(p, this.#chunk(x, z), x, QUAY_Y, z, yaw);
    this.drive.collision.addOrientedBox(x, z, -yaw, 0.75, 1.7, QUAY_Y, QUAY_Y + 1.5);
  }

  // ── Leitungen ────────────────────────────────────────────────────────────

  /** Holzmasten mit Leitungen an der Hafenstraße und die Straße hinauf. */
  #buildWires(): void {
    const poles: Vector3[] = [];
    for (let x = PLATFORM.minX + 8; x < PLATFORM.maxX; x += 24) poles.push(new Vector3(x, QUAY_Y, HARBOUR_LANE.z0 - 1.2));
    for (let i = this.roadSamples.length - 20; i > 0; i -= 28) {
      const p = this.roadSamples[i]!, q = this.roadSamples[i - 1]!, dx = p.x - q.x, dz = p.z - q.z, l = Math.hypot(dx, dz);
      const x = p.x + dz / l * 4.6, z = p.z - dx / l * 4.6;
      poles.push(new Vector3(x, Math.max(this.#ground(x, z), p.y - 0.3), z));
      if (p.z < 600) break;
    }
    const wires: number[] = [];
    poles.forEach((p, i) => {
      const k = this.#chunk(p.x, p.z);
      k.mass.add(new CylinderGeometry(0.13, 0.17, 9, 6), 0x6b5a4a, p.x, p.y + 4.5, p.z);
      k.detail.box(p.x, p.y + 8.3, p.z, 1.6, 0.1, 0.1, 0x55504a);
      if (i % 3 === 1) k.detail.add(new CylinderGeometry(0.3, 0.3, 0.9, 8), 0x9ea3a3, p.x + 0.35, p.y + 7.2, p.z);
      this.drive.collision.addCylinder(p.x, p.z, 0.18, p.y, p.y + 8);
      const q = poles[i + 1];
      // Der Übergang Kai → Straße wird nicht verspannt (Masten stehen dort weit auseinander).
      if (!q || p.distanceTo(q) > 45) return;
      for (const off of [-0.7, 0, 0.7]) for (let s = 0; s < 8; s++) {
        const t0 = s / 8, t1 = (s + 1) / 8, sag = (t: number) => -Math.sin(t * Math.PI) * 0.55;
        wires.push(p.x + (q.x - p.x) * t0 + off, p.y + 8.3 + (q.y - p.y) * t0 + sag(t0), p.z + (q.z - p.z) * t0,
          p.x + (q.x - p.x) * t1 + off, p.y + 8.3 + (q.y - p.y) * t1 + sag(t1), p.z + (q.z - p.z) * t1);
      }
    });
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(wires, 3));
    const lines = new LineSegments(g, new LineBasicMaterial({ color: 0x1a1d20 })); lines.name = 'Leitungen';
    this.#near.add(lines);
  }

  // ── Boote, Figuren, Möwen ────────────────────────────────────────────────

  #buildBoats(): void {
    for (const big of [true, false]) {
      const list = this.#boats.filter(b => b.big === big);
      for (let v = 0; v < 3; v++) {
        const mine = list.filter(b => b.variant % 3 === v);
        if (!mine.length) continue;
        const solid = new SettlementKit(), glow = new SettlementKit(), sign = new SettlementKit(true), flags = new SettlementKit();
        if (big) fishingBoat(solid, glow, sign, flags, v); else skiff(solid, v);
        const meshes: InstancedMesh[] = [];
        const sm = new InstancedMesh(solid.geometry(), this.#boatMaterial, mine.length); sm.name = big ? 'Fischerboote' : 'Kleinboote'; meshes.push(sm);
        for (const [k, m, n] of [[glow, this.#glow, 'Lampenketten'], [sign, this.#signMat!, 'Bootsnamen'], [flags, this.#cloth, 'Fangfahnen']] as const)
          if (k.parts.length) { const im = new InstancedMesh(k.geometry(), m, mine.length); im.name = n; meshes.push(im); }
        for (const m of meshes) { m.userData.boats = mine; m.frustumCulled = false; this.#near.add(m); }
        (big ? this.#boatMeshes.big : this.#boatMeshes.small).push(...meshes);
      }
    }
    this.#updateBoats(0);
    for (const b of this.#boats) this.drive.collision.addOrientedBox(b.x, b.z, -b.yaw + Math.PI / 2, b.big ? 6 : 3, b.big ? 1.7 : 0.95, -1, b.big ? 3.5 : 1);
  }
  #updateBoats(t: number): void {
    for (const m of [...this.#boatMeshes.big, ...this.#boatMeshes.small]) {
      const boats = m.userData.boats as Boat[];
      boats.forEach((b, i) => {
        const ph = b.x * 0.37 + b.z * 0.11;
        this.#q.setFromAxisAngle(this.#v.set(0, 1, 0), b.yaw);
        const roll = new Quaternion().setFromAxisAngle(this.#v.set(0, 0, 1), Math.sin(t * 0.9 + ph) * 0.035);
        const pitch = new Quaternion().setFromAxisAngle(this.#v.set(1, 0, 0), Math.sin(t * 0.7 + ph * 1.3) * 0.02);
        this.#q.multiply(roll).multiply(pitch);
        this.#matrix.compose(this.#v.set(b.x, Math.sin(t * 1.1 + ph) * 0.06, b.z), this.#q, this.#s);
        m.setMatrixAt(i, this.#matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  }

  #buildActors(): void {
    const spots: [number, number, number][] = [
      [-1183, 1093, 0.4], [-1178, 1097, 2.8], [-1172, 1092, -1.2], [-1186, 1099, 1.6], [-1178, 1140, 1.5], [-1182, 1160, -1.4],
      [-1258, 1085, 3.1], [-1231, 1084, 0.2], [-1270, 1037, 3.2], [-1205, 1112, 3.0], [-1297, 1074.5, 0.8], ...this.#actorSpots,
    ];
    this.#actor('fisher', spots);
    this.#actor('cat', [[-1286, 1074, 1.2], [-1180, 1104, 2.4], [-1214.5, 922, 0.3], [-1249, 1074.5, -0.4], [-1178, 1165, 3.0], [-1310, 1089.5, 2.0]]);
    const g = new SettlementKit(); gull(g);
    this.#gulls = new InstancedMesh(g.geometry(), this.#solid, 9); this.#gulls.name = 'Möwen'; this.#gulls.frustumCulled = false;
    this.#near.add(this.#gulls);
    this.#updateActors(0);
  }
  #actor(kind: Actor['kind'], spots: Actor['spots']): void {
    const k = new SettlementKit(); if (kind === 'fisher') fisher(k); else cat(k);
    const mesh = new InstancedMesh(k.geometry(), this.#solid, spots.length); mesh.name = kind; mesh.frustumCulled = false;
    this.#near.add(mesh); this.#actors.push({ mesh, spots, kind });
  }
  #updateActors(t: number): void {
    for (const a of this.#actors) a.spots.forEach(([x, z, yaw], i) => {
      const y = Math.max(this.#ground(x, z), this.floors.height(x, z));
      const bob = a.kind === 'cat' ? 0 : Math.sin(t * 1.4 + i) * 0.02;
      this.#matrix.makeRotationY(yaw + Math.sin(t * 0.5 + i * 1.7) * (a.kind === 'cat' ? 0.3 : 0.15));
      this.#matrix.setPosition(x, y + bob, z); a.mesh.setMatrixAt(i, this.#matrix);
      a.mesh.instanceMatrix.needsUpdate = true;
    });
    const gulls = this.#gulls;
    if (gulls) for (let i = 0; i < gulls.count; i++) {
      const a = t * (0.25 + (i % 3) * 0.06) + i * 0.7, rr = 22 + (i % 4) * 9, cx = -1230 + (i % 2) * 30, cz = 1130 + (i % 3) * 12;
      const flap = Math.sin(t * 6 + i) * 0.25;
      this.#q.setFromAxisAngle(this.#v.set(0, 1, 0), -a).multiply(new Quaternion().setFromAxisAngle(this.#v.set(0, 0, 1), -0.35 + flap * 0.2));
      this.#matrix.compose(this.#v.set(cx + Math.cos(a) * rr, 16 + (i % 4) * 4 + Math.sin(t + i) * 1.5, cz + Math.sin(a) * rr), this.#q, this.#s.set(1.4, 1.4, 1.4));
      gulls.setMatrixAt(i, this.#matrix); this.#s.set(1, 1, 1);
    }
    if (gulls) gulls.instanceMatrix.needsUpdate = true;
  }

  // ── Schilder ─────────────────────────────────────────────────────────────

  #sign(x: number, y: number, z: number, yaw: number, kanji: string, title: string, sub: string, width = 4, posts = true): void {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 172;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#2b2622'; c.fillRect(0, 0, 512, 172);
    c.strokeStyle = '#c9b48a'; c.lineWidth = 4; c.strokeRect(9, 9, 494, 154);
    c.fillStyle = '#f3e6c8'; c.textAlign = 'left';
    c.font = '600 86px "Yu Mincho", "Hiragino Mincho ProN", serif'; c.fillText(kanji, 26, 118);
    c.textAlign = 'right'; c.font = '600 44px Georgia, serif'; c.fillText(title, 486, 84);
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#d7c49c'; c.fillText(sub, 486, 124);
    const material = new MeshBasicMaterial({ map: new CanvasTexture(canvas) });
    for (const side of [0, Math.PI]) {
      const mesh = new Mesh(new PlaneGeometry(width, width / 3), material);
      mesh.position.set(x + Math.sin(yaw + side) * 0.04, y, z + Math.cos(yaw + side) * 0.04); mesh.rotation.y = yaw + side;
      this.group.add(mesh);
    }
    this.#signKit.box(x, y, z, width + 0.16, width / 3 + 0.16, 0.05, TIMBER_DARK, 0, yaw);
    this.#signKit.box(x, y + width / 6 + 0.16, z, width + 0.5, 0.12, 0.35, 0x3f474d, 0, yaw);
    if (posts) for (const s of [-1, 1]) {
      const px = x + Math.cos(yaw) * s * width * 0.4, pz = z - Math.sin(yaw) * s * width * 0.4, g = Math.max(this.#ground(px, pz), this.floors.height(px, pz));
      this.#signKit.box(px, (g + y) / 2, pz, 0.14, Math.max(0.1, y - g), 0.14, TIMBER_DARK);
    }
  }
  #buildSigns(): void {
    const gate = this.roadSamples.find(p => p.z > 872) ?? this.roadSamples[0]!;
    this.#sign(gate.x + 4.8, gate.y + 2.5, gate.z, Math.PI * 0.05, '舟浦', 'Funaura', 'FISHING VILLAGE · HARBOUR 200 m', 4.2);
    const top = this.roadSamples[40]!;
    this.#sign(top.x + 4.6, top.y + 2.4, top.z, -0.6, '舟浦', 'Funaura', '↓ SEA · FUNAYA · FISH MARKET', 3.6);
    this.#sign(-1180, QUAY_Y + 4.5, 1088.9, 0, '魚市場', 'Fish Market', 'FUNAURA FISHERIES CO-OP', 5, false);
    this.#sign(-1201, QUAY_Y + 5.6, 1059.1, 0, '漁協', 'JF Funaura', 'FISHERIES COOPERATIVE', 4.2, false);
    const c = Math.cos(SHRINE.yaw), s = Math.sin(SHRINE.yaw);
    this.#sign(SHRINE.x + 7.4 * s + 3.4 * c, this.#ground(SHRINE.x + 7.4 * s, SHRINE.z + 7.4 * c) + 1.9, SHRINE.z + 7.4 * c - 3.4 * s, SHRINE.yaw, '恵比寿', 'Ebisu Shrine', 'GOD OF FISHERS · STEPS UP', 3);
    this.#signKit.finish(this.group, this.#solid, 'Funaura sign frames');
  }

  // ── Straßenmöblierung auf Augenhöhe ─────────────────────────────────────

  /**
   * Das, was man sieht, wenn man aussteigt: Gullydeckel mit Fischmotiv, das
   * 止まれ auf der Fahrbahn, Ortsplan, Gezeitentafel, schwarzes Brett,
   * Bushaltestelle, Badeverbot an den Molen, Möwen auf den Pollern, Angler
   * mit Ruten am Molenkopf, ein Fass mit Glut auf dem Kai.
   */
  #buildStreetDetail(): void {
    const manhole = tile(T.manhole, 0, 0, 128, 128);
    for (let x = HARBOUR_LANE.minX + 14; x < HARBOUR_LANE.maxX; x += 28) tilePlate(this.#chunk(x, 1082).sign, manhole, x, QUAY_Y + 0.02, 1082, 0.75, 0.75, 'y', 1);
    for (let i = 330; i < this.roadSamples.length; i += 22) {
      const p = this.roadSamples[i]!; tilePlate(this.#chunk(p.x, p.z).sign, manhole, p.x + 1.2, p.y + 0.03, p.z, 0.75, 0.75, 'y', 1);
    }
    // 止まれ vor der Einmündung auf die Kaiplatte, lesbar für den, der hinunterfährt.
    const stopAt = this.roadSamples.findIndex(p => p.z > 1026);
    if (stopAt > 0) {
      const p = this.roadSamples[stopAt]!, q = this.roadSamples[stopAt + 1] ?? p, yaw = Math.atan2(q.x - p.x, q.z - p.z);
      tilePlate(this.#chunk(p.x, p.z).sign, tile(T.stop), p.x - Math.cos(yaw) * 1.4, p.y + 0.03, p.z + Math.sin(yaw) * 1.4, 2.6, 1.3, 'y', 1, 0xffffff, yaw + Math.PI);
      const k = this.#chunk(p.x, p.z).detail;
      k.box(p.x - Math.cos(yaw) * 1.4 + Math.sin(yaw) * 1.3, p.y + 0.02, p.z + Math.sin(yaw) * 1.4 + Math.cos(yaw) * 1.3, 2.8, 0.02, 0.3, 0xf4f2ea, 0, yaw);
    }
    const board = (x: number, z: number, y: number, ti: number, w: number, h: number, face: number, axis: 'x' | 'z' = 'z'): void => {
      const k = this.#chunk(x, z), along = axis === 'z';
      k.detail.box(x, y + 1.2 + h / 2, z, along ? w + 0.2 : 0.08, h + 0.2, along ? 0.08 : w + 0.2, TIMBER_DARK);
      k.detail.box(x, y + 1.35 + h, z, along ? w + 0.5 : 0.4, 0.1, along ? 0.4 : w + 0.5, 0x3f474d);
      tilePlate(k.sign, tile(ti), x + (along ? 0 : face * 0.05), y + 1.2 + h / 2, z + (along ? face * 0.05 : 0), w, h, axis, face);
      for (const s of [-1, 1]) {
        const px = x + (along ? s * w * 0.45 : 0), pz = z + (along ? 0 : s * w * 0.45);
        k.detail.box(px, y + (1.2 + h / 2) / 2, pz, 0.1, 1.2 + h / 2, 0.1, TIMBER_DARK);
      }
      this.drive.collision.addCylinder(x, z, 0.3, y, y + 2.5);
    };
    board(-1272, 1043.8, QUAY_Y, T.mapBoard, 2.4, 1.2, -1);
    board(-1188, 1103.8, QUAY_Y, T.tide, 1.8, 0.9, -1);
    board(-1266.5, 1073.6, QUAY_Y, T.notice, 1.8, 0.9, 1);
    board(-1170, 1103.8, QUAY_Y, T.boatTours, 1.6, 0.8, -1);
    const gate = this.roadSamples.find(p => p.z > 860) ?? this.roadSamples[0]!;
    board(gate.x - 4.6, gate.z + 2, Math.max(this.#ground(gate.x - 4.6, gate.z + 2), gate.y - 0.3), T.mapBoard, 2.2, 1.1, 1, 'x');
    // Badeverbot an beiden Molen.
    board(-1319.2, 1106, MOLE_Y, T.noSwim, 1.2, 0.6, 1, 'x');
    board(-1147, 1128, MOLE_Y, T.noSwim, 1.2, 0.6, -1, 'x');
    // Bushaltestelle mit Bank an der Einmündung.
    const bk = this.#chunk(-1255, 1043);
    bk.detail.add(new CylinderGeometry(0.05, 0.05, 2.6, 6), 0xb8bcbc, -1255.5, QUAY_Y + 1.3, 1043.2);
    for (const s of [-1, 1]) tilePlate(bk.sign, tile(T.busStop, 0, 0, 128, 128), -1255.5, QUAY_Y + 2.4, 1043.2 + s * 0.03, 0.62, 0.62, 'z', s);
    bk.detail.box(-1253.5, QUAY_Y + 0.45, 1043.4, 1.8, 0.06, 0.45, 0x8a6a4a); bk.detail.box(-1253.5, QUAY_Y + 0.72, 1043.62, 1.8, 0.45, 0.05, 0x8a6a4a);
    for (const s of [-1, 1]) bk.detail.box(-1253.5 + s * 0.8, QUAY_Y + 0.22, 1043.4, 0.06, 0.44, 0.4, 0x555555);
    // Angler mit Ruten an den Molenköpfen (die Figuren stehen schon dort).
    for (const [x, z, yaw] of this.#actorSpots) {
      const k = this.#chunk(x, z).detail, dx = Math.sin(yaw), dz = Math.cos(yaw), y = Math.max(this.#ground(x, z), this.floors.height(x, z));
      k.box(x + dx * 1.6, y + 2.3, z + dz * 1.6, 0.03, 0.03, 3.6, 0x2a2a2a, -0.6, yaw);
      k.box(x + dx * 3.1, y + 0.9, z + dz * 3.1, 0.01, 2.8, 0.01, 0xdddddd);
      k.box(x - dx * 0.6, y + 0.18, z - dz * 0.6, 0.5, 0.35, 0.35, 0xe8e8e2);
    }
    // Ölfass mit Glut: die Fischer wärmen sich die Hände (Rauchquelle in #buildLife).
    const fk = this.#chunk(-1212, 1070);
    fk.detail.add(new CylinderGeometry(0.3, 0.3, 0.9, 12), 0x5a3a2a, -1212, QUAY_Y + 0.45, 1070);
    fk.glow.add(new CylinderGeometry(0.26, 0.26, 0.04, 10), 0xff7a2a, -1212, QUAY_Y + 0.86, 1070);
    this.drive.collision.addCylinder(-1212, 1070, 0.35, QUAY_Y, QUAY_Y + 1);
    // Möwen auf Pollern und Firsten.
    const sit: [number, number, number, number][] = [];
    for (let z = PIER.z0 + 3; z < PIER.z1; z += 16) sit.push([PIER.x - PIER.w / 2 + 0.35, QUAY_Y + 0.62, z, 1.2], [PIER.x + PIER.w / 2 - 0.35, QUAY_Y + 0.62, z + 8, -1.4]);
    for (let i = 0; i < 5; i++) sit.push([-1192 + i * 5.3, QUAY_Y + 5.85, 1095.5, i * 1.3]);
    const gk = new SettlementKit(); gull(gk);
    const perched = new InstancedMesh(gk.geometry(), this.#solid, sit.length); perched.name = 'Möwen, sitzend';
    const up = new Vector3(0, 1, 0);
    sit.forEach(([x, y, z, yaw], i) => { this.#matrix.compose(this.#v.set(x, y + 0.15, z), this.#q.setFromAxisAngle(up, yaw), this.#s.set(0.8, 0.8, 0.8)); perched.setMatrixAt(i, this.#matrix); });
    this.#s.set(1, 1, 1); this.#near.add(perched);
    // Schornsteine über Izakaya und Minshuku (Bad).
    for (const [x, z, y0, y1] of [[-1274, 1064, 7.5, 11.2], [-1291, 1063.5, 7.5, 11.2]] as const) {
      const k = this.#chunk(x, z).detail;
      k.add(new CylinderGeometry(0.18, 0.2, y1 - y0, 8), 0x6e6f6c, x, QUAY_Y + (y0 + y1) / 2, z);
      k.add(new CylinderGeometry(0.28, 0.28, 0.12, 8), 0x4e4f4c, x, QUAY_Y + y1, z);
    }
  }

  #buildLife(): void {
    const c = Math.cos(SHRINE.yaw), s = Math.sin(SHRINE.yaw);
    const road = RIVER_ROAD.filter(([, z]) => z > 895).map(([x, z]) => [x + 2.1, z] as const);
    const paths: LifePath[] = [
      { pts: [[-1302, 1088.3], [-1192, 1088.3]], loop: false, speed: 1.25, pause: 3, carry: true, look: 0 },
      { pts: [[-1180.5, 1101], [-1180.5, 1163]], loop: false, speed: 1.3, pause: 4, carry: true, look: 1 },
      { pts: road, loop: false, speed: 1.05, pause: 6, carry: false, look: 2 },
      { pts: [[-1314, 1075], [-1222, 1075]], loop: false, speed: 0.95, pause: 5, carry: false, look: 3 },
      { pts: [...SHRINE_PATH, [SHRINE.x + 4 * s, SHRINE.z + 4 * c]], loop: false, speed: 0.9, pause: 8, carry: false, look: 1 },
      { pts: [[-1190, 1091], [-1170, 1091], [-1170, 1098.5], [-1190, 1098.5]], loop: true, speed: 0.8, pause: 0, carry: false, look: 0 },
      { pts: [[-1312, 1034], [-1160, 1034]], loop: false, speed: 1.1, pause: 4, carry: false, look: 2 },
      { pts: [[-1205, 1062], [-1176, 1071], [-1161, 1072]], loop: false, speed: 1.2, pause: 3, carry: true, look: 3 },
      { pts: [[-1322, 1064], [-1321.5, 1150], [-1317, 1190], [-1300, 1205]], loop: false, speed: 1.0, pause: 10, carry: false, look: 0 },
      { pts: [[-1248, 1083.5], [-1152, 1083.5]], loop: false, speed: 1.4, pause: 2, carry: false, look: 1 },
      { pts: [[-1230, 1089], [-1206, 1100], [-1206, 1108]], loop: false, speed: 1.1, pause: 6, carry: true, look: 2 },
    ];
    const height = (x: number, z: number): number => Math.max(this.#ground(x, z), this.floors.height(x, z));
    const smoke: [number, number, number][] = [[-1274, QUAY_Y + 11.4, 1064], [-1291, QUAY_Y + 11.4, 1063.5], [-1212, QUAY_Y + 1.1, 1070]];
    this.#life = new FunauraLife(height, { solid: this.#solid, boat: this.#boatMaterial, glow: this.#glow, sign: this.#signMat!, cloth: this.#cloth }, paths, smoke);
    this.group.add(this.#life.group);
    this.#life.update(0);
  }

  // ── Zusammenbau ──────────────────────────────────────────────────────────

  #finishChunks(): void {
    let triangles = 0;
    for (const c of this.#chunks.values()) {
      const make = (k: SettlementKit, mat: MeshStandardMaterial | MeshBasicMaterial, name: string, parent: Object3D): Mesh | null => {
        if (!k.parts.length) return null;
        const mesh = new Mesh(k.geometry(), mat); mesh.name = name; mesh.receiveShadow = true;
        triangles += mesh.geometry.getAttribute('position').count / 3;
        mesh.geometry.computeBoundingBox(); c.box.union(mesh.geometry.boundingBox!);
        parent.add(mesh); return mesh;
      };
      c.mass = make(c.parts.mass, this.#solid, `Funaura mass ${c.x},${c.z}`, this.group);
      c.fine = make(c.parts.fine, this.#solid, `Funaura fine ${c.x},${c.z}`, this.group);
      if (c.mass) c.mass.castShadow = true;
      // Leuchtteile mit Vertexfarbe laufen über ein weißes Texel im Atlas mit —
      // eine Schicht und ein Draw-Call statt zwei.
      const white = tile(T.busStop, 247, 3, 249, 5);
      for (const part of c.parts.glow.parts) {
        const n = part.getAttribute('position').count, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = white[0]; uv[i * 2 + 1] = white[1]; }
        part.setAttribute('uv', new Float32BufferAttribute(uv, 2)); c.parts.signGlow.parts.push(part);
      }
      c.parts.glow.parts.length = 0;
      for (const [k, m, n] of [[c.parts.detail, this.#solid, 'detail'], [c.parts.glass, this.#glass, 'glass'],
        [c.parts.cloth, this.#cloth, 'cloth'], [c.parts.sign, this.#signMat!, 'sign'], [c.parts.signGlow, this.#signGlow!, 'glow']] as const) {
        const mesh = make(k, m, `Funaura ${n} ${c.x},${c.z}`, this.group);
        if (mesh) c.near.push(mesh);
      }
    }
    this.triangles = triangles;
  }
  triangles = 0;

  // ── Betrieb ──────────────────────────────────────────────────────────────

  readonly #key = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' && !e.repeat && !this.panel.hidden && !this.action.hidden) { e.preventDefault(); this.#use(); }
  };
  #use(): void {
    if (!this.isPlaying() || !this.drive.walking) return;
    const text: Record<Spot, string> = {
      shrine: 'Ebisu, the laughing god with the sea bream. Fishers clap twice here before the first boat leaves.',
      market: 'The auction starts at five. By seven the crates are gone and the floor is hosed down.',
      light: 'Entering harbour: red to starboard, white to port. Two quiet lights, one safe gap.',
      funaya: 'A funaya: boat on the ground floor, family upstairs. The sea comes right up the slip.',
      pier: 'Squid boats leave at dusk. Their lamps are the stars you see on the horizon at night.',
    };
    if (this.#spot) { this.#message = text[this.#spot]; this.#messageUntil = this.#time + 8; }
  }

  update(dt: number): void {
    this.#time += dt;
    const camera = this.#context!.camera, cx = camera.position.x, cz = camera.position.z;
    const distance = Math.hypot(cx - FUNAURA.x, cz - FUNAURA.z);
    this.group.visible = distance < MASS_RANGE + 200;
    if (!this.group.visible) { this.panel.hidden = true; return; }
    for (const c of this.#chunks.values()) {
      // Abstand zur echten Hüllbox der Kachel. Die erste Fassung zog vom Mittelpunkt
      // pauschal 0,7 Kachelbreiten ab — mit 96-m-Kacheln blieb damit auch bei
      // Reichweite 0 alles unter der Kamera sichtbar (gemessen: Minimal sparte nichts).
      const d = Math.hypot(Math.max(c.box.min.x - cx, 0, cx - c.box.max.x), Math.max(c.box.min.z - cz, 0, cz - c.box.max.z));
      if (c.mass) c.mass.visible = d < MASS_RANGE;
      for (const m of c.near) m.visible = d < this.#range;
      if (c.fine) c.fine.visible = this.#fineRange > 0 && d < this.#fineRange;
    }
    this.#near.visible = distance < this.#range + 180;
    this.#timeU.value = this.#time;
    if (this.#life) this.#life.group.visible = this.#near.visible;
    if (this.#life && this.#near.visible) this.#life.update(this.#time);
    for (const lamp of this.#lamps) lamp.visible = Math.sin(this.#time * Math.PI / 2 + lamp.position.x) > -0.2;
    if (this.#near.visible) { this.#updateBoats(this.#time); this.#updateActors(this.#time); }
    const p = this.drive.walking ? this.drive.walker.position : this.drive.vehicle.position;
    const near = Math.hypot(p.x - FUNAURA.x, p.z - FUNAURA.z) < 170;
    this.panel.hidden = !this.isPlaying() || !near;
    if (this.panel.hidden) return;
    this.#spot = '';
    if (this.drive.walking) {
      const c = Math.cos(SHRINE.yaw), s = Math.sin(SHRINE.yaw);
      const spots: [Spot, number, number, number][] = [
        ['shrine', SHRINE.x + 1.2 * s, SHRINE.z + 1.2 * c, 3.5], ['market', -1180, 1094, 7], ['light', LIGHT_WHITE.x, LIGHT_WHITE.z, 6],
        ['light', LIGHT_RED.x, LIGHT_RED.z, 6], ['funaya', -1256.7, FUNAYA_BACK - 1.5, 3.5], ['pier', PIER.x, PIER.z1 - 4, 5],
      ];
      for (const [id, x, z, rr] of spots) if (Math.hypot(p.x - x, p.z - z) < rr) this.#spot = id;
    }
    this.action.hidden = !this.#spot;
    this.action.textContent = 'Inspect · Enter';
    this.label.textContent = this.#time < this.#messageUntil ? this.#message
      : this.#spot ? 'Funaura · Something worth a closer look.'
      : 'Funaura 舟浦 · Boathouses on the water. Park on the quay, walk the moles to the harbour lights.';
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#key); this.panel.remove();
    if (this.drive.ground.localSurfaces === this.#stack) this.drive.ground.localSurfaces = this.#previous;
    const materials = new Set<{ dispose(): void; map?: { dispose(): void } | null }>();
    this.group.removeFromParent();
    this.group.traverse(o => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m as MeshBasicMaterial);
      }
    });
    for (const m of materials) { m.map?.dispose(); m.dispose(); }
  }
}
