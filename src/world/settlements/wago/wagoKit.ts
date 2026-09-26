import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Matrix4, PlaneGeometry, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SettlementKit } from '../SettlementKit';

/**
 * Wago-Baukasten (和); docs/DOERFER.md, „Gemeinsame Bauweise“.
 *
 * Ein Haus wird in **lokalen** Koordinaten gebaut (x quer, z längs, Front = +z,
 * Boden = y 0) und danach als Ganzes gedreht und gesetzt. Der Grund:
 * `SettlementKit.add` dreht in der Reihenfolge X → Y → Z um den Ursprung. Ein
 * Dachblech, das um Z gekippt und danach um Y gegiert werden soll, käme dort
 * in der falschen Reihenfolge an — ein schräg gestelltes Haus bekäme ein Dach,
 * das quer zur Traufe hängt.
 *
 * Vier Schichten je Ort, weil sie sich verschieden verhalten:
 * - `mass`: Wände, Dachflächen, Firste — das, was aus 2 km den Umriss macht.
 * - `detail`: Bretter, Ziegelrippen, Gitter, Kram — nur in der Nähe.
 * - `glass`: glatte, spiegelnde Scheiben (eigenes Material, sonst matt wie Holz).
 * - `glow`: unbeleuchtet gezeichnet (Fenster mit Licht, Laternen) — die Szene
 *   steht in der Abendsonne, und warmes Licht ist das, was ein Dorf bewohnt aussehen lässt.
 */
export class Parts {
  readonly mass = new SettlementKit();
  readonly detail = new SettlementKit();
  readonly glass = new SettlementKit();
  readonly glow = new SettlementKit();
  /** Stoff im Wind (Attribut `aSway`), siehe `clothMaterial`. */
  readonly cloth = new SettlementKit();
  /** Atlasflächen: Schilder, Plakate (beleuchtet von der Szene) … */
  readonly sign = new SettlementKit(true);
  /** … und Innenräume hinter Glas, Automatenfronten (selbstleuchtend). */
  readonly signGlow = new SettlementKit(true);
  /**
   * Oberflächenstruktur: Einzelbretter, Schalung, Ziegelrippen, Mauersteine.
   * Eigene Schicht, weil sie sich anders verhält als `detail`: aus 100 m ist sie
   * Rauschen, das der Verwitterungs-Shader ebenso liefert, und sie trug gemessen
   * den Großteil der Nahschicht. Auf Minimal entfällt sie ganz.
   */
  readonly fine = new SettlementKit();
  /**
   * Strohdächer (Gassho, Kayabuki) — eigenes Material mit Halmen und Moos
   * (`weatheredMaterial({ thatch: true })`). Gehört zur Masse: aus 2 km ist das
   * Strohdreieck *das* Erkennungszeichen des Bauerndorfs (docs/DOERFER.md §2).
   * Steht am Ende der Liste, damit `place()` für Orte ohne Stroh unverändert bleibt.
   */
  readonly thatch = new SettlementKit();
  /**
   * Innenraum (Kiso-Juku, Honjin): eigenes Material mit Eigenhelligkeit
   * (`weatheredMaterial({ lift })`) — unter dem Dach steht die Abendsonne bei 2°,
   * und ohne Aufhellung wäre ein begehbarer Raum ein schwarzes Loch. Am Ende der
   * Liste aus demselben Grund wie `thatch`.
   */
  readonly interior = new SettlementKit();
  /** Innenraum mit Atlas (Tatami, Fusuma, Rollbild) — dieselbe Aufhellung. */
  readonly interiorTex = new SettlementKit(true);
  get kits(): readonly SettlementKit[] { return [this.mass, this.detail, this.glass, this.glow, this.cloth, this.sign, this.signGlow, this.fine, this.thatch, this.interior, this.interiorTex]; }
}

export type V3 = readonly [number, number, number];

