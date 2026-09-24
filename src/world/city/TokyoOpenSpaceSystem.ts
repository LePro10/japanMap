import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShapeUtils,
  Vector2,
} from 'three';

import { CITY, CITY_GROUND_Y } from '@/config/city.config';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { SettlementKit } from '../settlements/SettlementKit';
import type { CitySystem } from './CitySystem';
import type { TokyoOpenLot } from './TokyoGenerator';

/**
 * Neo-Tokio: Parks, Schrein, Plätze, Münzparkplätze (docs/TOKYO.md, v2).
 *
 * ## Warum es das gibt
 *
 * Rückmeldung nach dem Teilstück: „mal ein Park oder mal was Verschiedenes", und
 * die Stadt sei zum Teil repetitiv. Eine Stadt aus lauter Blöcken ist auch dann
 * gleichförmig, wenn jeder Block anders ist — es fehlen die **Pausen**. Tokio hat
 * sie überall: den Park zwischen den Türmen, den Schrein hinter der
 * Wohnstraße, den Münzparkplatz in der Baulücke. Der Generator lässt diese
 * Flächen frei (`OPEN_SPACES` plus zufällige Parkplätze an der Front), und
 * dieses System füllt sie.
 *
 * Alles steht auf Gehweghöhe und wird je Fläche zu wenigen Meshes
 * zusammengefasst: ein fester Baukasten (Vertexfarben), ein leuchtender
 * (Laternen, Automaten). Kollision bekommen Stämme, Torpfosten, Bänke, Autos —
 * das, woran ein Auto in der echten Welt hängen bliebe.
 */
export class TokyoOpenSpaceSystem implements System {
  readonly name = 'TokyoOpenSpaceSystem';
  readonly group = new Group();
  #context: EngineContext | null = null;
  readonly #materials: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  readonly #readouts = { flaechen: '—' };

  constructor(private readonly drive: DriveSystem, private readonly city: CitySystem) {}

  init(context: EngineContext): void {
    this.#context = context;
    this.group.name = 'Tokio Freiflächen';
    const solid = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04 });
    const water = new MeshStandardMaterial({ color: 0x0b1418, roughness: 0.06, metalness: 0.3 });
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.#materials.push(solid, water, glow);

    const kit = new SettlementKit();
    const light = new SettlementKit();
    const pond = new SettlementKit();
    const y0 = CITY_GROUND_Y + CITY.sidewalk.height;
    const counts: Record<string, number> = {};
    let seed = 0x0be75;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const collision = this.drive.collision;
    const trunk = (x: number, z: number, r: number, h: number): void => {
      collision.addCylinder(x, z, r, y0 - 0.5, y0 + h);
    };

    for (const lot of this.city.openLots) {
      counts[lot.type] = (counts[lot.type] ?? 0) + 1;
      const frame = lotFrame(lot);
      switch (lot.type) {
        case 'park':
          buildPark(kit, light, pond, frame, y0, random, trunk);
          break;
        case 'shrine':
          buildShrine(kit, light, frame, y0, random, trunk, collision);
          break;
        case 'plaza':
          buildPlaza(kit, light, frame, y0, random, trunk);
          break;
        case 'parking':
          buildParking(kit, light, frame, y0, random, collision);
          break;
      }
    }
    // Gartenbäume der Vororte (Phase 5, `TokyoSuburbs`).
    for (const t of this.city.gardenTrees) {
      tree(kit, t.x, t.y, t.z, t.s, random, random() < 0.12);
      collision.addCylinder(t.x, t.z, 0.25 * t.s, t.y - 0.5, t.y + 3.2 * t.s);
    }
    counts.garten = this.city.gardenTrees.length;
    if (kit.parts.length) kit.finish(this.group, solid, 'Freiflächen');
    if (pond.parts.length) pond.finish(this.group, water as MeshStandardMaterial, 'Teiche');
    if (light.parts.length) {
      const mesh = new Mesh(light.geometry(), glow);
      mesh.name = 'Freiflächen-Licht';
      this.group.add(mesh);
    }
    context.scene.add(this.group);
    this.#readouts.flaechen = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
    context.debug?.folder('Stadt')?.addBinding(this.#readouts, 'flaechen', { readonly: true, label: 'Freiflächen' });
  }

  update(): void {
    /* statisch */
  }

  dispose(): void {
    this.#context?.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.#materials) m.dispose();
    this.#context = null;
  }
}

