import {
  AdditiveBlending, Box3, BufferGeometry, CanvasTexture, CircleGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, LineBasicMaterial, LineSegments, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3,
} from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { QualityKey } from '@/config/quality.config';
import { LocalSurfaces, type Point } from '../LocalSurfaces';
import { SettlementKit } from '../SettlementKit';
import { Parts, STONE, TIMBER_DARK, jitter, place, plate, rng, shade, tilePlate, type Rng, type Tile } from '../wago/wagoKit';
import { clothMaterial, weatheredMaterial } from '../wago/wagoMaterial';
import { FunauraLife } from '../funaura/funauraLife';
import { bamboo, jizoShelter, kaki, sugi, waterWheel } from '../gassho/gasshoBuildings';
import { T, buildKisoAtlas, buildPavingTexture, tile } from './kisoAtlas';
import {
  bellTower, bench, fence, garden, graves, hokora, honjin, hydrangea, kasugaLantern, kisoHouse, kosatsu,
  milestone, momiji, niwaki, pebble, shed, streetLamp, teahouse, trough, type KisoResult,
} from './kisoBuildings';
import {
  BACK, BACK_LANES, BELL, CEMETERY, FOREST, FRONT, GARDENS, GATES, GUTTER, HOKORA, HONJIN, HOUSES, KAKI_TREES, KISO, KOSATSU,
  MOMIJI, NIWAKI, ROAD_HALF, STAIR, TEAHOUSE, WHEEL, faceRoad, frame, useRoadAxis, type KisoHouse,
} from './kisoLayout';
import '../settlements.css';

/**
 * Reichweiten wie Funaura und Stillwater (dort gemessen): Masse bis 2,6 km —
 * aus der Ferne ist das Dorf eine Kette dunkler Dächer am Pass —, Kleinkram in
 * der Nähe, Oberflächenstruktur auf Minimal gar nicht.
 */
const RANGE: Readonly<Record<QualityKey, number>> = { ultra: 700, high: 480, medium: 340, low: 230, minimal: 160, custom: 480 };
const FINE_RANGE: Readonly<Record<QualityKey, number>> = { ultra: 380, high: 260, medium: 170, low: 100, minimal: 0, custom: 260 };
const MASS_RANGE = 2600;
const CHUNK = 64;
/** Gehweg über der Fahrbahnmitte: Bordstein 16 cm über der Asphaltoberkante (+6 cm). */
const WALK = 0.22;

type Chunk = { x: number; z: number; parts: Parts; mass: Mesh | null; thatch: Mesh | null; near: Object3D[]; fine: Mesh | null; box: Box3 };
type Spot = 'honjin' | 'irori' | 'wheel' | 'kosatsu' | 'tea' | 'bell' | 'gohei' | 'marker' | 'shrine';
type Wheel = { inner: Group; speed: number };

/** Material mit Atlas und warmer Eigenhelligkeit (Innenraum des Honjin). */
function litAtlas(map: CanvasTexture, lift: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, map, roughness: 0.9 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.58) * ${lift.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `kiso-lit-atlas-${lift}`;
  return m;
}

