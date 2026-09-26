import { CircleGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, PlaneGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { SettlementKit } from '../SettlementKit';
import { STONE, Parts, ball, cloth, jitter, place, plate, polyFacing, shade, tilePlate, type Rng, type Tile } from '../wago/wagoKit';
import { bench, bicycle, chochin, kasugaLantern, pebble, portrait, pottedPlant, tileCylinder } from '../kiso/kisoBuildings';
import { T, tile } from './koedoAtlas';
import type { KoedoRole } from './koedoLayout';

/*
 * Bauten von Koedo in lokalen Koordinaten: x entlang der Front, z in die Tiefe,
 * **Front bei z = +d/2**, y 0 = Hausboden. Vorbilder: Kawagoe Ichibangai (Ōsawa-ke,
 * Kameya, Kurazukuri-Museum) und Kurashiki Bikan. Referenzbilder:
 * C:\Users\Leandro\Downloads\towns\dorf\.
 *
 * Was ein Kawagoe-Kura aus 50 m erkennbar macht, der Reihe nach:
 *  1. das **schwere Dach**: dicker Ziegelbelag, ein First fast einen Meter hoch
 *     und an beiden Enden ein Onigawara, so groß wie ein Mensch,
 *  2. die **schwarze, glänzende** Wand ohne sichtbares Holz — die Traufe ist
 *     eingeputzt (Nurigome), keine Sparren,
 *  3. die dicken **Kannon-biraki**-Läden an den Fenstern, offen wie Buchdeckel,
 *  4. der offene Laden unten mit Pultdach, Noren und Kanban.
 * Und ein Kurashiki-Kura: weißer Putz, darunter Namako (Schiefer im
 * Diagonalgitter), Ecken und Gurtband ebenfalls Namako, Giebel oft zum Kanal.
 */

export const BLACK = 0x18191c;
const CHARCOAL = 0x26272a;
const BROWN_BLACK = 0x2a211d;
export const WHITE = 0xeeebe2;
const WHITE_OLD = 0xdfd9ca;
/** Fugenkalk der Namako-Wand; die Schieferfarbe rechnet der Shader daraus. */
export const JOINT = 0xe9e5d9;
/** Mittelwert einer Namako-Wand — die Farbe des Körpers dahinter, für die Fernsicht. */
const NAMAKO_FAR = 0x6d6f72;
const BEAM = 0x1e1813;
const BENGARA = 0x5e2a1f;
const WOOD = [0x3e2e22, 0x4a3828, 0x33271e, 0x55412f] as const;
const TILES = [0x3b4046, 0x454a50, 0x33373c, 0x4d4a48] as const;
const GRANITE = 0x9a968c;

// ── Dach ─────────────────────────────────────────────────────────────────────

/**
 * Onigawara: Sockel, halbrunder Kopf mit Wappenscheibe, zwei Hörner (Tori-busuma).
 * `e` = ±1: schaut nach ±x. Größe = Höhe in Metern. In Kawagoe stehen sie bis
 * 1,5 m hoch auf dem First — der Umriss, an dem man den Ort erkennt.
 */
export function oni(p: Parts, x: number, y: number, z: number, size: number, color: number, e: number): void {
  const s = size, dark = shade(color, 0.72);
  p.mass.box(x, y + s * 0.3, z, s * 0.32, s * 0.6, s * 0.95, dark);
  p.mass.add(new CylinderGeometry(s * 0.47, s * 0.47, s * 0.32, 12, 1, false, 0, Math.PI), dark, x, y + s * 0.58, z, 0, 0, Math.PI / 2);
  p.detail.add(new CircleGeometry(s * 0.2, 12), shade(color, 1.05), x + e * (s * 0.165), y + s * 0.62, z, 0, e > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  p.detail.add(new TorusGeometry(s * 0.34, s * 0.035, 4, 14, Math.PI), shade(color, 0.9), x + e * (s * 0.17), y + s * 0.6, z, 0, Math.PI / 2, 0);
  for (const f of [-1, 1]) p.detail.box(x + e * 0.02, y + s * 1.02, z + f * s * 0.26, s * 0.2, s * 0.34, s * 0.12, dark, f * 0.5);
}

interface KRoof {
  /** First entlang x von x0 bis x1 (ohne Überstand), Wandebenen hinten zA und vorn zB. */
  x0: number; x1: number; zA: number; zB: number; y: number; pitch: number;
  eaveA: number; eaveB: number; over: number; color: number; r: Rng;
  /**
   * Putz der Traufe, Ortgänge und Giebel (Kura: schwarz oder weiß). `null` = Holzhaus
   * mit sichtbaren Sparren und Windbrettern.
   */
  plaster: number | null;
  /** Giebeldreieck: Farbe. */
  tsuma: number;
  /** Höhe der Onigawara (0 = kein). */
  oni: number;
  /** Firsthöhe als Vielfaches (Kawagoe 1, Machiya ~0,55). */
  ridge?: number;
}

/**
 * Schweres Satteldach, First entlang x. Geometrie wie `roofX` in Kiso-Juku (die
 * Unterkante der Platte liegt auf der Linie First → Traufkante), aber mit dem, was
 * ein Kura ausmacht: dicke Platte, eingeputzte Traufe (Nurigome) statt Sparren,
 * hoher First aus gestapelten Noshi-Ziegeln, große Onigawara, verputzte Ortgänge.
 */
export function kuraRoof(p: Parts, o: KRoof): { top: number; eaveY: number } {
  const zr = (o.zA + o.zB) / 2, half = (o.zB - o.zA) / 2, tanp = Math.tan(o.pitch), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  const rise = tanp * half, top = o.y + rise, t = 0.28, r = o.r;
  const X0 = o.x0 - o.over, X1 = o.x1 + o.over, len = X1 - X0, xm = (X0 + X1) / 2;
  let eaveYFront = o.y;
  for (const s of [-1, 1] as const) {
    const e = s > 0 ? o.eaveB : o.eaveA, L = (half + e) / cp;
    const on = (u: number, lift: number): [number, number] => [top - u * sp + cp * (t + lift), zr + s * u * cp + s * sp * (t + lift)];
    const [cy, cz] = on(L / 2, -t / 2);
    p.mass.box(xm, cy, cz, len, t, L, o.color, s * o.pitch);
    const eaveY = top - L * sp;
    if (s > 0) eaveYFront = eaveY;
    // Ziegelrippen (Maru-gawara), Traufziegel, Tomoe-Stirnen.
    for (let x = X0 + 0.18; x < X1; x += 0.36) { const [ry, rz] = on(L / 2, 0.04); p.fine.box(x, ry, rz, 0.12, 0.08, L, jitter(o.color, r, 0.08), s * o.pitch); }
    const [ey, ez] = on(L - 0.1, 0.07); p.mass.box(xm, ey, ez, len + 0.04, 0.24, 0.26, shade(o.color, 0.72));
    for (let x = X0 + 0.18; x < X1; x += 0.36) { const [by, bz] = on(L - 0.01, 0.07); plate(p.fine, x, by, bz + s * 0.14, 0.14, 0.14, 'z', s, shade(o.color, 0.58)); }
    const u0 = half / cp;
    if (o.plaster !== null) {
      // Nurigome: die Traufe als massiver Putzkörper unter der Platte, zur Wand hin tiefer.
      const [py, pz] = on((u0 + L) / 2, -t - 0.26);
      p.mass.box(xm, py, pz, len - 0.05, 0.52, L - u0, o.plaster, s * o.pitch);
      const [fy, fz] = on(L - 0.02, -t / 2 - 0.12);
      p.detail.box(xm, fy, fz, len, 0.44, 0.1, shade(o.plaster, 1.1), s * o.pitch * 0.2);
    } else {
      const um = (u0 + L - 0.06) / 2, [ry, rz] = on(um, -t - 0.05);
      for (let x = X0 + 0.25; x < X1 - 0.1; x += 0.46) p.fine.box(x, ry, rz, 0.07, 0.09, L - 0.06 - u0, 0x241b14, s * o.pitch);
      const [by, bz] = on(um, -t - 0.012); p.detail.box(xm, by, bz, len - 0.1, 0.015, L - 0.06 - u0, 0x5a4634, s * o.pitch);
      const [fy, fz] = on(L, -t / 2); p.detail.box(xm, fy - 0.02, fz + s * 0.02, len, t + 0.1, 0.06, 0x2a2018);
    }
  }
  // First: gestapelte Noshi-Ziegel, Deckziegel obenauf, Lagenfugen in der Oberflächenschicht.
  const k = o.ridge ?? 1, rh = 0.8 * k, ry = top + t + rh / 2 - 0.05;
  p.mass.box(xm, ry, zr, len - 0.2, rh, 0.46 + 0.14 * k, shade(o.color, 0.82));
  p.detail.box(xm, ry + rh / 2 + 0.08, zr, len - 0.1, 0.16, 0.36, shade(o.color, 0.62));
  for (let i = 1; i < 4 * k; i++) for (const f of [-1, 1]) p.fine.box(xm, ry - rh / 2 + i * rh / (4 * k), zr + f * (0.24 + 0.07 * k), len - 0.25, 0.035, 0.02, shade(o.color, 0.55));
  if (o.oni > 0) for (const e of [-1, 1]) oni(p, e > 0 ? X1 - 0.1 : X0 + 0.1, ry - rh / 2, zr, o.oni, o.color, e);
  // Giebel: Dreieck, verputzte (bzw. hölzerne) Ortgänge, Gegyo.
  for (const e of [-1, 1] as const) {
    const x = e > 0 ? o.x1 : o.x0;
    polyFacing(p.mass, [[x, o.y - 0.02, o.zA], [x, o.y - 0.02, o.zB], [x, top - 0.02, zr]], o.tsuma, [e, 0, 0]);
    const bx = e > 0 ? X1 + 0.05 : X0 - 0.05;
    for (const s of [-1, 1] as const) {
      const e2 = s > 0 ? o.eaveB : o.eaveA, L = (half + e2) / cp, by = top - (L / 2) * sp + cp * t * 0.3, bz = zr + s * (L / 2) * cp;
      if (o.plaster !== null) p.mass.box(bx, by - 0.12, bz, 0.26, 0.62, L + 0.1, o.plaster, s * o.pitch);
      else p.detail.box(bx, by, bz, 0.07, 0.3, L + 0.1, 0x241b14, s * o.pitch);
    }
    p.detail.box(bx + e * 0.08, top - 0.25, zr, 0.08, 0.5, 0.5, o.plaster ?? 0x241b14);
  }
  return { top: ry + rh / 2 + 0.16, eaveY: eaveYFront };
}

/** Pultdach mit Ziegeln über dem Laden, x0…x1 an der Wand z = zWall, nach +z. */
function pent(p: Parts, x0: number, x1: number, zWall: number, yTop: number, depth: number, color: number, r: Rng, plaster: number | null): void {
  const pitch = 0.32, L = depth / Math.cos(pitch), w = x1 - x0, xm = (x0 + x1) / 2;
  const cz = zWall + depth / 2, cy = yTop - Math.tan(pitch) * depth / 2;
  p.mass.box(xm, cy, cz, w, 0.16, L, color, pitch);
  const on = (u: number, lift: number): [number, number] => [yTop - u * Math.sin(pitch) + Math.cos(pitch) * (0.08 + lift), zWall + u * Math.cos(pitch) + Math.sin(pitch) * (0.08 + lift)];
  for (let x = x0 + 0.17; x < x1; x += 0.34) { const [y, z] = on(L / 2, 0.03); p.fine.box(x, y, z, 0.11, 0.07, L, jitter(color, r, 0.08), pitch); }
  const [y, z] = on(L - 0.06, 0.05); p.detail.box(xm, y, z, w, 0.2, 0.22, shade(color, 0.7));
  for (let x = x0 + 0.17; x < x1; x += 0.34) { const [by, bz] = on(L - 0.01, 0.05); plate(p.fine, x, by, bz + 0.13, 0.13, 0.13, 'z', 1, shade(color, 0.58)); }
  const [fy, fz] = on(L, -0.08);
  if (plaster !== null) p.detail.box(xm, fy - 0.12, fz - 0.1, w, 0.34, 0.22, plaster);
  else p.detail.box(xm, fy - 0.02, fz, w, 0.16, 0.05, 0x241b14);
  // Kragträger (bei Kura eingeputzt, bei Holzhäusern Holz).
  for (const x of [x0 + 0.25, xm, x1 - 0.25]) p.detail.box(x, yTop - 0.36, zWall + depth * 0.42, 0.12, 0.14, depth * 0.84, plaster ?? BEAM, 0.55);
  // Firstleiste an der Wand.
  p.detail.box(xm, yTop + 0.1, zWall + 0.1, w, 0.16, 0.22, shade(color, 0.7));
}

// ── Fassaden-Kleinteile ──────────────────────────────────────────────────────

/** Eisenstäbe vor einer dunklen Öffnung — Kura-Fenster haben Gitter, kein Glas. */
function barredWindow(p: Parts, x: number, y: number, z: number, w: number, h: number, frame: number, lit: boolean, glossy: boolean): void {
  if (lit) tilePlate(p.signGlow, tile(T.koshiLit, 40, 0, 216, 128), x, y, z + 0.01, w, h, 'z', 1);
  else p.glass.box(x, y, z + 0.01, w, h, 0.02, 0x121314);
  for (let u = -w / 2 + w / 6; u < w / 2 - 0.02; u += w / 6) p.detail.box(x + u, y, z + 0.06, 0.035, h, 0.035, 0x2a2a2a);
  const k = glossy ? p.gloss : p.detail, t = 0.16;
  k.box(x, y + h / 2 + t / 2, z + 0.08, w + 2 * t, t, 0.2, frame); k.box(x, y - h / 2 - t / 2, z + 0.08, w + 2 * t, t, 0.2, frame);
  k.box(x - w / 2 - t / 2, y, z + 0.08, t, h, 0.2, frame); k.box(x + w / 2 + t / 2, y, z + 0.08, t, h, 0.2, frame);
}

/**
 * Kannon-biraki: zwei dicke Putzläden, offen wie ein aufgeschlagenes Buch (110°).
 * Box-Gierwinkel: lokales +x soll entlang der Öffnungsrichtung (cos β, sin β) liegen;
 * `add` dreht mit Y, und +x wird zu (cos ψ, −sin ψ) — also ψ = −β.
 */
function shutters(p: Parts, x: number, y: number, z: number, w: number, h: number, color: number): void {
  const sw = w / 2 + 0.12, th = 0.2;
  for (const e of [-1, 1] as const) {
    const beta = e < 0 ? 1.92 : Math.PI - 1.92, hx = x + e * (w / 2 + 0.14), hz = z + 0.2;
    const cx = hx + Math.cos(beta) * sw / 2, cz = hz + Math.sin(beta) * sw / 2;
    p.gloss.box(cx, y, cz, sw, h + 0.24, th, color, 0, -beta);
    // Stufenkante (Jabara) — der Laden ist gestuft, damit er dicht schließt.
    p.detail.box(cx + Math.cos(beta) * 0.02, y, cz + Math.sin(beta) * 0.02 + 0.02, sw - 0.14, h + 0.06, th + 0.08, shade(color, 1.25), 0, -beta);
  }
}

/** Schiebetür mit Glas und Holzsprossen, einer Hälfte Licht dahinter. */
function slidingDoor(p: Parts, x: number, w: number, h: number, z: number, interior: number): void {
  const lw = w / 2;
  tilePlate(p.signGlow, tile(interior), x - lw / 2, h / 2 + 0.1, z + 0.01, lw, h, 'z', 1);
  const cx = x + lw / 2;
  p.detail.box(cx, h / 2 + 0.1, z + 0.04, lw, h, 0.05, 0x3a2c20);
  for (let row = 0; row < 3; row++) p.glass.box(cx, 0.45 + row * (h - 0.3) / 3 + (h - 0.3) / 6, z + 0.07, lw - 0.14, (h - 0.3) / 3 - 0.1, 0.02, 0x2a3136);
  p.detail.box(x, 0.06, z + 0.08, w + 0.2, 0.12, 0.3, 0x8a877c);
}

/** Koshi-Gitter: dichte Latten vor warmem Licht oder dunklem Raum. */
function koshi(p: Parts, x: number, y0: number, y1: number, z: number, w: number, color: number, lit: boolean, r: Rng): void {
  const h = y1 - y0, ym = (y0 + y1) / 2;
  if (lit) tilePlate(p.signGlow, tile(T.koshiLit, Math.floor(r() * 120), 0, Math.floor(r() * 120) + 136, 128), x, ym, z + 0.02, w, h, 'z', 1);
  else p.glass.box(x, ym, z + 0.02, w, h, 0.02, 0x16120e);
  let i = 0;
  for (let u = -w / 2 + 0.045; u < w / 2; u += 0.085, i++) plate(p.detail, x + u, i % 3 === 2 ? y0 + h * 0.62 : ym, z + 0.08, 0.04, i % 3 === 2 ? h * 0.76 : h, 'z', 1, color);
  for (const v of [y0 + 0.02, y1 - 0.02, y0 + h * 0.24]) p.detail.box(x, v, z + 0.1, w + 0.06, 0.06, 0.06, shade(color, 0.8));
}

/** Noren über einer Tür, drei Bahnen. */
function norenAt(p: Parts, x: number, y: number, z: number, w: number, t: number): void {
  p.detail.box(x, y + 0.48, z, w + 0.2, 0.04, 0.04, BEAM);
  for (let k = 0; k < 3; k++) {
    const g = new PlaneGeometry(w / 3 - 0.03, 0.9, 1, 2), tt = tile(t, k * 85, 0, k * 85 + 85, 128), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, tt[0] + uv.getX(i) * (tt[2] - tt[0]), tt[1] + uv.getY(i) * (tt[3] - tt[1]));
    p.sign.add(g, 0xffffff, x - w / 2 + (k + 0.5) * w / 3, y, z + 0.02);
  }
}

/** Kanban-Brett: dunkler Rahmen, Atlasfläche, auf zwei Stützen (auf dem Pultdach) oder an der Wand. */
function kanbanBoard(p: Parts, t: number, x: number, y: number, z: number, w: number, posts: number): void {
  p.detail.box(x, y, z, w + 0.2, w / 2 + 0.2, 0.1, BEAM);
  tilePlate(p.sign, tile(t), x, y, z + 0.055, w, w / 2, 'z', 1);
  p.detail.box(x, y + w / 4 + 0.16, z + 0.05, w + 0.4, 0.08, 0.3, 0x2a2a2a);
  if (posts > 0) for (const e of [-1, 1]) p.detail.box(x + e * w * 0.38, y - w / 4 - posts / 2, z - 0.02, 0.1, posts, 0.1, BEAM);
}

const INTERIOR: Record<KoedoRole, number> = {
  home: T.koshiLit, eel: T.inEel, imo: T.inSweets, kimono: T.inKimono, pottery: T.inPottery, museum: T.inShop, incense: T.inShop,
  soba: T.inEel, miso: T.inSake, washi: T.inShop, candy: T.inCandy, fabric: T.inKimono, cafe: T.inCafe, sweets: T.inSweets,
  tea: T.inSake, dango: T.inSweets, crafts: T.inPottery, pharmacy: T.inShop, hardware: T.inShop,
};
const SIGN: Record<KoedoRole, number> = {
  home: -1, eel: T.eel, imo: T.imo, kimono: T.kimono, pottery: T.pottery, museum: T.museum, incense: T.incense, soba: T.soba,
  miso: T.miso, washi: T.washi, candy: T.candy, fabric: T.fabric, cafe: T.cafe, sweets: T.sweets, tea: T.tea, dango: T.dango,
  crafts: T.crafts, pharmacy: T.pharmacy, hardware: T.hardware,
};
const NOREN: Record<KoedoRole, number> = {
  home: T.noren1, eel: T.noren2, imo: T.noren3, kimono: T.noren1, pottery: T.noren4, museum: T.noren2, incense: T.noren1, soba: T.noren2,
  miso: T.noren4, washi: T.noren3, candy: T.noren3, fabric: T.noren1, cafe: T.noren4, sweets: T.noren3, tea: T.noren1, dango: T.noren2,
  crafts: T.noren4, pharmacy: T.noren1, hardware: T.noren4,
};

/** Waren auf der Auslage. */
function goods(p: Parts, x: number, y: number, z: number, w: number, role: KoedoRole, r: Rng): void {
  for (let u = -w / 2 + 0.15; u < w / 2 - 0.1; u += 0.28) {
    const k = r(), zz = z + (r() - 0.5) * 0.35;
    if (role === 'pottery' || role === 'crafts') p.detail.add(new CylinderGeometry(0.09, 0.06, 0.14, 7), [0x3a4a5a, 0xb8a888, 0x6a3a2a, 0xe8e0d0][Math.floor(k * 4)]!, x + u, y + 0.07, zz);
    else if (role === 'miso' || role === 'tea') p.detail.add(new CylinderGeometry(0.1, 0.1, 0.18, 8), [0x6a4a2a, 0x3a5a3a, 0xc8a060][Math.floor(k * 3)]!, x + u, y + 0.09, zz);
    else if (role === 'candy' || role === 'sweets' || role === 'imo' || role === 'dango') p.detail.box(x + u, y + 0.05, zz, 0.22, 0.1, 0.16, [0xe84a3a, 0xf0c030, 0x3ab0e0, 0xe870b0, 0xc8783a, 0xf2ead6][Math.floor(k * 6)]!);
    else p.detail.box(x + u, y + 0.08, zz, 0.2, 0.16, 0.16, [0xd8c8a0, 0xb3261e, 0x4a6a8a, 0x6a8a3a, 0xe8e0d0][Math.floor(k * 5)]!);
  }
}

export interface KoedoSpec {
  w: number; d: number; role: KoedoRole; r: Rng;
  /** Anteil beleuchteter Fenster (Abend). */
  lit: number;
  /** Wie tief der Steinsockel unter den Boden reicht. */
  base: number;
  /** Gehweghöhe vor der Front relativ zum Boden, an lokalem x (Kiso-Lehre: Kram steht auf dem Gehweg). */
  street?: (x: number) => number;
  low?: boolean;
}
export interface KoedoResult {
  wallH: number; top: number; doorX: number; smoke: [number, number, number] | null;
}

/** Steinsockel mit Bruchsteinen auf allen vier Seiten. */
function plinth(p: Parts, w: number, d: number, base: number, r: Rng): void {
  const b = Math.max(0.45, base), hw = w / 2, hd = d / 2;
  p.mass.box(0, -b / 2, 0, w + 0.2, b, d + 0.2, 0x6f6b62);
  for (let row = 0; row * 0.36 < Math.min(b, 4); row++) {
    const y = -0.2 - row * 0.36, off = (row % 2) * 0.26;
    for (const e of [-1, 1] as const) {
      for (let x = -hw + 0.2 + off; x < hw; x += 0.52) plate(p.fine, x, y, e * (hd + 0.105), 0.46, 0.32, 'z', e, jitter(STONE, r, 0.2));
      for (let z = -hd + 0.2 + off; z < hd; z += 0.56) plate(p.fine, e * (hw + 0.105), y, z, 0.5, 0.32, 'x', e, jitter(STONE, r, 0.2));
    }
  }
}

/**
 * Das Kawagoe-Kura (Misegura). Laden unten (0…3,3), Speichergeschoss oben
 * (3,3…Y2), schwarzer Kalkputz, eingeputzte Traufe, schweres Dach. `white`
 * gibt die weiße Variante (Museum, einzelne Wohnhäuser) mit Namako unten.
 */
export function kuraHouse(p: Parts, s: KoedoSpec, white = false): KoedoResult {
  const { w, d, role, r } = s, hw = w / 2, hd = d / 2;
  const g = (x: number): number => s.street ? s.street(x) : 0;
  // Putz: tiefschwarz, anthrazit oder braunschwarz; weiß mit Namako unten.
  const wall = white ? (r() < 0.3 ? WHITE_OLD : WHITE) : [BLACK, BLACK, CHARCOAL, BROWN_BLACK][Math.floor(r() * 4)]!;
  const roofC = TILES[Math.floor(r() * TILES.length)]!;
  const Y1 = 3.3, Y2 = 6.2 + (r() < 0.4 ? 0.4 : 0) + (w > 10 ? 0.3 : 0);
  plinth(p, w, d, s.base, r);
  // Körper: Erdgeschoss etwas zurück (die Ladenfront liegt unter dem Pultdach), Speicher bündig.
  p.mass.box(0, Y1 / 2, -0.15, w, Y1, d - 0.3, white ? WHITE_OLD : wall);
  p.mass.box(0, (Y1 + Y2) / 2, 0, w, Y2 - Y1, d, white ? WHITE : wall);
  // Glanzflächen auf allen vier Seiten des Speichers und den Seiten unten (schwarz); weiß: matt.
  const face = (k: SettlementKit, y0: number, y1: number, c: number): void => {
    plate(k, 0, (y0 + y1) / 2, hd + 0.015, w, y1 - y0, 'z', 1, c);
    plate(k, 0, (y0 + y1) / 2, -hd - 0.015, w, y1 - y0, 'z', -1, c);
    for (const e of [-1, 1] as const) plate(k, e * (hw + 0.015), (y0 + y1) / 2, 0, d, y1 - y0, 'x', e, c);
  };
  if (!white) { face(p.gloss, Y1 + 0.05, Y2, wall); for (const e of [-1, 1] as const) plate(p.gloss, e * (hw + 0.015), Y1 / 2 + 0.1, -0.3, d - 0.9, Y1 - 0.2, 'x', e, wall); }
  else {
    // Namako unten an den Seiten und am Speicher als Gurt, Ecken als senkrechte Streifen.
    p.mass.box(0, 0.9, -0.15, w + 0.02, 1.8, d - 0.28, NAMAKO_FAR);
    for (const e of [-1, 1] as const) plate(p.namako, e * (hw + 0.02), 0.9, -0.15, d - 0.4, 1.8, 'x', e, JOINT);
    for (const e of [-1, 1] as const) plate(p.namako, e * (hw - 0.3), (Y1 + Y2) / 2, hd + 0.02, 0.6, Y2 - Y1 - 0.1, 'z', 1, JOINT);
  }
  // Gesims unter der Traufe (Hachimaki): zwei gestufte Putzbänder vorn und hinten.
  for (const e of [-1, 1] as const) {
    p.mass.box(0, Y2 - 0.1, e * (hd + 0.12), w + 0.24, 0.26, 0.26, shade(wall, white ? 0.95 : 1.15));
    p.detail.box(0, Y2 + 0.14, e * (hd + 0.22), w + 0.4, 0.22, 0.44, wall);
  }
  // Brandwände (Sodekabe) an manchen Häusern: Flügel am Speicher, vorn vorstehend.
  if (!white && r() < 0.4) for (const e of [-1, 1] as const) {
    p.mass.box(e * (hw - 0.12), (Y1 + Y2) / 2 + 0.2, hd + 0.35, 0.24, Y2 - Y1 + 0.4, 0.7, wall);
    plate(p.gloss, e * (hw - 0.12) - e * 0.125, (Y1 + Y2) / 2 + 0.2, hd + 0.35, 0.68, Y2 - Y1 + 0.35, 'x', -e as 1 | -1, wall);
    p.detail.box(e * (hw - 0.12), Y2 + 0.45, hd + 0.35, 0.4, 0.14, 0.9, roofC);
  }

  // ── Laden ──
  const n = Math.max(3, Math.round(w / 1.82)), bw = w / n, zf = hd - 0.3;
  const shop = role !== 'home';
  const door = Math.min(n - 1, Math.max(0, Math.floor(n * (0.3 + r() * 0.4))));
  let doorX = 0;
  for (let i = 0; i <= n; i++) p.detail.box(-hw + i * bw, Y1 / 2, zf + 0.06, 0.2, Y1, 0.2, BEAM);
  p.detail.box(0, Y1 - 0.2, zf + 0.08, w, 0.3, 0.22, BEAM);
  const interior = INTERIOR[role];
  for (let i = 0; i < n; i++) {
    const x = -hw + (i + 0.5) * bw, iw = bw - 0.2, roll = r();
    if (i === door) { doorX = x; slidingDoor(p, x, iw, 2.3, zf, interior); continue; }
    if (shop && roll < 0.62) {
      tilePlate(p.signGlow, tile(interior), x, 1.35, zf - 0.35, iw, 2.3, 'z', 1);
      // Auslage auf dem Gehweg vor dem offenen Laden.
      p.detail.box(x, g(x) + 0.55, zf + 0.5, iw - 0.1, 0.08, 0.75, 0x6a5038);
      for (const dx of [-iw / 2 + 0.15, iw / 2 - 0.15]) p.detail.box(x + dx, (g(x + dx) + 0.53) / 2, zf + 0.5, 0.08, 0.53 - g(x + dx), 0.65, 0x4a3828);
      goods(p, x, g(x) + 0.6, zf + 0.5, iw - 0.2, role, r);
    } else if (roll < 0.8) koshi(p, x, 0.3, 2.6, zf, iw, BEAM, r() < s.lit + 0.3, r);
    else {
      // Schwarze Ladenbretter (Itado), halb geschlossen.
      for (let u = -iw / 2 + 0.11; u < iw / 2; u += 0.22) plate(p.detail, x + u, 1.4, zf + 0.04, 0.2, 2.5, 'z', 1, jitter(0x2a2420, r, 0.1));
    }
  }
  // Pultdach über dem Laden, schwer, mit eingeputztem Stirnbrett.
  pent(p, -hw - 0.1, hw + 0.1, hd, Y1 + 0.2, 1.35 + r() * 0.2, roofC, r, white ? WHITE : wall);
  // Noren, Laternen, Hängeschild.
  if (shop || r() < 0.4) norenAt(p, doorX, 2.1, zf + 0.12, bw - 0.3, NOREN[role]);
  if (role === 'eel' || role === 'soba' || role === 'dango' || role === 'cafe') chochin(p, doorX + bw / 2 + 0.05, 2.55, zf + 0.7, tile(T.lanternRed), 0.22, 0.6);
  else if (shop && r() < 0.5) chochin(p, doorX - bw / 2 - 0.05, 2.55, zf + 0.7, tile(T.lanternWhite), 0.2, 0.55);
  if (shop && r() < 0.6) {
    const hx = doorX + (doorX > 0 ? -1 : 1) * (bw / 2 + 0.1);
    p.detail.box(hx, 1.7, zf + 0.35, 0.56, 1.6, 0.07, BEAM);
    portrait(p.sign, tile(r() < 0.5 ? T.tall1 : T.tall2), hx, 1.7, zf + 0.39, 0.48, 1.48, 'z', 1);
  }

  // ── Speicher: Fenster mit Kannon-biraki ──
  const nw = w > 8.6 ? 3 : 2, ww = 0.95, wh = 1.15, wy = (Y1 + Y2) / 2 + 0.15;
  const sign = SIGN[role], roofSign = sign >= 0 && r() < 0.6;
  for (let i = 0; i < nw; i++) {
    const x = -hw + (i + 0.5) * w / nw;
    if (roofSign && nw === 3 && i === 1) continue;
    barredWindow(p, x, wy, hd + 0.02, ww, wh, white ? WHITE : wall, r() < s.lit, !white);
    shutters(p, x, wy, hd + 0.02, ww, wh, white ? WHITE : wall);
  }
  // Kanban: auf dem Pultdach stehend oder an der Speicherwand.
  if (sign >= 0) {
    const sw = Math.min(3.6, w * 0.46);
    if (roofSign) kanbanBoard(p, sign, 0, Y1 + 0.75 + sw / 4, hd + 0.45, sw, 0.5);
    else kanbanBoard(p, sign, 0, Y1 + 0.35 + sw / 4, hd + 0.12, Math.min(2.8, sw), 0);
  }
  // Seitenfenster mit Läden am Speicher: wo ein Kura frei steht (Platz, Gassen), war die
  // Seite eine leere schwarze Fläche von 9 × 6 m (erstes Bild am Platz, 2026-09-26).
  for (const e of [-1, 1] as const) {
    const tmp = new Parts(), zz = -d * 0.12 + (r() - 0.5) * 1.2;
    barredWindow(tmp, 0, 0, 0.02, 0.8, 0.95, white ? WHITE : wall, r() < s.lit * 0.6, !white);
    shutters(tmp, 0, 0, 0.02, 0.8, 0.95, white ? WHITE : wall);
    place(tmp, p, e * hw, wy, zz, e * Math.PI / 2);
    // Mizukiri: schmales Ziegelgesims zwischen Laden und Speicher, auch seitlich.
    p.detail.box(e * (hw + 0.12), Y1 + 0.12, 0, 0.26, 0.12, d, roofC);
  }
  // Rückseite: kleines Fenster, Klimagerät, Stromzähler.
  { const tmp = new Parts(); barredWindow(tmp, 0, 0, 0.02, 0.7, 0.8, white ? WHITE : wall, false, false); place(tmp, p, hw * 0.4, wy, -hd, Math.PI); }
  p.detail.box(hw * 0.35, 1.2, -hd - 0.2, 0.8, 0.55, 0.3, 0xd9d8d1);
  tilePlate(p.sign, tile(T.meter, 0, 0, 128, 128), hw - 0.5, 1.6, -hd - 0.02, 0.3, 0.3, 'z', -1);

  // ── Dach ──
  const pitch = 0.5 + (r() - 0.5) * 0.06;
  const res = kuraRoof(p, { x0: -hw, x1: hw, zA: -hd, zB: hd, y: Y2 + 0.3, pitch, eaveA: 0.75, eaveB: 1.05, over: 0.45, color: roofC, r, plaster: white ? WHITE : wall, tsuma: white ? WHITE : wall, oni: 1.0 + r() * 0.5 });

  // ── Kram auf dem Gehweg ──
  const spots = Array.from({ length: n }, (_, i) => -hw + (i + 0.5) * bw).filter(x => Math.abs(x - doorX) > bw * 0.6);
  for (const x of spots) {
    const roll = r();
    if (roll < 0.26) for (let k = 0; k < 1 + Math.floor(r() * 3); k++) pottedPlant(p, x + (k - 1) * 0.42, g(x + (k - 1) * 0.42), hd + 0.3 + (k % 2) * 0.15, r);
    else if (roll < 0.38 && (role === 'dango' || role === 'sweets' || role === 'imo' || role === 'cafe' || role === 'tea')) bench(p, x, g(x), hd + 0.65, 'x', r() < 0.5);
    else if (roll < 0.46) {
      // Tenbōsui: Pyramide aus roten Löscheimern — in Kawagoe vor vielen Kura.
      for (let k = 0; k < 6; k++) { const row = k < 3 ? 0 : k < 5 ? 1 : 2, ix = k - [0, 3, 5][row]!; p.detail.add(new CylinderGeometry(0.15, 0.12, 0.26, 8), 0xb8261c, x + (ix - (2 - row) / 2) * 0.32, g(x) + 0.13 + row * 0.25, hd + 0.35); }
    } else if (roll < 0.52) {
      tilePlate(p.sign, tile(T.sudare), x, g(x) + 1.1, hd + 0.32, Math.min(1.5, bw - 0.2), 2.2, 'z', 1, 0xffffff, -0.16);
      tilePlate(p.sign, tile(T.sudare), x, g(x) + 1.1, hd + 0.31, Math.min(1.5, bw - 0.2), 2.2, 'z', -1, 0xc8c0b0, 0.16);
    }
  }
  if (role === 'imo' || role === 'dango' || role === 'sweets') {
    const mx = doorX + (doorX > 0 ? -1.1 : 1.1);
    for (const f of [-1, 1]) { p.detail.box(mx, g(mx) + 0.52, hd + 1.0 + f * 0.14, 0.62, 1.0, 0.04, 0x4a3828, f * 0.14); tilePlate(p.sign, tile(T.menu), mx, g(mx) + 0.6, hd + 1.0 + f * 0.17, 0.56, 0.44, 'z', f, 0xffffff, f * 0.14); }
  }
  if (r() < 0.2 && spots.length) bicycle(p, spots[0]! + 0.3, g(spots[0]! + 0.3), hd + 0.3);
  const smoke: [number, number, number] | null = role === 'eel' || role === 'dango' ? [hw * 0.5, res.top - 0.4, -hd * 0.4] : null;
  return { wallH: Y2 + 0.3, top: res.top, doorX, smoke };
}

/**
 * Machiya — das Holzhaus zwischen den Kura. Niedriges Obergeschoss (Tsushi-nikai)
 * mit Mushiko-mado: weißer Putz mit senkrechten Schlitzen, das Merkmal von Kurashiki
 * und Kyoto. Unten Bengara- oder dunkles Gitter, Pultdach, Noren.
 */
export function machiya(p: Parts, s: KoedoSpec): KoedoResult {
  const { w, d, role, r } = s, hw = w / 2, hd = d / 2, low = !!s.low;
  const g = (x: number): number => s.street ? s.street(x) : 0;
  const wood = WOOD[Math.floor(r() * WOOD.length)]!, lattice = r() < 0.45 ? BENGARA : BEAM;
  const plaster = r() < 0.3 ? 0xd8ccb0 : 0xe9e4d6, roofC = TILES[Math.floor(r() * TILES.length)]!;
  const Y1 = 3.0, Y2 = low ? Y1 : 5.2 + (r() < 0.3 ? 0.3 : 0);
  plinth(p, w, d, s.base, r);
  p.mass.box(0, Y1 / 2, 0, w, Y1, d, wood);
  if (!low) p.mass.box(0, (Y1 + Y2) / 2, -0.05, w, Y2 - Y1, d - 0.1, plaster);
  // Seiten: Bretter unten, Putz oben mit Pfosten.
  for (const e of [-1, 1] as const) {
    for (let z = -hd + 0.14; z < hd; z += 0.28) plate(p.fine, e * (hw + 0.03), Y1 / 2, z, 0.26, Y1 - 0.1, 'x', e, jitter(wood, r, 0.12));
    if (!low) for (let z = -hd; z <= hd + 0.01; z += d / Math.max(2, Math.round(d / 1.8))) p.detail.box(e * (hw + 0.02), (Y1 + Y2) / 2, z, 0.1, Y2 - Y1, 0.14, BEAM);
  }
  for (let x = -hw + 0.14; x < hw; x += 0.28) plate(p.fine, x, Y1 / 2, -hd - 0.03, 0.26, Y1 - 0.1, 'z', -1, jitter(wood, r, 0.12));
  // Erdgeschoss-Front.
  const n = Math.max(3, Math.round(w / 1.82)), bw = w / n, zf = hd;
  const shop = role !== 'home';
  const door = Math.min(n - 1, Math.max(0, Math.floor(n * (0.25 + r() * 0.5))));
  let doorX = 0;
  for (let i = 0; i <= n; i++) p.detail.box(-hw + i * bw, Y1 / 2, zf + 0.06, 0.16, Y1, 0.14, BEAM);
  p.detail.box(0, Y1 - 0.12, zf + 0.07, w, 0.22, 0.14, BEAM);
  p.detail.box(0, 0.2, zf + 0.07, w, 0.2, 0.14, BEAM);
  const interior = INTERIOR[role];
  for (let i = 0; i < n; i++) {
    const x = -hw + (i + 0.5) * bw, iw = bw - 0.18;
    if (i === door) { doorX = x; slidingDoor(p, x, iw, 2.2, zf, interior); continue; }
    if (shop && Math.abs(i - door) === 1 && r() < 0.75) {
      tilePlate(p.signGlow, tile(interior), x, 1.3, zf - 0.3, iw, 2.2, 'z', 1);
      p.detail.box(x, g(x) + 0.5, zf + 0.42, iw - 0.1, 0.08, 0.7, 0x6a5038);
      goods(p, x, g(x) + 0.55, zf + 0.42, iw - 0.2, role, r);
    } else koshi(p, x, 0.34, 2.55, zf, iw, lattice, r() < s.lit + 0.25, r);
  }
  // Obergeschoss: Mushiko-mado oder Holzgitter.
  if (!low) {
    const nw = Math.max(2, Math.round(w / 2.6));
    for (let i = 0; i < nw; i++) {
      const x = -hw + (i + 0.5) * w / nw, mw = Math.min(2.0, w / nw - 0.5), my = (Y1 + Y2) / 2 + 0.2, mh = Y2 - Y1 - 1.0;
      if (r() < 0.7) {
        plate(p.detail, x, my, hd + 0.02, mw + 0.24, mh + 0.2, 'z', 1, shade(plaster, 1.02));
        const slots = Math.max(4, Math.round(mw / 0.19)), lit = r() < s.lit;
        for (let k = 0; k < slots; k++) {
          const sx = x - mw / 2 + (k + 0.5) * mw / slots;
          if (lit) tilePlate(p.signGlow, tile(T.shojiWarm, 40, 20, 80, 110), sx, my, hd + 0.03, mw / slots * 0.48, mh, 'z', 1);
          else plate(p.glass, sx, my, hd + 0.03, mw / slots * 0.48, mh, 'z', 1, 0x1a1816);
        }
      } else koshi(p, x, my - mh / 2, my + mh / 2, hd - 0.03, mw, lattice, r() < s.lit, r);
    }
  }
  pent(p, -hw - 0.05, hw + 0.05, hd, Y1 + 0.08, 0.95 + r() * 0.2, roofC, r, null);
  if (shop || r() < 0.5) norenAt(p, doorX, 1.95, zf + 0.12, bw - 0.3, NOREN[role]);
  const sign = SIGN[role];
  if (sign >= 0) {
    if (low) kanbanBoard(p, sign, doorX, Y1 - 0.55, zf + 0.25, Math.min(1.8, w * 0.3), 0);
    else kanbanBoard(p, sign, 0, Y1 + 0.85, hd + 0.12, Math.min(2.4, w * 0.36), 0);
  }
  if (role === 'candy' || role === 'dango' || role === 'soba') chochin(p, doorX + bw / 2 + 0.05, 2.35, zf + 0.62, tile(T.lanternRed), 0.2, 0.55);
  const res = kuraRoof(p, { x0: -hw, x1: hw, zA: -hd, zB: hd + 0.1, y: Y2 + 0.05, pitch: 0.42, eaveA: 0.65, eaveB: low ? 1.0 : 0.85, over: 0.35, color: roofC, r, plaster: null, tsuma: r() < 0.5 ? plaster : wood, oni: 0.55, ridge: 0.5 });
  const spots = Array.from({ length: n }, (_, i) => -hw + (i + 0.5) * bw).filter(x => Math.abs(x - doorX) > bw * 0.6);
  for (const x of spots) if (r() < 0.35) pottedPlant(p, x, g(x), hd + 0.35, r);
  if (r() < 0.25 && spots.length) bicycle(p, spots[0]! + 0.3, g(spots[0]! + 0.3), hd + 0.3);
  p.detail.box(hw * 0.3, 1.2, -hd - 0.2, 0.8, 0.55, 0.3, 0xd9d8d1);
  const smoke: [number, number, number] | null = role === 'home' && r() < 0.35 ? [(r() - 0.5) * w * 0.4, res.top - 0.3, -hd * 0.3] : null;
  return { wallH: Y2, top: res.top, doorX, smoke };
}

export interface WhiteSpec {
  w: number; d: number; r: Rng; gable: boolean; lit: number; base: number;
  /** Laden oder Wohnen (Noren, Licht) statt reinem Speicher. */
  shop: boolean;
}

/**
 * Das Kurashiki-Kura am Kanal: weißer Putz, Namako unten (oder schwarze Bretter),
 * Namako an den Ecken und als Gurt, vergitterte Fenster mit kleinem Dach, Giebel
 * oft zur Promenade. Auch als Speicher (Dozō) im Hinterland.
 */
export function whiteKura(p: Parts, s: WhiteSpec): KoedoResult {
  const { w, d, r } = s, hw = w / 2, hd = d / 2;
  const plaster = r() < 0.3 ? WHITE_OLD : WHITE, roofC = TILES[Math.floor(r() * TILES.length)]!;
  const Y2 = 5.7 + (r() < 0.4 ? 0.5 : 0), band = r() < 0.7 ? 1.4 + r() * 0.8 : 0;
  plinth(p, w, d, s.base, r);
  p.mass.box(0, Y2 / 2, 0, w, Y2, d, plaster);
  // Sockelzone: Namako (Kurashiki) oder geflammte Zedernbretter (Yakisugi).
  const lowH = band > 0 ? band : 1.6;
  const around = (fn: (x: number, z: number, len: number, axis: 'x' | 'z', f: 1 | -1) => void): void => {
    fn(0, hd, w, 'z', 1); fn(0, -hd, w, 'z', -1); fn(hw, 0, d, 'x', 1); fn(-hw, 0, d, 'x', -1);
  };
  if (band > 0) {
    p.mass.box(0, lowH / 2, 0, w + 0.02, lowH, d + 0.02, NAMAKO_FAR);
    around((x, z, len, axis, f) => plate(p.namako, x + (axis === 'x' ? f * 0.02 : 0), lowH / 2, z + (axis === 'z' ? f * 0.02 : 0), len, lowH, axis, f, JOINT));
  } else {
    p.mass.box(0, lowH / 2, 0, w + 0.02, lowH, d + 0.02, 0x1e1a18);
    around((x, z, len, axis, f) => { for (let u = -len / 2 + 0.13; u < len / 2; u += 0.26) plate(p.fine, axis === 'z' ? u : x + f * 0.03, lowH / 2, axis === 'z' ? z + f * 0.03 : u, 0.25, lowH - 0.04, axis, f, jitter(0x241e1a, r, 0.14)); });
  }
  // Mizukiri: kleine Ziegelkante über der Sockelzone.
  around((x, z, len, axis, f) => p.detail.box(x + (axis === 'x' ? f * 0.1 : 0), lowH + 0.06, z + (axis === 'z' ? f * 0.1 : 0), axis === 'z' ? len + 0.2 : 0.2, 0.1, axis === 'z' ? 0.2 : len + 0.2, roofC));
  // Namako-Ecken und Gurtband zwischen den Geschossen.
  for (const ex of [-1, 1] as const) for (const ez of [-1, 1] as const) {
    plate(p.namako, ex * (hw - 0.25), (lowH + Y2) / 2, ez * (hd + 0.02), 0.5, Y2 - lowH - 0.1, 'z', ez, JOINT);
    plate(p.namako, ex * (hw + 0.02), (lowH + Y2) / 2, ez * (hd - 0.25), 0.5, Y2 - lowH - 0.1, 'x', ex, JOINT);
  }
  if (r() < 0.75) around((x, z, len, axis, f) => plate(p.namako, x + (axis === 'x' ? f * 0.022 : 0), 3.0, z + (axis === 'z' ? f * 0.022 : 0), len - 1.1, 0.42, axis, f, JOINT));
  // Front: Tür oder Laden unten, Fenster oben.
  const frameC = plaster, lit = r() < s.lit;
  let doorX = 0;
  if (s.shop) {
    doorX = (r() - 0.5) * (w - 3);
    tilePlate(p.signGlow, tile([T.inShop, T.inPottery, T.inCafe, T.inSweets][Math.floor(r() * 4)]!), doorX, 1.2, hd + 0.02, 1.7, 2.2, 'z', 1);
    for (const e of [-1, 1]) p.detail.box(doorX + e * 0.95, 1.2, hd + 0.08, 0.2, 2.4, 0.2, BEAM);
    p.detail.box(doorX, 2.45, hd + 0.08, 2.1, 0.22, 0.22, BEAM);
    norenAt(p, doorX, 1.8, hd + 0.14, 1.6, [T.noren1, T.noren3, T.noren4][Math.floor(r() * 3)]!);
    const sx = doorX + (doorX > 0 ? -2.1 : 2.1);
    if (Math.abs(sx) < hw - 0.7) { p.detail.box(sx, 1.5, hd + 0.1, 1.2, 1.5, 0.05, BEAM); koshi(p, sx, 0.8, 2.2, hd + 0.02, 1.1, BENGARA, lit, r); }
  } else {
    // Kura-Tür: dicker Rahmen, dunkle Öffnung, Holztür halb offen.
    p.detail.box(doorX, 1.15, hd + 0.12, 1.8, 2.5, 0.24, frameC);
    p.glass.box(doorX, 1.05, hd + 0.2, 1.2, 2.1, 0.02, 0x141210);
    p.detail.box(doorX - 0.35, 1.05, hd + 0.23, 0.5, 2.05, 0.06, 0x4a3a2a);
  }
  // Fenster oben: vergittert, mit Putzrahmen und kleinem Dach (Mado-hisashi).
  const nwin = s.gable ? 1 : w > 8 ? 2 : 1, wy = 3.9 + (Y2 - 5.7) * 0.5;
  for (let i = 0; i < nwin; i++) {
    const x = nwin === 1 ? 0 : (i - 0.5) * w * 0.45, ww = s.gable ? 1.6 : 0.9, wh = s.gable ? 1.1 : 0.8;
    barredWindow(p, x, wy, hd + 0.02, ww, wh, frameC, r() < s.lit, false);
    p.detail.box(x, wy + wh / 2 + 0.3, hd + 0.35, ww + 0.8, 0.1, 0.6, roofC, 0.35);
    for (const e of [-1, 1]) p.detail.box(x + e * (ww / 2 + 0.25), wy + wh / 2 + 0.12, hd + 0.3, 0.1, 0.3, 0.5, frameC, 0, 0, 0);
  }
  // Seitenfenster.
  for (const e of [-1, 1] as const) if (r() < 0.6) {
    const z = (r() - 0.5) * (d - 3), g = new Parts(); barredWindow(g, 0, 0, 0.02, 0.7, 0.7, frameC, r() < s.lit, false); place(g, p, e * hw, wy, z, e * Math.PI / 2);
  }
  // Dach: Giebel zur Promenade (First entlang z) oder traufständig.
  let top: number;
  if (s.gable) {
    const tmp = new Parts();
    const res = kuraRoof(tmp, { x0: -hd, x1: hd, zA: -hw, zB: hw, y: Y2 + 0.05, pitch: 0.5, eaveA: 0.6, eaveB: 0.6, over: 0.55, color: roofC, r, plaster, tsuma: plaster, oni: 0.8 });
    place(tmp, p, 0, 0, 0, Math.PI / 2);
    top = res.top;
    // Wappen im Giebel (Kamon) — rund, dunkel auf weiß.
    const rise = Math.tan(0.5) * hw;
    p.detail.add(new CircleGeometry(0.36, 16), 0x2a2622, 0, Y2 + rise * 0.45, hd + 0.03);
    p.detail.add(new CircleGeometry(0.28, 16), plaster, 0, Y2 + rise * 0.45, hd + 0.04);
    p.detail.box(0, Y2 + rise * 0.45, hd + 0.05, 0.36, 0.08, 0.01, 0x2a2622);
  } else {
    top = kuraRoof(p, { x0: -hw, x1: hw, zA: -hd, zB: hd, y: Y2 + 0.05, pitch: 0.48, eaveA: 0.6, eaveB: 0.7, over: 0.4, color: roofC, r, plaster, tsuma: plaster, oni: 0.85 }).top;
  }
  // Fallrohr (Kupfer) an einer Ecke.
  p.detail.add(new CylinderGeometry(0.05, 0.05, Y2, 6), 0x6e5037, hw - 0.1, Y2 / 2, hd + 0.35);
  return { wallH: Y2, top, doorX, smoke: null };
}

/**
 * Modernes Wohnhaus am Ortsrand — der Übergang zur Stadt: Faserzementplatten
 * in Beige oder Grau, Aluminiumfenster, Balkon mit Wäsche, flaches Ziegeldach.
 */
export function modernHouse(p: Parts, w: number, d: number, floors: number, r: Rng): KoedoResult {
  const hw = w / 2, hd = d / 2, H = floors * 2.9;
  const skin = [0xd6cfc0, 0xb8b4ac, 0xe4e0d6, 0x9ea4a8, 0xc8b8a0][Math.floor(r() * 5)]!;
  p.mass.box(0, -0.25, 0, w + 0.2, 0.5, d + 0.2, 0x8a877e);
  p.mass.box(0, H / 2, 0, w, H, d, skin);
  // Plattenfugen.
  for (let y = 0.9; y < H; y += 0.9) for (const f of [-1, 1] as const) p.fine.box(0, y, f * (hd + 0.005), w, 0.02, 0.01, shade(skin, 0.85));
  for (let f = 0; f < floors; f++) {
    const y = f * 2.9 + 1.5;
    for (let x = -hw + 1.3; x < hw - 0.8; x += 2.4) {
      const lit = r() < 0.45;
      if (lit) tilePlate(p.signGlow, tile(T.flatLit), x, y, hd + 0.02, 1.5, 1.2, 'z', 1);
      else p.glass.box(x, y, hd + 0.02, 1.5, 1.2, 0.02, 0x2f3d45);
      p.detail.box(x, y, hd + 0.04, 1.62, 1.32, 0.03, 0xb8bcbc);
      p.detail.box(x, y, hd + 0.05, 0.04, 1.2, 0.02, 0xb8bcbc);
    }
    if (f > 0 && r() < 0.7) {
      p.detail.box(0, f * 2.9 + 0.05, hd + 0.6, w - 1.2, 0.12, 1.2, 0xa8a8a2);
      p.detail.box(0, f * 2.9 + 0.6, hd + 1.18, w - 1.2, 1.0, 0.06, 0x8a9094);
      if (r() < 0.6) for (let k = 0; k < 4; k++) cloth(p.cloth, -w / 3 + k * 0.7, f * 2.9 + 1.75, hd + 0.8, 0.55, 0.7, 'z', 1, [0xf0f0e8, 0x6a8ab8, 0xd86a5a, 0xe8d8a0][k % 4]!, 2);
    }
  }
  p.detail.box(hw * 0.4, 1.0, -hd - 0.2, 0.8, 0.55, 0.3, 0xd9d8d1);
  p.detail.box(-hw + 0.8, 1.0, hd + 0.2, 0.8, 0.55, 0.3, 0xd9d8d1);
  const tmp = new Parts(); const res = kuraRoof(tmp, { x0: -hw, x1: hw, zA: -hd, zB: hd, y: H, pitch: 0.36, eaveA: 0.6, eaveB: 0.6, over: 0.4, color: r() < 0.5 ? 0x5a5a5e : 0x6a4a3e, r, plaster: null, tsuma: skin, oni: 0, ridge: 0.35 });
  place(tmp, p, 0, 0, 0, 0);
  return { wallH: H, top: res.top, doorX: 0, smoke: null };
}

// ── Toki no Kane ────────────────────────────────────────────────────────────

/**
 * Der Glockenturm von Kawagoe: drei Geschosse aus dunklem Holz, jedes mit
 * eigenem Pultdach, oben offen mit der Glocke, Pyramidendach mit Knauf. 15 m über
 * dem Sockel — höher als jedes Kura-Dach (≈ 9 m), damit er aus den Reisfeldern
 * über der Dachkette steht. y 0 = Oberkante des Plateaus.
 */
export function tokiNoKane(p: Parts, r: Rng): { top: number } {
  const wood = 0x4a3222, dark = 0x2e2018, copper = 0x5a3e2c;
  p.mass.box(0, 0.6, 0, 4.6, 1.2, 4.6, 0x77736a);
  for (let row = 0; row < 3; row++) for (let x = -2.1 + (row % 2) * 0.25; x < 2.2; x += 0.55) for (const f of [-1, 1] as const) {
    plate(p.fine, x, 0.2 + row * 0.38, f * 2.31, 0.5, 0.34, 'z', f, jitter(STONE, r, 0.18)); plate(p.fine, f * 2.31, 0.2 + row * 0.38, x, 0.5, 0.34, 'x', f, jitter(STONE, r, 0.18));
  }
  const tier = (y0: number, h: number, hw: number): void => {
    p.mass.box(0, y0 + h / 2, 0, 2 * hw, h, 2 * hw, wood);
    for (const f of [-1, 1] as const) for (let u = -hw + 0.13; u < hw; u += 0.26) {
      plate(p.fine, u, y0 + h / 2, f * (hw + 0.02), 0.24, h - 0.1, 'z', f, jitter(wood, r, 0.12));
      plate(p.fine, f * (hw + 0.02), y0 + h / 2, u, 0.24, h - 0.1, 'x', f, jitter(wood, r, 0.12));
    }
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) p.detail.box(ex * hw, y0 + h / 2, ez * hw, 0.2, h, 0.2, dark);
    for (const y of [y0 + 0.15, y0 + h - 0.2]) for (const f of [-1, 1]) { p.detail.box(0, y, f * (hw + 0.05), 2 * hw + 0.2, 0.18, 0.1, dark); p.detail.box(f * (hw + 0.05), y, 0, 0.1, 0.18, 2 * hw + 0.2, dark); }
  };
  /** Umlaufendes Pultdach (vier Pulte) auf Höhe y um einen Kern der halben Breite hw. */
  const skirt = (y: number, hw: number, depth: number): void => {
    for (let k = 0; k < 4; k++) {
      const tmp = new Parts(), pitch = 0.42, L = depth / Math.cos(pitch);
      tmp.mass.box(0, y - Math.tan(pitch) * depth / 2, hw + depth / 2, 2 * (hw + depth), 0.14, L, copper, pitch);
      for (let x = -hw - depth + 0.2; x < hw + depth; x += 0.4) tmp.fine.box(x, y - Math.tan(pitch) * depth / 2 + 0.09, hw + depth / 2, 0.06, 0.05, L, shade(copper, 1.15), pitch);
      tmp.detail.box(0, y - Math.tan(pitch) * depth - 0.02, hw + depth, 2 * (hw + depth), 0.16, 0.08, dark);
      place(tmp, p, 0, 0, 0, k * Math.PI / 2);
    }
  };
  tier(1.2, 4.6, 1.7); skirt(5.9, 1.7, 1.0);
  tier(5.8, 3.0, 1.4); skirt(8.9, 1.4, 0.9);
  // Glockengeschoss: offen, vier Pfosten, Brüstung, Glocke.
  const y0 = 8.8, hb = 2.6, hw = 1.35;
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) p.mass.box(ex * hw, y0 + hb / 2, ez * hw, 0.2, hb, 0.2, dark);
  for (const f of [-1, 1]) { p.detail.box(0, y0 + 0.75, f * hw, 2 * hw, 0.1, 0.08, dark); p.detail.box(f * hw, y0 + 0.75, 0, 0.08, 0.1, 2 * hw, dark); p.detail.box(0, y0 + 0.2, f * hw, 2 * hw, 0.4, 0.06, wood); p.detail.box(f * hw, y0 + 0.2, 0, 0.06, 0.4, 2 * hw, wood); }
  p.mass.box(0, y0 - 0.05, 0, 2 * hw + 0.4, 0.14, 2 * hw + 0.4, dark);
  p.mass.add(new CylinderGeometry(0.42, 0.52, 1.1, 14), 0x3e5a4c, 0, y0 + 1.3, 0);
  p.mass.add(new SphereGeometry(0.42, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x3e5a4c, 0, y0 + 1.85, 0);
  p.detail.add(new TorusGeometry(0.48, 0.03, 4, 18), 0x2e4a3c, 0, y0 + 1.1, 0, Math.PI / 2);
  p.detail.box(0, y0 + 2.25, 0, 2 * hw, 0.16, 0.16, dark);
  // Pyramidendach (Hōgyō) mit geschwungener Traufe, Knauf (Hōju).
  const ry = y0 + hb, over = 1.05, R = hw + over, apex = ry + 1.9;
  for (let k = 0; k < 4; k++) {
    const tmp = new Parts();
    polyFacing(tmp.mass, [[-R, ry, R], [R, ry, R], [0, apex, 0]], copper, [0, 0.6, 1]);
    polyFacing(tmp.mass, [[-R, ry - 0.12, R], [R, ry - 0.12, R], [0, ry + 0.2, 0]], dark, [0, -1, 0.2]);
    tmp.detail.box(0, ry - 0.06, R, 2 * R, 0.18, 0.1, dark);
    for (let t = 0.12; t < 0.9; t += 0.11) tmp.fine.box(0, ry + (apex - ry) * t + 0.02, R * (1 - t), 2 * R * (1 - t), 0.04, 0.06, shade(copper, 1.2));
    place(tmp, p, 0, 0, 0, k * Math.PI / 2);
  }
  p.detail.add(new CylinderGeometry(0.06, 0.1, 0.9, 6), 0x6a5a3a, 0, apex + 0.4, 0);
  ball(p.detail, 0, apex + 0.95, 0, 0.18, 0x7a6a3a, 8);
  // Tür unten, Schild daneben.
  p.detail.box(0, 2.3, 1.72, 1.1, 2.1, 0.08, dark);
  return { top: apex + 1.1 };
}

