import { CircleGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { SettlementKit } from '../SettlementKit';
import {
  KAWARA, STONE, ball, gableRoof, jitter, place, plate, polyFacing, shade, tilePlate, Parts,
  type Rng, type Tile,
} from '../wago/wagoKit';
import { kura as gasshoKura, hipThatch, STRAW } from '../gassho/gasshoBuildings';
import { T, tile } from './kisoAtlas';
import type { KisoKind, KisoRole, KisoRoof } from './kisoLayout';

/*
 * Bauten von Kiso-Juku in lokalen Koordinaten: x entlang der Straße (quer zum
 * Haus), z in die Tiefe, **Front bei z = +d/2 zur Straße**, y 0 = Oberkante des
 * Sockels. Vorbilder: Tsumago (Terajima-ya, Kami-Sagaya), Magome, Narai.
 * Referenzbilder: C:\Users\Leandro\Downloads\towns\bergdorf\.
 *
 * Was ein Kiso-Haus aus 30 m erkennbar macht, der Reihe nach:
 *  1. das **vorkragende Obergeschoss** (Dashi-bari) mit sichtbaren Balkenköpfen,
 *  2. das **fast schwarze** Holz gegen **weiße** Putzfelder,
 *  3. das **flache** Dach mit tiefer Traufe — Bretter mit Steinen, Ziegel, Blech,
 *  4. das **Koshi-Gitter**: dichte senkrechte Latten, hinter denen Licht ist.
 * Die erste Stufe von Stillwater hatte (2) und (4) nicht; die Häuser lasen sich
 * dort als dunkle Kästen mit weißen Rechtecken (docs/DOERFER.md, „Offen“).
 */

/** Kiso-Zeder: geölt und geräuchert, fast schwarz, mit warmem Unterton. */
export const WOOD = [0x2f251d, 0x362a20, 0x3b2e23, 0x2b221b] as const;
const BEAM = 0x1c1611;
const PLASTER = 0xe4ddcb;
const PLASTER_OLD = 0xd6ccb4;
/** Silbergraue Schindeln der Ishioki-Dächer — die Sonne bleicht sie, der Regen färbt sie dunkel. */
const SHINGLE = 0x6c665c;
const ROOF_STONE = 0x7f7b72;
const SHEETS = [0x5b3b2d, 0x3f4b52, 0x4b3f38, 0x6a4030, 0x44504a] as const;
const COPPER = 0x6e5037;
const GRAVEL = 0x8e8778;

// ── Kleine Helfer ─────────────────────────────────────────────────────────────

/** Flusskiesel: ein Ikosaeder, flach gedrückt und gedreht — 20 Dreiecke, liest sich als Stein. */
export function pebble(k: SettlementKit, x: number, y: number, z: number, r: number, color: number, rnd: Rng, flat = 0.55): void {
  const g = new IcosahedronGeometry(1, 0);
  g.scale(r * (0.8 + rnd() * 0.45), r * flat * (0.8 + rnd() * 0.4), r * (0.8 + rnd() * 0.45));
  g.rotateY(rnd() * Math.PI);
  k.add(g, jitter(color, rnd, 0.14), x, y, z);
}

/** Zylinder, dessen Mantel eine Atlaskachel trägt (Laternen: Schrift umlaufend). */
export function tileCylinder(k: SettlementKit, t: Tile, x: number, y: number, z: number, r: number, h: number, seg = 12, rTop = r): void {
  const g = new CylinderGeometry(rTop, r, h, seg, 1, true), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
  k.add(g, 0xffffff, x, y, z);
}

/** Hochkant-Kachel: der Atlas ist quer (256 × 128), senkrechte Schilder werden gedreht abgebildet. */
export function portrait(k: SettlementKit, t: Tile, x: number, y: number, z: number, w: number, h: number, axis: 'x' | 'z', face: number): void {
  const g = new PlaneGeometry(h, w), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
  g.rotateZ(Math.PI / 2);
  k.add(g, 0xffffff, x, y, z, 0, axis === 'z' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
}

/** Papierlaterne (Chōchin) mit umlaufender Schrift, Deckel und Boden aus schwarzem Lack. */
export function chochin(p: Parts, x: number, y: number, z: number, t: Tile, r = 0.2, h = 0.55): void {
  tileCylinder(p.signGlow, t, x, y, z, r, h, 12, r * 0.92);
  p.detail.add(new CylinderGeometry(r * 0.62, r * 0.62, 0.07, 10), 0x16120f, x, y + h / 2 + 0.03, z);
  p.detail.add(new CylinderGeometry(r * 0.62, r * 0.62, 0.07, 10), 0x16120f, x, y - h / 2 - 0.03, z);
  p.detail.box(x, y + h / 2 + 0.2, z, 0.02, 0.32, 0.02, 0x16120f);
}

/** Andon-Straßenlampe: Holzpfosten, Laternenkasten mit Papierseiten, kleines Dach. */
export function streetLamp(p: Parts, x: number, y: number, z: number, yaw: number): void {
  const tmp = new Parts();
  tmp.detail.box(0, 1.1, 0, 0.13, 2.2, 0.13, 0x2a211a);
  tmp.detail.box(0, 0.08, 0, 0.36, 0.16, 0.36, 0x7a776d);
  const t = tile(T.andon);
  for (const [ax, f] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]] as const) {
    tilePlate(tmp.signGlow, [t[0] + (f > 0 ? 0 : (t[2] - t[0]) / 2), t[1], t[0] + (f > 0 ? (t[2] - t[0]) / 2 : t[2] - t[0]), t[3]] as unknown as Tile,
      ax === 'x' ? f * 0.2 : 0, 2.48, ax === 'z' ? f * 0.2 : 0, 0.36, 0.5, ax, f);
  }
  tmp.detail.box(0, 2.2, 0, 0.46, 0.06, 0.46, 0x221b15);
  tmp.detail.box(0, 2.76, 0, 0.46, 0.06, 0.46, 0x221b15);
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) tmp.detail.box(sx, 2.48, sz, 0.05, 0.56, 0.05, 0x221b15);
  tmp.detail.add(new ConeGeometry(0.46, 0.26, 4), 0x2a2622, 0, 2.93, 0, 0, Math.PI / 4, 0);
  place(tmp, p, x, y, z, yaw);
}

/** Topfpflanze: Tontopf, Laubballen; ab und zu eine Kiefer im Topf (Bonsai-artig). */
export function pottedPlant(p: Parts, x: number, y: number, z: number, rnd: Rng): void {
  const pot = [0x7a4e34, 0x5a4a3e, 0x6a6a64, 0x2e3a4a][Math.floor(rnd() * 4)]!, s = 0.7 + rnd() * 0.6;
  p.detail.add(new CylinderGeometry(0.2 * s, 0.14 * s, 0.3 * s, 8), pot, x, y + 0.15 * s, z);
  if (rnd() < 0.25) {
    p.detail.add(new CylinderGeometry(0.02, 0.035, 0.5 * s, 5), 0x4a3a2a, x, y + 0.5 * s, z);
    for (let i = 0; i < 3; i++) { const g = new SphereGeometry(1, 7, 4); g.scale(0.22 * s, 0.08 * s, 0.18 * s); p.detail.add(g, jitter(0x2f4a2a, rnd, 0.1), x + (i - 1) * 0.12 * s, y + (0.45 + i * 0.12) * s, z); }
  } else {
    ball(p.detail, x, y + 0.42 * s, z, 0.24 * s, jitter([0x3d5a2e, 0x4a6a34, 0x55702f][Math.floor(rnd() * 3)]!, rnd, 0.1), 6);
    if (rnd() < 0.4) for (let i = 0; i < 4; i++) ball(p.detail, x + (rnd() - 0.5) * 0.3 * s, y + (0.45 + rnd() * 0.2) * s, z + (rnd() - 0.5) * 0.3 * s, 0.05, [0xc8402a, 0xe8d2e0, 0x6a5ab8, 0xf0c040][Math.floor(rnd() * 4)]!, 4);
  }
}

/** Shōgi: Bank mit rotem Filz, davor oft ein Schirm. */
export function bench(p: Parts, x: number, y: number, z: number, along: 'x' | 'z', umbrella: boolean): void {
  const lx = along === 'x' ? 1.8 : 0.7, lz = along === 'x' ? 0.7 : 1.8;
  p.detail.box(x, y + 0.44, z, lx, 0.07, lz, 0x6a4e34);
  p.detail.box(x, y + 0.49, z, lx + 0.02, 0.03, lz + 0.02, 0xb3261e);
  for (const e of [-0.75, 0.75]) p.detail.box(x + (along === 'x' ? e : 0), y + 0.21, z + (along === 'z' ? e : 0), along === 'x' ? 0.08 : 0.55, 0.42, along === 'x' ? 0.55 : 0.08, 0x4a3624);
  if (umbrella) {
    p.detail.add(new CylinderGeometry(0.03, 0.03, 2.5, 5), 0x3a2a1c, x, y + 1.25, z);
    p.detail.add(new ConeGeometry(1.3, 0.42, 14, 1, true), 0xb3261e, x, y + 2.45, z);
    p.detail.add(new ConeGeometry(0.2, 0.12, 10), 0x2a1a12, x, y + 2.7, z);
  }
}

/** Brennholzstapel unter der Traufe: Kiso heizt bis heute mit Holz. */
export function firewood(p: Parts, x: number, y: number, z: number, len: number, h: number, along: 'x' | 'z', face: number, rnd: Rng): void {
  const lx = along === 'x' ? len : 0.5, lz = along === 'x' ? 0.5 : len;

  // Stirnholz: runde Scheiben, versetzt gestapelt, gedeckt getönt. Die erste Fassung
  // (quadratische, orange Platten im Raster) las sich im Bild als Ziegelmauer.
  p.detail.box(x, y + h / 2, z, lx - 0.02, h - 0.02, lz - 0.02, 0x2a2018);
  let row = 0;
  for (let v = 0.08; v < h - 0.04; v += 0.13, row++) for (let u = -len / 2 + 0.07 + (row % 2) * 0.06; u < len / 2 - 0.05; u += 0.13) {
    const c = jitter(rnd() < 0.3 ? 0x8a6e52 : 0x9c8466, rnd, 0.12), rr = 0.05 + rnd() * 0.02, du = u + (rnd() - 0.5) * 0.03, dv = v + (rnd() - 0.5) * 0.03;
    // Kreisscheibe (6 Dreiecke), keine Zylinder: 100 Scheite je Stapel.
    if (along === 'x') p.fine.add(new CircleGeometry(rr, 6), c, x + du, y + dv, z + face * 0.25, 0, face > 0 ? 0 : Math.PI, 0);
    else p.fine.add(new CircleGeometry(rr, 6), c, x + face * 0.25, y + dv, z + du, 0, face > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  }
  // Abdeckbrett.
  p.detail.box(x, y + h + 0.03, z, lx + 0.1, 0.05, lz + 0.1, 0x3a2e22);
}

/** Niwaki: Kiefer im Wolkenschnitt — Stamm, drei bis fünf flache Polster. */
export function niwaki(k: SettlementKit, detail: SettlementKit, x: number, y: number, z: number, s: number, rnd: Rng): void {
  const H = (2.6 + rnd()) * s;
  const trunk = new CylinderGeometry(0.1 * s, 0.2 * s, H, 6); trunk.translate(0, H / 2, 0); trunk.rotateZ((rnd() - 0.5) * 0.2);
  detail.add(trunk, 0x4a3a2c, x, y, z);
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), a = i * 2.2 + rnd(), rr = (1 - f) * 1.1 * s;
    const g = new SphereGeometry(1, 9, 5); g.scale((1.25 - f * 0.55) * s, 0.36 * s, (1.1 - f * 0.45) * s);
    k.add(g, jitter([0x2c4225, 0x324a28, 0x283d22][i % 3]!, rnd, 0.08), x + Math.cos(a) * rr, y + H * (0.35 + f * 0.7), z + Math.sin(a) * rr);
  }
}

/** Momiji im Herbst: dünner Stamm, weite, lichte Krone aus Rot, Orange und Rest-Grün. */
export function momiji(k: SettlementKit, detail: SettlementKit, x: number, y: number, z: number, s: number, rnd: Rng): void {
  const H = (3.4 + rnd() * 1.4) * s;
  const trunk = new CylinderGeometry(0.09 * s, 0.18 * s, H * 0.7, 6); trunk.translate(0, H * 0.35, 0);
  detail.add(trunk, 0x3e3026, x, y, z);
  // Gedeckte Töne und viele kleine, flache Polster: mit 14 großen, gesättigten Kugeln
  // stand der Baum im ersten Bild wie ein Bündel Luftballons am Hang.
  const cols = [0x8e2a1c, 0xa33a20, 0xb4552a, 0x74261a, 0xa86a2a, 0x5e6a2c];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4 + rnd(), f = Math.sqrt(rnd()), rr = f * 2.1 * s, hy = y + H * (0.62 + (1 - f) * 0.38 + rnd() * 0.12);
    // Ikosaeder ohne Unterteilung (20 Dreiecke): 26 Polster × 80 waren 2000 je Baum in der Masse.
    const g = new IcosahedronGeometry(1, 0); g.scale((0.55 + rnd() * 0.4) * s, (0.3 + rnd() * 0.14) * s, (0.55 + rnd() * 0.4) * s); g.rotateY(rnd() * 3);
    k.add(g, jitter(cols[Math.floor(rnd() * cols.length)]!, rnd, 0.08), x + Math.cos(a) * rr, hy, z + Math.sin(a) * rr);
  }
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + rnd(), br = new CylinderGeometry(0.03 * s, 0.06 * s, 1.8 * s, 4); br.translate(0, 0.9 * s, 0); br.rotateZ(0.9); br.rotateY(a); detail.add(br, 0x3e3026, x, y + H * 0.5, z); }
}

