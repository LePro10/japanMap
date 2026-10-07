import {
  BoxGeometry,
  CanvasTexture,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';

import { CITY_GROUND_Y, CITY_ROAD_LEVEL } from '@/config/city.config';
import { KABUKI_GATE, LANDMARKS, RAIL_LINE, SCRAMBLE, SPECIAL_SITES } from '@/config/tokyoLayout.mjs';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { SettlementKit } from '../settlements/SettlementKit';

/**
 * Neo-Tokio: die Wahrzeichen (docs/TOKYO.md, Phase 4).
 *
 * Alles, was **nicht** aus dem Raster folgt, sondern an einem bestimmten Ort
 * steht und die Stadt wiedererkennbar macht: die Diagonalen der Scramble, die
 * Videowände zur Kreuzung, die Hochbahn mit Zug, das Tor nach Kabukichō und der
 * rote Gitterturm am Hang. Drei Materialien, sechs Draw-Calls; der Zug und die
 * Videowände sind die einzigen Teile, die sich bewegen.
 *
 * Kollision: Pfeiler, Torpfosten und Turmbeine. Die Fahrbahnplatte der Hochbahn
 * liegt 9,5 m über der Stadt und braucht keine — `CollisionWorld`-Körper tragen
 * eine Höhenspanne, ein Auto darunter berührt sie nicht.
 */
export class TokyoLandmarkSystem implements System {
  readonly name = 'TokyoLandmarkSystem';
  readonly group = new Group();

  #context: EngineContext | null = null;
  #train: Mesh | null = null;
  #trainLights: Mesh | null = null;
  #trainZ = 0;
  #trainDir = 1;
  #screens: CanvasTexture | null = null;
  #screenClock = 0;
  readonly #materials: (MeshStandardMaterial | MeshBasicMaterial)[] = [];

  constructor(private readonly drive: DriveSystem) {}

  init(context: EngineContext): void {
    this.#context = context;
    this.group.name = 'Tokio Wahrzeichen';
    const terrain = this.drive.terrain;
    const roads = this.drive.roads;
    if (!terrain || !roads) throw new Error('TokyoLandmarkSystem braucht Gelände und Straßennetz.');

    const solid = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18 });
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.#materials.push(solid, glow);
    const structure = new SettlementKit();
    const lights = new SettlementKit();
    const top = CITY_GROUND_Y + 0.15;
    const collide = (x: number, z: number, hx: number, hz: number, bottom: number, height: number): void => {
      this.drive.collision.addBox(x - hx, x + hx, z - hz, z + hz, bottom, bottom + height);
    };
    // Frei von Fahrbahn? Nur die untere Ebene zählt — unter der Ring-Hochstraße ist Platz.
    const offRoad = (x: number, z: number, margin: number): boolean => {
      const hit = roads.closestPoint(x, z, 20, CITY_ROAD_LEVEL);
      return !hit || hit.distance > hit.width / 2 + margin;
    };

    // ── Scramble: zwei Diagonalen über die ganze Kreuzung ──────────────────
    const paint = new SettlementKit();
    const white = 0xd9dccf;
    const paintY = CITY_GROUND_Y + 0.075;
    const half = { x: 12, z: 8 };
    for (const sign of [1, -1]) {
      const dx = half.x * 2, dz = half.z * 2 * sign;
      const len = Math.hypot(dx, dz);
      const a = Math.atan2(dx, dz);
      for (let d = -len / 2 + 3; d <= len / 2 - 3; d += 1.1) {
        if (Math.abs(d) < 2.2) continue; // Die Mitte bleibt frei, sonst liegen beide Muster übereinander.
        paint.box(SCRAMBLE.x + (dx / len) * d, paintY, SCRAMBLE.z + (dz / len) * d, 4.2, 0.012, 0.55, white, 0, a);
      }
    }

    // ── Videowände zur Kreuzung ─────────────────────────────────────────────
    this.#screens = buildScreenTexture();
    context.resources.track(this.#screens);
    const screenMaterial = new MeshBasicMaterial({ map: this.#screens, toneMapped: false });
    screenMaterial.color.setScalar(1.35);
    this.#materials.push(screenMaterial);
    const tower = SPECIAL_SITES.find((s) => s.id === 'scramble-tower');
    const screens: { x: number; y: number; z: number; w: number; h: number; yaw: number; frame: number }[] = [];
    if (tower && tower.type === 'tower') {
      // Westwand des Hochhauses, zur Kreuzung — die große Wand über dem Platz.
      screens.push({ x: tower.minX - 0.4, y: top + 14, z: (tower.minZ + tower.maxZ) / 2, w: 26, h: 14, yaw: -Math.PI / 2, frame: 0 });
    }
    // Auf dem Bahnhofsdach, nach Südosten zur Kreuzung gedreht.
    const station = SPECIAL_SITES.find((s) => s.id === 'station');
    if (station && station.type === 'station') {
      const x = station.maxX - 8, z = station.maxZ - 6;
      screens.push({ x, y: top + 16, z, w: 18, h: 10, yaw: Math.atan2(SCRAMBLE.x - x, SCRAMBLE.z - z), frame: 1 });
      structure.box(x, top + 9.5, z, 1.2, 12, 1.2, 0x2a3036);
    }
    const screenGroup = new Group();
    for (const s of screens) {
      const plane = new PlaneGeometry(s.w, s.h);
      // Jede Wand zeigt ihr eigenes Viertel des 2 × 2-Atlas; der Takt schiebt alle weiter.
      const uv = plane.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + (s.frame % 2) * 0.5, uv.getY(i) * 0.5 + (s.frame >> 1) * 0.5);
      const mesh = new Mesh(plane, screenMaterial);
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.y = s.yaw;
      mesh.name = 'Videowand';
      screenGroup.add(mesh);
      // Rahmen, damit die Wand nicht als Aufkleber auf der Fassade klebt.
      structure.box(s.x - Math.sin(s.yaw) * 0.35, s.y, s.z - Math.cos(s.yaw) * 0.35, s.w + 1, s.h + 1, 0.6, 0x1b2127, 0, s.yaw);
    }

    // ── Hochbahn ────────────────────────────────────────────────────────────
    const deckY = top + RAIL_LINE.deck;
    const railX = RAIL_LINE.x;
    const deckLen = RAIL_LINE.maxZ - RAIL_LINE.minZ;
    const deckZ = (RAIL_LINE.minZ + RAIL_LINE.maxZ) / 2;
    structure.box(railX, deckY - 0.6, deckZ, RAIL_LINE.width, 1.2, deckLen, 0x6b6e70);
    for (const side of [-1, 1]) {
      structure.box(railX + side * (RAIL_LINE.width / 2 - 0.15), deckY + 0.5, deckZ, 0.3, 1.0, deckLen, 0x7a7d7f);
      structure.box(railX + side * 2.1, deckY + 0.08, deckZ, 0.12, 0.16, deckLen, 0x40403e);
      structure.box(railX + side * 2.1 + side * 1.07, deckY + 0.08, deckZ, 0.12, 0.16, deckLen, 0x40403e);
    }
    structure.box(railX, deckY + 0.02, deckZ, 7.6, 0.06, deckLen, 0x3b3a38);
    let pillars = 0;
    for (let z = RAIL_LINE.minZ + 6; z <= RAIL_LINE.maxZ - 6; z += 22) {
      // Nur in Blöcken, nie auf der Fahrbahn — bis zu 8 m verschieben, sonst weglassen.
      let pz: number | null = null;
      for (const o of [0, 4, -4, 8, -8]) {
        if (offRoad(railX, z + o, 1.6)) { pz = z + o; break; }
      }
      if (pz === null) continue;
      structure.box(railX, (top + deckY - 1.2) / 2, pz, 2.2, deckY - 1.2 - top, 2.2, 0x75797b);
      structure.box(railX, deckY - 1.6, pz, RAIL_LINE.width - 1, 0.8, 2.6, 0x686b6d);
      collide(railX, pz, 1.1, 1.1, CITY_GROUND_Y - 1, deckY - CITY_GROUND_Y);
      pillars++;
    }

    // Der Zug — sechs Wagen, silbern mit grünem Band, fährt hin und her.
    const train = new SettlementKit();
    const trainLights = new SettlementKit();
    for (let c = 0; c < 6; c++) {
      const cz = c * 20.6 - 51.5;
      train.box(2.1, 1.95, cz, 2.9, 3.5, 20, 0xb7bcbf);
      train.box(2.1, 3.8, cz, 2.6, 0.25, 19.6, 0x8d9396);
      for (const side of [-1, 1]) {
        train.box(2.1 + side * 1.46, 1.2, cz, 0.02, 0.28, 19.8, 0x3aa35b);
        trainLights.box(2.1 + side * 1.47, 2.35, cz, 0.02, 0.9, 18.6, 0xf2e6c4);
      }
    }
    this.#train = new Mesh(train.geometry(), solid);
    this.#train.name = 'Hochbahn Zug';
    this.#trainLights = new Mesh(trainLights.geometry(), glow);
    this.#trainLights.name = 'Hochbahn Zug Licht';
    this.#trainZ = RAIL_LINE.minZ + 80;
    for (const m of [this.#train, this.#trainLights]) {
      // Der Zug ist um x = 2,1 gebaut — er steht damit auf dem östlichen Gleis.
      m.position.set(railX, deckY + 0.2, this.#trainZ);
      this.group.add(m);
    }

    // ── Kabukichō-Tor ───────────────────────────────────────────────────────
    const g = KABUKI_GATE;
    const gz = g.z - 4;
    for (const side of [-1, 1]) {
      const px = g.x + (side * g.span) / 2;
      structure.box(px, top + g.height / 2, gz, 0.7, g.height, 0.7, 0x9e1f22);
      collide(px, gz, 0.4, 0.4, CITY_GROUND_Y - 1, g.height + 1);
    }
    structure.box(g.x, top + g.height + 0.9, gz, g.span + 1.6, 1.9, 0.8, 0x7e1418);
    const gateSign = buildGateTexture();
    context.resources.track(gateSign);
    const gateMaterial = new MeshBasicMaterial({ map: gateSign, toneMapped: false });
    gateMaterial.color.setScalar(1.25);
    this.#materials.push(gateMaterial);
    for (const face of [-1, 1]) {
      const plane = new Mesh(new PlaneGeometry(g.span, 1.5), gateMaterial);
      plane.position.set(g.x, top + g.height + 0.9, gz + face * 0.42);
      plane.rotation.y = face > 0 ? 0 : Math.PI;
      plane.name = 'Tor-Schild';
      screenGroup.add(plane);
    }
    // Glühbirnenkranz um das Schild, wie am Vorbild.
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      for (const face of [-1, 1]) {
        lights.ball(g.x - (g.span + 1.4) / 2 + u * (g.span + 1.4), top + g.height + 1.95, gz + face * 0.45, 0.09, 0xffa24a);
        lights.ball(g.x - (g.span + 1.4) / 2 + u * (g.span + 1.4), top + g.height - 0.15, gz + face * 0.45, 0.09, 0xffa24a);
      }
    }

    // ── Minato Tower ────────────────────────────────────────────────────────
    const t = LANDMARKS.tower;
    const ground = Math.min(
      terrain.getHeightAt(t.x - 20, t.z - 20),
      terrain.getHeightAt(t.x + 20, t.z - 20),
      terrain.getHeightAt(t.x - 20, t.z + 20),
      terrain.getHeightAt(t.x + 20, t.z + 20),
    );
    const H = t.height;
    const lattice = H * 0.73;
    const halfAt = (y: number): number => 22 * Math.pow(1 - y / lattice, 1.35) + 3.2;
    const band = (y: number): number => (Math.floor((y / lattice) * 7) % 2 === 0 ? 0xc8312a : 0xe8e2d6);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    const step = 9;
    for (let y = 0; y < lattice - 0.1; y += step) {
      const y1 = Math.min(lattice, y + step);
      const h0 = halfAt(y), h1 = halfAt(y1);
      for (let k = 0; k < 4; k++) {
        const [cx0, cz0] = corners[k]!;
        const [cx1, cz1] = corners[(k + 1) % 4]!;
        const p = (sx: number, sz: number, h: number, yy: number): Vector3 => new Vector3(t.x + sx * h, ground + yy, t.z + sz * h);
        beam(structure, p(cx0, cz0, h0, y), p(cx0, cz0, h1, y1), 0.9, band(y));
        beam(lights, p(cx0, cz0, h0, y), p(cx0, cz0, h1, y1), 0.35, 0xffb45c);
        beam(structure, p(cx0, cz0, h1, y1), p(cx1, cz1, h1, y1), 0.45, band(y1));
        beam(structure, p(cx0, cz0, h0, y), p(cx1, cz1, h1, y1), 0.3, band(y));
        beam(structure, p(cx1, cz1, h0, y), p(cx0, cz0, h1, y1), 0.3, band(y));
      }
      if (y === 0) for (const [sx, sz] of corners) collide(t.x + sx * h0, t.z + sz * h0, 1.5, 1.5, ground - 1, 12);
    }
    for (const [deckAt, size] of [[lattice * 0.52, 1.25], [lattice, 1.6]] as const) {
      const hw = halfAt(Math.min(deckAt, lattice - 0.01)) * size;
      structure.box(t.x, ground + deckAt, t.z, hw * 2, 5, hw * 2, 0x4e5559);
      lights.box(t.x, ground + deckAt + 0.6, t.z, hw * 2 + 0.1, 1.2, hw * 2 + 0.1, 0xffd9a0);
    }
    structure.cylinder(t.x, ground + lattice + (H - lattice) / 2, t.z, 0.9, H - lattice, 0xc8312a, 0, 0, 0.3);
    lights.ball(t.x, ground + H, t.z, 0.8, 0xff5040);

    // ── Kein Kaiju auf dem Kino (v2, verworfen) ─────────────────────────────
    // Versucht: ein Monsterkopf aus Quadern und Kegeln über dem Kinoplatz, wie im
    // Vorbild. Im Bild von der Hanamichi-dōri und vom Platz aus las er sich in
    // beiden Fassungen (Maßstab 1,0 und 1,6) als Kasten mit Zähnen, nicht als
    // Kopf. Ein Wahrzeichen, das man erst erklären muss, ist keines — dafür
    // braucht es ein richtiges Modell (docs/TOKYO.md, offene Punkte).

    // ── Zusammenbau ─────────────────────────────────────────────────────────
    paint.finish(this.group, solid, 'Scramble-Diagonalen');
    structure.finish(this.group, solid, 'Wahrzeichen');
    const lit = new Mesh(lights.geometry(), glow);
    lit.name = 'Wahrzeichen Licht';
    this.group.add(lit, screenGroup);
    context.scene.add(this.group);
    console.info(`[Tokio] Wahrzeichen: ${screens.length} Videowände, ${pillars} Bahnpfeiler, Turm auf ${ground.toFixed(1)} m`);
  }

  update(dt: number): void {
    // Zug: 14 m/s, am Ende umkehren. Die Strecke ist offen — an beiden Enden
    // verschwindet er im Hang bzw. hinter dem Stadtrand.
    if (this.#train && this.#trainLights) {
      this.#trainZ += this.#trainDir * 14 * dt;
      const lo = RAIL_LINE.minZ + 60, hi = RAIL_LINE.maxZ - 60;
      if (this.#trainZ > hi) { this.#trainZ = hi; this.#trainDir = -1; }
      if (this.#trainZ < lo) { this.#trainZ = lo; this.#trainDir = 1; }
      this.#train.position.z = this.#trainZ;
      this.#trainLights.position.z = this.#trainZ;
    }
    // Videowände: alle 5 s ein Viertel weiter.
    this.#screenClock += dt;
    if (this.#screens && this.#screenClock > 5) {
      this.#screenClock = 0;
      const o = this.#screens.offset;
      o.x = (o.x + 0.5) % 1;
      if (o.x === 0) o.y = (o.y + 0.5) % 1;
    }
  }

  dispose(): void {
    this.#context?.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.#materials) m.dispose();
    this.#screens?.dispose();
    this.#context = null;
  }
}

/** Ein Balken von a nach b — für das Gitter des Turms. */
function beam(kit: SettlementKit, a: Vector3, b: Vector3, thickness: number, color: number): void {
  const dir = new Vector3().subVectors(b, a);
  const length = dir.length();
  if (length < 1e-3) return;
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  const e = new Euler().setFromQuaternion(q);
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  kit.add(new BoxGeometry(thickness, length, thickness), color, mid.x, mid.y, mid.z, e.x, e.y, e.z);
}

/**
 * Vier erfundene Werbemotive auf einer Leinwand — keine echten Marken.
 * 2 × 2 Felder, das Material schiebt den Ausschnitt im Takt weiter.
 */
function buildScreenTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d')!;
  const frames: [string, string, string, string][] = [
    ['#ff3d7f', '#6b2bd9', 'NEO SODA', 'シュワッ'],
    ['#12c2e9', '#0b3d91', 'TOKYO DRIFT FM', '深夜'],
    ['#ffb627', '#e2412b', 'RAMEN 24H', 'ラーメン'],
    ['#2ee59d', '#115e67', 'KAIJU WARS', '怪獣'],
  ];
  frames.forEach(([a, b, title, kana], i) => {
    const x = (i % 2) * 512, y = (i >> 1) * 256;
    const grad = g.createLinearGradient(x, y, x + 512, y + 256);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(x, y, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let k = 0; k < 7; k++) g.fillRect(x + k * 80 - 30, y, 26, 256);
    g.fillStyle = '#ffffff';
    g.font = 'bold 64px sans-serif';
    g.fillText(title, x + 28, y + 150);
    g.font = 'bold 44px sans-serif';
    g.fillText(kana, x + 30, y + 214);
  });
  // Oben links statt unten links: die Ebene aus PlaneGeometry hat v = 1 oben.
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Der Takt schiebt den Ausschnitt über die Kante hinaus — ohne Wiederholung
  // stünde dort der Randpixel statt des nächsten Motivs.
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function buildGateTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#b3161b';
  g.fillRect(0, 0, 1024, 14);
  g.fillRect(0, 146, 1024, 14);
  g.fillStyle = '#1d1a18';
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.fillText('歌舞伎町 一番街', 512, 112);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