// ── Brauerei ────────────────────────────────────────────────────────────────

export interface BreweryWalk {
  floors: [number, number, number, number, number][];
  walls: [number, number, number, number, number, number][];
  cylinders: [number, number, number, number][];
  path: [number, number][];
  chimney: [number, number, number];
  smoke: [number, number, number][];
}

/**
 * Izumiya — die Sake-Brauerei. Lokal: Front bei z = 0 an der Gehwegkante, das
 * Grundstück nach −z (Tiefe D), x −W/2…W/2. Laden (schwarze Kura, begehbar mit
 * Probiertheke), Tor, Hof, Brauhalle (begehbar, Tanks und Holzbottiche),
 * Reisspeicher, Ziegelschornstein. y 0 = Laden- und Hofboden.
 */
export function brewery(p: Parts, W: number, D: number, r: Rng): BreweryWalk {
  const walk: BreweryWalk = { floors: [], walls: [], cylinders: [], path: [], chimney: [0, 0, 0], smoke: [] };
  const hw = W / 2, I = p.interior, IT = p.interiorTex;
  const plaster = WHITE, roofC = TILES[0];
  // ── Laden (Misegura), links vorn ──
  const sx0 = -hw + 0.3, sx1 = sx0 + 12, sz0 = -10, sw = sx1 - sx0, smx = (sx0 + sx1) / 2;
  const Y1 = 3.4, Y2 = 6.8;
  // Wände: hinten mit Durchgang, Seiten; die Front ist offen (Pfosten, Noren).
  const panel = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, col: number, glossy: boolean): void => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    p.mass.box(cx, (y0 + y1) / 2, cz, alongX ? len : 0.3, y1 - y0, alongX ? 0.3 : len, col);
    // Außen glänzender Kalkputz, innen gelblicher Lehmputz über einem Holzsockel — die erste
    // Fassung trug den Glanz auf beiden Seiten, und der Laden war innen schwarz (Bild 2026-09-26).
    const inside: 1 | -1 = alongX ? (sz0 / 2 > cz ? 1 : -1) : (smx > cx ? 1 : -1), outside = (-inside) as 1 | -1;
    if (glossy) plate(p.gloss, alongX ? cx : cx + outside * 0.16, (y0 + y1) / 2, alongX ? cz + outside * 0.16 : cz, len, y1 - y0, alongX ? 'z' : 'x', outside, col);
    plate(p.interior, alongX ? cx : cx + inside * 0.16, Y1 / 2 + 0.55, alongX ? cz + inside * 0.16 : cz, len - 0.1, Y1 - 1.1, alongX ? 'z' : 'x', inside, 0xc8b894);
    plate(p.interior, alongX ? cx : cx + inside * 0.17, 0.55, alongX ? cz + inside * 0.17 : cz, len - 0.1, 1.1, alongX ? 'z' : 'x', inside, 0x5a3e2a);
    walk.walls.push([x0, z0, x1, z1, -0.5, y1]);
  };
  panel(sx0, sz0, sx0, 0, 0, Y2, BLACK, true);
  panel(sx1, sz0, sx1, 0, 0, Y2, BLACK, true);
  const backDoor = smx + 3;
  panel(sx0, sz0, backDoor - 0.9, sz0, 0, Y2, BLACK, true);
  panel(backDoor + 0.9, sz0, sx1, sz0, 0, Y2, BLACK, true);
  p.mass.box(backDoor, (2.5 + Y2) / 2, sz0, 1.8, Y2 - 2.5, 0.3, BLACK);
  // Speichergeschoss und Decke über dem Laden.
  p.mass.box(smx, (Y1 + Y2) / 2, -0.15, sw, Y2 - Y1, 0.3, BLACK);
  plate(p.gloss, smx, (Y1 + Y2) / 2, 0.02, sw, Y2 - Y1, 'z', 1, BLACK);
  I.box(smx, Y1 - 0.05, sz0 / 2, sw - 0.3, 0.1, -sz0 - 0.3, 0x3a2a1c);
  for (let x = sx0 + 1; x < sx1; x += 1.8) I.box(x, Y1 - 0.25, sz0 / 2, 0.22, 0.3, -sz0 - 0.4, 0x241a12);
  for (let i = 0; i < 2; i++) { const x = sx0 + sw * (0.28 + i * 0.44); barredWindow(p, x, 5.2, 0.02, 1.0, 1.15, BLACK, r() < 0.6, true); shutters(p, x, 5.2, 0.02, 1.0, 1.15, BLACK); }
  // Offene Front: Pfosten, Balken, Noren über der ganzen Breite.
  for (let x = sx0; x <= sx1 + 0.01; x += sw / 4) p.detail.box(x, Y1 / 2, 0.05, 0.24, Y1, 0.24, BEAM);
  p.detail.box(smx, Y1 - 0.2, 0.08, sw, 0.36, 0.26, BEAM);
  norenAt(p, smx - 1.5, 2.45, 0.2, 2.6, T.noren4);
  pent(p, sx0 - 0.1, sx1 + 0.1, 0, Y1 + 0.2, 1.6, roofC, r, BLACK);
  kanbanBoard(p, T.brewery, smx, Y1 + 1.7, 0.5, 4.2, 0.7);
  kuraRoof(p, { x0: sx0, x1: sx1, zA: sz0, zB: 0, y: Y2 + 0.3, pitch: 0.52, eaveA: 0.7, eaveB: 1.0, over: 0.45, color: roofC, r, plaster: BLACK, tsuma: BLACK, oni: 1.5 });
  for (const e of [-1, 1] as const) { p.mass.box(smx, Y2 - 0.1, e < 0 ? sz0 - 0.1 : 0.12, sw + 0.24, 0.26, 0.26, CHARCOAL); p.detail.box(smx, Y2 + 0.14, e < 0 ? sz0 - 0.2 : 0.22, sw + 0.4, 0.22, 0.44, BLACK); }
  // Sugidama: die große Zedernkugel unter dem Pultdach — das Zeichen jeder Brauerei.
  {
    const g = new SphereGeometry(0.62, 14, 10), t = tile(T.sugidama), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
    p.sign.add(g, 0xffffff, sx1 - 1.4, 2.75, 0.95);
    p.detail.box(sx1 - 1.4, 3.35, 0.95, 0.03, 0.5, 0.03, 0x2a2018);
  }
  // Komodaru-Fässer gestapelt vor dem Laden und drinnen.
  const barrel = (k: SettlementKit, x: number, y: number, z: number, rr = 0.34): void => { tileCylinder(k, tile(T.komodaru), x, y + rr * 1.1, z, rr, rr * 2.2, 12); k.add(new CircleGeometry(rr, 12), 0xd8c48a, x, y + rr * 2.2 + 0.001, z, -Math.PI / 2, 0, 0); };
  for (let i = 0; i < 3; i++) barrel(p.sign, sx0 + 1.0 + i * 0.72, 0, 0.7);
  for (let i = 0; i < 2; i++) barrel(p.sign, sx0 + 1.36 + i * 0.72, 0.75, 0.7);
  barrel(p.sign, sx0 + 1.72, 1.5, 0.7);
  // ── Laden innen: Doma aus Stein, Probiertheke, Flaschenregale, Bottiche ──
  I.box(smx, -0.02, sz0 / 2, sw - 0.3, 0.06, -sz0 - 0.3, 0x6a6258);
  for (let x = sx0 + 0.6; x < sx1; x += 1.2) for (let z = sz0 + 0.6; z < -0.2; z += 1.2) I.box(x + (r() - 0.5) * 0.05, 0.015, z, 1.12, 0.02, 1.12, jitter(0x7a7266, r, 0.08));
  // Schwelle durch die Hintertür: ohne sie lag zwischen Laden und Hof ein 0,5-m-Spalt, und die Figur fiel hindurch (Messlauf).
  walk.floors.push([sx0 + 0.2, sz0 + 0.2, sx1 - 0.2, 0.2, 0.03], [backDoor - 0.9, sz0 - 0.5, backDoor + 0.9, sz0 + 0.4, 0.02]);
  // Theke (L-förmig) mit Probierbechern und Flaschen.
  const cx0 = sx0 + 1.2, cx1 = sx0 + 6.5, cz = sz0 + 2.6;
  I.box((cx0 + cx1) / 2, 0.52, cz, cx1 - cx0, 1.04, 0.6, 0x5a3e28);
  I.box((cx0 + cx1) / 2, 1.07, cz, cx1 - cx0 + 0.1, 0.06, 0.72, 0x7a5a3a);
  for (let x = cx0 + 0.3; x < cx1; x += 0.45) { I.add(new CylinderGeometry(0.035, 0.03, 0.07, 8), 0xf2efe6, x, 1.14, cz + 0.12); I.add(new CylinderGeometry(0.045, 0.05, 0.3, 7), [0x1e4a2e, 0x4a1e14, 0x1a2a4a][Math.floor(r() * 3)]!, x + 0.15, 1.25, cz - 0.15); }
  walk.walls.push([cx0, cz, cx1, cz, -0.5, 1.1]);
  tilePlate(IT, tile(T.bottles), sx0 + 3.8, 1.7, sz0 + 0.18, 5.2, 2.4, 'z', 1);
  tilePlate(IT, tile(T.bottles), sx0 + 0.17, 1.7, sz0 / 2 - 0.5, 4.2, 2.2, 'x', 1);
  tilePlate(IT, tile(T.poster), sx1 - 0.18, 2.0, sz0 / 2, 1.6, 0.8, 'x', -1);
  for (let i = 0; i < 3; i++) barrel(IT, sx1 - 1.0, 0, sz0 + 1.4 + i * 0.75, 0.3);
  // Hängelampen im Laden (Glühlampen unter Schirmen).
  for (const x of [sx0 + 3, sx0 + 7, sx0 + 10]) { I.box(x, Y1 - 0.8, sz0 / 2, 0.02, 1.4, 0.02, 0x1a1a1a); I.add(new ConeGeometry(0.28, 0.2, 10, 1, true), 0x2a2a2a, x, Y1 - 1.5, sz0 / 2); p.glow.box(x, Y1 - 1.62, sz0 / 2, 0.16, 0.08, 0.16, 0xffd8a0); }
  walk.path.push([smx - 1.5, 1.2], [smx - 1.5, -2], [backDoor, -6], [backDoor, sz0 - 1.2]);

  // ── Tor (Nagaya-mon) ──
  const gx0 = sx1 + 0.3, gx1 = gx0 + 5.2, gmx = (gx0 + gx1) / 2;
  for (const e of [-1, 1]) { p.mass.box(gmx + e * 1.8, 1.8, 0, 0.36, 3.6, 0.36, 0x2e241c); p.detail.box(gmx + e * 1.75 - e * 0.9 * 0.35, 1.55, -0.9, 0.1, 2.9, 1.7, 0x3a2c20, 0, e * 0.35); walk.walls.push([gmx + e * 1.8 - 0.2, -0.2, gmx + e * 1.8 + 0.2, 0.2, -0.5, 3.6]); }
  p.mass.box(gmx, 3.5, 0, 4.2, 0.3, 0.32, 0x2e241c);
  { const tmp = new Parts(); kuraRoof(tmp, { x0: gx0 - 0.1, x1: gx1 + 0.1, zA: -1.5, zB: 1.3, y: 3.75, pitch: 0.52, eaveA: 0.6, eaveB: 0.6, over: 0.3, color: roofC, r, plaster: null, tsuma: 0x2e241c, oni: 0.7, ridge: 0.5 }); place(tmp, p, 0, 0, 0, 0); }
  for (const e of [-1, 1]) chochin(p, gmx + e * 2.3, 2.7, 0.5, tile(T.lanternWhite), 0.24, 0.66);
  walk.floors.push([gx0 - 0.2, -10.5, gx1 + 0.2, 0.3, 0]);
  // ── Mauer und Reisspeicher rechts vorn ──
  const kx1 = hw - 0.3, kx0 = kx1 - 8.5;
  {
    const len = kx0 - gx1 - 0.2, cx = (gx1 + kx0) / 2 + 0.1;
    p.mass.box(cx, 1.2, -0.2, len, 2.4, 0.4, plaster);
    p.mass.box(cx, 0.55, -0.2, len + 0.02, 1.1, 0.42, NAMAKO_FAR);
    plate(p.namako, cx, 0.55, 0.02, len, 1.1, 'z', 1, JOINT);
    p.detail.box(cx, 2.55, -0.2, len + 0.2, 0.2, 0.7, roofC);
    walk.walls.push([gx1, -0.2, kx0, -0.2, -0.5, 2.4]);
    const tmp = new Parts(); whiteKura(tmp, { w: 8.5, d: 8, r, gable: true, lit: 0.3, base: 0.5, shop: false }); place(tmp, p, (kx0 + kx1) / 2, 0, -4.1, 0);
    walk.walls.push([kx0, -0.1, kx1, -0.1, -0.5, 6], [kx0, -8.1, kx0, -0.1, -0.5, 6], [kx1, -8.1, kx1, -0.1, -0.5, 6], [kx0, -8.1, kx1, -8.1, -0.5, 6]);
  }
  // ── Hof ──
  const hz0 = -20.5, hz1 = -10.3;
  p.mass.box(0, -0.15, (hz0 + hz1) / 2, W - 0.6, 0.3, hz1 - hz0, 0x8e8778);
  walk.floors.push([-hw + 0.3, hz0, hw - 0.3, hz1, 0]);
  for (let z = hz1 - 0.4; z > hz0; z -= 0.8) p.fine.box(0, 0.003, z, W - 1.2, 0.006, 0.03, 0x938c7e);
  // Brunnen mit Holzdach, Fässer, Karren, eine Kiefer im Topf.
  {
    const wx = gmx + 4, wz = -15;
    p.detail.add(new CylinderGeometry(0.7, 0.75, 0.8, 12), 0x7a766d, wx, 0.4, wz);
    p.detail.add(new CircleGeometry(0.62, 12), 0x2a3a3a, wx, 0.79, wz, -Math.PI / 2, 0, 0);
    for (const e of [-1, 1]) p.detail.box(wx + e * 0.8, 1.2, wz, 0.1, 2.4, 0.1, BEAM);
    p.detail.box(wx, 2.45, wz, 2.0, 0.08, 1.2, roofC, 0, 0, 0);
    walk.cylinders.push([wx, wz, 0.8, 1]);
    for (let i = 0; i < 6; i++) { const x = -hw + 2 + (i % 3) * 0.8, z = hz0 + 1.2 + Math.floor(i / 3) * 0.8; p.detail.add(new CylinderGeometry(0.34, 0.3, 0.7, 12), 0x7a5234, x, 0.35, z); p.detail.add(new TorusGeometry(0.33, 0.025, 4, 14), 0x2a2018, x, 0.2, z, Math.PI / 2); p.detail.add(new TorusGeometry(0.33, 0.025, 4, 14), 0x2a2018, x, 0.52, z, Math.PI / 2); }
    walk.cylinders.push([-hw + 2.8, hz0 + 1.6, 1.5, 0.9]);
    pottedPlant(p, gmx - 3, 0, hz1 - 0.8, r);
    // Kei-Truck mit Fässern: die Lieferung an die Läden der Hauptstraße.
    {
      const tx = -hw + 5.5, tz = -16.2;
      p.mass.box(tx + 1.1, 0.95, tz, 1.3, 1.25, 1.46, 0xeeeeea); p.glass.box(tx + 1.76, 1.25, tz, 0.02, 0.5, 1.3, 0x2f3d45);
      p.mass.box(tx - 0.7, 0.62, tz, 2.1, 0.12, 1.46, 0xd8d8d2);
      for (const e of [-1, 1]) { p.detail.box(tx - 0.7, 0.8, tz + e * 0.71, 2.1, 0.3, 0.04, 0xd8d8d2); for (const xx of [tx + 1.0, tx - 1.0]) p.detail.add(new CylinderGeometry(0.27, 0.27, 0.2, 10), 0x1a1a1a, xx, 0.27, tz + e * 0.66, Math.PI / 2); }
      for (let i = 0; i < 4; i++) barrel(p.sign, tx - 1.3 + (i % 2) * 0.7, 0.68, tz - 0.32 + Math.floor(i / 2) * 0.64, 0.3);
      walk.walls.push([tx - 1.8, tz - 0.8, tx + 1.8, tz - 0.8, -0.5, 1.6], [tx - 1.8, tz + 0.8, tx + 1.8, tz + 0.8, -0.5, 1.6], [tx - 1.8, tz - 0.8, tx - 1.8, tz + 0.8, -0.5, 1.6], [tx + 1.8, tz - 0.8, tx + 1.8, tz + 0.8, -0.5, 1.6]);
    }
  }
  // ── Brauhalle, hinten über die ganze Breite ──
  const bx0 = -hw + 0.8, bx1 = hw - 0.8, bz1 = hz0, bz0 = -D + 3.5, bmx = (bx0 + bx1) / 2, HH = 7.4;
  const door0 = bmx - 1.6, door1 = bmx + 1.6;
  const hall = (x0: number, z0: number, x1: number, z1: number): void => {
    const alongX = Math.abs(x1 - x0) > 0.01, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    p.mass.box(cx, HH / 2, cz, alongX ? len : 0.34, HH, alongX ? 0.34 : len, plaster);
    // Unten geflammte Zedernbretter (Yakisugi), oben weißer Putz — außen.
    const out: 1 | -1 = alongX ? (z0 > (bz0 + bz1) / 2 ? 1 : -1) : (x0 > bmx ? 1 : -1);
    for (let u = -len / 2 + 0.14; u < len / 2; u += 0.28) {
      if (alongX) plate(p.fine, cx + u, 1.4, cz + out * 0.2, 0.27, 2.8, 'z', out, jitter(0x231d19, r, 0.14));
      else plate(p.fine, cx + out * 0.2, 1.4, cz + u, 0.27, 2.8, 'x', out, jitter(0x231d19, r, 0.14));
    }
    if (alongX) { p.mass.box(cx, 1.4, cz + out * 0.08, len + 0.02, 2.8, 0.3, 0x201a17); plate(p.interior, cx, HH / 2, cz - out * 0.18, len, HH, 'z', (-out) as 1 | -1, 0xd8d0bc); }
    else { p.mass.box(cx + out * 0.08, 1.4, cz, 0.3, 2.8, len + 0.02, 0x201a17); plate(p.interior, cx - out * 0.18, HH / 2, cz, len, HH, 'x', (-out) as 1 | -1, 0xd8d0bc); }
    walk.walls.push([x0, z0, x1, z1, -0.5, HH]);
  };
  hall(bx0, bz0, bx1, bz0); hall(bx0, bz0, bx0, bz1); hall(bx1, bz0, bx1, bz1);
  hall(bx0, bz1, door0, bz1); hall(door1, bz1, bx1, bz1);
  p.mass.box(bmx, (3.6 + HH) / 2, bz1, door1 - door0, HH - 3.6, 0.34, plaster);
  // Großes Schiebetor, halb offen.
  p.detail.box(door1 + 1.4, 1.8, bz1 + 0.3, 3.0, 3.5, 0.1, 0x3a2c20);
  for (let y = 0.5; y < 3.5; y += 0.7) p.detail.box(door1 + 1.4, y, bz1 + 0.36, 3.0, 0.06, 0.04, 0x221a14);
  // Hohe Fenster unter der Traufe (Lüftung).
  for (let x = bx0 + 2.5; x < bx1 - 1; x += 4.2) barredWindow(p, x, 5.6, bz1 + 0.18, 1.1, 0.8, plaster, r() < 0.7, false);
  // Dach mit Lüftungsaufsatz (Koshi-yane) auf dem First.
  const hr = kuraRoof(p, { x0: bx0, x1: bx1, zA: bz0, zB: bz1, y: HH, pitch: 0.5, eaveA: 0.8, eaveB: 1.0, over: 0.5, color: roofC, r, plaster: null, tsuma: plaster, oni: 1.1, ridge: 0.8 });
  {
    const tmp = new Parts(), vz = (bz0 + bz1) / 2, vy = hr.top - 0.35;
    tmp.mass.box(bmx, vy + 0.6, vz, bx1 - bx0 - 8, 1.2, 1.6, 0x2a2420);
    for (let x = bx0 + 4.5; x < bx1 - 4; x += 0.5) tmp.detail.box(x, vy + 0.6, vz + 0.82, 0.08, 1.0, 0.06, 0x4a3a2c);
    kuraRoof(tmp, { x0: bx0 + 4, x1: bx1 - 4, zA: vz - 0.8, zB: vz + 0.8, y: vy + 1.25, pitch: 0.5, eaveA: 0.5, eaveB: 0.5, over: 0.2, color: roofC, r, plaster: null, tsuma: 0x2a2420, oni: 0, ridge: 0.35 });
    place(tmp, p, 0, 0, 0, 0);
  }
  // ── Brauhalle innen ──
  I.box(bmx, -0.02, (bz0 + bz1) / 2, bx1 - bx0 - 0.4, 0.06, bz1 - bz0 - 0.4, 0x5e5850);
  walk.floors.push([bx0 + 0.3, bz0 + 0.3, bx1 - 0.3, bz1 - 0.3, 0.02], [door0, bz1 - 0.6, door1, bz1 + 0.6, 0.02]);
  // Tanks (Emaille), zwei Reihen links; Holzbottiche (Kioke) rechts.
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = bx0 + 3 + i * 3.4, z = bz0 + 3.2 + j * 6.2;
    I.add(new CylinderGeometry(1.2, 1.2, 3.6, 16), 0xe8eae4, x, 2.0, z);
    I.add(new SphereGeometry(1.2, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xdadcd6, x, 3.8, z);
    for (const e of [-1, 1]) I.box(x + e * 0.9, 0.2, z, 0.12, 0.4, 0.12, 0x4a4a4a);
    tileCylinder(IT, tile(T.tank), x, 2.6, z, 1.21, 0.9, 16);
    walk.cylinders.push([x, z, 1.25, 3.8]);
  }
  for (let i = 0; i < 3; i++) {
    const x = bmx + 3 + i * 2.6, z = bz0 + 3.4;
    I.add(new CylinderGeometry(1.0, 0.95, 1.9, 16), 0x7a5234, x, 0.95, z);
    for (const y of [0.3, 0.95, 1.6]) I.add(new TorusGeometry(1.0, 0.04, 4, 18), 0x3a2a1c, x, y, z, Math.PI / 2);
    walk.cylinders.push([x, z, 1.05, 1.9]);
  }
  // Reisdämpfer (Koshiki) über dem Herd, mit Glut darunter; Dampf durch den Aufsatz.
  {
    const x = bx1 - 3, z = bz1 - 3;
    I.box(x, 0.6, z, 2.2, 1.2, 2.2, 0x6a5a4a);
    p.glow.box(x, 0.45, z + 1.11, 0.8, 0.35, 0.02, 0xff7a2a);
    I.add(new CylinderGeometry(0.9, 0.8, 1.3, 14), 0x8a6a44, x, 1.85, z);
    walk.walls.push([x - 1.1, z - 1.1, x + 1.1, z - 1.1, -0.5, 2.5], [x - 1.1, z + 1.1, x + 1.1, z + 1.1, -0.5, 2.5], [x - 1.1, z - 1.1, x - 1.1, z + 1.1, -0.5, 2.5], [x + 1.1, z - 1.1, x + 1.1, z + 1.1, -0.5, 2.5]);
    walk.smoke.push([x, hr.top + 0.5, z]);
  }
  // Holzwannen, Schöpfkellen, eine Leiter an einem Tank, Hängelampen, Sugidama drinnen.
  for (let i = 0; i < 4; i++) I.add(new CylinderGeometry(0.4, 0.34, 0.35, 12), 0x8a6a44, bmx - 1 + i * 0.9, 0.18, bz1 - 1.6);
  I.box(bx0 + 3 + 1.25, 1.9, bz0 + 3.2, 0.06, 3.8, 0.5, 0x6a4a2e, 0, 0, -0.08);
  for (let x = bx0 + 3; x < bx1 - 2; x += 5) { I.box(x, HH - 1.2, (bz0 + bz1) / 2, 0.02, 2.2, 0.02, 0x1a1a1a); p.glow.box(x, HH - 2.35, (bz0 + bz1) / 2, 0.22, 0.14, 0.22, 0xffd8a0); }
  for (let x = bx0 + 1; x < bx1; x += 2.2) I.box(x, HH - 0.3, (bz0 + bz1) / 2, 0.26, 0.34, bz1 - bz0 - 0.6, 0x3a2a1c);
  tilePlate(IT, tile(T.poster), bmx, 2.4, bz0 + 0.22, 2.4, 1.2, 'z', 1);
  walk.path.push([backDoor, sz0 - 1.2], [bmx, bz1 + 1.6], [bmx, bz1 - 1.2], [bmx - 1, bz1 - 6.0]);
  // ── Schornstein aus Ziegeln, hinten rechts ──
  {
    const x = hw - 3.2, z = bz0 - 2.2, H = 18;
    for (let k = 0; k < 6; k++) { const y0 = k * H / 6, w0 = 1.7 - k * 0.1; p.mass.box(x, y0 + H / 12, z, w0, H / 6 + 0.02, w0, jitter(0x7a3a2a, r, 0.06)); }
    for (let y = 0.3; y < H; y += 0.26) p.fine.box(x, y, z, 1.72 - (y / H) * 0.62, 0.025, 1.72 - (y / H) * 0.62, 0x5a2a20);
    for (const e of [-1, 1]) p.detail.box(x, H - 2.6 + e * 0.9, z, 1.28, 0.1, 1.28, 0x2a2a2a);
    p.detail.box(x, H - 2.6, z, 1.24, 1.6, 1.24, 0xe8e4da);
    for (const [ax, f] of [['z', 1], ['x', -1]] as const) portrait(p.sign, tile(T.tall2, 0, 0, 128, 128), ax === 'x' ? x + f * 0.63 : x, H - 2.6, ax === 'z' ? z + f * 0.63 : z, 0.9, 1.45, ax, f);
    walk.chimney = [x, H, z];
    walk.cylinders.push([x, z, 1.0, H]);
  }
  return walk;
}