/**
 * Ein Rahmen je Fläche: Mitte, Achsen, halbe Maße. Die Freiflächen aus der
 * Vorlage sind achsparallele Vierecke, die Parkplätze gedrehte Rechtecke —
 * beide lassen sich so beschreiben, und alles Weitere rechnet lokal.
 */
interface LotFrame {
  readonly cx: number;
  readonly cz: number;
  /** Lokale x-Achse in Welt (entlang der Front bei Parkplätzen). */
  readonly ux: number;
  readonly uz: number;
  readonly hw: number;
  readonly hd: number;
  readonly yaw: number;
  readonly id: string;
  readonly polygon: readonly number[];
  /** Lokal → Welt. */
  at(u: number, v: number): [number, number];
}

function lotFrame(lot: TokyoOpenLot): LotFrame {
  if (lot.rect) {
    const { cx, cz, yaw, w, d } = lot.rect;
    const ux = Math.cos(yaw), uz = -Math.sin(yaw);
    return {
      cx, cz, ux, uz, hw: w / 2, hd: d / 2, yaw, id: lot.id, polygon: lot.polygon,
      // v positiv = zur Straße (lokales +z des Hauses, das hier stünde).
      at: (u, v) => [cx + ux * u + Math.sin(yaw) * v, cz + uz * u + Math.cos(yaw) * v],
    };
  }
  const p = lot.polygon;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]!); maxX = Math.max(maxX, p[i]!);
    minZ = Math.min(minZ, p[i + 1]!); maxZ = Math.max(maxZ, p[i + 1]!);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { cx, cz, ux: 1, uz: 0, hw: (maxX - minX) / 2, hd: (maxZ - minZ) / 2, yaw: 0, id: lot.id, polygon: p, at: (u, v) => [cx + u, cz + v] };
}

