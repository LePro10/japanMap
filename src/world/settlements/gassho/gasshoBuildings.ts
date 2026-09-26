import { ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Quaternion, Vector3 } from 'three';
import type { SettlementKit } from '../SettlementKit';
import {
  KAWARA, STONE, TIMBER_DARK, ball, boardsX, boardsZ, gableRoof, jitter, lantern, leanTo, noren, place, plate,
  polyFacing, prismZ, roofRise, shade, tilePlate, acUnit, Parts, type Rng, type Tile,
} from '../wago/wagoKit';
import { T, tile } from './gasshoAtlas';
import type { GasshoRole } from './gasshoLayout';

/*
 * Bauten des Gassho-Weilers in lokalen Koordinaten: x quer zum First, z entlang
 * des Firsts, y 0 = Oberkante des Hofs. Eingang auf +x. Vorbilder: Wada-ke und
 * Ogimachi (Shirakawa-gō), Ainokura, Kitamura (Miyama), Asakura Sanrensui.
 * Referenzbilder: C:\Users\Leandro\Downloads\towns\farmingdorf\.
 */

/** Stroh in vier Altersstufen — frisch gedeckt ist golden, zwanzig Jahre alt fast grau. */
export const STRAW = [0x86745a, 0x7b6b50, 0x957f5a, 0x6c6250] as const;
/** Schnittkante: frische Halmenden sind heller als die verwitterte Dachfläche. */
const CUT = 0x8a7550, SOFFIT = 0x2b2219;
/** Gassho-Holz ist dunkler als das silbergraue Zedernholz am Meer: Rauch von innen, Schnee von außen. */
const WOOD = [0x4b3526, 0x563d2b, 0x40302a] as const;
const BEAM = 0x2a1f18;
const PLASTER_OLD = 0xd9d1bd;
const PERSIMMON = 0xd8641f;
const ROOMS = [T.room1, T.room2, T.room3, T.shojiWarm] as const;
const UP = new Vector3(0, 1, 0), DIR = new Vector3(), Q = new Quaternion();

/** Shōji-Ausschnitt mit quadratischen Feldern, egal wie breit das Fenster ist. */
function shojiTile(w: number, h: number, warm = false): Tile { return tile(warm ? T.shojiWarm : T.shoji, 0, 0, Math.min(256, Math.round(128 * w / h)), 128); }

/**
 * Papierfenster in einer Wand quer zu z. Unbeleuchtet: Papier mit Sprossen
 * (beleuchtet von der Szene), dahinter Licht: Zimmer aus dem Atlas, oder
 * geschlossen: Amado-Holzläden.
 */
function shojiX(p: Parts, x: number, y: number, z: number, face: number, w: number, h: number, lit: boolean, r: Rng): void {
  p.detail.box(x, y, z + face * 0.06, w + 0.16, h + 0.16, 0.08, BEAM);
  const roll = r();
  if (lit) tilePlate(p.signGlow, roll < 0.5 ? shojiTile(w, h, true) : tile(ROOMS[Math.floor(roll * 6) % 3]!), x, y, z + face * 0.105, w, h, 'z', face);
  else if (roll < 0.14) tilePlate(p.sign, tile(T.amado, 0, 0, Math.min(256, Math.round(128 * w / h)), 128), x, y, z + face * 0.105, w, h, 'z', face);
  else tilePlate(p.sign, shojiTile(w, h), x, y, z + face * 0.105, w, h, 'z', face);
  p.detail.box(x, y - h / 2 - 0.1, z + face * 0.12, w + 0.3, 0.06, 0.14, BEAM);
}
/** Dasselbe in einer Wand quer zu x. */
function shojiZ(p: Parts, x: number, y: number, z: number, face: number, w: number, h: number, lit: boolean, r: Rng): void {
  p.detail.box(x + face * 0.06, y, z, 0.08, h + 0.16, w + 0.16, BEAM);
  const roll = r();
  if (lit) tilePlate(p.signGlow, roll < 0.5 ? shojiTile(w, h, true) : tile(ROOMS[Math.floor(roll * 6) % 3]!), x + face * 0.105, y, z, w, h, 'x', face);
  else if (roll < 0.14) tilePlate(p.sign, tile(T.amado, 0, 0, Math.min(256, Math.round(128 * w / h)), 128), x + face * 0.105, y, z, w, h, 'x', face);
  else tilePlate(p.sign, shojiTile(w, h), x + face * 0.105, y, z, w, h, 'x', face);
  p.detail.box(x + face * 0.12, y - h / 2 - 0.1, z, 0.14, 0.06, w + 0.3, BEAM);
}

/** Steinsockel mit Einzelsteinen (Flusssteine, wie in Ogimachi). */
function plinth(p: Parts, w: number, d: number, r: Rng, h = 0.45): void {
  p.mass.box(0, h / 2, 0, w + 0.5, h, d + 0.5, 0x6f6c63);
  for (const s of [-1, 1]) {
    for (let u = -w / 2; u < w / 2; u += 0.62) plate(p.fine, u + 0.3, h / 2, s * (d / 2 + 0.26), 0.56, h - 0.08, 'z', s, jitter(STONE, r, 0.18));
    for (let u = -d / 2; u < d / 2; u += 0.62) plate(p.fine, s * (w / 2 + 0.26), h / 2, u + 0.3, 0.56, h - 0.08, 'x', s, jitter(STONE, r, 0.18));
  }
}

// ── Dächer ──────────────────────────────────────────────────────────────────

/**
 * Gassho-Strohdach: zwei dicke Strohflächen um 58…61°, Traufe in zwei Lagen,
 * Strohfirst mit Kreuzhölzern. Liefert die Firsthöhe (Oberkante Stroh).
 *
 * Die Dicke ist das, was man aus der Gasse sieht: an Traufe und Giebel steht
 * das Stroh als 1 m hohe Schnittkante. Ein dünnes Blech in Strohfarbe (so
 * baute `gableRoof` bisher Dächer) sähe aus wie ein Zelt.
 */