/** Rikscha (Jinrikisha), abgestellt: zwei hohe Räder, roter Sitz, gefaltetes Verdeck, Deichsel auf dem Boden. Lokal entlang z. */
export function rickshaw(p: Parts): void {
  for (const e of [-1, 1]) {
    p.detail.add(new TorusGeometry(0.72, 0.035, 5, 20), 0x1a1a1a, e * 0.62, 0.74, 0, 0, Math.PI / 2, 0);
    for (let i = 0; i < 6; i++) p.detail.box(e * 0.62, 0.74, 0, 0.03, 1.42, 0.03, 0x6a1a14, i * Math.PI / 6);
    p.detail.add(new CylinderGeometry(0.08, 0.08, 0.12, 8), 0x2a2a2a, e * 0.62, 0.74, 0, 0, 0, Math.PI / 2);
  }
  p.detail.box(0, 0.8, 0, 1.3, 0.06, 0.06, 0x2a2a2a);
  p.detail.box(0, 1.0, -0.1, 1.0, 0.1, 0.7, 0x2a1a14); p.detail.box(0, 1.08, -0.1, 0.96, 0.08, 0.64, 0xa8201a);
  p.detail.box(0, 1.45, -0.42, 1.0, 0.8, 0.08, 0x2a1a14, -0.2); p.detail.box(0, 1.45, -0.38, 0.9, 0.7, 0.04, 0xa8201a, -0.2);
  p.detail.add(new CylinderGeometry(0.5, 0.5, 1.02, 10, 1, true, 0, Math.PI), 0x121212, 0, 1.55, -0.6, 0, 0, Math.PI / 2);
  for (const e of [-1, 1]) p.detail.box(e * 0.42, 0.55, 1.1, 0.06, 0.06, 2.3, 0x2a1a14, 0.42);
  p.detail.box(0, 0.07, 2.12, 0.9, 0.06, 0.06, 0x2a1a14);
  p.detail.box(0, 0.7, 0.35, 0.8, 0.05, 0.3, 0x2a1a14, -0.6);
}