/** Eine flache Fläche aus einem Polygon (x,z-Paare), mit Vertexfarbe. */
function flat(kit: SettlementKit, poly: readonly number[], y: number, color: number): void {
  const contour: Vector2[] = [];
  for (let i = 0; i < poly.length; i += 2) contour.push(new Vector2(poly[i]!, poly[i + 1]!));
  const faces = ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  for (const [a, b, c] of faces) {
    const pa = contour[a!]!, pb = contour[b!]!, pc = contour[c!]!;
    // Nach oben gewickelt: (b−a)×(c−a) muss +y zeigen.
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    const tri = cross < 0 ? [pa, pb, pc] : [pa, pc, pb];
    for (const q of tri) pos.push(q.x, y, q.y);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  kit.add(g, color, 0, 0, 0);
}

/** Rechteck im Rahmen als Polygon. */
function rectPoly(f: LotFrame, u0: number, v0: number, u1: number, v1: number): number[] {
  return [f.at(u0, v0), f.at(u1, v0), f.at(u1, v1), f.at(u0, v1)].flat();
}

/** Ein Baum aus Stamm und Kronenklumpen — flach schattiert, wie die übrigen. */
export function tree(kit: SettlementKit, x: number, y: number, z: number, scale: number, random: () => number, blossom = false): void {
  const h = 3.2 * scale;
  kit.add(new CylinderGeometry(0.12 * scale, 0.2 * scale, h, 6), 0x4a3b30, x, y + h / 2, z);
  const greens = blossom ? [0xe8a9c0, 0xd98fae, 0xf2c6d6] : [0x3f5a3a, 0x4d6b41, 0x5a7a48, 0x36503a];
  const blobs = 3 + Math.floor(random() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = random() * Math.PI * 2, r = (0.6 + random() * 0.9) * scale;
    const g = new IcosahedronGeometry((1.1 + random() * 0.7) * scale, 0);
    kit.add(g, greens[i % greens.length]!, x + Math.cos(a) * r, y + h + (0.2 + random() * 1.2) * scale, z + Math.sin(a) * r, random(), random(), 0);
  }
}

function lamp(kit: SettlementKit, light: SettlementKit, x: number, y: number, z: number): void {
  kit.cylinder(x, y + 1.9, z, 0.06, 3.8, 0x2c3237);
  light.ball(x, y + 3.9, z, 0.22, 0xffd9a0);
}

function bench(kit: SettlementKit, x: number, y: number, z: number, yaw: number): void {
  kit.box(x, y + 0.45, z, 1.8, 0.08, 0.45, 0x7a5a3a, 0, yaw);
  kit.box(x, y + 0.72, z, 1.8, 0.35, 0.06, 0x7a5a3a, 0, yaw);
  kit.box(x, y + 0.22, z, 1.6, 0.44, 0.35, 0x3a4046, 0, yaw);
}

function buildPark(
  kit: SettlementKit, light: SettlementKit, pond: SettlementKit, f: LotFrame, y: number,
  random: () => number, trunk: (x: number, z: number, r: number, h: number) => void,
): void {
  const inset = 1.0;
  // Einfassung: Steinkante, dann Rasen 12 cm höher — man sieht die Kante vom Auto aus.
  flat(kit, rectPoly(f, -f.hw, -f.hd, f.hw, f.hd), y + 0.02, 0x7d7a74);
  flat(kit, rectPoly(f, -f.hw + inset, -f.hd + inset, f.hw - inset, f.hd - inset), y + 0.12, 0x3f5a34);
  // Hecke rundum mit Öffnungen in der Mitte jeder Seite.
  const hedge = (u0: number, v0: number, u1: number, v1: number): void => {
    const [ax, az] = f.at(u0, v0), [bx, bz] = f.at(u1, v1);
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) return;
    kit.box((ax + bx) / 2, y + 0.45, (az + bz) / 2, len, 0.8, 0.7, 0x2f4a2c, 0, -Math.atan2(bz - az, bx - ax));
  };
  const gap = 3;
  const e = inset + 0.35;
  for (const s of [-1, 1]) {
    hedge(-f.hw + e, s * (f.hd - e), -gap, s * (f.hd - e));
    hedge(gap, s * (f.hd - e), f.hw - e, s * (f.hd - e));
    hedge(s * (f.hw - e), -f.hd + e, s * (f.hw - e), -gap);
    hedge(s * (f.hw - e), gap, s * (f.hw - e), f.hd - e);
  }
  // Wege: ein Kreuz durch die Öffnungen, bei großen Parks zusätzlich ein Ring.
  const paths: [number, number, number, number, number][] = [];
  const path = (u0: number, v0: number, u1: number, v1: number, w: number): void => {
    paths.push([u0, v0, u1, v1, w]);
    const du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv) || 1;
    const nu = (-dv / l) * w / 2, nv = (du / l) * w / 2;
    flat(kit, [f.at(u0 + nu, v0 + nv), f.at(u1 + nu, v1 + nv), f.at(u1 - nu, v1 - nv), f.at(u0 - nu, v0 - nv)].flat(), y + 0.14, 0xb9ae98);
  };
  const long = f.hd > f.hw;
  if (Math.min(f.hw, f.hd) < 12) {
    // Schmaler Park (Miyashita): ein Weg in Längsrichtung, Bäume beidseits.
    if (long) path(0, -f.hd + inset, 0, f.hd - inset, 3);
    else path(-f.hw + inset, 0, f.hw - inset, 0, 3);
  } else {
    path(-f.hw + inset, 0, f.hw - inset, 0, 3);
    path(0, -f.hd + inset, 0, f.hd - inset, 3);
    if (f.hw * f.hd > 1500) {
      const ru = f.hw * 0.55, rv = f.hd * 0.55;
      path(-ru, -rv, ru, -rv, 2.4); path(ru, -rv, ru, rv, 2.4); path(ru, rv, -ru, rv, 2.4); path(-ru, rv, -ru, -rv, 2.4);
    }
  }
  const nearPath = (u: number, v: number, margin: number): boolean => {
    for (const [u0, v0, u1, v1, w] of paths) {
      const du = u1 - u0, dv = v1 - v0, q = du * du + dv * dv || 1;
      const t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / q));
      if (Math.hypot(u - u0 - du * t, v - v0 - dv * t) < w / 2 + margin) return true;
    }
    return false;
  };
  // Teich im großen Park — dunkel und glatt, er spiegelt den Himmel.
  let pondAt: [number, number, number] | null = null;
  if (f.hw * f.hd > 2500) {
    const pu = f.hw * 0.3, pv = -f.hd * 0.3, pr = Math.min(f.hw, f.hd) * 0.28;
    pondAt = [pu, pv, pr];
    const ring: number[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, r = pr * (0.85 + 0.15 * Math.sin(a * 3));
      ring.push(...f.at(pu + Math.cos(a) * r * 1.3, pv + Math.sin(a) * r));
    }
    flat(pond, ring, y + 0.13, 0x0b1418);
    const edge: number[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, r = pr * (0.85 + 0.15 * Math.sin(a * 3)) + 0.8;
      edge.push(...f.at(pu + Math.cos(a) * r * 1.3, pv + Math.sin(a) * r));
    }
    flat(kit, edge, y + 0.125, 0x8a857a);
  }
  // Bäume: lockere Streuung, nie auf Weg oder Teich; ein paar Kirschen.
  const area = f.hw * f.hd * 4;
  const want = Math.max(6, Math.round(area / 70));
  const placed: [number, number][] = [];
  for (let tries = 0; tries < want * 12 && placed.length < want; tries++) {
    const u = (random() * 2 - 1) * (f.hw - inset - 2.5);
    const v = (random() * 2 - 1) * (f.hd - inset - 2.5);
    if (nearPath(u, v, 2.2)) continue;
    if (pondAt && Math.hypot((u - pondAt[0]) / 1.3, v - pondAt[1]) < pondAt[2] + 2.5) continue;
    if (placed.some(([a, b]) => Math.hypot(a - u, b - v) < 6)) continue;
    placed.push([u, v]);
    const [x, z] = f.at(u, v);
    const scale = 0.9 + random() * 0.8;
    tree(kit, x, y + 0.12, z, scale, random, random() < 0.18);
    trunk(x, z, 0.25 * scale, 3.2 * scale);
  }
  // Bänke und Laternen am Weg.
  for (const [u0, v0, u1, v1] of paths) {
    const len = Math.hypot(u1 - u0, v1 - v0);
    const n = Math.floor(len / 14);
    for (let k = 1; k < n; k++) {
      const t = k / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      const du = (u1 - u0) / len, dv = (v1 - v0) / len;
      const side = k % 2 ? 1 : -1;
      const [x, z] = f.at(u - dv * 2.6 * side, v + du * 2.6 * side);
      if (k % 2) lamp(kit, light, x, y + 0.12, z);
      else bench(kit, x, y + 0.12, z, -Math.atan2(du * f.uz + dv * f.ux, du * f.ux - dv * f.uz));
    }
  }
  // Spielplatz im kleinen Park: Rutsche und Schaukel, knallbunt.
  if (f.hw * f.hd < 800 && f.hw > 10) {
    const [sx, sz] = f.at(-f.hw * 0.45, f.hd * 0.4);
    kit.box(sx, y + 1.1, sz, 1.2, 0.12, 1.2, 0xe2502a);
    kit.box(sx - 0.55, y + 0.6, sz, 0.1, 1.2, 0.1, 0x2a62c9);
    kit.box(sx + 0.55, y + 0.6, sz, 0.1, 1.2, 0.1, 0x2a62c9);
    kit.box(sx + 1.4, y + 0.6, sz, 2.2, 0.08, 0.7, 0xf2c200, 0, 0, -0.45);
    const [wx, wz] = f.at(f.hw * 0.4, -f.hd * 0.45);
    for (const d of [-1.3, 1.3]) kit.box(wx + d, y + 1.1, wz, 0.1, 2.2, 0.1, 0x2a8a4a);
    kit.box(wx, y + 2.2, wz, 2.8, 0.1, 0.1, 0x2a8a4a);
    for (const d of [-0.6, 0.6]) kit.box(wx + d, y + 0.55, wz, 0.5, 0.06, 0.25, 0x333333);
  }
}

