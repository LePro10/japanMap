import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh,
  LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping,
  Box3, Vector3,
} from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { QualityKey } from '@/config/quality.config';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LocalSurfaces, type Point } from '../LocalSurfaces';
import { SettlementKit } from '../SettlementKit';
import type { StillwaterVillage } from '../StillwaterVillage';
import { MILL } from '../settlementLayout';
import { Parts, STONE, TIMBER_DARK, ball, jitter, place, plate, rng, shade, tilePlate, type Rng, type Tile } from '../wago/wagoKit';
import { clothMaterial, weatheredMaterial } from '../wago/wagoMaterial';
import { FunauraLife, type LifePath } from '../funaura/funauraLife';
import { cat, ebisuShrine } from '../funaura/funauraBuildings';
import { T, buildGasshoAtlas, tile } from './gasshoAtlas';
import {
  STRAW, bamboo, fieldWorker, fireHut, gasshoHouse, hasaGake, hipThatch, jizoShelter, kakashi, kaki, kayabukiHouse, kura, sugi, waterWheel,
} from './gasshoBuildings';
import {
  BAMBOO, FIRE_HUTS, GASSHO, HOUSES, JIZO, KAKI, PATHS, RACKS, RIVER_Y, SHRINE, STREET, STREET_WIDTH, SUGI, WHEELS,
} from './gasshoLayout';
import '../settlements.css';

/**
 * Reichweiten wie in Funaura (dort gemessen, FunauraVillage.ts): die Masse —
 * Wände, Strohdächer, Zedern — steht bis 2,6 km, weil das Strohdreieck aus der
 * Ferne das Dorf *ist*; Kleinkram nur aus der Nähe, Oberflächenstruktur auf
 * Minimal gar nicht.
 */
const RANGE: Readonly<Record<QualityKey, number>> = { ultra: 700, high: 480, medium: 340, low: 230, minimal: 160, custom: 480 };
const FINE_RANGE: Readonly<Record<QualityKey, number>> = { ultra: 380, high: 260, medium: 170, low: 100, minimal: 0, custom: 260 };
const MASS_RANGE = 2600;
const CHUNK = 96;
/** Wellblechdach über dem Gemüsestand. */
const SHEET = 0x5d7f79;

/** Atlasfläche mit beliebigem Gierwinkel (`tilePlate` kennt nur die Achsen). */
function yawTile(k: SettlementKit, t: Tile, x: number, y: number, z: number, w: number, h: number, yaw: number): void {
  const g = new PlaneGeometry(w, h), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
  k.add(g, 0xffffff, x, y, z, 0, yaw, 0);
}

type Chunk = { x: number; z: number; parts: Parts; mass: Mesh | null; thatch: Mesh | null; near: Object3D[]; fine: Mesh | null; box: Box3 };
type Spot = 'wheel' | 'hero' | 'soba' | 'jizo' | 'shrine' | 'rack' | 'minshuku';
type Wheel = { group: Group; speed: number };
type Sample = Vector3;

/** Stillwater als Gassho-Weiler — docs/DOERFER.md §2. */
export class GasshoHamlet implements System {
  readonly name = 'GasshoHamlet';
  readonly group = new Group();
  readonly floors = new LocalSurfaces();
  readonly streetSamples: Vector3[] = [];
  readonly wheels: Wheel[] = [];
  readonly panel = document.createElement('div');
  readonly label = document.createElement('span');
  readonly action = document.createElement('button');
  isPlaying: () => boolean = () => false;
  buildMs = 0;
  triangles = 0;
  /** Für Messläufe: gebaute Häuser, Hofhöhen und Rauchquellen. */
  readonly yards: { x: number; z: number; y: number; kind: string }[] = [];
  #context: EngineContext | null = null;
  #range = RANGE.high;
  #fineRange = FINE_RANGE.high;
  #time = 0;
  #spot: Spot | '' = '';
  #message = '';
  #messageUntil = 0;
  readonly #chunks = new Map<string, Chunk>();
  readonly #solid = weatheredMaterial({ strength: 0.85 });
  readonly #thatchMat = weatheredMaterial({ thatch: true, roughness: 0.97, strength: 1 });
  readonly #glass = new MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.55 });
  readonly #glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  readonly #timeU = { value: 0 };
  readonly #cloth = clothMaterial(this.#timeU);
  readonly #water = new MeshStandardMaterial({ color: 0x4f8f8a, roughness: 0.18, metalness: 0.3, side: DoubleSide });
  #signMat: MeshStandardMaterial | null = null;
  #signGlow: MeshBasicMaterial | null = null;
  #life: FunauraLife | null = null;
  readonly #near = new Group();
  readonly #smoke: [number, number, number][] = [];
  readonly #signKit = new SettlementKit();
  readonly #r: Rng = rng(0x6a55);
  readonly #matrix = new Matrix4();
  #lane: readonly Sample[] = [];