// ── Kanal: Brücke, Boot, Weide ──────────────────────────────────────────────

/**
 * Bogenbrücke aus Granit (Nakabashi): der Überbau quer über den Kanal entlang x
 * von −span/2 (Ostufer, yA) bis span/2 (Westufer, yB), Scheitel `rise` über der
 * Sehne. Die Gehfläche rechnet das System mit derselben Formel (`archDeck`).
 */
export function archDeck(x: number, span: number, yA: number, yB: number, rise: number): number {
  const t = x / span + 0.5; return yA + (yB - yA) * t + rise * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
}
export function archBridge(p: Parts, span: number, width: number, yA: number, yB: number, rise: number, water: number, r: Rng): void {
  const n = Math.ceil(span / 0.5), hw = width / 2;
  for (let i = 0; i < n; i++) {
    const x0 = -span / 2 + i * span / n, x1 = x0 + span / n, xm = (x0 + x1) / 2;
    const y0 = archDeck(x0, span, yA, yB, rise), y1 = archDeck(x1, span, yA, yB, rise), ym = (y0 + y1) / 2, tilt = Math.atan2(y1 - y0, x1 - x0);
    // Deckplatten, Brüstung (Kōran) aus Granit, Bogen darunter.
    p.mass.box(xm, ym - 0.2, 0, x1 - x0 + 0.02, 0.4, width, jitter(GRANITE, r, 0.05), 0, 0, tilt);
    for (const e of [-1, 1]) {
      p.mass.box(xm, ym + 0.3, e * (hw - 0.12), x1 - x0 + 0.02, 0.62, 0.24, jitter(0x8f8b80, r, 0.05), 0, 0, tilt);
      p.detail.box(xm, ym + 0.66, e * (hw - 0.12), x1 - x0 + 0.02, 0.1, 0.32, 0x9c988c, 0, 0, tilt);
    }
    // Bogen: Unterkante folgt einem Kreisbogen von Wasserlinie zu Wasserlinie.
    const tA = (x0 + span / 2) / span, tB = (x1 + span / 2) / span, ay = (t: number): number => water + 0.1 + (rise + (yA + yB) / 2 - water - 0.75) * Math.sin(Math.PI * t);
    const bot = (ay(tA) + ay(tB)) / 2;
    if (ym - 0.4 - bot > 0.05) for (const e of [-1, 1]) p.mass.box(xm, (ym - 0.4 + bot) / 2, e * (hw - 0.3), x1 - x0 + 0.02, ym - 0.4 - bot, 0.6, jitter(0x7f7b72, r, 0.08));
    for (const e of [-1, 1]) plate(p.fine, xm, bot + 0.06, e * (hw + 0.005), x1 - x0 - 0.04, 0.18, 'z', e, 0x6a665e);
  }
  // Pfosten mit Knauf an den Enden, Namensplatte.
  for (const x of [-span / 2 - 0.2, span / 2 + 0.2]) for (const e of [-1, 1]) {
    const y = x < 0 ? yA : yB;
    p.mass.box(x, y + 0.5, e * (hw - 0.12), 0.34, 1.0, 0.34, 0x8f8b80);
    ball(p.detail, x, y + 1.08, e * (hw - 0.12), 0.16, 0x9c988c, 7);
  }
  tilePlate(p.sign, tile(T.plate), -span / 2 - 0.2, yA + 0.62, hw + 0.06, 0.3, 0.46, 'z', 1);
}