function buildShrine(
  kit: SettlementKit, light: SettlementKit, f: LotFrame, y: number, random: () => number,
  trunk: (x: number, z: number, r: number, h: number) => void, collision: DriveSystem['collision'],
): void {
  // Kies, ein Steinweg von der Straße (Süden, +v) zur Halle im Norden.
  flat(kit, rectPoly(f, -f.hw, -f.hd, f.hw, f.hd), y + 0.03, 0xa39c8c);
  flat(kit, rectPoly(f, -1.4, -f.hd * 0.35, 1.4, f.hd), y + 0.06, 0x7d786e);
  // Torii am Eingang — zinnoberrot, schwarzer Kasagi.
  const [tx, tz] = f.at(0, f.hd - 2.5);
  const red = 0xc8321e;
  for (const s of [-1, 1]) {
    const [px, pz] = f.at(s * 2.1, f.hd - 2.5);
    kit.cylinder(px, y + 2.6, pz, 0.22, 5.2, red);
    kit.box(px, y + 0.25, pz, 0.6, 0.5, 0.6, 0x2a2a2a);
    collision.addCylinder(px, pz, 0.26, y - 0.5, y + 5.2);
  }
  kit.box(tx, y + 4.2, tz, 5.4, 0.3, 0.35, red);
  kit.box(tx, y + 5.25, tz, 6.6, 0.28, 0.5, 0x1a1a1a);
  kit.box(tx, y + 4.95, tz, 6.2, 0.2, 0.42, red);
  kit.box(tx, y + 4.6, tz, 0.3, 0.6, 0.36, red);
  // Haupthalle: Sockel, Holzwände, großes Satteldach.
  const [hx, hz] = f.at(0, -f.hd * 0.5);
  kit.box(hx, y + 0.4, hz, 12, 0.8, 10, 0x8a857a);
  kit.box(hx, y + 2.2, hz, 9, 2.8, 7, 0x6b3a22);
  kit.box(hx, y + 2.2, hz + 3.52, 7.6, 2.4, 0.06, 0xd9c9a4);
  kit.gable(hx, y + 3.6, hz, 12, 3.2, 10, 0x2b2e33);
  kit.box(hx, y + 3.62, hz, 12.2, 0.1, 10.2, 0x2b2e33);
  collision.addBox(hx - 6, hx + 6, hz - 5, hz + 5, y - 0.5, y + 7);
  // Steinlaternen beidseits des Wegs.
  for (const v of [f.hd * 0.1, f.hd * 0.45]) {
    for (const s of [-1, 1]) {
      const [lx, lz] = f.at(s * 3, v);
      kit.box(lx, y + 0.5, lz, 0.5, 1, 0.5, 0x8a8a84);
      kit.box(lx, y + 1.2, lz, 0.7, 0.45, 0.7, 0x8a8a84);
      light.box(lx, y + 1.2, lz, 0.4, 0.3, 0.72, 0xffcf8a);
      kit.box(lx, y + 1.55, lz, 0.9, 0.2, 0.9, 0x74746e);
    }
  }
  // Heilige Bäume ringsum, groß und dunkel.
  for (let k = 0; k < 10; k++) {
    const side = k % 4;
    const t = random() * 2 - 1;
    const u = side < 2 ? (side ? 1 : -1) * (f.hw - 3) : t * (f.hw - 3);
    const v = side < 2 ? t * (f.hd - 3) : (side === 2 ? -1 : 1) * (f.hd - 3);
    if (Math.abs(u) < 4 && v > 0) continue;
    const [x, z] = f.at(u, v);
    tree(kit, x, y, z, 1.6 + random() * 0.6, random);
    trunk(x, z, 0.4, 5);
  }
  // Niedriger Zaun (Tamagaki) um den Bezirk, offen zur Straße.
  const fence = (u0: number, v0: number, u1: number, v1: number): void => {
    const [ax, az] = f.at(u0, v0), [bx, bz] = f.at(u1, v1);
    const len = Math.hypot(bx - ax, bz - az);
    kit.box((ax + bx) / 2, y + 0.6, (az + bz) / 2, len, 0.12, 0.12, red, 0, -Math.atan2(bz - az, bx - ax));
    kit.box((ax + bx) / 2, y + 1.0, (az + bz) / 2, len, 0.12, 0.12, red, 0, -Math.atan2(bz - az, bx - ax));
    const posts = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      kit.box(ax + (bx - ax) * t, y + 0.55, az + (bz - az) * t, 0.14, 1.1, 0.14, red);
    }
  };
  fence(-f.hw + 0.5, -f.hd + 0.5, f.hw - 0.5, -f.hd + 0.5);
  fence(-f.hw + 0.5, -f.hd + 0.5, -f.hw + 0.5, f.hd - 0.5);
  fence(f.hw - 0.5, -f.hd + 0.5, f.hw - 0.5, f.hd - 0.5);
  fence(-f.hw + 0.5, f.hd - 0.5, -3.5, f.hd - 0.5);
  fence(3.5, f.hd - 0.5, f.hw - 0.5, f.hd - 0.5);
}

