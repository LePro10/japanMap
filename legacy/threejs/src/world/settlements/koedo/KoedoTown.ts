import {
  AdditiveBlending, Box3, BufferGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  IcosahedronGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace, Vector3,
} from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { QualityKey } from '@/config/quality.config';
import { LocalSurfaces, type Point } from '../LocalSurfaces';
import { SettlementKit } from '../SettlementKit';
import { KAWARA, Parts, STONE, jitter, place, plate, rng, shade, tilePlate, type Rng, type Tile } from '../wago/wagoKit';
import { clothMaterial, weatheredMaterial } from '../wago/wagoMaterial';
import { FunauraLife } from '../funaura/funauraLife';
import { bamboo, jizoShelter, kaki } from '../gassho/gasshoBuildings';
import { bench, chochin, hydrangea, niwaki, pottedPlant } from '../kiso/kisoBuildings';
import { T, buildKoedoAtlas, buildStreetTexture, tile } from './koedoAtlas';
import {
  archBridge, archDeck, brewery, kasugaLantern, rickshaw, kuraHouse, kuraRoof, lampPost, machiya, modernHouse,
  stakeBoat, tokiNoKane, torii, whiteKura, willow, type KoedoResult,
} from './koedoBuildings';
import {
  ALLEY_CANDY, ALLEY_WEIR, BREWERY, BRIDGES, CANAL, CANAL_ROW, CURB, FRONT, GARDENS, HOUSES, JOIN, KOEDO, LANDING, MODERN, PLAZA,
  ROAD_HALF_B, SHRINE, STOREHOUSES, S_END, TOWER, TRACK, WILLOWS, at, canalX, faceRoad, frame, useRoadAxis, useStreetProfile, type KoedoHouse,
} from './koedoLayout';
import '../settlements.css';

/**
 * Reichweiten wie Kiso-Juku (dort gemessen): Masse bis 2,6 km — aus der Ferne ist
 * Koedo eine Kette schwerer, dunkler Dächer mit dem Glockenturm darüber —,
 * Kleinkram in der Nähe, Oberflächenstruktur auf Minimal gar nicht.
 */
const RANGE: Readonly<Record<QualityKey, number>> = { ultra: 700, high: 480, medium: 340, low: 230, minimal: 160, custom: 480 };
const FINE_RANGE: Readonly<Record<QualityKey, number>> = { ultra: 380, high: 260, medium: 170, low: 100, minimal: 0, custom: 260 };
const MASS_RANGE = 2600;
/** 80 statt 64 m wie in Kiso: Koedo liegt kompakter, und jede Kachel kostet je Schicht einen Draw-Call. */
const CHUNK = 80;
/** Gehweg-Innenkante (Bordstein) auf Straße A bzw. B. */
const curbO = (s: number): number => s <= JOIN ? 3.3 : ROAD_HALF_B + 0.45;
const WALK_S0 = 552, WALK_S1 = S_END + 8;

type Chunk = { x: number; z: number; parts: Parts; mass: Mesh | null; near: Object3D[]; fine: Mesh | null; box: Box3 };
type Spot = 'brewery' | 'tanks' | 'tower' | 'canal' | 'bridge' | 'candy' | 'boat' | 'shrine' | 'museum' | 'eel' | 'weir';

/** Material mit Atlas und warmer Eigenhelligkeit (Innenräume). */
function litAtlas(map: CanvasTexture, lift: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, map, roughness: 0.9 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.58) * ${lift.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `koedo-lit-atlas-${lift}`;
  return m;
}

/** Koedo — Kura-Handelsstädtchen (docs/DOERFER.md §4). */
export class KoedoTown implements System {
  readonly name = 'KoedoTown';
  readonly group = new Group();
  readonly floors = new LocalSurfaces();
  readonly panel = document.createElement('div');
  readonly label = document.createElement('span');
  readonly action = document.createElement('button');
  isPlaying: () => boolean = () => false;
  buildMs = 0;
  triangles = 0;
  /** Für Messläufe. */
  readonly houses: { s: number; side: number; x: number; z: number; y: number; d: number; role: string; kind: string }[] = [];
  /** Weg vom Gehweg durch den Laden in den Hof und in die Brauhalle (Welt). */
  readonly breweryPath: [number, number][] = [];
  breweryFloor = 0;
  /** Gasse hinunter zum Kanal, die Promenade entlang, über die Bogenbrücke auf den Westdamm (Welt). */
  readonly canalWalk: [number, number][] = [];
  canalEnd: Vector3 | null = null;
  /** Wehrgasse hinunter und über die Plattenbrücke. */
  readonly weirWalk: [number, number][] = [];
  weirEnd: Vector3 | null = null;
  towerPoint: Vector3 | null = null;
  readonly towerPath: [number, number][] = [];
  /** Wasserspiegel der beiden Haltungen und Promenadenhöhen (gerechnet). */
  readonly levels = { water1: 0, water2: 0, prom1: 0, prom2: 0, dike1: 0, dike2: 0 };
  #context: EngineContext | null = null;
  #range = RANGE.high;
  #fineRange = FINE_RANGE.high;
  #time = 0;
  #spot: Spot | '' = '';
  #message = '';
  #messageUntil = 0;
  readonly #chunks = new Map<string, Chunk>();
  readonly #solid = weatheredMaterial({ strength: 0.85 });
  readonly #glossMat = weatheredMaterial({ strength: 0.4, roughness: 0.28 });
  readonly #namakoMat = weatheredMaterial({ strength: 0.55, roughness: 0.7, namako: true });
  readonly #interiorMat = weatheredMaterial({ strength: 0.6, lift: 0.5 });
  readonly #glass = new MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.55 });
  readonly #glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  readonly #timeU = { value: 0 };
  readonly #cloth = clothMaterial(this.#timeU);
  #signMat: MeshStandardMaterial | null = null;
  #signGlow: MeshBasicMaterial | null = null;
  #interiorTex: MeshStandardMaterial | null = null;
  #waterMat: MeshStandardMaterial | null = null;
  #rippleTex: CanvasTexture | null = null;
  #streamMat: MeshBasicMaterial | null = null;
  #life: FunauraLife | null = null;
  readonly #near = new Group();
  readonly #boat = new Group();
  readonly #smoke: [number, number, number][] = [];
  readonly #water = new SettlementKit(true);
  readonly #streams = new SettlementKit(true);
  readonly #r: Rng = rng(0xc0ed);
  #walk: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  #plazaY = 0;
  readonly #doors: { s: number; side: 1 | -1; lit?: boolean }[] = [];
  readonly #lamps: { s: number; side: 1 | -1 }[] = [];
  /** Freie Lichtflecken (Promenade, Gassen): [x, y, z, Größe]. */
  readonly #pools: [number, number, number, number][] = [];

  constructor(readonly drive: DriveSystem, container: HTMLElement) {
    this.panel.className = 'settlement-prompt'; this.panel.hidden = true;
    this.label.setAttribute('role', 'status');
    this.action.onclick = () => this.#use();
    this.panel.append(this.label, this.action); container.append(this.panel);
  }

  // ── Grundlagen ───────────────────────────────────────────────────────────