  constructor(readonly drive: DriveSystem, readonly stillwater: StillwaterVillage, container: HTMLElement) {
    this.panel.className = 'settlement-prompt'; this.panel.hidden = true;
    this.label.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.label, this.action); container.append(this.panel);
  }

  #ground(x: number, z: number): number { return this.drive.terrain!.getHeightAt(x, z); }
  #chunk(x: number, z: number): Parts {
    const gx = Math.floor(x / CHUNK), gz = Math.floor(z / CHUNK), key = `${gx},${gz}`;
    let c = this.#chunks.get(key);
    if (!c) { c = { x: (gx + 0.5) * CHUNK, z: (gz + 0.5) * CHUNK, parts: new Parts(), mass: null, thatch: null, near: [], fine: null, box: new Box3() }; this.#chunks.set(key, c); }
    return c.parts;
  }
  /** Bodenfläche, die nach oben zeigt, egal wie herum die Ecken kommen (wie Funaura). */
  #quad(k: SettlementKit, a: Point, b: Point, c: Point, d: Point, color: number): void {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    const up = uz * vx - ux * vz > 0;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(up ? [...a, ...b, ...c, ...a, ...c, ...d] : [...a, ...c, ...b, ...a, ...d, ...c], 3));
    g.computeVertexNormals(); k.add(g, color, 0, 0, 0);
  }
  #floorQuad(k: SettlementKit, a: Point, b: Point, c: Point, d: Point, color: number): void { this.floors.quad(a, b, c, d); this.#quad(k, a, b, c, d, color); }
  #height(x: number, z: number): number { return Math.max(this.#ground(x, z), this.floors.height(x, z), this.stillwater.floors.height(x, z)); }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.group.name = 'Stillwater gassho hamlet';
    this.#near.name = 'Gassho near layer';
    context.scene.add(this.group); this.group.add(this.#near);
    context.bus.on('quality:changed', ({ level }) => {
      this.#range = RANGE[level as QualityKey] ?? RANGE.medium;
      this.#fineRange = FINE_RANGE[level as QualityKey] ?? FINE_RANGE.medium;
    });
    const started = performance.now();
    const atlas = buildGasshoAtlas();
    this.#signMat = new MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.85, alphaTest: 0.5 });
    this.#signGlow = new MeshBasicMaterial({ vertexColors: true, map: atlas, toneMapped: false });
    this.#lane = this.stillwater.laneSamples;
    this.#buildStreet();
    this.#buildPaths();
    this.#buildHouses();
    this.#buildMillRoof();
    this.#buildWheels();
    this.#buildBridges();
    this.#buildRacks();
    this.#buildSmallBuildings();
    this.#buildTrees();
    this.#buildStreetDetail();
    this.#buildWires();
    this.#buildFigures();
    this.#buildSigns();
    this.#buildLife();
    this.#finishChunks();
    // Eigene Flächen in denselben Stapel wie Stillwater und Funaura — ersetzen
    // hieße, dass das Dorf in den Teich fällt (LocalSurfaces.ts, SurfaceStack).
    const stack = this.drive.ground.localSurfaces;
    if (stack && 'layers' in stack) (stack as { layers: unknown[] }).layers.push(this.floors);
    window.addEventListener('keydown', this.#key);
    this.buildMs = performance.now() - started;
  }
  get lod(): { range: number; fine: number } { return { range: this.#range, fine: this.#fineRange }; }

  // ── Dorfstraße und Feldwege ─────────────────────────────────────────────

  #nearestLane(x: number, z: number): Sample | null {
    let best: Sample | null = null, d = Infinity;
    for (const p of this.#lane) { const e = Math.hypot(p.x - x, p.z - z); if (e < d) { d = e; best = p; } }
    return best;
  }

  /**
   * Band über dem Gelände wie die Mill Lane und die Funaura-Straße: Steigung
   * begrenzt, Enden auf die vorhandene Fläche gezogen. `curbs` nur für die
   * Dorfstraße — Feldwege haben keine Kante, sie hören einfach im Gras auf.
   */
  #ribbon(nodes: readonly (readonly [number, number])[], width: number, color: number, curbs: boolean, record: Vector3[] | null, snapEnds: boolean): void {
    const curve = new CatmullRomCurve3(nodes.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
    const count = Math.max(2, Math.ceil(curve.getLength() / 1.5)), pts = curve.getSpacedPoints(count), r = this.#r;
    const maxAround = (x: number, z: number, h: number): number => { let y = -Infinity; for (let dx = -h; dx <= h; dx += 1) for (let dz = -h; dz <= h; dz += 1) y = Math.max(y, this.#ground(x + dx, z + dz)); return y; };
    const ys = pts.map(p => { this.drive.ground.refresh(p.x, p.z, 0); return Math.max(maxAround(p.x, p.z, width / 2 + 0.5) + (curbs ? 0.32 : 0.14), curbs ? this.drive.height(p.x, p.z) + 0.25 : -Infinity); });
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i <= count; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! - pts[i]!.distanceTo(pts[i - 1]!) * 0.1);
      for (let i = count - 1; i >= 0; i--) ys[i] = Math.max(ys[i]!, ys[i + 1]! - pts[i]!.distanceTo(pts[i + 1]!) * 0.1);
    }
    if (snapEnds) for (const end of [0, count]) {
      const p = pts[end]!; this.drive.ground.refresh(p.x, p.z, 0);
      const off = ys[end]! - this.#height(p.x, p.z) - 0.02;
      for (let j = 0; j < 10; j++) { const i = end === 0 ? j : count - j; ys[i] = ys[i]! - off * (1 - j / 10); }
    }
    let prevL: Point | null = null, prevR: Point | null = null;
    for (let i = 0; i <= count; i++) {
      const p = pts[i]!, before = pts[Math.max(0, i - 1)]!, after = pts[Math.min(count, i + 1)]!;
      const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz), nx = dz / len, nz = -dx / len, y = ys[i]!;
      const l: Point = [p.x + nx * width / 2, y, p.z + nz * width / 2], rr: Point = [p.x - nx * width / 2, y, p.z - nz * width / 2];
      const k = this.#chunk(p.x, p.z), yaw = Math.atan2(dx, dz);
      if (prevL && prevR) this.#floorQuad(k.mass, prevL, prevR, rr, l, jitter(color, r, 0.05));
      record?.push(new Vector3(p.x, y, p.z));
      if (curbs) {
        if (i % 3 === 0) for (const s of [-1, 1]) {
          const x = p.x + nx * width / 2 * s, z = p.z + nz * width / 2 * s, base = this.#ground(x, z) - 0.25;
          k.mass.box(x, (base + y) / 2, z, 0.42, Math.max(0.2, y - base), 4.6, jitter(0x76736a, r, 0.06), 0, yaw);
          k.detail.box(x, y + 0.05, z, 0.44, 0.1, 4.6, 0x8d897e, 0, yaw);
        }
        // Fahrspuren: zwei dunklere Streifen. (Ein Grasrücken dazwischen stand in
        // der ersten Fassung als Kacheln alle 3 m da und las sich als Mittelstreifen.)
        if (i > 0) for (const o of [-1.0, 1.0]) k.detail.add(new PlaneGeometry(0.55, 1.55), shade(color, 0.86), p.x + nx * o, y + 0.012, p.z + nz * o, -Math.PI / 2, yaw);
      } else if (i % 2 === 0) {
        for (const s of [-1, 1]) k.fine.add(new PlaneGeometry(0.3, 1.5), jitter(0x5e6a3a, r, 0.15), p.x + nx * s * (width / 2 - 0.1), y + 0.012, p.z + nz * s * (width / 2 - 0.1), -Math.PI / 2, yaw);
      }
      prevL = l; prevR = rr;
    }
  }

  #buildStreet(): void {
    const a = this.#nearestLane(STREET[0]![0], STREET[0]![1]), b = this.#nearestLane(STREET[STREET.length - 1]![0], STREET[STREET.length - 1]![1]);
    const nodes = STREET.map(n => [n[0], n[1]] as [number, number]);
    if (a) nodes[0] = [a.x, a.z];
    if (b) nodes[nodes.length - 1] = [b.x, b.z];
    this.#ribbon(nodes, STREET_WIDTH, 0x8f8470, true, this.streetSamples, true);
  }

  #buildPaths(): void {
    for (const p of PATHS) this.#ribbon(p, 2.6, 0x83785f, false, null, false);
  }

  /** Nächster Punkt auf Dorfstraße oder Mill Lane, wenn nah genug. */
  #access(x: number, z: number, reach: number): Sample | null {
    let best: Sample | null = null, d = reach;
    for (const list of [this.streetSamples, this.#lane]) for (const p of list) { const e = Math.hypot(p.x - x, p.z - z); if (e < d) { d = e; best = p; } }
    return best;
  }

  // ── Häuser auf ihren Hofterrassen ───────────────────────────────────────

  #buildHouses(): void {
    HOUSES.forEach(([x, z, w, d, yaw, kind, role], i) => {
      const r = rng(0x9a55 + i * 131), c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
      // Hof: hinten und seitlich ein schmaler Rand, vorn Platz für Tor, Engawa, Bank.
      const front = kind === 'kura' ? 2.2 : 3.6, u0 = -w / 2 - 1.2, u1 = w / 2 + front, v0 = -d / 2 - 1.8, v1 = d / 2 + 1.8;
      let hi = -Infinity, lo = Infinity;
      for (let u = u0; u <= u1 + 0.01; u += 1.5) for (let v = v0; v <= v1 + 0.01; v += 1.5) { const [gx, gz] = at(u, v), g = this.#ground(gx, gz); hi = Math.max(hi, g); lo = Math.min(lo, g); }
      const [ex, ez] = at(u1, 0), access = this.#access(ex, ez, 9);
      // Auf Straßenhöhe, wenn das Gelände es zulässt: so fährt man ohne Kante in den Hof.
      let y = hi + 0.3;
      if (access && access.y > y && access.y - y < 0.9) y = access.y;
      const yardY = y;
      // Steinterrasse (Ishigaki) unter dem Hof; oben Kies.
      const tp = new Parts(), yw = u1 - u0, yd = v1 - v0, cu = (u0 + u1) / 2, h = yardY - (lo - 0.4);
      tp.mass.box(cu, -h / 2, 0, yw, h, yd, 0x74706a);
      for (let row = 0; row * 0.42 < h; row++) {
        const by = -0.22 - row * 0.42;
        for (const e of [-1, 1]) {
          for (let u = u0 + 0.35; u < u1; u += 0.78) plate(tp.fine, u + (row % 2) * 0.3, by, e * (yd / 2 + 0.03), 0.72, 0.38, 'z', e, jitter(STONE, r, 0.18));
          for (let v = v0 + 0.35; v < v1; v += 0.78) plate(tp.fine, e > 0 ? u1 + 0.03 : u0 - 0.03, by, v + (row % 2) * 0.3, 0.72, 0.38, 'x', e, jitter(STONE, r, 0.18));
        }
      }
      tp.mass.box(cu, 0.03, 0, yw - 0.1, 0.06, yd - 0.1, jitter(0x8a7f69, r, 0.05));
      // Kiesspuren und ein Trittsteinweg zum Tor.
      for (let v = -1.6; v <= 1.6; v += 0.8) tp.detail.box(u1 - 1.2 - Math.abs(v) * 0.1, 0.07, v, 0.7, 0.04, 0.55, jitter(0x9a968a, r, 0.1));
      place(tp, this.#chunk(x, z), x, yardY, z, yaw);
      const corner = (u: number, v: number): Point => { const [px, pz] = at(u, v); return [px, yardY + 0.06, pz]; };
      this.floors.quad(corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1));
      // Zugang von der Straßenkante bis an den Hof, durchgehend: erst eine flache
      // Steinplatte (sie deckt auch den Wassergraben), dann bis 0,45 m Höhe eine
      // Rampe (befahrbar, höchstens 17 %), darüber Steinstufen (0,26 m, die Figur
      // steigt bis 0,38 m). Zwei Fassungen davor sind im Gehtest gescheitert: eine
      // feste 2,6-m-Rampe war am großen Haus (Hof 1,2 m über der Straße) 46 % steil,
      // und Stufen, die am Hof endeten, ließen den Graben davor offen — die Figur
      // fiel hinein und kam die 0,46 m zur untersten Stufe nicht mehr hinauf.
      if (access) {
        const half = this.streetSamples.includes(access) ? STREET_WIDTH / 2 : 3.5;
        const gap = Math.max(0.6, Math.hypot(ex - access.x, ez - access.z) - half + 0.1);
        const drop = yardY - access.y, k = this.#chunk(ex, ez).mass, sy = access.y + 0.02;
        const q = (u: number, v: number, h: number): Point => { const [px, pz] = at(u, v); return [px, h, pz]; };
        let reach = u1;
        if (drop > 0.45) {
          const n = Math.ceil(drop / 0.26), rise = drop / n, depth = Math.min(0.42, Math.max(0.3, (gap - 0.4) / n));
          for (let i = 1; i <= n; i++) {
            const top = yardY + 0.06 - i * rise, a = u1 + (i - 1) * depth, b = a + depth;
            this.floors.quad(q(a, -1.3, top), q(b, -1.3, top), q(b, 1.3, top), q(a, 1.3, top));
            const [mx, mz] = at((a + b) / 2, 0), base = this.#ground(mx, mz) - 0.3;
            k.box(mx, (top + base) / 2, mz, depth + 0.02, top - base, 2.7, jitter(0x8f8b80, r, 0.08), 0, yaw);
          }
          reach = u1 + n * depth;
        } else if (drop > 0.08) {
          const run = Math.max(1.4, gap * 0.8);
          this.#floorQuad(k, q(u1, -2, yardY + 0.06), q(u1, 2, yardY + 0.06), q(u1 + run, 2, sy), q(u1 + run, -2, sy), 0x877c65);
          reach = u1 + run;
        }
        if (u1 + gap > reach + 0.05) {
          this.#floorQuad(k, q(reach, -1.4, sy), q(reach, 1.4, sy), q(u1 + gap, 1.4, sy), q(u1 + gap, -1.4, sy), jitter(0x8f8b80, r, 0.05));
          const [mx, mz] = at((reach + u1 + gap) / 2, 0), base = this.#ground(mx, mz) - 0.3;
          k.box(mx, (sy - 0.02 + base) / 2, mz, u1 + gap - reach, sy - 0.02 - base, 2.8, 0x76736a, 0, yaw);
        }
      }
      // Haus.
      const p = new Parts();
      const res = kind === 'kura' ? kura(p, w, d, r) : kind === 'kayabuki' ? kayabukiHouse(p, w, d, role, r) : gasshoHouse(p, w, d, role, r);
      place(p, this.#chunk(x, z), x, yardY + 0.06, z, yaw);
      this.drive.collision.addOrientedBox(x, z, -yaw, w / 2 + 0.2, d / 2 + 0.2, yardY - 1, yardY + res.wallH);
      this.yards.push({ x, z, y: yardY, kind });
      // Herdrauch zieht durch das Rauchgitter unter dem First (Gassho) oder den Rauchgiebel.
      if (kind !== 'kura' && (role !== 'home' || r() < 0.6)) {
        const gy = kind === 'gassho' ? res.top - 1.9 : res.top - 1.2, [sx, sz] = at(0, (kind === 'gassho' ? d / 2 + 0.4 : d / 4) * (r() < 0.5 ? 1 : -1));
        this.#smoke.push([sx, yardY + gy, sz]);
      }
    });
  }

  /** Stillwaters Mühle bekommt ein Kayabuki-Walmdach statt der Ziegel (Plan §2). */
  #buildMillRoof(): void {
    const p = new Parts();
    hipThatch(p, 10.4, 14.4, 4.45, 0.84, 0.9, 0.55, STRAW[0]);
    place(p, this.#chunk(MILL.x, MILL.z), MILL.x, this.stillwater.millY, MILL.z, Math.PI / 2);
  }

  // ── Dreifach-Wasserrad ───────────────────────────────────────────────────

  /**
   * Drei Schöpfräder am Ostufer (Asakura Sanrensui). Die Räder heben Wasser,
   * sie treiben nichts: unten greifen sie in den Fluss, oben kippen die Kästen
   * in eine Rinne, und die trägt das Wasser auf die Terrasse.
   *
   * Die erste Fassung hatte die Rinne *über* den Rädern auf 4 m hohen
   * Steinpfeilern — im Bild vom Ufer verdeckten die Pfeiler die Räder, und die
   * Rinne las sich als Fußgängerbrücke. Außerdem floss sie bergauf: die
   * Terrasse liegt bei x = −1197 auf 23,1 m, das kleinste Rad oben bei 22,9 m.
   * Jetzt liegt die Rinne auf 70 % der Radhöhe (das Rad ragt 0,7…0,85 m
   * darüber hinaus), die Räder wachsen flussabwärts, und die Rinne fällt nach
   * Norden zum kleinsten Rad und biegt dort auf die Terrasse — der einzige
   * Verlauf, in dem das Wasser überall bergab läuft (Auslauf ≥ Terrasse + 0,3).
   */
  #buildWheels(): void {
    const r = this.#r, p = this.#chunk(WHEELS.x, WHEELS.z0 + 8), width = 1.2;
    let z = WHEELS.z0;
    const trough: [number, number][] = [];
    const px = WHEELS.x + width / 2 + 0.5;
    // Alle Wasserflächen erst sammeln und am Ende zu zwei Meshes verschmelzen:
    // einzeln waren es 15 Draw-Calls für ein paar Quadratmeter Wasser (gemessen).
    const water: Mesh[] = [], foams: Mesh[] = [];
    WHEELS.radii.forEach((R, i) => {
      z += R; const cy = RIVER_Y - 0.35 + R, ty = cy + 0.7 * R;
      const k = new SettlementKit(); waterWheel(k, R, width);
      const g = new Group(); g.name = `Wasserrad ${i + 1}`; g.position.set(WHEELS.x, cy, z);
      const m = new Mesh(k.geometry(), this.#solid); m.castShadow = true; g.add(m);
      g.rotation.x = i * 0.7;
      this.#near.add(g); this.wheels.push({ group: g, speed: 0.75 / R });
      // Uferpfeiler mit Lager; die Rinne liegt oben auf.
      const base = this.#ground(px, z) - 0.4, top = ty - 0.12;
      p.mass.box(px, (base + top) / 2, z, 0.8, top - base, 1.1, jitter(0x5d5b55, r, 0.06));
      for (let yy = base + 0.3; yy < top; yy += 0.42) for (const e of [-1, 1]) plate(p.fine, px, yy, z + e * 0.56, 0.76, 0.38, 'z', e, jitter(0x6a6862, r, 0.15));
      p.detail.box(px - 0.42, cy, z, 0.08, 0.55, 0.55, 0x2a2a2a);
      // Flussseitiger Holzbock für das andere Achsende.
      const wx = WHEELS.x - width / 2 - 0.4, wb = Math.min(this.#ground(wx, z), RIVER_Y - 0.6) - 0.3;
      for (const e of [-1, 1]) p.detail.box(wx, (wb + cy) / 2, z + e * 0.4, 0.2, cy - wb, 0.2, 0x3a2c22, e * 0.12);
      p.detail.box(wx, cy, z, 0.3, 0.3, 1.0, 0x3a2c22);
      this.drive.collision.addBox(px - 0.4, px + 0.4, z - 0.55, z + 0.55, base, top);
      trough.push([z, ty]);
      // Wasser, das aus den oben kippenden Kästen in die Rinne fällt.
      const fall = cy + 0.96 * R - ty;
      const stream = new Mesh(new PlaneGeometry(0.5, fall), this.#streamMat);
      stream.position.set(WHEELS.x + width / 2 + 0.12, ty + fall / 2, z - 0.35 * R); stream.rotation.y = Math.PI / 2; stream.name = 'Wasserstrahl';
      water.push(stream);
      // Schaum, wo das Rad ins Wasser greift, und Tropfen, die vom Rad fallen.
      const foam = new Mesh(new PlaneGeometry(2.0, 2.8), this.#foamMat);
      foam.rotation.x = -Math.PI / 2; foam.position.set(WHEELS.x, RIVER_Y + 0.03, z + 0.3); foam.name = 'Radschaum';
      foams.push(foam);
      const drip = new Mesh(new PlaneGeometry(0.9, R * 1.1), this.#streamMat);
      drip.position.set(WHEELS.x, cy - R * 0.35, z + R * 0.75); drip.rotation.y = Math.PI / 2; drip.name = 'Tropfwasser';
      water.push(drip);
      z += R + WHEELS.gap;
    });
    // Rinne: vom größten (südlichen) Rad nach Norden fallend, dann nach Osten auf die Terrasse.
    const n0 = trough[0]!, nL = trough[trough.length - 1]!;
    const outZ = n0[0] - 3.4, terrace = this.#ground(-1196.5, outZ);
    const run: [number, number, number][] = [[px, nL[1] + 0.05, nL[0] + 2.2], ...[...trough].reverse().map(([tz, ty]) => [px, ty, tz] as [number, number, number])];
    const endY = Math.max(terrace + 0.32, Math.min(n0[1] - 0.12, terrace + 0.5));
    run.push([px, n0[1] - 0.06, outZ], [-1196.5, endY, outZ]);
    this.troughOutlet = endY - terrace;
    for (let i = 1; i < run.length; i++) {
      const [ax, ay, az] = run[i - 1]!, [bx, by, bz] = run[i]!, len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), pitch = Math.atan2(ay - by, len);
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      p.mass.box(mx, my, mz, 0.62, 0.1, len + 0.12, 0x4d3a2a, pitch, yaw);
      for (const e of [-1, 1]) p.detail.box(mx + Math.cos(yaw) * e * 0.28, my + 0.17, mz - Math.sin(yaw) * e * 0.28, 0.06, 0.34, len + 0.12, 0x5a4432, pitch, yaw);
      // Querbänder alle 0,9 m, die die Seitenbretter zusammenhalten.
      for (let t = 0.45; t < len; t += 0.9) {
        const f = t / len; p.detail.box(ax + (bx - ax) * f, ay + (by - ay) * f + 0.17, az + (bz - az) * f, 0.66, 0.05, 0.06, 0x2e241c, 0, yaw);
      }
      const sheet = new Mesh(new PlaneGeometry(0.5, len), this.#streamMat);
      sheet.rotation.set(-Math.PI / 2 + pitch, yaw, 0, 'YXZ'); sheet.position.set(mx, my + 0.13, mz);
      water.push(sheet);
      // Holzböcke unter dem Stück über dem Ufer, wo keine Pfeiler stehen.
      if (i >= run.length - 2) for (let t = 0.2; t < 1; t += 0.3) {
        const sx = ax + (bx - ax) * t, sz = az + (bz - az) * t, sy = ay + (by - ay) * t - 0.05, gb = this.#ground(sx, sz) - 0.1;
        if (sy - gb < 0.2) continue;
        for (const e of [-1, 1]) p.detail.box(sx + Math.cos(yaw) * e * 0.26, (gb + sy) / 2, sz - Math.sin(yaw) * e * 0.26, 0.11, sy - gb, 0.11, 0x3a2c22);
        this.drive.collision.addCylinder(sx, sz, 0.32, gb, sy);
      }
    }
    const merge = (list: Mesh[], mat: MeshBasicMaterial, name: string): void => {
      const geos = list.map(m => { m.updateMatrix(); const g = m.geometry.clone().applyMatrix4(m.matrix); m.geometry.dispose(); return g; });
      const merged = mergeGeometries(geos); geos.forEach(g => g.dispose());
      if (merged) { const mesh = new Mesh(merged, mat); mesh.name = name; this.#near.add(mesh); }
    };
    merge(water, this.#streamMat, 'Wasser am Rad');
    merge(foams, this.#foamMat, 'Radschaum');
    // Auslauf: Holzkasten und ein kurzer Feldgraben ins nächste Reisfeld.
    p.detail.box(-1196.2, endY - 0.2, outZ, 0.9, 0.5, 0.9, 0x4d3a2a);
    const ditch = new SettlementKit();
    for (let x = -1195.5; x < -1188; x += 1.5) {
      const gy = this.#ground(x + 0.75, outZ) - 0.12;
      ditch.add(new PlaneGeometry(1.5, 0.5), 0xffffff, x + 0.75, gy, outZ, -Math.PI / 2, 0);
      for (const e of [-1, 1]) p.detail.box(x + 0.75, gy + 0.05, outZ + e * 0.32, 1.5, 0.2, 0.14, jitter(0x7c796f, r, 0.08));
    }
    ditch.finish(this.#near, this.#water, 'Feldgraben am Wasserrad');
  }
  troughOutlet = 0;
  #streamTex: CanvasTexture | null = null;
  /** Ein Material für alle Wasserstrahlen: die Textur wird einmal je Frame verschoben, nicht einmal je Strahl. */
  get #streamMat(): MeshBasicMaterial {
    if (!this.#streamMatCache) {
      const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d')!;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
        const v = 0.55 + 0.45 * Math.sin(y * 0.35 + Math.sin(x * 0.9) * 2) * Math.sin(x * 0.5 + y * 0.05);
        g.fillStyle = `rgba(${200 + v * 50},${225 + v * 30},${230 + v * 25},${0.45 + v * 0.4})`; g.fillRect(x, y, 1, 1);
      }
      this.#streamTex = new CanvasTexture(c); this.#streamTex.wrapS = this.#streamTex.wrapT = RepeatWrapping;
      this.#streamMatCache = new MeshBasicMaterial({ map: this.#streamTex, transparent: true, depthWrite: false, side: DoubleSide, color: 0xcfe6ea });
    }
    return this.#streamMatCache;
  }
  #streamMatCache: MeshBasicMaterial | null = null;
  #foamMatCache: MeshBasicMaterial | null = null;
  get #foamMat(): MeshBasicMaterial { return this.#foamMatCache ??= this.#foamMaterial(); }
  #foamMaterial(): MeshBasicMaterial {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = rng(0xf0a3);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.35})`; g.beginPath(); g.arc(8 + r() * 48, 4 + r() * 56, 1 + r() * 4, 0, Math.PI * 2); g.fill(); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping;
    return new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.8 });
  }

  // ── Brücken der Mill Lane ────────────────────────────────────────────────

  /**
   * Die Mill Lane quert den Fluss zweimal; bisher lag dort nur das Band mit
   * Bordsteinen bis zum Flussgrund, und im Luftbild sah es aus wie ein Damm.
   * Jetzt: Holzgeländer, Randbalken, Steinpfeiler. Die Geländer halten auch ein
   * Auto — 3,75 m von der Mitte, die Lane ist 7 m breit.
   */
  #buildBridges(): void {
    const lane = this.#lane, wet = lane.map(p => this.#ground(p.x, p.z) < RIVER_Y + 0.15);
    const runs: [number, number][] = [];
    for (let i = 0; i < lane.length; i++) if (wet[i] && !wet[i - 1]) { let j = i; while (j + 1 < lane.length && wet[j + 1]) j++; runs.push([Math.max(1, i - 3), Math.min(lane.length - 2, j + 3)]); }
    this.bridges = runs.length;
    for (const [i0, i1] of runs) {
      for (let i = i0; i <= i1; i++) {
        const p = lane[i]!, q = lane[Math.min(lane.length - 1, i + 1)]!, dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1, nx = dz / len, nz = -dx / len, yaw = Math.atan2(dx, dz);
        const k = this.#chunk(p.x, p.z);
        for (const s of [-1, 1]) {
          const x = p.x + nx * 3.75 * s, z = p.z + nz * 3.75 * s;
          if (i % 2 === 0) k.detail.box(x, p.y + 0.55, z, 0.18, 1.1, 0.18, 0x4a3526);
          if (i < i1) {
            const x2 = q.x + nx * 3.75 * s, z2 = q.z + nz * 3.75 * s, mx = (x + x2) / 2, mz = (z + z2) / 2, my = (p.y + q.y) / 2, pitch = Math.atan2(p.y - q.y, len);
            for (const h of [1.05, 0.55]) k.detail.box(mx, my + h, mz, 0.1, 0.1, len + 0.05, h > 1 ? 0x5a4130 : 0x4a3526, pitch, yaw);
            k.mass.box(p.x + nx * 3.55 * s + dx / 2, my - 0.18, p.z + nz * 3.55 * s + dz / 2, 0.3, 0.45, len + 0.05, 0x4a3526, pitch, yaw);
            this.drive.collision.addWall(x, z, x2, z2, 0.12, Math.min(p.y, q.y), Math.max(p.y, q.y) + 1.1);
          }
        }
        if ((i - i0) % 4 === 2) {
          const bed = this.#ground(p.x, p.z) - 0.4;
          k.mass.box(p.x, (bed + p.y - 0.4) / 2, p.z, 7.4, Math.max(0.3, p.y - 0.4 - bed), 1.2, jitter(0x6a675f, this.#r, 0.05), 0, yaw);
        }
      }
    }
  }
  bridges = 0;

  // ── Hasa-gake, Hütten, Bäume ────────────────────────────────────────────

  #buildRacks(): void {
    RACKS.forEach(([x0, z0, x1, z1, tiers], i) => {
      const p = new Parts(), len = Math.hypot(x1 - x0, z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      hasaGake(p, len, tiers, rng(0x4a5a + i * 17));
      const y = Math.max(this.#ground(x0, z0), this.#ground(x1, z1), this.#ground(x, z));
      place(p, this.#chunk(x, z), x, y, z, Math.atan2(-(z1 - z0), x1 - x0));
      this.drive.collision.addWall(x0, z0, x1, z1, 0.25, y, y + 1 + tiers * 0.42);
    });
  }

  #buildSmallBuildings(): void {
    FIRE_HUTS.forEach(([x, z, yaw], i) => {
      const p = new Parts(); fireHut(p, rng(0xf17e + i));
      const y = Math.max(this.#ground(x, z), this.floors.height(x, z)) - 0.05;
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(x, z, -yaw, 0.95, 0.8, y, y + 2.5);
    });
    // Jizō am nördlichen Ortseingang.
    const jp = new Parts(); jizoShelter(jp, this.#r);
    const jy = Math.max(this.#ground(JIZO.x, JIZO.z), this.floors.height(JIZO.x, JIZO.z));
    place(jp, this.#chunk(JIZO.x, JIZO.z), JIZO.x, jy, JIZO.z, JIZO.yaw);
    this.drive.collision.addOrientedBox(JIZO.x, JIZO.z, -JIZO.yaw, 2.2, 0.8, jy, jy + 2.5);
    // Hachiman-Schrein: dieselbe Anlage wie der Ebisu-Schrein in Funaura, andere Gottheit.
    const sy = Math.max(this.#ground(SHRINE.x, SHRINE.z), this.#ground(SHRINE.x + 5, SHRINE.z), this.#ground(SHRINE.x - 5, SHRINE.z)) + 0.05;
    const sp = new Parts(); ebisuShrine(sp, this.#r); place(sp, this.#chunk(SHRINE.x, SHRINE.z), SHRINE.x, sy, SHRINE.z, SHRINE.yaw);
    const c = Math.cos(SHRINE.yaw), s = Math.sin(SHRINE.yaw), at = (u: number, v: number): Point => [SHRINE.x + u * c + v * s, sy + 0.7, SHRINE.z - u * s + v * c];
    this.floors.quad(at(-6, -5.5), at(6, -5.5), at(6, 5.5), at(-6, 5.5));
    this.drive.collision.addOrientedBox(SHRINE.x - 1.5 * s, SHRINE.z - 1.5 * c, -SHRINE.yaw, 2.9, 2.3, sy, sy + 6);
    for (const u of [-1.8, 1.8]) { const [tx, , tz] = at(u, 5); this.drive.collision.addCylinder(tx, tz, 0.3, sy, sy + 5); }
    // Stufen vom Plattformrand hinunter (die Plattform steht 0,7 m hoch).
    const k = this.#chunk(SHRINE.x, SHRINE.z).mass;
    for (let i = 0; i < 3; i++) { const [px, , pz] = at(0, 5.8 + i * 0.35); k.box(px, sy + 0.55 - i * 0.22, pz, 2.6, 0.22, 0.4, jitter(0x8f8b80, this.#r, 0.06), 0, SHRINE.yaw); }
    const low = (u: number, v: number): Point => { const q = at(u, v); return [q[0], this.#ground(q[0], q[2]) + 0.05, q[2]]; };
    this.floors.quad(at(-1.3, 5.5), at(1.3, 5.5), low(1.3, 7.0), low(-1.3, 7.0));
    const [tx, , tz] = at(0, 5.22);
    yawTile(this.#chunk(SHRINE.x, SHRINE.z).sign, tile(T.shrine, 88, 0, 168, 128), tx, sy + 4.65, tz, 0.32, 0.5, SHRINE.yaw);
  }

  #clearOf(x: number, z: number, r: number): boolean {
    return HOUSES.every(([hx, hz, w, d]) => Math.hypot(x - hx, z - hz) > Math.hypot(w + 5, d + 4) / 2 + r)
      && this.streetSamples.every(p => Math.hypot(p.x - x, p.z - z) > 4.5 + r)
      && this.#lane.every(p => Math.hypot(p.x - x, p.z - z) > 4.5 + r);
  }

  #buildTrees(): void {
    SUGI.forEach(([x, z, sc], i) => {
      if (!this.#clearOf(x, z, 1.5)) return;
      const r = rng(0x5091 + i * 7), y = this.#ground(x, z) - 0.2;
      sugi(this.#chunk(x, z).mass, x, y, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.4 * sc, y, y + 8);
    });
    KAKI.forEach(([x, z, sc], i) => {
      // Kein Baum auf einer Fahrbahn — so stand einer auf der Dorfstraße, und der Fahrtest blieb stehen.
      if (![...this.streetSamples, ...this.#lane].every(p => Math.hypot(p.x - x, p.z - z) > 5.5)) return;
      const y = Math.max(this.#ground(x, z), this.floors.height(x, z)) - 0.1;
      kaki(this.#chunk(x, z), x, y, z, sc, rng(0x4a41 + i * 13));
      this.drive.collision.addCylinder(x, z, 0.25, y, y + 3);
    });
    BAMBOO.forEach(([x, z, n], i) => bamboo(this.#chunk(x, z), x, this.#ground(x, z) - 0.1, z, n, rng(0xba3b + i)));
  }

  // ── Straßenmöbel, Graben, Fahrzeuge ─────────────────────────────────────

  #buildStreetDetail(): void {
    const r = this.#r, S = this.streetSamples, channel = new SettlementKit();
    // Wassergraben an der Ostkante der Straße (Ogimachi hat ihn überall, mit Koi).
    // Unter einem Hof oder einer Rampe setzt er aus — dort liegt eine Steinplatte.
    for (let i = 60; i < S.length - 12; i++) {
      const p = S[i]!, q = S[i + 1]!, dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz), nx = dz / len, nz = -dx / len, yaw = Math.atan2(dx, dz);
      const off = -(STREET_WIDTH / 2 + 0.75), cx = p.x + nx * off + dx / 2, cz = p.z + nz * off + dz / 2, k = this.#chunk(cx, cz);
      const covered = this.floors.height(cx, cz) > p.y - 0.2 && this.floors.height(cx, cz) < p.y + 1.5 && this.yards.some(yd => Math.hypot(yd.x - cx, yd.z - cz) < 16);
      if (covered) { k.detail.box(cx, p.y + 0.02, cz, 1.3, 0.12, len + 0.02, jitter(0x8f8b80, r, 0.06), 0, yaw); continue; }
      const wy = p.y - 0.42;
      k.mass.box(cx, wy - 0.25, cz, 0.8, 0.12, len + 0.02, 0x4b4a44, 0, yaw);
      for (const e of [-0.46, 0.46]) k.mass.box(cx + nx * e, p.y - 0.3, cz + nz * e, 0.14, 0.62, len + 0.02, jitter(0x7c796f, r, 0.08), 0, yaw);
      channel.add(new PlaneGeometry(0.78, len + 0.02), 0xffffff, cx, wy, cz, -Math.PI / 2, yaw);
      if (i % 9 === 0) for (let j = 0; j < 2; j++) k.detail.box(cx + (r() - 0.5) * 0.3, wy + 0.02, cz + (r() - 0.5) * 1.0, 0.1, 0.05, 0.34, j ? 0xe86a24 : 0xf2efe6, 0, yaw + (r() - 0.5));
    }
    if (channel.parts.length) channel.finish(this.#near, this.#water, 'Wassergraben');
    // Hydranten, Wegweiser, Tempo 30, Gullydeckel, 止まれ an beiden Einmündungen.
    const manhole = tile(T.manhole, 0, 0, 128, 128);
    for (let i = 20; i < S.length - 10; i += 30) tilePlate(this.#chunk(S[i]!.x, S[i]!.z).sign, manhole, S[i]!.x - 1.3, S[i]!.y + 0.02, S[i]!.z, 0.75, 0.75, 'y', 1);
    for (const [i, flip] of [[9, 0], [S.length - 10, Math.PI]] as const) {
      const p = S[i]!, q = S[i + 1]!, yaw = Math.atan2(q.x - p.x, q.z - p.z) + flip;
      tilePlate(this.#chunk(p.x, p.z).sign, tile(T.stop), p.x - Math.cos(yaw) * 1.4, p.y + 0.03, p.z + Math.sin(yaw) * 1.4, 2.6, 1.3, 'y', 1, 0xffffff, yaw + Math.PI);
    }
    const post = (x: number, z: number, y: number, ti: number, px0: number, px1: number, face: number, w: number, h: number): void => {
      const k = this.#chunk(x, z);
      k.detail.add(new CylinderGeometry(0.04, 0.04, 2.4, 6), 0xb8bcbc, x, y + 1.2, z);
      tilePlate(k.sign, tile(ti, px0, 0, px1, 128), x, y + 2.2, z + face * 0.03, w, h, 'z', face);
      tilePlate(k.sign, tile(ti, px0, 0, px1, 128), x, y + 2.2, z - face * 0.03, w, h, 'z', -face);
    };
    const n0 = S[14]!, n1 = S[S.length - 16]!;
    post(n0.x + 4, n0.z, n0.y, T.speed, 0, 128, 1, 0.6, 0.6);
    post(n1.x + 4, n1.z, n1.y, T.speed, 0, 128, -1, 0.6, 0.6);
    post(n1.x - 4.2, n1.z - 1, n1.y, T.busStop, 0, 128, 1, 0.62, 0.62);
    const bk = this.#chunk(n1.x, n1.z);
    bk.detail.box(n1.x - 4.6, n1.y + 0.45, n1.z + 1, 0.45, 0.06, 1.8, 0x8a6a4a); bk.detail.box(n1.x - 4.82, n1.y + 0.72, n1.z + 1, 0.05, 0.45, 1.8, 0x8a6a4a);
    // Tafeln: Ortsplan am Nordeingang, Bärenwarnung zum Westhang, Wasserradtafel.
    const board = (x: number, z: number, ti: number, w: number, h: number, yaw: number): void => {
      const y = this.#height(x, z), k = this.#chunk(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
      k.detail.box(x, y + 1.2 + h / 2, z, w + 0.2, h + 0.2, 0.08, TIMBER_DARK, 0, yaw);
      k.detail.box(x, y + 1.35 + h, z, w + 0.5, 0.1, 0.4, 0x3f474d, 0, yaw);
      yawTile(k.sign, tile(ti), x + s * 0.05, y + 1.2 + h / 2, z + c * 0.05, w, h, yaw);
      for (const e of [-1, 1]) k.detail.box(x + c * e * w * 0.45, y + (1.2 + h / 2) / 2, z - s * e * w * 0.45, 0.1, 1.2 + h / 2, 0.1, TIMBER_DARK);
      this.drive.collision.addCylinder(x, z, 0.3, y, y + 2.5);
    };
    board(S[18]!.x + 5, S[18]!.z + 2, T.mapBoard, 2.4, 1.2, -Math.PI / 2);
    board(-1196.5, 346.5, T.wheelInfo, 1.8, 0.9, -Math.PI / 2);
    board(-1306, 296, T.bear, 1.2, 0.6, Math.PI / 2);
    board(-1178.5, 360, T.notice, 1.8, 0.9, Math.PI / 2);
    board(-1166.5, 328.3, T.farmStand, 1.2, 0.6, -Math.PI / 2);
    // Gemüsestand mit Ehrlichkeitskasse vor dem Feldweg.
    const fk = this.#chunk(-1166, 332), fy = this.#height(-1166, 332);
    fk.detail.box(-1166, fy + 0.8, 332, 0.8, 0.06, 1.8, 0x7a5a3a);
    for (let i = 0; i < 6; i++) ball(fk.detail, -1166 + (i % 2 - 0.5) * 0.35, fy + 0.95, 331.5 + Math.floor(i / 2) * 0.5, 0.13, [0xd8641f, 0x6a8a3a, 0x8a3a5a][i % 3]!, 6);
    fk.detail.box(-1166, fy + 1.55, 332, 1.0, 0.06, 2.1, SHEET);
    for (const dz of [-0.85, 0.85]) fk.detail.box(-1166.35, fy + 0.78, 332 + dz, 0.06, 1.56, 0.06, 0x5a4230);
    // Kei-Trucks und ein kleiner Traktor.
    this.#keiTruck(-1180.5, 318, 0.05, 0xf1f1ec);
    this.#keiTruck(-1165, 436, Math.PI - 0.1, 0xe7e9ea);
    this.#keiTruck(-1257.5, 306.5, Math.PI + 0.1, 0xf1f1ec);
    this.#tractor(-1140, 268.5, 1.4);
    // Strohkegel (Wara-bocchi) auf den abgeernteten Feldern.
    for (const [x, z] of [[-1142, 290], [-1138, 294], [-1116, 370], [-1112, 375], [-1318, 310], [-1146, 446]] as const) {
      const y = this.#ground(x, z), k = this.#chunk(x, z);
      k.mass.add(new CylinderGeometry(0.15, 0.75, 1.9, 9), jitter(0xb08f4f, r, 0.08), x, y + 0.95, z);
      k.detail.add(new CylinderGeometry(0.02, 0.5, 0.5, 9), jitter(0xc2a05c, r, 0.08), x, y + 2.05, z);
    }
    // Wassertröge aus Holz und Steinlaternen an Hofecken.
    for (const yd of this.yards) {
      if (yd.kind === 'kura' || r() < 0.4) continue;
      const k = this.#chunk(yd.x, yd.z), a = r() * Math.PI * 2, x = yd.x + Math.cos(a) * 7.5, z = yd.z + Math.sin(a) * 9;
      if (Math.abs(this.floors.height(x, z) - yd.y - 0.06) > 0.05) continue;
      k.detail.add(new CylinderGeometry(0.45, 0.4, 0.55, 12), 0x5a4432, x, yd.y + 0.34, z);
      k.detail.add(new CylinderGeometry(0.4, 0.4, 0.02, 12), 0x3e6f6c, x, yd.y + 0.58, z);
    }
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
    // Ladung: Reisstrohballen und ein Korb.
    for (let i = 0; i < 3; i++) p.detail.box((i - 1) * 0.42, 0.95, -0.7, 0.4, 0.5, 1.2, 0xbf9d55);
    const y = this.#height(x, z);
    place(p, this.#chunk(x, z), x, y, z, yaw);
    this.drive.collision.addOrientedBox(x, z, -yaw, 0.75, 1.7, y, y + 1.5);
  }

  #tractor(x: number, z: number, yaw: number): void {
    const p = new Parts(), red = 0xd2482a;
    p.mass.box(0, 0.9, 0.5, 0.8, 0.6, 1.4, red);
    p.mass.box(0, 1.2, -0.45, 0.9, 0.12, 0.9, 0x2a2a2a);
    p.detail.box(0, 1.55, -0.45, 0.06, 0.7, 0.06, 0x2a2a2a);
    p.detail.box(0, 1.95, -0.45, 1.0, 0.05, 1.0, 0xe8e2d0);
    for (const s of [-1, 1]) {
      p.detail.add(new CylinderGeometry(0.62, 0.62, 0.35, 14), 0x1a1a1a, s * 0.62, 0.62, -0.5, 0, 0, Math.PI / 2);
      p.detail.add(new CylinderGeometry(0.36, 0.36, 0.22, 12), 0x1a1a1a, s * 0.5, 0.36, 1.0, 0, 0, Math.PI / 2);
    }
    p.detail.box(0, 0.4, -1.35, 1.4, 0.35, 0.5, 0x8a8a86);
    const y = this.#ground(x, z);
    place(p, this.#chunk(x, z), x, y, z, yaw);
    this.drive.collision.addOrientedBox(x, z, -yaw, 0.9, 1.4, y, y + 2);
  }

  /** Holzmasten mit Leitungen entlang der Dorfstraße — auf dem Land steht keine Straße ohne. */
  #buildWires(): void {
    const poles: Vector3[] = [], S = this.streetSamples;
    for (let i = 6; i < S.length - 4; i += 24) {
      const p = S[i]!, q = S[i + 1]!, dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz), x = p.x + dz / l * 4.4, z = p.z - dx / l * 4.4;
      if (this.floors.height(x, z) > p.y + 0.3) continue;
      poles.push(new Vector3(x, Math.max(this.#ground(x, z), p.y - 0.3), z));
    }
    const wires: number[] = [];
    poles.forEach((p, i) => {
      const k = this.#chunk(p.x, p.z);
      k.mass.add(new CylinderGeometry(0.12, 0.16, 9, 6), 0x6b5a4a, p.x, p.y + 4.5, p.z);
      k.detail.box(p.x, p.y + 8.3, p.z, 1.6, 0.1, 0.1, 0x55504a);
      if (i % 3 === 1) k.detail.add(new CylinderGeometry(0.3, 0.3, 0.9, 8), 0x9ea3a3, p.x + 0.35, p.y + 7.2, p.z);
      this.drive.collision.addCylinder(p.x, p.z, 0.18, p.y, p.y + 8);
      const q = poles[i + 1];
      if (!q || p.distanceTo(q) > 50) return;
      for (const off of [-0.7, 0, 0.7]) for (let s = 0; s < 8; s++) {
        const t0 = s / 8, t1 = (s + 1) / 8, sag = (t: number): number => -Math.sin(t * Math.PI) * 0.6;
        wires.push(p.x + (q.x - p.x) * t0 + off, p.y + 8.3 + (q.y - p.y) * t0 + sag(t0), p.z + (q.z - p.z) * t0,
          p.x + (q.x - p.x) * t1 + off, p.y + 8.3 + (q.y - p.y) * t1 + sag(t1), p.z + (q.z - p.z) * t1);
      }
    });
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(wires, 3));
    const lines = new LineSegments(g, new LineBasicMaterial({ color: 0x1a1d20 })); lines.name = 'Leitungen'; this.#near.add(lines);
  }

  // ── Figuren ──────────────────────────────────────────────────────────────

  /** Bauern im Feld (stehen im Reiswasser), Vogelscheuchen, Katzen. */
  #buildFigures(): void {
    const workers: [number, number, number][] = [[-1136, 316, 0.4], [-1131, 318, 2.8], [-1117, 402, 1.2], [-1322, 318, -0.8], [-1141, 398, 2.2]];
    const k = new SettlementKit(); fieldWorker(k, 0);
    const mesh = new InstancedMesh(k.geometry(), this.#solid, workers.length); mesh.name = 'Bauern im Feld';
    const tint = new Color();
    workers.forEach(([x, z, yaw], i) => {
      this.#matrix.makeRotationY(yaw).setPosition(x, this.#ground(x, z) + 0.02, z); mesh.setMatrixAt(i, this.#matrix);
      mesh.setColorAt(i, tint.setHex([0xffffff, 0xc9b8a0, 0xa9c0d8, 0xd0d8b0, 0xe0c0c0][i % 5]!));
    });
    this.#workers = mesh; this.#workerSpots = workers; this.#near.add(mesh);
    for (const [x, z, yaw] of [[-1138, 310, 0.3], [-1119, 392, 2], [-1328, 292, 1]] as const) {
      const p = new Parts(); kakashi(p, this.#r); place(p, this.#chunk(x, z), x, this.#ground(x, z), z, yaw);
    }
    const ck = new SettlementKit(); cat(ck);
    const cats: [number, number, number][] = [[-1185.6, 305, 1.2], [-1161.5, 398, -0.8], [-1243.5, 290, 2.4]];
    const cm = new InstancedMesh(ck.geometry(), this.#solid, cats.length); cm.name = 'Katzen';
    cats.forEach(([x, z, yaw], i) => { this.#matrix.makeRotationY(yaw).setPosition(x, this.#height(x, z), z); cm.setMatrixAt(i, this.#matrix); });
    this.#near.add(cm);
  }
  #workers: InstancedMesh | null = null;
  #workerSpots: [number, number, number][] = [];

  // ── Schilder ─────────────────────────────────────────────────────────────

  #sign(x: number, y: number, z: number, yaw: number, kanji: string, title: string, sub: string, width = 4): void {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 172;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#2b2622'; c.fillRect(0, 0, 512, 172);
    c.strokeStyle = '#c9b48a'; c.lineWidth = 4; c.strokeRect(9, 9, 494, 154);
    c.fillStyle = '#f3e6c8'; c.textAlign = 'left';
    c.font = '600 86px "Yu Mincho", "Hiragino Mincho ProN", serif'; c.fillText(kanji, 26, 118);
    c.textAlign = 'right'; c.font = '600 44px Georgia, serif'; c.fillText(title, 486, 84);
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#d7c49c'; c.fillText(sub, 486, 124);
    const tex = new CanvasTexture(canvas); tex.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: tex });
    for (const side of [0, Math.PI]) {
      const mesh = new Mesh(new PlaneGeometry(width, width / 3), material);
      mesh.position.set(x + Math.sin(yaw + side) * 0.04, y, z + Math.cos(yaw + side) * 0.04); mesh.rotation.y = yaw + side;
      this.group.add(mesh);
    }
    this.#signKit.box(x, y, z, width + 0.16, width / 3 + 0.16, 0.05, TIMBER_DARK, 0, yaw);
    this.#signKit.box(x, y + width / 6 + 0.16, z, width + 0.5, 0.12, 0.35, 0x3f474d, 0, yaw);
    for (const s of [-1, 1]) {
      const px = x + Math.cos(yaw) * s * width * 0.4, pz = z - Math.sin(yaw) * s * width * 0.4, g = this.#height(px, pz);
      this.#signKit.box(px, (g + y) / 2, pz, 0.14, Math.max(0.1, y - g), 0.14, TIMBER_DARK);
    }
  }
  #buildSigns(): void {
    const S = this.streetSamples, a = S[12]!, b = S[S.length - 14]!;
    this.#sign(a.x + 5.2, a.y + 2.4, a.z, Math.PI / 2 - 0.3, '静水', 'Stillwater', 'GASSHO VILLAGE · WATERWHEELS 100 m', 4.2);
    this.#sign(b.x + 5.2, b.y + 2.4, b.z, Math.PI / 2 + 0.2, '合掌', 'Gassho Lane', 'THATCHED FARMHOUSES · SOBA · INN', 3.8);
    this.#signKit.finish(this.group, this.#solid, 'Gassho sign frames');
  }

  // ── Leben ────────────────────────────────────────────────────────────────

  #buildLife(): void {
    const S = this.streetSamples.filter((_, i) => i % 8 === 0).map(p => [p.x + 1.4, p.z] as const);
    const lane = this.#lane.filter((_, i) => i % 8 === 0 && i > 90 && i < 300).map(p => [p.x - 1.6, p.z] as const);
    const paths: LifePath[] = [
      { pts: S, loop: false, speed: 1.0, pause: 8, carry: false, look: 4 },
      { pts: S.slice(8, 22), loop: false, speed: 0.85, pause: 5, carry: true, look: 5 },
      { pts: [[-1173, 346], [-1188, 346], [-1197.5, 344.5]], loop: false, speed: 0.8, pause: 12, carry: false, look: 6 },
      { pts: lane, loop: false, speed: 0.95, pause: 6, carry: true, look: 7 },
      { pts: [[-1172, 404], [-1146, 408], [-1136, 400], [-1124, 392]], loop: false, speed: 0.9, pause: 9, carry: true, look: 4 },
      { pts: [[-1172, 300], [-1152, 299], [-1136, 300]], loop: false, speed: 1.05, pause: 7, carry: false, look: 7 },
      { pts: S.slice(2, 9), loop: false, speed: 0.7, pause: 14, carry: false, look: 5 },
      { pts: [[-1172, 336], [-1150, 336], [-1138, 336]], loop: false, speed: 0.9, pause: 10, carry: true, look: 6 },
    ];
    this.#life = new FunauraLife(
      (x, z) => this.#height(x, z),
      { solid: this.#solid, boat: this.#solid, glow: this.#glow, sign: this.#signMat!, cloth: this.#cloth },
      paths, this.#smoke, { boats: false, name: 'Gassho life', smokeRise: 9 },
    );
    this.group.add(this.#life.group);
    this.#life.update(0);
  }

  // ── Zusammenbau ──────────────────────────────────────────────────────────

  #finishChunks(): void {
    let triangles = 0;
    const white = tile(T.white, 100, 40, 104, 44);
    for (const c of this.#chunks.values()) {
      const make = (k: SettlementKit, mat: MeshStandardMaterial | MeshBasicMaterial, name: string): Mesh | null => {
        if (!k.parts.length) return null;
        const mesh = new Mesh(k.geometry(), mat); mesh.name = name; mesh.receiveShadow = true;
        triangles += mesh.geometry.getAttribute('position').count / 3;
        mesh.geometry.computeBoundingBox(); c.box.union(mesh.geometry.boundingBox!);
        this.group.add(mesh); return mesh;
      };
      c.mass = make(c.parts.mass, this.#solid, `Gassho mass ${c.x},${c.z}`);
      c.thatch = make(c.parts.thatch, this.#thatchMat, `Gassho thatch ${c.x},${c.z}`);
      c.fine = make(c.parts.fine, this.#solid, `Gassho fine ${c.x},${c.z}`);
      if (c.mass) c.mass.castShadow = true;
      if (c.thatch) c.thatch.castShadow = true;
      // Leuchtteile über ein weißes Texel im Atlas: eine Schicht statt zwei (wie Funaura).
      for (const part of c.parts.glow.parts) {
        const n = part.getAttribute('position').count, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = white[0]; uv[i * 2 + 1] = white[1]; }
        part.setAttribute('uv', new Float32BufferAttribute(uv, 2)); c.parts.signGlow.parts.push(part);
      }
      c.parts.glow.parts.length = 0;
      for (const [k, m, n] of [[c.parts.detail, this.#solid, 'detail'], [c.parts.glass, this.#glass, 'glass'],
        [c.parts.cloth, this.#cloth, 'cloth'], [c.parts.sign, this.#signMat!, 'sign'], [c.parts.signGlow, this.#signGlow!, 'glow']] as const) {
        const mesh = make(k, m, `Gassho ${n} ${c.x},${c.z}`);
        if (mesh) c.near.push(mesh);
      }
    }
    this.triangles = triangles;
  }

  // ── Betrieb ──────────────────────────────────────────────────────────────

  readonly #key = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' && !e.repeat && !this.panel.hidden && !this.action.hidden) { e.preventDefault(); this.#use(); }
  };
  #use(): void {
    if (!this.isPlaying() || !this.drive.walking || !this.#spot) return;
    const text: Record<Spot, string> = {
      wheel: 'Three wheels, three sizes. The river turns them, the buckets lift it back up, and the trough carries it to the upper paddies.',
      hero: 'Gassho-zukuri: "hands in prayer". Five floors under one roof — the family below, silkworms in the attic, smoke from the irori keeping the straw dry.',
      soba: 'Buckwheat grows where rice will not. Cold soba, a cup of tea, and a bench in the sun.',
      jizo: 'Six Jizō, one for each world of rebirth. Someone knits them new red caps every winter.',
      shrine: 'Hachiman shrine. In October the village brews doburoku here and pours it for everyone.',
      rack: 'Hasa-gake: the rice dries upside down for two weeks. Machine-dried rice never tastes the same, they say.',
      minshuku: 'A night in a thatched house: dinner around the fire, futons on tatami, the river outside.',
    };
    this.#message = text[this.#spot]; this.#messageUntil = this.#time + 9;
  }

  update(dt: number): void {
    this.#time += dt;
    const camera = this.#context!.camera, cx = camera.position.x, cz = camera.position.z;
    const distance = Math.hypot(cx - GASSHO.x, cz - GASSHO.z);
    this.group.visible = distance < MASS_RANGE + 250;
    if (!this.group.visible) { this.panel.hidden = true; return; }
    for (const c of this.#chunks.values()) {
      const d = Math.hypot(Math.max(c.box.min.x - cx, 0, cx - c.box.max.x), Math.max(c.box.min.z - cz, 0, cz - c.box.max.z));
      if (c.mass) c.mass.visible = d < MASS_RANGE;
      if (c.thatch) c.thatch.visible = d < MASS_RANGE;
      for (const m of c.near) m.visible = d < this.#range;
      if (c.fine) c.fine.visible = this.#fineRange > 0 && d < this.#fineRange;
    }
    this.#near.visible = distance < this.#range + 200;
    this.#timeU.value = this.#time;
    if (this.#life) this.#life.group.visible = this.#near.visible;
    if (this.#near.visible) {
      this.#life?.update(this.#time);
      for (const w of this.wheels) w.group.rotation.x -= dt * w.speed;
      if (this.#streamTex) this.#streamTex.offset.y = (this.#streamTex.offset.y - dt * 0.9) % 1;
      const foam = this.#foamMatCache;
      if (foam?.map) { foam.map.offset.y = (foam.map.offset.y - dt * 0.25) % 1; foam.opacity = 0.68 + Math.sin(this.#time * 3) * 0.12; }
      // Die Bauern im Feld richten sich ab und zu auf und bücken sich wieder.
      if (this.#workers) {
        this.#workerSpots.forEach(([x, z, yaw], i) => {
          const bob = Math.max(0, Math.sin(this.#time * 0.35 + i * 1.7)) * 0.08;
          this.#matrix.makeRotationY(yaw + Math.sin(this.#time * 0.2 + i) * 0.3).setPosition(x, this.#ground(x, z) + 0.02 + bob, z);
          this.#workers!.setMatrixAt(i, this.#matrix);
        });
        this.#workers.instanceMatrix.needsUpdate = true;
      }
    }
    const p = this.drive.walking ? this.drive.walker.position : this.drive.vehicle.position;
    const near = Math.hypot(p.x - GASSHO.x, p.z - GASSHO.z) < 175 || Math.hypot(p.x + 1280, p.z - 330) < 60;
    // Stillwaters Mühle hat ihr eigenes Feld; zwei Kästen übereinander sind einer zu viel.
    this.panel.hidden = !this.isPlaying() || !near || !this.stillwater.panel.hidden;
    if (this.panel.hidden) return;
    this.#spot = '';
    if (this.drive.walking) {
      const hero = HOUSES.find(h => h[6] === 'hero')!, soba = HOUSES.find(h => h[6] === 'soba')!, inn = HOUSES.find(h => h[6] === 'minshuku')!;
      const front = (h: typeof hero): [number, number] => [h[0] + Math.cos(h[4]) * (h[2] / 2 + 2), h[1] - Math.sin(h[4]) * (h[2] / 2 + 2)];
      const spots: [Spot, number, number, number][] = [
        ['wheel', -1197.5, 344.5, 5], ['hero', ...front(hero), 5], ['soba', ...front(soba), 5], ['minshuku', ...front(inn), 4],
        ['jizo', JIZO.x + Math.sin(JIZO.yaw) * 2, JIZO.z + Math.cos(JIZO.yaw) * 2, 3.5], ['shrine', SHRINE.x + Math.sin(SHRINE.yaw) * 6, SHRINE.z + Math.cos(SHRINE.yaw) * 6, 4],
        ['rack', (RACKS[0]![0] + RACKS[0]![2]) / 2, RACKS[0]![1] + 1.5, 6],
      ];
      for (const [id, x, z, rr] of spots) if (Math.hypot(p.x - x, p.z - z) < rr) this.#spot = id;
    }
    this.action.hidden = !this.#spot;
    this.action.textContent = 'Inspect · Enter';
    this.label.textContent = this.#time < this.#messageUntil ? this.#message
      : this.#spot ? 'Stillwater · Something worth a closer look.'
      : 'Stillwater 静水 · Thatched gassho farmhouses among the paddies. The triple waterwheel turns on the east bank.';
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#key); this.panel.remove();
    const stack = this.drive.ground.localSurfaces;
    if (stack && 'layers' in stack) { const l = (stack as { layers: unknown[] }).layers, i = l.indexOf(this.floors); if (i >= 0) l.splice(i, 1); }
    const materials = new Set<{ dispose(): void; map?: { dispose(): void } | null }>();
    this.group.removeFromParent();
    this.group.traverse(o => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m as MeshBasicMaterial);
      }
    });
    for (const m of materials) { m.map?.dispose(); m.dispose(); }
    this.#streamTex?.dispose();
  }
}