/** Hortensie am Wegrand (im Referenzbild von Tsumago überall), grün mit ein paar Blütenbällen. */
export function hydrangea(k: SettlementKit, detail: SettlementKit, x: number, y: number, z: number, rnd: Rng): void {
  const g = new IcosahedronGeometry(1, 1); g.scale(0.7 + rnd() * 0.3, 0.55, 0.6 + rnd() * 0.3);
  k.add(g, jitter(0x3d5a2e, rnd, 0.1), x, y + 0.4, z);
  for (let i = 0; i < 3; i++) { const b = new IcosahedronGeometry(0.13, 0); detail.add(b, [0x8a9ac8, 0xc8a8c8, 0xe8e0d0, 0x7a8ab8][Math.floor(rnd() * 4)]!, x + (rnd() - 0.5) * 1.0, y + 0.6 + rnd() * 0.25, z + (rnd() - 0.5) * 0.8); }
}

// ── Dach ─────────────────────────────────────────────────────────────────────

interface RoofX {
  /** Firstrichtung x von x0 bis x1 (ohne Überstand), Wandebenen hinten zA und vorn zB. */
  x0: number; x1: number; zA: number; zB: number; y: number; pitch: number;
  eaveA: number; eaveB: number; over: number; type: KisoRoof; color: number; r: Rng;
  /** Giebeldreieck an den Enden: Farbe, oder null ohne. */
  tsuma: number | null;
  /** Schmuckgiebel (Fachwerk) an x0 — der Straßengiebel eines Tsumairi-Hauses. */
  showGable?: boolean;
  gutter?: boolean;
  /** Sparren unter der Vordertraufe zeigen (nur wo man druntersteht). */
  rafters?: boolean;
}

/**
 * Satteldach mit First entlang x, für alle drei Deckungen. Die Unterkante der
 * Dachplatte liegt auf der Linie Firstpunkt → Traufkante; alle Kleinteile
 * sitzen darauf über `on(u)` (u = Abstand vom First entlang der Fläche).
 *
 * Eigene Fassung statt `gableRoof`, weil der Kiso-Grundriss nicht symmetrisch
 * ist: das Obergeschoss kragt vorn aus, die Traufe vorn ist tief (1,2 m über
 * dem Gehweg), hinten knapp. Ziegel nehmen trotzdem denselben Weg — so liegen
 * alle drei Deckungen in derselben Geometrie und unterscheiden sich nur darin,
 * was auf der Fläche liegt.
 */
function roofX(p: Parts, o: RoofX): { ridge: number; eaveY: number } {
  const zr = (o.zA + o.zB) / 2, half = (o.zB - o.zA) / 2, tanp = Math.tan(o.pitch), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  const rise = tanp * half, top = o.y + rise, t = o.type === 'kawara' ? 0.2 : 0.14;
  const X0 = o.x0 - o.over, X1 = o.x1 + o.over, len = X1 - X0, xm = (X0 + X1) / 2, r = o.r;
  let eaveYFront = o.y;
  for (const s of [-1, 1] as const) {
    const e = s > 0 ? o.eaveB : o.eaveA, L = (half + e) / cp;
    const ny = cp, nz = s * sp;
    /** Punkt auf der Oberseite der Platte, u vom First entlang der Fläche, `lift` darüber. */
    const on = (u: number, lift: number): [number, number] => [top - u * sp + ny * (t + lift), zr + s * u * cp + nz * (t + lift)];
    const [cy, cz] = on(L / 2, -t / 2);
    p.mass.box(xm, cy, cz, len, t, L, o.color, s * o.pitch);
    const eaveY = top - L * sp;
    if (s > 0) eaveYFront = eaveY;
    // Stirnbrett an der Traufe und Untersicht.
    const [fy, fz] = on(L, -t / 2);
    p.detail.box(xm, fy - 0.02, fz + s * 0.02, len, t + 0.1, 0.06, shade(BEAM, 1.2));
    if (o.type === 'kawara') {
      for (let x = X0 + 0.18; x < X1; x += 0.36) { const [ry, rz] = on(L / 2, 0.035); p.fine.box(x, ry, rz, 0.11, 0.07, L, jitter(o.color, r, 0.08), s * o.pitch); }
      const [ey, ez] = on(L - 0.08, 0.06); p.mass.box(xm, ey, ez, len + 0.04, 0.2, 0.24, shade(o.color, 0.74));
      // Tomoe-Ziegel an der Traufkante: kleine runde Stirnen, die Reihe, die man von unten sieht.
      // Als Platte (2 Dreiecke) statt als Zylinder (32): 30 Stück je Traufe summierten sich auf 1000 je Dach.
      for (let x = X0 + 0.18; x < X1; x += 0.36) { const [by, bz] = on(L - 0.01, 0.06); plate(p.fine, x, by, bz + s * 0.13, 0.13, 0.13, 'z', s, shade(o.color, 0.6)); }
    } else if (o.type === 'ishi') {
      // Schindellagen: dünne Streifen parallel zum First, jede Lage anders gebleicht.
      for (let u = 0.25; u < L - 0.05; u += 0.3) { const [ry, rz] = on(u, 0.012); p.fine.box(xm, ry, rz, len, 0.022, 0.3, jitter(o.color, r, 0.16), s * o.pitch); }
      // Ausgebesserte Stellen: hellere, neue Bretter.
      for (let i = 0; i < 3; i++) { const u = 0.5 + r() * (L - 1), x = X0 + 0.6 + r() * (len - 1.2), [ry, rz] = on(u, 0.03); p.fine.box(x, ry, rz, 0.8 + r() * 1.2, 0.02, 0.62, shade(0x9a8e76, 0.9 + r() * 0.2), s * o.pitch); }
      // Haltestangen (Osae-gi) und Steine darauf.
      // Die unterste Stangenreihe gehört zur Nahschicht (die Traufe sieht man von der
      // Straße), die übrigen zur Oberflächenschicht: gemessen trugen die Steine sonst
      // rund 45 000 Dreiecke in die Schicht, die auch auf Minimal gezeichnet wird.
      [0.2, 0.52, 0.86].forEach((f, n) => {
        const [py, pz] = on(L * f, 0.06), k = n === 2 ? p.detail : p.fine;
        k.add(new CylinderGeometry(0.055, 0.055, len - 0.2, 5), jitter(0x4a4036, r, 0.1), xm, py, pz, 0, 0, Math.PI / 2);
        for (let x = X0 + 0.3 + r() * 0.3; x < X1 - 0.2; x += 0.7 + r() * 0.35) {
          const [sy, sz] = on(L * f + (r() - 0.5) * 0.12, 0.15);
          pebble(k, x, sy, sz, 0.15 + r() * 0.08, ROOF_STONE, r);
        }
      });
    } else {
      // Blech: Stehfalze vom First zur Traufe.
      for (let x = X0 + 0.22; x < X1; x += 0.44) { const [ry, rz] = on(L / 2, 0.02); p.fine.box(x, ry, rz, 0.035, 0.04, L, shade(o.color, 1.12), s * o.pitch); }
      const [ey, ez] = on(L - 0.03, 0.02); p.detail.box(xm, ey, ez, len + 0.02, 0.05, 0.08, shade(o.color, 0.8), s * o.pitch);
    }
    // Sparren unter der Vordertraufe: die Rippen, die man vom Gehweg aus sieht.
    if (s > 0 && o.rafters) {
      const u0 = half / cp, u1 = L - 0.06, um = (u0 + u1) / 2, [ry, rz] = on(um, -t - 0.05);
      for (let x = X0 + 0.25; x < X1 - 0.1; x += 0.46) p.fine.box(x, ry, rz, 0.07, 0.09, u1 - u0, 0x241b14, s * o.pitch);
      // Unterseite der Traufe (Nokiura) in hellem Holz, damit die Sparren davor stehen.
      const [by, bz] = on(um, -t - 0.012); p.detail.box(xm, by, bz, len - 0.1, 0.015, u1 - u0, 0x5a4634, s * o.pitch);
    }
    // Dachrinne vorn (Blech und Ziegel), mit Fallrohr am Hausende.
    if (s > 0 && o.gutter) {
      const gy = eaveY - 0.1, gz = zr + (half + e) + 0.05;
      p.detail.box(xm, gy, gz, len, 0.12, 0.14, COPPER);
    }
  }
  // First.
  if (o.type === 'kawara') {
    p.mass.box(xm, top + t + 0.14, zr, len, 0.32, 0.48, shade(o.color, 0.8));
    p.detail.box(xm, top + t + 0.36, zr, len + 0.08, 0.14, 0.3, shade(o.color, 0.64));
    for (const e of [-1, 1]) { const x = e > 0 ? X1 : X0; p.mass.box(x, top + t + 0.3, zr, 0.2, 0.62, 0.56, shade(o.color, 0.7)); p.detail.box(x + e * 0.04, top + t + 0.68, zr, 0.28, 0.18, 0.28, shade(o.color, 0.6), 0, 0, e * 0.5); }
  } else if (o.type === 'ishi') {
    for (const s of [-1, 1]) p.mass.box(xm, top + t + 0.06, zr + s * 0.16, len, 0.05, 0.4, shade(o.color, 0.82), s * 0.55);
    for (let x = X0 + 0.35; x < X1 - 0.2; x += 0.7 + r() * 0.25) pebble(p.detail, x, top + t + 0.24, zr, 0.18 + r() * 0.05, ROOF_STONE, r);
  } else {
    for (const s of [-1, 1]) p.mass.box(xm, top + t + 0.04, zr + s * 0.14, len + 0.02, 0.04, 0.36, shade(o.color, 0.78), s * 0.5);
  }
  // Giebel: Dreieck, Windbretter, Gegyo.
  for (const e of [-1, 1] as const) {
    const x = e > 0 ? o.x1 : o.x0;
    if (o.tsuma !== null) {
      polyFacing(p.mass, [[x, o.y - 0.02, o.zA], [x, o.y - 0.02, o.zB], [x, top - 0.02, zr]], o.tsuma, [e, 0, 0]);
      // Fachwerk im Putz: Zugbalken, Firstsäule, Kniestöcke — schwarz auf weiß.
      if (o.tsuma === PLASTER || o.tsuma === PLASTER_OLD) {
        const fx = x + e * 0.03, span = o.zB - o.zA;
        p.detail.box(fx, o.y + 0.1, zr, 0.07, 0.22, span, BEAM);
        p.detail.box(fx, (o.y + top) / 2, zr, 0.07, rise, 0.16, BEAM);
        const midY = o.y + rise * 0.45, midHalf = half * (1 - 0.45);
        p.detail.box(fx, midY, zr, 0.07, 0.16, 2 * midHalf - 0.1, BEAM);
        for (const f of [-0.55, 0.55]) { const zz = zr + f * half, hTop = top - Math.abs(f) * rise; p.detail.box(fx, (o.y + hTop) / 2, zz, 0.07, hTop - o.y - 0.05, 0.12, BEAM); }
        if (o.showGable && x === o.x0) {
          // Straßengiebel: zusätzlich ein kleines Lüftungsgitter unter dem First.
          p.detail.box(fx, top - rise * 0.25, zr, 0.07, rise * 0.22, half * 0.34, 0x2a211a);
          for (let zz = zr - half * 0.15; zz <= zr + half * 0.15; zz += 0.12) p.detail.box(fx + e * 0.02, top - rise * 0.25, zz, 0.04, rise * 0.2, 0.03, 0x6a5a44);
        }
      }
    }
    const bx = e > 0 ? X1 + 0.03 : X0 - 0.03;
    for (const s of [-1, 1] as const) {
      const e2 = s > 0 ? o.eaveB : o.eaveA, L = (half + e2) / cp, [by, bz] = [top - (L / 2) * sp + cp * t * 0.5, zr + s * (L / 2) * cp];
      p.detail.box(bx, by, bz, 0.07, 0.3, L + 0.1, 0x241b14, s * o.pitch);
    }
    p.detail.box(bx + e * 0.02, top - 0.12, zr, 0.06, 0.42, 0.42, 0x241b14);
  }
  return { ridge: top + t + 0.5, eaveY: eaveYFront };
}

/**
 * Pultdach (Hisashi) über dem Erdgeschoss, x0…x1 an der Wand z = zWall, nach +z.
 * Kiso-Häuser tragen es zwischen Laden und vorkragendem Obergeschoss.
 */
function pent(p: Parts, x0: number, x1: number, zWall: number, yTop: number, depth: number, type: KisoRoof, color: number, r: Rng): void {
  const pitch = 0.3, L = depth / Math.cos(pitch), w = x1 - x0, xm = (x0 + x1) / 2;
  const cz = zWall + depth / 2, cy = yTop - Math.tan(pitch) * depth / 2;
  p.mass.box(xm, cy, cz, w, 0.1, L, color, pitch);
  const on = (u: number, lift: number): [number, number] => [yTop - u * Math.sin(pitch) + Math.cos(pitch) * (0.05 + lift), zWall + u * Math.cos(pitch) + Math.sin(pitch) * (0.05 + lift)];
  if (type === 'kawara') {
    for (let x = x0 + 0.16; x < x1; x += 0.34) { const [y, z] = on(L / 2, 0.03); p.fine.box(x, y, z, 0.1, 0.06, L, jitter(color, r, 0.08), pitch); }
    const [y, z] = on(L - 0.06, 0.05); p.detail.box(xm, y, z, w, 0.16, 0.18, shade(color, 0.72));
  } else if (type === 'ishi') {
    for (let u = 0.15; u < L; u += 0.26) { const [y, z] = on(u, 0.01); p.fine.box(xm, y, z, w, 0.02, 0.26, jitter(color, r, 0.14), pitch); }
    const [py, pz] = on(L * 0.55, 0.05); p.detail.add(new CylinderGeometry(0.045, 0.045, w - 0.1, 5), 0x4a4036, xm, py, pz, 0, 0, Math.PI / 2);
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.8 + r() * 0.3) pebble(p.detail, x, py + 0.09, pz, 0.12 + r() * 0.04, ROOF_STONE, r);
  } else {
    for (let x = x0 + 0.2; x < x1; x += 0.4) { const [y, z] = on(L / 2, 0.015); p.fine.box(x, y, z, 0.03, 0.035, L, shade(color, 1.12), pitch); }
  }
  // Stirnbrett und Konsolen.
  const [fy, fz] = on(L, -0.05); p.detail.box(xm, fy - 0.02, fz, w, 0.16, 0.05, 0x241b14);
  for (const x of [x0 + 0.2, xm, x1 - 0.2]) p.detail.box(x, yTop - 0.32, zWall + depth * 0.45, 0.08, 0.1, depth * 0.9, BEAM, 0.55);
}