  #ground(x: number, z: number): number { return this.drive.terrain!.getHeightAt(x, z); }
  #height(x: number, z: number): number { return Math.max(this.#ground(x, z), this.floors.height(x, z)); }
  #chunk(x: number, z: number): Parts {
    const gx = Math.floor(x / CHUNK), gz = Math.floor(z / CHUNK), key = `${gx},${gz}`;
    let c = this.#chunks.get(key);
    if (!c) { c = { x: (gx + 0.5) * CHUNK, z: (gz + 0.5) * CHUNK, parts: new Parts(), mass: null, near: [], fine: null, box: new Box3() }; this.#chunks.set(key, c); }
    return c.parts;
  }
  #at(s: number, o: number): [number, number] { return at(s, o); }
  /** Fahrbahnoberkante auf der Mittellinie. */
  #road(s: number): number { return frame(s).y + 0.06; }
  #walkY(s: number, side: 1 | -1): number {
    const a = this.#walk[side > 0 ? 0 : 1], f = Math.max(0, Math.min(a.length - 1.001, s - WALK_S0)), i = Math.floor(f);
    return a[i]! + (a[i + 1]! - a[i]!) * (f - i);
  }
  #local(x: number, z: number, yaw: number): (u: number, v: number) => [number, number] {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return (u, v) => [x + u * c + v * s, z - u * s + v * c];
  }
  #rect(L: (u: number, v: number) => [number, number], u0: number, v0: number, u1: number, v1: number, y: number): void {
    const a = L(u0, v0), b = L(u1, v0), c = L(u1, v1), d = L(u0, v1);
    this.floors.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]]);
  }
  /** Bodenfläche, die nach oben zeigt, egal wie herum die Ecken kommen. */
  #quad(k: SettlementKit, a: Point, b: Point, c: Point, d: Point, color: number): void {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    const up = uz * vx - ux * vz > 0;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(up ? [...a, ...b, ...c, ...a, ...c, ...d] : [...a, ...c, ...b, ...a, ...d, ...c], 3));
    g.computeVertexNormals(); k.add(g, color, 0, 0, 0);
  }
  /** Senkrechte Wand von (ax, az) nach (bx, bz), von y0 bis y1, mit Bruchsteinen auf der Seite `out` (±1 links/rechts der Richtung). */
  #wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, out: 1 | -1, r: Rng, color = 0x6f6b62): void {
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.05 || y1 - y0 < 0.1) return;
    const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz * out, nz = dx * out, yaw = Math.atan2(dx, dz);
    const k = this.#chunk((ax + bx) / 2, (az + bz) / 2);
    k.mass.box((ax + bx) / 2 - nx * 0.25, (y0 + y1) / 2, (az + bz) / 2 - nz * 0.25, 0.5, y1 - y0, len + 0.02, color, 0, yaw);
    const face = Math.atan2(nx, nz);
    let row = 0;
    for (let y = y0 + 0.05; y < y1 - 0.08; row++) {
      const h = Math.min(y1 - y - 0.02, 0.28 + r() * 0.16);
      for (let u = (row % 2) * 0.3; u < len - 0.05;) {
        const w = Math.min(len - u, 0.4 + r() * 0.45), cx = ax + dx * (u + w / 2) + nx * 0.005, cz = az + dz * (u + w / 2) + nz * 0.005;
        k.fine.add(new PlaneGeometry(w - 0.04, h - 0.04), jitter(STONE, r, 0.22), cx, y + h / 2, cz, 0, face, (r() - 0.5) * 0.05);
        u += w;
      }
      y += h;
    }
    // Deckstein.
    k.detail.box((ax + bx) / 2 - nx * 0.25, y1 + 0.05, (az + bz) / 2 - nz * 0.25, 0.62, 0.12, len + 0.04, 0x8f8b80, 0, yaw);
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.group.name = 'Koedo';
    this.floors.kind = 'asphalt';
    this.#near.name = 'Koedo near layer';
    this.#boat.name = 'Koedo Stakboot';
    context.scene.add(this.group); this.group.add(this.#near); this.#near.add(this.#boat);
    context.bus.on('quality:changed', ({ level }) => {
      this.#range = RANGE[level as QualityKey] ?? RANGE.medium;
      this.#fineRange = FINE_RANGE[level as QualityKey] ?? FINE_RANGE.medium;
    });
    const started = performance.now();
    const dorf = this.drive.roads?.roads.find(r => r.id === 'dorf');
    if (dorf) useRoadAxis(dorf.centerline, dorf.length / (dorf.centerline.length / 3 - 1));
    this.#computeProfile();
    const atlas = buildKoedoAtlas();
    this.#signMat = new MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.85, alphaTest: 0.5, side: DoubleSide });
    this.#signGlow = new MeshBasicMaterial({ vertexColors: true, map: atlas, toneMapped: false });
    this.#interiorTex = litAtlas(atlas, 0.5);
    this.#makeWater();
    this.#buildWalkways();
    this.#buildStreetB();
    this.#buildPlaza();
    for (const h of HOUSES) this.#house(h);
    this.#buildBrewery();
    this.#buildCanal();
    this.#buildCanalRow();
    this.#buildAlleys();
    this.#buildHinterland();
    this.#buildStreetFurniture();
    this.#buildShrine();
    this.#buildApproach();
    this.#buildEdge();
    this.#buildLightPools();
    this.#buildLife();
    this.#finishChunks();
    const stack = this.drive.ground.localSurfaces;
    if (stack && 'layers' in stack) (stack as { layers: unknown[] }).layers.push(this.floors);
    window.addEventListener('keydown', this.#key);
    this.buildMs = performance.now() - started;
  }
  get lod(): { range: number; fine: number } { return { range: this.#range, fine: this.#fineRange }; }
  /** Achse (Dorfstraße, dann Straße B) als Punktfolge — für den Messlauf. y = Fahrbahnoberkante. */
  line(s0: number, s1: number, step: number): { x: number; y: number; z: number; s: number }[] {
    const out: { x: number; y: number; z: number; s: number }[] = [];
    for (let s = s0; s1 > s0 ? s <= s1 : s >= s1; s += s1 > s0 ? step : -step) { const f = frame(s); out.push({ x: f.x, y: f.y + 0.06, z: f.z, s }); }
    return out;
  }
  /** Weltpunkt aus Straßenkoordinaten (Messlauf). */
  at(s: number, o: number): [number, number] { return at(s, o); }
  readonly sEnd = S_END;
  /** Terrace Track im Ortsbereich (Mittellinie, nachgerechnet) — der Messlauf prüft, dass sie frei bleibt. */
  readonly track = TRACK;

  // ── Höhenprofil von Straße B ──────────────────────────────────────────────

  /**
   * Straße B liegt über dem höchsten Geländepunkt ihres Querschnitts (Fahrbahn +6 cm,
   * Gehweg −10 cm, weil er 14 cm höher liegt) und steigt oder fällt höchstens 5 %.
   * Das ist die kleinste Fläche mit diesen beiden Eigenschaften:
   * y(s) = max_j (need(j) − 0,05·|s − j|). Am Straßenende setzt sie auf den Asphalt
   * der Dorfstraße auf (über 8 m eingeblendet). Gemessen liegt sie zwischen z 100 und
   * 125 bis 3 m über einer Senke — dort stehen die Häuser auf hohen Sockeln.
   */
  #computeProfile(): void {
    const n = Math.ceil(S_END - JOIN) + 13, need = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = JOIN + i; let hi = -Infinity;
      for (let o = -(FRONT + 0.3); o <= FRONT + 0.31; o += 0.75) for (const ds of [-0.5, 0, 0.5]) {
        const [x, z] = at(Math.min(S_END, s + ds), o), y = this.#ground(x, z) + (Math.abs(o) <= ROAD_HALF_B + 0.45 ? 0.06 : -0.1);
        if (y > hi) hi = y;
      }
      need[i] = hi;
    }
    const top0 = frame(JOIN - 0.01).y + 0.06;
    for (let i = 0; i < n; i++) { let y = -Infinity; for (let j = 0; j < n; j++) y = Math.max(y, need[j]! - 0.05 * Math.abs(i - j)); ys[i] = y; }
    const y8 = ys[8]!;
    for (let i = 0; i < 8; i++) ys[i] = top0 + (y8 - top0) * (i / 8) * (i / 8) * (3 - 2 * i / 8);
    useStreetProfile(s => { const f = Math.max(0, Math.min(n - 1.001, s - JOIN)), i = Math.floor(f); return ys[i]! + (ys[i + 1]! - ys[i]!) * (f - i) - 0.06; });
    this.#plazaY = top0 + CURB;
  }

  #makeWater(): void {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!, r = rng(0x3a7e);
    g.fillStyle = '#6f8f86'; g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(230,240,235,${0.1 + r() * 0.25})`; g.lineWidth = 1; g.beginPath(); const x = r() * 64, y = r() * 128; g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + 3, x + 12 + r() * 8, y); g.stroke(); }
    this.#rippleTex = new CanvasTexture(c); this.#rippleTex.wrapS = this.#rippleTex.wrapT = RepeatWrapping; this.#rippleTex.colorSpace = SRGBColorSpace;
    // Kanalwasser: grün und fast undurchsichtig wie in Kurashiki — und es muss den Grund
    // verdecken, der hier Gelände ist (kein Rebake, CLAUDE.md).
    this.#waterMat = new MeshStandardMaterial({ map: this.#rippleTex, color: 0x6f8a70, roughness: 0.06, metalness: 0.45, transparent: true, opacity: 0.93 });
    this.#streamMat = new MeshBasicMaterial({ map: this.#rippleTex, color: 0xf4f8f6, transparent: true, opacity: 0.62, depthWrite: false, side: DoubleSide });
  }

  // ── Gehwege ─────────────────────────────────────────────────────────────

  /**
   * Gehwege links und rechts, 14 cm über der Fahrbahn. Wo das Gelände an der
   * Hausfront höher liegt, wird der Gehweg angehoben (Kiso-Lehre) und geglättet.
   * Als geneigte Fläche mit der Straße — flach gelegte Platten standen dort als Sägezahn.
   */
  #buildWalkways(): void {
    const n = Math.ceil(WALK_S1 - WALK_S0) + 1;
    this.#walk = [new Float32Array(n), new Float32Array(n)];
    for (const side of [1, -1] as const) {
      const a = this.#walk[side > 0 ? 0 : 1];
      for (let i = 0; i < n; i++) {
        const s = WALK_S0 + i, base = this.#road(s) + CURB;
        let hi = -Infinity; for (const o of [curbO(s) + 0.1, 4.6, FRONT + 0.1]) { const [x, z] = this.#at(s, side * o); hi = Math.max(hi, this.#ground(x, z)); }
        a[i] = Math.max(base, hi + 0.04);
        // Am Platz ist die Außenseite eine ebene Fläche.
        if (side > 0 && s > PLAZA.s0 - 4 && s < PLAZA.s1 + 4) { const t = Math.min(1, Math.min(s - PLAZA.s0 + 4, PLAZA.s1 + 4 - s) / 4); a[i] = a[i]! + (Math.max(a[i]!, this.#plazaY) - a[i]!) * t; }
      }
      for (let pass = 0; pass < 3; pass++) for (let i = 1; i < n - 1; i++) a[i] = Math.max(a[i]!, (a[i - 1]! + a[i + 1]!) / 2);
    }
    const r = this.#r;
    for (const side of [1, -1] as const) {
      for (let i = 0; i + 1 < n; i++) {
        const s = WALK_S0 + i;
        if (s < KOEDO.s0 || s + 1 > S_END) continue;
        if (side > 0 && s + 1 > PLAZA.s0 && s < PLAZA.s1) continue;
        const y0 = this.#walkY(s, side), y1 = this.#walkY(s + 1, side), c0 = curbO(s), c1 = curbO(s + 1);
        const [x0, z0] = this.#at(s, side * c0), [x1, z1] = this.#at(s + 1, side * c1), [x2, z2] = this.#at(s + 1, side * (FRONT + 0.3)), [x3, z3] = this.#at(s, side * (FRONT + 0.3));
        const pa: Point = [x0, y0, z0], pb: Point = [x1, y1, z1], pc: Point = [x2, y1, z2], pd: Point = [x3, y0, z3];
        this.floors.quad(pa, pb, pc, pd);
        const k = this.#chunk(x0, z0);
        const lerp = (p: Point, q: Point, t: number): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t + 0.004, p[2] + (q[2] - p[2]) * t];
        this.#quad(k.mass, pa, pb, pc, pd, 0x57524a);
        // Granitplatten in zwei Reihen, im Verband, jede eigen getönt.
        const ma = lerp(pa, pd, 0.45), mb = lerp(pb, pc, 0.45), sa = lerp(pa, pb, 0.03), sb = lerp(pb, pa, 0.03);
        this.#quad(k.mass, sa, sb, lerp(mb, ma, 0.03), lerp(ma, mb, 0.03), jitter(0x8f897d, r, 0.08));
        this.#quad(k.mass, lerp(ma, mb, 0.03 + (i % 2) * 0.45), lerp(mb, ma, 0.03), lerp(pc, pd, 0.03), lerp(pd, pc, 0.03 + (i % 2) * 0.45), jitter(0x8a8478, r, 0.08));
        // Bordstein (Granit) zur Fahrbahn, je 2 m ein Stein, geneigt mit der Straße.
        if (i % 2 === 0) {
          const f = frame(s + 1), yaw = Math.atan2(f.tx, f.tz), [bx, bz] = this.#at(s + 1, side * (curbO(s + 1) + 0.08)), yb = (y0 + this.#walkY(s + 2, side)) / 2, low = this.#road(s + 1) - 0.12;
          k.detail.box(bx, (yb + low) / 2, bz, 0.16, yb - low, 2.02, jitter(0xa29d92, r, 0.05), Math.atan2(y0 - this.#walkY(s + 2, side), 2), yaw);
        }
        // Außenkante zwischen den Häusern: wo der Gehweg über dem Gelände liegt, eine Stützmauer.
        const g = this.#ground((x2 + x3) / 2, (z2 + z3) / 2);
        if ((y0 + y1) / 2 - g > 0.35 && !this.#underHouse(s + 0.5, side)) this.#wall(x3, z3, x2, z2, g - 0.3, Math.min(y0, y1) - 0.02, side > 0 ? -1 : 1, r);
      }
    }
    // Rinne auf Straße A: Granit-Band zwischen Asphalt (2,5 m) und Bordstein (3,3 m), 3 cm darüber.
    for (const side of [1, -1] as const) for (let s = KOEDO.s0; s < JOIN - 1; s += 1.5) {
      const f = frame(s + 0.75), [cx, cz] = this.#at(s + 0.75, side * 2.9), tilt = Math.atan2(this.#road(s) - this.#road(s + 1.5), 1.5);
      this.#chunk(cx, cz).mass.add(new PlaneGeometry(0.78, 1.5), jitter(0x77736a, r, 0.06), cx, this.#road(s + 0.75) + 0.03, cz, -Math.PI / 2 + tilt, Math.atan2(f.tx, f.tz));
    }
  }
  #underHouse(s: number, side: 1 | -1): boolean {
    if (side < 0 && Math.abs(s - BREWERY.s) < BREWERY.w / 2 + 0.5) return true;
    return HOUSES.some(h => h.side === side && Math.abs(h.s - s) < h.w / 2 + 0.2);
  }

  // ── Straße B: Fahrbahn aus Stein, Rinnen ──────────────────────────────────

  #buildStreetB(): void {
    const tex = buildStreetTexture();
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.88 });
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let row = 0;
    for (let s = JOIN; s <= S_END + 0.01; s += 1) {
      const f = frame(s), y = this.#road(s);
      for (const l of [-ROAD_HALF_B, 0, ROAD_HALF_B]) { pos.push(f.x + f.nx * l, y, f.z + f.nz * l); uv.push((l + ROAD_HALF_B) / (2 * ROAD_HALF_B), (s - JOIN) / 8); }
      if (row > 0) for (let k = 0; k < 2; k++) { const a = (row - 1) * 3 + k, b = a + 1, c = a + 3, d = c + 1; idx.push(a, c, b, b, c, d); }
      row++;
      if (s + 1 <= S_END + 0.01) {
        const [ax, az] = this.#at(s, -(ROAD_HALF_B + 0.45)), [bx, bz] = this.#at(s + 1, -(ROAD_HALF_B + 0.45)), [cx, cz] = this.#at(s + 1, ROAD_HALF_B + 0.45), [dx, dz] = this.#at(s, ROAD_HALF_B + 0.45), y1 = this.#road(s + 1);
        this.floors.quad([ax, y, az], [bx, y1, bz], [cx, y1, cz], [dx, y, dz]);
      }
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // Wickelrichtung prüfen statt annehmen (P8.6).
    if (g.getAttribute('normal').getY(0) < 0) { const a = g.index!.array as unknown as number[]; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]!; a[i + 1] = a[i + 2]!; a[i + 2] = t; } g.index!.needsUpdate = true; g.computeVertexNormals(); }
    const mesh = new Mesh(g, mat); mesh.name = 'Koedo Straße B'; mesh.receiveShadow = true; this.group.add(mesh);
    // Rinnen: Granitplatten mit Schlitzen, bündig, beidseitig; Gullydeckel in der Mitte.
    const r = this.#r;
    for (const side of [1, -1] as const) for (let s = JOIN + 1; s < S_END; s += 1) {
      const f = frame(s + 0.5), [cx, cz] = this.#at(s + 0.5, side * (ROAD_HALF_B + 0.225)), y = this.#road(s + 0.5), tilt = Math.atan2(this.#road(s) - this.#road(s + 1), 1), k = this.#chunk(cx, cz);
      k.mass.add(new PlaneGeometry(0.43, 0.98), jitter(0x8a867c, r, 0.05), cx, y + 0.006, cz, -Math.PI / 2 + tilt, Math.atan2(f.tx, f.tz));
      k.detail.add(new PlaneGeometry(0.06, 0.5), 0x1a1918, cx, y + 0.009, cz, -Math.PI / 2 + tilt, Math.atan2(f.tx, f.tz));
    }
    for (let s = JOIN + 14; s < S_END; s += 30) {
      const f = frame(s), [x, z] = this.#at(s, 1.2);
      tilePlate(this.#chunk(x, z).sign, tile(T.manhole, 0, 0, 128, 128), x, this.#road(s) + 0.012, z, 0.7, 0.7, 'y', 1, 0xffffff, Math.atan2(f.tx, f.tz));
    }
    // Stirnwand am Südende: die Straße liegt dort bis 3 m über dem Gelände.
    const [ax, az] = this.#at(S_END, -(FRONT + 0.3)), [bx, bz] = this.#at(S_END, FRONT + 0.3);
    this.#wall(ax, az, bx, bz, this.#ground((ax + bx) / 2, (az + bz) / 2) - 0.4, this.#road(S_END) - 0.02, 1, r);
  }

  // ── Platz an der Biegung, Glockenturm ─────────────────────────────────────

  #plazaEdge(s: number): number {
    const t = Math.max(0, Math.min(1, (s - PLAZA.s0) / (PLAZA.s1 - PLAZA.s0)));
    return FRONT + 0.3 + (PLAZA.o - FRONT) * Math.pow(Math.sin(Math.PI * t), 0.55);
  }

  /**
   * Der Platz liegt eben auf Gehweghöhe am Straßenende. Das Gelände darunter ist eine
   * Senke (30…31 m gegen 34,3 m): außen trägt ihn eine Ishigaki-Mauer bis 4 m — so
   * steht der Glockenturm auf einem Steinplateau, wie Tempelbezirke am Hang.
   */
  #buildPlaza(): void {
    const r = rng(0x9a2a), y = this.#plazaY;
    for (let s = PLAZA.s0; s < PLAZA.s1; s += 1) {
      const e0 = this.#plazaEdge(s), e1 = this.#plazaEdge(s + 1);
      for (let q = 0; q < 4; q++) {
        const t0 = q / 4, t1 = (q + 1) / 4, c0 = curbO(s), c1 = curbO(s + 1);
        const [ax, az] = this.#at(s, c0 + (e0 - c0) * t0), [bx, bz] = this.#at(s + 1, c1 + (e1 - c1) * t0), [cx, cz] = this.#at(s + 1, c1 + (e1 - c1) * t1), [dx, dz] = this.#at(s, c0 + (e0 - c0) * t1);
        const pa: Point = [ax, y, az], pb: Point = [bx, y, bz], pc: Point = [cx, y, cz], pd: Point = [dx, y, dz];
        this.floors.quad(pa, pb, pc, pd);
        const k = this.#chunk(ax, az);
        this.#quad(k.mass, pa, pb, pc, pd, 0x55504a);
        const lerp = (p: Point, qq: Point, t: number): Point => [p[0] + (qq[0] - p[0]) * t, p[1] + 0.004, p[2] + (qq[2] - p[2]) * t];
        const i0 = 0.04, i1 = 0.96;
        this.#quad(k.mass, lerp(lerp(pa, pb, i0), lerp(pd, pc, i0), i0), lerp(lerp(pa, pb, i1), lerp(pd, pc, i1), i0), lerp(lerp(pa, pb, i1), lerp(pd, pc, i1), i1), lerp(lerp(pa, pb, i0), lerp(pd, pc, i0), i1), jitter(0x938d80, r, 0.07));
      }
      // Stützmauer am Außenrand.
      const [ex0, ez0] = this.#at(s, e0), [ex1, ez1] = this.#at(s + 1, e1), g = Math.min(this.#ground(ex0, ez0), this.#ground(ex1, ez1));
      // Außen ist links der Fahrtrichtung: out = −1 (erste Fassung +1 — die Steine zeigten ins Mauerwerk).
      if (y - g > 0.3) this.#wall(ex0, ez0, ex1, ez1, g - 0.4, y - 0.02, -1, r);
      else this.#chunk(ex0, ez0).detail.box((ex0 + ex1) / 2, y + 0.2, (ez0 + ez1) / 2, 0.3, 0.4, Math.hypot(ex1 - ex0, ez1 - ez0) + 0.05, 0x8f8b80, 0, Math.atan2(ex1 - ex0, ez1 - ez0));
    }
    // Fuß der Platzmauer: Sträucher, Hortensien und zwei Kiefern — ohne sie stand der Platz aus der
    // Luft als nackte Steinscheibe auf einem Sockel (Bild 2026-09-26).
    for (let s = PLAZA.s0 + 4; s < PLAZA.s1 - 3; s += 5) {
      const [x, z] = this.#at(s, this.#plazaEdge(s) + 1.6), g = this.#ground(x, z), k = this.#chunk(x, z);
      if (y - g < 0.6) continue;
      if ((s - PLAZA.s0) % 15 < 5) { niwaki(k.mass, k.detail, x, g - 0.05, z, 1.0, r); this.drive.collision.addCylinder(x, z, 0.2, g, g + 2.5); }
      else hydrangea(k.mass, k.detail, x, g, z, r);
    }
    // Stirnseiten des Platzes (dort, wo die Häuserzeilen beginnen).
    for (const s of [PLAZA.s0, PLAZA.s1]) {
      const [ax, az] = this.#at(s, FRONT + 0.3), [bx, bz] = this.#at(s, this.#plazaEdge(s) + 0.3), g = this.#ground((ax + bx) / 2, (az + bz) / 2);
      if (y - g > 0.3) this.#wall(ax, az, bx, bz, g - 0.4, y - 0.02, s === PLAZA.s0 ? -1 : 1, r);
    }
    // Glockenturm.
    const [tx, tz] = this.#at(TOWER.s, TOWER.o), yaw = Math.atan2(-0.666, -0.746); // Front (lokal +z) zur Dorfstraße — erste Fassung + π, die Tür schaute weg (Messlauf).
    const p = new Parts(), res = tokiNoKane(p, r);
    // 1,2-fach: mit 15 m stand er aus der Dorfstraße wie ein Laternenpfahl am Ende der Häuser (Bild 2026-09-26).
    for (const k of p.kits) for (const g of k.parts) g.scale(1.2, 1.2, 1.2);
    res.top *= 1.2;
    place(p, this.#chunk(tx, tz), tx, y, tz, yaw);
    this.drive.collision.addOrientedBox(tx, tz, -yaw, 2.8, 2.8, y, y + res.top);
    { const Lt = this.#local(tx, tz, yaw), [px, pz] = Lt(0, 4.4); this.towerPoint = new Vector3(px, y, pz); this.towerPath.push(this.#at(TOWER.s - 6, curbO(TOWER.s - 6) + 2.2), Lt(0, 8.5), [px, pz]); }
    // Tafel, Steinlaternen, Bänke, eine Ginkgo in Gold.
    const L = this.#local(tx, tz, yaw);
    { const [bx, bz] = L(3.4, 3.6), bp = new Parts(); bp.detail.box(0, 0.65, 0, 0.1, 1.3, 0.1, 0x2a2018); bp.detail.box(0, 1.35, 0, 1.25, 0.66, 0.06, 0x2a2018); tilePlate(bp.sign, tile(T.bellInfo), 0, 1.35, 0.04, 1.15, 0.56, 'z', 1); place(bp, this.#chunk(bx, bz), bx, y, bz, yaw); }
    for (const u of [-4.1, 4.1]) { const [lx, lz] = L(u, 1.8), lp = new Parts(); kasugaLantern(lp, 0, 0, 0, r); place(lp, this.#chunk(lx, lz), lx, y, lz, 0); this.drive.collision.addCylinder(lx, lz, 0.35, y, y + 2.1); }
    { const [bx, bz] = L(-4.5, 5.5), k = this.#chunk(bx, bz); const bp = new Parts(); bench(bp, 0, 0, 0, 'x', false); place(bp, k, bx, y, bz, yaw); }
    { const [gx, gz] = L(5.2, -3.2); this.#ginkgo(gx, y, gz, 1.1, r); }
    { const [rx, rz] = L(-5.2, 6.2), rp = new Parts(); rickshaw(rp); place(rp, this.#chunk(rx, rz), rx, y, rz, yaw + 2.4); this.drive.collision.addCylinder(rx, rz, 0.9, y, y + 1.8); }
    { const [nx, nz] = L(-5.0, -2.6), k = this.#chunk(nx, nz); niwaki(k.mass, k.detail, nx, y, nz, 1.2, r); this.drive.collision.addCylinder(nx, nz, 0.25, y, y + 3); }
    this.#pools.push([tx, y, tz, 7]);
    // Ortsplan am Platz.
    this.#board(PLAZA.s0 + 6, curbO(PLAZA.s0 + 6) + 1.6, tile(T.mapBoard), 2.2, 1.1, 1);
  }

  /** Ginkgo im Herbst: gerader Stamm, schmale Krone, leuchtend gelb. */
  #ginkgo(x: number, y: number, z: number, s: number, r: Rng): void {
    const k = this.#chunk(x, z), H = (7 + r() * 2) * s;
    k.mass.add(new CylinderGeometry(0.18 * s, 0.36 * s, H, 7), 0x4a3a2c, x, y + H / 2, z);
    for (let i = 0; i < 16; i++) {
      const f = i / 15, a = i * 2.3 + r(), rr = (1 - f * 0.6) * 2.4 * s * Math.sqrt(r()), g = new IcosahedronGeometry(1, 0);
      g.scale((1.0 + r() * 0.5) * s, (0.8 + r() * 0.3) * s, (1.0 + r() * 0.5) * s);
      k.mass.add(g, jitter([0xd8a82a, 0xe8b830, 0xc8942a, 0xb8a040][i % 4]!, r, 0.07), x + Math.cos(a) * rr, y + H * (0.4 + f * 0.62), z + Math.sin(a) * rr);
    }
    // Gefallene Blätter unter dem Baum: ein gelber Teppich, flach.
    const g = new CylinderGeometry(3.2 * s, 3.2 * s, 0.02, 14); k.detail.add(g, 0xc89a2a, x, this.#height(x, z) + 0.02, z);
    this.drive.collision.addCylinder(x, z, 0.35 * s, y, y + 4);
  }

  /** Tafel auf zwei Pfosten (Straßenkoordinaten). */
  #board(s: number, o: number, t: Tile, w: number, h: number, side: 1 | -1): void {
    const [x, z] = this.#at(s, o), y = this.#height(x, z), yaw = faceRoad(s, side), p = new Parts();
    p.detail.box(0, 1.2 + h / 2, 0, w + 0.2, h + 0.2, 0.08, 0x2a2018);
    p.detail.box(0, 1.35 + h, 0, w + 0.5, 0.1, 0.4, KAWARA);
    tilePlate(p.sign, t, 0, 1.2 + h / 2, 0.05, w, h, 'z', 1);
    for (const e of [-1, 1]) p.detail.box(e * w * 0.45, (1.2 + h / 2) / 2, 0, 0.1, 1.2 + h / 2, 0.1, 0x2a2018);
    place(p, this.#chunk(x, z), x, y, z, yaw);
    this.drive.collision.addCylinder(x, z, 0.3, y, y + 2.5);
  }

  // ── Häuser ────────────────────────────────────────────────────────────────

  #house(h: KoedoHouse): void {
    const r = rng(h.seed), side = h.side, yaw = faceRoad(h.s, side) + h.skew;
    const walk = this.#walkY(h.s, side), y = walk + 0.25, d = h.d, front = FRONT + h.setback;
    const [cx, cz] = this.#at(h.s, side * (front + d / 2)), L = this.#local(cx, cz, yaw);
    let lo = Infinity; for (let u = -h.w / 2; u <= h.w / 2 + 0.01; u += h.w / 4) for (let v = -d / 2; v <= d / 2 + 0.01; v += d / 3) lo = Math.min(lo, this.#ground(...L(u, v)));
    const fs = frame(h.s), along = Math.cos(yaw) * fs.tx - Math.sin(yaw) * fs.tz;
    const street = (u: number): number => this.#walkY(h.s + u * along, side) - y;
    const p = new Parts();
    const spec = { w: h.w, d, role: h.role, r, lit: h.role === 'home' ? 0.35 : 0.65, base: y - lo + 0.4, street, low: h.low };
    const res: KoedoResult = h.kind === 'machiya' ? machiya(p, spec) : kuraHouse(p, spec, h.kind === 'white');
    place(p, this.#chunk(cx, cz), cx, y, cz, yaw);
    this.drive.collision.addOrientedBox(cx, cz, -yaw, h.w / 2 + 0.05, d / 2 + 0.05, y - 1.5, y + res.wallH);
    this.houses.push({ s: h.s, side, x: cx, z: cz, y, d, role: h.role, kind: h.kind });
    const doorS = h.s + res.doorX * along;
    this.#doors.push({ s: doorS, side, lit: h.role !== 'home' || r() < 0.3 });
    // Vorplatz bei zurückgesetzten Häusern: Granit auf Gehweghöhe bis zur Front.
    if (h.setback > 0.3) {
      const k = this.#chunk(cx, cz), v0 = d / 2, v1 = d / 2 + h.setback + 0.05;
      for (let u = -h.w / 2; u < h.w / 2 - 0.01; u += 1) {
        const u1 = Math.min(h.w / 2, u + 1), ya = street(u) + y, yb = street(u1) + y;
        const [ax, az] = L(u, v0), [bx, bz] = L(u1, v0), [ccx, ccz] = L(u1, v1), [dx, dz] = L(u, v1);
        const qa: Point = [ax, ya, az], qb: Point = [bx, yb, bz], qc: Point = [ccx, yb, ccz], qd: Point = [dx, ya, dz];
        this.floors.quad(qa, qb, qc, qd); this.#quad(k.mass, qa, qb, qc, qd, jitter(0x8c8576, r, 0.05));
      }
      const [px, pz] = L((res.doorX > 0 ? -1 : 1) * (h.w / 2 - 0.8), d / 2 + h.setback / 2);
      pottedPlant(p, 0, 0, 0, r); place(p, k, px, walk, pz, 0);
    }
    if (res.smoke) { const [sx, sz] = L(res.smoke[0], res.smoke[2]); this.#smoke.push([sx, y + res.smoke[1], sz]); }
  }

  // ── Brauerei ─────────────────────────────────────────────────────────────

  #buildBrewery(): void {
    const s = BREWERY.s, yaw = faceRoad(s, -1), [x, z] = this.#at(s, -FRONT), y = this.#walkY(s, -1) + 0.15, r = rng(0xb2e0);
    const p = new Parts(), L = this.#local(x, z, yaw);
    const walk = brewery(p, BREWERY.w, BREWERY.d, r);
    // Sockel über das ganze Grundstück: zur Kanalseite fällt das Gelände um bis zu 5 m.
    const hw = BREWERY.w / 2, D = BREWERY.d;
    let lo = Infinity; for (let u = -hw; u <= hw + 0.01; u += hw / 3) for (let v = -D; v <= 0.01; v += D / 6) lo = Math.min(lo, this.#ground(...L(u, v)));
    p.mass.box(0, -(y - lo + 0.3) / 2 - 0.05, -D / 2, BREWERY.w, y - lo + 0.3, D, 0x6f6b62);
    place(p, this.#chunk(x, z), x, y, z, yaw);
    // Ishigaki an den drei freien Seiten des Sockels.
    const corner = (u: number, v: number): [number, number] => L(u, v);
    for (const [a, b, out] of [[[hw, 0], [hw, -D], 1], [[hw, -D], [-hw, -D], 1], [[-hw, -D], [-hw, 0], 1]] as const) {
      const [ax, az] = corner(a[0], a[1]), [bx, bz] = corner(b[0], b[1]), g = Math.min(this.#ground(ax, az), this.#ground(bx, bz));
      if (y - g > 0.4) this.#wall(ax, az, bx, bz, g - 0.4, y - 0.1, out as 1, r);
    }
    for (const [u0, v0, u1, v1, fy] of walk.floors) this.#rect(L, u0, v0, u1, v1, y + fy);
    for (const [u0, v0, u1, v1, y0, y1] of walk.walls) { const [ax, az] = L(u0, v0), [bx, bz] = L(u1, v1); if (Math.hypot(bx - ax, bz - az) > 0.05) this.drive.collision.addWall(ax, az, bx, bz, 0.16, y + y0, y + y1); }
    for (const [u, v, rr, h] of walk.cylinders) { const [cx, cz] = L(u, v); this.drive.collision.addCylinder(cx, cz, rr, y, y + h); }
    this.breweryPath.push(...walk.path.map(([u, v]) => L(u, v)));
    this.breweryFloor = y + 0.02;
    const [sx, sz] = L(walk.chimney[0], walk.chimney[2]); this.#smoke.push([sx, y + walk.chimney[1] + 0.3, sz]);
    for (const [u, sy, v] of walk.smoke) { const [ax, az] = L(u, v); this.#smoke.push([ax, y + sy, az]); }
    this.#doors.push({ s: s - hw + 6.3, side: -1, lit: true }, { s: s - hw + 15, side: -1, lit: true });
  }

  // ── Kanal ────────────────────────────────────────────────────────────────

  /**
   * Der Kanal in zwei Haltungen. Spiegel = höchster Geländepunkt unter Wasser und
   * Mauern + 0,45 m, Grund 0,4 m darunter — das Gelände liegt immer unter dem Grund,
   * und das Wasser verdeckt ihn (kein Rebake). Promenade 1,25 m über dem Wasser,
   * Westdamm 0,95 m. Am Wehr fällt der Spiegel über drei Stufen.
   */
  #buildCanal(): void {
    const r = rng(0xca7a1), C = CANAL, hwW = C.water / 2;
    const tmax = (z0: number, z1: number): number => { let m = -Infinity; for (let z = z0; z <= z1; z += 0.75) for (let o = -hwW - C.wall - 0.3; o <= hwW + C.wall + 0.31; o += 0.75) m = Math.max(m, this.#ground(canalX(z) + o, z)); return m; };
    const w1 = tmax(C.z0 - 1, C.zWeir) + 0.45, w2 = tmax(C.zWeir, C.z1 + 1) + 0.45;
    const L = this.levels;
    L.water1 = w1; L.water2 = w2; L.prom1 = w1 + 1.25; L.prom2 = w2 + 1.25; L.dike1 = w1 + 0.95; L.dike2 = w2 + 0.95;
    const reach = (z: number): 1 | 2 => z < C.zWeir ? 1 : 2;
    const water = (z: number): number => reach(z) === 1 ? w1 : w2;
    /** Promenade: am Wehr als Treppe (1,6 m vor bis 1,6 m nach der Wehrachse). */
    const prom = (z: number): number => { const t = (z - (C.zWeir - 1.8)) / 3.6; if (t <= 0) return L.prom1; if (t >= 1) return L.prom2; return L.prom1 + (L.prom2 - L.prom1) * Math.ceil(t * 10) / 10; };
    const dike = (z: number): number => reach(z) === 1 ? L.dike1 : L.dike2;
    const eastIn = (z: number): number => canalX(z) + hwW, eastOut = (z: number): number => eastIn(z) + C.wall, promOut = (z: number): number => eastOut(z) + C.prom;
    const westIn = (z: number): number => canalX(z) - hwW, westOut = (z: number): number => westIn(z) - C.wall, dikeOut = (z: number): number => westOut(z) - C.dike;
    const bed = (z: number): number => water(z) - 0.4;
    const k = (x: number, z: number): Parts => this.#chunk(x, z);
    for (let z = C.z0; z < C.z1; z += 1) {
      const z1 = z + 1, zm = z + 0.5, kk = k(canalX(zm), zm);
      const weirZone = Math.abs(zm - C.zWeir) < 0.8;
      // Wasser (ohne die Wehrzone), Grund dunkel.
      if (!weirZone) this.#water.add(new PlaneGeometry(C.water + 0.02, 1.02), 0xffffff, canalX(zm), water(zm), zm, -Math.PI / 2, 0, 0);
      this.#quad(kk.mass, [westIn(z), bed(zm), z], [eastIn(z), bed(zm), z], [eastIn(z1), bed(zm), z1], [westIn(z1), bed(zm), z1], 0x2e3326);
      // Mauern: Körper bis unter das Gelände, Innenseite Bruchstein, Deckstein aus Granit.
      const pe = prom(zm), dk = dike(zm);
      kk.mass.box(eastIn(zm) + C.wall / 2, (pe + bed(zm) - 0.6) / 2, zm, C.wall, pe - bed(zm) + 0.6, 1.02, 0x6a665e);
      kk.mass.box(westIn(zm) - C.wall / 2, (dk + bed(zm) - 0.6) / 2, zm, C.wall, dk - bed(zm) + 0.6, 1.02, 0x6a665e);
      for (const [xw, top, f] of [[eastIn(zm), pe, -1], [westIn(zm), dk, 1]] as const) {
        for (let yy = bed(zm) + 0.05, row = 0; yy < top - 0.3; row++) {
          const hh = 0.28 + r() * 0.12;
          for (let u = z + (row % 2) * 0.25 - 0.25; u < z1 - 0.05;) { const ww = Math.min(z1 - Math.max(u, z), 0.35 + r() * 0.4); if (ww > 0.12) kk.fine.add(new PlaneGeometry(ww - 0.04, hh - 0.04), jitter(shade(STONE, 0.85), r, 0.2), xw + f * 0.005, yy + hh / 2, Math.max(u, z) + ww / 2, 0, f > 0 ? Math.PI / 2 : -Math.PI / 2, 0); u = Math.max(u, z) + ww; }
          yy += hh;
        }
        // Moos und Algen an der Wasserlinie.
        kk.detail.add(new PlaneGeometry(1.0, 0.3), 0x2e3a22, xw + f * 0.008, water(zm) + 0.12, zm, 0, f > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        kk.mass.box(xw - f * (C.wall / 2), top + 0.06, zm, C.wall + 0.12, 0.14, 1.0, jitter(0xa8a498, r, 0.04));
      }
      // Promenade (Osten): Granitplatten, begehbar bis an die Hausfronten.
      const pa: Point = [eastOut(z), pe, z], pb: Point = [promOut(z), pe, z], pc: Point = [promOut(z1), pe, z1], pd: Point = [eastOut(z1), pe, z1];
      this.floors.quad(pa, pb, pc, pd);
      this.floors.quad([eastIn(z), pe, z], pa, pd, [eastIn(z1), pe, z1]);
      this.#quad(kk.mass, pa, pb, pc, pd, 0x5a554c);
      for (let q = 0; q < 5; q++) { const x0 = eastOut(zm) + q * C.prom / 5 + 0.03, x1 = x0 + C.prom / 5 - 0.06, zz0 = z + 0.03 + ((q % 2) * 0.5) % 1 * 0, zz1 = z1 - 0.03; this.#quad(kk.mass, [x0, pe + 0.004, zz0], [x1, pe + 0.004, zz0], [x1, pe + 0.004, zz1], [x0, pe + 0.004, zz1], jitter(q === 0 ? 0x9e998c : 0x8d877a, r, 0.07)); }
      // Promenadenrand zum Gelände (in den Lücken der Kanalzeile).
      const gOut = this.#ground(promOut(zm), zm);
      if (pe - gOut > 0.35 && !CANAL_ROW.some(([cz, w]) => Math.abs(cz - zm) < w / 2)) this.#wall(promOut(z), z, promOut(z1), z1, gOut - 0.4, pe - 0.02, -1, r);
      // Westdamm: Kiesweg oben, Grasböschung hinunter zu den Reisfeldern.
      const da: Point = [dikeOut(z), dk, z], db: Point = [westOut(z), dk, z], dc: Point = [westOut(z1), dk, z1], dd: Point = [dikeOut(z1), dk, z1];
      this.floors.quad(da, db, dc, dd); this.floors.quad(db, [westIn(z), dk, z], [westIn(z1), dk, z1], dc);
      this.#quad(kk.mass, da, db, dc, dd, jitter(0x8a8270, r, 0.05));
      let foot = 0; for (let t = 0.5; t < 10; t += 0.5) { if (dk - t / 1.4 <= this.#ground(dikeOut(zm) - t, zm) + 0.05) { foot = t; break; } foot = t; }
      if (foot > 0.4) this.#quad(kk.mass, [dikeOut(z) - foot, dk - foot / 1.4 - 0.2, z], da, dd, [dikeOut(z1) - foot, dk - foot / 1.4 - 0.2, z1], jitter(0x6e7444, r, 0.12));
      // Büschel Pampasgras (Susuki) und ab und zu ein Strauch auf der Böschung — sonst eine glatte grüne Wand.
      if (foot > 1 && r() < 0.7) { const t = 0.3 + r() * (foot - 0.6), gx = dikeOut(zm) - t, gy = dk - t / 1.4, gz = zm + (r() - 0.5) * 0.6; for (let q = 0; q < 5; q++) { const h = 0.8 + r() * 0.7, tilt = (r() - 0.5) * 0.6; kk.detail.add(new ConeGeometry(0.035, h, 3), jitter(q % 2 ? 0xc8b880 : 0xa89868, r, 0.1), gx + (r() - 0.5) * 0.3, gy + h / 2 - 0.05, gz + (r() - 0.5) * 0.3, tilt, r() * 3, (r() - 0.5) * 0.5); } }
      if (foot > 1 && r() < 0.18) { const t = 0.5 + r() * (foot - 1), g = new IcosahedronGeometry(0.6 + r() * 0.4, 0); g.scale(1.2, 0.8, 1.1); kk.detail.add(g, jitter(0x3e5a2a, r, 0.12), dikeOut(zm) - t, dk - t / 1.4 + 0.2, zm); }
      // Steinpfosten mit Kette am Promenadenrand, Kollision dazwischen.
      if (Math.abs((zm - C.z0) % 3) < 0.5) kk.detail.box(eastIn(zm) + 0.3, pe + 0.3, zm, 0.2, 0.6, 0.2, 0x8f8b80);
    }
    // Kollision: Promenaden- und Dammrand (außer an Brücken und Anlegestelle).
    const gaps = [...BRIDGES.map(b => b.kind === 'arch' ? b.z : b.z + 3), LANDING.z];
    for (const [xf, top, zz0, zz1] of [[(zz: number) => eastIn(zz) + 0.3, prom, C.z0, C.z1], [(zz: number) => westIn(zz) - 0.3, dike, C.z0, C.z1]] as const) {
      for (let z = zz0; z < zz1; z += 2) {
        if (gaps.some(g => z + 2 > g - 1.6 && z < g + 1.6)) continue;
        this.drive.collision.addWall(xf(z), z, xf(z + 2), z + 2, 0.12, top(z + 1) - 0.2, top(z + 1) + 0.95);
      }
    }
    // Kette zwischen den Pfosten (Linie, ein Draw-Call).
    const chain: number[] = [];
    for (let z = C.z0 + 1.5; z + 3 < C.z1; z += 3) {
      if (gaps.some(g => Math.abs(z + 1.5 - g) < 1.6)) continue;
      const x0 = eastIn(z) + 0.3, x1 = eastIn(z + 3) + 0.3, y0 = prom(z) + 0.52, y1 = prom(z + 3) + 0.52;
      for (let q = 0; q < 6; q++) { const t0 = q / 6, t1 = (q + 1) / 6, sag = (t: number): number => -Math.sin(Math.PI * t) * 0.12; chain.push(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0 + sag(t0), z + 3 * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1 + sag(t1), z + 3 * t1); }
    }
    { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(chain, 3)); const l = new LineSegments(g, new LineBasicMaterial({ color: 0x1a1a1a })); l.name = 'Koedo Kette'; this.#near.add(l); }
    // Stirnwände Nord und Süd, Treppen hinunter aufs Gelände.
    for (const [z, dir] of [[C.z0, -1], [C.z1, 1]] as const) {
      const top = dir < 0 ? L.prom1 : L.prom2, dk = dir < 0 ? L.dike1 : L.dike2;
      k(canalX(z), z).mass.box(canalX(z), (top + bed(z - dir) - 0.6) / 2, z + dir * 0.3, C.water + 2 * C.wall, top - bed(z - dir) + 0.6, 0.6, 0x6a665e);
      this.#wall(westIn(z) - 0.1, z + dir * 0.6, eastIn(z) + 0.1, z + dir * 0.6, this.#ground(canalX(z), z + dir) - 0.4, Math.min(top, dk) - 0.02, dir < 0 ? -1 : 1, r);
      // Treppe von der Promenade hinunter (Richtung außen).
      const x0 = eastOut(z) + 1.2, x1 = promOut(z) - 1.5;
      let yy = top, zz: number = z;
      for (let i = 0; i < 16 && yy > this.#ground((x0 + x1) / 2, zz + dir * 0.36) + 0.15; i++) {
        const za = zz, zb = zz + dir * 0.36, ny = yy - 0.18;
        this.floors.quad([x0, ny, Math.min(za, zb)], [x1, ny, Math.min(za, zb)], [x1, ny, Math.max(za, zb)], [x0, ny, Math.max(za, zb)]);
        k(x0, zb).mass.box((x0 + x1) / 2, (ny + this.#ground((x0 + x1) / 2, zb) - 0.3) / 2, (za + zb) / 2, x1 - x0, ny - this.#ground((x0 + x1) / 2, zb) + 0.3, 0.37, jitter(0x8a867c, r, 0.06));
        yy = ny; zz = zb;
      }
      // Ein Schütz (Sluice) in der Stirnwand: Holzbrett in Steinführung.
      k(canalX(z), z).detail.box(canalX(z), water(z - dir) + 0.1, z + dir * 0.62, 1.4, 1.2, 0.1, 0x4a3a2a);
      for (const e of [-1, 1]) k(canalX(z), z).detail.box(canalX(z) + e * 0.8, top + 0.4, z + dir * 0.62, 0.2, 2.2, 0.2, 0x7f7b72);
      k(canalX(z), z).detail.box(canalX(z), top + 1.4, z + dir * 0.62, 1.9, 0.18, 0.2, 0x4a3a2a);
    }
    for (const zs of [150, 228]) this.#dikeStair(zs, dike(zs), dikeOut(zs), r);
    this.#buildWeir(w1, w2, bed);
    this.#buildBridges(prom, dike, water);
    this.#buildLanding(w1);
    for (const [z, side, sc] of WILLOWS) {
      const x = side > 0 ? eastIn(z) + C.wall + 0.9 : westOut(z) - 1.4, y = side > 0 ? prom(z) : dike(z);
      willow(k(x, z), x, y - 0.05, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.3 * sc, y, y + 3);
    }
    // Laternen an der Promenade.
    for (let z = C.z0 + 6; z < C.z1 - 3; z += 17) { const x = promOut(z) - 0.9, y = prom(z); lampPost(k(x, z), x, y, z); this.drive.collision.addCylinder(x, z, 0.14, y, y + 4); this.#pools.push([x - 1.5, y, z, 4.2]); }
    if (this.#water.parts.length) { const m = new Mesh(this.#water.geometry(), this.#waterMat!); m.name = 'Koedo Kanal'; m.receiveShadow = true; this.#near.add(m); }
    this.#water.parts.length = 0;
  }

  /** Treppe vom Dammweg die Böschung hinunter auf den Feldrain. */
  #dikeStair(z: number, top: number, x0: number, r: Rng): void {
    let y = top, x = x0;
    for (let i = 0; i < 30 && y > this.#ground(x - 0.36, z) + 0.12; i++) {
      const ny = Math.max(y - 0.19, this.#ground(x - 0.36, z) + 0.05), k = this.#chunk(x, z);
      this.floors.quad([x - 0.37, ny, z - 0.6], [x, ny, z - 0.6], [x, ny, z + 0.6], [x - 0.37, ny, z + 0.6]);
      const g = this.#ground(x - 0.18, z) - 0.3;
      k.mass.box(x - 0.18, (ny + g) / 2, z, 0.37, ny - g, 1.2, jitter(0x8a867c, r, 0.06));
      y = ny; x -= 0.36;
    }
  }

  /** Stufenwehr: drei Steinstufen quer über den Kanal, Wasser fällt über jede. */
  #buildWeir(w1: number, w2: number, bed: (z: number) => number): void {
    const C = CANAL, z = C.zWeir, x = canalX(z), k = this.#chunk(x, z), r = rng(0x3e17);
    const steps = 3, drop = (w1 - w2) / steps;
    for (let i = 0; i < steps; i++) {
      const top = w1 - 0.05 - i * drop, zz = z - 0.8 + i * 0.55;
      k.mass.box(x, (top + bed(z + 1) - 0.4) / 2, zz + 0.27, C.water + 0.1, top - bed(z + 1) + 0.4, 0.56, jitter(0x7f7b72, r, 0.05));
      this.#streams.add(new PlaneGeometry(C.water, drop + 0.08), 0xffffff, x, top - drop / 2 + 0.02, zz + 0.56, 0, 0, 0);
      this.#streams.add(new PlaneGeometry(C.water, 0.55), 0xffffff, x, top + 0.03, zz + 0.27, -Math.PI / 2, 0, 0);
    }
    // Schaum am Fuß.
    this.#streams.add(new PlaneGeometry(C.water, 1.2), 0xffffff, x, w2 + 0.02, z + 1.4, -Math.PI / 2, 0, 0);
    this.#pools.push([x + 5, this.levels.prom2, z + 3, 3]);
  }

  #buildBridges(prom: (z: number) => number, dike: (z: number) => number, water: (z: number) => number): void {
    const C = CANAL, r = rng(0xb21d);
    for (const b of BRIDGES) {
      const z = b.kind === 'arch' ? b.z : b.z + 3, xc = canalX(z), k = this.#chunk(xc, z);
      const span = C.water + 2 * C.wall + 0.6, width = b.kind === 'arch' ? 2.6 : 1.8, yA = prom(z), yB = dike(z);
      if (b.kind === 'arch') {
        const p = new Parts(); archBridge(p, span, width, yA, yB, 0.9, water(z), r);
        // Lokales +x nach Westen (−x): Gier π.
        place(p, k, xc, 0, z, Math.PI);
        const n = 24;
        for (let i = 0; i < n; i++) {
          const u0 = -span / 2 + i * span / n, u1 = u0 + span / n, ya = archDeck(u0, span, yA, yB, 0.9), yb = archDeck(u1, span, yA, yB, 0.9);
          this.floors.quad([xc - u0, ya, z - width / 2 + 0.3], [xc - u1, yb, z - width / 2 + 0.3], [xc - u1, yb, z + width / 2 - 0.3], [xc - u0, ya, z + width / 2 - 0.3]);
        }
        for (const e of [-1, 1]) for (let i = 0; i < 4; i++) {
          const u0 = -span / 2 + i * span / 4, u1 = u0 + span / 4, ym = archDeck((u0 + u1) / 2, span, yA, yB, 0.9);
          this.drive.collision.addWall(xc - u0, z + e * (width / 2 - 0.12), xc - u1, z + e * (width / 2 - 0.12), 0.14, ym - 0.3, ym + 0.75);
        }
        this.canalWalk.push([xc + span / 2 + 1.5, z], [xc, z], [xc - span / 2 - 1.2, z]);
        this.canalEnd = new Vector3(xc - span / 2 - 1.2, yB, z);
        this.#pools.push([xc, archDeck(0, span, yA, yB, 0.9), z, 3]);
      } else {
        // Plattenbrücke: zwei lange Granitplatten auf Steinpfeilern.
        const y = Math.max(yA, yB);
        k.mass.box(xc, y - 0.14, z, span, 0.28, width, jitter(0x9a968c, r, 0.04));
        k.detail.box(xc, y + 0.002, z, span, 0.004, 0.03, 0x4a4640);
        k.mass.box(xc, (y - 0.3 + water(z) - 0.6) / 2, z, 0.8, y - 0.3 - water(z) + 0.6, width - 0.2, 0x7f7b72);
        if (yB < y - 0.05) this.floors.quad([xc - span / 2 - 0.9, yB, z - width / 2], [xc - span / 2, y, z - width / 2], [xc - span / 2, y, z + width / 2], [xc - span / 2 - 0.9, yB, z + width / 2]);
        this.floors.quad([xc + span / 2, y, z - width / 2], [xc - span / 2, y, z - width / 2], [xc - span / 2, y, z + width / 2], [xc + span / 2, y, z + width / 2]);
        for (const e of [-1, 1]) this.drive.collision.addWall(xc + span / 2, z + e * (width / 2 + 0.05), xc - span / 2, z + e * (width / 2 + 0.05), 0.08, y - 0.3, y + 0.35);
        this.weirWalk.push([xc + span / 2 + 1.2, z], [xc, z], [xc - span / 2 - 1.2, z]);
        this.weirEnd = new Vector3(xc - span / 2 - 1.2, yB, z);
      }
    }
  }

  /** Anlegestelle: Treppe an der Ostmauer hinunter bis knapp über das Wasser, das Stakboot daneben. */
  #buildLanding(w1: number): void {
    const C = CANAL, z0 = LANDING.z - 1.2, x1 = canalX(LANDING.z) + C.water / 2, x0 = x1 - 1.0, r = rng(0x1a9d);
    const top = this.levels.prom1, n = Math.ceil((top - (w1 + 0.2)) / 0.19), rise = (top - (w1 + 0.2)) / n;
    for (let i = 1; i <= n; i++) {
      const y = top - i * rise, za = z0 - (i - 1) * 0.32 + 1.4, zb = za - 0.32;
      this.floors.quad([x0, y, zb], [x1, y, zb], [x1, y, za], [x0, y, za]);
      this.#chunk(x0, za).mass.box((x0 + x1) / 2, (y + w1 - 0.6) / 2, (za + zb) / 2, x1 - x0, y - w1 + 0.6, 0.33, jitter(0x8f8b80, r, 0.05));
    }
    const zl = z0 + 1.4 - n * 0.32 - 1.2;
    this.floors.quad([x0, w1 + 0.2, zl], [x1, w1 + 0.2, zl], [x1, w1 + 0.2, zl + 1.2], [x0, w1 + 0.2, zl + 1.2]);
    this.#chunk(x0, zl).mass.box((x0 + x1) / 2, w1 - 0.2, zl + 0.6, 1.0, 0.8, 1.2, 0x8f8b80);
    this.drive.collision.addWall(x0 - 0.05, z0 + 1.4, x0 - 0.05, zl, 0.1, w1, top + 0.9);
    // Boot: eigenes Mesh, schaukelt in `update`.
    const k = new SettlementKit(), s = new SettlementKit(); stakeBoat(k, s);
    const m = new Mesh(k.geometry(), this.#solid); m.castShadow = true; this.#boat.add(m);
    const ms = new Mesh(s.geometry(), this.#solid); this.#boat.add(ms);
    this.#boat.position.set(x0 - 1.1, w1 - 0.12, zl + 1.5); this.#boat.rotation.y = 0.04;
    // Poller.
    this.#chunk(x0, zl).detail.add(new CylinderGeometry(0.1, 0.12, 0.5, 8), 0x3a3a3a, x0 + 0.3, w1 + 0.45, zl + 0.3);
  }

  #buildCanalRow(): void {
    const C = CANAL;
    CANAL_ROW.forEach(([z, w, d, kind, gable], i) => {
      const r = rng(0x7c00 + i * 131), xc = canalX(z) + C.water / 2 + C.wall + C.prom + d / 2 + 0.1, yaw = -Math.PI / 2;
      const prom = z < C.zWeir ? this.levels.prom1 : this.levels.prom2, y = prom + 0.22, L = this.#local(xc, z, yaw);
      let lo = Infinity; for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 3) for (let v = -d / 2; v <= d / 2 + 0.01; v += d / 3) lo = Math.min(lo, this.#ground(...L(u, v)));
      const p = new Parts(), street = (): number => prom - y;
      let res: KoedoResult;
      if (kind === 'white') res = whiteKura(p, { w, d, r, gable, lit: 0.5, base: y - lo + 0.4, shop: r() < 0.55 });
      else if (kind === 'machiya') res = machiya(p, { w, d, role: r() < 0.5 ? 'cafe' : 'home', r, lit: 0.5, base: y - lo + 0.4, street });
      else res = kuraHouse(p, { w, d, role: 'incense', r, lit: 0.5, base: y - lo + 0.4, street });
      place(p, this.#chunk(xc, z), xc, y, z, yaw);
      this.drive.collision.addOrientedBox(xc, z, -yaw, w / 2 + 0.05, d / 2 + 0.05, y - 1.5, y + res.wallH);
      this.houses.push({ s: 0, side: 0, x: xc, z, y, d, role: 'canal', kind });
      if (r() < 0.6) this.#pools.push([xc - d / 2 - 1.2, prom, z + res.doorX * 0, 2.6]);
    });
  }

  // ── Gassen ───────────────────────────────────────────────────────────────

  /**
   * Begehbarer Steinweg über das Gelände (wie `#path` in Kiso-Juku): Höhe folgt
   * dem höchsten Punkt quer über die Breite, steigt nie ab, Stufen ≤ 21 cm. Neu:
   * ein Zielwert am Ende — die Rampe dorthin wird rückwärts eingerechnet, damit
   * der Weg bündig auf dem Gehweg ankommt statt mit einer Stufe davor.
   */
  #path(pts: readonly (readonly [number, number])[], width: number, y0: number, yEnd: number | null, record: Vector3[] | null): number[] {
    const samples: [number, number, number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.36));
      for (let j = i === 1 ? 0 : 1; j <= n; j++) { const t = j / n; samples.push([ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / len, (bz - az) / len]); }
    }
    const need = samples.map(([x, z, dx, dz]) => { let hi = -Infinity; for (const o of [-width / 2, 0, width / 2]) hi = Math.max(hi, this.#ground(x - dz * o, z + dx * o)); return hi + 0.06; });
    if (yEnd !== null) { const n = samples.length; for (let i = 0; i < n; i++) need[i] = Math.max(need[i]!, yEnd - (n - 1 - i) * 0.36 * 0.3); need[n - 1] = Math.max(need[n - 1]!, yEnd); }
    const ys: number[] = []; let cur = y0;
    for (let i = 0; i < samples.length; i++) {
      let ahead = need[i]!; for (let j = i; j < Math.min(samples.length, i + 3); j++) ahead = Math.max(ahead, need[j]!);
      if (ahead > cur + 0.005) cur = ahead - cur <= 0.05 ? ahead : cur + Math.min(0.21, ahead - cur);
      ys.push(cur);
    }
    const r = this.#r;
    for (let i = 0; i < samples.length; i++) {
      const [x, z, dx, dz] = samples[i]!, y = ys[i]!, yaw = Math.atan2(dx, dz), k = this.#chunk(x, z);
      const hw = width / 2, a: Point = [x - dz * hw - dx * 0.2, y, z + dx * hw - dz * 0.2], b: Point = [x + dz * hw - dx * 0.2, y, z - dx * hw - dz * 0.2];
      const c: Point = [x + dz * hw + dx * 0.21, y, z - dx * hw + dz * 0.21], d: Point = [x - dz * hw + dx * 0.21, y, z + dx * hw + dz * 0.21];
      this.floors.quad(a, b, c, d);
      let lo = Infinity; for (const o of [-hw, 0, hw]) lo = Math.min(lo, this.#ground(x - dz * o, z + dx * o));
      k.mass.box(x, (y + lo - 0.3) / 2, z, width, y - lo + 0.3, 0.42, jitter(0x6f6b62, r, 0.1), 0, yaw);
      const n = width > 2 ? 3 : 2;
      for (let j = 0; j < n; j++) { const o = (j - (n - 1) / 2) * width / n; k.detail.add(new PlaneGeometry(width / n - 0.05, 0.37), jitter(0x8a8579, r, 0.1), x - dz * o, y + 0.004, z + dx * o, -Math.PI / 2, yaw); }
      if (i > 0 && y - ys[i - 1]! > 0.06) k.detail.box(x - dx * 0.21, y - 0.1, z - dz * 0.21, width, 0.18, 0.02, 0x57534b, 0, yaw);
      record?.push(new Vector3(x, y, z));
    }
    return ys;
  }

  #buildAlleys(): void {
    const C = CANAL, r = rng(0xa11e);
    // Kashiya Yokochō: von der Promenade hinauf zu Straße B (gebaut von unten, damit er nie absteigt).
    {
      const s = ALLEY_CANDY, [sx, sz] = this.#at(s, -(FRONT - 0.1)), zc = sz, pe = CANAL.z0 < zc ? this.levels.prom1 : this.levels.prom1;
      const promX = canalX(zc) + C.water / 2 + C.wall + C.prom - 0.6;
      const pts: [number, number][] = [[promX, zc], [promX + 10, zc], [(promX + sx) / 2 + 6, zc + 0.8], [this.#at(s, -16)[0], this.#at(s, -16)[1]], [sx, sz]];
      const rec: Vector3[] = [];
      this.#path(pts, 3.4, pe, this.#walkY(s, -1), rec);
      // Die Figur geht von der Straße hinunter: Weg rückwärts.
      this.canalWalk.unshift(...rec.filter((_, i) => i % 5 === 0).reverse().map(v => [v.x, v.z] as [number, number]), [promX - 1.5, zc], [promX - 1.5, BRIDGES[0]!.z]);
      // Buden beidseitig, Boden auf Weghöhe, Front zur Gasse. Erste Fassung: drei Buden an der
      // Nordseite auf Geländehöhe — vom Kanal aus stand eine einzelne Hütte auf 2 m Sockel im Gras.
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1, idx = Math.min(rec.length - 3, Math.max(2, Math.floor(rec.length * (0.28 + Math.floor(i / 2) * 0.17)))), a = rec[idx - 2]!, b = rec[idx + 2]!, c = rec[idx]!;
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * side, nz = dx / l * side;
        const x = c.x + nx * 3.9, z = c.z + nz * 3.9, y = c.y + 0.12, yaw = Math.atan2(-nx, -nz), p = new Parts();
        let lo = Infinity; for (const [u, v] of [[-2.3, -2.1], [2.3, -2.1], [2.3, 2.1], [-2.3, 2.1]] as const) lo = Math.min(lo, this.#ground(x + u * Math.cos(yaw) + v * Math.sin(yaw), z - u * Math.sin(yaw) + v * Math.cos(yaw)));
        const res = machiya(p, { w: 4.6, d: 4.2, role: i === 2 ? 'dango' : i === 5 ? 'sweets' : 'candy', r, lit: 0.85, base: y - lo + 0.4, low: true, street: () => c.y - y });
        place(p, this.#chunk(x, z), x, y, z, yaw);
        this.drive.collision.addOrientedBox(x, z, -yaw, 2.35, 2.15, y - 1, y + res.wallH);
        // Vorplatz der Bude auf Weghöhe, damit Weg und Budenfront bündig sind.
        const L = this.#local(x, z, yaw); this.#rect(L, -2.3, 2.1, 2.3, 2.3 + (3.9 - 2.1 - 1.6), c.y);
        const k = this.#chunk(x, z), q = [L(-2.3, 2.1), L(2.3, 2.1), L(2.3, 2.4), L(-2.3, 2.4)];
        this.#quad(k.mass, [q[0]![0], c.y + 0.004, q[0]![1]], [q[1]![0], c.y + 0.004, q[1]![1]], [q[2]![0], c.y + 0.004, q[2]![1]], [q[3]![0], c.y + 0.004, q[3]![1]], 0x7f796d);
        this.#pools.push([c.x + nx * 1.5, c.y, c.z + nz * 1.5, 2.6]);
      }
      // Lampionschnur quer über die Gasse, das Tor mit Schild an der Straße.
      // Chōchin an einem Draht über der Weghöhe, abwechselnd rot und weiß (erste Fassung:
      // leuchtende Zylinder ohne Deckel und Schrift, im Bild orange Klötze).
      const wire: number[] = [];
      for (let i = 8; i + 4 < rec.length; i += 11) {
        const a = rec[i]!, b = rec[Math.min(rec.length - 1, i + 11)]!, pp = new Parts();
        chochin(pp, 0, 0, 0, tile(i % 22 === 8 ? T.lanternRed : T.lanternWhite), 0.2, 0.52);
        place(pp, this.#chunk(a.x, a.z), a.x, a.y + 3.0, a.z, 0);
        wire.push(a.x, a.y + 3.33, a.z, b.x, b.y + 3.33, b.z);
      }
      { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(wire, 3)); this.#near.add(new LineSegments(g, new LineBasicMaterial({ color: 0x1a1a1a }))); }
      {
        const yaw = faceRoad(s, -1), [gx, gz] = this.#at(s, -(FRONT + 0.4)), y = this.#walkY(s, -1), p = new Parts();
        for (const e of [-1, 1]) p.mass.box(e * 1.6, 1.7, 0, 0.22, 3.4, 0.22, 0x3a2418);
        p.mass.box(0, 3.45, 0, 4.0, 0.22, 0.32, 0x2a1a12);
        p.detail.box(0, 3.0, 0.08, 2.3, 0.62, 0.08, 0x2a1a12); tilePlate(p.sign, tile(T.candyGate), 0, 3.0, 0.13, 2.1, 1.05 * 0.5, 'z', 1);
        place(p, this.#chunk(gx, gz), gx, y, gz, yaw);
        for (const e of [-1, 1]) { const [px, pz] = this.#local(gx, gz, yaw)(e * 1.6, 0); this.drive.collision.addCylinder(px, pz, 0.14, y, y + 3.4); }
      }
    }
    // Wehrgasse: von der Promenade der unteren Haltung hinauf zu Straße B.
    {
      const s = ALLEY_WEIR, [sx, sz] = this.#at(s, -(FRONT - 0.1)), zc = Math.max(C.zWeir + 3.5, sz);
      const promX = canalX(zc) + C.water / 2 + C.wall + C.prom - 0.6;
      const pts: [number, number][] = [[promX, zc], [promX + 12, zc], [this.#at(s, -18)[0], this.#at(s, -18)[1]], [sx, sz]];
      const rec: Vector3[] = [];
      this.#path(pts, 2.2, this.levels.prom2, this.#walkY(s, -1), rec);
      this.weirWalk.unshift(...rec.filter((_, i) => i % 5 === 0).reverse().map(v => [v.x, v.z] as [number, number]), [promX - 1.5, zc]);
      // Handlauf, wo die Treppe steil wird, und eine Jizō-Nische.
      for (let i = 6; i < rec.length; i += 9) { const v = rec[i]!; this.#chunk(v.x, v.z).detail.box(v.x, v.y + 0.5, v.z + 1.2, 0.08, 1.0, 0.08, 0x2a2420); }
      const mid = rec[Math.floor(rec.length * 0.5)]!, p = new Parts(); jizoShelter(p, r); place(p, this.#chunk(mid.x, mid.z - 3.2), mid.x, this.#height(mid.x, mid.z - 3.2), mid.z - 3.4, 0);
      this.drive.collision.addOrientedBox(mid.x, mid.z - 3.4, 0, 2.2, 0.8, mid.y - 1, mid.y + 2.5);
      this.#pools.push([mid.x, mid.y, mid.z, 3]);
    }
  }

  // ── Hinterland ────────────────────────────────────────────────────────────

  #buildHinterland(): void {
    const r = rng(0x417e);
    for (const [x, z, w, d, yaw] of STOREHOUSES) {
      const L = this.#local(x, z, yaw);
      let hi = -Infinity, lo = Infinity; for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 3) for (let v = -d / 2; v <= d / 2 + 0.01; v += d / 3) { const g = this.#ground(...L(u, v)); hi = Math.max(hi, g); lo = Math.min(lo, g); }
      const y = hi + 0.2, p = new Parts(); const res = r() < 0.6 ? whiteKura(p, { w, d, r, gable: r() < 0.5, lit: 0.2, base: y - lo + 0.4, shop: false }) : kuraHouse(p, { w, d, role: 'home', r, lit: 0.2, base: y - lo + 0.4 });
      place(p, this.#chunk(x, z), x, y, z, yaw + Math.PI / 2);
      this.drive.collision.addOrientedBox(x, z, -(yaw + Math.PI / 2), w / 2 + 0.05, d / 2 + 0.05, y - 1, y + res.wallH);
    }
    for (const [x, z, w, d] of GARDENS) {
      const k = this.#chunk(x, z), y = this.#ground(x, z);
      // Erde als Reihen über dem Gelände — ein Kasten auf der Mittelhöhe schwebte über den Buckeln.
      for (let u = -w / 2 + 0.45; u < w / 2; u += 0.9) for (let v = -d / 2; v < d / 2 - 0.01; v += 1) { const g0 = this.#ground(x + u, z + v), g1 = this.#ground(x + u, z + v + 1); k.mass.box(x + u, (g0 + g1) / 2 + 0.05, z + v + 0.5, 0.55, 0.2, 1.02, 0x4a3a2a, Math.atan2(g0 - g1, 1)); }
      void y;
      for (let u = -w / 2 + 0.5; u < w / 2; u += 0.9) for (let v = -d / 2 + 0.4; v < d / 2 - 0.2; v += 0.5) {
        const g = this.#ground(x + u, z + v);
        k.detail.add(new IcosahedronGeometry(0.16 + r() * 0.08, 0), jitter([0x4a6a2e, 0x5a7a34, 0x6a7a3a][Math.floor(r() * 3)]!, r, 0.1), x + u, g + 0.3, z + v);
      }
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1]] as const) {
        const x0 = x + ax * w / 2, z0 = z + az * d / 2, x1 = x + bx * w / 2, z1 = z + bz * d / 2, len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), gy = this.#ground((x0 + x1) / 2, (z0 + z1) / 2);
        k.detail.box((x0 + x1) / 2, gy + 0.45, (z0 + z1) / 2, 0.04, 0.9, len, 0x9a8a52, 0, yaw);
      }
    }
    // Bäume im Hinterland: Kiefern in den Gärten, Kaki, ein zweiter Ginkgo, Bambus am Hang.
    for (const [x, z, sc] of [[-237, 128, 0.9], [-214, 124, 1.0], [-236, 206, 0.85], [-213, 232, 1.0], [-226, 160, 0.9]] as const) {
      const y = this.#ground(x, z), k = this.#chunk(x, z); niwaki(k.mass, k.detail, x, y - 0.05, z, sc, r); this.drive.collision.addCylinder(x, z, 0.2, y, y + 2.5);
    }
    for (const [x, z, sc] of [[-240, 199, 0.9], [-208, 238, 1.0], [-166, 140, 0.9], [-167, 200, 0.95]] as const) {
      const y = this.#ground(x, z); kaki(this.#chunk(x, z), x, y - 0.05, z, sc, r); this.drive.collision.addCylinder(x, z, 0.25, y, y + 3);
    }
    for (const [x, z, n] of [[-158, 178, 16], [-160, 225, 14], [-150, 240, 12]] as const) bamboo(this.#chunk(x, z), x, this.#ground(x, z) - 0.1, z, n, r);
    this.#ginkgo(-238, this.#ground(-238, 176), 176, 0.95, r);
  }

  // ── Straßenmöbel ─────────────────────────────────────────────────────────

  #buildStreetFurniture(): void {
    const r = this.#r;
    // Gusseiserne Laternen, abwechselnd, nicht vor Türen.
    let side: 1 | -1 = 1;
    for (let s = KOEDO.s0 + 6; s < S_END - 3; s += 16) {
      side = side > 0 ? -1 : 1;
      if (side > 0 && s > PLAZA.s0 - 2 && s < PLAZA.s1 + 2) continue;
      if (this.#doors.some(d => d.side === side && Math.abs(d.s - s) < 1.6)) s += 2;
      const [x, z] = this.#at(s, side * (curbO(s) + 0.35)), y = this.#walkY(s, side);
      lampPost(this.#chunk(x, z), x, y, z);
      this.drive.collision.addCylinder(x, z, 0.14, y, y + 4);
      this.#lamps.push({ s, side });
    }
    // Poller am Platzrand und an der Mündung der Terrace Track.
    for (let s = PLAZA.s0 + 3; s < PLAZA.s1 - 2; s += 3.5) { const [x, z] = this.#at(s, curbO(s) + 1.1), y = this.#plazaY; this.#chunk(x, z).detail.add(new CylinderGeometry(0.12, 0.14, 0.8, 8), 0x2a2a2a, x, y + 0.4, z); this.drive.collision.addCylinder(x, z, 0.14, y, y + 0.8); }
    // Hortensien in den Fugen zwischen den Häusern.
    for (const sd of [1, -1] as const) {
      const row = HOUSES.filter(h => h.side === sd).sort((a, b) => a.s - b.s);
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1]!, b = row[i]!, gap = (b.s - b.w / 2) - (a.s + a.w / 2);
        if (gap < 0.6 || gap > 3) continue;
        const s = (a.s + a.w / 2 + b.s - b.w / 2) / 2, [x, z] = this.#at(s, sd * (FRONT + 0.4)), k = this.#chunk(x, z);
        hydrangea(k.mass, k.detail, x, this.#walkY(s, sd), z, r);
      }
    }
    // Bank und Wasserbecken an der Einmündung der Terrace Track (Innenseite der Biegung).
    { const s = 700, [x, z] = this.#at(s, -(FRONT - 0.6)), y = this.#walkY(s, -1), p = new Parts(); bench(p, 0, 0, 0, 'x', true); place(p, this.#chunk(x, z), x, y, z, faceRoad(s, -1)); }
    // Tafeln: Info am Ortseingang, Bushaltestelle.
    this.#board(KOEDO.s0 + 3, -(FRONT - 0.4), tile(T.info), 2.0, 1.0, -1);
  }

  // ── Hikawa-Schrein am Südende ─────────────────────────────────────────────

  #buildShrine(): void {
    const r = rng(0x51e1), s = S_END, f = frame(s), y = this.#road(s) + CURB, yaw = Math.atan2(-f.tx, -f.tz), L = this.#local(f.x, f.z, yaw);
    // Vorplatz auf Straßenhöhe, 12 × 14 m, mit Mauer; das Torii an der Straße.
    const x0 = -6, x1 = 6, v1 = -1, v0 = -15;
    this.#rect(L, x0, v0, x1, v1, y);
    const k = this.#chunk(...L(0, -8));
    const c = [L(x0, v1), L(x1, v1), L(x1, v0), L(x0, v0)];
    this.#quad(k.mass, [c[0]![0], y, c[0]![1]], [c[1]![0], y, c[1]![1]], [c[2]![0], y, c[2]![1]], [c[3]![0], y, c[3]![1]], 0x8e8778);
    for (const [a, b] of [[c[1]!, c[2]!], [c[2]!, c[3]!], [c[3]!, c[0]!]] as const) { const g = Math.min(this.#ground(...a), this.#ground(...b)); if (y - g > 0.3) this.#wall(a[0], a[1], b[0], b[1], g - 0.4, y - 0.02, 1, r); }
    const tp = new Parts(); torii(tp, 4.2, 5.2, 0x5a3e2a); const [tx, tz] = L(0, -1.6); place(tp, this.#chunk(tx, tz), tx, y, tz, yaw);
    for (const e of [-1, 1]) { const [px, pz] = L(e * 2.1, -1.6); this.drive.collision.addCylinder(px, pz, 0.3, y, y + 5); }
    // Halle (Haiden): Holz, Gitterfront mit Licht, geschwungenes Dach.
    const hp = new Parts(), hw = 3.2, hd = 2.6;
    hp.mass.box(0, 0.35, 0, 2 * hw + 0.4, 0.7, 2 * hd + 0.4, 0x7a766d);
    hp.mass.box(0, 0.7 + 1.5, 0, 2 * hw, 3.0, 2 * hd, 0x5a3e2a);
    tilePlate(hp.signGlow, tile(T.shojiWarm), 0, 1.9, hd + 0.02, 3.2, 1.9, 'z', 1);
    for (let u = -1.55; u <= 1.56; u += 0.13) plate(hp.detail, u, 1.9, hd + 0.06, 0.045, 1.9, 'z', 1, 0x2a1a12);
    for (const e of [-1, 1]) hp.detail.box(e * hw, 2.2, hd + 0.06, 0.24, 3.0, 0.24, 0x3a2418);
    hp.detail.add(new CylinderGeometry(0.1, 0.1, 3.4, 8), 0xc9b27a, 0, 3.0, hd + 0.35, 0, 0, Math.PI / 2);
    for (const x of [-1, 0, 1]) for (let q = 0; q < 3; q++) hp.detail.box(x, 2.85 - q * 0.09, hd + 0.4, 0.11 - q * 0.02, 0.08, 0.01, 0xf4f2ea, 0, 0, (q % 2 ? 1 : -1) * 0.4);
    hp.detail.box(0, 0.95, hd + 0.9, 1.2, 0.7, 0.6, 0x4a3020);
    tilePlate(hp.sign, tile(T.ema), 2.3, 1.4, hd + 0.9, 1.4, 0.7, 'z', 1);
    const tmp = new Parts(); kuraRoof(tmp, { x0: -hw, x1: hw, zA: -hd, zB: hd, y: 3.7, pitch: 0.62, eaveA: 0.9, eaveB: 1.4, over: 0.8, color: 0x4f6a5a, r, plaster: null, tsuma: 0x5a3e2a, oni: 0.7, ridge: 0.5 }); place(tmp, hp, 0, 0, 0, 0);
    const [hx, hz] = L(0, -11);
    place(hp, this.#chunk(hx, hz), hx, y, hz, yaw);
    this.drive.collision.addOrientedBox(hx, hz, -yaw, hw + 0.2, hd + 0.2, y, y + 4);
    for (const e of [-1, 1]) { const [lx, lz] = L(e * 3.4, -6.5), lp = new Parts(); kasugaLantern(lp, 0, 0, 0, r); place(lp, this.#chunk(lx, lz), lx, y, lz, 0); this.drive.collision.addCylinder(lx, lz, 0.35, y, y + 2.1); }
    // Komainu: zwei Wächterlöwen auf Sockeln.
    for (const e of [-1, 1]) { const [lx, lz] = L(e * 1.8, -8.5), kk = this.#chunk(lx, lz); kk.detail.box(lx, y + 0.45, lz, 0.7, 0.9, 0.9, 0x8a867c); kk.detail.add(new IcosahedronGeometry(0.34, 1), 0x7a766d, lx, y + 1.2, lz); kk.detail.add(new IcosahedronGeometry(0.24, 1), 0x7a766d, lx, y + 1.62, lz); this.drive.collision.addCylinder(lx, lz, 0.5, y, y + 1.8); }
    // Heiliger Baum (Kusunoki) mit Seil, und der zweite Ginkgo.
    { const [bx, bz] = L(4.8, -13), kk = this.#chunk(bx, bz), H = 6; kk.mass.add(new CylinderGeometry(0.45, 0.8, H, 8), 0x4a3c2e, bx, y + H / 2, bz); for (let i = 0; i < 14; i++) { const a = i * 2.2, rr = 1.5 + r() * 2.6, g = new IcosahedronGeometry(1, 0); g.scale(2.0 + r(), 1.3 + r() * 0.5, 2.0 + r()); kk.mass.add(g, jitter([0x2e4a28, 0x3a5a2e, 0x345224][i % 3]!, r, 0.08), bx + Math.cos(a) * rr, y + H + r() * 2.5, bz + Math.sin(a) * rr); } kk.detail.add(new CylinderGeometry(0.85, 0.85, 0.12, 12), 0xc9b27a, bx, y + 1.6, bz); this.drive.collision.addCylinder(bx, bz, 0.8, y, y + 6); }
    { const [gx, gz] = L(-4.8, -3.5); this.#ginkgo(gx, y, gz, 1.0, r); }
    const [px, pz] = L(0, -5); this.#pools.push([px, y, pz, 4]);
  }

  // ── Zufahrt durch die Reisfelder ──────────────────────────────────────────

  /**
   * Die 130 m vor dem Ort auf der Dorfstraße. Vorher lag hier nur der Damm. Jetzt:
   * Leitungsmasten (im Ort sind die Leitungen wie in Kawagoe unter der Erde), ein
   * Inari-Schrein mit roten Torii, Jizō, Wegweiser, Bushaltestelle mit Automaten,
   * Steinlaternen und ein Ortsschild am Eingang.
   */
  #buildApproach(): void {
    const r = rng(0xa9a0);
    const wires: number[] = [];
    let prev: Vector3 | null = null;
    for (let s = 452; s < KOEDO.s0 + 2; s += 28) {
      const [x, z] = this.#at(s, 5.4), y = Math.max(this.#ground(x, z), this.#road(s) - 0.4), k = this.#chunk(x, z);
      k.mass.add(new CylinderGeometry(0.12, 0.17, 9.4, 6), 0x7a746a, x, y + 4.7, z);
      k.detail.box(x, y + 8.6, z, 1.5, 0.1, 0.1, 0x55504a, 0, Math.atan2(frame(s).nx, frame(s).nz));
      if (r() < 0.5) k.detail.add(new CylinderGeometry(0.28, 0.28, 0.85, 8), 0x9ea3a3, x + 0.3, y + 7.4, z);
      this.drive.collision.addCylinder(x, z, 0.18, y, y + 8);
      const cur = new Vector3(x, y + 8.6, z);
      if (prev) for (const off of [-0.6, 0, 0.6]) for (let q = 0; q < 8; q++) {
        const t0 = q / 8, t1 = (q + 1) / 8, sag = (u: number): number => -Math.sin(u * Math.PI) * 0.6, f = frame(s);
        wires.push(prev.x + (cur.x - prev.x) * t0 + f.nx * off, prev.y + (cur.y - prev.y) * t0 + sag(t0), prev.z + (cur.z - prev.z) * t0 + f.nz * off,
          prev.x + (cur.x - prev.x) * t1 + f.nx * off, prev.y + (cur.y - prev.y) * t1 + sag(t1), prev.z + (cur.z - prev.z) * t1 + f.nz * off);
      }
      prev = cur;
    }
    // Leitung zum Hang und zur Stadt: vom letzten Mast über die Häuserrücken zu den modernen Häusern.
    for (const [x, z] of [[-196, 34], [-170, 70], [-140, 96], [-132, 140], [-128, 180], [-122, 222]] as const) {
      const y = this.#ground(x, z), k = this.#chunk(x, z);
      k.mass.add(new CylinderGeometry(0.12, 0.17, 9.4, 6), 0x7a746a, x, y + 4.7, z);
      k.detail.box(x, y + 8.6, z, 1.5, 0.1, 0.1, 0x55504a);
      this.drive.collision.addCylinder(x, z, 0.18, y, y + 8);
      const cur = new Vector3(x, y + 8.6, z);
      if (prev) for (const off of [-0.6, 0.6]) for (let q = 0; q < 10; q++) {
        const t0 = q / 10, t1 = (q + 1) / 10, sag = (u: number): number => -Math.sin(u * Math.PI) * 0.9;
        wires.push(prev.x + (cur.x - prev.x) * t0 + off, prev.y + (cur.y - prev.y) * t0 + sag(t0), prev.z + (cur.z - prev.z) * t0, prev.x + (cur.x - prev.x) * t1 + off, prev.y + (cur.y - prev.y) * t1 + sag(t1), prev.z + (cur.z - prev.z) * t1);
      }
      prev = cur;
    }
    if (wires.length) { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(wires, 3)); const l = new LineSegments(g, new LineBasicMaterial({ color: 0x1a1d20 })); l.name = 'Koedo Leitungen'; this.#near.add(l); }
    // Inari-Schrein: Gang aus roten Torii zu einem kleinen Schrein mit zwei Füchsen.
    {
      const s = 522, o = 12, [x, z] = this.#at(s, o), yaw = faceRoad(s, 1), L = this.#local(x, z, yaw), y = this.#ground(x, z) + 0.2;
      this.#rect(L, -1.2, -9, 1.2, 4, y);
      const k = this.#chunk(x, z);
      const c = [L(-1.3, 4), L(1.3, 4), L(1.3, -9), L(-1.3, -9)];
      this.#quad(k.mass, [c[0]![0], y, c[0]![1]], [c[1]![0], y, c[1]![1]], [c[2]![0], y, c[2]![1]], [c[3]![0], y, c[3]![1]], 0x8e8778);
      for (let i = 0; i < 7; i++) {
        const p = new Parts(), v = 3 - i * 1.2;
        for (const e of [-1, 1]) p.mass.add(new CylinderGeometry(0.1, 0.12, 2.4, 8), 0xd8401e, e * 0.95, 1.2, 0);
        p.mass.box(0, 2.45, 0, 2.6, 0.16, 0.26, 0x1c1814); p.detail.box(0, 2.1, 0, 2.1, 0.12, 0.14, 0xd8401e);
        const [px, pz] = L(0, v); place(p, k, px, y, pz, yaw);
        for (const e of [-1, 1]) { const [cx, cz] = L(e * 0.95, v); this.drive.collision.addCylinder(cx, cz, 0.12, y, y + 2.4); }
      }
      const sp = new Parts();
      sp.mass.box(0, 0.4, 0, 1.8, 0.8, 1.4, 0x7a766d); sp.mass.box(0, 1.2, 0, 1.0, 0.8, 0.8, 0xc8401e);
      const tmp = new Parts(); kuraRoof(tmp, { x0: -0.6, x1: 0.6, zA: -0.5, zB: 0.5, y: 1.62, pitch: 0.6, eaveA: 0.3, eaveB: 0.4, over: 0.2, color: KAWARA, r, plaster: null, tsuma: 0xc8401e, oni: 0, ridge: 0.3 }); place(tmp, sp, 0, 0, 0, 0);
      for (const e of [-1, 1]) { sp.detail.box(e * 0.75, 0.95, 0.9, 0.3, 0.3, 0.3, 0x8a867c); sp.detail.box(e * 0.75, 1.3, 0.9, 0.18, 0.4, 0.26, 0xefeae0); sp.detail.box(e * 0.75, 1.3, 1.02, 0.14, 0.06, 0.02, 0xc8401e); }
      const [sx, sz] = L(0, -8); place(sp, k, sx, y, sz, yaw);
      this.drive.collision.addOrientedBox(sx, sz, -yaw, 0.9, 0.7, y, y + 2);
    }
    // Jizō am Feldrand, Wegweiser, Bushaltestelle mit Automaten, Steinlaternen am Eingang.
    { const s = 498, [x, z] = this.#at(s, -6.4), p = new Parts(); jizoShelter(p, r); place(p, this.#chunk(x, z), x, this.#road(s) - 0.1, z, faceRoad(s, -1)); this.drive.collision.addOrientedBox(x, z, -faceRoad(s, -1), 2.2, 0.8, this.#road(s) - 0.5, this.#road(s) + 2.5); }
    for (const [s, side] of [[546, 1], [604, -1]] as const) {
      const [x, z] = this.#at(s, side * 4.6), y = this.#height(x, z), p = new Parts(), yaw = faceRoad(s, side) + side * Math.PI / 2 * 0.8;
      p.detail.box(0, 1.3, 0, 0.12, 2.6, 0.12, 0x3a2c20);
      const tt = tile(T.signpost);
      for (const [yy, half] of [[2.2, 0], [1.75, 1]] as const) {
        const t2 = [tt[0], tt[1] + (tt[3] - tt[1]) * (half ? 0 : 0.5), tt[2], tt[1] + (tt[3] - tt[1]) * (half ? 0.5 : 1)] as unknown as Tile;
        tilePlate(p.sign, t2, 0, yy, 0.08, 1.3, 0.34, 'z', 1); tilePlate(p.sign, t2, 0, yy, -0.08, 1.3, 0.34, 'z', -1); p.detail.box(0, yy, 0, 1.28, 0.32, 0.12, 0x5a4430);
      }
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addCylinder(x, z, 0.12, y, y + 2.6);
    }
    {
      const s = KOEDO.s0 - 14, [x, z] = this.#at(s, 5.0), y = this.#height(x, z), yaw = faceRoad(s, 1), p = new Parts();
      p.detail.add(new CylinderGeometry(0.04, 0.04, 2.4, 6), 0xb8bcbc, -1.6, 1.2, 0);
      tilePlate(p.sign, tile(T.busStop, 0, 0, 128, 128), -1.6, 2.2, 0.03, 0.62, 0.62, 'z', 1);
      p.mass.box(0.4, 1.2, -0.7, 2.6, 2.4, 0.08, 0xc8ccc8); p.mass.box(0.4, 2.45, -0.2, 2.8, 0.08, 1.2, 0x8a9094);
      bench(p, 0.4, 0, -0.3, 'x', false);
      for (let i = 0; i < 2; i++) { p.mass.box(2.6 + i * 1.05, 0.92, -0.2, 0.98, 1.84, 0.8, i ? 0xe8e8e2 : 0xc8201c); tilePlate(p.signGlow, tile(T.vend), 2.6 + i * 1.05, 1.15, 0.21, 0.88, 1.3, 'z', 1); }
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(...this.#local(x, z, yaw)(1.3, -0.3), -yaw, 2.6, 0.6, y, y + 2.5);
      { const [px, pz] = this.#local(x, z, yaw)(3.1, 0.9); this.#pools.push([px, y, pz, 3]); }
    }
    for (const side of [1, -1] as const) {
      const s = KOEDO.s0 - 3, [x, z] = this.#at(s, side * 4.8), y = this.#height(x, z), p = new Parts();
      kasugaLantern(p, 0, 0, 0, r); p.mass.box(0, -0.3, 0, 0.9, 0.7, 0.9, 0x7a766d);
      place(p, this.#chunk(x, z), x, y + 0.05, z, 0);
      this.drive.collision.addCylinder(x, z, 0.4, y, y + 2);
      this.#lamps.push({ s, side });
    }
    { const s = KOEDO.s0 - 8, [x, z] = this.#at(s, -5.6); this.#sign(x, this.#height(x, z) + 2.7, z, faceRoad(s, -1) - Math.PI / 2 * 0.45, '小江戸', 'Koedo', 'KURA MERCHANT TOWN · CANAL QUARTER', 3.6); }
    // Reisstrohhaufen und ein paar Kaki an der Zufahrt.
    for (const [s, o] of [[470, 14], [488, -15], [512, -13]] as const) {
      const [x, z] = this.#at(s, o), y = this.#ground(x, z), k = this.#chunk(x, z);
      k.mass.add(new ConeGeometry(1.1, 1.9, 9), 0xb09a5c, x, y + 0.95, z); k.detail.add(new CylinderGeometry(1.0, 1.05, 0.5, 9), 0x9a8450, x, y + 0.25, z);
    }
    for (const [s, o, sc] of [[536, 9, 0.9], [556, -10, 1.0]] as const) { const [x, z] = this.#at(s, o), y = this.#ground(x, z); kaki(this.#chunk(x, z), x, y - 0.05, z, sc, r); this.drive.collision.addCylinder(x, z, 0.25, y, y + 3); }
  }

  /** Großes Holzschild mit eigener Leinwand (wie Kiso-Juku), beidseitig. */
  #sign(x: number, y: number, z: number, yaw: number, kanji: string, title: string, sub: string, width: number): void {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 172;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#1c1816'; c.fillRect(0, 0, 512, 172);
    for (let i = 0; i < 30; i++) { c.strokeStyle = `rgba(0,0,0,${0.08 + (i % 4) * 0.03})`; c.beginPath(); c.moveTo(0, i * 6); c.bezierCurveTo(170, i * 6 + 4, 340, i * 6 - 4, 512, i * 6 + 2); c.stroke(); }
    c.strokeStyle = '#c9a85a'; c.lineWidth = 4; c.strokeRect(9, 9, 494, 154);
    c.fillStyle = '#e8c47a'; c.textAlign = 'left';
    c.font = '600 86px "Yu Mincho", "Hiragino Mincho ProN", serif'; c.fillText(kanji, 22, 118);
    c.textAlign = 'right'; c.font = '600 46px Georgia, serif'; c.fillStyle = '#f3e6c8'; c.fillText(title, 490, 84);
    c.font = '17px system-ui, sans-serif'; c.fillStyle = '#d7c49c'; c.fillText(sub, 490, 122);
    const tex = new CanvasTexture(canvas); tex.anisotropy = 4; tex.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: tex });
    for (const side of [0, Math.PI]) {
      const mesh = new Mesh(new PlaneGeometry(width, width / 3), material);
      mesh.position.set(x + Math.sin(yaw + side) * 0.04, y, z + Math.cos(yaw + side) * 0.04); mesh.rotation.y = yaw + side; mesh.name = 'Koedo Ortsschild';
      this.group.add(mesh);
    }
    const k = this.#chunk(x, z);
    k.detail.box(x, y, z, width + 0.16, width / 3 + 0.16, 0.05, 0x1e1813, 0, yaw);
    k.detail.box(x, y + width / 6 + 0.16, z, width + 0.5, 0.12, 0.35, KAWARA, 0, yaw);
    for (const e of [-1, 1]) {
      const px = x + Math.cos(yaw) * e * width * 0.4, pz = z - Math.sin(yaw) * e * width * 0.4, g = this.#height(px, pz);
      k.detail.box(px, (g + y) / 2, pz, 0.14, Math.max(0.1, y - g), 0.14, 0x1e1813);
      this.drive.collision.addCylinder(px, pz, 0.12, g, y);
    }
  }

  // ── Ortsrand zur Stadt ─────────────────────────────────────────────────

  /**
   * Östlich der Hauptstraße steigt der Hang zur Tokioter Vorstadt. Hier wird Koedo
   * modern: Wohnhäuser mit Faserzement, ein Konbini mit Parkplatz, Leitungen. Das
   * ist der Übergang, den man sehen soll — Reisfeld, Kanal, Kura, Beton, Stadt.
   */
  #buildEdge(): void {
    const r = rng(0xed6e);
    for (const [x, z, w, d, fl, yaw] of MODERN) {
      const L = this.#local(x, z, yaw);
      let hi = -Infinity, lo = Infinity; for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 3) for (let v = -d / 2; v <= d / 2 + 0.01; v += d / 3) { const g = this.#ground(...L(u, v)); hi = Math.max(hi, g); lo = Math.min(lo, g); }
      const y = hi + 0.15, p = new Parts(), res = modernHouse(p, w, d, fl, r);
      p.mass.box(0, -(y - lo) / 2 - 0.3, 0, w + 0.2, y - lo + 0.1, d + 0.2, 0x8a877e);
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(x, z, -yaw, w / 2 + 0.05, d / 2 + 0.05, y - 1, y + res.wallH);
      // Kei-Car vor dem Haus.
      if (r() < 0.6) { const [cx, cz] = L(w / 2 - 1.5, d / 2 + 2.5), cy = this.#ground(cx, cz), cp = new Parts(); cp.mass.box(0, 0.85, 0, 1.46, 1.1, 3.3, [0xeeeeea, 0x9aa8b8, 0x3a3a3a][Math.floor(r() * 3)]!); cp.glass.box(0, 1.2, 1.2, 1.3, 0.45, 0.6, 0x2f3d45); for (const e of [-1, 1]) for (const zz of [1.05, -1.05]) cp.detail.add(new CylinderGeometry(0.27, 0.27, 0.2, 10), 0x1a1a1a, e * 0.66, 0.27, zz, 0, 0, Math.PI / 2); place(cp, this.#chunk(cx, cz), cx, cy, cz, yaw + 0.1); this.drive.collision.addOrientedBox(cx, cz, -(yaw + 0.1), 0.75, 1.7, cy, cy + 1.6); }
    }
    // Konbini mit Parkplatz, zum Platz hin — nachts das hellste Haus am Ort.
    {
      const x = -140, z = 120, yaw = -Math.PI / 2 - 0.08, L = this.#local(x, z, yaw), w = 13, d = 10;
      let hi = -Infinity; for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 3) for (let v = -d / 2 - 7; v <= d / 2 + 0.01; v += 2) hi = Math.max(hi, this.#ground(...L(u, v)));
      const y = hi + 0.12, p = new Parts();
      p.mass.box(0, 1.8, 0, w, 3.6, d, 0xefefea);
      p.mass.box(0, 3.9, 0, w + 0.4, 0.6, d + 0.4, 0xe4e4de);
      tilePlate(p.signGlow, tile(T.konbini), 0, 3.35, d / 2 + 0.05, 5.0, 0.9, 'z', 1);
      tilePlate(p.signGlow, tile(T.inShop), 0, 1.4, d / 2 + 0.02, w - 1.4, 2.4, 'z', 1);
      p.glass.box(0, 1.4, d / 2 + 0.05, w - 1.2, 2.5, 0.02, 0x9ab0b8);
      p.mass.box(0, -1.0, 0, w + 0.4, 2.0, d + 0.4, 0x8a877e);
      // Parkplatz davor (Asphalt mit weißen Linien).
      p.mass.box(0, -0.05, d / 2 + 4, w + 2, 0.1, 8, 0x3a3a3c);
      for (let u = -w / 2; u <= w / 2 + 0.01; u += 2.6) p.detail.box(u, 0.005, d / 2 + 4.5, 0.1, 0.01, 5, 0xe8e8e4);
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.#rect(L, -w / 2 - 1, d / 2, w / 2 + 1, d / 2 + 8, y + 0.0);
      this.drive.collision.addOrientedBox(x, z, -yaw, w / 2 + 0.05, d / 2 + 0.05, y - 1, y + 4);
      const [px, pz] = L(0, d / 2 + 3); this.#pools.push([px, y, pz, 7]);
    }
  }

  // ── Licht auf dem Pflaster (wie Kiso-Juku) ─────────────────────────────────

  #buildLightPools(): void {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgb(255,255,255)'); grad.addColorStop(0.35, 'rgb(150,150,150)'); grad.addColorStop(0.7, 'rgb(40,40,40)'); grad.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new CanvasTexture(c);
    const mat = new MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const kit = new SettlementKit(true);
    const pool = (s: number, o: number, y: number, len: number, wid: number, tilt: number, color: number): void => {
      const f = frame(s), [x, z] = this.#at(s, o);
      kit.add(new PlaneGeometry(wid, len), color, x, y + 0.02, z, -Math.PI / 2 + tilt, Math.atan2(f.tx, f.tz));
    };
    const walkPool = (s: number, side: 1 | -1, len: number, color: number): void => {
      const tilt = Math.atan2(this.#walkY(s - 1, side) - this.#walkY(s + 1, side), 2);
      pool(s, side * (curbO(s) + FRONT) / 2, this.#walkY(s, side), len, FRONT - curbO(s) - 0.05, tilt, color);
    };
    const roadPool = (s: number, side: 1 | -1, len: number, color: number): void => pool(s, side * 1.8, this.#road(s) + 0.015, len, 2.4, Math.atan2(this.#road(s - 1) - this.#road(s + 1), 2), color);
    for (const l of this.#lamps) { walkPool(l.s, l.side, 3.6, 0x6a4a28); roadPool(l.s, l.side, 3.2, 0x3a2814); }
    for (const d of this.#doors) if (d.lit) { walkPool(d.s, d.side, 2.6, 0x5a3c1e); roadPool(d.s, d.side, 2.2, 0x1e140a); }
    for (const [x, y, z, size] of this.#pools) if (size) kit.add(new PlaneGeometry(size, size), 0x5a3e20, x, y + 0.02, z, -Math.PI / 2, 0, 0);
    const m = new Mesh(kit.geometry(), mat); m.name = 'Koedo Lichtflecken'; m.renderOrder = 2; this.#near.add(m);
  }

  #buildLife(): void {
    // Keine Figuren (Auftrag 2026-09-26) — Rauch aus Aalgrill, Brauerei und Herden.
    this.#life = new FunauraLife(
      (x, z) => this.#height(x, z),
      { solid: this.#solid, boat: this.#solid, glow: this.#glow, sign: this.#signMat!, cloth: this.#cloth },
      [], this.#smoke, { boats: false, name: 'Koedo smoke', smokeRise: 9 },
    );
    this.group.add(this.#life.group);
    this.#life.update(0);
  }

  // ── Zusammenbau ──────────────────────────────────────────────────────────

  #finishChunks(): void {
    let triangles = 0;
    const white = tile(T.white, 100, 40, 104, 44);
    if (this.#streams.parts.length) { const m = new Mesh(this.#streams.geometry(), this.#streamMat!); m.name = 'Koedo Wehr'; this.#near.add(m); }
    for (const c of this.#chunks.values()) {
      const make = (k: SettlementKit, mat: MeshStandardMaterial | MeshBasicMaterial, name: string): Mesh | null => {
        if (!k.parts.length) return null;
        const mesh = new Mesh(k.geometry(), mat); mesh.name = name; mesh.receiveShadow = true;
        triangles += mesh.geometry.getAttribute('position').count / 3;
        mesh.geometry.computeBoundingBox(); c.box.union(mesh.geometry.boundingBox!);
        this.group.add(mesh); return mesh;
      };
      // Stroh gibt es in Koedo nicht; falls doch etwas dort landet, gehört es zur Masse.
      c.parts.mass.parts.push(...c.parts.thatch.parts); c.parts.thatch.parts.length = 0;
      c.mass = make(c.parts.mass, this.#solid, `Koedo mass ${c.x},${c.z}`);
      c.fine = make(c.parts.fine, this.#solid, `Koedo fine ${c.x},${c.z}`);
      if (c.mass) c.mass.castShadow = true;
      for (const part of c.parts.glow.parts) {
        const n = part.getAttribute('position').count, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = white[0]; uv[i * 2 + 1] = white[1]; }
        part.setAttribute('uv', new Float32BufferAttribute(uv, 2)); c.parts.signGlow.parts.push(part);
      }
      c.parts.glow.parts.length = 0;
      for (const [k, m, n] of [[c.parts.detail, this.#solid, 'detail'], [c.parts.glass, this.#glass, 'glass'], [c.parts.cloth, this.#cloth, 'cloth'],
        [c.parts.sign, this.#signMat!, 'sign'], [c.parts.signGlow, this.#signGlow!, 'glow'], [c.parts.interior, this.#interiorMat, 'interior'],
        [c.parts.interiorTex, this.#interiorTex!, 'interior-tex'], [c.parts.gloss, this.#glossMat, 'gloss'], [c.parts.namako, this.#namakoMat, 'namako']] as const) {
        const mesh = make(k, m, `Koedo ${n} ${c.x},${c.z}`);
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
      brewery: 'Izumiya, brewing since 1789. The cedar ball over the door turns brown as the new sake matures — when it is green, the sake is young.',
      tanks: 'Each tank holds 3,600 litres. In winter the brewers sleep here; the moromi is stirred by hand at four in the morning.',
      tower: 'Toki no Kane — the bell of time. It rang the hours for the merchants of Koedo, and it still rings four times a day.',
      canal: 'The canal carried rice and sake to the river boats. The willows keep the stone walls cool in summer.',
      bridge: 'Nakabashi: granite from the hills, laid without mortar. The arch is high enough for a laden boat and its pole.',
      candy: 'Kashiya Yokochō — candy alley. Sweet-potato sticks, black-sugar twists, and the smell of roasted soy.',
      boat: 'A stake boat. The boatman poles along the canal; the passengers sit on red cushions under straw hats.',
      shrine: 'Hikawa shrine, guardian of the town. Couples tie their wishes to the sacred tree.',
      museum: 'The kura were built fireproof after the great fire of 1893: walls of clay a foot thick, shutters that close like a vault.',
      eel: 'Unagi grilled over charcoal and brushed with a sauce that has never been thrown away — only topped up, for two hundred years.',
      weir: 'The weir lifts the upper canal above the rice fields. From here the water runs out to the paddies.',
    };
    this.#message = text[this.#spot]; this.#messageUntil = this.#time + 9;
  }

  update(dt: number): void {
    this.#time += dt;
    const camera = this.#context!.camera, cx = camera.position.x, cz = camera.position.z;
    const distance = Math.hypot(cx - KOEDO.x, cz - KOEDO.z);
    this.group.visible = distance < MASS_RANGE + 250;
    if (!this.group.visible) { this.panel.hidden = true; return; }
    for (const c of this.#chunks.values()) {
      const d = Math.hypot(Math.max(c.box.min.x - cx, 0, cx - c.box.max.x), Math.max(c.box.min.z - cz, 0, cz - c.box.max.z));
      if (c.mass) c.mass.visible = d < MASS_RANGE;
      for (const m of c.near) m.visible = d < this.#range;
      if (c.fine) c.fine.visible = this.#fineRange > 0 && d < this.#fineRange;
    }
    this.#near.visible = distance < this.#range + 200;
    this.#timeU.value = this.#time;
    if (this.#life) this.#life.group.visible = this.#near.visible;
    if (this.#near.visible) {
      this.#life?.update(this.#time);
      if (this.#rippleTex) this.#rippleTex.offset.y = (this.#rippleTex.offset.y - dt * 0.05) % 1;
      this.#boat.position.y = this.levels.water1 - 0.12 + Math.sin(this.#time * 1.3) * 0.025;
      this.#boat.rotation.z = Math.sin(this.#time * 0.9) * 0.02;
    }
    const p = this.drive.walking ? this.drive.walker.position : this.drive.vehicle.position;
    const near = Math.hypot(p.x - KOEDO.x, p.z - KOEDO.z) < 200;
    this.panel.hidden = !this.isPlaying() || !near;
    if (this.panel.hidden) return;
    this.#spot = '';
    if (this.drive.walking) {
      const spots: [Spot, number, number, number][] = [];
      const bp = this.breweryPath; if (bp.length > 5) { spots.push(['brewery', ...bp[0]!, 3.5], ['tanks', ...bp[bp.length - 1]!, 4]); }
      if (this.towerPoint) spots.push(['tower', this.towerPoint.x, this.towerPoint.z, 4]);
      const bz = BRIDGES[0]!.z; spots.push(['bridge', canalX(bz), bz, 3], ['boat', canalX(LANDING.z) + 4, LANDING.z, 3], ['weir', canalX(CANAL.zWeir) + 6, CANAL.zWeir, 3.5]);
      spots.push(['canal', canalX(180) + 7, 180, 4]);
      { const [x, z] = this.#at(ALLEY_CANDY, -(FRONT + 1)); spots.push(['candy', x, z, 3.5]); }
      { const [x, z] = this.#at(SHRINE.s + 6, 0); spots.push(['shrine', x, z, 4]); }
      for (const h of HOUSES) if (h.role === 'museum' || h.role === 'eel') { const [x, z] = this.#at(h.s, h.side * (FRONT - 0.6)); spots.push([h.role, x, z, 2.5]); }
      for (const [id, x, z, rr] of spots) if (Math.hypot(p.x - x, p.z - z) < rr) this.#spot = id;
    }
    this.action.hidden = !this.#spot;
    this.action.textContent = 'Inspect · Enter';
    this.label.textContent = this.#time < this.#messageUntil ? this.#message
      : this.#spot ? 'Koedo · Something worth a closer look.'
      : 'Koedo 小江戸 · Kura merchant town between the rice fields and Tokyo. The canal quarter lies west of the main street.';
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
  }
}