export function gasshoThatch(p: Parts, w: number, d: number, H0: number, pitch: number, eave: number, over: number, t: number, straw: number): number {
  const hw = w / 2, tanp = Math.tan(pitch), c = Math.cos(pitch), tv = t / c;
  const yA = H0 + hw * tanp, ye = H0 - eave * tanp, L = d / 2 + over, top = yA + tv;
  for (const s of [-1, 1]) {
    const X = s * (hw + eave);
    prismZ(p.thatch, [[X, ye], [X, ye + tv], [0, top], [0, yA]], -L, L, [CUT, straw, null, SOFFIT], CUT);
    // Untere Lage der Traufe, etwas vorstehend: echte Strohtraufen sind gestuft.
    // Als Keil, nicht als Quader — eine waagerechte helle Unterseite las sich als Brett.
    const lx = s * (hw + eave + 0.06);
    prismZ(p.thatch, [[lx, ye - 0.04], [lx, ye + 0.36], [lx - s * 0.55, ye + 0.36 + 0.55 * tanp], [lx - s * 0.45, ye + 0.08]], -L - 0.07, L + 0.07, [shade(CUT, 1.05), null, null, SOFFIT], CUT);
    // Keine Decklagen-Leisten mehr: im Nahbild lasen sie sich als Ziegel, weil sie
    // mit dem Holzmaterial statt mit dem Strohmaterial gezeichnet wurden. Die Lagen
    // kommen jetzt aus `s3` im Strohmaterial.
    // Moos kommt aus dem Material (`thatch: true`). Aufgesetzte flache Kugeln lasen
    // sich im ersten Bild als Aufkleber und sind raus.
  }
  // Strohfirst: ein Trapez, das auf beiden Flächen aufliegt — ein Quader stünde
  // an den Kanten frei in der Luft.
  const rw = Math.min(0.7, hw * 0.3), kl = Math.min(1.05, w * 0.1);
  prismZ(p.thatch, [[-rw, top - rw * tanp - 0.05], [rw, top - rw * tanp - 0.05], [0.4, top + 0.32], [-0.4, top + 0.32]], -L + 0.1, L - 0.1, [SOFFIT, shade(straw, 0.62), shade(straw, 0.55), shade(straw, 0.62)], shade(straw, 0.5));
  if (w > 4) p.detail.add(new CylinderGeometry(0.12, 0.12, 2 * L - 0.3, 7), BEAM, 0, top + 0.42, 0, Math.PI / 2);
  // Kreuzhölzer (Kurabone) über dem First.
  for (let z = -L + 0.9; z < L - 0.6; z += 1.5) for (const s of [-1, 1]) p.detail.box(0, top + 0.22, z, kl, 0.12, 0.12, BEAM, 0, 0, s * pitch);
  return top + 0.5;
}

/**
 * Kayabuki-Walmdach mit kleinem Giebel (Irimoya), wie in Miyama. Ein
 * geschlossener Körper: Traufband, vier Dachflächen, zwei Rauchgiebel,
 * Untersicht. Liefert die Firsthöhe.
 */
export function hipThatch(p: Parts, w: number, d: number, H0: number, pitch: number, eave: number, t: number, straw: number, vent = 1.5): number {
  const hw = w / 2, hd = d / 2, tanp = Math.tan(pitch), tv = t / Math.cos(pitch);
  const X = hw + eave, Z = hd + eave, yu = H0 - eave * tanp, ye = yu + tv;
  const yt = ye + X * tanp, yg = yt - vent, xg = X - (yg - ye) / tanp, zg = Math.max(0.6, Z - (yg - ye) / tanp);
  const k = p.thatch;
  for (const s of [-1, 1]) {
    polyFacing(k, [[s * X, ye, -Z], [s * X, ye, Z], [s * xg, yg, zg], [0, yt, zg], [0, yt, -zg], [s * xg, yg, -zg]], straw, [s, 1, 0]);
    polyFacing(k, [[-X, ye, s * Z], [X, ye, s * Z], [xg, yg, s * zg], [-xg, yg, s * zg]], shade(straw, 0.95), [0, 1, s]);
    polyFacing(k, [[-X, yu, s * Z], [X, yu, s * Z], [X, ye, s * Z], [-X, ye, s * Z]], CUT, [0, 0, s]);
    polyFacing(k, [[s * X, yu, -Z], [s * X, yu, Z], [s * X, ye, Z], [s * X, ye, -Z]], CUT, [s, 0, 0]);
    // Rauchgiebel: dunkles Gitter, durch das der Herdrauch abzieht.
    polyFacing(p.mass, [[-xg, yg, s * zg], [xg, yg, s * zg], [0, yt, s * zg]], 0x2a2019, [0, 0, s]);
    for (let x = -xg + 0.15; x < xg; x += 0.16) {
      const hTop = yt - Math.abs(x) * (yt - yg) / xg;
      p.detail.box(x, (yg + hTop) / 2, s * (zg + 0.03), 0.05, hTop - yg, 0.04, 0x6b5a40);
    }
    p.thatch.box(s * (X - 0.07), yu + 0.13, 0, 0.44, 0.4, 2 * Z + 0.12, shade(straw, 0.8));
    p.thatch.box(0, yu + 0.13, s * (Z - 0.07), 2 * X + 0.12, 0.4, 0.44, shade(straw, 0.8));
  }
  polyFacing(k, [[-X, yu, -Z], [X, yu, -Z], [X, yu, Z], [-X, yu, Z]], SOFFIT, [0, -1, 0]);
  // First mit Umanori — die gekreuzten Hölzer, an denen man Miyama erkennt.
  prismZ(p.thatch, [[-0.6, yt - 0.6 * tanp - 0.05], [0.6, yt - 0.6 * tanp - 0.05], [0.32, yt + 0.3], [-0.32, yt + 0.3]], -zg - 0.3, zg + 0.3, [SOFFIT, shade(straw, 0.55), 0x3a342c, shade(straw, 0.55)], shade(straw, 0.5));
  for (let z = -zg; z <= zg + 0.01; z += Math.max(0.8, (2 * zg) / 6)) for (const s of [-1, 1]) p.detail.box(0, yt + 0.38, z, 0.85, 0.15, 0.15, BEAM, 0, 0, s * 0.7);
  p.detail.add(new CylinderGeometry(0.11, 0.11, 2 * zg + 0.8, 6), BEAM, 0, yt + 0.4, 0, Math.PI / 2);
  return yt + 0.7;
}