function buildPlaza(
  kit: SettlementKit, light: SettlementKit, f: LotFrame, y: number, random: () => number,
  trunk: (x: number, z: number, r: number, h: number) => void,
): void {
  flat(kit, rectPoly(f, -f.hw, -f.hd, f.hw, f.hd), y + 0.02, 0x6a655e);
  // Pflasterbänder quer — ein Platz, kein Parkplatz.
  for (let u = -f.hw + 4; u < f.hw - 2; u += 8) flat(kit, rectPoly(f, u, -f.hd + 0.5, u + 0.6, f.hd - 0.5), y + 0.03, 0x8e877c);
  // Baumquadrate im Raster, dazwischen Bänke.
  for (let u = -f.hw + 7; u < f.hw - 5; u += 13) {
    for (let v = -f.hd + 7; v < f.hd - 5; v += 13) {
      const [x, z] = f.at(u, v);
      kit.box(x, y + 0.25, z, 2.4, 0.5, 2.4, 0x5a5650);
      tree(kit, x, y + 0.5, z, 0.9 + random() * 0.3, random);
      trunk(x, z, 1.2, 1);
      const [bx, bz] = f.at(u + 6.5, v);
      bench(kit, bx, y, bz, f.yaw + Math.PI / 2);
    }
  }
  // Uhr auf einem Mast — Treffpunkt.
  const [cx, cz] = f.at(0, 0);
  kit.cylinder(cx, y + 2.5, cz, 0.12, 5, 0x2c3237);
  kit.box(cx, y + 5.2, cz, 0.9, 0.9, 0.3, 0x2c3237);
  light.box(cx, y + 5.2, cz, 0.7, 0.7, 0.32, 0xf4f0e0);
  lamp(kit, light, ...f.at(-f.hw + 2, f.hd - 2), y);
  lamp(kit, light, ...f.at(f.hw - 2, f.hd - 2), y);
}

