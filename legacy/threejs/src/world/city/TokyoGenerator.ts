import { ShapeUtils, Vector2, type BufferGeometry } from 'three';

import { CITY, CITY_DISTRICT, CITY_GROUND_Y, CITY_SLAB_Y, FACADE_FAMILY, inCityDistrict } from '@/config/city.config';
import { DISTRICTS, INTERIOR_SITES, OPEN_SPACES, RAIL_LINE, SPECIAL_SITES, type DistrictStyle, type OpenSpaceType, type SpecialSite } from '@/config/tokyoLayout.mjs';
import {
  KIND_FLAT,
  KIND_WALL,
  MeshBuilder,
  PUDDLE_SKIRT,
  PUDDLE_SLAB,
  ROOF_COLOR,
  TILE_U,
  TILE_V,
  box,
  extrudeBuilding,
  mulberry32,
  toLinear,
  type CityBuilding,
  type CityCollider,
  type CityCurb,
  type Rect,
  type SignAnchor,
} from './CityGenerator';
import { Occupancy, addRoad, contours, createField, gradField, sampleField, signedArea, simplifyLoop, type Band, type FieldGrid } from './tokyoField';

/**
 * Neo-Tokio v2 — Blöcke aus dem Abstandsfeld, Häuser an der Baulinie
 * (docs/TOKYO.md, „Generator v2").
 *
 * ## Warum v2
 *
 * v1 füllte achsparallele Gitterzellen. Das ging schnell, legte aber die Stadt
 * auf ein Raster fest, und genau das kam als Rückmeldung zurück: statisch,
 * repetitiv, an der Diagonale Treppenstufen, stellenweise Häuser im
 * Straßenraum. v2 kennt keine Zellen mehr:
 *
 *  1. **Bordsteinfeld G** — Abstand zur nächsten Fahrbahnkante, weich vereinigt
 *     (gerundete Blockecken). Nulllinie = Bordstein, `G > 0` = Gehweg/Block.
 *  2. **Baulinienfeld H** — wie G, nur je Straße um die Gehwegbreite ihrer
 *     Klasse versetzt. Nulllinie = Hausfront.
 *  3. **Gehwege** aus den Höhenlinien von G: Polygon, trianguliert, dazu die
 *     Bordsteinkante als Wand. Keine Kacheln, keine Stufen.
 *  4. **Häuser entlang der Baulinie**: die Höhenlinie von H wird abgelaufen, je
 *     Parzelle ein Rechteck mit der Front auf der Sehne, gedreht zur Straße.
 *     Jede Probe im Rechteck muss auf Block liegen (`G > 0`) und frei sein —
 *     ein Haus auf der Fahrbahn ist damit per Konstruktion ausgeschlossen.
 *  5. **Lückenschluss und Hinterhof**: ein zweiter Lauf mit kleineren Maßen
 *     schließt Ecken, ein dritter füllt das Blockinnere mit niedrigeren Bauten —
 *     oder lässt je Viertel einen Anteil als Hof, Parkplatz, Gasse frei.
 *
 * Häuser entstehen im eigenen Rahmen mit dem bewährten Baukasten
 * (`extrudeBuilding`, Front nach +z) und werden erst beim Anhängen gedreht.
 */

export interface TokyoRoad {
  /** x,z-Paare der Mittellinie. */
  readonly points: readonly number[];
  readonly width: number;
}

export interface TokyoInput {
  /** Alle ebenerdigen Fahrbahnen im Kern und am Rand. */
  readonly roads: readonly TokyoRoad[];
  /** Grundriss der Hochstraße — darunter Gehweg, aber keine Häuser. */
  readonly viaduct: readonly TokyoRoad[];
  readonly sampleTerrain: (x: number, z: number) => number;
}

export interface TokyoTile {
  readonly x: number;
  readonly z: number;
  readonly bounds: Rect;
  readonly full: BufferGeometry;
  readonly shell: BufferGeometry;
}

/** Eine freie Fläche, die jemand anders ausstattet (`TokyoOpenSpaceSystem`). */
export interface TokyoOpenLot {
  readonly id: string;
  readonly type: OpenSpaceType;
  /** Umriss als x,z-Paare. */
  readonly polygon: readonly number[];
  /** Für Parkplätze: gedrehtes Rechteck. */
  readonly rect?: { readonly cx: number; readonly cz: number; readonly yaw: number; readonly w: number; readonly d: number };
}

export interface TokyoResult {
  readonly tiles: readonly TokyoTile[];
  readonly ground: BufferGeometry;
  readonly sidewalks: BufferGeometry;
  readonly buildings: readonly CityBuilding[];
  readonly signs: readonly SignAnchor[];
  readonly colliders: readonly CityCollider[];
  readonly curbs: readonly CityCurb[];
  readonly openLots: readonly TokyoOpenLot[];
  /** Bordsteinlinien (vereinfacht) — für Masten, Laternen, Poller. */
  readonly curbLines: readonly (readonly number[])[];
  readonly stats: {
    readonly blocks: number;
    readonly parcels: number;
    readonly buildings: number;
    readonly trianglesFull: number;
    readonly trianglesShell: number;
    readonly trianglesSidewalk: number;
    readonly floorsMax: number;
    readonly heightMax: number;
    readonly slabClearance: number;
    readonly slabClearanceAt: { x: number; z: number };
    readonly byStyle: Readonly<Record<string, number>>;
    /** Häuser, deren Grundfläche eine Fahrbahn berührt — muss 0 sein. */
    readonly onRoad: number;
    readonly fieldMs: number;
    /** Zeit je Stufe in ms — Feld, Front, Lücken, Hof, Gehweg. */
    readonly phases: string;
  };
}