// ── Fassade ─────────────────────────────────────────────────────────────────

type Bay = 'door' | 'koshi' | 'open' | 'itado' | 'wall' | 'glass';

/** Wie viele Joche (Ken, 1,82 m) eine Front hat, und was in welchem steht. */
function bays(w: number, role: KisoRole, r: Rng): Bay[] {
  const n = Math.max(3, Math.round(w / 1.82)), out: Bay[] = [];
  const shop = role !== 'home' && role !== 'inn' && role !== 'waki';
  const door = Math.min(n - 1, Math.max(0, Math.floor(n * (0.25 + r() * 0.5))));
  for (let i = 0; i < n; i++) {
    if (i === door) { out.push('door'); continue; }
    const roll = r();
    if (shop && Math.abs(i - door) <= 2 && roll < 0.8) out.push('open');
    else if (roll < 0.62) out.push('koshi');
    else if (roll < 0.76) out.push('itado');
    else if (roll < 0.88) out.push('glass');
    else out.push('wall');
  }
  return out;
}

const INTERIOR: Record<KisoRole, number> = {
  home: T.koshiLit, inn: T.koshiLit, waki: T.koshiLit, shop: T.inShop, soba: T.inSoba, gohei: T.inGohei, sake: T.inSake,
  crafts: T.inCrafts, lacquer: T.inCrafts, post: T.inShop, sweets: T.inSoba,
};
const SIGN: Record<KisoRole, number> = {
  home: -1, inn: T.inn1, waki: T.waki, shop: T.shop, soba: T.soba, gohei: T.gohei, sake: T.sake,
  crafts: T.crafts, lacquer: T.lacquer, post: T.post, sweets: T.sweets,
};

/** Kiso-Gitter: senkrechte Latten, jede dritte kürzer (Ko-goshi), unten eine Brüstung. */
function kisoKoshi(p: Parts, x: number, y0: number, y1: number, z: number, w: number, lit: boolean, r: Rng): void {
  const h = y1 - y0, ym = (y0 + y1) / 2;
  if (lit) tilePlate(p.signGlow, tile(T.koshiLit, Math.floor(r() * 120), 0, Math.floor(r() * 120) + 136, 128), x, ym, z + 0.02, w, h, 'z', 1);
  else p.glass.box(x, ym, z + 0.02, w, h, 0.02, 0x16120e);
  let i = 0;
  for (let u = -w / 2 + 0.045; u < w / 2; u += 0.085, i++) {
    const short = i % 3 === 2;
    plate(p.detail, x + u, short ? y0 + h * 0.62 : ym, z + 0.08, 0.04, short ? h * 0.76 : h, 'z', 1, BEAM);
  }
  for (const v of [y0 + 0.02, y1 - 0.02, y0 + h * 0.24]) p.detail.box(x, v, z + 0.1, w + 0.06, 0.06, 0.06, BEAM);
}

/** Schiebetür: zwei Flügel, Holzrahmen, Glas oder Papier, einer halb offen mit Licht dahinter. */
function slidingDoor(p: Parts, x: number, w: number, h: number, z: number, interior: number, r: Rng): void {
  const lw = w / 2;
  tilePlate(p.signGlow, tile(interior), x - lw / 2, h / 2 + 0.12, z + 0.02, lw, h, 'z', 1);
  const cx = x + lw / 2;
  p.detail.box(cx, h / 2 + 0.12, z + 0.05, lw, h, 0.05, 0x3a2c20);
  const glass = r() < 0.5;
  for (let row = 0; row < 4; row++) {
    const y = 0.35 + row * (h - 0.3) / 4 + (h - 0.3) / 8;
    if (glass) p.glass.box(cx, y, z + 0.08, lw - 0.14, (h - 0.3) / 4 - 0.1, 0.02, 0x2a3136);
    else tilePlate(p.sign, tile(T.shoji, 0, 0, 128, 64), cx, y, z + 0.08, lw - 0.14, (h - 0.3) / 4 - 0.1, 'z', 1);
  }
  for (let k = 0; k < 3; k++) p.detail.box(cx - lw / 2 + 0.04 + k * (lw - 0.08) / 2, h / 2 + 0.12, z + 0.09, 0.05, h, 0.04, BEAM);
  // Schwelle (Shiki) aus Stein.
  p.detail.box(x, 0.06, z + 0.08, w + 0.2, 0.12, 0.3, 0x8a877c);
}

export interface KisoSpec {
  w: number; d: number; kind: KisoKind; roof: KisoRoof; role: KisoRole; r: Rng;
  /** Anteil beleuchteter Fenster (Abend). */
  lit: number;
  /** Wie tief der Steinsockel unter den Boden reicht (Gelände fällt, Straße steigt). */
  base: number;
  /**
   * Höhe des Gehwegs vor der Front relativ zum Hausboden, an lokalem x. Die Straße
   * steigt 8 %: über 10 m Front sind das 0,8 m. Alles, was vor dem Haus auf dem
   * Gehweg steht, muss darauf stehen — mit y = 0 schwebten Töpfe und Bänke bis 0,7 m.
   */
  street?: (x: number) => number;
  /**
   * Eingeschossig (Hiraya): Dach direkt auf dem Laden, keine Auskragung. Ein Viertel
   * der Wohnhäuser — mit lauter Zweigeschossern lag die Traufe über 280 m auf einer Linie.
   */
  low?: boolean;
}
export interface KisoResult {
  /** Oberkante der Wand (für Kollision) und Firsthöhe. */
  wallH: number; top: number;
  /** Tür-Mitte (lokales x) — dorthin kommt die Trittplatte über die Rinne. */
  doorX: number;
  /** Wie weit Obergeschoss und Traufe vor die Front ragen (für Kollision und Laternenmasten). */
  over: number;
  /** Rauchquelle (lokal), falls das Haus einen Herd hat. */
  smoke: [number, number, number] | null;
}

/**
 * Das Kiso-Haus. Zwei Geschosse: Laden bzw. Doma unten (0…2,95), Wohn- und
 * Gästeräume oben (3,0…5,4), vorn um `dashi` auskragend.
 */