function buildParking(
  kit: SettlementKit, light: SettlementKit, f: LotFrame, y: number, random: () => number,
  collision: DriveSystem['collision'],
): void {
  // Asphalt 1 cm über dem Gehweg, weiße Stellplatzlinien von hinten nach vorn.
  flat(kit, rectPoly(f, -f.hw, -f.hd, f.hw, f.hd), y + 0.01, 0x2c2d2f);
  const stalls = Math.max(2, Math.floor((f.hw * 2 - 1) / 2.6));
  const pitch = (f.hw * 2 - 1) / stalls;
  for (let k = 0; k <= stalls; k++) {
    const u = -f.hw + 0.5 + k * pitch;
    flat(kit, rectPoly(f, u - 0.06, -f.hd + 0.6, u + 0.06, -f.hd + 5.6), y + 0.02, 0xd8d8d0);
  }
  // Radsperren, Kassenautomat, Schild „P" auf einem Mast.
  for (let k = 0; k < stalls; k++) {
    const u = -f.hw + 0.5 + (k + 0.5) * pitch;
    const [x, z] = f.at(u, -f.hd + 3.2);
    kit.box(x, y + 0.08, z, 1.2, 0.12, 0.25, 0xd8c040, 0, f.yaw);
  }
  const [mx, mz] = f.at(f.hw - 0.8, f.hd - 1.2);
  kit.box(mx, y + 0.8, mz, 0.6, 1.6, 0.45, 0xe0e2e4, 0, f.yaw);
  light.box(mx, y + 1.15, mz, 0.4, 0.3, 0.47, 0x9fd0ff);
  collision.addCylinder(mx, mz, 0.4, y - 0.3, y + 1.6);
  const [px, pz] = f.at(-f.hw + 0.6, f.hd - 0.6);
  kit.cylinder(px, y + 2, pz, 0.07, 4, 0x2c3237);
  light.box(px, y + 4, pz, 0.9, 0.9, 0.12, 0x2a62c9);
  light.box(px, y + 4, pz, 0.35, 0.55, 0.14, 0xffffff);
  // Ein bis drei geparkte Autos — Kasten plus Kabine, Stadtfarben.
  const cars = Math.min(stalls, 1 + Math.floor(random() * 3));
  const colors = [0xe8e8e8, 0x1c1c1e, 0x9aa0a6, 0x7a1c1c, 0x1f3a6a, 0xd8d0c0];
  const used = new Set<number>();
  for (let c = 0; c < cars; c++) {
    let k = Math.floor(random() * stalls);
    if (used.has(k)) continue;
    used.add(k);
    const u = -f.hw + 0.5 + (k + 0.5) * pitch;
    const [x, z] = f.at(u, -f.hd + 3.1);
    const col = colors[Math.floor(random() * colors.length)]!;
    // Längs zur Stellplatztiefe: lokal v — also um 90° zur Front gedreht.
    kit.box(x, y + 0.55, z, 1.7, 0.7, 4.2, col, 0, f.yaw);
    kit.box(x, y + 1.15, z + 0, 1.5, 0.55, 2.2, 0x22272c, 0, f.yaw);
    collision.addOrientedBox(x, z, -f.yaw + Math.PI / 2, 2.1, 0.85, y - 0.3, y + 1.5);
  }
}