/**
 * Ebenes, konvexes Vieleck als Fächer. Umlauf wie gesehen von außen gegen den
 * Uhrzeigersinn — dann zeigt die Normale (p1−p0)×(p2−p0) nach außen. Wer die
 * Reihenfolge vertauscht, bekommt eine Fläche im Backface-Culling (P8.6, P8.11).
 */
export function poly(k: SettlementKit, pts: readonly V3[], color: number): void {
  const pos: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0]!, ...pts[i]!, ...pts[i + 1]!);
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  k.add(g, color, 0, 0, 0);
}

/**
 * Wie `poly`, aber die Außenseite wird angesagt statt aus der Reihenfolge
 * gelesen: zeigt die Normale gegen `out`, wird der Umlauf umgedreht. Für
 * Flächen, deren Umlauf je nach Hausseite spiegelt (Dachflanken, Walmflächen).
 */
export function polyFacing(k: SettlementKit, pts: readonly V3[], color: number, out: V3): void {
  const [a, b, c] = pts as [V3, V3, V3];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  poly(k, nx * out[0] + ny * out[1] + nz * out[2] >= 0 ? pts : [...pts].reverse(), color);
}

/**
 * Prisma: ein konvexes Profil in der x-y-Ebene, entlang z von z0 bis z1 gezogen.
 * `sides[i]` färbt die Kante i → i+1 (`null` = nicht zeichnen, z. B. verdeckte
 * Innenflächen), `cap` beide Stirnflächen. Der Umlauf des Profils wird hier
 * selbst bestimmt — ein Dachprofil auf der −x-Seite ist gespiegelt und damit
 * im Uhrzeigersinn, und genau so eine Verwechslung hat den Fluss aus P8.6 ein
 * halbes Jahr unsichtbar gemacht.
 */