export function kisoHouse(p: Parts, s: KisoSpec): KisoResult {
  if (s.kind === 'kura') return kisoKura(p, s);
  const { w, d, role, r } = s, hw = w / 2, hd = d / 2;
  // Holz: meist fast schwarz, jedes vierte Haus unbehandelt silbergrau (wie in Narai);
  // Putz: weiß oder Lehm. Gleiche Töne auf 42 Häusern lasen sich als Serie.
  const low = !!s.low;
  const wood = r() < 0.25 ? jitter(0x514539, r, 0.08) : WOOD[Math.floor(r() * WOOD.length)]!;
  const pl = r() < 0.22 ? 0xcbb996 : PLASTER;
  const tsuma = s.kind === 'tsuma' && !low;
  const dashi = low ? 0 : 0.45 + r() * 0.45, zf = hd, zu = hd + dashi;
  const Y1 = low ? 3.0 : 5.35 + (r() < 0.3 ? 0.35 : 0) + (r() < 0.15 ? 0.45 : 0);
  const roofColor = s.roof === 'kawara' ? (r() < 0.25 ? 0x5a3a30 : KAWARA) : s.roof === 'ishi' ? SHINGLE : SHEETS[Math.floor(r() * SHEETS.length)]!;
  const pentType: KisoRoof = r() < 0.5 ? s.roof : (['kawara', 'ishi', 'sheet'] as const)[Math.floor(r() * 3)]!;
  const pentColor = pentType === 'kawara' ? KAWARA : pentType === 'ishi' ? SHINGLE : SHEETS[Math.floor(r() * SHEETS.length)]!;
  const hasPent = !low && (r() < 0.7 || role !== 'home');
  const balcony = !tsuma && !low && r() < 0.32;
  const udatsu = !tsuma && !low && r() < 0.24;
  const sodekabe = !udatsu && r() < 0.5;
  const interior = INTERIOR[role];

  // Sockel: Flusssteine, darüber der Schwellbalken.
  // Die Straße steigt 8 %: Nachbarn stehen bis 0,9 m versetzt, und der Sockel ist
  // an der Talseite der Fuge zu sehen — deshalb Steine auch auf den Seiten.
  const base = Math.max(0.5, s.base);
  p.mass.box(0, -base / 2, 0, w + 0.2, base, d + 0.2, 0x6f6b62);
  for (let row = 0; row * 0.34 < Math.min(base, 3.2); row++) {
    const y = -0.18 - row * 0.34, off = (row % 2) * 0.24;
    for (let x = -hw + 0.2 + off; x < hw; x += 0.5) plate(p.fine, x + (r() - 0.5) * 0.06, y, hd + 0.105, 0.44, 0.3, 'z', 1, jitter(STONE, r, 0.2));
    // Rückseite auch: die Talhäuser zeigen sie der Hintergasse (dort war der Sockel eine glatte graue Fläche).
    for (let x = -hw + 0.2 + off; x < hw; x += 0.5) plate(p.fine, x, y, -hd - 0.105, 0.44, 0.3, 'z', -1, jitter(STONE, r, 0.2));
    for (const e of [-1, 1] as const) for (let z = -hd + 0.2 + off; z < hd; z += 0.55) plate(p.fine, e * (hw + 0.105), y, z, 0.5, 0.3, 'x', e, jitter(STONE, r, 0.2));
  }
  // Körper: Erdgeschoss, Obergeschoss mit Auskragung.
  p.mass.box(0, 1.5, 0, w, 3.0, d, wood);
  if (!low) p.mass.box(0, (3.0 + Y1) / 2, dashi / 2, w, Y1 - 3.0, d + dashi, wood);
  // Seitenwände: Bretter unten, im Obergeschoss oft Putz mit Pfosten.
  const plasterUp = r() < 0.55;
  for (const e of [-1, 1] as const) {
    const x = e * hw;
    for (let z = -hd + 0.14; z < zf; z += 0.28) plate(p.fine, x + e * 0.03, 1.5, z, 0.26, 2.9, 'x', e, jitter(wood, r, 0.12));
    if (low) { /* kein Obergeschoss */ } else if (plasterUp) {
      plate(p.detail, x + e * 0.02, (3.1 + Y1) / 2, dashi / 2, d + dashi - 0.3, Y1 - 3.25, 'x', e, jitter(PLASTER_OLD, r, 0.04));
      for (let z = -hd; z <= zu + 0.01; z += (d + dashi) / Math.max(2, Math.round((d + dashi) / 1.8))) p.detail.box(x + e * 0.05, (3.0 + Y1) / 2, z, 0.08, Y1 - 3.0, 0.14, BEAM);
    } else for (let z = -hd + 0.14; z < zu; z += 0.28) plate(p.fine, x + e * 0.03, (3.0 + Y1) / 2, z, 0.26, Y1 - 3.05, 'x', e, jitter(shade(wood, 1.08), r, 0.12));
    if (!low) p.detail.box(x + e * 0.06, 3.05, dashi / 2, 0.1, 0.2, d + dashi, BEAM);
  }
  // Rückseite: Bretter, zwei kleine Fenster, Klimagerät, Gasflaschen.
  for (let x = -hw + 0.14; x < hw; x += 0.28) plate(p.fine, x, Y1 / 2, -hd - 0.03, 0.26, Y1 - 0.1, 'z', -1, jitter(wood, r, 0.12));
  const backY = low ? 1.9 : 4.2;
  for (const x of [-hw * 0.5, hw * 0.4]) { p.detail.box(x, backY, -hd - 0.05, 1.0, 0.8, 0.06, BEAM); tilePlate(r() < s.lit ? p.signGlow : p.sign, tile(r() < s.lit ? T.shojiWarm : T.shoji, 0, 0, 160, 128), x, backY, -hd - 0.09, 0.86, 0.66, 'z', -1); }

  // ── Erdgeschoss-Front ──
  const B = bays(w, role, r), bw = w / B.length;
  let doorX = 0;
  for (let i = 0; i <= B.length; i++) p.detail.box(-hw + i * bw, 1.5, zf + 0.06, 0.16, 3.0, 0.14, BEAM);
  p.detail.box(0, 0.2, zf + 0.07, w, 0.2, 0.14, BEAM);
  p.detail.box(0, 2.2, zf + 0.07, w, 0.16, 0.12, BEAM);
  p.detail.box(0, 2.88, zf + 0.07, w, 0.22, 0.14, BEAM);
  const transomWhite = r() < 0.45;
  B.forEach((b, i) => {
    const x = -hw + (i + 0.5) * bw, iw = bw - 0.18;
    // Oberlicht zwischen Türsturz und Balken: weißer Putz oder dunkle Bretter.
    plate(p.detail, x, 2.54, zf + 0.03, iw, 0.5, 'z', 1, transomWhite ? jitter(pl, r, 0.04) : shade(wood, 0.85));
    if (b === 'door') {
      doorX = x;
      slidingDoor(p, x, iw, 2.0, zf, interior, r);
    } else if (b === 'koshi') {
      kisoKoshi(p, x, 0.34, 2.12, zf, iw, r() < s.lit + 0.25, r);
    } else if (b === 'open') {
      tilePlate(p.signGlow, tile(interior), x, 1.18, zf - 0.3, iw, 1.9, 'z', 1);
      // Auslage: Tisch mit Waren; der Laden steht bei Tag offen.
      p.detail.box(x, 0.42, zf + 0.35, iw - 0.1, 0.08, 0.8, 0x6a5038);
      for (const dx of [-iw / 2 + 0.15, iw / 2 - 0.15]) { const gy = s.street ? s.street(x + dx) : 0; p.detail.box(x + dx, (gy + 0.4) / 2, zf + 0.35, 0.08, 0.4 - gy, 0.7, 0x4a3828); }
      goods(p, x, 0.46, zf + 0.35, iw - 0.2, role, r);
    } else if (b === 'itado') {
      for (let u = -iw / 2 + 0.11; u < iw / 2; u += 0.22) plate(p.detail, x + u, 1.2, zf + 0.04, 0.2, 1.84, 'z', 1, jitter(shade(wood, 1.15), r, 0.1));
      p.detail.box(x, 1.2, zf + 0.07, iw, 0.06, 0.03, BEAM);
    } else if (b === 'glass') {
      const lit = r() < s.lit;
      for (let k = 0; k < 2; k++) {
        const cx = x - iw / 4 + k * iw / 2;
        if (lit) tilePlate(p.signGlow, tile(T.room2), cx, 1.25, zf + 0.02, iw / 2 - 0.1, 1.6, 'z', 1);
        else p.glass.box(cx, 1.25, zf + 0.03, iw / 2 - 0.1, 1.6, 0.02, 0x2a3136);
        p.detail.box(cx, 1.25, zf + 0.06, iw / 2 - 0.04, 1.68, 0.04, 0x3a2c20);
        p.detail.box(cx, 1.25, zf + 0.08, iw / 2 - 0.1, 0.04, 0.02, 0x3a2c20);
      }
      p.detail.box(x, 0.3, zf + 0.04, iw, 0.2, 0.05, shade(wood, 0.9));
    } else {
      for (let u = -iw / 2 + 0.13; u < iw / 2; u += 0.26) plate(p.fine, x + u, 1.2, zf + 0.03, 0.25, 1.9, 'z', 1, jitter(wood, r, 0.12));
      p.detail.box(x, 1.7, zf + 0.06, 0.7, 0.4, 0.05, BEAM);
      tilePlate(p.sign, tile(T.shoji, 0, 0, 200, 128), x, 1.7, zf + 0.09, 0.58, 0.3, 'z', 1);
    }
  });

  // ── Auskragung: Balkenköpfe (Dashigeta) unter dem Obergeschoss ──
  if (!low) for (let i = 0; i <= B.length; i++) {
    const x = -hw + i * bw;
    p.detail.box(x, 3.05, (zf + zu) / 2 + 0.08, 0.15, 0.2, dashi + 0.2, BEAM);
    p.detail.box(x, 3.0, zu + 0.2, 0.15, 0.1, 0.12, 0x2a2018, 0.6);
  }
  if (!low) {
    p.mass.box(0, 3.06, zu - 0.04, w, 0.24, 0.12, BEAM);
    // Untersicht der Auskragung, dunkel.
    p.detail.box(0, 2.99, (zf + zu) / 2, w - 0.05, 0.02, dashi, 0x1d1712);
  }

  // ── Obergeschoss-Front ──
  const upH = Y1 - 3.2, upY0 = 3.2;
  if (!low) for (let i = 0; i <= B.length; i++) p.detail.box(-hw + i * bw, (upY0 + Y1) / 2, zu + 0.05, 0.14, upH, 0.12, BEAM);
  if (!low) p.detail.box(0, Y1 - 0.12, zu + 0.06, w, 0.22, 0.12, BEAM);
  if (!low) B.forEach((_, i) => {
    const x = -hw + (i + 0.5) * bw, iw = bw - 0.16, roll = r();
    // Putzstreifen über den Fenstern — die weiße Linie, die man in Magome von weitem sieht.
    plate(p.detail, x, Y1 - 0.47, zu + 0.02, iw, 0.5, 'z', 1, jitter(pl, r, 0.035));
    const wy0 = upY0 + 0.25, wy1 = Y1 - 0.75;
    if (balcony || roll < 0.45) {
      // Shōji hinter dem Geländer bzw. hinter Glas.
      const lit = r() < s.lit;
      tilePlate(lit ? p.signGlow : p.sign, tile(lit ? T.shojiWarm : T.shoji, 0, 0, Math.min(256, Math.round(128 * iw / (wy1 - wy0))), 128), x, (wy0 + wy1) / 2, zu + 0.03, iw, wy1 - wy0, 'z', 1);
      for (let k = 1; k < 3; k++) p.detail.box(x - iw / 2 + k * iw / 3, (wy0 + wy1) / 2, zu + 0.06, 0.05, wy1 - wy0, 0.04, BEAM);
    } else if (roll < 0.8) {
      kisoKoshi(p, x, wy0, wy1, zu - 0.02, iw, r() < s.lit, r);
    } else {
      plate(p.detail, x, (wy0 + wy1) / 2, zu + 0.02, iw, wy1 - wy0, 'z', 1, jitter(pl, r, 0.04));
      p.detail.box(x, (wy0 + wy1) / 2 + 0.1, zu + 0.05, 0.9, 0.55, 0.05, BEAM);
      tilePlate(r() < s.lit ? p.signGlow : p.sign, tile(r() < s.lit ? T.shojiWarm : T.shoji, 0, 0, 200, 128), x, (wy0 + wy1) / 2 + 0.1, zu + 0.08, 0.76, 0.42, 'z', 1);
    }
    plate(p.detail, x, upY0 + 0.12, zu + 0.02, iw, 0.22, 'z', 1, shade(wood, 0.9));
  });
  if (balcony) {
    // Geländer (Narai): Handlauf, Brüstung, dichte Stäbe auf den verlängerten Balkenköpfen.
    const bz = zu + 0.42, by = upY0;
    p.detail.box(0, by - 0.02, zu + 0.22, w - 0.1, 0.06, 0.46, shade(wood, 1.1));
    p.detail.box(0, by + 0.86, bz, w - 0.1, 0.07, 0.09, BEAM);
    p.detail.box(0, by + 0.12, bz, w - 0.1, 0.08, 0.08, BEAM);
    for (let x = -hw + 0.12; x < hw - 0.05; x += 0.13) plate(p.fine, x, by + 0.48, bz + 0.03, 0.045, 0.7, 'z', 1, BEAM);
    for (let i = 0; i <= B.length; i++) p.detail.box(-hw + i * bw, by + 0.45, bz, 0.09, 0.9, 0.09, BEAM);
    // Wäsche oder ein Futon über dem Geländer — bewohnt.
    if (r() < 0.5) {
      // Futon über dem Geländer: zwei Lagen (vorn und hinten), gemustert — ein weißes
      // Rechteck las sich im ersten Bild als leeres Schild.
      const fx = (r() - 0.5) * (w - 3), col = [0x6a7fa8, 0xa8584a, 0xc8b08a, 0x5a7a6a][Math.floor(r() * 4)]!;
      p.cloth.add(new PlaneGeometry(1.6, 0.7), col, fx, by + 0.52, bz + 0.07);
      p.cloth.add(new PlaneGeometry(1.6, 0.35), shade(col, 0.85), fx, by + 0.72, bz - 0.06);
      for (let k = 0; k < 4; k++) p.detail.box(fx - 0.6 + k * 0.4, by + 0.5, bz + 0.085, 0.05, 0.6, 0.005, shade(col, 1.25));
    }
  }
  if (sodekabe) for (const e of [-1, 1] as const) {
    const x = e * (hw - 0.1);
    p.mass.box(x, (3.0 + Y1) / 2, zu + 0.26, 0.18, Y1 - 3.0, 0.56, pl);
    p.detail.box(x, Y1 + 0.04, zu + 0.26, 0.26, 0.1, 0.64, BEAM);
    p.detail.box(x, 3.02, zu + 0.26, 0.24, 0.12, 0.62, BEAM);
  }

  // ── Pultdach über dem Laden ──
  if (low) { /* die Traufe des Hauptdachs deckt den Laden */ } else if (hasPent) pent(p, -hw, hw, zf + 0.1, 2.93, 0.9 + r() * 0.2, pentType, pentColor, r);
  else p.detail.box(0, 2.76, zf + 0.12, w, 0.3, 0.05, shade(wood, 0.8));

  // ── Hauptdach ──
  let top: number;
  let eaveY: number;
  const pitch = s.roof === 'kawara' ? 0.44 : s.roof === 'ishi' ? 0.33 : 0.38;
  const eave = low ? 0.95 : s.roof === 'ishi' ? 1.25 : 1.1;
  if (!tsuma) {
    const res = roofX(p, { x0: -hw, x1: hw, zA: -hd, zB: zu, y: Y1, pitch, eaveA: 0.7, eaveB: eave, over: 0.45, type: s.roof, color: roofColor, r, tsuma: r() < 0.6 ? PLASTER : shade(wood, 1.05), gutter: s.roof !== 'ishi' && r() < 0.8, rafters: true });
    top = res.ridge; eaveY = res.eaveY;
  } else {
    // Giebel zur Straße: Dach im gedrehten Teilesatz bauen, um 90° einsetzen
    // (x_t = −z, z_t = x), der Straßengiebel liegt dann bei x_t = −zu.
    const tmp = new Parts();
    const res = roofX(tmp, { x0: -zu, x1: hd, zA: -hw, zB: hw, y: Y1, pitch: pitch + 0.08, eaveA: 0.75, eaveB: 0.75, over: 0.8, type: s.roof, color: roofColor, r, tsuma: PLASTER, showGable: true, gutter: false, rafters: false });
    place(tmp, p, 0, 0, 0, Math.PI / 2);
    top = res.ridge; eaveY = Y1;
  }
  if (udatsu) for (const e of [-1, 1] as const) {
    // Udatsu (Unno-juku): Brandmauer am Hausende, durch das Dach hindurch, mit Ziegelkappe.
    const x = e * (hw + 0.12), rise = Math.tan(pitch) * (zu + hd) / 2, zr = (zu - hd) / 2;
    const prof: [number, number][] = [[-hd - 0.3, Y1 - 0.4], [zu + 0.55, Y1 - 0.4], [zu + 0.55, Y1 + 0.35], [zr, Y1 + rise + 0.75], [-hd - 0.3, Y1 + 0.35]];
    const tmp = new Parts();
    for (let i = 1; i < prof.length - 1; i++) { /* Fächer, beide Seiten */
      for (const f of [-1, 1] as const) polyFacing(tmp.mass, [[f * 0.14, prof[0]![1], prof[0]![0]], [f * 0.14, prof[i]![1], prof[i]![0]], [f * 0.14, prof[i + 1]![1], prof[i + 1]![0]]], PLASTER, [f, 0, 0]);
    }
    place(tmp, p, x, 0, 0, 0);
    // Kappen entlang der Oberkanten.
    for (const [[za, ya], [zb, yb]] of [[prof[2]!, prof[3]!], [prof[3]!, prof[4]!]] as const) {
      const len = Math.hypot(zb - za, yb - ya);
      p.detail.box(x, (ya + yb) / 2 + 0.08, (za + zb) / 2, 0.42, 0.12, len + 0.1, KAWARA_UDATSU, -Math.atan2(yb - ya, zb - za));
    }
    p.mass.box(x, (3.0 + Y1) / 2, zu + 0.35, 0.28, Y1 - 3.0, 0.4, PLASTER);
    p.detail.box(x, Y1 + 0.42, zu + 0.5, 0.4, 0.14, 0.5, KAWARA_UDATSU);
  }

  // ── Schilder, Laternen, Kram ──
  const sign = SIGN[role], door = doorX;
  if (sign >= 0) {
    // Querbrett über dem Laden (auf dem Pultdach bzw. am Obergeschoss).
    const sw = Math.min(low ? 1.8 : 2.6, w * 0.34), sy = hasPent ? 3.55 : low ? 2.5 : 2.55, sz = hasPent ? zu + 0.1 : zf + 0.12;
    p.detail.box(door, sy, sz, sw + 0.16, sw / 2 + 0.16, 0.06, BEAM);
    tilePlate(p.sign, tile(role === 'inn' ? [T.inn1, T.inn2, T.inn3][Math.floor(r() * 3)]! : sign), door, sy, sz + 0.04, sw, sw / 2, 'z', 1);
  }
  // Senkrechtes Hängeschild neben der Tür (wie „松代屋“ im Referenzbild), oder Namensschild.
  if (role === 'inn' || role === 'waki' || role === 'soba' || role === 'sake') {
    const hx = door + (door > 0 ? -1 : 1) * (bw / 2 + 0.05);
    p.detail.box(hx, 1.45, zf + 0.2, 0.62, 1.5, 0.06, BEAM);
    portrait(p.sign, tile(role === 'soba' || role === 'sake' ? T.hanging2 : T.hanging1, 0, 0, 256, 128), hx, 1.45, zf + 0.24, 0.52, 1.38, 'z', 1);
  } else if (role === 'home') {
    const n = Math.floor(r() * 8);
    tilePlate(p.sign, tile(T.plates, (n % 4) * 64, Math.floor(n / 4) * 64, (n % 4) * 64 + 64, Math.floor(n / 4) * 64 + 64), door + bw / 2 - 0.1, 1.6, zf + 0.15, 0.24, 0.24, 'z', 1);
  }
  // Noren über der Tür.
  if (role !== 'home' || r() < 0.4) {
    const nt = role === 'soba' ? T.noren3 : role === 'inn' || role === 'waki' ? T.noren2 : T.noren1, nw = bw - 0.3;
    p.detail.box(door, 2.1, zf + 0.16, nw + 0.2, 0.04, 0.04, BEAM);
    for (let k = 0; k < 3; k++) {
      const g = new PlaneGeometry(nw / 3 - 0.03, 0.9, 1, 2), t = tile(nt, k * 85, 0, k * 85 + 85, 128), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
      p.sign.add(g, 0xffffff, door - nw / 2 + (k + 0.5) * nw / 3, 1.64, zf + 0.18);
    }
  }
  // Laternen: Gasthöfe ein Paar, Schenke und Teestube eine.
  if (role === 'inn' || role === 'waki') for (const e of [-1, 1]) chochin(p, door + e * (bw / 2 - 0.1), 2.35, zf + 0.62, tile(T.lanternInn), 0.19, 0.52);
  else if (role === 'sake' || role === 'soba' || role === 'gohei' || role === 'sweets') chochin(p, door + bw / 2 - 0.1, 2.35, zf + 0.62, tile(role === 'sake' ? T.lanternSake : T.lanternTea), 0.2, 0.55);
  // Hängelampe quer zur Front (Tsuri-andon): leuchtet die Straße hinunter.
  if (role !== 'home' && r() < 0.7) {
    const lx = door + (r() < 0.5 ? -1 : 1) * (bw + 0.1), lz = zf + 0.95;
    p.detail.box(lx, 2.72, zf + 0.5, 0.05, 0.05, 0.95, BEAM);
    p.detail.box(lx, 2.52, lz, 0.3, 0.06, 0.46, BEAM); p.detail.box(lx, 2.02, lz, 0.3, 0.06, 0.46, BEAM);
    const t = tile(SIGN[role] >= 0 ? SIGN[role] : T.andon, 64, 0, 192, 128);
    for (const f of [-1, 1]) tilePlate(p.signGlow, t, lx + f * 0.13, 2.27, lz, 0.4, 0.44, 'x', f);
    tilePlate(p.signGlow, tile(T.andon, 0, 0, 64, 128), lx, 2.27, lz + 0.22, 0.24, 0.44, 'z', 1);
  }
  if (role === 'sake') {
    // Sugidama: die Zedernkugel des Brauers, frisch grün im Herbst.
    p.detail.box(door - bw * 0.8, 2.55, zf + 0.55, 0.03, 0.4, 0.03, 0x2a2018);
    const g = new SphereGeometry(0.42, 12, 9), t = tile(T.sugidama), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
    p.sign.add(g, 0xffffff, door - bw * 0.8, 2.08, zf + 0.55);
    for (let i = 0; i < 2; i++) p.detail.add(new CylinderGeometry(0.28, 0.3, 0.55, 12), 0x8a6a44, door + bw * 0.9 + i * 0.62, (s.street ? s.street(door + bw * 0.9 + i * 0.62) : 0) + 0.28, zf + 0.5);
  }

  // Straßenkram vor dem Haus: Pflanzen, Schilfmatten, Bank, Holz — auf dem Gehweg.
  const g = (x: number): number => s.street ? s.street(x) : 0;
  // Trittsteine zur Tür setzt KisoJuku: nur es kennt die Höhe des Gehwegs davor.
  const spots = B.map((_, i) => -hw + (i + 0.5) * bw).filter(x => Math.abs(x - door) > bw * 0.6);
  for (const x of spots) {
    const roll = r();
    if (roll < 0.28) for (let k = 0; k < 1 + Math.floor(r() * 3); k++) pottedPlant(p, x + (k - 1) * 0.42, g(x + (k - 1) * 0.42), zf + 0.35 + (k % 2) * 0.15, r);
    else if (roll < 0.42) {
      // Yoshizu: Schilfmatte, schräg an die Wand gelehnt.
      tilePlate(p.sign, tile(T.sudare), x, g(x) + 1.02, zf + 0.34, Math.min(1.5, bw - 0.2), 2.05, 'z', 1, 0xffffff, -0.16);
      tilePlate(p.sign, tile(T.sudare), x, g(x) + 1.02, zf + 0.33, Math.min(1.5, bw - 0.2), 2.05, 'z', -1, 0xc8c0b0, 0.16);
    } else if (roll < 0.52 && (role === 'soba' || role === 'sweets' || role === 'gohei' || role === 'inn')) bench(p, x, g(x), zf + 0.62, 'x', role === 'sweets' && r() < 0.8);
    else if (roll < 0.62) firewood(p, x, g(x), zf + 0.35, Math.min(1.5, bw - 0.2), 0.9 + r() * 0.5, 'x', 1, r);
    else if (roll < 0.68) {
      // Holzeimer und Schöpfkelle (Tenbōsui: Löschwasser vor dem Haus).
      p.detail.add(new CylinderGeometry(0.22, 0.18, 0.36, 10), 0x7a5a3a, x, g(x) + 0.18, zf + 0.35);
      p.detail.add(new CylinderGeometry(0.2, 0.2, 0.02, 10), 0x3e5a5a, x, g(x) + 0.33, zf + 0.35);
    }
  }
  if (role === 'gohei' || role === 'sweets' || role === 'soba') {
    // Tafel auf dem Gehweg.
    const mx = door + (door > 0 ? -1.1 : 1.1);
    for (const f of [-1, 1]) { p.detail.box(mx, g(mx) + 0.52, zf + 0.9 + f * 0.14, 0.62, 1.0, 0.04, 0x4a3828, f * 0.14); tilePlate(p.sign, tile(T.menu), mx, g(mx) + 0.6, zf + 0.9 + f * 0.17, 0.56, 0.44, 'z', f, 0xffffff, f * 0.14); }
  }
  if (role === 'post') {
    const py = g(door + 1.3);
    p.detail.box(door + 1.3, py + 0.72, zf + 0.6, 0.42, 1.2, 0.42, 0xc8201c);
    p.detail.box(door + 1.3, py + 1.38, zf + 0.6, 0.48, 0.12, 0.48, 0xa81a16);
    tilePlate(p.sign, tile(T.postbox), door + 1.3, py + 1.0, zf + 0.82, 0.38, 0.19, 'z', 1);
  }
  if (role === 'shop' && r() < 0.8) {
    // Automat im Holzkleid — in Tsumago steht keiner ohne Verkleidung.
    const vx = -hw + 0.7;
    const vy = g(vx);
    p.mass.box(vx, vy + 0.92, zf + 0.5, 0.95, 1.84, 0.8, 0x4a3626);
    tilePlate(p.signGlow, tile(T.vendWood), vx, vy + 1.1, zf + 0.91, 0.86, 1.3, 'z', 1);
  }
  // Hoshigaki: Schnüre getrockneter Kaki unter der Auskragung — Herbst im Kiso-Tal.
  if (role === 'home' && r() < 0.4) {
    for (let x = -hw + 0.6; x < -hw + 0.6 + Math.min(3.2, w * 0.4); x += 0.3) {
      const n = 5 + Math.floor(r() * 4);
      p.detail.box(x, 2.95 - n * 0.07, zf + 0.32, 0.012, n * 0.14, 0.012, 0x8a7a60);
      for (let j = 0; j < n; j++) p.detail.box(x, 2.85 - j * 0.14, zf + 0.32, 0.08, 0.09, 0.08, jitter(0xc85a1c, r, 0.14));
    }
  }
  // Fahrrad an der Wand, ab und zu.
  if (r() < 0.22 && spots.length) bicycle(p, spots[0]! + 0.3, g(spots[0]! + 0.3), zf + 0.28);
  // Fallrohr an einer Ecke.
  if (s.roof !== 'ishi') { const g = new CylinderGeometry(0.045, 0.045, eaveY - 0.1, 6); p.detail.add(g, COPPER, hw - 0.12, (eaveY - 0.1) / 2, zu + eave - 0.1); }
  // Hinten: Klimagerät, Propangas, Stromzähler.
  p.detail.box(hw * 0.3, 1.1, -hd - 0.2, 0.8, 0.55, 0.3, 0xd9d8d1);
  for (let k = 0; k < 2; k++) p.detail.add(new CylinderGeometry(0.17, 0.17, 1.25, 10), 0xc8c4b8, -hw * 0.6 + k * 0.4, 0.63, -hd - 0.22);
  tilePlate(p.sign, tile(T.meter, 0, 0, 128, 128), hw - 0.5, 1.6, -hd - 0.07, 0.3, 0.3, 'z', -1);

  const smoke: [number, number, number] | null = role !== 'post' && role !== 'shop' && r() < 0.45 ? [(r() - 0.5) * w * 0.5, top - 0.2, -hd * 0.3] : null;
  return { wallH: Y1, top, doorX, over: dashi + eave, smoke };
}
const KAWARA_UDATSU = 0x3a4046;