// ── Wände ───────────────────────────────────────────────────────────────────

/** Stirnseite im Erdgeschoss: Bretter, Pfosten, zwei Fenster. `face` ±1 an z = ±hd. */
function endWall(p: Parts, w: number, hd: number, H0: number, face: number, wood: number, lit: number, r: Rng): void {
  const hw = w / 2, z = face * hd;
  boardsX(p.fine, -hw, hw, 0.45, H0, z, face, wood, r, 0.3);
  for (const x of [-hw, -hw / 3, hw / 3, hw]) p.detail.box(x, (0.45 + H0) / 2, z + face * 0.07, 0.18, H0 - 0.45, 0.14, BEAM);
  p.detail.box(0, 0.52, z + face * 0.08, w + 0.2, 0.16, 0.16, BEAM);
  shojiX(p, -hw * 0.5, 2.0, z, face, Math.min(1.6, w * 0.22), 1.0, r() < lit, r);
  shojiX(p, hw * 0.5, 2.0, z, face, Math.min(1.6, w * 0.22), 1.0, r() < lit, r);
}

/**
 * Gassho-Giebel über dem Erdgeschoss: Dreieck mit Stülpschalung, Balken je
 * Boden, Fensterreihen, die nach oben weniger werden, Rauchgitter unter dem First.
 */
function gableFace(p: Parts, w: number, hd: number, H0: number, yA: number, face: number, wood: number, lit: number, r: Rng, persimmons: boolean, balcony: boolean): void {
  const hw = w / 2, z = face * hd;
  const half = (y: number): number => y <= H0 ? hw : Math.max(0, hw * (yA - y) / (yA - H0));
  endWall(p, w, hd, H0, face, wood, lit, r);
  for (let y = H0; y < yA - 0.3; y += 0.3) {
    const h = half(y + 0.15) - 0.06; if (h < 0.2) break;
    plate(p.fine, 0, y + 0.15, z + face * 0.045, 2 * h, 0.28, 'z', face, jitter(shade(wood, 1.06), r, 0.1));
  }
  const levels = [H0 - 0.05];
  for (let y = H0 + 1.9; y < yA - 1.5; y += 1.7 + r() * 0.2) levels.push(y);
  for (const y of levels) p.detail.box(0, y, z + face * 0.08, 2 * half(y) + 0.2, 0.2, 0.16, BEAM);
  for (const x of [-hw * 0.64, -hw * 0.22, hw * 0.22, hw * 0.64]) {
    const topY = yA - Math.abs(x) * (yA - H0) / hw;
    p.detail.box(x, (H0 + topY) / 2, z + face * 0.07, 0.14, topY - H0, 0.12, BEAM);
  }
  for (let i = 0; i < levels.length; i++) {
    const y0 = levels[i]!, y1 = levels[i + 1] ?? yA - 1.0;
    const wh = Math.min(1.05, y1 - y0 - 0.5), room = half(y0 + 0.25 + wh) - 0.3;
    if (wh < 0.45 || room < 0.55) continue;
    const ww = room > 2.6 ? 1.05 : 0.8, n = Math.max(1, Math.floor((2 * room + 0.5) / (ww + 0.5))), span = n * (ww + 0.5) - 0.5;
    for (let j = 0; j < n; j++) shojiX(p, -span / 2 + ww / 2 + j * (ww + 0.5), y0 + 0.2 + wh / 2, z, face, ww, wh, r() < lit, r);
  }
  // Rauchgitter unter dem First.
  const vy = yA - 1.05, vw = half(vy) * 1.4;
  if (vw > 0.4) {
    p.detail.box(0, vy, z + face * 0.05, vw, 0.75, 0.06, 0x1a1512);
    for (let x = -vw / 2 + 0.08; x < vw / 2; x += 0.14) p.detail.box(x, vy, z + face * 0.1, 0.05, 0.75, 0.04, BEAM);
  }
  // Umgang im ersten Dachboden: Bohlen und Geländer unter dem Strohüberstand.
  if (balcony && levels[1] !== undefined) {
    const y = levels[1]!, bw = 2 * half(y) - 0.4;
    p.detail.box(0, y + 0.05, z + face * 0.55, bw, 0.08, 0.9, shade(wood, 1.2));
    p.detail.box(0, y + 0.95, z + face * 0.97, bw, 0.07, 0.07, BEAM);
    for (let x = -bw / 2; x <= bw / 2 + 0.01; x += bw / 6) p.detail.box(x, y + 0.5, z + face * 0.97, 0.07, 0.9, 0.07, BEAM);
    for (let x = -bw / 2 + 0.1; x < bw / 2; x += 0.13) plate(p.detail, x, y + 0.3, z + face * 0.99, 0.05, 0.45, 'z', face, shade(wood, 0.9));
  }
  // Hoshigaki: Schnüre getrockneter Kaki unter dem Giebelbalken — der Herbst im Dorf.
  if (persimmons) {
    const y = (levels[1] ?? H0 + 1.9) - 0.12;
    for (let x = -half(y) + 0.6; x < half(y) - 0.4; x += 0.34) {
      const n = 6 + Math.floor(r() * 5);
      p.detail.box(x, y - n * 0.07, z + face * 0.28, 0.012, n * 0.14, 0.012, 0x8a7a60);
      for (let j = 0; j < n; j++) p.detail.box(x, y - 0.1 - j * 0.14, z + face * 0.28, 0.085, 0.1, 0.085, jitter(PERSIMMON, r, 0.14));
    }
  }
}