export function prismZ(k: SettlementKit, profile: readonly (readonly [number, number])[], z0: number, z1: number, sides: readonly (number | null)[], cap: number | null): void {
  let area = 0;
  for (let i = 0; i < profile.length; i++) { const a = profile[i]!, b = profile[(i + 1) % profile.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  const n = profile.length, order = area >= 0 ? profile.map((_, i) => i) : profile.map((_, i) => (n - i) % n);
  const P = order.map(i => profile[i]!), S = order.map((i, j) => sides[area >= 0 ? i : (order[(j + 1) % n]!)] ?? null);
  for (let i = 0; i < n; i++) {
    const c = S[i]; if (c === null || c === undefined) continue;
    const a = P[i]!, b = P[(i + 1) % n]!;
    poly(k, [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], c);
  }
  if (cap !== null) {
    poly(k, P.map(([x, y]) => [x, y, z1] as V3), cap);
    poly(k, [...P].reverse().map(([x, y]) => [x, y, z0] as V3), cap);
  }
}

const M = new Matrix4();
/** Lokale Teile gedreht (Gierwinkel um +Y) und versetzt in die Zielschichten übernehmen. */
export function place(src: Parts, dst: Parts, x: number, y: number, z: number, yaw: number): void {
  M.makeRotationY(yaw).setPosition(x, y, z);
  const to = dst.kits;
  src.kits.forEach((a, i) => {
    const b = to[i]!;
    if (!a.parts.length) return;
    const merged = mergeGeometries(a.parts, false);
    a.parts.forEach(g => g.dispose()); a.parts.length = 0;
    if (!merged) return;
    merged.applyMatrix4(M); b.parts.push(merged);
  });
}

/** Kachel im Atlas: [u0, v0, u1, v1]. */
export type Tile = readonly [number, number, number, number];

/** Atlasfläche, Blickrichtung wie `plate`. */
export function tilePlate(k: SettlementKit, tile: Tile, x: number, y: number, z: number, w: number, h: number, axis: 'x' | 'z' | 'y', face: number, color = 0xffffff, tilt = 0): void {
  const g = new PlaneGeometry(w, h), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, tile[0] + uv.getX(i) * (tile[2] - tile[0]), tile[1] + uv.getY(i) * (tile[3] - tile[1]));
  if (axis === 'y') k.add(g, color, x, y, z, -Math.PI / 2, tilt, 0);
  else k.add(g, color, x, y, z, tilt, axis === 'z' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
}

/**
 * Hängender Stoff: oben fest, unten frei. `aSway` läuft von 0 (Aufhängung)
 * bis 1 (Saum); `clothMaterial` lenkt entlang der Normale aus.
 */
export function cloth(k: SettlementKit, x: number, y: number, z: number, w: number, h: number, axis: 'x' | 'z', face: number, color: number, rows = 3): void {
  const g = new PlaneGeometry(w, h, 1, rows), pos = g.getAttribute('position'), sway = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) sway[i] = (h / 2 - pos.getY(i)) / h;
  g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
  k.add(g, color, x, y, z, 0, axis === 'z' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
}

/** Fahne: links am Mast fest, nach rechts frei (Tairyō-bata an Fischerbooten). */
export function flag(k: SettlementKit, x: number, y: number, z: number, w: number, h: number, colors: readonly number[]): void {
  const band = h / colors.length;
  colors.forEach((c, i) => {
    const g = new PlaneGeometry(w, band, 4, 1), pos = g.getAttribute('position'), sway = new Float32Array(pos.count);
    for (let j = 0; j < pos.count; j++) sway[j] = (pos.getX(j) + w / 2) / w;
    g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
    k.add(g, c, x + w / 2, y + h / 2 - band * (i + 0.5), z, 0, 0, 0);
  });
}

export type Rng = () => number;
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const C = new Color();
/** Farbe hell/dunkel skaliert — Bretter, Ziegel und Steine sind nie gleichfarbig. */
export function shade(color: number, f: number): number {
  C.setHex(color); C.r = Math.min(1, C.r * f); C.g = Math.min(1, C.g * f); C.b = Math.min(1, C.b * f);
  return C.getHex();
}
export function jitter(color: number, r: Rng, amount = 0.1): number { return shade(color, 1 - amount + r() * amount * 2); }

/** Verwittertes Zedernholz, von silbergrau bis Yakisugi-schwarz. */
export const CEDAR = [0x6f6456, 0x5a4a3a, 0x7d6a55, 0x35302b] as const;
export const PLASTER = 0xd8d0bd;
export const KAWARA = 0x3f474d;
export const KAWARA_DARK = 0x2c3236;
export const STONE = 0x86837a;
export const CONCRETE = 0xa7a398;
export const TIMBER_DARK = 0x3b3027;
export const GLASS = 0x2f3d45;
export const WARM = 0xffc27a;

/**
 * Eine einzelne Fläche mit Blickrichtung `face` (±x oder ±z). Bretter, Quader und
 * Pflaster sieht man nur von vorn — ein Quader kostet 12 Dreiecke, eine Fläche 2.
 */
export function plate(k: SettlementKit, x: number, y: number, z: number, w: number, h: number, axis: 'x' | 'z', face: number, color: number, tilt = 0): void {
  const yaw = axis === 'z' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
  k.add(new PlaneGeometry(w, h), color, x, y, z, tilt, yaw, 0);
}

/**
 * Senkrechte Bretter auf einer Fläche quer zu z (bei `z`, nach `face` = ±1 hinaus).
 * Deckleisten (Oshibuchi) alle 0,9 m — sie sind es, die eine Wand aus der Nähe
 * nach Holz statt nach Pappe aussehen lassen.
 */
export function boardsX(k: SettlementKit, x0: number, x1: number, y0: number, y1: number, z: number, face: number, color: number, r: Rng, board = 0.26): void {
  const h = y1 - y0; if (h <= 0.05) return;
  for (let x = x0; x < x1 - 0.02; x += board) {
    const w = Math.min(board, x1 - x) - 0.015;
    plate(k, x + w / 2, y0 + h / 2, z + face * 0.035, w, h, 'z', face, jitter(color, r, 0.13));
  }
  for (let x = x0 + 0.45; x < x1 - 0.2; x += 0.9) plate(k, x, y0 + h / 2, z + face * 0.07, 0.07, h, 'z', face, shade(color, 0.72));
}
/** Dasselbe auf einer Fläche quer zu x. */
export function boardsZ(k: SettlementKit, z0: number, z1: number, y0: number, y1: number, x: number, face: number, color: number, r: Rng, board = 0.26): void {
  const h = y1 - y0; if (h <= 0.05) return;
  for (let z = z0; z < z1 - 0.02; z += board) {
    const w = Math.min(board, z1 - z) - 0.015;
    plate(k, x + face * 0.035, y0 + h / 2, z + w / 2, w, h, 'x', face, jitter(color, r, 0.13));
  }
  for (let z = z0 + 0.45; z < z1 - 0.2; z += 0.9) plate(k, x + face * 0.07, y0 + h / 2, z, 0.07, h, 'x', face, shade(color, 0.72));
}
/** Waagerechte Stülpschalung (Shitami-bari), quer zu z. */
export function sidingX(k: SettlementKit, x0: number, x1: number, y0: number, y1: number, z: number, face: number, color: number, r: Rng): void {
  for (let y = y0; y < y1 - 0.05; y += 0.2) plate(k, (x0 + x1) / 2, y + 0.1, z + face * 0.045, x1 - x0, 0.2, 'z', face, jitter(color, r, 0.12), -0.12);
}
export function sidingZ(k: SettlementKit, z0: number, z1: number, y0: number, y1: number, x: number, face: number, color: number, r: Rng): void {
  for (let y = y0; y < y1 - 0.05; y += 0.2) plate(k, x + face * 0.045, y + 0.1, (z0 + z1) / 2, z1 - z0, 0.2, 'x', face, jitter(color, r, 0.12), -0.12);
}

export interface RoofSpec {
  w: number; d: number; y: number; pitch: number;
  /** Traufüberstand quer zum First, Giebelüberstand längs. */
  eave: number; gableOver: number;
  ridge: 'x' | 'z';
  color: number;
  /** Giebeldreieck (Tsuma) — Putz oder Holz. `null` für Walmdächer ohne Dreieck. */
  tsuma: number | null;
  barge?: number;
}

/** Firsthöhe über `y` für ein Satteldach. */
export function roofRise(s: RoofSpec): number { return Math.tan(s.pitch) * (s.ridge === 'z' ? s.w : s.d) / 2; }

/**
 * Satteldach mit Kawara-Rippen, Traufziegeln, Firstpaket, Onigawara und
 * Windbrettern. Masse (Flächen, First) und Detail (Rippen, Ziegelkante) getrennt.
 */
export function gableRoof(p: Parts, s: RoofSpec, r: Rng): void {
  const alongZ = s.ridge === 'z';
  const across = alongZ ? s.w : s.d, length = (alongZ ? s.d : s.w) + 2 * s.gableOver;
  const half = across / 2, rise = Math.tan(s.pitch) * half;
  const L = (half + s.eave) / Math.cos(s.pitch), t = 0.2;
  const drop = s.eave * Math.tan(s.pitch);
  for (const side of [-1, 1]) {
    const mid = side * (half + s.eave) / 2;
    const cy = s.y + (rise - drop) / 2 + 0.12;
    const nx = side * Math.sin(s.pitch), ny = Math.cos(s.pitch);
    const tilt = -side * s.pitch;
    const slab = (k: SettlementKit, off: number, a: number, b: number, len: number, col: number): void => {
      if (alongZ) k.box(mid + nx * off, cy + ny * off, 0, a, b, len, col, 0, 0, tilt);
      else k.box(0, cy + ny * off, mid + nx * off, len, b, a, col, -tilt, 0, 0);
    };
    slab(p.mass, 0, L, t, length, s.color);
    // Ziegelrippen (Maru-gawara): alle 0,4 m, leicht verschieden getönt.
    for (let u = -length / 2 + 0.2; u < length / 2; u += 0.4) {
      const col = jitter(s.color, r, 0.09);
      if (alongZ) p.fine.box(mid + nx * 0.14, cy + ny * 0.14, u, L, 0.07, 0.12, col, 0, 0, tilt);
      else p.fine.box(u, cy + ny * 0.14, mid + nx * 0.14, 0.12, 0.07, L, col, -tilt, 0, 0);
    }
    // Traufkante: runde Ziegelreihe, dunkler — die Linie, die man von weitem liest.
    const ex = side * (half + s.eave - 0.05), ey = s.y - drop + 0.2;
    if (alongZ) p.mass.box(ex, ey, 0, 0.22, 0.2, length, shade(s.color, 0.72));
    else p.mass.box(0, ey, ex, length, 0.2, 0.22, shade(s.color, 0.72));
  }
  // Firstpaket: gestapelte Noshi-Ziegel mit Deckziegel.
  const ry = s.y + rise + 0.2;
  if (alongZ) { p.mass.box(0, ry, 0, 0.5, 0.34, length, shade(s.color, 0.8)); p.detail.box(0, ry + 0.24, 0, 0.3, 0.14, length + 0.1, shade(s.color, 0.65)); }
  else { p.mass.box(0, ry, 0, length, 0.34, 0.5, shade(s.color, 0.8)); p.detail.box(0, ry + 0.24, 0, length + 0.1, 0.14, 0.3, shade(s.color, 0.65)); }
  // Onigawara an beiden Firstenden.
  for (const e of [-1, 1]) {
    const u = e * length / 2;
    if (alongZ) { p.mass.box(0, ry + 0.2, u, 0.62, 0.72, 0.2, shade(s.color, 0.7)); p.detail.box(0, ry + 0.62, u + e * 0.05, 0.3, 0.2, 0.3, shade(s.color, 0.6), 0.5); }
    else { p.mass.box(u, ry + 0.2, 0, 0.2, 0.72, 0.62, shade(s.color, 0.7)); p.detail.box(u + e * 0.05, ry + 0.62, 0, 0.3, 0.2, 0.3, shade(s.color, 0.6), 0, 0, 0.5); }
  }
  // Giebel: Dreieck und Windbretter.
  const endLen = (alongZ ? s.d : s.w) / 2;
  for (const e of [-1, 1]) {
    if (s.tsuma !== null) {
      if (alongZ) p.mass.gable(0, s.y, e * (endLen - 0.02), s.w, rise, 0.12, s.tsuma);
      else { const g = gablePrism(s.d, rise, 0.12); g.rotateY(Math.PI / 2); g.translate(e * (endLen - 0.02), s.y, 0); p.mass.add(g, s.tsuma, 0, 0, 0); }
    }
    const barge = s.barge ?? TIMBER_DARK, bl = (half + s.eave * 0.6) / Math.cos(s.pitch);
    for (const side of [-1, 1]) {
      const bx = side * (half + s.eave * 0.6) / 2, by = s.y + (rise - s.eave * 0.6 * Math.tan(s.pitch)) / 2 + 0.02;
      if (alongZ) p.detail.box(bx, by, e * (length / 2 + 0.02), bl, 0.3, 0.08, barge, 0, 0, -side * s.pitch);
      else p.detail.box(e * (length / 2 + 0.02), by, bx, 0.08, 0.3, bl, barge, side * s.pitch, 0, 0);
    }
    // Gegyo — das kleine Brett unter dem Firstpunkt.
    if (alongZ) p.detail.box(0, s.y + rise - 0.25, e * (length / 2 + 0.05), 0.5, 0.5, 0.06, barge);
    else p.detail.box(e * (length / 2 + 0.05), s.y + rise - 0.25, 0, 0.06, 0.5, 0.5, barge);
  }
}

function gablePrism(w: number, h: number, d: number): BufferGeometry {
  const g = new BufferGeometry();
  const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [0, h, -d / 2];
  const f = [-w / 2, 0, d / 2], e = [w / 2, 0, d / 2], t = [0, h, d / 2];
  g.setAttribute('position', new Float32BufferAttribute([...a, ...c, ...b, ...f, ...e, ...t, ...a, ...f, ...t, ...a, ...t, ...c, ...b, ...c, ...t, ...b, ...t, ...e, ...a, ...b, ...e, ...a, ...e, ...f], 3));
  g.computeVertexNormals(); return g;
}

/**
 * Pultdach (Hisashi) über einer Öffnung — Ziegel oder Wellblech.
 * `face` ±1: an der Fläche z = zWall nach außen.
 */
export function leanTo(p: Parts, x: number, w: number, y: number, zWall: number, face: number, depth: number, color: number, r: Rng, corrugated = false): void {
  const pitch = 0.28, L = depth / Math.cos(pitch), cz = zWall + face * depth / 2, cy = y - Math.tan(pitch) * depth / 2;
  p.mass.box(x, cy, cz, w, 0.12, L, color, face * pitch);
  const step = corrugated ? 0.24 : 0.4;
  for (let u = x - w / 2 + step / 2; u < x + w / 2; u += step)
    p.fine.box(u, cy + 0.08, cz, corrugated ? 0.05 : 0.11, 0.06, L, corrugated ? shade(color, 0.85) : jitter(color, r, 0.08), face * pitch);
  p.detail.box(x, cy - Math.tan(pitch) * depth / 2 + 0.05, zWall + face * depth, w, 0.16, 0.16, shade(color, 0.7));
  // Kragträger unter dem Vordach.
  for (const s of [-1, 1]) p.detail.box(x + s * (w / 2 - 0.2), y - 0.35, zWall + face * depth * 0.45, 0.1, 0.1, depth * 0.9, TIMBER_DARK, face * 0.5);
}

/** Schiebefenster mit Rahmen und Sprossen; `lit` setzt warmes Licht dahinter. */
/**
 * Innenraum-Kacheln für beleuchtete Fenster. Eine gelbe Fläche hinter Glas
 * sieht aus der Nähe nach Lampe aus, nicht nach Zimmer — mit gemaltem Shōji,
 * Schatten und Fernsehlicht dahinter ist es ein bewohntes Haus.
 */
let INTERIORS: readonly Tile[] = [];
export function setInteriorTiles(tiles: readonly Tile[]): void { INTERIORS = tiles; }
function litPane(p: Parts, x: number, y: number, z: number, w: number, h: number, axis: 'x' | 'z', face: number): void {
  if (!INTERIORS.length) { (axis === 'z' ? p.glow.box(x, y, z, w, h, 0.03, WARM) : p.glow.box(x, y, z, 0.03, h, w, WARM)); return; }
  const t = INTERIORS[Math.abs(Math.round(x * 7.3 + y * 3.1 + z * 5.7)) % INTERIORS.length]!;
  tilePlate(p.signGlow, t, x, y, z, w, h, axis, face);
}

export function windowX(p: Parts, x: number, y: number, z: number, face: number, w: number, h: number, frame: number, lit: boolean, bars = 2): void {
  p.detail.box(x, y, z + face * 0.02, w + 0.14, h + 0.14, 0.06, frame);
  if (lit) litPane(p, x, y, z + face * 0.06, w, h, 'z', face); else p.glass.box(x, y, z + face * 0.05, w, h, 0.03, GLASS);
  for (let i = 1; i < bars; i++) p.detail.box(x - w / 2 + (w * i) / bars, y, z + face * 0.08, 0.05, h, 0.04, frame);
  p.detail.box(x, y - h / 2 - 0.06, z + face * 0.1, w + 0.2, 0.06, 0.12, shade(frame, 0.8));
}
export function windowZ(p: Parts, x: number, y: number, z: number, face: number, w: number, h: number, frame: number, lit: boolean, bars = 2): void {
  p.detail.box(x + face * 0.02, y, z, 0.06, h + 0.14, w + 0.14, frame);
  if (lit) litPane(p, x + face * 0.06, y, z, w, h, 'x', face); else p.glass.box(x + face * 0.05, y, z, 0.03, h, w, GLASS);
  for (let i = 1; i < bars; i++) p.detail.box(x + face * 0.08, y, z - w / 2 + (w * i) / bars, 0.04, h, 0.05, frame);
}

/** Koshi-Gitter (Holzlatten) vor einer Öffnung, quer zu z. */
export function koshi(p: Parts, x: number, y: number, z: number, face: number, w: number, h: number, color: number, lit: boolean): void {
  if (lit) litPane(p, x, y, z + face * 0.03, w, h, 'z', face); else p.glass.box(x, y, z + face * 0.02, w, h, 0.03, 0x1d1a17);
  for (let u = -w / 2 + 0.05; u <= w / 2; u += 0.11) plate(p.detail, x + u, y, z + face * 0.08, 0.045, h, 'z', face, color);
  for (const v of [-h / 2, h / 2]) p.detail.box(x, y + v, z + face * 0.09, w + 0.1, 0.08, 0.07, shade(color, 0.8));
}

/** Noren — geteilter Stoffvorhang über dem Eingang. */
export function noren(p: Parts, x: number, y: number, z: number, face: number, w: number, color: number): void {
  p.detail.box(x, y + 0.05, z + face * 0.12, w + 0.2, 0.04, 0.04, TIMBER_DARK);
  const n = 3, pw = w / n;
  for (let i = 0; i < n; i++) cloth(p.cloth, x - w / 2 + pw * (i + 0.5), y - 0.4, z + face * 0.14, pw - 0.04, 0.8, 'z', face, color, 2);
}

/** Rote Papierlaterne (Akachōchin). */
export function lantern(p: Parts, x: number, y: number, z: number, color = 0xe0402e): void {
  const g = new CylinderGeometry(0.2, 0.2, 0.52, 10); g.translate(x, y, z); p.glow.add(g, color, 0, 0, 0);
  p.detail.box(x, y + 0.3, z, 0.26, 0.05, 0.26, 0x1c1a18); p.detail.box(x, y - 0.3, z, 0.26, 0.05, 0.26, 0x1c1a18);
}

/** Kugel mit Standardauflösung — Bojen, Glasschwimmer. */
export function ball(k: SettlementKit, x: number, y: number, z: number, r: number, color: number, seg = 8): void {
  const g = new SphereGeometry(r, seg, Math.max(2, seg >> 1)); k.add(g, color, x, y, z);
}

/** Klimagerät an der Wand — die Kleinigkeit, die jedes japanische Haus hat. */
export function acUnit(p: Parts, x: number, y: number, z: number, face: number): void {
  p.detail.box(x, y, z + face * 0.18, 0.8, 0.55, 0.28, 0xd9d8d1);
  p.detail.box(x + 0.12, y, z + face * 0.33, 0.42, 0.42, 0.02, 0x9fa3a3);
  p.detail.box(x, y - 0.4, z + face * 0.15, 0.04, 0.3, 0.04, 0xbfbdb4);
}

/** Fallrohr mit Rinne an einer Traufecke. */
export function downpipe(p: Parts, x: number, y0: number, y1: number, z: number): void {
  const g = new CylinderGeometry(0.05, 0.05, y1 - y0, 6); p.detail.add(g, 0x6f5a4a, x, (y0 + y1) / 2, z);
}
