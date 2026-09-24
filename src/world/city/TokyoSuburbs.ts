import type { BufferGeometry } from 'three';

import { CITY, CITY_DISTRICT, FACADE_FAMILY } from '@/config/city.config';
import type { UrbanParcel } from '@/config/roads.config';
import {
  KIND_FLAT,
  KIND_WALL,
  MeshBuilder,
  ROOF_COLOR,
  box,
  extrudeBuilding,
  mulberry32,
  toLinear,
  type CityBuilding,
  type CityCollider,
  type Rect,
  type SignAnchor,
} from './CityGenerator';
import type { TokyoTile } from './TokyoGenerator';

/**
 * Neo-Tokio: der Übergang zur Landschaft (docs/TOKYO.md, Phase 5).
 *
 * ## Woher die Flächen kommen
 *
 * Der WP6-Baker legt entlang der Stadtrandstraßen 121 eingeebnete Terrassen an
 * (`urbanLots` in `roads.json`, je 30 × 28 m, `tools/wp6-parcels.mjs`). Der alte
 * Generator hat darauf gebaut; Neo-Tokio v1 hat sie übersehen. Übrig blieben
 * 121 **leere, flache, baumlose Rechtecke** im Wald — die Streuung spart sie
 * aus, weil dort Häuser stehen sollten. Gemessen: 49 davon liegen bis 150 m vor
 * dem Kern, 49 bis 300 m, 21 bis 450 m. Das ist genau der Gürtel, den die
 * Rückmeldung verlangt hat: „nicht plötzlich im Wald", sondern ein Ausklingen.
 *
 * ## Wie die Dichte ausklingt
 *
 * Je Terrasse zählt der Abstand zum Kern:
 *
 * | Abstand | Häuser | Etagen | Dach |
 * |---|---|---|---|
 * | < 120 m | 3, oft ein Wohnblock | 2…4, Block 4…6 | Sattel, Block flach |
 * | < 280 m | 2…3 | 2…3 | Sattel |
 * | darüber | 1…2 | 2 | Sattel, große Gärten |
 *
 * Dazu Blocksteinmauern ums Grundstück (offen zur Straße) und Gartenbäume —
 * die gibt `trees` zurück, gebaut werden sie mit dem Baum der Freiflächen.
 */
export interface SuburbResult {
  readonly tiles: readonly TokyoTile[];
  readonly buildings: readonly CityBuilding[];
  readonly colliders: readonly CityCollider[];
  readonly trees: readonly { readonly x: number; readonly y: number; readonly z: number; readonly s: number }[];
  readonly stats: { readonly lots: number; readonly houses: number; readonly triangles: number };
}

const TILE = 160;
const F = FACADE_FAMILY;
const WALL = toLinear(0x9a978f);