/** Stakboot (Kurashiki): flacher Holzkahn mit Sitzbrettern, Stange, Strohkissen. Lokal entlang z. */
export function stakeBoat(k: SettlementKit, signK: SettlementKit): void {
  const L = 6.4, B = 1.5;
  const wood = 0xa88a5e, dark = 0x6a5236;
  k.box(0, 0.12, 0, B - 0.1, 0.1, L - 0.6, dark);
  for (const e of [-1, 1]) {
    k.box(e * (B / 2 - 0.04), 0.32, 0, 0.08, 0.42, L - 0.5, wood);
    k.box(e * (B / 2 - 0.04), 0.55, 0, 0.12, 0.05, L - 0.4, shade(wood, 1.15));
  }
  for (const e of [-1, 1]) { k.box(0, 0.42, e * (L / 2 - 0.1), B - 0.2, 0.08, 0.5, wood, e * 0.6); k.box(0, 0.3, e * (L / 2 - 0.35), B - 0.1, 0.42, 0.08, wood); }
  for (let z = -1.8; z <= 1.8; z += 0.9) { k.box(0, 0.38, z, B - 0.14, 0.05, 0.3, shade(wood, 1.08)); k.box(0, 0.44, z, B - 0.4, 0.04, 0.26, 0xb8322a); }
  // Die Stange liegt quer über dem Boot, ein Ende im Wasser.
  k.add(new CylinderGeometry(0.03, 0.035, 5.2, 5), 0xc8b27a, 0.25, 0.5, 0.4, Math.PI / 2 - 0.12, 0.2, 0);
  signK.add(new ConeGeometry(0.3, 0.14, 12), 0xc9ad6c, -0.3, 0.52, -2.2);
}