/**
 * Längsseite unter der tiefen Traufe: Pfosten, Brüstungsbretter, Shōji,
 * Putzfelder; auf der Eingangsseite das große Doma-Tor, Engawa, Schilder.
 */
function longSide(p: Parts, w: number, d: number, H0: number, s: number, door: boolean, role: GasshoRole, wood: number, lit: number, r: Rng): void {
  const hw = w / 2, hd = d / 2, x = s * hw;
  const bays = Math.max(4, Math.round(d / 1.82)), bw = d / bays;
  boardsZ(p.fine, -hd, hd, 0.45, 1.25, x, s, shade(wood, 0.9), r, 0.28);
  for (let i = 0; i <= bays; i++) p.detail.box(x + s * 0.06, (0.45 + H0) / 2, -hd + i * bw, 0.16, H0 - 0.45, 0.17, BEAM);
  p.detail.box(x + s * 0.07, 1.27, 0, 0.1, 0.1, d, BEAM);
  p.detail.box(x + s * 0.08, H0 - 0.15, 0, 0.18, 0.26, d + 0.2, BEAM);
  p.detail.box(x + s * 0.08, 0.52, 0, 0.18, 0.16, d + 0.2, BEAM);
  const doorBay = door ? Math.floor(bays * 0.5) - 1 : -9;
  for (let i = 0; i < bays; i++) {
    if (i === doorBay || i === doorBay + 1) continue;
    const zc = -hd + (i + 0.5) * bw, kind = r();
    if (kind < 0.58) shojiZ(p, x, 2.05, zc, s, bw - 0.28, 1.3, r() < lit, r);
    else if (kind < 0.82) plate(p.detail, x + s * 0.04, (1.3 + H0 - 0.3) / 2, zc, bw - 0.2, H0 - 1.6, 'x', s, jitter(PLASTER_OLD, r, 0.05));
    else boardsZ(p.fine, zc - bw / 2 + 0.1, zc + bw / 2 - 0.1, 1.3, H0 - 0.3, x, s, wood, r, 0.3);
  }
  if (!door) {
    // Rückseite: Brennholz unter der Traufe, bis unter die Fenster gestapelt.
    const len = d * (0.4 + r() * 0.3), zc = (r() - 0.5) * (d - len - 1);
    p.mass.box(x + s * 0.4, 0.45 + 0.65, zc, 0.55, 1.3, len, 0x8e6f4e);
    for (let y = 0.55; y < 1.7; y += 0.17) plate(p.fine, x + s * 0.69, y, zc, len - 0.05, 0.03, 'x', s, 0x4d3a28);
    for (let zz = zc - len / 2 + 0.3; zz < zc + len / 2; zz += 0.9) plate(p.fine, x + s * 0.69, 1.1, zz, 0.03, 1.2, 'x', s, 0x5d4632);
    return;
  }
  // Eingang: zwei Bays breit, ein Flügel offen — dahinter das Irori im Doma.
  const zc = -hd + (doorBay + 1) * bw, dw = 2 * bw - 0.3;
  tilePlate(p.signGlow, tile(role === 'soba' ? T.inSoba : role === 'shop' ? T.inShop : T.inIrori), x + s * 0.03, 1.55, zc - dw / 4, dw / 2, 2.2, 'x', s);
  p.detail.box(x + s * 0.06, 1.55, zc + dw / 4, 0.06, 2.2, dw / 2, shade(wood, 0.7));
  for (const v of [0.8, 1.55, 2.3]) p.detail.box(x + s * 0.1, v, zc + dw / 4, 0.04, 0.06, dw / 2 - 0.1, BEAM);
  p.detail.box(x + s * 0.1, 1.55, zc + dw / 4, 0.04, 2.2, 0.06, BEAM);
  p.detail.box(x + s * 0.08, 2.72, zc, 0.2, 0.2, dw + 0.3, BEAM);
  // Trittstein und Schuhstein vor dem Tor.
  p.detail.box(x + s * 0.7, 0.12, zc - dw / 4, 0.9, 0.24, 1.1, 0x8a877c);
  // Engawa über die Fenster-Bays neben dem Tor.
  const e0 = -hd + 0.4, e1 = zc - dw / 2 - 0.3;
  if (e1 - e0 > 2) {
    p.detail.box(x + s * 0.5, 0.55, (e0 + e1) / 2, 0.95, 0.08, e1 - e0, 0x8a7458);
    for (let zz = e0 + 0.3; zz < e1; zz += 1.8) p.detail.box(x + s * 0.88, 0.27, zz, 0.12, 0.54, 0.12, BEAM);
  }
  const sign = (ti: number, sw: number): void => {
    tilePlate(p.sign, tile(ti), x + s * 0.13, 3.05, zc, sw, sw / 2, 'x', s);
    p.detail.box(x + s * 0.1, 3.05, zc, 0.05, sw / 2 + 0.12, sw + 0.12, BEAM);
  };
  if (role === 'soba') {
    sign(T.soba, 2.2);
    p2x(p, x, s, zc - dw / 4, (pp, zz) => noren(pp, 0, 2.35, zz, 1, dw / 2 - 0.1, 0x24344f));
    teaBench(p, x + s * 2.1, zc + dw * 0.9, s);
    lantern(p, x + s * 0.5, 2.3, zc - dw / 2 - 0.3, 0xf2e6c8);
  } else if (role === 'minshuku') {
    sign(T.minshuku, 2.2);
    lantern(p, x + s * 0.5, 2.25, zc - dw / 2 - 0.3, 0xf2e6c8); lantern(p, x + s * 0.5, 2.25, zc + dw / 2 + 0.3, 0xf2e6c8);
  } else if (role === 'shop') {
    sign(T.doburoku, 2.2);
    p2x(p, x, s, zc - dw / 4, (pp, zz) => noren(pp, 0, 2.35, zz, 1, dw / 2 - 0.1, 0x5a2a22));
    for (const [i, ti, c] of [[0, T.vendRed, 0xc93a31], [1, T.vendBlue, 0x2d62b3]] as const) {
      const vz = -hd + 1 + i * 0.95;
      p.mass.box(x + s * 0.5, 0.92, vz, 0.7, 1.84, 0.9, c);
      tilePlate(p.signGlow, tile(ti), x + s * 0.86, 1.2, vz, 0.76, 1.3, 'x', s);
    }
  } else if (role === 'hero') {
    sign(T.gasshoInfo, 2.0);
  } else {
    p2x(p, x, s, zc - dw / 4, (pp, zz) => noren(pp, 0, 2.35, zz, 1, dw / 2 - 0.1, [0x3b4f6a, 0x6b4a3a, 0x3f5a48][Math.floor(r() * 3)]!));
    // Hyōsatsu — Namensschild am Torpfosten.
    const n = Math.floor(r() * 8);
    tilePlate(p.sign, tile(T.plates, (n % 4) * 64, Math.floor(n / 4) * 64, (n % 4) * 64 + 64, Math.floor(n / 4) * 64 + 64), x + s * 0.17, 1.7, zc + dw / 2 + 0.2, 0.26, 0.26, 'x', s);
  }
  // Pflanzkübel und Gummistiefel neben dem Tor.
  for (let i = 0; i < 2; i++) {
    p.detail.add(new CylinderGeometry(0.22, 0.16, 0.36, 8), 0x7a4e34, x + s * 0.6, 0.18, zc + dw / 2 + 0.6 + i * 0.55);
    ball(p.detail, x + s * 0.6, 0.56, zc + dw / 2 + 0.6 + i * 0.55, 0.28, i ? 0x4f6b3a : 0x5c7a42, 6);
  }
  for (const dz of [0, 0.22]) p.detail.box(x + s * 0.55, 0.2, zc - dw / 2 - 0.2 + dz, 0.12, 0.4, 0.16, 0x2b2f35);
}