function coreDistance(x: number, z: number): number {
  let best = Infinity;
  for (const p of CITY_DISTRICT.parts) {
    const dx = Math.max(p.minX - x, x - p.maxX, 0);
    const dz = Math.max(p.minZ - z, z - p.maxZ, 0);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

export function generateSuburbs(
  lots: readonly UrbanParcel[],
  /** Einheitsvektor vom Punkt zur nächsten Fahrbahn, oder null. */
  towardRoad: (x: number, z: number) => [number, number] | null,
): SuburbResult {
  const random = mulberry32(CITY.seed ^ 0x5b0b5);
  const rand = (lo: number, hi: number): number => lo + random() * (hi - lo);
  const tiles = new Map<string, { x: number; z: number; full: MeshBuilder; shell: MeshBuilder; bounds: Rect }>();
  const tileAt = (x: number, z: number) => {
    const gx = Math.floor(x / TILE), gz = Math.floor(z / TILE), key = `vorort ${gx},${gz}`;
    let t = tiles.get(key);
    if (!t) {
      t = { x: (gx + 0.5) * TILE, z: (gz + 0.5) * TILE, full: new MeshBuilder(), shell: new MeshBuilder(), bounds: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity } };
      tiles.set(key, t);
    }
    return t;
  };
  const buildings: CityBuilding[] = [];
  const colliders: CityCollider[] = [];
  const trees: { x: number; y: number; z: number; s: number }[] = [];
  const scratch = new MeshBuilder();
  const scratchShell = new MeshBuilder();
  let houses = 0;

  for (const lot of lots) {
    const cx = (lot.minX + lot.maxX) / 2, cz = (lot.minZ + lot.maxZ) / 2;
    const dir = towardRoad(cx, cz);
    if (!dir) continue;
    const [fx, fz] = dir;
    const yaw = Math.atan2(fx, fz);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Lokal → Welt: u entlang der Straße, v zur Straße.
    const world = (u: number, v: number): [number, number] => [cx + u * c + v * s, cz - u * s + v * c];
    const hw = (lot.maxX - lot.minX) / 2, hd = (lot.maxZ - lot.minZ) / 2;
    const inside = (u: number, v: number, margin: number): boolean => {
      const [x, z] = world(u, v);
      return x > lot.minX + margin && x < lot.maxX - margin && z > lot.minZ + margin && z < lot.maxZ - margin;
    };
    // Wie weit reicht die Terrasse zur Straße und zur Seite (Stützfunktion des Rechtecks)?
    const front = hw * Math.abs(fx) + hd * Math.abs(fz);
    const side = hw * Math.abs(c) + hd * Math.abs(s);
    const d = coreDistance(cx, cz);
    const baseY = lot.top;
    const tile = tileAt(cx, cz);

    // Welche Häuser: nah am Kern dichter und höher, außen locker.
    const plan: { w: number; d: number; floors: number; family: number; pitched: boolean }[] = [];
    if (d < 120) {
      if (random() < 0.4) plan.push({ w: rand(14, 18), d: rand(10, 13), floors: Math.round(rand(4, 6)), family: F.apartment, pitched: false });
      while (plan.length < 3) plan.push({ w: rand(7.5, 9.5), d: rand(8.5, 10.5), floors: Math.round(rand(2, 4)), family: random() < 0.5 ? F.hillside : F.apartment, pitched: random() < 0.75 });
    } else if (d < 280) {
      const n = random() < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) plan.push({ w: rand(7.5, 10), d: rand(8.5, 10.5), floors: random() < 0.3 ? 3 : 2, family: random() < 0.7 ? F.hillside : F.timber, pitched: true });
    } else {
      const n = random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) plan.push({ w: rand(8, 11), d: rand(9, 11), floors: 2, family: F.hillside, pitched: true });
    }
    const gap = d < 120 ? rand(1, 1.8) : rand(2, 4);
    let total = plan.reduce((a, p) => a + p.w, 0) + gap * (plan.length - 1);
    while (total > side * 2 - 2 && plan.length > 1) {
      total -= plan.pop()!.w + gap;
    }
    let u = -total / 2;
    for (const p of plan) {
      const hu = p.w / 2, hv = p.d / 2;
      // Vorgarten 3 m, im Kernnähe 1,5 m.
      const v = front - (d < 120 ? 1.5 : 3) - hv;
      const uc = u + hu;
      u += p.w + gap;
      if (![[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].every(([a, b]) => inside(uc + a!, v + b!, 0.6))) continue;
      const footprint: Rect = { minX: -hu, maxX: hu, minZ: -hv, maxZ: hv };
      scratch.clear();
      scratchShell.clear();
      const anchors: SignAnchor[] = [];
      const r = extrudeBuilding(scratch, footprint, footprint, baseY, random, anchors, p.family, 'pz', p.floors, p.pitched);
      box(scratchShell, footprint, baseY, baseY + CITY.building.groundFloorHeight + Math.max(0, r.floors - 1) * CITY.building.floorHeight, 0, r.floors, r.color, ROOF_COLOR, r.seed, KIND_WALL);
      const [hx, hz] = world(uc, v);
      tile.full.appendTransformed(scratch, yaw, hx, 0, hz);
      tile.shell.appendTransformed(scratchShell, yaw, hx, 0, hz);
      const ex = Math.abs(c) * hu + Math.abs(s) * hv, ez = Math.abs(s) * hu + Math.abs(c) * hv;
      tile.bounds.minX = Math.min(tile.bounds.minX, hx - ex);
      tile.bounds.maxX = Math.max(tile.bounds.maxX, hx + ex);
      tile.bounds.minZ = Math.min(tile.bounds.minZ, hz - ez);
      tile.bounds.maxZ = Math.max(tile.bounds.maxZ, hz + ez);
      colliders.push({ minX: hx - ex, maxX: hx + ex, minZ: hz - ez, maxZ: hz + ez, bottom: baseY - 1, top: baseY + r.height, oriented: { cx: hx, cz: hz, angle: -yaw, hu, hv } });
      buildings.push({ id: `vorort-${buildings.length}`, minX: hx - ex, maxX: hx + ex, minZ: hz - ez, maxZ: hz + ez, baseY, height: r.height, family: p.family, front: 'pz', shopInset: r.shopInset, yaw, cx: hx, cz: hz, w: p.w, d: p.d });
      houses++;
    }

    // Blocksteinmauer ums Grundstück, offen zur Straße. Achsparallel, weil die
    // Terrasse es ist; die Straßenseite ist die Kante, deren Außennormale am
    // meisten zur Straße zeigt.
    const edges: [number, number, number, number, number, number][] = [
      [lot.minX, lot.minZ, lot.maxX, lot.minZ, 0, -1],
      [lot.maxX, lot.minZ, lot.maxX, lot.maxZ, 1, 0],
      [lot.maxX, lot.maxZ, lot.minX, lot.maxZ, 0, 1],
      [lot.minX, lot.maxZ, lot.minX, lot.minZ, -1, 0],
    ];
    let roadEdge = 0;
    edges.forEach((e, i) => { if (e[4] * fx + e[5] * fz > edges[roadEdge]![4] * fx + edges[roadEdge]![5] * fz) roadEdge = i; });
    edges.forEach((e, i) => {
      if (i === roadEdge) return;
      const inset = 0.4;
      const rect: Rect = e[4] !== 0
        ? { minX: e[0] - inset * e[4] - 0.08, maxX: e[0] - inset * e[4] + 0.08, minZ: lot.minZ + inset, maxZ: lot.maxZ - inset }
        : { minX: lot.minX + inset, maxX: lot.maxX - inset, minZ: e[1] - inset * e[5] - 0.08, maxZ: e[1] - inset * e[5] + 0.08 };
      box(tile.full, rect, baseY - 0.3, baseY + 1.35, 0, 0, WALL, WALL, 0, KIND_FLAT);
    });

    // Gartenbäume hinter und neben den Häusern.
    const want = d < 120 ? 1 : d < 280 ? 2 : 3;
    for (let k = 0, tries = 0; k < want && tries < 20; tries++) {
      const tu = rand(-side + 2.5, side - 2.5), tv = rand(-front + 2.5, front - 2.5);
      if (!inside(tu, tv, 2)) continue;
      // Nicht in ein Haus: die Häuser stehen im Streifen v ∈ [front − Tiefe − Vorgarten, front].
      if (tv > front - 14) continue;
      const [x, z] = world(tu, tv);
      trees.push({ x, y: baseY, z, s: rand(0.8, 1.3) });
      k++;
    }
  }

  const out: TokyoTile[] = [];
  let triangles = 0;
  for (const [key, t] of tiles) {
    if (t.full.empty) continue;
    triangles += t.full.triangles;
    out.push({ x: t.x, z: t.z, bounds: t.bounds, full: t.full.build(key), shell: t.shell.build(`${key} Hülle`) });
  }
  return { tiles: out, buildings, colliders, trees, stats: { lots: lots.length, houses, triangles } };
}

export type { BufferGeometry };