/** Fahrrad (Mamachari) längs an die Wand gelehnt: zwei Räder, Rahmen, Korb. */
export function bicycle(p: Parts, x: number, y: number, z: number): void {
  const c = [0x3a5a7a, 0x8a2a2a, 0xc8c4b8, 0x2a2a2a][Math.floor(Math.abs(x * 7.3) % 4)]!;
  for (const dx of [-0.52, 0.52]) {
    p.detail.add(new TorusGeometry(0.31, 0.022, 4, 16), 0x1a1a1a, x + dx, y + 0.33, z);
    p.detail.box(x + dx, y + 0.33, z, 0.05, 0.05, 0.06, 0x8a8a86);
  }
  p.detail.box(x, y + 0.5, z, 0.9, 0.04, 0.04, c, 0, 0, 0.35);
  p.detail.box(x - 0.18, y + 0.55, z, 0.04, 0.5, 0.04, c, 0, 0, -0.3);
  p.detail.box(x + 0.4, y + 0.62, z, 0.04, 0.6, 0.04, c, 0, 0, 0.25);
  p.detail.box(x - 0.26, y + 0.84, z, 0.22, 0.06, 0.12, 0x1a1a1a);
  p.detail.box(x + 0.5, y + 0.94, z, 0.04, 0.04, 0.5, 0x8a8a86);
  p.detail.box(x + 0.66, y + 0.82, z, 0.26, 0.2, 0.3, 0x8a8a86);
}

/** Waren auf der Auslage — je Laden das Seine. */
function goods(p: Parts, x: number, y: number, z: number, w: number, role: KisoRole, r: Rng): void {
  for (let u = -w / 2 + 0.15; u < w / 2 - 0.1; u += 0.3) {
    const k = r();
    if (role === 'lacquer' || role === 'crafts') {
      // Lackschalen (rot/schwarz) und Holzkämme.
      const g = new SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.rotateX(Math.PI);
      p.detail.add(g, k < 0.5 ? 0xa11d16 : 0x1a1412, x + u, y + 0.1, z + (r() - 0.5) * 0.4);
    } else if (role === 'sake') {
      p.detail.add(new CylinderGeometry(0.05, 0.06, 0.32, 7), [0x2a5a3a, 0x6a2a1a, 0x1a2a4a][Math.floor(k * 3)]!, x + u, y + 0.16, z + (r() - 0.5) * 0.4);
    } else if (role === 'gohei') {
      // Spieße auf dem Grill, der glüht.
      p.glow.box(x + u, y + 0.03, z, 0.26, 0.04, 0.5, 0xff8a3a);
      for (let j = 0; j < 2; j++) p.detail.box(x + u - 0.06 + j * 0.12, y + 0.1, z, 0.06, 0.04, 0.22, 0xb07a3e);
    } else {
      p.detail.box(x + u, y + 0.08, z + (r() - 0.5) * 0.35, 0.22, 0.16, 0.18, [0xd8c8a0, 0xb3261e, 0x4a6a8a, 0x6a8a3a, 0xe8e0d0][Math.floor(k * 5)]!);
    }
  }
  // Strohhüte (Sugegasa) an einem Haken über der Auslage — die Pilger kaufen sie hier.
  if (role === 'shop' || role === 'crafts') for (let i = 0; i < 3; i++) p.detail.add(new ConeGeometry(0.28, 0.14, 12), 0xc9ad6c, x - w / 3 + i * w / 3, 1.95, z - 0.28, Math.PI / 2 - 0.1);
}

/** Kura an der Straße: weißer Putz, dunkle Bretter unten, Tür zur Straße. */
function kisoKura(p: Parts, s: KisoSpec): KisoResult {
  const tmp = new Parts(); const res = gasshoKura(tmp, s.w, s.d, s.r);
  // Die Gassho-Kura hat die Tür auf +x und den First entlang z; um −90° gedreht
  // schaut die Tür zur Straße (+z) und der First läuft mit ihr.
  place(tmp, p, 0, 0, 0, -Math.PI / 2);
  const base = Math.max(0.5, s.base);
  p.mass.box(0, -base / 2, 0, s.d + 0.3, base, s.w + 0.3, 0x6f6b62);
  return { wallH: res.wallH, top: res.top, doorX: 0, over: 0.6, smoke: null };
}

// ── Honjin ───────────────────────────────────────────────────────────────────

export interface Walk {
  /** Begehbare Flächen: [u0, v0, u1, v1, y] (lokal, rechteckig). */
  floors: [number, number, number, number, number][];
  /** Wände mit Kollision: [u0, v0, u1, v1, y0, y1]. */
  walls: [number, number, number, number, number, number][];
}

/**
 * Der Honjin: Straßenmauer mit Tor, Vorhof, Haupthaus mit Innenraum.
 * Lokal: Mauerlinie bei z = 0, Straße auf +z, das Grundstück nach −z.
 * `houseZ` Mitte des Haupthauses (negativ), `yard` Höhe des Hofs über y = 0
 * (Gehweg). Die Innenräume liegen in `interior`/`interiorTex` (aufgehellt).
 */