const TILE = 160;
const CURB = CITY.sidewalk.height;
const F = FACADE_FAMILY;

/**
 * Gehwegbreite aus der Fahrbahnbreite. Gassen haben keinen Gehweg, nur einen
 * halben Meter bis zur Hauswand — so eng ist Omoide Yokochō.
 */
export function sidewalkFor(width: number): number {
  if (width >= 22) return 5;
  if (width >= 13) return 4;
  if (width >= 9) return 3;
  if (width >= 6.5) return 1.6;
  return 0.5;
}

interface StylePlan {
  readonly width: readonly [number, number];
  readonly depth: readonly [number, number];
  readonly floors: readonly [number, number];
  readonly families: readonly number[];
  /** Abstand zum Nachbarn an der Front. */
  readonly gap: readonly [number, number];
  /** Anteil der Hinterhof-Plätze, die bebaut werden. */
  readonly infill: number;
  /** Chance je Frontparzelle auf einen Münzparkplatz (Coin Parking). */
  readonly parking: number;
  /** Chance auf einen Hochpunkt: dieses Haus wird 1,5…2× höher. */
  readonly hero: number;
}

const STYLE: Readonly<Record<DistrictStyle, StylePlan>> = {
  towers: { width: [22, 36], depth: [20, 32], floors: [18, 36], families: [F.hotel, F.hotel, F.apartment], gap: [8, 16], infill: 0.15, parking: 0, hero: 0.2 },
  neon: { width: [5, 11], depth: [9, 17], floors: [4, 10], families: [F.shop, F.cinema, F.shop, F.apartment, F.timber, F.shop], gap: [0, 0.3], infill: 0.85, parking: 0.02, hero: 0.05 },
  yokocho: { width: [3.2, 5.4], depth: [5, 8], floors: [2, 3], families: [F.timber, F.timber, F.shop, F.timber], gap: [0, 0.2], infill: 1, parking: 0, hero: 0 },
  scramble: { width: [8, 18], depth: [12, 22], floors: [6, 14], families: [F.shop, F.hotel, F.cinema, F.shop], gap: [0, 0.4], infill: 0.7, parking: 0.02, hero: 0.08 },
  underpass: { width: [8, 16], depth: [8, 15], floors: [2, 5], families: [F.workshop, F.shed, F.timber, F.workshop, F.shop], gap: [0, 2.5], infill: 0.55, parking: 0.08, hero: 0 },
  electric: { width: [7, 14], depth: [10, 19], floors: [6, 12], families: [F.shop, F.cinema, F.shop, F.hotel], gap: [0, 0.4], infill: 0.8, parking: 0.02, hero: 0.1 },
  ginza: { width: [12, 22], depth: [14, 20], floors: [8, 14], families: [F.hotel, F.shop, F.hotel, F.shop], gap: [0, 0], infill: 0.9, parking: 0, hero: 0.1 },
  residential: { width: [7, 13], depth: [8, 13], floors: [2, 6], families: [F.apartment, F.hillside, F.apartment, F.shop, F.hillside], gap: [0.8, 2.6], infill: 0.6, parking: 0.05, hero: 0.03 },
};

/** Schilder je Viertel — Anteil der Straßenwände, Stapelhöhe (v1, unverändert). */
const SIGN_RULE: Readonly<Record<DistrictStyle, { readonly keep: number; readonly stack: number }>> = {
  neon: { keep: 0.9, stack: 5 },
  scramble: { keep: 0.75, stack: 3 },
  electric: { keep: 0.85, stack: 4 },
  ginza: { keep: 0.3, stack: 1 },
  residential: { keep: 0.2, stack: 0 },
  underpass: { keep: 0.4, stack: 0 },
  yokocho: { keep: 0.6, stack: 0 },
  towers: { keep: 0.1, stack: 0 },
};

function styleAt(x: number, z: number): DistrictStyle {
  for (const d of DISTRICTS) if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d.style;
  return 'residential';
}

function siteRect(site: SpecialSite): Rect {
  if (site.type === 'cylinder') return { minX: site.x - site.radius, maxX: site.x + site.radius, minZ: site.z - site.radius, maxZ: site.z + site.radius };
  return { minX: site.minX, maxX: site.maxX, minZ: site.minZ, maxZ: site.maxZ };
}

const SIDEWALK_TOP = toLinear(0x8d8a84);
const SIDEWALK_CURB = toLinear(0xa9a6a0);
/** Gehwegfläche: eigene Art, damit der Shader Pflaster zeichnet (FacadeMaterial). */
export const KIND_PAVE = 2;

/** Belegungscodes. */
const OCC_BUILDING = 1;
const OCC_RESERVED = 2;
const OCC_OPEN = 3;