/** Kiso-Juku — Poststation am Pass (docs/DOERFER.md §3). */
export class KisoJuku implements System {
  readonly name = 'KisoJuku';
  readonly group = new Group();
  readonly floors = new LocalSurfaces();
  readonly panel = document.createElement('div');
  readonly label = document.createElement('span');
  readonly action = document.createElement('button');
  isPlaying: () => boolean = () => false;
  buildMs = 0;
  triangles = 0;
  /** Für Messläufe: gebaute Häuser mit Bodenhöhe und Tiefe. */
  readonly houses: { s: number; side: number; x: number; z: number; y: number; d: number; role: string }[] = [];
  /** Stufen der Steingasse: Weltpunkt und Höhe je Abtastpunkt (Messlauf, Hinweisfelder). */
  readonly lane: Vector3[] = [];
  readonly wheels: Wheel[] = [];
  honjinFloor = 0;
  honjinPoint: [number, number] = [0, 0];
  /** Weg vom Gehweg durchs Tor, über den Hof, in die Doma und hinauf an das Irori (Welt, für den Messlauf). */
  readonly honjinPath: [number, number][] = [];
  /** Vom oberen Weg über den Steg auf die Teehausterrasse (Welt, für den Messlauf). */
  readonly teaPath: [number, number][] = [];
  teaDeck: Vector3 | null = null;
  #context: EngineContext | null = null;
  #range = RANGE.high;
  #fineRange = FINE_RANGE.high;
  #time = 0;
  #spot: Spot | '' = '';
  #message = '';
  #messageUntil = 0;
  readonly #chunks = new Map<string, Chunk>();
  readonly #solid = weatheredMaterial({ strength: 0.9 });
  readonly #thatchMat = weatheredMaterial({ thatch: true, roughness: 0.97, strength: 1 });
  readonly #interiorMat = weatheredMaterial({ strength: 0.7, lift: 0.5 });
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
  #paving: MeshStandardMaterial | null = null;
  #life: FunauraLife | null = null;
  readonly #near = new Group();
  readonly #smoke: [number, number, number][] = [];
  readonly #water = new SettlementKit(true);
  readonly #streams = new SettlementKit(true);
  readonly #r: Rng = rng(0x4b15);
  /** Gehweghöhe je Seite, 1 m Raster ab `WALK_S0`. */
  #walk: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  /** Hausfronten je Seite, für die Rinne (Trittplatten) und Lampen. */
  readonly #doors: { s: number; side: 1 | -1; lit?: boolean }[] = [];
  /** Andon-Laternen am Gehweg, für die Lichtflecken. */
  readonly #lamps: { s: number; side: 1 | -1 }[] = [];

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
    if (!c) { c = { x: (gx + 0.5) * CHUNK, z: (gz + 0.5) * CHUNK, parts: new Parts(), mass: null, thatch: null, near: [], fine: null, box: new Box3() }; this.#chunks.set(key, c); }
    return c.parts;
  }
  /** Weltpunkt aus Straßenkoordinaten. */
  #at(s: number, o: number): [number, number] { const f = frame(s); return [f.x + f.nx * o, f.z + f.nz * o]; }
  /** Asphaltoberkante auf der Mittellinie. */
  #road(s: number): number { return frame(s).y + 0.06; }
  #walkY(s: number, side: 1 | -1): number {
    const a = this.#walk[side > 0 ? 0 : 1], f = Math.max(0, Math.min(a.length - 1.001, s - WALK_S0)), i = Math.floor(f);
    return a[i]! + (a[i + 1]! - a[i]!) * (f - i);
  }
  /** Lokales Koordinatensystem wie `place()`: lokales +z schaut in Richtung (sin yaw, cos yaw). */
  #local(x: number, z: number, yaw: number): (u: number, v: number) => [number, number] {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return (u, v) => [x + u * c + v * s, z - u * s + v * c];
  }
  /** Begehbares Rechteck in lokalen Koordinaten (u, v) auf Höhe y. */
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

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.group.name = 'Kiso-juku';
    this.#near.name = 'Kiso near layer';
    context.scene.add(this.group); this.group.add(this.#near);
    context.bus.on('quality:changed', ({ level }) => {
      this.#range = RANGE[level as QualityKey] ?? RANGE.medium;
      this.#fineRange = FINE_RANGE[level as QualityKey] ?? FINE_RANGE.medium;
    });
    const started = performance.now();
    // Die echte Mittellinie statt der 20-m-Tabelle (kisoLayout.ts, `useRoadAxis`).
    const toge = this.drive.roads?.roads.find(r => r.id === 'toge');
    if (toge) useRoadAxis(toge.centerline, toge.length / (toge.centerline.length / 3 - 1));
    const atlas = buildKisoAtlas();
    this.#signMat = new MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.85, alphaTest: 0.5, side: DoubleSide });
    this.#signGlow = new MeshBasicMaterial({ vertexColors: true, map: atlas, toneMapped: false });
    this.#interiorTex = litAtlas(atlas, 0.5);
    this.#makeWater();
    this.#buildWalkways();
    this.#buildPaving();
    this.#buildHouses();
    this.#buildHonjin();
    this.#buildGutters();
    this.#buildStreetFurniture();
    this.#buildStair();
    this.#buildHillside();
    this.#buildBack();
    this.#buildGates();
    this.#buildApproaches();
    this.#buildTrees();
    this.#buildLife();
    this.#buildLightPools();
    this.#finishChunks();
    const stack = this.drive.ground.localSurfaces;
    if (stack && 'layers' in stack) (stack as { layers: unknown[] }).layers.push(this.floors);
    window.addEventListener('keydown', this.#key);
    this.buildMs = performance.now() - started;
  }
  get lod(): { range: number; fine: number } { return { range: this.#range, fine: this.#fineRange }; }

  // ── Materialien für Wasser ────────────────────────────────────────────────

  #makeWater(): void {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!, r = rng(0x3a7e);
    g.fillStyle = '#6f8f86'; g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(230,240,235,${0.1 + r() * 0.25})`; g.lineWidth = 1; g.beginPath(); const x = r() * 64, y = r() * 128; g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + 3, x + 12 + r() * 8, y); g.stroke(); }
    this.#rippleTex = new CanvasTexture(c); this.#rippleTex.wrapS = this.#rippleTex.wrapT = RepeatWrapping; this.#rippleTex.colorSpace = SRGBColorSpace;
    this.#waterMat = new MeshStandardMaterial({ map: this.#rippleTex, color: 0x9fb8b0, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.88 });
    this.#streamMat = new MeshBasicMaterial({ map: this.#rippleTex, color: 0xd8ece8, transparent: true, opacity: 0.7, depthWrite: false, side: DoubleSide });
  }

  // ── Straße: Gehwege, Belag, Rinnen ─────────────────────────────────────────

  /**
   * Gehwege 4,9…6,4 m links und rechts, 22 cm über der Mitte. Auf der Hangseite
   * steigt das Gelände ab 5,5 m: dort wird der Gehweg angehoben, statt vom Hang
   * überdeckt zu werden (gemessen bis +0,6 m an der Hausfront).
   */
  #buildWalkways(): void {
    const n = Math.ceil(WALK_S1 - WALK_S0) + 1;
    this.#walk = [new Float32Array(n), new Float32Array(n)];
    for (const side of [1, -1] as const) {
      const a = this.#walk[side > 0 ? 0 : 1];
      for (let i = 0; i < n; i++) {
        const s = WALK_S0 + i, base = this.#road(s) + WALK;
        let hi = -Infinity; for (const o of [GUTTER[1], 5.6, FRONT + 0.1]) { const [x, z] = this.#at(s, side * o); hi = Math.max(hi, this.#ground(x, z)); }
        a[i] = Math.max(base, hi + 0.05);
      }
      // Glätten: der Gehweg folgt der Straße, nicht jeder Delle im Hang.
      for (let pass = 0; pass < 3; pass++) for (let i = 1; i < n - 1; i++) a[i] = Math.max(a[i]!, (a[i - 1]! + a[i + 1]!) / 2);
      // Gezeichnet nur im Ort; die Tabelle reicht 12 m weiter, damit Lampen und Tafeln
      // an den Enden eine Höhe finden. (Erste Fassung: die Gehwege begannen frei in der Luft.)
      for (const s of [KISO.s0 + 1, KISO.s1 - 1]) {
        const y = this.#walkY(s, side), f = frame(s), [ex, ez] = this.#at(s, side * (GUTTER[1] + FRONT + 0.3) / 2), g = this.#ground(ex, ez) - 0.3;
        this.#chunk(ex, ez).mass.box(ex, (y + g) / 2, ez, FRONT + 0.3 - GUTTER[1] + 0.2, y - g, 0.4, 0x77736a, 0, Math.atan2(f.nx, f.nz) + Math.PI / 2);
      }
      for (let i = 0; i + 1 < n; i++) {
        if (WALK_S0 + i < KISO.s0 + 1 || WALK_S0 + i + 1 > KISO.s1 - 1) continue;
        const s = WALK_S0 + i, y0 = a[i]!, y1 = a[i + 1]!, [x0, z0] = this.#at(s, side * GUTTER[1]), [x1, z1] = this.#at(s + 1, side * GUTTER[1]);
        const [x2, z2] = this.#at(s + 1, side * (FRONT + 0.3)), [x3, z3] = this.#at(s, side * (FRONT + 0.3));
        const pa: Point = [x0, y0, z0], pb: Point = [x1, y1, z1], pc: Point = [x2, y1, z2], pd: Point = [x3, y0, z3];
        this.floors.quad(pa, pb, pc, pd);
        const k = this.#chunk(x0, z0);
        // Steinplatten im Verband: zwei Reihen, jede Platte eigen getönt, mit dunkler Fuge.
        // Als Teil der geneigten Fläche — flach aufgelegte Platten standen auf 8 % Gefälle
        // wie Treppenstufen im Bild (erste Aufnahme, 2026-09-26).
        const mid = (FRONT + 0.3 + GUTTER[1]) / 2, lerp = (p: Point, q: Point, t: number): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        const t = (mid - GUTTER[1]) / (FRONT + 0.3 - GUTTER[1]), ma = lerp(pa, pd, t), mb = lerp(pb, pc, t);
        const lift = (p: Point): Point => [p[0], p[1] + 0.004, p[2]];
        this.#quad(k.mass, pa, pb, pc, pd, 0x4f4a42);
        const seam = 0.035, inset = (p: Point, q: Point, f: number): Point => lerp(p, q, f);
        this.#quad(k.mass, lift(inset(pa, pb, seam)), lift(inset(pb, pa, seam)), lift(inset(mb, ma, seam)), lift(inset(ma, mb, seam)), jitter(0x837d71, this.#r, 0.09));
        this.#quad(k.mass, lift(inset(ma, mb, seam + (i % 2) * 0.4)), lift(inset(mb, ma, seam)), lift(inset(pc, pd, seam)), lift(inset(pd, pc, seam + (i % 2) * 0.4)), jitter(0x7e786c, this.#r, 0.09));
        // Bordstein zur Rinne, je 2 m ein Stein (Nahschicht: aus 300 m ist er ein Strich).
        if (i % 2 === 0 && i + 2 < n) {
          const y2 = a[i + 2]!, f = frame(s + 1), yaw = Math.atan2(f.tx, f.tz), [bx, bz] = this.#at(s + 1, side * (GUTTER[1] + 0.08)), yb = (y0 + y2) / 2;
          const gy = this.#ground(bx, bz) - 0.1;
          k.detail.box(bx, (yb + gy) / 2, bz, 0.18, yb - gy, 2.02, jitter(0x8f8a7e, this.#r, 0.05), Math.atan2(y0 - y2, 2), yaw);
        }
      }
    }
  }

  /**
   * Dorfpflaster über dem Asphalt: Waschbeton mit Granitband, 1,5 cm darüber,
   * mit Polygon-Offset. Die Fahrphysik sieht nur den Asphalt — der Bergpass
   * bleibt Zentimeter für Zentimeter die Rennstrecke, die er war.
   */
  #buildPaving(): void {
    const tex = buildPavingTexture();
    this.#paving = new MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const lateral = [-ROAD_HALF, -3.25, 3.25, ROAD_HALF], vertical = [-0.22, 0, 0, -0.22];
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let row = 0;
    for (let s = KISO.s0; s <= KISO.s1 + 0.01; s += 1) {
      const f = frame(s);
      lateral.forEach((l, k) => {
        pos.push(f.x - f.nx * l, f.y + 0.06 + vertical[k]! + 0.015, f.z - f.nz * l);
        uv.push((l + ROAD_HALF) / (2 * ROAD_HALF), s / 17);
      });
      if (row > 0) for (let k = 0; k < 3; k++) { const a = (row - 1) * 4 + k, b = a + 1, c = a + 4, d = c + 1; idx.push(a, c, b, b, c, d); }
      row++;
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // Wickelrichtung prüfen statt annehmen (P8.6): die Normale muss nach oben zeigen.
    if (g.getAttribute('normal').getY(0) < 0) { const a = g.index!.array as unknown as number[]; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]!; a[i + 1] = a[i + 2]!; a[i + 2] = t; } g.index!.needsUpdate = true; g.computeVertexNormals(); }
    const mesh = new Mesh(g, this.#paving); mesh.name = 'Kiso Dorfpflaster'; mesh.receiveShadow = true; this.group.add(mesh);
    // Schwelle aus Granit an beiden Ortsenden: dort wechselt der Belag.
    for (const s of [KISO.s0, KISO.s1]) {
      const f = frame(s), yaw = Math.atan2(f.tx, f.tz);
      this.#chunk(f.x, f.z).detail.box(f.x, f.y + 0.085, f.z, 2 * ROAD_HALF, 0.03, 0.5, 0xa29d92, 0, yaw);
    }
  }

  /**
   * Offene Rinne zwischen Asphalt und Gehweg, beidseitig, mit fließendem Wasser
   * (in Magome und Tsumago läuft sie die ganze Straße hinunter). Vor jeder Tür
   * eine Steinplatte darüber.
   */
  #buildGutters(): void {
    const doorsBy = (side: 1 | -1): number[] => this.#doors.filter(d => d.side === side).map(d => d.s);
    for (const side of [1, -1] as const) {
      const doors = doorsBy(side);
      for (let s = KISO.s0; s < KISO.s1; s += 1.5) {
        const f = frame(s + 0.75), yaw = Math.atan2(f.tx, f.tz), [cx, cz] = this.#at(s + 0.75, side * (GUTTER[0] + GUTTER[1]) / 2), k = this.#chunk(cx, cz);
        // Geneigt mit der Straße: waagerecht gelegte 1,5-m-Stücke standen auf 8 % Steigung
        // als Sägezahn im Bild (12 cm Versatz je Stück, Nahaufnahme 2026-09-26).
        const r0 = this.#road(s), r1 = this.#road(s + 1.5), w0 = this.#walkY(s, side), w1 = this.#walkY(s + 1.5, side);
        const tiltRoad = Math.atan2(r0 - r1, 1.5), tiltWalk = Math.atan2(w0 - w1, 1.5), bed = (r0 + r1) / 2 - 0.02, top = (w0 + w1) / 2 - 0.06;
        // Innere Kante zur Fahrbahn und Boden.
        const [ix, iz] = this.#at(s + 0.75, side * (GUTTER[0] + 0.06));
        k.detail.box(ix, (top + bed - 0.3) / 2, iz, 0.14, top - bed + 0.3, 1.52, jitter(0x88837a, this.#r, 0.05), tiltWalk, yaw);
        k.detail.add(new PlaneGeometry(GUTTER[1] - GUTTER[0], 1.52), 0x3f3d38, cx, bed + 0.01, cz, -Math.PI / 2 + tiltRoad, yaw);
        const covered = doors.some(d => Math.abs(d - s - 0.75) < 1.0);
        if (covered) {
          // Trittplatte: Granit, begehbar, von der Straße auf den Gehweg.
          k.mass.box(cx, (w0 + w1) / 2 - 0.08, cz, GUTTER[1] - GUTTER[0] + 0.3, 0.16, 1.4, jitter(0x9a958a, this.#r, 0.05), tiltWalk, yaw);
          const [ax, az] = this.#at(s + 0.05, side * (GUTTER[0] - 0.05)), [bx, bz] = this.#at(s + 1.45, side * (GUTTER[0] - 0.05)), [cx2, cz2] = this.#at(s + 1.45, side * GUTTER[1]), [dx, dz] = this.#at(s + 0.05, side * GUTTER[1]);
          this.floors.quad([ax, w0, az], [bx, w1, bz], [cx2, w1, cz2], [dx, w0, dz]);
          continue;
        }
        this.#water.add(new PlaneGeometry(GUTTER[1] - GUTTER[0] - 0.12, 1.52), 0xffffff, cx, bed + 0.08, cz, -Math.PI / 2 + tiltRoad, yaw);
        // Ab und zu ein Blatt oder ein Kiesel im Wasser.
        if (this.#r() < 0.18) k.detail.box(cx + (this.#r() - 0.5) * 0.2, bed + 0.095, cz + (this.#r() - 0.5) * 0.8, 0.08, 0.01, 0.06, [0xb3261e, 0xd8621e, 0x7a8a3a][Math.floor(this.#r() * 3)]!, 0, this.#r() * 3);
      }
    }
    if (this.#water.parts.length) { const m = new Mesh(this.#water.geometry(), this.#waterMat!); m.name = 'Kiso Rinnen'; m.receiveShadow = true; this.#near.add(m); }
  }

  // ── Häuser ────────────────────────────────────────────────────────────────

  #buildHouses(): void {
    for (const h of HOUSES) this.#house(h);
    // Trittplatten auch vor der Steingasse und den Gassen ins Hinterland.
    this.#doors.push({ s: STAIR.foot, side: -1 });
    for (const s of this.#alleys()) this.#doors.push({ s, side: 1 });
  }

  /** Lücken der Talzeile, durch die eine Gasse ins Hinterland führt (Mitte in s). */
  #alleys(): number[] {
    const row = HOUSES.filter(h => h.side === 1).sort((a, b) => a.s - b.s), out: number[] = [];
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1]!, b = row[i]!, gap = (b.s - b.w / 2) - (a.s + a.w / 2);
      if (gap >= 3.5 && gap <= 12) out.push((a.s + a.w / 2 + b.s - b.w / 2) / 2);
    }
    return out;
  }

  #house(h: KisoHouse): void {
    const r = rng(h.seed), side = h.side, yaw = faceRoad(h.s, side) + (r() - 0.5) * 0.08;
    const walk = this.#walkY(h.s, side);
    let d = h.d;
    const front = FRONT + h.setback;
    // Boden: 0,3 m über dem Gehweg in Hausmitte. Die erste Fassung hob ihn über das
    // Gelände im vorderen Drittel — auf der Talseite stand dann vor fast jedem Haus eine
    // Treppe mit drei Stufen. Gelände unter dem Haus ist unsichtbar (der Körper ist zu),
    // der Gehweg davor liegt bereits über dem Hang.
    const probe = (dd: number, f0: number, f1: number): { hi: number; lo: number } => {
      let hi = -Infinity, lo = Infinity;
      for (let u = -h.w / 2; u <= h.w / 2 + 0.01; u += h.w / 4) for (let v = f0; v <= f1 + 0.01; v += Math.max(0.5, (f1 - f0) / 3)) {
        const [x, z] = this.#at(h.s + u, side * (front + v * dd)); const g = this.#ground(x, z); hi = Math.max(hi, g); lo = Math.min(lo, g);
      }
      return { hi, lo };
    };
    const y = walk + 0.3;
    // Tiefe kürzen, bis die Rücktraufe über dem Hang liegt (Hangseite und Wall an den Enden).
    for (let k = 0; k < 16 && d > 5.5; k++) {
      const [bx, bz] = this.#at(h.s, side * (front + d + 0.8));
      if (this.#ground(bx, bz) < y + 4.4) break;
      d -= 0.5;
    }
    const low = probe(d, 0, 1).lo;
    const [cx, cz] = this.#at(h.s, side * (front + d / 2));
    const p = new Parts();
    // Lokales +x liegt in Welt bei (cos yaw, −sin yaw); auf die Achse projiziert ergibt das die Richtung in s.
    const fs0 = frame(h.s), along = Math.cos(yaw) * fs0.tx - Math.sin(yaw) * fs0.tz;
    const street = (u: number): number => this.#walkY(h.s + u * along, side) - y;
    const res: KisoResult = kisoHouse(p, { w: h.w, d, kind: h.kind, roof: h.roof, role: h.role, r, lit: h.role === 'home' ? 0.35 : 0.6, base: y - low + 0.4, street, low: h.low });
    place(p, this.#chunk(cx, cz), cx, y, cz, yaw);
    this.drive.collision.addOrientedBox(cx, cz, -yaw, h.w / 2 + 0.05, d / 2 + 0.05, y - 1.5, y + res.wallH);
    this.houses.push({ s: h.s, side, x: cx, z: cz, y, d, role: h.role });
    // Tür auf die Achse projiziert: lokales +x liegt in Welt bei (cos yaw, −sin yaw).
    const fh = frame(h.s), doorS = h.s + res.doorX * (Math.cos(yaw) * fh.tx - Math.sin(yaw) * fh.tz);
    // Gasthöfe und Läden stehen abends offen und werfen Licht auf den Gehweg.
    this.#doors.push({ s: doorS, side, lit: h.role !== 'home' || r() < 0.3 });
    // Trittsteine vom Gehweg zur Tür: Stufen von höchstens 20 cm (die Straße steigt 8 %,
    // die Tür liegt je nach Lage 0…0,7 m über dem Gehweg).
    const rise = y - this.#walkY(doorS, side);
    if (rise > 0.12) {
      const L = this.#local(cx, cz, yaw), n = Math.max(1, Math.ceil(rise / 0.2) - 1), k = this.#chunk(cx, cz).mass;
      for (let j = 1; j <= n; j++) {
        const top = y - j * rise / (n + 1), v0 = d / 2 + 0.05 + (j - 1) * 0.36, v1 = v0 + 0.36;
        const [ax, az] = L(res.doorX - 0.7, v0), [bx, bz] = L(res.doorX + 0.7, v0), [ex, ez] = L(res.doorX + 0.7, v1), [fx, fz] = L(res.doorX - 0.7, v1);
        this.floors.quad([ax, top, az], [bx, top, bz], [ex, top, ez], [fx, top, fz]);
        const [mx, mz] = L(res.doorX, (v0 + v1) / 2);
        k.box(mx, (top + walk - 0.3) / 2, mz, 1.4, top - walk + 0.3, 0.4, jitter(0x8f8b80, r, 0.06), 0, yaw);
      }
    }
    // Vorgarten: Kies auf Gehweghöhe, Bambuszaun an der Gehwegkante (Lücke an der Tür),
    // eine Kiefer im Wolkenschnitt, zwei, drei Steine.
    if (h.setback > 0.3) {
      const L = this.#local(cx, cz, yaw), k = this.#chunk(cx, cz), v0 = d / 2, v1 = d / 2 + h.setback - 0.25;
      for (let u = -h.w / 2; u < h.w / 2 - 0.01; u += 1) {
        const u1 = Math.min(h.w / 2, u + 1), ya = street(u) + y + 0.03, yb = street(u1) + y + 0.03;
        const [ax, az] = L(u, v0), [bx, bz] = L(u1, v0), [cx2, cz2] = L(u1, v1), [dx, dz] = L(u, v1);
        const qa: Point = [ax, ya, az], qb: Point = [bx, yb, bz], qc: Point = [cx2, yb, cz2], qd: Point = [dx, ya, dz];
        this.floors.quad(qa, qb, qc, qd); this.#quad(k.mass, qa, qb, qc, qd, jitter(0x8c8576, r, 0.05));
      }
      const fenceV = v1 - 0.05;
      for (const [u0, u1] of [[-h.w / 2 + 0.1, res.doorX - 0.75], [res.doorX + 0.75, h.w / 2 - 0.1]] as const) {
        if (u1 - u0 < 0.6) continue;
        const [ax, az] = L(u0, fenceV), [bx, bz] = L(u1, fenceV), gy = street((u0 + u1) / 2) + y;
        // Kinmei-gaki: niedriger Bambuszaun, dicht gebunden.
        const len = u1 - u0, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        k.detail.box(mx, gy + 0.45, mz, len, 0.9, 0.05, 0x9a8a52, 0, yaw);
        for (let q = 0; q < len; q += 0.09) { const [px, pz] = L(u0 + q, fenceV + 0.035); k.fine.add(new PlaneGeometry(0.035, 0.88), jitter(0xb09a5c, r, 0.12), px, gy + 0.44, pz, 0, yaw, 0); }
        for (const hh of [0.3, 0.7]) k.detail.box(mx, gy + hh, mz, len + 0.02, 0.04, 0.09, 0x6a5a38, 0, yaw);
        this.drive.collision.addWall(ax, az, bx, bz, 0.08, gy, gy + 0.9);
      }
      const side1 = res.doorX > 0 ? -1 : 1, [px, pz] = L(side1 * (h.w / 2 - 1.3), (v0 + v1) / 2);
      niwaki(k.mass, k.detail, px, street(side1 * (h.w / 2 - 1.3)) + y, pz, 0.55 + r() * 0.2, r);
      for (let q = 0; q < 3; q++) { const [sx, sz] = L(side1 * (h.w / 2 - 2.4 - q * 0.5), (v0 + v1) / 2 + (r() - 0.5) * 0.4); pebble(k.detail, sx, street(side1 * (h.w / 2 - 2.4)) + y + 0.05, sz, 0.18 + r() * 0.15, 0x7a776e, r, 0.6); }
    }
    if (res.smoke) { const L = this.#local(cx, cz, yaw), [sx, sz] = L(res.smoke[0], res.smoke[2]); this.#smoke.push([sx, y + res.smoke[1], sz]); }
    // Hangseite: Stützmauer hinter dem Haus, bis dorthin, wo der Hang wieder flacher wird.
    if (side < 0) {
      const f = frame(h.s), [wx, wz] = this.#at(h.s, side * (front + d + 0.7)), top = this.#ground(...this.#at(h.s, side * (front + d + 2.2))) + 0.3;
      if (top - y > 0.8) {
        const k = this.#chunk(wx, wz), wyaw = Math.atan2(f.tx, f.tz), bottom = y - 0.3, face = Math.atan2(f.nx, f.nz);
        k.mass.box(wx, (top + bottom) / 2, wz, 0.9, top - bottom, h.w + 0.6, 0x6f6b62, 0, wyaw);
        let row = 0;
        for (let yy = bottom + 0.2; yy < top; yy += 0.42, row++) for (let u = -h.w / 2 + (row % 2) * 0.35; u < h.w / 2; u += 0.7) {
          const [px, pz] = this.#at(h.s + u, side * (front + d + 0.24));
          k.fine.add(new PlaneGeometry(0.64, 0.38), jitter(STONE, r, 0.2), px, yy, pz, 0, face, 0);
        }
        // Moos und Farn an der Mauerkrone.
        for (let u = -h.w / 2 + 0.6; u < h.w / 2; u += 2.6) { const [px, pz] = this.#at(h.s + u, side * (front + d + 1.1)); hydrangea(k.detail, k.detail, px, top - 0.2, pz, r); }
      }
    }
  }

  // ── Honjin ────────────────────────────────────────────────────────────────

  #buildHonjin(): void {
    const s = HONJIN.s, yaw = faceRoad(s, 1), [x, z] = this.#at(s, HONJIN.wallO), walk = this.#walkY(s, 1);
    const yard = 0.6, r = rng(0x40b1);
    const p = new Parts();
    const walkPlan = honjin(p, HONJIN.w, HONJIN.houseW, HONJIN.houseD, -(HONJIN.houseO - HONJIN.wallO), yard, r);
    place(p, this.#chunk(x, z), x, walk, z, yaw);
    const L = this.#local(x, z, yaw);
    for (const [u0, v0, u1, v1, y] of walkPlan.floors) {
      const [ax, az] = L(u0, v0), [bx, bz] = L(u1, v0), [cx, cz] = L(u1, v1), [dx, dz] = L(u0, v1);
      this.floors.quad([ax, walk + y, az], [bx, walk + y, bz], [cx, walk + y, cz], [dx, walk + y, dz]);
    }
    for (const [u0, v0, u1, v1, y0, y1] of walkPlan.walls) {
      const [ax, az] = L(u0, v0), [bx, bz] = L(u1, v1);
      if (Math.hypot(bx - ax, bz - az) < 0.05) continue;
      this.drive.collision.addWall(ax, az, bx, bz, 0.16, walk + y0, walk + y1);
    }
    this.#doors.push({ s, side: 1, lit: true });
    this.honjinFloor = walk + yard + 0.5;
    this.honjinPoint = L(-4, -(HONJIN.houseO - HONJIN.wallO) - 2.4);
    {
      const fz1 = -(HONJIN.houseO - HONJIN.wallO) + HONJIN.houseD / 2, domaZ0 = fz1 - 5.2;
      for (const [u, v] of [[0, 1.4], [0, -2], [-0.9, fz1 + 1.0], [-0.9, fz1 - 1.5], [-3, domaZ0 + 1.2], [-3, domaZ0 - 0.9], [-4, domaZ0 - 2.6]] as const) this.honjinPath.push(L(u, v));
    }
    // Kiefer im Hof neben dem Weg und Rauch aus dem Irori.
    const [px, pz] = L(-7, -4.2); niwaki(this.#chunk(px, pz).mass, this.#chunk(px, pz).detail, px, walk + yard, pz, 1.3, r);
    const [sx, sz] = L(-HONJIN.houseW / 2 + 3.2, -(HONJIN.houseO - HONJIN.wallO) - HONJIN.houseD / 2 + 3); this.#smoke.push([sx, walk + yard + 7.2, sz]);
  }

  // ── Straßenmöbel ─────────────────────────────────────────────────────────

  #buildStreetFurniture(): void {
    const r = this.#r;
    // Andon-Laternen am Gehwegrand, abwechselnd, nicht vor Türen.
    let side: 1 | -1 = 1;
    for (let s = KISO.s0 + 8; s < KISO.s1 - 4; s += 17) {
      side = side > 0 ? -1 : 1;
      if (this.#doors.some(d => d.side === side && Math.abs(d.s - s) < 1.6)) s += 2.2;
      const [x, z] = this.#at(s, side * (GUTTER[1] + 0.3)), y = this.#walkY(s, side), f = frame(s);
      streetLamp(this.#chunk(x, z), x, y, z, Math.atan2(f.tx, f.tz));
      this.drive.collision.addCylinder(x, z, 0.14, y, y + 3);
      this.#lamps.push({ s, side });
    }
    // Gullydeckel mitten auf der Straße (auf dem Pflaster, knapp darüber).
    for (let s = KISO.s0 + 20; s < KISO.s1; s += 34) {
      const f = frame(s), [x, z] = this.#at(s, 1.6);
      tilePlate(this.#chunk(x, z).sign, tile(T.manhole, 0, 0, 128, 128), x, f.y + 0.06 + 0.022, z, 0.7, 0.7, 'y', 1, 0xffffff, Math.atan2(f.tx, f.tz));
    }
    // Wassertröge mit Bambusrohr an zwei Stellen der Talseite.
    for (const s of [1728.5, 1886.5]) {
      const f = frame(s), [x, z] = this.#at(s, 5.6), y = this.#walkY(s, 1), yaw = Math.atan2(f.tx, f.tz), p = new Parts(), w = new SettlementKit(true);
      trough(p, w);
      place(p, this.#chunk(x, z), x, y, z, yaw);
      for (const g of w.parts) { g.rotateY(yaw); g.translate(x, y, z); this.#water.parts.push(g); }
      this.drive.collision.addOrientedBox(x, z, -yaw, 0.8, 0.35, y, y + 0.7);
    }
    // Hortensien und kleine Hecken in den Fugen zwischen den Häusern.
    const bySide = (sd: 1 | -1): KisoHouse[] => HOUSES.filter(h => h.side === sd).sort((a, b) => a.s - b.s);
    for (const sd of [1, -1] as const) {
      const row = bySide(sd);
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1]!, b = row[i]!, gap = (b.s - b.w / 2) - (a.s + a.w / 2);
        if (gap < 0.6 || gap > 3.5) continue;
        const s = (a.s + a.w / 2 + b.s - b.w / 2) / 2, [x, z] = this.#at(s, sd * (FRONT + 0.4)), k = this.#chunk(x, z);
        hydrangea(k.mass, k.detail, x, this.#walkY(s, sd), z, r);
      }
    }
  }

  // ── Steingasse, Wasserrad, oberer Weg ─────────────────────────────────────

  /**
   * Ein begehbarer Steinweg über das Gelände. Die Höhe folgt dem steilsten
   * Punkt quer über die Breite (sonst deckt der Hang die Stufen zu), steigt nie
   * ab und wird dort, wo es steiler als 12 % geht, zu Stufen von höchstens
   * 20 cm (die Figur steigt 38 cm). Unter jedem Abschnitt ein Steinblock bis
   * unter das Gelände — talseitig wird er zur Mauer.
   */
  #path(pts: readonly (readonly [number, number])[], width: number, y0: number, record: Vector3[] | null, rail: boolean): number[] {
    const samples: [number, number, number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.36));
      for (let j = i === 1 ? 0 : 1; j <= n; j++) { const t = j / n; samples.push([ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / len, (bz - az) / len]); }
    }
    const need = samples.map(([x, z, dx, dz]) => { let hi = -Infinity; for (const o of [-width / 2, 0, width / 2]) hi = Math.max(hi, this.#ground(x - dz * o, z + dx * o)); return hi + 0.06; });
    const ys: number[] = []; let cur = y0;
    for (let i = 0; i < samples.length; i++) {
      let ahead = need[i]!; for (let j = i; j < Math.min(samples.length, i + 3); j++) ahead = Math.max(ahead, need[j]!);
      // Höchstens 21 cm je Stufe bei 36 cm Auftritt (58 %) — die Figur steigt 38 cm.
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
      const step = i > 0 && y - ys[i - 1]! > 0.06;
      k.mass.box(x, (y + lo - 0.3) / 2, z, width, y - lo + 0.3, 0.42, jitter(0x747067, r, 0.12), 0, yaw);
      // Trittfläche aus zwei, drei Steinen mit Fuge; die Stirn der Stufe dunkler —
      // einfarbige Blöcke lasen sich im ersten Bild als Betontreppe.
      const n = width > 2 ? 3 : 2;
      for (let j = 0; j < n; j++) { const o = (j - (n - 1) / 2) * width / n; k.detail.add(new PlaneGeometry(width / n - 0.05, 0.37), jitter(0x8a8579, r, 0.1), x - dz * o, y + 0.004, z + dx * o, -Math.PI / 2, yaw); }
      if (step) k.detail.box(x - dx * 0.21, y - 0.1, z - dz * 0.21, width, 0.18, 0.02, 0x57534b, 0, yaw);
      // Mauersteine an den Flanken, wo der Weg über dem Hang liegt.
      if (y - lo > 0.45) for (const e of [-1, 1]) {
        // Normale (sin, cos) der gedrehten Platte muss nach außen zeigen, also zu e·(−dz, dx):
        // das ist yaw − e·π/2. Mit + zeigten alle Steine ins Mauerwerk und fielen ins Culling.
        const face = yaw - e * Math.PI / 2, ox = x - dz * e * (width / 2 + 0.005), oz = z + dx * e * (width / 2 + 0.005);
        for (let yy = y - 0.22, row = 0; yy > lo - 0.1; yy -= 0.36, row++) {
          const g = this.#ground(ox, oz); if (yy < g - 0.2) break;
          k.fine.add(new PlaneGeometry(0.38, 0.32), jitter(STONE, r, 0.2), ox + dx * ((row % 2) * 0.1 - 0.05), yy, oz + dz * ((row % 2) * 0.1 - 0.05), 0, face, 0);
        }
      }
      // Geländer, wo der Weg mehr als 0,8 m über dem Hang liegt.
      if (rail && i % 3 === 0) for (const e of [-1, 1]) {
        const ox = x - dz * e * (hw + 0.1), oz = z + dx * e * (hw + 0.1), g = this.#ground(ox, oz);
        if (y - g < 0.8) continue;
        k.detail.box(ox, y + 0.45, oz, 0.1, 0.9, 0.1, 0x3a2c22);
        k.detail.box(ox + dx * 0.6, y + 0.88, oz + dz * 0.6, 0.06, 0.06, 1.25, 0x4a3a2c, Math.atan2(ys[Math.min(ys.length - 1, i + 3)]! - y, 1.2), yaw);
        this.drive.collision.addCylinder(ox, oz, 0.1, y, y + 1);
      }
      record?.push(new Vector3(x, y, z));
    }
    return ys;
  }

  #buildStair(): void {
    const pts = STAIR.pts.map(([s, o]) => this.#at(s, o));
    const y0 = this.#walkY(STAIR.foot, -1);
    this.#path(pts, 2.4, y0, this.lane, true);
    const r = this.#r, L = this.lane;
    // Steinlaternen, Jizō und Farn am Weg; Bambuszaun an der Hangseite.
    for (let i = 20; i < L.length; i += 34) {
      const p = L[i]!, q = L[Math.min(L.length - 1, i + 1)]!, dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      const side = i % 68 === 20 ? 1 : -1, x = p.x - dz / l * 1.8 * side, z = p.z + dx / l * 1.8 * side, k = this.#chunk(x, z), g = Math.max(this.#ground(x, z), p.y - 0.3);
      if ((i / 34) % 3 < 1) { kasugaLantern(k, x, g, z, r); this.drive.collision.addCylinder(x, z, 0.3, g, g + 2); }
      else { hydrangea(k.mass, k.detail, x, g, z, r); }
    }
    // Wasserrad: Achse entlang der Straße, das Rad dreht in der Ebene des Wegs.
    // Direkt am Gehweg wie in Magome: das Rad steht in einem Steinbecken 0,4 m unter
    // dem Gehweg. Die erste Fassung (o = −11,2) steckte halb im Hang.
    const f = frame(WHEEL.s), [wx, wz] = this.#at(WHEEL.s, WHEEL.o);
    const lo = this.#walkY(WHEEL.s, -1) - 0.4;
    const cy = lo + WHEEL.r - 0.35;
    const kit = new SettlementKit(); waterWheel(kit, WHEEL.r, 0.7);
    const outer = new Group(), inner = new Group(); outer.name = 'Wasserrad Kiso';
    outer.position.set(wx, cy, wz); outer.rotation.y = Math.atan2(-f.tz, f.tx);
    const m = new Mesh(kit.geometry(), this.#solid); m.castShadow = true; inner.add(m); outer.add(inner); this.#near.add(outer);
    this.wheels.push({ inner, speed: 0.7 / WHEEL.r });
    // Steinbecken unter dem Rad, Rinne von oben, Abfluss zur Straßenrinne.
    const pk = this.#chunk(wx, wz), yaw = Math.atan2(f.tx, f.tz);
    pk.mass.box(wx, lo - 0.1, wz, 1.4, 0.5, 2 * WHEEL.r + 0.6, 0x5f5c55, 0, yaw + Math.PI / 2);
    for (const e of [-1, 1]) { const [bx, bz] = this.#at(WHEEL.s + e * 0.75, WHEEL.o); pk.mass.box(bx, lo + 0.25, bz, 0.25, 0.9, 2 * WHEEL.r + 0.6, 0x6f6b62, 0, yaw + Math.PI / 2); }
    this.#streams.add(new PlaneGeometry(0.8, 2 * WHEEL.r), 0xffffff, wx, lo + 0.22, wz, -Math.PI / 2, yaw + Math.PI / 2);
    const [tx, tz] = this.#at(WHEEL.s, WHEEL.o - WHEEL.r - 2.6), ty = cy + WHEEL.r + 0.35;
    const tlen = Math.hypot(tx - wx, tz - wz), tyaw = Math.atan2(wx - tx, wz - tz);
    pk.detail.box((tx + wx) / 2, ty, (tz + wz) / 2, 0.45, 0.1, tlen, 0x4d3a2a, 0, tyaw);
    for (const e of [-1, 1]) pk.detail.box((tx + wx) / 2 + Math.cos(tyaw) * e * 0.2, ty + 0.14, (tz + wz) / 2 - Math.sin(tyaw) * e * 0.2, 0.05, 0.28, tlen, 0x5a4432, 0, tyaw);
    this.#streams.add(new PlaneGeometry(0.34, tlen), 0xffffff, (tx + wx) / 2, ty + 0.1, (tz + wz) / 2, -Math.PI / 2, tyaw);
    this.#streams.add(new PlaneGeometry(0.4, 0.9), 0xffffff, wx + Math.sin(tyaw) * 0.25, cy + WHEEL.r, wz + Math.cos(tyaw) * 0.25, 0, tyaw);
    for (let t = 0.25; t < 1; t += 0.4) { const sx = tx + (wx - tx) * t, sz = tz + (wz - tz) * t, g = this.#ground(sx, sz); if (ty - g > 0.3) pk.detail.box(sx, (g + ty) / 2, sz, 0.12, ty - g, 0.12, 0x3a2c22); }
    this.drive.collision.addOrientedBox(wx, wz, -(yaw + Math.PI / 2), WHEEL.r + 0.3, 0.8, lo, cy + WHEEL.r);
    // Stützmauer hinter dem Rad: dort steigt der Hang schon auf +1,5 m.
    { const [mx, mz] = this.#at(WHEEL.s, WHEEL.o - WHEEL.r - 0.35), top = this.#ground(mx, mz) + 0.4; if (top > lo + 0.5) pk.mass.box(mx, (top + lo) / 2, mz, 0.5, top - lo, 2.4, 0x6f6b62, 0, yaw); }
    const bp = new Parts(); const [ix, iz] = this.#at(WHEEL.s - 1.4, -(FRONT - 0.15)), iy = this.#height(ix, iz);
    bp.detail.box(0, 0.7, 0, 0.1, 1.4, 0.1, TIMBER_DARK); bp.detail.box(0, 1.5, 0, 1.2, 0.6, 0.06, TIMBER_DARK);
    tilePlate(bp.sign, tile(T.wheelInfo), 0, 1.5, 0.04, 1.1, 0.55, 'z', 1);
    place(bp, this.#chunk(ix, iz), ix, iy, iz, faceRoad(WHEEL.s, -1));
  }

  // ── Am Hang: Glockenturm, Teehaus, Schrein ─────────────────────────────────

  #laneNear(x: number, z: number): Vector3 {
    let best = this.lane[0]!, d = Infinity;
    for (const p of this.lane) { const e = Math.hypot(p.x - x, p.z - z); if (e < d) { d = e; best = p; } }
    return best;
  }

  #buildHillside(): void {
    const r = rng(0xb311);
    // Glockenturm: Plattform auf dem höchsten Punkt ihres Grundrisses, Treppe vom Weg.
    {
      const [x, z] = this.#at(BELL.s, BELL.o), yaw = faceRoad(BELL.s, -1);
      let hi = -Infinity, lo = Infinity; for (let u = -1.8; u <= 1.8; u += 0.9) for (let v = -1.8; v <= 1.8; v += 0.9) { const [px, pz] = this.#local(x, z, yaw)(u, v), g = this.#ground(px, pz); hi = Math.max(hi, g); lo = Math.min(lo, g); }
      const y = hi + 0.15, p = new Parts(); bellTower(p, r);
      // Der Sockel des Turms ist 1 m hoch; am Hang reicht er tiefer.
      const ext = y - lo + 0.3 - 1.0;
      if (ext > 0) { p.mass.box(0, -1.0 - ext / 2, 0, 3.5, ext, 3.5, 0x6f6b62); this.#ashlar(p, 3.5, 3.5, -1.0, -1.0 - ext, r); }
      place(p, this.#chunk(x, z), x, y, z, yaw);
      const L = this.#local(x, z, yaw);
      this.#rect(L, -1.8, -1.8, 1.8, 1.8, y);
      for (const [u, v] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as const) { const [px, pz] = L(u, v); this.drive.collision.addCylinder(px, pz, 0.16, y, y + 3.4); }
      const start = this.#laneNear(...L(0, 5));
      this.#path([[start.x, start.z], L(0, 1.8)], 1.6, start.y, null, false);
      const [bx, bz] = L(1.9, 1.9); const bp = new Parts(); bp.detail.box(0, 0.6, 0, 0.1, 1.2, 0.1, TIMBER_DARK); tilePlate(bp.sign, tile(T.bellInfo), 0, 1.25, 0.06, 0.9, 0.45, 'z', 1); bp.detail.box(0, 1.25, 0, 1.0, 0.55, 0.06, TIMBER_DARK);
      place(bp, this.#chunk(bx, bz), bx, y, bz, yaw);
    }
    // Teehaus auf Stelzen, Terrasse zum Tal, Steg vom Weg.
    {
      const [x, z] = this.#at(TEAHOUSE.s, TEAHOUSE.o), yaw = faceRoad(TEAHOUSE.s, -1), L = this.#local(x, z, yaw);
      const back = this.#laneNear(...L(0, -TEAHOUSE.d / 2 - 3)), y = back.y + 0.1;
      const p = new Parts(); teahouse(p, TEAHOUSE.w, TEAHOUSE.d, r);
      const hw = TEAHOUSE.w / 2, hd = TEAHOUSE.d / 2, deck = 2.6;
      // Stelzen (Kakezukuri) mit Riegeln, bis ins Gelände.
      const us = [-hw, -hw / 3, hw / 3, hw], vs = [-hd, 0, hd, hd + deck - 0.1], post = (u: number, v: number): number => y - 0.12 - (this.#ground(...L(u, v)) - 0.2);
      for (const u of us) for (const v of vs) { const hgt = post(u, v); if (hgt > 0.15) p.mass.box(u, -0.12 - hgt / 2, v, 0.22, hgt, 0.22, 0x3a2c22); }
      // Riegel (Nuki) in 1,4-m-Lagen, nur wo sie auf ganzer Länge über dem Hang liegen.
      for (let yy = -0.9; yy > -9; yy -= 1.4) {
        for (const v of vs) if (Math.min(...us.map(u => post(u, v))) > -yy + 0.2) p.detail.box(0, yy, v, TEAHOUSE.w, 0.12, 0.1, 0x4a3a2c);
        for (const u of us) if (Math.min(...vs.map(v => post(u, v))) > -yy + 0.4) p.detail.box(u, yy - 0.2, deck / 2 - 0.05, 0.1, 0.12, TEAHOUSE.d + deck, 0x4a3a2c);
      }
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(...L(0, 0), -yaw, hw + 0.05, hd + 0.05, y - 0.2, y + 3);
      const deckQuad = (u0: number, v0: number, u1: number, v1: number, yy: number): void => this.#rect(L, u0, v0, u1, v1, yy);
      deckQuad(-hw - 0.1, hd, hw + 0.1, hd + deck - 0.15, y);
      for (const [u0, v0, u1, v1] of [[-hw - 0.15, hd, -hw - 0.15, hd + deck], [-hw - 0.15, hd + deck - 0.1, hw + 0.15, hd + deck - 0.1], [hw + 0.15, hd + deck, hw + 0.15, hd + 0.95]] as const) {
        const [ax, az] = L(u0, v0), [bx, bz] = L(u1, v1); this.drive.collision.addWall(ax, az, bx, bz, 0.12, y, y + 1.0);
      }
      // Seitlicher Steg vom Weg an der Hausseite vorbei auf die Terrasse.
      const sp = new Parts(), sx0 = hw + 0.3, sx1 = hw + 1.5;
      // Bis an die offene Ecke der Terrasse (v = hd + 0.95); die erste Fassung endete bei
      // hd + 0.2 vor einem geschlossenen Geländer — die Figur stand auf dem Steg und kam nicht weiter.
      const sv0 = -hd - 3.2, sv1 = hd + 0.95;
      sp.detail.box((sx0 - 0.45 + sx1) / 2, -0.06, (sv0 + sv1) / 2, sx1 - sx0 + 0.45, 0.12, sv1 - sv0, 0x6a5038);
      for (let v = sv0 + 0.3; v <= sv1; v += 1.4) {
        const [px, pz] = L(sx1, v), g = this.#ground(px, pz);
        if (y - g > 0.3) sp.mass.box(sx1, -(y - g) / 2, v, 0.16, y - g, 0.16, 0x3a2c22);
        sp.detail.box(sx1 + 0.02, 0.5, v, 0.09, 1.0, 0.09, 0x2a2018);
      }
      sp.detail.box(sx1 + 0.02, 0.95, (sv0 + sv1) / 2, 0.07, 0.07, sv1 - sv0, 0x2a2018);
      place(sp, this.#chunk(x, z), x, y, z, yaw);
      deckQuad(sx0 - 0.45, sv0, sx1, sv1, y);
      const [ax, az] = L(sx1 + 0.05, -hd), [bx, bz] = L(sx1 + 0.05, hd + deck); this.drive.collision.addWall(ax, az, bx, bz, 0.1, y, y + 1);
      this.#path([[back.x, back.z], L((sx0 + sx1) / 2, -hd - 2.4)], 1.4, back.y, null, false);
      const [dx, dz] = L(0, hd + 1.3); this.teaDeck = new Vector3(dx, y, dz);
      const mid = (sx0 + sx1) / 2;
      this.teaPath.push([back.x, back.z], L(mid, -hd - 2.4), L(mid, hd + 0.6), L(hw - 0.3, hd + 0.6), [dx, dz]);
      const [sx, sz] = L(-hw * 0.4, 0); this.#smoke.push([sx, y + 5.2, sz]);
    }
    // Hokora am Ende des Wegs.
    {
      const [x, z] = this.#at(HOKORA.s, HOKORA.o), yaw = faceRoad(HOKORA.s, -1), L = this.#local(x, z, yaw);
      let hi = -Infinity, lo = Infinity; for (let u = -1.3; u <= 1.3; u += 0.65) for (let v = -1.1; v <= 1.1; v += 0.55) { const g = this.#ground(...L(u, v)); hi = Math.max(hi, g); lo = Math.min(lo, g); }
      const y = hi + 0.3, p = new Parts(); hokora(p, r);
      const ext = y - lo + 0.3 - 0.8;
      if (ext > 0) { p.mass.box(0, -0.8 - ext / 2, 0, 2.6, ext, 2.2, 0x6f6b62); this.#ashlar(p, 2.6, 2.2, -0.8, -0.8 - ext, r); }
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.#rect(L, -1.3, -1.1, 1.3, 1.1, y);
      this.drive.collision.addOrientedBox(...L(0, -0.2), -yaw, 0.7, 0.6, y, y + 2);
      const start = this.#laneNear(...L(0, 4));
      this.#path([[start.x, start.z], L(0, 1.1)], 1.4, start.y, null, false);
    }
    // Sträucher, Farn und Bambusgras am Hang zwischen den Wegen.
    for (let i = 0; i < 150; i++) {
      const s = KISO.s0 + 10 + r() * (KISO.s1 - KISO.s0 - 20), o = -(15 + r() * 22), [x, z] = this.#at(s, o);
      if (this.lane.some(p => Math.hypot(p.x - x, p.z - z) < 2.4)) continue;
      if (this.floors.height(x, z) > this.#ground(x, z) - 0.5) continue;
      const k = this.#chunk(x, z), g = this.#ground(x, z);
      // Nahschicht und grob: 150 Büsche waren als Kugeln 40 000 Dreiecke in der Masse.
      const gg = new IcosahedronGeometry(0.5 + r() * 0.5, 0); gg.scale(1.2, 0.7 + r() * 0.4, 1.1);
      k.detail.add(gg, jitter(r() < 0.5 ? 0x3a5a2a : 0x4a5e2e, r, 0.12), x, g + 0.2, z);
    }
  }

  /** Ishigaki-Steine auf allen vier Seiten eines Sockels (lokal, zentriert), von y0 abwärts bis y1. */
  #ashlar(p: Parts, w: number, d: number, y0: number, y1: number, r: Rng): void {
    let row = 0;
    for (let y = y0 - 0.2; y > y1 + 0.1; y -= 0.4, row++) {
      const off = (row % 2) * 0.3;
      for (const e of [-1, 1] as const) {
        for (let u = -w / 2 + 0.3 + off; u < w / 2 - 0.1; u += 0.62) plate(p.fine, u, y, e * (d / 2 + 0.01), 0.56, 0.36, 'z', e, jitter(STONE, r, 0.2));
        for (let u = -d / 2 + 0.3 + off; u < d / 2 - 0.1; u += 0.62) plate(p.fine, e * (w / 2 + 0.01), y, u, 0.56, 0.36, 'x', e, jitter(STONE, r, 0.2));
      }
    }
  }

  // ── Hinterland der Talseite ────────────────────────────────────────────────

  #buildBack(): void {
    const r = rng(0xba3c);
    for (const lane of BACK_LANES) this.#path(lane.map(([s, o]) => this.#at(s, o)), 2.2, this.#ground(...this.#at(lane[0]![0], lane[0]![1])) + 0.08, null, false);
    // Gassen von der Straße zur Hintergasse, durch die Lücken der Talzeile.
    for (const s of this.#alleys()) this.#path([this.#at(s, FRONT - 0.2), this.#at(s, 16), this.#at(s + 1, 23.5)], 2.2, this.#walkY(s, 1), null, false);
    for (const [s, o, w, d, kind] of BACK) {
      const yaw = faceRoad(s, 1) + (r() - 0.5) * 0.08, [x, z] = this.#at(s, o), L = this.#local(x, z, yaw);
      let hi = -Infinity, lo = Infinity; for (let u = -w / 2; u <= w / 2; u += w / 3) for (let v = -d / 2; v <= d / 2; v += d / 3) { const g = this.#ground(...L(u, v)); hi = Math.max(hi, g); lo = Math.min(lo, g); }
      const y = hi + 0.2, p = new Parts();
      let wallH = 2.4;
      if (kind === 'shed') shed(p, w, d, r);
      else {
        const res = kisoHouse(p, { w, d, kind: kind === 'kura' ? 'kura' : 'hira', roof: r() < 0.5 ? 'ishi' : 'sheet', role: 'home', r, lit: 0.4, base: y - lo + 0.4 });
        wallH = res.wallH;
        if (res.smoke) { const [sx, sz] = L(res.smoke[0], res.smoke[2]); this.#smoke.push([sx, y + res.smoke[1], sz]); }
      }
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(x, z, -yaw, w / 2 + 0.05, d / 2 + 0.05, y - 1, y + wallH);
    }
    // Weißer Kei-Van am Anfang der zweiten Hintergasse (wie im Referenzbild von Narai).
    {
      const [s0, o0] = BACK_LANES[1]![1]!, s = s0 + 4, o = o0 + 3.2, [x, z] = this.#at(s, o), yaw = faceRoad(s, 1) + Math.PI / 2 + 0.1, y = this.#ground(x, z);
      const v = new Parts();
      v.mass.box(0, 0.95, 0, 1.46, 1.3, 3.3, 0xeeeeea);
      v.glass.box(0, 1.3, 1.66, 1.3, 0.55, 0.02, 0x2f3d45);
      for (const e of [-1, 1]) { v.glass.box(e * 0.735, 1.3, 0.6, 0.02, 0.5, 1.4, 0x2f3d45); for (const zz of [1.05, -1.05]) v.detail.add(new CylinderGeometry(0.27, 0.27, 0.2, 10), 0x1a1a1a, e * 0.66, 0.27, zz, 0, 0, Math.PI / 2); }
      v.detail.box(0, 0.45, 1.66, 1.4, 0.25, 0.06, 0xb8b8b2); v.detail.box(0, 0.55, -1.66, 1.4, 0.3, 0.06, 0xb8b8b2);
      for (const e of [-0.5, 0.5]) v.glow.box(e, 0.75, 1.67, 0.2, 0.12, 0.02, 0xfff2d0);
      place(v, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(x, z, -yaw, 0.75, 1.7, y, y + 1.7);
    }
    for (const [s, o, w, d] of GARDENS) {
      const yaw = faceRoad(s, 1), [x, z] = this.#at(s, o), p = new Parts(); garden(p, w, d, r);
      let lo = Infinity; const L = this.#local(x, z, yaw); for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]] as const) lo = Math.min(lo, this.#ground(...L(u, v)));
      place(p, this.#chunk(x, z), x, lo - 0.02, z, yaw);
      const k = this.#chunk(x, z).detail, c = [L(-w / 2 - 0.3, -d / 2 - 0.3), L(w / 2 + 0.3, -d / 2 - 0.3), L(w / 2 + 0.3, d / 2 + 0.3), L(-w / 2 - 0.3, d / 2 + 0.3)];
      for (let i = 0; i < 3; i++) fence(k, c[i]![0], c[i]![1], c[i + 1]![0], c[i + 1]![1], this.#ground(c[i]![0], c[i]![1]));
    }
    // Friedhof: Grabreihen auf dem Gelände, ein paar Zedern dazwischen.
    {
      const yaw = faceRoad(CEMETERY.s, 1), [x, z] = this.#at(CEMETERY.s, CEMETERY.o), p = new Parts(); graves(p, 7, 4, r);
      place(p, this.#chunk(x, z), x, this.#ground(x, z) - 0.05, z, yaw);
      const L = this.#local(x, z, yaw);
      for (const [u, v] of [[-5.5, -3.6], [5.8, -3.8], [-5.6, 3.4]] as const) { const [tx, tz] = L(u, v); sugi(this.#chunk(tx, tz).mass, tx, this.#ground(tx, tz) - 0.2, tz, 0.9, r); }
      this.drive.collision.addOrientedBox(x, z, -yaw, 4.7, 3, this.#ground(x, z), this.#ground(x, z) + 1.2);
    }
  }

  // ── Ortseingänge ────────────────────────────────────────────────────────────

  #buildGates(): void {
    const r = rng(0x6a7e);
    // Kōsatsu-ba am unteren Eingang, Hangseite, schaut zur Straße.
    {
      const [x, z] = this.#at(KOSATSU.s, KOSATSU.o), yaw = faceRoad(KOSATSU.s, -1), y = Math.max(this.#walkY(KOSATSU.s, -1), this.#ground(x, z)) - 0.02;
      const p = new Parts(); kosatsu(p, r); place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addOrientedBox(x, z, -yaw, 2.4, 0.8, y, y + 3.2);
    }
    for (const g of GATES) {
      const side = g.side, o = FRONT - 0.3, [x, z] = this.#at(g.s, side * o), yaw = faceRoad(g.s, side), y = this.#walkY(g.s, side);
      const p = new Parts(); milestone(p, r); place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addCylinder(x, z, 0.4, y, y + 2);
      // Ortsschild aus Holz, beidseitig lesbar, quer zur Straße.
      const [sx, sz] = this.#at(g.s + (side > 0 ? -3 : 3), side * (FRONT + 0.6));
      this.#sign(sx, this.#walkY(g.s, side) + 2.6, sz, faceRoad(g.s, side) + Math.PI / 2 * side * 0.45, '木曽宿', 'Kiso-juku', 'POST TOWN · NAKASENDO · 1602', 3.6);
    }
    // Tafeln: Ortsplan, Info, Bärenwarnung (am Aufgang), Bushaltestelle.
    const board = (s: number, o: number, t: Tile, w: number, h: number, side: 1 | -1): void => {
      const [x, z] = this.#at(s, o), y = this.#height(x, z), yaw = faceRoad(s, side), p = new Parts();
      p.detail.box(0, 1.2 + h / 2, 0, w + 0.2, h + 0.2, 0.08, TIMBER_DARK);
      p.detail.box(0, 1.35 + h, 0, w + 0.5, 0.1, 0.4, 0x3f474d);
      tilePlate(p.sign, t, 0, 1.2 + h / 2, 0.05, w, h, 'z', 1);
      for (const e of [-1, 1]) p.detail.box(e * w * 0.45, (1.2 + h / 2) / 2, 0, 0.1, 1.2 + h / 2, 0.1, TIMBER_DARK);
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addCylinder(x, z, 0.3, y, y + 2.5);
    };
    board(1678, 5.9, tile(T.mapBoard), 2.2, 1.1, 1);
    board(1945, -5.9, tile(T.info), 2.0, 1.0, -1);
    board(WHEEL.s + 2.3, -6.1, tile(T.bear), 1.1, 0.55, -1);
    board(HONJIN.s + 15.5, 5.9, tile(T.poster), 1.0, 0.5, 1);
    {
      const s = 1947, [x, z] = this.#at(s, 5.7), y = this.#walkY(s, 1), p = new Parts(), yaw = faceRoad(s, 1);
      p.detail.add(new CylinderGeometry(0.04, 0.04, 2.4, 6), 0xb8bcbc, 0, 1.2, 0);
      tilePlate(p.sign, tile(T.busStop, 0, 0, 128, 128), 0, 2.2, 0.03, 0.62, 0.62, 'z', 1);
      bench(p, 1.4, 0, 0.1, 'x', false);
      place(p, this.#chunk(x, z), x, y, z, yaw);
    }
  }

  // ── Zufahrten ───────────────────────────────────────────────────────────

  /**
   * Die 90 m vor und hinter dem Ort. Vorher hörte das Dorf an der letzten Hauswand
   * auf, und dahinter lag der nackte Anschnitt des Passes. Kiso-Straßen haben dort
   * Ishigaki-Stützmauern, Leitungsmasten, Wegweiser, einen Jizō am Weg und Holz vom
   * Einschlag am Straßenrand — alles außerhalb von ±4,25 m.
   */
  #buildApproaches(): void {
    const r = rng(0xa991), spans: [number, number][] = [[1582, KISO.s0 - 1], [KISO.s1 + 1, 2040]];
    // Nischen in der Mauer: dort stehen Jizō und Holzstapel vor dem Anschnitt.
    const niches: [number, number, number][] = [[1, 1614, 1622], [-1, 1986, 1994], [-1, 1592, 1600]];
    // Stützmauern, wo der Anschnitt höher als 1 m ist; Mauerkrone mit Büschen.
    for (const [a, b] of spans) for (const side of [1, -1] as const) for (let s = a; s < b; s += 2) {
      if (niches.some(([sd, a0, a1]) => sd === side && s + 2 > a0 && s < a1)) continue;
      const f = frame(s + 1), yaw = Math.atan2(f.tx, f.tz), road = this.#road(s + 1);
      const [tx, tz] = this.#at(s + 1, side * 7.5), top = Math.min(road + 2.8, this.#ground(tx, tz) + 0.25);
      if (top - road < 1.0) continue;
      const [wx, wz] = this.#at(s + 1, side * 5.8), k = this.#chunk(wx, wz), face = Math.atan2(-f.nx * side, -f.nz * side);
      k.mass.box(wx, (top + road - 0.3) / 2, wz, 0.9, top - road + 0.3, 2.02, 0x3f3c37, 0, yaw);
      let row = 0;
      // Bruchsteine: ungleich breit und hoch, dunkel mit Fugen — gleich große helle Platten
      // lasen sich im ersten Bild als Betonsteinmauer.
      for (let y = road + 0.15; y < top - 0.15; row++) {
        const h = 0.26 + r() * 0.2;
        for (let u = -1.0 + r() * 0.2; u < 0.95;) {
          const w = Math.min(0.95 - u, 0.38 + r() * 0.5), [px, pz] = this.#at(s + 1 + u + w / 2, side * 5.34);
          k.fine.add(new PlaneGeometry(w - 0.05, h - 0.05), jitter(shade(STONE, 0.6), r, 0.32), px, y + h / 2, pz, 0, face, (r() - 0.5) * 0.08);
          u += w;
        }
        y += h;
      }
      // Rinne am Mauerfuß (Betonschale) und Moos auf der Krone.
      const [gx, gz] = this.#at(s + 1, side * 4.95);
      k.detail.add(new PlaneGeometry(0.5, 2.02), 0x5a5750, gx, road - 0.12, gz, -Math.PI / 2 + Math.atan2(this.#road(s) - this.#road(s + 2), 2), yaw);
      k.detail.box(wx, top + 0.05, wz, 1.0, 0.1, 2.02, jitter(0x4a5a2e, r, 0.15), 0, yaw);
      if (r() < 0.45) { const [bx, bz] = this.#at(s + 1, side * 6.8), g = new IcosahedronGeometry(0.6 + r() * 0.5, 0); g.scale(1.3, 0.8, 1.1); k.detail.add(g, jitter(0x3a5a2a, r, 0.12), bx, top + 0.3, bz); }
      const [ax, az] = this.#at(s, side * 5.4), [cx, cz] = this.#at(s + 2, side * 5.4);
      this.drive.collision.addWall(ax, az, cx, cz, 0.2, road - 0.3, top);
    }
    // Leitungsmasten mit Leitungen an der Talseite, nur außerhalb des Ortskerns (wie in Narai).
    const wires: number[] = [];
    for (const [a, b] of spans) {
      let prev: Vector3 | null = null;
      for (let s = a + 6; s < b - 4; s += 28) {
        const [x, z] = this.#at(s, 6.6), y = Math.max(this.#ground(x, z), this.#road(s)) - 0.2, k = this.#chunk(x, z);
        k.mass.add(new CylinderGeometry(0.12, 0.16, 9.2, 6), 0x6b5a4a, x, y + 4.6, z);
        k.detail.box(x, y + 8.5, z, 1.5, 0.1, 0.1, 0x55504a, 0, Math.atan2(frame(s).nx, frame(s).nz));
        if (r() < 0.5) k.detail.add(new CylinderGeometry(0.28, 0.28, 0.85, 8), 0x9ea3a3, x + 0.3, y + 7.3, z);
        this.drive.collision.addCylinder(x, z, 0.18, y, y + 8);
        const cur = new Vector3(x, y + 8.5, z);
        if (prev) for (const off of [-0.6, 0, 0.6]) for (let q = 0; q < 8; q++) {
          const t0 = q / 8, t1 = (q + 1) / 8, sag = (u: number): number => -Math.sin(u * Math.PI) * 0.55, f = frame(s);
          wires.push(prev.x + (cur.x - prev.x) * t0 + f.nx * off, prev.y + (cur.y - prev.y) * t0 + sag(t0), prev.z + (cur.z - prev.z) * t0 + f.nz * off,
            prev.x + (cur.x - prev.x) * t1 + f.nx * off, prev.y + (cur.y - prev.y) * t1 + sag(t1), prev.z + (cur.z - prev.z) * t1 + f.nz * off);
        }
        prev = cur;
      }
    }
    if (wires.length) { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(wires, 3)); const l = new LineSegments(g, new LineBasicMaterial({ color: 0x1a1d20 })); l.name = 'Kiso Leitungen'; this.#near.add(l); }
    // Wegweiser: Pfosten mit zwei Pfeilbrettern, quer zur Straße lesbar.
    const trail = tile(T.woodGrain);
    for (const [s, side] of [[1606, 1], [1646, -1], [1975, 1], [2016, -1]] as const) {
      const [x, z] = this.#at(s, side * 5.0), y = this.#road(s) - 0.15, p = new Parts(), yaw = faceRoad(s, side);
      p.detail.box(0, 1.3, 0, 0.12, 2.6, 0.12, 0x3a2c20);
      for (const [yy, half] of [[2.2, 0], [1.75, 1]] as const) {
        const tt = [trail[0], trail[1] + (trail[3] - trail[1]) * (half ? 0 : 0.5), trail[2], trail[1] + (trail[3] - trail[1]) * (half ? 0.5 : 1)] as unknown as Tile;
        tilePlate(p.sign, tt, 0, yy, 0.08, 1.3, 0.34, 'z', 1);
        tilePlate(p.sign, tt, 0, yy, -0.08, 1.3, 0.34, 'z', -1);
        p.detail.box(0, yy, 0, 1.28, 0.32, 0.12, 0x5a4430);
      }
      p.detail.add(new ConeGeometry(0.12, 0.14, 4), 0x2a2622, 0, 2.66, 0, 0, Math.PI / 4, 0);
      place(p, this.#chunk(x, z), x, y, z, yaw);
      this.drive.collision.addCylinder(x, z, 0.12, y, y + 2.6);
    }
    // Steinlaternen am Ortseingang, beidseitig.
    for (const s of [KISO.s0 - 2.5, KISO.s1 + 2.5]) for (const side of [1, -1] as const) {
      const [x, z] = this.#at(s, side * 5.2), y = this.#road(s) - 0.1, p = new Parts();
      kasugaLantern(p, 0, 0, 0, r); p.mass.box(0, -0.3, 0, 0.9, 0.7, 0.9, 0x7a766d);
      place(p, this.#chunk(x, z), x, y + 0.05, z, 0);
      this.drive.collision.addCylinder(x, z, 0.4, y, y + 2);
      this.#lamps.push({ s, side });
    }
    // Sechs Jizō unter einem Dach am südlichen Zugang (derselbe Bau wie im Bauerndorf).
    {
      const s = 1618, [x, z] = this.#at(s, 6.1), y = this.#road(s) - 0.1, p = new Parts();
      jizoShelter(p, r); place(p, this.#chunk(x, z), x, y, z, faceRoad(s, 1));
      this.drive.collision.addOrientedBox(x, z, -faceRoad(s, 1), 2.2, 0.8, y, y + 2.5);
    }
    // Stämme vom Einschlag (Kiso-Hinoki) am Straßenrand, mit Keilen gesichert.
    for (const [s, side, n] of [[1990, -1, 9], [1596, -1, 6]] as const) {
      const f = frame(s), yaw = Math.atan2(f.tx, f.tz), y = this.#road(s) - 0.2, [x, z] = this.#at(s, side * 5.3), k = this.#chunk(x, z);
      for (let i = 0; i < n; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : 2, inRow = i - [0, 4, 7][row]!, rr = 0.2 + r() * 0.06;
        const o = (inRow - [1.5, 1, 0.5][row]!) * 0.44, len = 5.6 + r() * 0.6;
        k.detail.add(new CylinderGeometry(rr, rr * 1.05, len, 8), jitter(0x5e4d3c, r, 0.12), x + f.nx * o * side * 0.9, y + rr + row * 0.38, z + f.nz * o * side * 0.9, Math.PI / 2, yaw);
        for (const e of [-1, 1]) k.detail.add(new CircleGeometry(rr * 0.95, 8), jitter(0xb8986a, r, 0.1), x + f.nx * o * side * 0.9 + f.tx * e * len / 2, y + rr + row * 0.38, z + f.nz * o * side * 0.9 + f.tz * e * len / 2, 0, yaw + (e > 0 ? 0 : Math.PI), 0);
      }
      const [ax, az] = this.#at(s - 3, side * 5.3), [bx, bz] = this.#at(s + 3, side * 5.3);
      this.drive.collision.addWall(ax, az, bx, bz, 1.0, y, y + 1.6);
    }
    // Kurvenspiegel an der Kehre hinter dem Dorf.
    {
      const s = 2045, [x, z] = this.#at(s, 5.2), y = this.#road(s) - 0.1, k = this.#chunk(x, z), yaw = faceRoad(s, 1) + 0.6;
      k.detail.add(new CylinderGeometry(0.05, 0.05, 2.9, 6), 0xe86a1c, x, y + 1.45, z);
      k.detail.add(new CylinderGeometry(0.42, 0.42, 0.06, 16), 0xe86a1c, x, y + 3.0, z, Math.PI / 2, yaw);
      k.glass.add(new CylinderGeometry(0.37, 0.37, 0.02, 16), 0xb8c8d0, x + Math.sin(yaw) * 0.04, y + 3.0, z + Math.cos(yaw) * 0.04, Math.PI / 2, yaw);
      this.drive.collision.addCylinder(x, z, 0.1, y, y + 3);
    }
  }

  /** Großes Holzschild mit eigener Leinwand (wie in Stillwater), beidseitig. */
  #sign(x: number, y: number, z: number, yaw: number, kanji: string, title: string, sub: string, width: number): void {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 172;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#2b2119'; c.fillRect(0, 0, 512, 172);
    for (let i = 0; i < 30; i++) { c.strokeStyle = `rgba(0,0,0,${0.08 + (i % 4) * 0.03})`; c.beginPath(); c.moveTo(0, i * 6); c.bezierCurveTo(170, i * 6 + 4, 340, i * 6 - 4, 512, i * 6 + 2); c.stroke(); }
    c.strokeStyle = '#c9b48a'; c.lineWidth = 4; c.strokeRect(9, 9, 494, 154);
    c.fillStyle = '#f3e6c8'; c.textAlign = 'left';
    c.font = '600 86px "Yu Mincho", "Hiragino Mincho ProN", serif'; c.fillText(kanji, 22, 118);
    c.textAlign = 'right'; c.font = '600 42px Georgia, serif'; c.fillText(title, 490, 84);
    c.font = '18px system-ui, sans-serif'; c.fillStyle = '#d7c49c'; c.fillText(sub, 490, 122);
    const tex = new CanvasTexture(canvas); tex.anisotropy = 4; tex.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: tex });
    for (const side of [0, Math.PI]) {
      const mesh = new Mesh(new PlaneGeometry(width, width / 3), material);
      mesh.position.set(x + Math.sin(yaw + side) * 0.04, y, z + Math.cos(yaw + side) * 0.04); mesh.rotation.y = yaw + side; mesh.name = 'Kiso Ortsschild';
      this.group.add(mesh);
    }
    const k = this.#chunk(x, z);
    k.detail.box(x, y, z, width + 0.16, width / 3 + 0.16, 0.05, TIMBER_DARK, 0, yaw);
    k.detail.box(x, y + width / 6 + 0.16, z, width + 0.5, 0.12, 0.35, 0x3f474d, 0, yaw);
    for (const e of [-1, 1]) {
      const px = x + Math.cos(yaw) * e * width * 0.4, pz = z - Math.sin(yaw) * e * width * 0.4, g = this.#height(px, pz);
      k.detail.box(px, (g + y) / 2, pz, 0.14, Math.max(0.1, y - g), 0.14, TIMBER_DARK);
      this.drive.collision.addCylinder(px, pz, 0.12, g, y);
    }
  }

  // ── Bäume ──────────────────────────────────────────────────────────────────

  #clear(x: number, z: number, rad: number): boolean {
    return this.houses.every(h => Math.hypot(h.x - x, h.z - z) > h.d / 2 + 4.5 + rad)
      && this.lane.every(p => Math.hypot(p.x - x, p.z - z) > 2.2 + rad)
      && this.floors.height(x, z) < this.#ground(x, z) - 0.3;
  }

  #buildTrees(): void {
    const r = rng(0x7ee5);
    FOREST.forEach(([s, o, sc]) => {
      const [x, z] = this.#at(s, o);
      if (!this.#clear(x, z, 1.2)) return;
      const y = this.#ground(x, z) - 0.25;
      sugi(this.#chunk(x, z).mass, x, y, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.4 * sc, y, y + 8);
    });
    MOMIJI.forEach(([s, o, sc]) => {
      const [x, z] = this.#at(s, o), k = this.#chunk(x, z), y = this.#height(x, z) - 0.05;
      momiji(k.mass, k.detail, x, y, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.2, y, y + 3);
    });
    NIWAKI.forEach(([s, o, sc]) => {
      const [x, z] = this.#at(s, o), k = this.#chunk(x, z), y = this.#height(x, z) - 0.05;
      niwaki(k.mass, k.detail, x, y, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.2, y, y + 2.5);
    });
    KAKI_TREES.forEach(([s, o, sc]) => {
      const [x, z] = this.#at(s, o), y = this.#height(x, z) - 0.05;
      kaki(this.#chunk(x, z), x, y, z, sc, r);
      this.drive.collision.addCylinder(x, z, 0.25, y, y + 3);
    });
    // Bambus am Hang über dem unteren und dem oberen Ortsende.
    for (const [s, o, n] of [[1700, -20, 18], [1918, -18, 16], [1742, 48, 14]] as const) {
      const [x, z] = this.#at(s, o); if (!this.#clear(x, z, 3)) continue;
      bamboo(this.#chunk(x, z), x, this.#ground(x, z) - 0.1, z, n, r);
    }
  }

  // ── Licht auf dem Pflaster ───────────────────────────────────────────────

  /**
   * Warme Lichtflecken unter Laternen und vor offenen Türen. Die Szene steht in
   * der Abendsonne (2,2° über dem Horizont) und hat keine Punktlichter — jedes
   * zusätzliche Licht kostet in three jedes Material eine neue Shader-Variante.
   * Stattdessen additive Flächen mit radialem Verlauf, ein Draw-Call für das
   * ganze Dorf. Geneigt mit der Straße; auf dem Gehweg und auf der Fahrbahn
   * getrennt, weil zwischen beiden 22 cm Bordstein liegen.
   */
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
      pool(s, side * (GUTTER[1] + FRONT) / 2, this.#walkY(s, side), len, FRONT - GUTTER[1] - 0.05, tilt, color);
    };
    const roadPool = (s: number, side: 1 | -1, len: number, color: number): void => {
      pool(s, side * 2.6, this.#road(s) + 0.015, len, 2.6, Math.atan2(this.#road(s - 1) - this.#road(s + 1), 2), color);
    };
    for (const l of this.#lamps) { walkPool(l.s, l.side, 3.4, 0x6a4a28); roadPool(l.s, l.side, 3.2, 0x3a2814); }
    for (const d of this.#doors) if (d.lit) { walkPool(d.s, d.side, 2.6, 0x5a3c1e); roadPool(d.s, d.side, 2.2, 0x1e140a); }
    const m = new Mesh(kit.geometry(), mat); m.name = 'Kiso Lichtflecken'; m.renderOrder = 2; this.#near.add(m);
  }

  // ── Rauch ────────────────────────────────────────────────────────────────

  #buildLife(): void {
    // Keine Figuren (docs/DOERFER.md §3: Leute kommen später) — nur Herdrauch.
    this.#life = new FunauraLife(
      (x, z) => this.#height(x, z),
      { solid: this.#solid, boat: this.#solid, glow: this.#glow, sign: this.#signMat!, cloth: this.#cloth },
      [], this.#smoke, { boats: false, name: 'Kiso smoke', smokeRise: 8 },
    );
    this.group.add(this.#life.group);
    this.#life.update(0);
  }

  // ── Zusammenbau ──────────────────────────────────────────────────────────

  #finishChunks(): void {
    let triangles = 0;
    const white = tile(T.white, 100, 40, 104, 44);
    if (this.#streams.parts.length) { const m = new Mesh(this.#streams.geometry(), this.#streamMat!); m.name = 'Kiso Wasser am Rad'; this.#near.add(m); }
    for (const c of this.#chunks.values()) {
      const make = (k: SettlementKit, mat: MeshStandardMaterial | MeshBasicMaterial, name: string): Mesh | null => {
        if (!k.parts.length) return null;
        const mesh = new Mesh(k.geometry(), mat); mesh.name = name; mesh.receiveShadow = true;
        triangles += mesh.geometry.getAttribute('position').count / 3;
        mesh.geometry.computeBoundingBox(); c.box.union(mesh.geometry.boundingBox!);
        this.group.add(mesh); return mesh;
      };
      c.mass = make(c.parts.mass, this.#solid, `Kiso mass ${c.x},${c.z}`);
      c.thatch = make(c.parts.thatch, this.#thatchMat, `Kiso thatch ${c.x},${c.z}`);
      c.fine = make(c.parts.fine, this.#solid, `Kiso fine ${c.x},${c.z}`);
      if (c.mass) c.mass.castShadow = true;
      if (c.thatch) c.thatch.castShadow = true;
      for (const part of c.parts.glow.parts) {
        const n = part.getAttribute('position').count, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = white[0]; uv[i * 2 + 1] = white[1]; }
        part.setAttribute('uv', new Float32BufferAttribute(uv, 2)); c.parts.signGlow.parts.push(part);
      }
      c.parts.glow.parts.length = 0;
      for (const [k, m, n] of [[c.parts.detail, this.#solid, 'detail'], [c.parts.glass, this.#glass, 'glass'], [c.parts.cloth, this.#cloth, 'cloth'],
        [c.parts.sign, this.#signMat!, 'sign'], [c.parts.signGlow, this.#signGlow!, 'glow'], [c.parts.interior, this.#interiorMat, 'interior'],
        [c.parts.interiorTex, this.#interiorTex!, 'interior-tex']] as const) {
        const mesh = make(k, m, `Kiso ${n} ${c.x},${c.z}`);
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
      honjin: 'The Honjin: where the daimyō slept on the way to Edo. Through the gate, past the pine — the doors are open.',
      irori: 'The irori never went out. Fish on skewers, a kettle on the hook, and the smoke curing the beams black for two hundred years.',
      wheel: 'The wheel husks buckwheat for the soba shop across the street. The water comes down from the cedars.',
      kosatsu: 'Kōsatsu: the lord’s notices, posted at every post town — prices, curfews, and what happens to smugglers.',
      tea: 'The pass teahouse. Sweet amazake, a skewer of dango, and the whole valley under the eaves.',
      bell: 'The bell is rung at dusk. One strike for each of the hundred and eight worldly desires, on New Year’s Eve.',
      gohei: 'Gohei-mochi: pounded rice on a cedar paddle, glazed with walnut miso and grilled over charcoal.',
      marker: 'Nakasendō: 534 km of mountain road between Kyoto and Edo, sixty-nine post towns. This is one of them.',
      shrine: 'A mountain shrine for the god of the pass. Travellers left a coin and a prayer for safe feet.',
    };
    this.#message = text[this.#spot]; this.#messageUntil = this.#time + 9;
  }

  update(dt: number): void {
    this.#time += dt;
    const camera = this.#context!.camera, cx = camera.position.x, cz = camera.position.z;
    const distance = Math.hypot(cx - KISO.x, cz - KISO.z);
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
      for (const w of this.wheels) w.inner.rotation.x -= dt * w.speed;
      if (this.#rippleTex) this.#rippleTex.offset.y = (this.#rippleTex.offset.y - dt * 0.35) % 1;
    }
    const p = this.drive.walking ? this.drive.walker.position : this.drive.vehicle.position;
    const near = Math.hypot(p.x - KISO.x, p.z - KISO.z) < 190;
    this.panel.hidden = !this.isPlaying() || !near;
    if (this.panel.hidden) return;
    this.#spot = '';
    if (this.drive.walking) {
      const spot = (id: Spot, s: number, o: number, rr: number): [Spot, number, number, number] => { const [x, z] = this.#at(s, o); return [id, x, z, rr]; };
      const gohei = HOUSES.find(h => h.role === 'gohei')!;
      const spots: [Spot, number, number, number][] = [
        spot('honjin', HONJIN.s, FRONT - 0.5, 3.5), ['irori', ...this.honjinPoint, 3.2], spot('wheel', WHEEL.s, -5.6, 3),
        spot('kosatsu', KOSATSU.s, -5.6, 3.5), spot('gohei', gohei.s, 5.6, 3), spot('marker', GATES[0].s, 5.6, 3),
        spot('bell', BELL.s, BELL.o + 2.5, 3.5), spot('shrine', HOKORA.s, HOKORA.o + 2.8, 3),
      ];
      if (this.teaDeck) spots.push(['tea', this.teaDeck.x, this.teaDeck.z, 3.5]);
      for (const [id, x, z, rr] of spots) if (Math.hypot(p.x - x, p.z - z) < rr) this.#spot = id;
    }
    this.action.hidden = !this.#spot;
    this.action.textContent = 'Inspect · Enter';
    this.label.textContent = this.#time < this.#messageUntil ? this.#message
      : this.#spot ? 'Kiso-juku · Something worth a closer look.'
      : 'Kiso-juku 木曽宿 · Post town on the Nakasendō. The pass road runs straight through; the stone lane climbs to the teahouse.';
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#key); this.panel.remove();
    const stack = this.drive.ground.localSurfaces;
    if (stack && 'layers' in stack) { const l = (stack as { layers: unknown[] }).layers, i = l.indexOf(this.floors); if (i >= 0) l.splice(i, 1); }
    const materials = new Set<{ dispose(): void; map?: { dispose(): void } | null }>();
    this.group.removeFromParent();
    this.group.traverse(o => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m as MeshBasicMaterial);
      }
    });
    for (const m of materials) { m.map?.dispose(); m.dispose(); }
  }
}

const WALK_S0 = KISO.s0 - 12, WALK_S1 = KISO.s1 + 12;