/**
 * Noren und ähnliche z-Flächen-Bauteile an einer x-Wand: in einem eigenen
 * Teilesatz „nach vorn“ bauen und um 90° gedreht einsetzen. `noren()` kennt
 * nur Wände quer zu z; so muss es nicht doppelt existieren.
 */
function p2x(p: Parts, x: number, s: number, z: number, build: (pp: Parts, z: number) => void): Parts {
  const tmp = new Parts(); build(tmp, 0);
  place(tmp, p, x, 0, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
  return p;
}

/** Bank mit rotem Tuch und Nodate-gasa (Schirm) — vor jedem Soba-Laden am Land. */
function teaBench(p: Parts, x: number, z: number, s: number): void {
  p.detail.box(x, 0.45, z, 0.7, 0.08, 1.9, 0x7a5a3a);
  p.detail.box(x, 0.5, z, 0.72, 0.03, 1.92, 0xb3261e);
  for (const dz of [-0.8, 0.8]) p.detail.box(x, 0.22, z + dz, 0.6, 0.44, 0.08, 0x5a4230);
  p.detail.add(new CylinderGeometry(0.03, 0.03, 2.6, 5), 0x3a2a1c, x + s * 0.5, 1.3, z);
  p.detail.add(new ConeGeometry(1.35, 0.45, 12), 0xb3261e, x + s * 0.5, 2.55, z);
}

// ── Häuser ──────────────────────────────────────────────────────────────────

export interface HouseResult { top: number; eave: number; wallH: number }

/** Gassho-zukuri: 60°-Strohdach über drei bis fünf Böden. */
export function gasshoHouse(p: Parts, w: number, d: number, role: GasshoRole, r: Rng): HouseResult {
  // Wandhöhe 3,9: mit 3,6 hing die Traufe auf 2,1 m und im Nahbild wie ein Balken über dem Kopf.
  const H0 = 3.9, pitch = 1.0 + r() * 0.06, eave = 0.9, hw = w / 2, hd = d / 2;
  const straw = role === 'hero' ? STRAW[2] : STRAW[Math.floor(r() * STRAW.length)]!, wood = WOOD[Math.floor(r() * WOOD.length)]!;
  const yA = H0 + hw * Math.tan(pitch), lit = role === 'home' ? 0.32 : 0.5;
  plinth(p, w, d, r);
  p.mass.box(0, (0.45 + H0) / 2, 0, w, H0 - 0.45, d, wood);
  prismZ(p.mass, [[-hw, H0 - 0.02], [hw, H0 - 0.02], [0, yA - 0.02]], hd - 0.22, hd, [wood, wood, wood], wood);
  prismZ(p.mass, [[-hw, H0 - 0.02], [hw, H0 - 0.02], [0, yA - 0.02]], -hd, -hd + 0.22, [wood, wood, wood], wood);
  const hoshi = r() < 0.55 || role === 'hero';
  gableFace(p, w, hd, H0, yA, 1, wood, lit, r, hoshi, r() < 0.4 || role === 'hero');
  gableFace(p, w, hd, H0, yA, -1, wood, lit, r, false, r() < 0.25);
  longSide(p, w, d, H0, 1, true, role, wood, lit, r);
  longSide(p, w, d, H0, -1, false, role, wood, lit, r);
  acUnit(p, hw * 0.62, 1.3, -hd, -1);
  const top = gasshoThatch(p, w, d, H0, pitch, eave, 1.3, 0.62, straw);
  return { top, eave: H0 - eave * Math.tan(pitch), wallH: H0 };
}

/** Kayabuki (Miyama): niedriger, Walmdach mit Rauchgiebel, ein Boden plus Dach. */
export function kayabukiHouse(p: Parts, w: number, d: number, role: GasshoRole, r: Rng): HouseResult {
  const H0 = 3.4, pitch = 0.88 + r() * 0.06, eave = 1.0, hd = d / 2;
  const straw = STRAW[Math.floor(r() * STRAW.length)]!, wood = WOOD[Math.floor(r() * WOOD.length)]!, lit = role === 'home' ? 0.3 : 0.55;
  plinth(p, w, d, r);
  p.mass.box(0, (0.45 + H0) / 2, 0, w, H0 - 0.45, d, wood);
  endWall(p, w, hd, H0, 1, wood, lit, r); endWall(p, w, hd, H0, -1, wood, lit, r);
  longSide(p, w, d, H0, 1, true, role, wood, lit, r);
  longSide(p, w, d, H0, -1, false, role, wood, lit, r);
  const top = hipThatch(p, w, d, H0, pitch, eave, 0.55, straw);
  return { top, eave: H0 - eave * Math.tan(pitch), wallH: H0 };
}

/** Kura: Speicher, unten dunkle Bretter, oben weißer Kalkputz, Ziegeldach, Wappen im Giebel. */
export function kura(p: Parts, w: number, d: number, r: Rng): HouseResult {
  const hw = w / 2, hd = d / 2, H = 4.8, dark = 0x3a2c22;
  plinth(p, w, d, r, 0.6);
  p.mass.box(0, 0.6 + (H - 0.6) / 2, 0, w, H - 0.6, d, 0xe8e2d2);
  p.mass.box(0, 1.4, 0, w + 0.08, 1.6, d + 0.08, dark);
  for (const s of [-1, 1]) {
    boardsZ(p.fine, -hd, hd, 0.6, 2.2, s * (hw + 0.04), s, dark, r, 0.3);
    boardsX(p.fine, -hw, hw, 0.6, 2.2, s * (hd + 0.04), s, dark, r, 0.3);
    p.detail.box(0, H - 0.25, s * (hd + 0.05), w + 0.12, 0.3, 0.1, 0xd6cfbd);
    p.detail.box(s * (hw + 0.05), H - 0.25, 0, 0.1, 0.3, d + 0.12, 0xd6cfbd);
  }
  const spec = { w, d, y: H, pitch: 0.5, eave: 0.55, gableOver: 0.45, ridge: 'z' as const, color: KAWARA, tsuma: 0xe8e2d2, barge: TIMBER_DARK };
  gableRoof(p, spec, r);
  const rise = roofRise(spec), n = Math.floor(r() * 2);
  for (const e of [-1, 1]) tilePlate(p.sign, tile(T.crest, n * 128, 0, n * 128 + 128, 128), 0, H + rise * 0.42, e * (hd + 0.08), 0.95, 0.95, 'z', e);
  // Kleines Fenster mit schweren Putzläden, offen.
  p.detail.box(0, H - 1.1, hd + 0.05, 0.7, 0.6, 0.08, 0x1a1715);
  for (const s of [-1, 1]) p.detail.box(s * 0.62, H - 1.1, hd + 0.2, 0.5, 0.66, 0.16, 0xe0d9c7);
  // Tor auf +x mit kleinem Vordach.
  p.detail.box(hw + 0.06, 1.3, 0, 0.1, 2.1, 1.3, 0x1c1815);
  for (const dz of [-0.9, 0.9]) p.detail.box(hw + 0.14, 1.3, dz, 0.18, 2.15, 0.55, 0xe0d9c7);
  const hisashi = new Parts(); leanTo(hisashi, 0, 2.4, 2.75, 0, 1, 0.8, KAWARA, r); place(hisashi, p, hw, 0, 0, Math.PI / 2);
  return { top: H + rise + 0.6, eave: H, wallH: H };
}

/** Hōsui-koya: Feuerwehrhütte mit eigenem Mini-Gassho-Dach und roter Tür. */
export function fireHut(p: Parts, r: Rng): void {
  const w = 1.7, d = 1.4, H = 1.9;
  p.mass.box(0, 0.1, 0, w + 0.2, 0.2, d + 0.2, 0x7a776d);
  p.mass.box(0, 0.2 + (H - 0.2) / 2, 0, w, H - 0.2, d, WOOD[1]);
  boardsX(p.fine, -w / 2, w / 2, 0.2, H, -d / 2, -1, WOOD[1], r, 0.24);
  p.detail.box(0, 1.0, d / 2 + 0.04, 1.3, 1.5, 0.06, 0xa3261d);
  p.detail.box(0, 1.0, d / 2 + 0.08, 0.04, 1.5, 0.04, 0x5a1410);
  tilePlate(p.sign, tile(T.hydrant), 0, 1.55, d / 2 + 0.1, 0.9, 0.45, 'z', 1);
  gasshoThatch(p, w, d, H, 0.98, 0.35, 0.3, 0.3, STRAW[3]);
}

/** Hasa-gake: Stangengerüst mit Reisbündeln, `len` entlang x, `tiers` Lagen. */
export function hasaGake(p: Parts, len: number, tiers: number, r: Rng): void {
  const H = 0.95 + tiers * 0.42, poles = Math.max(2, Math.round(len / 1.8)), step = len / poles;
  for (let i = 0; i <= poles; i++) p.mass.add(new CylinderGeometry(0.055, 0.075, H + 0.35, 5), jitter(0x6a5a45, r, 0.1), -len / 2 + i * step, (H + 0.35) / 2 - 0.2, 0);
  for (const e of [-1, 1]) {
    const g = new CylinderGeometry(0.05, 0.06, H * 1.25, 5); g.rotateZ(-e * 0.6);
    p.detail.add(g, 0x6a5a45, e * (len / 2 + H * 0.35), H * 0.5, 0);
  }
  for (let t = 0; t < tiers; t++) {
    const y = 0.95 + t * 0.42;
    p.detail.box(0, y, 0, len + 0.2, 0.05, 0.05, 0x7a6a50);
    if (t === tiers - 1 && r() < 0.5) continue;
    for (let i = 0; i < poles; i++) {
      const fill = t === tiers - 1 ? 0.3 + r() * 0.6 : 0.85 + r() * 0.15, sw = (step - 0.14) * fill;
      const cx = -len / 2 + i * step + 0.07 + sw / 2, col = jitter(0xc09a4c, r, 0.12);
      p.detail.box(cx, y - 0.3, 0, sw, 0.58, 0.34, col);
      // Halmbündel als Rillen — sonst ist es ein goldener Balken.
      for (let u = -sw / 2 + 0.12; u < sw / 2; u += 0.26) for (const f of [-1, 1]) plate(p.fine, cx + u, y - 0.32, f * 0.176, 0.03, 0.55, 'z', f, shade(col, 0.72));
    }
  }
}

/**
 * Schöpfrad in der y-z-Ebene (Achse x), Mitte im Ursprung. Zwei Kränze,
 * Speichen, L-förmige Schöpfkästen — die Kästen sind es, die das Wasser heben.
 */
export function waterWheel(k: SettlementKit, R: number, width: number): void {
  const wood = 0x4d3526, dark = 0x33241a;
  for (const x of [-width / 2, width / 2]) {
    k.add(new TorusGeometry(R, 0.075, 5, 36), wood, x, 0, 0, 0, Math.PI / 2);
    k.add(new TorusGeometry(R * 0.5, 0.06, 4, 20), wood, x, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) k.box(x, 0, 0, 0.09, 2 * R, 0.11, dark, i * Math.PI / 8);
  }
  const n = Math.round(2 * Math.PI * R / 0.55);
  for (let i = 0; i < n; i++) {
    const a = i * 2 * Math.PI / n, ca = Math.cos(a), sa = Math.sin(a);
    k.box(0, (R - 0.18) * ca, (R - 0.18) * sa, width + 0.12, 0.36, 0.06, wood, a);
    k.box(0, (R - 0.34) * ca - 0.13 * sa, (R - 0.34) * sa + 0.13 * ca, width, 0.06, 0.28, shade(wood, 0.8), a);
  }
  k.cylinder(0, 0, 0, 0.3, width + 0.3, dark, 0, Math.PI / 2);
  k.cylinder(0, 0, 0, 0.1, width + 1.6, 0x2a2a2a, 0, Math.PI / 2);
}

// ── Bäume, Kleinkram ────────────────────────────────────────────────────────

/** Sugi (Japanische Zeder): gerader, rötlicher Stamm, schmale Kegelkrone. */
export function sugi(k: SettlementKit, x: number, y: number, z: number, s: number, r: Rng): void {
  const H = (19 + r() * 7) * s;
  k.add(new CylinderGeometry(0.16 * s, 0.42 * s, H, 6), jitter(0x5b3a2a, r, 0.1), x, y + H / 2, z);
  const crown0 = H * (0.3 + r() * 0.1), tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), rad = (2.5 - f * 1.9) * s * (0.9 + r() * 0.2), h = (H - crown0) / tiers * 1.9;
    k.add(new ConeGeometry(rad, h, 7), jitter([0x21321f, 0x263a24, 0x2c4029][i % 3]!, r, 0.08), x + (r() - 0.5) * 0.3 * s, y + crown0 + f * (H - crown0) * 0.86 + h * 0.3, z + (r() - 0.5) * 0.3 * s);
  }
}