export function generateTokyo(input: TokyoInput): TokyoResult {
  const random = mulberry32(CITY.seed ^ 0x70c20);
  const rand = (lo: number, hi: number): number => lo + random() * (hi - lo);
  const started = performance.now();

  // ── 1./2. Felder ──────────────────────────────────────────────────────
  const x0 = CITY_DISTRICT.minX, x1 = CITY_DISTRICT.maxX, z0 = CITY_DISTRICT.minZ, z1 = CITY_DISTRICT.maxZ;
  const G = createField(x0, z0, x1, z1, 60);
  const H = createField(x0, z0, x1, z1, 60);
  for (const road of input.roads) addRoad(G, H, road.points, road.width / 2, sidewalkFor(road.width), 6, 4, 36);
  // Kernrand: die Blöcke enden am Distrikt, die Häuser 2 m davor. Die beiden
  // Teilkästen überlappen hier um 20 m, sonst läge auf ihrer Naht eine Nulllinie.
  const parts = CITY_DISTRICT.parts.map((p) => ({ ...p, maxZ: p.maxZ === -160 ? -140 : p.maxZ }));
  for (let j = 0; j < G.nz; j++) {
    const z = z0 + j;
    for (let i = 0; i < G.nx; i++) {
      const x = x0 + i;
      let inside = -1;
      for (const p of parts) inside = Math.max(inside, Math.min(x - p.minX, p.maxX - x, z - p.minZ, p.maxZ - z));
      const k = j * G.nx + i;
      G.data[k] = Math.min(G.data[k]!, inside);
      H.data[k] = Math.min(H.data[k]!, inside - 2);
    }
  }
  const fieldMs = performance.now() - started;
  const g = (x: number, z: number): number => sampleField(G, x, z);
  const h = (x: number, z: number): number => sampleField(H, x, z);

  // ── Belegung: Bahn, Sonderbauten, Freiflächen, Hochstraße ─────────────
  const occ = new Occupancy(x0, z0, x1, z1);
  occ.markRect(RAIL_LINE.x, (RAIL_LINE.minZ + RAIL_LINE.maxZ) / 2, 1, 0, RAIL_LINE.width / 2 + 0.5, (RAIL_LINE.maxZ - RAIL_LINE.minZ) / 2, OCC_RESERVED);
  for (const site of SPECIAL_SITES) {
    const r = siteRect(site);
    occ.markRect((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 1, 0, (r.maxX - r.minX) / 2 + 1.5, (r.maxZ - r.minZ) / 2 + 1.5, OCC_RESERVED);
  }
  for (const site of INTERIOR_SITES) {
    occ.markRect((site.minX + site.maxX) / 2, (site.minZ + site.maxZ) / 2, 1, 0, (site.maxX - site.minX) / 2 + 0.5, (site.maxZ - site.minZ) / 2 + 0.5, OCC_RESERVED);
  }
  const openLots: TokyoOpenLot[] = [];
  for (const o of OPEN_SPACES) {
    const poly = o.polygon.flatMap((p) => [p[0], p[1]]);
    occ.markPolygon(poly, OCC_OPEN);
    openLots.push({ id: o.id, type: o.type, polygon: poly });
  }
  for (const v of input.viaduct) {
    const p = v.points;
    for (let s = 0; s + 3 < p.length; s += 2) {
      const ax = p[s]!, az = p[s + 1]!, bx = p[s + 2]!, bz = p[s + 3]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      occ.markRect((ax + bx) / 2, (az + bz) / 2, (bx - ax) / len, (bz - az) / len, len / 2 + 1, v.width / 2 + 2.5, OCC_RESERVED);
    }
  }

  // ── Ausgabe je Kachel ──────────────────────────────────────────────────
  const tiles = new Map<string, { x: number; z: number; full: MeshBuilder; shell: MeshBuilder; bounds: Rect }>();
  const tileAt = (x: number, z: number) => {
    const gx = Math.floor(x / TILE), gz = Math.floor(z / TILE), key = `${gx},${gz}`;
    let t = tiles.get(key);
    if (!t) {
      t = { x: (gx + 0.5) * TILE, z: (gz + 0.5) * TILE, full: new MeshBuilder(), shell: new MeshBuilder(), bounds: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity } };
      tiles.set(key, t);
    }
    return t;
  };
  const grow = (b: Rect, minX: number, maxX: number, minZ: number, maxZ: number): void => {
    b.minX = Math.min(b.minX, minX);
    b.maxX = Math.max(b.maxX, maxX);
    b.minZ = Math.min(b.minZ, minZ);
    b.maxZ = Math.max(b.maxZ, maxZ);
  };

  const signs: SignAnchor[] = [];
  const colliders: CityCollider[] = [];
  const buildings: CityBuilding[] = [];
  const byStyle: Record<string, number> = {};
  let parcels = 0;
  let floorsMax = 0;
  let heightMax = 0;
  let onRoad = 0;
  const top = CITY_GROUND_Y + CURB;
  const scratchFull = new MeshBuilder();
  const scratchShell = new MeshBuilder();

  /**
   * Passt ein gedrehtes Rechteck? Proben 0,3 m innerhalb der Kante, höchstens
   * 1,2 m auseinander. Jede muss auf dem Block liegen (G), hinter der
   * Baulinie (H, an der Front mit Spiel für Kurven) und frei sein.
   */
  const fits = (cx: number, cz: number, ux: number, uz: number, hu: number, hv: number, frontSlack: number): boolean => {
    const nu = Math.max(2, Math.ceil((hu * 2 - 0.6) / 1.2) + 1);
    const nv = Math.max(2, Math.ceil((hv * 2 - 0.6) / 1.2) + 1);
    for (let a = 0; a < nu; a++) {
      const lu = -hu + 0.3 + ((hu * 2 - 0.6) * a) / (nu - 1);
      for (let b = 0; b < nv; b++) {
        const lv = -hv + 0.3 + ((hv * 2 - 0.6) * b) / (nv - 1);
        // v zeigt von der Front (−hv) nach hinten (+hv) — Front ist lokal +z,
        // hier also die Seite, auf der die Straße liegt; siehe `place`.
        const x = cx + ux * lu - uz * lv;
        const z = cz + uz * lu + ux * lv;
        if (occ.at(x, z) !== 0) return false;
        if (g(x, z) < 0.4) return false;
        const need = b === 0 ? -frontSlack : -0.15;
        if (h(x, z) < need) return false;
      }
    }
    return true;
  };

  /**
   * Ein Haus setzen. `(fx, fz)` ist die Mitte der Front, `(tx, tz)` die
   * Richtung entlang der Front, `(nx, nz)` zeigt **in den Block**.
   */
  const place = (
    fx: number, fz: number, tx: number, tz: number, nx: number, nz: number,
    w: number, d: number, style: DistrictStyle, back: boolean, frontSlack: number,
  ): boolean => {
    const cx = fx + nx * d / 2, cz = fz + nz * d / 2;
    // Lokaler Rahmen fürs Prüfen: u entlang der Front, v in den Block.
    // `fits` rechnet x = cx + ux·lu − uz·lv, also muss (−uz, ux) = n sein.
    let ux = tx, uz = tz;
    if (-uz * nx + ux * nz < 0) { ux = -ux; uz = -uz; }
    // Gemessen beim Laden: Prüfen 130 ms, Bauen und Drehen 780 ms (2558 Häuser).
    if (!fits(cx, cz, ux, uz, w / 2, d / 2, frontSlack)) return false;
    occ.markRect(cx, cz, ux, uz, w / 2 - 0.1, d / 2 - 0.1, OCC_BUILDING);

    const plan = STYLE[style];
    // Die Front zeigt zur Straße, also entgegen n. yaw dreht lokales +z dorthin.
    const yaw = Math.atan2(-nx, -nz);
    const family = plan.families[Math.floor(random() * plan.families.length)]!;
    let floors = Math.round(rand(plan.floors[0], plan.floors[1]));
    if (!back && random() < plan.hero) floors = Math.round(floors * rand(1.5, 2));
    if (back) floors = Math.max(2, Math.round(floors * rand(0.45, 0.7)));
    // Schmale Häuser sind nicht beliebig hoch — Pencil Buildings enden bei ~12.
    floors = Math.min(floors, Math.max(2, Math.round(Math.min(w, d) * 1.7)));

    const footprint: Rect = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
    const anchors: SignAnchor[] = [];
    scratchFull.clear();
    scratchShell.clear();
    const result = extrudeBuilding(scratchFull, footprint, footprint, top, random, anchors, family, 'pz', floors);
    box(scratchShell, footprint, top, Math.min(top + result.height, top + CITY.building.groundFloorHeight + Math.max(0, result.floors - 1) * CITY.building.floorHeight), 0, result.floors, result.color, ROOF_COLOR, result.seed, KIND_WALL);

    const tile = tileAt(cx, cz);
    tile.full.appendTransformed(scratchFull, yaw, cx, 0, cz);
    tile.shell.appendTransformed(scratchShell, yaw, cx, 0, cz);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(c) * w / 2 + Math.abs(s) * d / 2;
    const ez = Math.abs(s) * w / 2 + Math.abs(c) * d / 2;
    grow(tile.bounds, cx - ex, cx + ex, cz - ez, cz + ez);

    // Schilder: nur Wände, vor denen Straßenraum liegt.
    const rule = SIGN_RULE[style];
    const room = Math.max(0, Math.floor((result.floors * CITY.building.floorHeight - 6) / 3.6));
    for (const a of anchors) {
      const wx = cx + a.x * c + a.z * s, wz = cz - a.x * s + a.z * c;
      const angle = a.angle + yaw;
      const ox = Math.sin(angle), oz = Math.cos(angle);
      const px = wx + ox * 2.2, pz = wz + oz * 2.2;
      if (occ.at(px, pz) === OCC_BUILDING || h(px, pz) > 0.6) continue;
      if (random() < rule.keep) signs.push({ ...a, x: wx, z: wz, angle, stack: Math.min(rule.stack, room) });
    }

    // Kontrollgröße: berührt die Grundfläche eine Fahrbahn? (Soll: nie.)
    for (const [lu, lv] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]] as const) {
      const px = cx + (lu * w / 2) * c + (lv * d / 2) * s, pz = cz - (lu * w / 2) * s + (lv * d / 2) * c;
      if (g(px, pz) < 0) { onRoad++; break; }
    }

    colliders.push({
      minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez,
      bottom: CITY_GROUND_Y - 1, top: top + result.height,
      oriented: { cx, cz, angle: -yaw, hu: w / 2, hv: d / 2 },
    });
    buildings.push({
      id: `tokyo-${buildings.length}`,
      minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez,
      baseY: top, height: result.height, family, front: 'pz', shopInset: result.shopInset,
      yaw, cx, cz, w, d,
    });
    parcels++;
    byStyle[style] = (byStyle[style] ?? 0) + 1;
    floorsMax = Math.max(floorsMax, result.floors);
    heightMax = Math.max(heightMax, result.height);
    return true;
  };

  const phase: [string, number][] = [];
  let mark = performance.now();
  const lap = (name: string): void => {
    const now = performance.now();
    phase.push([name, now - mark]);
    mark = now;
  };
  lap('Belegung');

  // ── 4. Häuser entlang der Baulinie ────────────────────────────────────
  const frontLoops = contours(H).filter((l) => Math.abs(l.area) > 30);
  interface Walk { readonly pts: number[]; readonly cum: number[]; readonly length: number }
  const walks: Walk[] = frontLoops.map((l) => {
    const pts = l.points;
    const cum = [0];
    for (let i = 2; i <= pts.length; i += 2) {
      const a = i - 2, b = i % pts.length;
      cum.push(cum[cum.length - 1]! + Math.hypot(pts[b]! - pts[a]!, pts[b + 1]! - pts[a + 1]!));
    }
    return { pts, cum, length: cum[cum.length - 1]! };
  });
  const at = (w: Walk, s: number): [number, number] => {
    const L = w.length;
    s = ((s % L) + L) % L;
    let lo = 0, hi = w.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (w.cum[mid]! <= s) lo = mid; else hi = mid;
    }
    const t = (s - w.cum[lo]!) / Math.max(1e-6, w.cum[lo + 1]! - w.cum[lo]!);
    const a = lo * 2, b = ((lo + 1) * 2) % w.pts.length;
    return [w.pts[a]! + (w.pts[b]! - w.pts[a]!) * t, w.pts[a + 1]! + (w.pts[b + 1]! - w.pts[a + 1]!) * t];
  };

  /** Eine Parzelle an der Front versuchen; liefert die verbrauchte Länge oder 0. */
  const frontLot = (w: Walk, s: number, width: number, minWidth: number): number => {
    const [ax, az] = at(w, s);
    const style = styleAt(ax, az);
    const plan = STYLE[style];
    for (let tryW = width; tryW >= minWidth - 1e-6; tryW *= 0.75) {
      const [bx, bz] = at(w, s + tryW);
      const chord = Math.hypot(bx - ax, bz - az);
      if (chord < tryW * 0.8) continue; // Ecke: die Sehne schneidet ab
      const tx = (bx - ax) / chord, tz = (bz - az) / chord;
      // Innen = Richtung, in der H steigt.
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const [gx, gz] = gradField(H, mx, mz);
      let nx = -tz, nz = tx;
      if (nx * gx + nz * gz < 0) { nx = -nx; nz = -nz; }
      // Wölbt sich die Baulinie zwischen den Enden nach innen, rückt die Front mit.
      let push = 0;
      for (let k = 1; k < 4; k++) {
        const [px, pz] = at(w, s + (tryW * k) / 4);
        push = Math.max(push, (px - ax) * nx + (pz - az) * nz);
      }
      const fx = mx + nx * (push + 0.05), fz = mz + nz * (push + 0.05);
      let depth = rand(plan.depth[0], plan.depth[1]);
      for (let attempt = 0; attempt < 3; attempt++, depth *= 0.72) {
        if (depth < Math.max(4, plan.depth[0] * 0.5)) break;
        if (place(fx, fz, tx, tz, nx, nz, chord, depth, style, false, 0.6)) return tryW;
      }
    }
    return 0;
  };

  for (const w of walks) {
    let s = rand(0, 3);
    while (s < w.length - 2) {
      const [ax, az] = at(w, s);
      const style = styleAt(ax, az);
      const plan = STYLE[style];
      // Münzparkplatz: eine Lücke in der Front, die frei bleibt.
      if (random() < plan.parking) {
        const pw = rand(10, 16), pd = rand(12, 18);
        const [bx, bz] = at(w, s + pw);
        const chord = Math.hypot(bx - ax, bz - az);
        if (chord > pw * 0.9) {
          const tx = (bx - ax) / chord, tz = (bz - az) / chord;
          const [gx, gz] = gradField(H, (ax + bx) / 2, (az + bz) / 2);
          let nx = -tz, nz = tx;
          if (nx * gx + nz * gz < 0) { nx = -nx; nz = -nz; }
          const cx = (ax + bx) / 2 + nx * pd / 2, cz = (az + bz) / 2 + nz * pd / 2;
          let ux = tx, uz = tz;
          if (-uz * nx + ux * nz < 0) { ux = -ux; uz = -uz; }
          if (fits(cx, cz, ux, uz, chord / 2, pd / 2, 0.6)) {
            occ.markRect(cx, cz, ux, uz, chord / 2, pd / 2, OCC_OPEN);
            const yaw = Math.atan2(-nx, -nz);
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [
              cx + a! * (chord / 2) * Math.cos(yaw) + b! * (pd / 2) * Math.sin(yaw),
              cz - a! * (chord / 2) * Math.sin(yaw) + b! * (pd / 2) * Math.cos(yaw),
            ]);
            openLots.push({ id: `parking-${openLots.length}`, type: 'parking', polygon: corners, rect: { cx, cz, yaw, w: chord, d: pd } });
            s += pw + 1;
            continue;
          }
        }
      }
      const width = rand(plan.width[0], plan.width[1]);
      const used = frontLot(w, s, width, plan.width[0] * 0.6);
      s += used > 0 ? used + rand(plan.gap[0], plan.gap[1]) : 1.5;
    }
  }

  lap('Front');
  // ── 5a. Lückenschluss: kleinere Häuser in Ecken und Restfronten ────────
  for (const w of walks) {
    for (let s = 0; s < w.length - 2; s += 1) {
      const [ax, az] = at(w, s);
      // Einen Meter hinter der Baulinie nachsehen: auf ihr selbst steht nie ein
      // Haus (es beginnt 5 cm dahinter), die Probe wäre immer „frei".
      const [gx, gz] = gradField(H, ax, az);
      const gl = Math.hypot(gx, gz) || 1;
      if (occ.at(ax + (gx / gl) * 1.2, az + (gz / gl) * 1.2) !== 0) continue;
      const plan = STYLE[styleAt(ax, az)];
      const used = frontLot(w, s, Math.max(3.2, plan.width[0]), 3.2);
      if (used > 0) s += used - 1;
    }
  }

  lap('Lücken');
  // ── 5b. Blockinneres: niedrigere Hinterhäuser, Höfe, Gassen ────────────
  const candidates: [number, number][] = [];
  for (let z = z0 + 3; z < z1 - 3; z += 5) for (let x = x0 + 3; x < x1 - 3; x += 5) candidates.push([x + rand(-2, 2), z + rand(-2, 2)]);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  for (const [x, z] of candidates) {
    if (h(x, z) < 3 || occ.at(x, z) !== 0) continue;
    const style = styleAt(x, z);
    const plan = STYLE[style];
    if (random() > plan.infill) continue;
    // Zur nächsten Baulinie ausrichten: die Front zeigt dorthin, wo H fällt.
    const [gx, gz] = gradField(H, x, z);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-4) continue;
    const nx = gx / gl, nz = gz / gl;
    const tx = -nz, tz = nx;
    for (const k of [1, 0.75, 0.55]) {
      const w = Math.max(3.2, rand(plan.width[0], plan.width[1]) * k);
      const d = Math.max(3.2, rand(plan.depth[0], plan.depth[1]) * k);
      if (place(x - nx * d / 2, z - nz * d / 2, tx, tz, nx, nz, w, d, style, true, 0)) break;
    }
  }

  lap('Hof');
  // ── Sonderbauten ───────────────────────────────────────────────────────
  for (const site of SPECIAL_SITES) {
    const r = siteRect(site);
    const tile = tileAt((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2);
    grow(tile.bounds, r.minX, r.maxX, r.minZ, r.maxZ);
    let height: number;
    let family: number;
    if (site.type === 'cylinder') {
      family = F.hotel;
      height = roundTower(tile.full, tile.shell, site.x, site.z, site.radius, top, site.floors, random, signs);
    } else {
      family = site.type === 'station' ? F.shop : site.id === 'cinema-tower' ? F.cinema : F.hotel;
      const anchors: SignAnchor[] = [];
      const result = extrudeBuilding(tile.full, r, r, top, random, anchors, family, 'nz', site.floors);
      box(tile.shell, r, top, top + CITY.building.groundFloorHeight + Math.max(0, result.floors - 1) * CITY.building.floorHeight, 0, result.floors, result.color, ROOF_COLOR, result.seed, KIND_WALL);
      height = result.height;
      for (const a of anchors) signs.push({ ...a, stack: site.type === 'tower' ? 4 : 2 });
    }
    colliders.push({ ...r, bottom: CITY_GROUND_Y - 1, top: top + height });
    buildings.push({ id: site.id, ...r, baseY: top, height, family, front: 'nz' });
    floorsMax = Math.max(floorsMax, site.floors);
    heightMax = Math.max(heightMax, height);
  }

  // ── 3. Gehwege aus der Bordsteinlinie ──────────────────────────────────
  const walkMesh = new MeshBuilder();
  const curbLoops = contours(G).filter((l) => Math.abs(l.area) > 25);
  const curbLines: number[][] = [];
  // Umlaufsinn des Äußeren: die Fläche mit dem größten Betrag ist ein Block.
  const outerSign = Math.sign(curbLoops.reduce((best, l) => (Math.abs(l.area) > Math.abs(best) ? l.area : best), 0)) || 1;
  const outers: { pts: number[]; holes: number[][] }[] = [];
  const holes: number[][] = [];
  for (const l of curbLoops) {
    const pts = simplifyLoop(l.points, 0.06);
    if (pts.length < 6) continue;
    curbLines.push(pts);
    if (Math.sign(signedArea(pts)) === outerSign) outers.push({ pts, holes: [] });
    else holes.push(pts);
  }
  for (const hole of holes) {
    let best: { pts: number[]; holes: number[][] } | null = null;
    let bestArea = Infinity;
    for (const o of outers) {
      const a = Math.abs(signedArea(o.pts));
      if (a < bestArea && pointIn(o.pts, hole[0]!, hole[1]!)) { best = o; bestArea = a; }
    }
    best?.holes.push(hole);
  }
  const yTop = top;
  const yLow = CITY_SLAB_Y;
  for (const o of outers) {
    const contour = toVec(o.pts);
    const holeVecs = o.holes.map(toVec);
    const faces = ShapeUtils.triangulateShape(contour, holeVecs);
    const all = [...contour, ...holeVecs.flat()];
    for (const [a, b, c] of faces) {
      const pa = all[a!]!, pb = all[b!]!, pc = all[c!]!;
      walkMesh.tri(
        [pa.x, yTop, pa.y], [pb.x, yTop, pb.y], [pc.x, yTop, pc.y], [0, 1, 0],
        [pa.x / TILE_U, pa.y / TILE_V, pb.x / TILE_U, pb.y / TILE_V, pc.x / TILE_U, pc.y / TILE_V],
        SIDEWALK_TOP, 0, KIND_PAVE,
      );
    }
    for (const loop of [o.pts, ...o.holes]) {
      for (let i = 0; i < loop.length; i += 2) {
        const j = (i + 2) % loop.length;
        const ax = loop[i]!, az = loop[i + 1]!, bx = loop[j]!, bz = loop[j + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        let nx = (bz - az) / len, nz = -(bx - ax) / len;
        // Auswärts = dorthin, wo G fällt (zur Fahrbahn).
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (g(mx + nx * 0.5, mz + nz * 0.5) > g(mx - nx * 0.5, mz - nz * 0.5)) { nx = -nx; nz = -nz; }
        walkMesh.quadFacing(
          [ax, yLow, az, bx, yLow, bz, bx, yTop, bz, ax, yTop, az],
          [nx, 0, nz],
          [0, 0, len, 0, len, 1, 0, 1],
          SIDEWALK_CURB, 0, KIND_FLAT,
        );
      }
    }
  }

  // ── Bordsteine als befahrbare Plateaus (1-m-Zellen, zeilenweise vereinigt) ──
  const curbs: CityCurb[] = [];
  {
    const nxC = G.nx - 1, nzC = G.nz - 1;
    const solid = new Uint8Array(nxC * nzC);
    for (let j = 0; j < nzC; j++) for (let i = 0; i < nxC; i++) {
      const k = j * G.nx + i;
      solid[j * nxC + i] = G.data[k]! > 0.15 && G.data[k + 1]! > 0.15 && G.data[k + G.nx]! > 0.15 && G.data[k + G.nx + 1]! > 0.15 ? 1 : 0;
    }
    // Gierig: Lauf in der Zeile, dann so viele Zeilen darunter, wie er ganz belegt ist.
    for (let j = 0; j < nzC; j++) {
      for (let i = 0; i < nxC; i++) {
        if (!solid[j * nxC + i]) continue;
        let i1 = i;
        while (i1 + 1 < nxC && solid[j * nxC + i1 + 1]) i1++;
        let j1 = j;
        outer: while (j1 + 1 < nzC) {
          for (let q = i; q <= i1; q++) if (!solid[(j1 + 1) * nxC + q]) break outer;
          j1++;
        }
        for (let jj = j; jj <= j1; jj++) for (let q = i; q <= i1; q++) solid[jj * nxC + q] = 0;
        curbs.push({ minX: x0 + i, maxX: x0 + i1 + 1, minZ: z0 + j, maxZ: z0 + j1 + 1, top });
      }
    }
  }

  lap('Gehweg');
  const ground = buildGroundParts(input.sampleTerrain);

  let trianglesFull = 0;
  let trianglesShell = 0;
  const out: TokyoTile[] = [];
  for (const [key, t] of tiles) {
    if (t.full.empty) continue;
    trianglesFull += t.full.triangles;
    trianglesShell += t.shell.triangles;
    out.push({ x: t.x, z: t.z, bounds: t.bounds, full: t.full.build(`Tokio ${key}`), shell: t.shell.build(`Tokio ${key} Hülle`) });
  }

  return {
    tiles: out,
    ground: ground.geometry,
    sidewalks: walkMesh.build('Gehwege'),
    buildings,
    signs,
    colliders,
    curbs,
    openLots,
    curbLines,
    stats: {
      blocks: outers.length,
      parcels,
      buildings: buildings.length,
      trianglesFull,
      trianglesShell,
      trianglesSidewalk: walkMesh.triangles,
      floorsMax,
      heightMax,
      slabClearance: ground.clearance,
      slabClearanceAt: ground.clearanceAt,
      byStyle,
      onRoad,
      fieldMs,
      phases: phase.map(([n, ms]) => `${n} ${ms.toFixed(0)}`).join(' · '),
    },
  };
}

function toVec(p: readonly number[]): Vector2[] {
  const out: Vector2[] = [];
  for (let i = 0; i < p.length; i += 2) out.push(new Vector2(p[i]!, p[i + 1]!));
  return out;
}

function pointIn(p: readonly number[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i]!, zi = p[i + 1]!, xj = p[j]!, zj = p[j + 1]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * Der runde Kaufhausturm an der Scramble — ein Vieleck aus 20 Fassadenfeldern.
 *
 * Jedes Feld ist genau ein Fenster breit (2πr/20 ≈ 2,8 m bei r = 9), das
 * Fensterraster aus dem Shader passt damit ohne angeschnittene Fenster. Oben
 * ein schmalerer Kranz und ein Schilderplatz zur Kreuzung hin, der einen Stapel
 * Hochkant-Schilder trägt — das Erkennungszeichen des Vorbilds.
 */
function roundTower(
  full: MeshBuilder,
  shell: MeshBuilder,
  cx: number,
  cz: number,
  radius: number,
  baseY: number,
  floors: number,
  random: () => number,
  signs: SignAnchor[],
): number {
  const b = CITY.building;
  const seed = Math.floor(random() * 256) + F.hotel * 256;
  const glass = toLinear(0x8f9aa3);
  const ring = (mesh: MeshBuilder, r: number, y0: number, y1: number, f0: number, f1: number, color: readonly [number, number, number], kind: number): void => {
    const n = 20;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const px0 = cx + Math.cos(a0) * r, pz0 = cz + Math.sin(a0) * r;
      const px1 = cx + Math.cos(a1) * r, pz1 = cz + Math.sin(a1) * r;
      // Von außen gegen den Uhrzeigersinn: unten a1 → a0, oben a0 → a1.
      mesh.quad([px1, y0, pz1, px0, y0, pz0, px0, y1, pz0, px1, y1, pz1], [Math.cos(am), 0, Math.sin(am)], [1, f0, 0, f0, 0, f1, 1, f1], color, seed, kind);
    }
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      mesh.quad([cx, y1, cz, cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r, cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r, cx, y1, cz], [0, 1, 0], [0, 0, 0, 1, 1, 1, 1, 0], ROOF_COLOR, seed, KIND_FLAT);
    }
  };
  const groundTop = baseY + b.groundFloorHeight;
  const roof = groundTop + (floors - 1) * b.floorHeight;
  ring(full, radius, baseY, groundTop, 0, 1, glass, KIND_WALL);
  ring(full, radius - 0.6, groundTop, roof, 1, floors, glass, KIND_WALL);
  ring(full, radius * 0.62, roof, roof + 2 * b.floorHeight, floors, floors + 2, toLinear(0xb8bec2), KIND_WALL);
  ring(shell, radius, baseY, roof + 2 * b.floorHeight, 0, floors + 2, glass, KIND_WALL);
  const toward = Math.atan2(300 - cz, 640 - cx);
  signs.push({ x: cx + Math.cos(toward) * radius, y: baseY, z: cz + Math.sin(toward) * radius, angle: Math.PI / 2 - toward, span: 6, floors, stack: 5 });
  return roof + 2 * b.floorHeight - baseY;
}