export function honjin(p: Parts, W: number, houseW: number, houseD: number, houseZ: number, yard: number, r: Rng): Walk {
  const walk: Walk = { floors: [], walls: [] };
  const hw = W / 2, back = houseZ - houseD / 2 - 2.5, gate = 2.1;
  // ── Straßenmauer (Neribei): Steinsockel, weißer Putz, Ziegelkappe ──
  const wallSeg = (x0: number, x1: number, z0: number, z1: number): void => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const bx = alongX ? len : 0.4, bz = alongX ? 0.4 : len;
    p.mass.box(cx, -0.1, cz, bx + 0.1, 1.0, bz + 0.1, 0x6f6b62);
    p.mass.box(cx, 1.4, cz, bx, 2.0, bz, PLASTER);
    p.mass.box(cx, 0.7, cz, bx + 0.04, 0.6, bz + 0.04, 0x3a2c22);
    const roofSpec = { w: alongX ? len + 0.2 : 0.4, d: alongX ? 0.4 : len + 0.2, y: 2.42, pitch: 0.5, eave: 0.35, gableOver: 0.05, ridge: alongX ? 'x' as const : 'z' as const, color: KAWARA, tsuma: null, barge: BEAM };
    const tmp = new Parts(); gableRoof(tmp, roofSpec, r); place(tmp, p, cx, 0, cz, 0);
    for (let u = (alongX ? x0 : z0) + 0.3; u < (alongX ? x1 : z1); u += 0.55) {
      for (const f of [-1, 1] as const) {
        if (alongX) plate(p.fine, u, 0.0, cz + f * 0.26, 0.5, 0.34, 'z', f, jitter(STONE, r, 0.18));
        else plate(p.fine, cx + f * 0.26, 0.0, u, 0.5, 0.34, 'x', f, jitter(STONE, r, 0.18));
      }
    }
    walk.walls.push([x0, z0, x1, z1, -1, 2.7]);
  };
  wallSeg(-hw, -gate - 0.3, 0, 0); wallSeg(gate + 0.3, hw, 0, 0);
  wallSeg(-hw, -hw, back, 0); wallSeg(hw, hw, back, 0); wallSeg(-hw, hw, back, back);

  // ── Tor (Yakui-mon) ──
  const gh = 3.6;
  for (const e of [-1, 1]) {
    p.mass.box(e * gate, gh / 2, 0, 0.36, gh, 0.36, 0x2e241c);
    p.mass.box(e * gate, gh / 2 - 0.4, -1.3, 0.24, gh - 0.8, 0.24, 0x2e241c);
    p.detail.box(e * gate, 0.2, 0, 0.5, 0.4, 0.5, 0x8a877c);
    // Offene Torflügel nach innen.
    p.detail.box(e * (gate - 0.05) - e * 0.05, 1.55, -1.0, 0.1, 2.9, 1.9, 0x3a2c20, 0, e * 0.25);
    for (const y of [0.6, 1.5, 2.4]) p.detail.box(e * (gate - 0.15), y, -1.0, 0.04, 0.08, 1.9, 0x1a1410, 0, e * 0.25);
    walk.walls.push([e * gate - 0.2, -0.2, e * gate + 0.2, 0.2, -1, gh]);
  }
  p.mass.box(0, gh - 0.1, 0, 2 * gate + 0.5, 0.3, 0.32, 0x2e241c);
  p.detail.box(0, 3.12, 0, 2 * gate, 0.16, 0.2, 0x2e241c);
  { const tmp = new Parts(); gableRoof(tmp, { w: 2 * gate + 1.4, d: 3.0, y: gh + 0.05, pitch: 0.52, eave: 0.7, gableOver: 0.35, ridge: 'x', color: KAWARA, tsuma: 0x2e241c, barge: BEAM }, r); place(tmp, p, 0, 0, -0.6, 0); }
  // Schild über dem Tor, Maku darunter, Laternen.
  // Schild zwischen den Torbalken, unter der Traufe (darüber stieß es ins Dach).
  p.detail.box(0, 3.33, 0.22, 1.7, 0.46, 0.06, BEAM);
  tilePlate(p.sign, tile(T.honjin), 0, 3.33, 0.26, 1.54, 0.38, 'z', 1);
  {
    // Unterkante 2,5 m über dem Gehweg — auf der obersten Torstufe (+0,4) bleiben 2,1 m.
    // Die erste Fassung hing auf Augenhöhe, und die Kamera stand im Vorhang.
    const g = new PlaneGeometry(2 * gate - 0.3, 0.6, 6, 2), t = tile(T.maku), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1]));
    p.sign.add(g, 0xffffff, 0, 2.8, 0.2);
  }
  for (const e of [-1, 1]) chochin(p, e * (gate + 0.75), 2.6, 0.55, tile(T.lanternInn), 0.26, 0.7);
  // Stufen durch das Tor auf den Hof.
  const steps = Math.max(1, Math.ceil(yard / 0.2)), rise = yard / steps;
  for (let i = 0; i < steps; i++) {
    const top = rise * (i + 1), v0 = 0.8 - i * 0.45, v1 = v0 - 0.45;
    p.mass.box(0, top / 2 - 0.1, (v0 + v1) / 2, 2 * gate - 0.2, top + 0.2, 0.46, jitter(0x8f8b80, r, 0.05));
    walk.floors.push([-gate + 0.1, v1, gate - 0.1, v0, top]);
  }
  const yardFront = 0.8 - steps * 0.45;

  // ── Hof: Kies, Trittsteine, Laterne, Kiefer (Kiefer setzt das Dorf, sie braucht Gelände) ──
  const hx0 = -hw + 0.2, hx1 = hw - 0.2, hz1 = yardFront, hz0 = back + 0.2;
  p.mass.box(0, yard / 2 - 0.25, (hz0 + hz1) / 2, hx1 - hx0, yard + 0.5, hz1 - hz0, GRAVEL);
  walk.floors.push([hx0, hz0, hx1, hz1, yard]);
  // Harkenrillen im Kies.
  for (let z = hz1 - 0.3; z > houseZ + houseD / 2 + 0.6; z -= 0.28) p.fine.box(0, yard + 0.003, z, hx1 - hx0 - 1, 0.006, 0.03, 0x938c7e);
  for (let z = hz1 - 0.4; z > houseZ + houseD / 2 + 0.4; z -= 0.75) p.detail.box((r() - 0.5) * 0.3, yard + 0.04, z, 0.62, 0.08, 0.5, jitter(0x9c988c, r, 0.08));
  kasugaLantern(p, 3.6, yard, houseZ + houseD / 2 + 3.2, r);
  // Tsukubai: Steinbecken mit Bambusrohr.
  p.detail.add(new CylinderGeometry(0.34, 0.4, 0.45, 9), 0x7f7c74, -4.2, yard + 0.22, houseZ + houseD / 2 + 2.2);
  p.detail.add(new CylinderGeometry(0.26, 0.26, 0.02, 9), 0x3e5a5a, -4.2, yard + 0.44, houseZ + houseD / 2 + 2.2);
  p.detail.add(new CylinderGeometry(0.04, 0.04, 0.8, 6), 0x8a8a4a, -4.2, yard + 0.62, houseZ + houseD / 2 + 2.55, Math.PI / 2 - 0.2);
  for (let i = 0; i < 9; i++) pebble(p.detail, (r() - 0.5) * (hx1 - hx0 - 2), yard + 0.05, hz0 + 0.6 + r() * 1.8, 0.35 + r() * 0.3, 0x7a776e, r, 0.6);
  // Hecke an den Seitenmauern.
  for (const e of [-1, 1]) for (let z = hz1 - 1; z > houseZ + houseD / 2; z -= 1.2) { const g = new SphereGeometry(1, 7, 4); g.scale(0.55, 0.55, 0.75); p.mass.add(g, jitter(0x2f4a28, r, 0.08), e * (hw - 0.8), yard + 0.5, z); }

  // ── Haupthaus ──
  const H = 3.4, fw = houseW / 2, fz1 = houseZ + houseD / 2, fz0 = houseZ - houseD / 2, fl = yard + 0.5;
  // Sockel und Umfassung (hohl: Innenraum).
  p.mass.box(0, (yard + fl) / 2 - 0.1, houseZ, houseW + 0.4, fl - yard + 0.2, houseD + 0.4, 0x6f6b62);
  const wood = 0x33271e;
  const wallPanel = (x0: number, x1: number, z0: number, z1: number, face: V2, inside: V2): void => {
    const alongX = Math.abs(x1 - x0) > 0.01, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    p.mass.box(cx, fl + H / 2, cz, alongX ? len : 0.16, H, alongX ? 0.16 : len, wood);
    // Außen: Bretter unten, Putz oben mit Pfosten; innen: Putz und Balken (aufgehellt).
    const nb = Math.max(1, Math.round(len / 1.82));
    for (let i = 0; i <= nb; i++) {
      const u = (alongX ? x0 : z0) + i * len / nb;
      p.detail.box(alongX ? u : cx + face[0] * 0.1, fl + H / 2, alongX ? cz + face[1] * 0.1 : u, 0.16, H, 0.16, BEAM);
      p.interior.box(alongX ? u : cx + inside[0] * 0.1, fl + H / 2, alongX ? cz + inside[1] * 0.1 : u, 0.14, H, 0.14, 0x2a2018);
    }
    if (alongX) { plate(p.detail, cx, fl + 2.4, cz + face[1] * 0.09, len - 0.1, 1.6, 'z', face[1], PLASTER_OLD); plate(p.interior, cx, fl + 1.6, cz + inside[1] * 0.09, len - 0.1, 3.0, 'z', inside[1], 0xcfc2a2); }
    else { plate(p.detail, cx + face[0] * 0.09, fl + 2.4, cz, len - 0.1, 1.6, 'x', face[0], PLASTER_OLD); plate(p.interior, cx + inside[0] * 0.09, fl + 1.6, cz, len - 0.1, 3.0, 'x', inside[0], 0xcfc2a2); }
    walk.walls.push([x0, z0, x1, z1, yard - 0.5, fl + H]);
  };
  // Rückwand, Seitenwände; die Front ist offen bis auf Pfosten, Shōji und den Genkan.
  wallPanel(-fw, fw, fz0, fz0, [0, -1], [0, 1]);
  wallPanel(-fw, -fw, fz0, fz1, [-1, 0], [1, 0]);
  wallPanel(fw, fw, fz0, fz1, [1, 0], [-1, 0]);
  // Front: links (Doma) Wand mit Genkan-Öffnung, rechts Shōji, halb offen zur Engawa.
  const doorX0 = -2.2, doorX1 = 0.4;
  wallPanel(-fw, doorX0, fz1, fz1, [0, 1], [0, -1]);
  wallPanel(doorX0 - 0.01, doorX0, fz1, fz1, [0, 1], [0, -1]);
  p.mass.box((doorX0 + doorX1) / 2, fl + H - 0.4, fz1, doorX1 - doorX0, 0.8, 0.16, wood);
  p.mass.box((doorX1 + 2.5) / 2, fl + H / 2, fz1, 2.5 - doorX1, H, 0.16, wood);
  walk.walls.push([doorX1, fz1, 2.5, fz1, yard - 0.5, fl + H]);
  for (let x = 2.5; x < fw - 0.1; x += 1.5) {
    p.detail.box(x, fl + H / 2, fz1 + 0.08, 0.16, H, 0.16, BEAM);
    const open = x > 3.5 && x < fw - 2;
    if (!open) tilePlate(p.signGlow, tile(T.shojiWarm), x + 0.75, fl + 1.05, fz1, 1.36, 1.8, 'z', 1);
    else tilePlate(p.signGlow, tile(T.shojiWarm), x + 0.2, fl + 1.05, fz1 - 0.15, 1.36, 1.8, 'z', 1);
  }
  p.detail.box((2.5 + fw) / 2, fl + 2.05, fz1 + 0.08, fw - 2.5, 0.16, 0.16, BEAM);
  plate(p.detail, (2.5 + fw) / 2, fl + 2.7, fz1 + 0.06, fw - 2.5, 1.2, 'z', 1, PLASTER_OLD);
  walk.walls.push([2.5, fz1 + 1.1, fw, fz1 + 1.1, yard - 0.5, yard + 0.95]);
  // Engawa vor den Zimmern, mit Geländer.
  p.detail.box((2.5 + fw) / 2, fl - 0.05, fz1 + 0.55, fw - 2.5, 0.1, 1.1, 0x7a624a);
  for (let x = 2.8; x < fw; x += 1.2) p.detail.box(x, (yard + fl) / 2, fz1 + 1.05, 0.12, fl - yard, 0.12, BEAM);
  p.detail.box((2.5 + fw) / 2, fl + 0.45, fz1 + 1.08, fw - 2.5, 0.06, 0.06, BEAM);
  // ── Dach ──
  { const tmp = new Parts(); gableRoof(tmp, { w: houseW, d: houseD, y: fl + H + 0.1, pitch: 0.5, eave: 1.35, gableOver: 0.7, ridge: 'x', color: KAWARA, tsuma: PLASTER, barge: BEAM }, r); place(tmp, p, 0, 0, houseZ, 0); }
  // Genkan: Vordach mit eigenem Giebel über dem Eingang.
  { const tmp = new Parts(); gableRoof(tmp, { w: doorX1 - doorX0 + 1.4, d: 2.6, y: fl + 2.6, pitch: 0.6, eave: 0.5, gableOver: 0.45, ridge: 'z', color: KAWARA, tsuma: PLASTER, barge: BEAM }, r); place(tmp, p, (doorX0 + doorX1) / 2, 0, fz1 + 1.1, 0); }
  for (const x of [doorX0 - 0.5, doorX1 + 0.5]) p.mass.box(x, (yard + fl + 2.6) / 2, fz1 + 2.2, 0.24, fl + 2.6 - yard, 0.24, 0x2e241c);
  // Schuhstein vor dem Genkan (Doma liegt auf Hofhöhe + 5 cm).
  p.detail.box((doorX0 + doorX1) / 2, yard + 0.06, fz1 + 0.9, 1.6, 0.12, 0.9, 0x8f8b80);

  // ── Innenraum ──
  const doma = yard + 0.05;
  const I = p.interior, IT = p.interiorTex;
  // Doma (Lehmboden) vorn links: x −fw…0,4, z fz1−5…fz1.
  const domaZ0 = fz1 - 5.2, domaX1 = doorX1 + 0.9;
  I.box((-fw + domaX1) / 2, doma - 0.05, (domaZ0 + fz1) / 2, domaX1 + fw, 0.1, fz1 - domaZ0, 0x8a7458);
  // Gestampfter Lehm mit ein paar Steinen und einer Strohmatte.
  for (let i = 0; i < 14; i++) pebble(I, -fw + 0.5 + r() * (domaX1 + fw - 1), doma + 0.01, domaZ0 + 0.5 + r() * (fz1 - domaZ0 - 1), 0.12 + r() * 0.1, 0x8a8478, r, 0.3);
  I.box(-fw + 4.2, doma + 0.015, fz1 - 3.2, 1.8, 0.03, 0.9, 0xb49a62);
  walk.floors.push([-fw + 0.1, domaZ0, domaX1, fz1 - 0.1, doma]);
  // Erhöhter Boden überall sonst.
  I.box(0, fl - 0.05, (fz0 + domaZ0) / 2, houseW - 0.2, 0.1, domaZ0 - fz0, 0x7a5a3e);
  I.box((domaX1 + fw) / 2, fl - 0.05, (domaZ0 + fz1) / 2, fw - domaX1, 0.1, fz1 - domaZ0, 0x7a5a3e);
  // Dielen: helle und dunkle Bretter im Wechsel, poliert von zweihundert Jahren Socken.
  for (let x = -fw + 0.15; x < -fw + 5.3; x += 0.3) I.box(x, fl + 0.002, (fz0 + domaZ0) / 2, 0.28, 0.004, domaZ0 - fz0 - 0.2, jitter(0x80603f, r, 0.1));
  for (let x = domaX1 + 0.15; x < fw; x += 0.3) I.box(x, fl + 0.002, (domaZ0 + fz1) / 2, 0.28, 0.004, fz1 - domaZ0 - 0.2, jitter(0x80603f, r, 0.1));
  walk.floors.push([-fw + 0.1, fz0 + 0.1, fw - 0.1, domaZ0, fl], [domaX1, domaZ0, fw - 0.1, fz1 - 0.1, fl]);
  // Agari-kamachi: breite Holzstufe am Rand des Dielenbodens (0,45 m sind zu hoch für einen Schritt).
  I.box((-fw + domaX1) / 2, (doma + fl) / 2 - 0.02, domaZ0 + 0.28, domaX1 + fw - 0.2, fl - doma - 0.2, 0.5, 0x5a3e2c);
  I.box(domaX1 - 0.28, (doma + fl) / 2 - 0.02, (domaZ0 + fz1) / 2, 0.5, fl - doma - 0.2, fz1 - domaZ0 - 0.4, 0x5a3e2c);
  walk.floors.push([-fw + 0.2, domaZ0, domaX1, domaZ0 + 0.5, doma + 0.22], [domaX1 - 0.5, domaZ0, domaX1, fz1 - 0.2, doma + 0.22]);
  // Kamado (Lehmherd) an der linken Wand mit zwei Feuerlöchern.
  I.box(-fw + 0.7, doma + 0.4, fz1 - 2.2, 0.9, 0.8, 2.2, 0x8a6e52);
  for (const z of [fz1 - 1.6, fz1 - 2.8]) { p.glow.box(-fw + 1.16, doma + 0.3, z, 0.02, 0.22, 0.34, 0xff7a2a); I.add(new CylinderGeometry(0.3, 0.26, 0.28, 10), 0x1a1614, -fw + 0.7, doma + 0.94, z); }
  // Wasserfässer, Körbe, Strohmäntel an der Wand.
  for (let i = 0; i < 3; i++) I.add(new CylinderGeometry(0.32, 0.28, 0.75, 10), 0x6a4a2e, -fw + 0.6 + i * 0.7, doma + 0.37, fz1 - 4.3);
  for (let i = 0; i < 3; i++) I.add(new ConeGeometry(0.34, 0.9, 8), 0x9a8452, -fw + 2.6 + i * 0.8, doma + 1.8, fz1 - 0.3, 0.1);
  // Irori-Raum (links hinten): Bretterboden, versenkte Feuerstelle, Haken, Kessel.
  const irX = -fw + 3.2, irZ = fz0 + 3.0;
  I.box(irX, fl - 0.02, irZ, 1.4, 0.06, 1.4, 0x2a2420);
  I.box(irX, fl + 0.02, irZ, 1.6, 0.06, 0.12, 0x4a3426); I.box(irX, fl + 0.02, irZ, 0.12, 0.06, 1.6, 0x4a3426);
  for (const [dx, dz, ww, dd] of [[0, 0.74, 1.6, 0.12], [0, -0.74, 1.6, 0.12], [0.74, 0, 0.12, 1.6], [-0.74, 0, 0.12, 1.6]] as const) I.box(irX + dx, fl + 0.03, irZ + dz, ww, 0.08, dd, 0x3a281c);
  p.glow.box(irX, fl + 0.03, irZ, 0.5, 0.04, 0.5, 0xff8a3a);
  for (let i = 0; i < 5; i++) I.box(irX + (r() - 0.5) * 0.4, fl + 0.07, irZ + (r() - 0.5) * 0.4, 0.5, 0.06, 0.07, 0x2a1a10, 0, r() * 3);
  I.box(irX, fl + 1.9, irZ, 0.06, 2.4, 0.06, 0x1a1410);
  I.box(irX, fl + 1.3, irZ, 0.36, 0.08, 0.06, 0x2a1e16);
  I.add(new SphereGeometry(0.26, 12, 8), 0x1a1614, irX, fl + 0.75, irZ);
  for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]] as const) I.box(irX + dx, fl + 0.04, irZ + dz, 0.55, 0.08, 0.55, 0x6a2a3a);
  // Tatamiräume: Mitte und rechts hinten (der Jōdan-no-ma mit Tokonoma).
  const tatami = (x0: number, x1: number, z0: number, z1: number, y: number): void => {
    for (let x = x0; x < x1 - 0.2; x += 1.82) for (let z = z0; z < z1 - 0.2; z += 0.91) {
      const w = Math.min(1.82, x1 - x) - 0.02, d = Math.min(0.91, z1 - z) - 0.02;
      tilePlate(IT, tile(T.tatami), x + w / 2, y + 0.005, z + d / 2, w, d, 'y', 1);
    }
  };
  tatami(-fw + 5.4, 2.4, fz0 + 0.2, domaZ0 - 0.1, fl);
  const jX0 = 2.6, jY = fl + 0.15;
  I.box((jX0 + fw) / 2, jY - 0.08, (fz0 + domaZ0) / 2, fw - jX0 - 0.1, 0.16, domaZ0 - fz0 - 0.2, 0x5a4232);
  tatami(jX0 + 0.1, fw - 0.2, fz0 + 0.2, domaZ0 - 0.2, jY);
  walk.floors.push([jX0 + 0.1, fz0 + 0.2, fw - 0.2, domaZ0 - 0.2, jY]);
  // Tokonoma: Nische mit Rollbild und Ikebana, Pfosten aus Naturholz.
  const tz = fz0 + 0.12;
  I.box(fw - 1.6, jY + 0.12, fz0 + 0.5, 2.2, 0.24, 0.7, 0x3a2418);
  tilePlate(IT, tile(T.scroll, 84, 0, 172, 128), fw - 1.6, jY + 1.5, tz + 0.02, 0.6, 1.3, 'z', 1);
  tilePlate(IT, tile(T.scroll, 190, 30, 252, 120), fw - 0.9, jY + 0.62, tz + 0.5, 0.5, 0.7, 'z', 1);
  I.add(new CylinderGeometry(0.07, 0.09, 2.6, 7), 0x7a5a3a, fw - 2.8, jY + 1.3, fz0 + 0.3);
  // Fusuma zwischen den Räumen, teils offen; bemalt.
  for (const [x, z0, z1] of [[jX0, fz0 + 0.2, fz0 + 1.9], [jX0, fz0 + 3.7, domaZ0]] as const) {
    I.box(x, fl + 1.1, (z0 + z1) / 2, 0.06, 2.0, z1 - z0, 0x2a1e14);
    for (const f of [-1, 1] as const) tilePlate(IT, tile(f > 0 ? T.fusuma : T.fusuma2), x + f * 0.035, fl + 1.1, (z0 + z1) / 2, z1 - z0 - 0.08, 1.9, 'x', f);
    walk.walls.push([x, z0, x, z1, fl - 0.2, fl + 2.2]);
  }
  I.box(jX0, fl + 2.45, (fz0 + domaZ0) / 2, 0.08, 0.7, domaZ0 - fz0, 0x2a1e14);
  // Andon-Lampen und Kissen; ein Wandschirm (Byōbu) im Jōdan.
  for (const [x, z] of [[-fw + 5.8, fz0 + 0.6], [fw - 0.6, domaZ0 - 0.6], [0.4, domaZ0 - 0.5]] as const) {
    I.box(x, fl + 0.3, z, 0.05, 0.6, 0.05, 0x2a1e14);
    for (const f of [-1, 1] as const) { tilePlate(p.signGlow, tile(T.andon, 20, 0, 108, 128), x + f * 0.14, fl + 0.72, z, 0.26, 0.4, 'x', f); tilePlate(p.signGlow, tile(T.andon, 20, 0, 108, 128), x, fl + 0.72, z + f * 0.14, 0.26, 0.4, 'z', f); }
  }
  for (const [x, z] of [[fw - 2.0, fz0 + 2.2], [fw - 3.2, fz0 + 2.2], [fw - 2.6, domaZ0 - 1.4]] as const) I.box(x, jY + 0.05, z, 0.6, 0.1, 0.6, 0x6a2a3a);
  I.box(fw - 2.6, jY + 0.18, fz0 + 2.8, 0.9, 0.3, 0.6, 0x3a2418);
  for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.35; tilePlate(IT, tile(i % 2 ? T.fusuma : T.fusuma2, 0, 0, 128, 128), jX0 + 1.0 + i * 0.52, jY + 0.75, domaZ0 - 0.6 - Math.abs(a) * 0.4, 0.55, 1.4, 'z', -1); }
  // Decke über den Zimmern (Bretter), über der Doma offen bis unter die Balken.
  I.box(0, fl + H - 0.05, (fz0 + domaZ0) / 2, houseW - 0.3, 0.06, domaZ0 - fz0, 0x4a3628);
  I.box((domaX1 + fw) / 2, fl + H - 0.05, (domaZ0 + fz1) / 2, fw - domaX1 - 0.2, 0.06, fz1 - domaZ0 - 0.2, 0x4a3628);
  for (let x = -fw + 1; x < domaX1; x += 1.8) I.box(x, fl + H - 0.2, (domaZ0 + fz1) / 2, 0.24, 0.3, fz1 - domaZ0, 0x2a1e16);
  I.add(new CylinderGeometry(0.2, 0.26, fz1 - domaZ0, 7), 0x3a2a1c, (-fw + domaX1) / 2, fl + H - 0.55, (domaZ0 + fz1) / 2, Math.PI / 2);
  return walk;
}
type V2 = readonly [number, number];