/**
 * Trauerweide (Shidare-yanagi): kurzer, dunkler Stamm, lichte Krone, und vor allem
 * die **hängenden Ruten** — als schmale Stoffbahnen mit `aSway`, damit sie im Wind
 * schwingen. Ohne die Ruten ist eine Weide ein runder Busch.
 */
export function willow(p: Parts, x: number, y: number, z: number, s: number, r: Rng): void {
  const H = (3.8 + r() * 1.2) * s, lean = (r() - 0.5) * 0.3;
  const trunk = new CylinderGeometry(0.14 * s, 0.26 * s, H, 7); trunk.translate(0, H / 2, 0); trunk.rotateZ(lean);
  p.mass.add(trunk, 0x3a3228, x, y, z);
  const cx = x - Math.sin(lean) * H, cy = y + H;
  // Krone klein und unregelmäßig: große flache Ballen lasen sich als grüner Schirm (Bild 2026-09-26).
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + r(), rr = (0.3 + r() * 1.1) * s, g = new IcosahedronGeometry(1, 0);
    g.scale((0.45 + r() * 0.35) * s, (0.35 + r() * 0.25) * s, (0.45 + r() * 0.35) * s); g.rotateY(r() * 3);
    p.mass.add(g, jitter([0x6a8a3a, 0x7a9a44, 0x5a7a32][i % 3]!, r, 0.08), cx + Math.cos(a) * rr, cy + (r() - 0.3) * 0.6 * s, z + Math.sin(a) * rr);
  }
  // Ruten in Büscheln an 12 Ästen: je Ast ein Bogen, von dem 9…12 Ruten hängen.
  // Erste Fassung: 34 einzelne 0,34 m breite Bahnen — im Bild flache grüne Klebestreifen.
  // Jetzt 0,08 m breit, gekreuzt (zwei Flächen je Rute), damit sie von der Seite nicht verschwinden.
  const strand = (px: number, top: number, pz: number, len: number, a: number, col: number): void => {
    for (const cross of [0, Math.PI / 2]) {
      const g = new PlaneGeometry(0.085 * s, len, 1, 3), pos = g.getAttribute('position'), sway = new Float32Array(pos.count);
      for (let j = 0; j < pos.count; j++) sway[j] = (len / 2 - pos.getY(j)) / len;
      g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
      p.cloth.add(g, col, px, top - len / 2, pz, 0, a + cross, 0);
    }
  };
  for (let b = 0; b < 12; b++) {
    const a = b * 0.524 + r() * 0.3, reach = (1.6 + r() * 1.3) * s, lift = (0.3 + r() * 0.8) * s, m = 9 + Math.floor(r() * 4);
    // Ast als dünner Zylinder vom Kronenansatz nach außen.
    const br = new CylinderGeometry(0.025 * s, 0.05 * s, reach, 4); br.translate(0, reach / 2, 0); br.rotateZ(-1.2); br.rotateY(-a);
    p.detail.add(br, 0x3a3228, cx, cy - 0.3 * s, z);
    for (let i = 0; i < m; i++) {
      const t = 0.35 + (i / m) * 0.75, rr = reach * t, px = cx + Math.cos(a) * rr + (r() - 0.5) * 0.3 * s, pz = z + Math.sin(a) * rr + (r() - 0.5) * 0.3 * s;
      const top = cy - 0.3 * s + lift * Math.sin(Math.PI * Math.min(1, t)) + 0.2 * s;
      const len = (1.8 + r() * 2.2) * s * (0.6 + t * 0.5);
      strand(px, top, pz, Math.min(len, top - y - 0.4), r() * Math.PI, jitter([0x86a24c, 0x98b05c, 0x7a9444, 0xa4b868][Math.floor(r() * 4)]!, r, 0.08));
    }
  }
}