/**
 * Platte und Schürze für einen Kern aus mehreren Teilkästen (unverändert aus
 * v1): die Schürze läuft nur an Kanten, hinter denen kein anderer Teilkasten
 * liegt. Sonst hinge an der inneren Naht eine Schürze unter der Nachbarplatte.
 */
function buildGroundParts(sampleTerrain: (x: number, z: number) => number): {
  geometry: BufferGeometry;
  clearance: number;
  clearanceAt: { x: number; z: number };
} {
  const mesh = new MeshBuilder();
  const y = CITY_SLAB_Y;
  const skirt = CITY.ground.skirt;
  const uvOf = (x: number, z: number): [number, number] => [x / TILE_U, z / TILE_V];

  for (const d of CITY_DISTRICT.parts) {
    const a = uvOf(d.minX, d.minZ), bq = uvOf(d.minX, d.maxZ), c = uvOf(d.maxX, d.maxZ), e = uvOf(d.maxX, d.minZ);
    mesh.quad(
      [d.minX, y, d.minZ, d.minX, y, d.maxZ, d.maxX, y, d.maxZ, d.maxX, y, d.minZ],
      [0, 1, 0],
      [a[0], a[1], bq[0], bq[1], c[0], c[1], e[0], e[1]],
      PUDDLE_SLAB,
      0,
      KIND_FLAT,
    );
    const edges: [number, number, number, number, number, number][] = [
      [d.minX, d.minZ, d.maxX, d.minZ, 0, -1],
      [d.maxX, d.minZ, d.maxX, d.maxZ, 1, 0],
      [d.maxX, d.maxZ, d.minX, d.maxZ, 0, 1],
      [d.minX, d.maxZ, d.minX, d.minZ, -1, 0],
    ];
    for (const [ex0, ez0, ex1, ez1, ox, oz] of edges) {
      const n = Math.max(1, Math.ceil(Math.hypot(ex1 - ex0, ez1 - ez0) / 12));
      for (let k = 0; k < n; k++) {
        const ix0 = ex0 + ((ex1 - ex0) * k) / n, iz0 = ez0 + ((ez1 - ez0) * k) / n;
        const ix1 = ex0 + ((ex1 - ex0) * (k + 1)) / n, iz1 = ez0 + ((ez1 - ez0) * (k + 1)) / n;
        if (inCityDistrict((ix0 + ix1) / 2 + ox * 2, (iz0 + iz1) / 2 + oz * 2)) continue;
        const ox0 = ix0 + ox * skirt, oz0 = iz0 + oz * skirt, ox1 = ix1 + ox * skirt, oz1 = iz1 + oz * skirt;
        const oy0 = Math.min(y, sampleTerrain(ox0, oz0));
        const oy1 = Math.min(y, sampleTerrain(ox1, oz1));
        const q0 = uvOf(ix0, iz0), q1 = uvOf(ix1, iz1), q2 = uvOf(ox1, oz1), q3 = uvOf(ox0, oz0);
        mesh.quad(
          [ix0, y, iz0, ix1, y, iz1, ox1, oy1, oz1, ox0, oy0, oz0],
          [0, 1, 0],
          [q0[0], q0[1], q1[0], q1[1], q2[0], q2[1], q3[0], q3[1]],
          PUDDLE_SKIRT,
          0,
          KIND_FLAT,
        );
      }
    }
  }

  let clearance = Infinity;
  const clearanceAt = { x: 0, z: 0 };
  for (const d of CITY_DISTRICT.parts) {
    for (let iz = 0; iz <= 40; iz++) {
      const z = d.minZ + ((d.maxZ - d.minZ) * iz) / 40;
      for (let ix = 0; ix <= 40; ix++) {
        const x = d.minX + ((d.maxX - d.minX) * ix) / 40;
        const gap = y - sampleTerrain(x, z);
        if (gap < clearance) {
          clearance = gap;
          clearanceAt.x = Math.round(x);
          clearanceAt.z = Math.round(z);
        }
      }
    }
  }
  return { geometry: mesh.build('Stadtboden'), clearance, clearanceAt };
}

export type { Band, FieldGrid };