/** Kasuga-Steinlaterne: Sockel, Schaft, Lichtkammer (leuchtet), Dach, Knauf. */
export function kasugaLantern(p: Parts, x: number, y: number, z: number, r: Rng): void {
  const c = jitter(0x8a867c, r, 0.06);
  p.detail.add(new CylinderGeometry(0.34, 0.4, 0.2, 6), c, x, y + 0.1, z);
  p.detail.add(new CylinderGeometry(0.12, 0.14, 0.9, 8), c, x, y + 0.65, z);
  p.detail.add(new CylinderGeometry(0.3, 0.2, 0.16, 6), c, x, y + 1.18, z);
  p.detail.box(x, y + 1.46, z, 0.36, 0.4, 0.36, c);
  p.glow.box(x, y + 1.46, z, 0.38, 0.22, 0.2, 0xffcf80);
  p.detail.add(new ConeGeometry(0.46, 0.3, 6), c, x, y + 1.82, z);
  p.detail.add(new SphereGeometry(0.09, 6, 4), c, x, y + 2.02, z);
}

// ── Am Hang: Teehaus, Glockenturm, Schrein, Kōsatsu ──────────────────────────

/**
 * Teehaus (Tateba-chaya) mit Kayabuki-Walmdach — das Gassho-Dach aus dem
 * Bauerndorf, hier einmal auf dem Pass: in Magome und Tsumago stehen genau
 * solche Strohdächer zwischen den Zedern. Front (+z) mit Holzterrasse zum Tal;
 * y 0 = Terrassenboden. Die Stelzen setzt `KisoJuku`, es kennt das Gelände.
 */
export function teahouse(p: Parts, w: number, d: number, r: Rng): { deck: number } {
  const hw = w / 2, hd = d / 2, H = 2.8, deck = 2.6;
  p.mass.box(0, H / 2, 0, w, H, d, WOOD[1]);
  for (const e of [-1, 1] as const) for (let z = -hd + 0.15; z < hd; z += 0.3) plate(p.fine, e * (hw + 0.03), H / 2, z, 0.28, H - 0.1, 'x', e, jitter(WOOD[2], r, 0.12));
  // Front zum Tal: offen, Shōji zur Seite geschoben, drinnen Licht und Bänke.
  const bw = w / 4;
  for (let i = 0; i <= 4; i++) p.detail.box(-hw + i * bw, H / 2, hd + 0.06, 0.14, H, 0.14, BEAM);
  tilePlate(p.signGlow, tile(T.inSoba), 0, 1.25, hd + 0.02, w - 0.3, 2.1, 'z', 1);
  for (const x of [-hw + 0.5, hw - 0.5]) tilePlate(p.signGlow, tile(T.shojiWarm), x, 1.25, hd + 0.12, 0.9, 2.0, 'z', 1);
  p.detail.box(0, 2.4, hd + 0.08, w, 0.14, 0.12, BEAM);
  // Rückseite (zur Gasse): Tür mit Noren.
  for (let x = -hw + 0.14; x < hw; x += 0.28) plate(p.fine, x, H / 2, -hd - 0.03, 0.26, H - 0.1, 'z', -1, jitter(WOOD[0], r, 0.12));
  tilePlate(p.signGlow, tile(T.inIrori), 0, 1.05, -hd - 0.05, 1.5, 1.9, 'z', -1);
  { const g = new PlaneGeometry(1.5, 0.8), t = tile(T.noren1), uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0] + uv.getX(i) * (t[2] - t[0]), t[1] + uv.getY(i) * (t[3] - t[1])); p.sign.add(g, 0xffffff, 0, 1.7, -hd - 0.12, 0, Math.PI, 0); }
  p.detail.box(1.8, 2.2, -hd - 0.06, 1.6, 0.8, 0.06, BEAM);
  tilePlate(p.sign, tile(T.teahouse), 1.8, 2.2, -hd - 0.1, 1.5, 0.7, 'z', -1);
  for (const x of [-1.4, 3.0]) chochin(p, x, 2.15, -hd - 0.45, tile(T.lanternTea), 0.2, 0.52);
  // Terrasse zum Tal mit Geländer, Bänken, Schirm.
  p.detail.box(0, -0.06, hd + deck / 2, w + 0.4, 0.12, deck, 0x6a5038);
  for (let x = -hw; x < hw; x += 0.24) p.fine.box(x, 0.005, hd + deck / 2, 0.2, 0.012, deck - 0.05, jitter(0x7a6048, r, 0.1));
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    p.detail.box(cx, 0.95, cz, 0.08, 0.08, len, BEAM, 0, yaw); p.detail.box(cx, 0.45, cz, 0.05, 0.05, len, BEAM, 0, yaw);
    for (let t = 0; t <= 1.001; t += 1 / Math.max(1, Math.round(len / 1.2))) p.detail.box(x0 + (x1 - x0) * t, 0.5, z0 + (z1 - z0) * t, 0.1, 1.0, 0.1, BEAM);
  };
  rail(-hw - 0.15, hd, -hw - 0.15, hd + deck - 0.1); rail(-hw - 0.15, hd + deck - 0.1, hw + 0.15, hd + deck - 0.1); // Rechts an der Hausecke offen: dort kommt der Steg von der Gasse an.
  rail(hw + 0.15, hd + deck - 0.1, hw + 0.15, hd + 0.95);
  bench(p, -1.6, 0, hd + 1.2, 'x', true); bench(p, 1.8, 0, hd + 1.5, 'x', false);
  // Teeschalen und Dango auf der Bank.
  for (const x of [1.4, 2.1]) { p.detail.add(new CylinderGeometry(0.05, 0.04, 0.07, 8), 0x3a4a3a, x, 0.55, hd + 1.5); }
  const top = hipThatch(p, w, d, H, 0.82, 0.95, 0.5, STRAW[0], 1.1);
  return { deck: top };
}