/** Gusseiserne Straßenlaterne (Ichibangai): schwarzer Mast, Laternenkopf mit vier Gläsern. */
export function lampPost(p: Parts, x: number, y: number, z: number): void {
  p.detail.add(new CylinderGeometry(0.07, 0.11, 3.6, 8), 0x1a1a1a, x, y + 1.8, z);
  p.detail.add(new CylinderGeometry(0.16, 0.2, 0.3, 8), 0x1a1a1a, x, y + 0.15, z);
  p.detail.box(x, y + 3.62, z, 0.36, 0.06, 0.36, 0x1a1a1a);
  const t: Tile = tile(T.lamp);
  for (const [ax, f] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]] as const) tilePlate(p.signGlow, t, x + (ax === 'x' ? f * 0.15 : 0), y + 3.95, z + (ax === 'z' ? f * 0.15 : 0), 0.28, 0.56, ax, f, 0xa89478);
  p.detail.box(x, y + 4.26, z, 0.44, 0.06, 0.44, 0x1a1a1a);
  p.detail.add(new ConeGeometry(0.32, 0.26, 4), 0x1a1a1a, x, y + 4.42, z, 0, Math.PI / 4, 0);
  ball(p.detail, x, y + 4.6, z, 0.06, 0x1a1a1a, 5);
}