/** Kaki (Persimone) im Herbst: knorriger Stamm, lichte Krone, orange Früchte. */
export function kaki(p: Parts, x: number, y: number, z: number, s: number, r: Rng): void {
  const bark = jitter(0x4a3a2c, r, 0.1), H = (3.2 + r()) * s;
  const trunk = new CylinderGeometry(0.12 * s, 0.22 * s, H, 6); trunk.translate(0, H / 2, 0);
  trunk.applyQuaternion(Q.setFromUnitVectors(UP, DIR.set((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize()));
  p.mass.add(trunk, bark, x, y, z);
  for (let i = 0; i < 11; i++) {
    const a = i * 0.83 + r(), rr = (0.6 + r() * 1.9) * s, hy = y + H * (0.72 + r() * 0.5);
    const sx = (0.75 + r() * 0.45) * s, sy = (0.55 + r() * 0.3) * s, sz = (0.75 + r() * 0.45) * s;
    const g = new SphereGeometry(1, 9, 6); g.scale(sx, sy, sz);
    const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
    p.mass.add(g, jitter([0x7a6b30, 0x94662a, 0x66672e, 0xa0742c][i % 4]!, r, 0.1), bx, hy, bz);
    // Früchte auf der Unterseite und am Rand des Ballens — dort hängen sie.
    for (let j = 0; j < 3; j++) {
      const t = r() * Math.PI * 2, f = 0.85 + r() * 0.15;
      ball(p.detail, bx + Math.cos(t) * sx * f, hy - sy * (0.2 + r() * 0.5), bz + Math.sin(t) * sz * f, 0.085 * s + 0.02, jitter(PERSIMMON, r, 0.1), 5);
    }
    const branch = new CylinderGeometry(0.04 * s, 0.08 * s, rr + 0.4, 5); branch.translate(0, (rr + 0.4) / 2, 0);
    branch.applyQuaternion(Q.setFromUnitVectors(UP, DIR.set(Math.cos(a) * rr, hy - y - H * 0.6, Math.sin(a) * rr).normalize()));
    p.detail.add(branch, bark, x, y + H * 0.6, z);
  }
}

/** Bambushain: dünne, leicht geneigte Halme mit Blattbüscheln oben. */
export function bamboo(p: Parts, x: number, y: number, z: number, n: number, r: Rng): void {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 3.2, H = 7 + r() * 5, bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
    const lean = DIR.set(Math.cos(a) * 0.12 + (r() - 0.5) * 0.1, 1, Math.sin(a) * 0.12 + (r() - 0.5) * 0.1).normalize().clone();
    const g = new CylinderGeometry(0.045, 0.06, H, 5); g.translate(0, H / 2, 0); g.applyQuaternion(Q.setFromUnitVectors(UP, lean));
    p.detail.add(g, jitter(0x7d8a4a, r, 0.12), bx, y, bz);
    for (let j = 0; j < 3; j++) {
      const t = 0.62 + j * 0.14, lg = new SphereGeometry(1, 6, 3); lg.scale(1.1 + r() * 0.5, 0.5, 1.1 + r() * 0.5);
      p.mass.add(lg, jitter(0x5f7a34, r, 0.12), bx + lean.x * H * t + (r() - 0.5), y + lean.y * H * t, bz + lean.z * H * t + (r() - 0.5));
    }
  }
}

/** Sechs Jizō unter einem kleinen Ziegeldach: rote Lätzchen, Mützen, Windräder. */
export function jizoShelter(p: Parts, r: Rng): void {
  const w = 4.2, d = 1.4, H = 2.1;
  p.mass.box(0, 0.15, 0, w + 0.3, 0.3, d + 0.3, 0x8a877c);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) p.detail.box(x, 0.3 + H / 2, z, 0.12, H, 0.12, 0x4a3a2c);
  boardsX(p.fine, -w / 2, w / 2, 0.3, 0.3 + H, -d / 2, 1, 0x5a4634, r, 0.24);
  p.mass.box(0, 0.3 + H / 2, -d / 2 - 0.03, w, H, 0.06, 0x5a4634);
  gableRoof(p, { w, d, y: 0.3 + H, pitch: 0.45, eave: 0.45, gableOver: 0.35, ridge: 'x', color: KAWARA, tsuma: 0x5a4634 }, r);
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.45 + i * (w - 0.9) / 5;
    p.detail.add(new CylinderGeometry(0.15, 0.19, 0.52, 8), jitter(0x8f8c83, r, 0.08), x, 0.56, 0);
    ball(p.detail, x, 0.93, 0, 0.14, jitter(0x96938a, r, 0.06), 7);
    p.detail.add(new ConeGeometry(0.21, 0.26, 8), 0xc0271c, x, 0.7, 0.03);
    p.detail.add(new CylinderGeometry(0.13, 0.15, 0.1, 8), 0xc0271c, x, 1.06, 0);
    // Windrad, Opferschale.
    p.detail.box(x + 0.18, 0.75, 0.25, 0.012, 0.6, 0.012, 0x444444);
    p.detail.add(new CylinderGeometry(0.1, 0.1, 0.01, 6), [0xe84a3a, 0xf0c33a, 0x3a8ad8, 0x3aa06a][i % 4]!, x + 0.18, 1.05, 0.26, Math.PI / 2);
    p.detail.box(x, 0.33, 0.35, 0.12, 0.06, 0.12, 0xe8e4da);
  }
}