/** Glockenturm (Shōrō): vier Pfosten auf Steinsockel, Glocke, Schlagbalken, Ziegeldach. */
export function bellTower(p: Parts, r: Rng): void {
  const hw = 1.4, H = 3.4;
  p.mass.box(0, -0.5, 0, 3.6, 1.0, 3.6, 0x77736a);
  for (let x = -1.7; x < 1.8; x += 0.5) for (const f of [-1, 1] as const) { plate(p.fine, x, -0.3, f * 1.81, 0.46, 0.4, 'z', f, jitter(STONE, r, 0.18)); plate(p.fine, f * 1.81, -0.3, x, 0.46, 0.4, 'x', f, jitter(STONE, r, 0.18)); }
  for (const x of [-hw, hw]) for (const z of [-hw, hw]) p.mass.box(x, H / 2, z, 0.24, H, 0.24, 0x3a2c22, 0, 0, x > 0 ? -0.04 : 0.04);
  for (const y of [0.6, H - 0.2]) { p.detail.box(0, y, hw, 2 * hw + 0.3, 0.16, 0.14, BEAM); p.detail.box(0, y, -hw, 2 * hw + 0.3, 0.16, 0.14, BEAM); p.detail.box(hw, y, 0, 0.14, 0.16, 2 * hw + 0.3, BEAM); p.detail.box(-hw, y, 0, 0.14, 0.16, 2 * hw + 0.3, BEAM); }
  // Glocke: Bronze, grün angelaufen, Buckelreihen als Ring.
  p.mass.add(new CylinderGeometry(0.46, 0.55, 1.25, 16), 0x3e5a4c, 0, H - 1.25, 0);
  p.mass.add(new SphereGeometry(0.46, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3e5a4c, 0, H - 0.62, 0);
  p.detail.add(new TorusGeometry(0.5, 0.03, 4, 20), 0x2e4a3c, 0, H - 1.0, 0, Math.PI / 2);
  p.detail.add(new TorusGeometry(0.54, 0.03, 4, 20), 0x2e4a3c, 0, H - 1.7, 0, Math.PI / 2);
  p.detail.box(0, H - 0.3, 0, 0.1, 0.3, 0.1, 0x2a2a2a);
  // Schlagbalken (Shumoku) an zwei Seilen.
  p.detail.add(new CylinderGeometry(0.1, 0.1, 1.8, 8), 0x8a7a5a, 0.95, H - 1.3, 0, 0, 0, Math.PI / 2);
  for (const x of [0.5, 1.4]) p.detail.box(x, H - 0.95, 0, 0.02, 0.7, 0.02, 0xd8c8a0);
  const tmp = new Parts(); gableRoof(tmp, { w: 2 * hw + 0.3, d: 2 * hw + 0.3, y: H, pitch: 0.62, eave: 0.9, gableOver: 0.6, ridge: 'x', color: KAWARA, tsuma: PLASTER, barge: BEAM }, r); place(tmp, p, 0, 0, 0, 0);
}

/** Hokora: kleiner Bergschrein auf Steinstufen, Holz-Torii, Shimenawa mit Papierstreifen. */
export function hokora(p: Parts, r: Rng): void {
  p.mass.box(0, -0.4, 0, 2.6, 0.8, 2.2, 0x77736a);
  p.mass.box(0, 0.3, -0.2, 1.3, 0.6, 1.1, 0x8a867c);
  p.mass.box(0, 1.05, -0.2, 0.9, 0.9, 0.8, 0x5a4230);
  p.detail.box(0, 1.0, 0.22, 0.6, 0.6, 0.04, 0xc8a04a);
  const tmp = new Parts(); gableRoof(tmp, { w: 1.1, d: 1.1, y: 1.5, pitch: 0.7, eave: 0.35, gableOver: 0.25, ridge: 'z', color: 0x4f7a6a, tsuma: 0x5a4230, barge: BEAM }, r); place(tmp, p, 0, 0, -0.2, 0);
  tilePlate(p.sign, tile(T.ema), 0.95, 0.5, 0.6, 0.9, 0.45, 'z', 1);
  // Torii aus dunklem Holz.
  const tz = 1.8;
  for (const x of [-0.95, 0.95]) p.mass.add(new CylinderGeometry(0.11, 0.13, 2.7, 8), 0x3a2c22, x, 1.35 - 0.8, tz);
  p.mass.box(0, 1.95, tz, 2.7, 0.18, 0.24, 0x2a2018, 0, 0, 0);
  p.detail.box(0, 1.55, tz, 2.2, 0.12, 0.14, 0x3a2c22);
  // Shimenawa mit Shide.
  p.detail.add(new CylinderGeometry(0.06, 0.06, 1.9, 6), 0xc9b27a, 0, 1.38, tz, 0, 0, Math.PI / 2);
  for (const x of [-0.5, 0, 0.5]) for (let k = 0; k < 3; k++) p.detail.box(x, 1.2 - k * 0.08, tz + 0.02, 0.1 - k * 0.02, 0.07, 0.01, 0xf4f2ea, 0, 0, (k % 2 ? 1 : -1) * 0.4);
  for (const x of [-1.4, 1.4]) { const tp = new Parts(); kasugaLantern(tp, 0, 0, 0, r); place(tp, p, x, -0.02, 1.0, 0); }
}

/** Kōsatsu-ba: Anschlagtafel auf Steinsockel, mit Dach, dahinter ein niedriger Bambuszaun. */
export function kosatsu(p: Parts, r: Rng): void {
  const w = 4.2;
  p.mass.box(0, 0.45, 0, w + 0.6, 0.9, 1.6, 0x77736a);
  for (let x = -w / 2; x < w / 2 + 0.3; x += 0.5) plate(p.fine, x, 0.45, 0.81, 0.46, 0.8, 'z', 1, jitter(STONE, r, 0.18));
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) p.mass.box(x, 2.0, 0, 0.2, 2.2, 0.2, 0x3a2c22);
  p.detail.box(0, 2.0, 0.02, w, 1.3, 0.08, 0x4a3a2c);
  tilePlate(p.sign, tile(T.kosatsu), 0, 2.0, 0.08, w - 0.2, 1.15, 'z', 1);
  const tmp = new Parts(); gableRoof(tmp, { w: w + 0.4, d: 0.9, y: 3.0, pitch: 0.55, eave: 0.35, gableOver: 0.2, ridge: 'x', color: SHINGLE, tsuma: null, barge: BEAM }, r); place(tmp, p, 0, 0, 0, 0);
  for (let x = -w / 2 - 0.2; x <= w / 2 + 0.2; x += 0.13) p.detail.add(new CylinderGeometry(0.025, 0.025, 0.6, 5), 0x9a8a50, x, 1.2, 0.72);
  p.detail.box(0, 1.35, 0.72, w + 0.5, 0.04, 0.04, 0x5a4a30);
}

/** Wegstein des Nakasendō: aufrechter Stein mit Inschrift, ein kleiner Sockel. */
export function milestone(p: Parts, r: Rng): void {
  p.mass.box(0, 0.12, 0, 0.9, 0.24, 0.7, 0x7a776e);
  p.mass.box(0, 1.0, 0, 0.5, 1.6, 0.36, jitter(0x8f8c83, r, 0.05));
  tilePlate(p.sign, tile(T.marker, 0, 0, 128, 128), 0, 1.05, 0.185, 0.46, 1.1, 'z', 1);
  p.detail.box(0, 1.83, 0, 0.52, 0.06, 0.38, 0x7a776e);
}

/** Holzschuppen mit Blechdach — für das Hinterland. */
export function shed(p: Parts, w: number, d: number, r: Rng): void {
  p.mass.box(0, 1.1, 0, w, 2.2, d, WOOD[2]);
  for (const f of [-1, 1] as const) for (let x = -w / 2 + 0.14; x < w / 2; x += 0.28) plate(p.fine, x, 1.1, f * (d / 2 + 0.03), 0.26, 2.1, 'z', f, jitter(0x5a4a3a, r, 0.14));
  p.mass.box(0, 2.35, 0, w + 0.5, 0.1, d + 0.6, SHEETS[Math.floor(r() * SHEETS.length)]!, 0.1);
  firewood(p, 0, 0, d / 2 + 0.3, w - 0.4, 1.3, 'x', 1, r);
}

/** Grabsteine: Sockel, Schaft, ein paar Blumen, Holztafeln (Sotoba) dahinter. */
export function graves(p: Parts, cols: number, rows: number, r: Rng): void {
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (r() < 0.15) continue;
    const x = (i - (cols - 1) / 2) * 1.35, z = (j - (rows - 1) / 2) * 1.5, c = jitter([0x8a877e, 0x6f6c66, 0x9a968c][Math.floor(r() * 3)]!, r, 0.06);
    p.mass.box(x, 0.12, z, 0.95, 0.24, 0.95, 0x7a776e);
    p.mass.box(x, 0.36, z, 0.7, 0.24, 0.6, c);
    p.mass.box(x, 0.95, z - 0.05, 0.38, 0.95, 0.34, c);
    if (r() < 0.6) for (const e of [-1, 1]) { p.detail.add(new CylinderGeometry(0.04, 0.04, 0.2, 6), 0x5a5a5a, x + e * 0.25, 0.58, z + 0.24); ball(p.detail, x + e * 0.25, 0.72, z + 0.24, 0.07, [0xc8402a, 0xe8d24a, 0xf0f0e8][Math.floor(r() * 3)]!, 4); }
    for (let k = 0; k < 2 + Math.floor(r() * 3); k++) p.detail.box(x - 0.2 + k * 0.1, 1.0, z - 0.42, 0.07, 1.4 + r() * 0.4, 0.015, 0xb8a888, 0, 0, (r() - 0.5) * 0.1);
  }
}

/** Gemüsebeet auf dem Land: Erde, Reihen, Bambusstangen für Bohnen. */
export function garden(p: Parts, w: number, d: number, r: Rng): void {
  p.mass.box(0, 0.08, 0, w, 0.16, d, 0x4a3a2a);
  for (let x = -w / 2 + 0.4; x < w / 2; x += 0.8) {
    p.detail.box(x, 0.2, 0, 0.35, 0.1, d - 0.4, 0x3a2e22);
    for (let z = -d / 2 + 0.4; z < d / 2 - 0.2; z += 0.45) ball(p.detail, x + (r() - 0.5) * 0.1, 0.32, z, 0.13 + r() * 0.08, jitter([0x4a6a2e, 0x5a7a34, 0x6a7a3a][Math.floor(r() * 3)]!, r, 0.1), 5);
  }
  if (r() < 0.6) for (let z = -d / 2 + 0.5; z < d / 2; z += 0.9) for (const e of [-1, 1]) p.detail.box(w / 2 - 0.5 + e * 0.25, 0.9, z, 0.03, 1.8, 0.03, 0x9a8a50, 0, 0, e * 0.25);
}

/** Einfacher Holzzaun (Bambus/Latten) als Kante von Beeten und Höfen. */
export function fence(k: SettlementKit, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
  k.box((x0 + x1) / 2, y + 0.75, (z0 + z1) / 2, 0.05, 0.05, len, 0x6a5a40, 0, yaw);
  k.box((x0 + x1) / 2, y + 0.35, (z0 + z1) / 2, 0.05, 0.05, len, 0x6a5a40, 0, yaw);
  for (let t = 0; t <= 1.0001; t += 1 / Math.max(1, Math.round(len / 1.5))) k.box(x0 + (x1 - x0) * t, y + 0.45, z0 + (z1 - z0) * t, 0.07, 0.9, 0.07, 0x5a4a34);
}

/** Wassertrog (Mizubune) aus Stein mit Bambusrohr, aus dem es läuft. */
export function trough(p: Parts, water: SettlementKit): void {
  p.mass.box(0, 0.35, 0, 1.6, 0.7, 0.7, 0x7f7b72);
  water.add(new PlaneGeometry(1.4, 0.5), 0xffffff, 0, 0.64, 0, -Math.PI / 2);
  p.detail.box(0.9, 0.7, 0, 0.12, 1.4, 0.12, 0x5a4a34);
  p.detail.add(new CylinderGeometry(0.045, 0.045, 0.9, 6), 0x9a9a52, 0.5, 1.3, 0, 0, 0, Math.PI / 2 - 0.15);
  p.detail.add(new CylinderGeometry(0.05, 0.03, 0.35, 5), 0x6a5a40, -0.4, 0.8, 0.2, 0.5);
}

/** Gibt nichts zurück, aber hält die Konvention „Stufen sind Boxen“ an einer Stelle. */
export function stoneStep(k: SettlementKit, x: number, top: number, z: number, w: number, d: number, yaw: number, color = 0x8f8b80): void {
  k.box(x, top - 0.15, z, w, 0.3, d, color, 0, yaw);
}

export const COLORS = { BEAM, PLASTER, PLASTER_OLD, SHINGLE, ROOF_STONE, GRAVEL, COPPER } as const;