/** Holz-Torii (Hikawa-Schrein): zwei Pfosten, Kasagi mit Schwung, Nuki, Tafel. */
export function torii(p: Parts, w: number, h: number, color: number): void {
  for (const e of [-1, 1]) {
    p.mass.add(new CylinderGeometry(0.22, 0.26, h, 10), color, e * w / 2, h / 2, 0);
    p.mass.add(new CylinderGeometry(0.34, 0.34, 0.4, 10), 0x2a2622, e * w / 2, 0.2, 0);
  }
  p.mass.box(0, h + 0.2, 0, w + 2.2, 0.36, 0.5, 0x2a2420, 0, 0, 0);
  for (const e of [-1, 1]) p.mass.box(e * (w / 2 + 1.0), h + 0.34, 0, 0.8, 0.3, 0.5, 0x2a2420, 0, 0, -e * 0.18);
  p.mass.box(0, h - 0.15, 0, w + 1.2, 0.3, 0.3, color);
  p.detail.box(0, h - 1.2, 0, w + 0.9, 0.24, 0.22, color);
  p.detail.box(0, h - 0.65, 0.12, 0.9, 0.95, 0.08, 0x1c1814);
  tilePlate(p.sign, tile(T.torii, 64, 0, 192, 128), 0, h - 0.65, 0.17, 0.8, 0.85, 'z', 1);
}

export { kasugaLantern, pebble };