/** Kakashi — Vogelscheuche mit Strohhut am Feldrand. */
export function kakashi(p: Parts, r: Rng): void {
  p.detail.add(new CylinderGeometry(0.03, 0.035, 2.0, 5), 0x6a5a45, 0, 1.0, 0);
  p.detail.box(0, 1.35, 0, 1.3, 0.05, 0.05, 0x6a5a45);
  p.detail.box(0, 1.2, 0, 0.5, 0.55, 0.22, [0x3b4f6a, 0x7a3a2a, 0x5a6a3a][Math.floor(r() * 3)]!);
  for (const s of [-1, 1]) p.detail.box(s * 0.4, 1.35, 0, 0.36, 0.18, 0.18, 0x3b4f6a);
  ball(p.detail, 0, 1.68, 0, 0.17, 0xe8e2d0, 6);
  p.detail.add(new ConeGeometry(0.42, 0.22, 10), 0xc9ad6c, 0, 1.9, 0);
}

/** Bauer auf dem Feld, gebückt: Strohhut, Arbeitskleidung. Für instanzierte Figuren. */
export function fieldWorker(k: SettlementKit, look: number): void {
  const cloth = [0x2f3f5c, 0x6b5238, 0x5a6040, 0x4a6a8a][look % 4]!;
  k.box(0, 0.42, 0, 0.18, 0.84, 0.2, 0x3a3a44, 0.15);
  for (const s of [-1, 1]) k.box(s * 0.13, 0.42, 0, 0.16, 0.84, 0.2, 0x3a3a44, 0.1 * s);
  k.box(0, 1.05, 0.22, 0.46, 0.34, 0.62, cloth, 0.9);
  ball(k, 0, 1.12, 0.62, 0.17, 0xb88d6a, 7);
  k.add(new ConeGeometry(0.38, 0.2, 10), 0xc9ad6c, 0, 1.3, 0.66, 0.9);
  for (const s of [-1, 1]) k.box(s * 0.2, 0.75, 0.55, 0.11, 0.5, 0.11, cloth, 0.2);
}
