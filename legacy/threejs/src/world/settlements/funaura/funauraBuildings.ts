import { BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, PlaneGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import type { SettlementKit } from '../SettlementKit';
import {
  CEDAR, CONCRETE, KAWARA, KAWARA_DARK, PLASTER, STONE, TIMBER_DARK, WARM,
  acUnit, ball, boardsX, boardsZ, downpipe, gableRoof, jitter, koshi, lantern, leanTo, noren, shade,
  cloth, flag, plate, sidingX, sidingZ, tilePlate, windowX, windowZ, type Parts, type Rng,
} from '../wago/wagoKit';
import type { HouseKind } from './funauraLayout';
import { T, tile } from './funauraAtlas';

/*
 * Alle Bauten des Fischerdorfs in lokalen Koordinaten (x quer, z längs,
 * Front = +z, y 0 = Oberkante des Bodens, auf dem das Haus steht).
 * Vorbilder: Ine no Funaya (Bootshaus mit Garage auf Wasserhöhe), Tomonoura
 * (Gangi-Treppen, Steinlaterne), ein Gyokō der 1970er (Beton, Wellblech).
 * Referenzbilder: C:\Users\Leandro\Downloads\towns\fischerdorf\.
 */

const UP = new Vector3(0, 1, 0), DIR = new Vector3(), Q = new Quaternion();
const ROOF_TINTS = [KAWARA, 0x4a5157, 0x3a4046, 0x51565a] as const;
const SHEET = [0x5d7f79, 0x4f6c86, 0x7c8584, 0x8a5a45] as const;

/** Funaya-Tiefe und der Punkt, ab dem es über dem Wasser steht (lokal). */
export const FUNAYA_DEPTH = 20;
export const FUNAYA_WATER_Z = -3;
export const FUNAYA_GROUND = 2.9;

/**
 * Bootshaus. Hinten 7 m auf der Kaiplatte (Werkstatt, Tür zur Hafenstraße),
 * vorn 13 m auf Pfeilern über dem Wasser mit offener Bootsgarage und Slip.
 * `waterY` ist die Wasserlinie relativ zum Kai (−1,8), `bedY` der Grund.
 */
export function funaya(p: Parts, w: number, variant: number, balcony: boolean, waterY: number, bedY: number, r: Rng): void {
  // Obergeschoss und Dachneigung streuen: aus dem Becken gesehen ist eine Reihe
  // gleich hoher Giebel ein Kamm, keine gewachsene Häuserzeile.
  const UPPER = 2.35 + (w - 7.2) * 0.45 + r() * 0.5, roofPitch = 0.46 + r() * 0.14;
  const D = FUNAYA_DEPTH, hz = D / 2, hw = w / 2, G = FUNAYA_GROUND, top = G + UPPER;
  const wood = CEDAR[variant % CEDAR.length]!;
  // Pfeiler: Beton unten, Algenband an der Wasserlinie.
  for (const z of [FUNAYA_WATER_Z, 1.5, 6, hz - 0.3]) for (const x of w > 8 ? [-hw + 0.25, 0, hw - 0.25] : [-hw + 0.25, hw - 0.25]) {
    p.mass.box(x, (bedY + 0.1) / 2, z, 0.45, -bedY + 0.1, 0.45, 0x5f5c55);
    p.detail.box(x, waterY + 0.15, z, 0.49, 0.5, 0.49, 0x3d4a3c);
  }
  for (const z of [1.5, 6, hz - 0.3]) p.mass.box(0, -0.15, z, w, 0.3, 0.32, TIMBER_DARK);
  // Slip: Betonrampe von der Kaikante bis unter Wasser, dunkle Garage darüber.
  // Kurz und steil (5 m), danach flacher Grund unter Wasser — sonst
  // schnitte die Rampe den Rumpf des Boots, das in der Garage schwimmt.
  const slipLen = 5, slipDrop = -waterY + 0.9, pitch = Math.atan2(slipDrop, slipLen);
  p.mass.box(0, -slipDrop / 2, FUNAYA_WATER_Z + slipLen / 2, w - 0.9, 0.25, Math.hypot(slipLen, slipDrop), shade(CONCRETE, 0.75), pitch);
  p.mass.box(0, -slipDrop - 0.1, (FUNAYA_WATER_Z + slipLen + hz) / 2, w - 0.9, 0.2, hz - FUNAYA_WATER_Z - slipLen, shade(CONCRETE, 0.6));
  for (let z = FUNAYA_WATER_Z + 0.5; z < FUNAYA_WATER_Z + slipLen; z += 0.8) {
    const y = -slipDrop * (z - FUNAYA_WATER_Z) / slipLen;
    p.detail.box(0, y + 0.14, z, w - 1.1, 0.05, 0.12, 0x56514a, pitch);
  }
  // Werkstattboden hinten: trägt auch dort, wo das Haus etwas über die Kaikante hinausgerückt ist.
  p.mass.box(0, -0.1, (-hz + FUNAYA_WATER_Z) / 2, w - 0.2, 0.2, FUNAYA_WATER_Z + hz, shade(CONCRETE, 0.85));
  p.mass.box(0, G - 0.12, 0, w - 0.2, 0.24, D - 0.2, 0x2a2521); // Decke der Garage
  p.mass.box(0, G / 2, FUNAYA_WATER_Z - 0.1, w - 0.3, G, 0.2, 0x221f1c); // Rückwand dunkel
  // Seitenwände über die ganze Länge, unten Bretter, oben Stülpschalung.
  for (const s of [-1, 1]) {
    p.mass.box(s * (hw - 0.08), top / 2, 0, 0.16, top, D, wood);
    boardsZ(p.fine, -hz, hz, 0, G, s * hw, s, wood, r);
    sidingZ(p.fine, -hz, hz, G, top, s * hw, s, shade(wood, 1.08), r);
    p.detail.box(s * (hw + 0.06), G, 0, 0.1, 0.18, D, shade(wood, 0.6));
    for (const z of [-hz + 0.1, FUNAYA_WATER_Z, hz - 0.1]) p.detail.box(s * (hw + 0.05), top / 2, z, 0.14, top, 0.16, TIMBER_DARK);
  }
  // Hinten: Werkstatt mit Schiebetür, kleines Fenster, Netze.
  p.mass.box(0, top / 2, -hz + 0.08, w, top, 0.16, wood);
  boardsX(p.fine, -hw, hw, 0, G, -hz, -1, wood, r);
  p.detail.box(-hw * 0.35, 1.05, -hz - 0.09, 1.8, 2.1, 0.06, shade(wood, 0.55));
  p.detail.box(-hw * 0.35 + 0.45, 1.05, -hz - 0.12, 0.9, 2.05, 0.04, shade(wood, 0.8));
  windowX(p, hw * 0.45, 1.6, -hz, -1, 1.1, 0.8, 0x9aa0a0, r() < 0.4);
  windowX(p, 0, G + 1.35, -hz, -1, 1.6, 1.0, 0x9aa0a0, r() < 0.55);
  sidingX(p.fine, -hw, hw, G, top, -hz, -1, shade(wood, 1.08), r);
  p.detail.box(0, G + 0.1, -hz - 0.1, w, 0.16, 0.12, shade(wood, 0.6));
  for (let i = 0; i < 2; i++) { const g = new CylinderGeometry(0.16, 0.16, 1.0, 8); p.detail.add(g, 0x8f9ea4, hw - 0.4 - i * 0.4, 0.5, -hz - 0.3); }
  acUnit(p, hw - 1.2, G + 0.9, -hz, -1);
  // Vorn, Obergeschoss: kragt 0,3 m vor, zwei Schiebefenster, Giebel aus Putz.
  const fz = hz + 0.3;
  p.mass.box(0, G + UPPER / 2, hz + 0.15, w + 0.1, UPPER, 0.3, shade(wood, 1.05));
  sidingX(p.fine, -hw, hw, G, top, fz, 1, shade(wood, 1.1), r);
  for (const x of w > 7.8 ? [-hw * 0.5, hw * 0.5] : [-hw * 0.45, hw * 0.45]) windowX(p, x, G + 1.35, fz, 1, w * 0.36, 1.3, 0xa9aeac, r() < 0.5, 2);
  p.detail.box(0, G + 0.05, fz + 0.05, w + 0.1, 0.22, 0.12, TIMBER_DARK);
  // Garagenöffnung: Sturz, Eckpfosten, Kranbalken, Netz, Bojen.
  p.mass.box(0, G - 0.3, hz - 0.05, w, 0.4, 0.3, TIMBER_DARK);
  p.detail.box(0, G - 0.62, hz - 0.8, 0.14, 0.14, 1.8, TIMBER_DARK);
  cloth(p.cloth, -hw + 0.9, G - 1.0, hz - 1.4, 1.0, 1.6, 'z', 1, 0x3f5c50, 4);
  cloth(p.cloth, hw - 1.1, G - 1.1, 1.5, 0.8, 1.4, 'x', -1, 0x4f6b5a, 4);
  // Werkstattwand hinten in der Garage und eine nackte Glühlampe unter der Decke.
  tilePlate(p.sign, tile(T.inGarage), 0, G / 2 + 0.1, FUNAYA_WATER_Z + 0.02, w - 0.5, G - 0.3, 'z', 1);
  p.glow.box(0, G - 0.35, 2, 0.16, 0.16, 0.16, 0xfff0c8);
  // Namensschild an der Werkstatttür.
  tilePlate(p.sign, tile(T.plates, (variant % 4) * 64, 0, (variant % 4) * 64 + 64, 64), -hw * 0.35 + 1.2, 1.7, -hz - 0.13, 0.26, 0.26, 'z', -1);
  for (let i = 0; i < 3; i++) ball(p.detail, hw - 0.6 - i * 0.35, G - 0.9, hz - 0.5, 0.17, i === 1 ? 0xe5b43a : 0xe0612d);
  // Vordach über der Garage: Ziegel oder Wellblech.
  const corr = variant % 2 === 1;
  leanTo(p, 0, w + 0.3, G - 0.05, hz + 0.3, 1, 1.25, corr ? SHEET[variant % SHEET.length]! : KAWARA, r, corr);
  if (balcony) {
    const by = G + 0.12, bz = fz + 0.65;
    p.mass.box(0, by, bz, w - 0.6, 0.12, 1.2, shade(wood, 0.9));
    for (let x = -hw + 0.4; x <= hw - 0.4; x += 0.14) plate(p.detail, x, by + 0.5, bz + 0.6, 0.04, 0.9, 'z', 1, 0x6b6e6d);
    p.detail.box(0, by + 0.96, bz + 0.58, w - 0.6, 0.06, 0.08, 0x6b6e6d);
    for (const s of [-1, 1]) p.detail.box(s * (hw - 0.35), by + 0.5, bz, 0.06, 0.9, 1.2, 0x6b6e6d);
    // Wäschestange mit Wäsche — die Kleinigkeit, die in jedem Ine-Bild hängt.
    p.detail.box(0, by + 1.75, bz + 0.2, w - 1, 0.04, 0.04, 0xb8b8b0);
    for (let i = 0; i < 5; i++) cloth(p.cloth, -hw + 1 + i * (w - 2) / 4, by + 1.35, bz + 0.2, 0.5 + (i % 2) * 0.15, 0.75 - (i % 3) * 0.12, 'z', 1, [0xe8e4da, 0x4d6fa5, 0xd9a441, 0x8a4a4a, 0xf1f1ec][(i + variant) % 5]!);
    const roofY = by + 2.35;
    p.detail.box(0, roofY, bz + 0.1, w - 0.4, 0.05, 1.5, 0xb9c7cc, 0.12);
  }
  gableRoof(p, { w, d: D + 0.3, y: top, pitch: roofPitch, eave: 0.65, gableOver: 0.55, ridge: 'z', color: ROOF_TINTS[variant % 4]!, tsuma: variant === 3 ? shade(wood, 1.1) : PLASTER, barge: TIMBER_DARK }, r);
  // Fernsehantenne und Fallrohre.
  const ant = top + Math.tan(roofPitch) * hw + 0.3;
  p.detail.box(0, ant + 0.9, -hz * 0.4, 0.04, 1.8, 0.04, 0x9a9a95);
  p.detail.box(0, ant + 1.5, -hz * 0.4, 0.05, 0.05, 1.4, 0x9a9a95);
  for (const s of [-1, 1]) downpipe(p, s * (hw + 0.2), 0.2, top - 0.1, hz - 0.2);
}

/** Wohn- und Ladenhäuser an der Hafenstraße und am Hang; First parallel zur Straße. */
export function house(p: Parts, w: number, d: number, kind: HouseKind, floors: number, r: Rng): void {
  const hw = w / 2, hd = d / 2, G = 3.0, U = floors > 1 ? 2.6 : 0, top = G + U;
  const wood = CEDAR[Math.floor(r() * 3)]!;
  if (kind === 'coop' || kind === 'ice') return concreteHouse(p, w, d, kind, r);
  // Steinsockel.
  p.mass.box(0, 0.15, 0, w + 0.3, 0.3, d + 0.3, STONE);
  for (let x = -hw; x < hw; x += 0.9) p.detail.box(x + 0.45, 0.15, hd + 0.17, 0.85, 0.26, 0.04, jitter(STONE, r, 0.12));
  // Wände in drei Arten, wie in Ine: ganz Holz (Stülpschalung), unten Holz und
  // oben Putz, oder gebrannte schwarze Bretter (Yakisugi). Die erste Fassung
  // hatte nur die mittlere — im ersten Bild aus der Gasse stand eine Reihe
  // heller Putzkästen, und genau das ist ein Fischerdorf nicht.
  const shopFront = kind === 'shop' || kind === 'izakaya' || kind === 'grocery' || kind === 'inn' || kind === 'tackle';
  const roll = r(), style = shopFront ? 1 : roll < 0.45 ? 0 : roll < 0.75 ? 1 : 2;
  const skin = style === 2 ? 0x2e2925 : wood, skinTop = style === 1 ? 0.3 + G * 0.62 : 0.3 + top;
  p.mass.box(0, 0.3 + top / 2, 0, w, top, d, style === 1 ? PLASTER : skin);
  if (style !== 1 && floors > 1) sidingX(p.fine, -hw, hw, 0.3 + G + 0.25, 0.3 + top, hd, 1, skin, r);
  for (const s of [-1, 1]) {
    if (style === 2) boardsZ(p.fine, -hd, hd, 0.3, skinTop, s * hw, s, skin, r, 0.3);
    else sidingZ(p.fine, -hd, hd, 0.3, skinTop, s * hw, s, skin, r);
    for (let z = -hd + 0.1; z <= hd; z += d / 3) p.detail.box(s * (hw + 0.04), 0.3 + top / 2, z, 0.1, top, 0.14, TIMBER_DARK);
    if (floors > 1) windowZ(p, s * hw, 0.3 + G + 1.3, 0, s, 1.2, 0.9, TIMBER_DARK, r() < 0.4);
  }
  if (style === 2) boardsX(p.fine, -hw, hw, 0.3, skinTop, -hd, -1, skin, r, 0.3);
  else sidingX(p.fine, -hw, hw, 0.3, skinTop, -hd, -1, skin, r);
  windowX(p, hw * 0.4, 0.3 + 1.7, -hd, -1, 1.0, 0.8, TIMBER_DARK, r() < 0.4);
  acUnit(p, -hw * 0.5, 0.3 + 1.2, -hd, -1);
  // Front (+z) je nach Art.
  const fy = 0.3, fz = hd;
  for (let x = -hw + 0.1; x <= hw; x += w / 4) p.detail.box(x, fy + G / 2, fz + 0.05, 0.14, G, 0.12, TIMBER_DARK);
  p.detail.box(0, fy + G - 0.1, fz + 0.06, w, 0.2, 0.14, TIMBER_DARK);
  if (kind === 'grocery') {
    tilePlate(p.signGlow, tile(T.inGrocery), -hw * 0.2, fy + 1.3, fz + 0.05, w * 0.55, 2.1, 'z', 1);
    for (let i = 0; i < 3; i++) p.detail.box(-hw * 0.2 - w * 0.2 + i * w * 0.2, fy + 1.3, fz + 0.1, 0.06, 2.1, 0.05, 0x9aa0a0);
    // Zwei Automaten — ohne sie ist es kein japanischer Ort.
    for (const [i, c] of [[0, 0xd8413a], [1, 0x2f6fb6]] as const) {
      const vx = hw * 0.55 + i * 0.95;
      p.mass.box(vx, fy + 0.92, fz + 0.45, 0.9, 1.84, 0.7, c);
      tilePlate(p.signGlow, tile(i ? T.vendBlue : T.vendRed), vx, fy + 1.2, fz + 0.81, 0.76, 1.3, 'z', 1);
      p.detail.box(vx, fy + 0.45, fz + 0.81, 0.6, 0.3, 0.02, 0x222222);
    }
    // Markise, gestreift.
    for (let i = 0; i < 8; i++) p.detail.box(-hw * 0.2 - w * 0.27 + i * w * 0.077, fy + 2.55, fz + 0.7, w * 0.077, 0.05, 1.4, i % 2 ? 0x2e7d5b : 0xf0ede4, 0.3);
  } else if (kind === 'shop') {
    // Fischladen: offene Front, Styroporkisten auf Eis, blauer Noren.
    p.mass.box(0, fy + 1.2, fz - 1.4, w - 0.4, 2.4, 0.1, 0x2a2622);
    tilePlate(p.signGlow, tile(T.inFish), 0, fy + 1.3, fz - 1.33, w - 0.6, 2.2, 'z', 1);
    p.detail.box(0, fy + 0.45, fz + 0.3, w * 0.7, 0.9, 1.1, 0x8a8f90);
    for (let i = 0; i < 6; i++) {
      p.detail.box(-w * 0.3 + i * w * 0.12, fy + 0.98, fz + 0.3, w * 0.11, 0.16, 0.8, 0xf2f2ee);
      p.detail.box(-w * 0.3 + i * w * 0.12, fy + 1.07, fz + 0.3, w * 0.09, 0.03, 0.6, [0xc5ccd0, 0xb3503d, 0xd8d0c0][i % 3]!);
    }
    noren(p, 0, fy + G - 0.25, fz, 1, w * 0.6, 0x24466e);
    p.glow.box(0, fy + 2.3, fz - 1.3, w - 0.8, 0.15, 0.05, 0xf4f7ff);
  } else if (kind === 'izakaya') {
    koshi(p, -hw * 0.45, fy + 1.3, fz, 1, w * 0.4, 2.0, TIMBER_DARK, true);
    p.detail.box(hw * 0.35, fy + 1.1, fz + 0.03, 1.6, 2.2, 0.04, shade(wood, 0.5));
    noren(p, hw * 0.35, fy + 2.25, fz, 1, 1.7, 0x8f2320);
    lantern(p, hw * 0.35 - 1.2, fy + 2.0, fz + 0.4); lantern(p, hw * 0.35 + 1.2, fy + 2.0, fz + 0.4);
  } else if (kind === 'inn') {
    // Minshuku: Eingang mit Glasschiebetür, Blick in den Empfang, zwei Laternen.
    koshi(p, -hw * 0.45, fy + 1.3, fz, 1, w * 0.36, 1.9, TIMBER_DARK, true);
    tilePlate(p.signGlow, tile(T.inInn), hw * 0.3, fy + 1.15, fz + 0.05, 2.4, 2.1, 'z', 1);
    for (const x of [-0.6, 0, 0.6]) p.detail.box(hw * 0.3 + x, fy + 1.15, fz + 0.09, 0.05, 2.2, 0.04, TIMBER_DARK);
    noren(p, hw * 0.3, fy + 2.3, fz, 1, 2.2, 0x2d4a6b);
    lantern(p, hw * 0.3 - 1.6, fy + 2.1, fz + 0.4, 0xf2e6c8); lantern(p, hw * 0.3 + 1.6, fy + 2.1, fz + 0.4, 0xf2e6c8);
  } else if (kind === 'tackle') {
    // Angelladen: offen, Ruten und Köderkisten, gelbes Schild.
    p.mass.box(0, fy + 1.2, fz - 1.2, w - 0.4, 2.4, 0.1, 0x2a2622);
    tilePlate(p.signGlow, tile(T.inTackle), 0, fy + 1.3, fz - 1.13, w - 0.6, 2.2, 'z', 1);
    for (let i = 0; i < 4; i++) p.detail.box(-hw + 1 + i * 0.5, fy + 0.4, fz + 0.4, 0.4, 0.8, 0.5, [0xe0612d, 0xf0c93a, 0x2f6fb0, 0xeaeaea][i]!);
    for (let i = 0; i < 6; i++) p.detail.box(hw - 0.6 - i * 0.16, fy + 1.6, fz + 0.3, 0.025, 3.0, 0.025, 0x2b2b2b, 0.08 * (i % 3));
  } else {
    koshi(p, -hw * 0.4, fy + 1.3, fz, 1, w * 0.42, 1.9, TIMBER_DARK, r() < 0.5);
    p.detail.box(hw * 0.35, fy + 1.05, fz + 0.03, 1.5, 2.1, 0.04, 0xb8b09a);
    p.glow.box(hw * 0.35, fy + 1.4, fz + 0.06, 1.2, 1.1, 0.02, shade(WARM, 0.75));
    for (const x of [-0.3, 0.3]) p.detail.box(hw * 0.35 + x, fy + 1.05, fz + 0.08, 0.05, 2.1, 0.04, TIMBER_DARK);
    if (r() < 0.6) noren(p, hw * 0.35, fy + 2.2, fz, 1, 1.4, [0x3b4f6a, 0x6b4a3a, 0x3f5a48][Math.floor(r() * 3)]!);
    // Hyōsatsu — Namensschild neben der Tür.
    const n = Math.floor(r() * 8);
    tilePlate(p.sign, tile(T.plates, (n % 4) * 64, Math.floor(n / 4) * 64, (n % 4) * 64 + 64, Math.floor(n / 4) * 64 + 64), hw * 0.35 + 0.95, fy + 1.55, fz + 0.1, 0.26, 0.26, 'z', 1);
    // Gasflaschen, Eimer, Schlauch: was an jeder Hauswand am Meer steht.
    if (r() < 0.6) for (let i = 0; i < 2; i++) p.detail.add(new CylinderGeometry(0.16, 0.16, 1.0, 8), 0x8f9ea4, -hw + 0.4 + i * 0.4, fy + 0.5, fz + 0.3);
    if (r() < 0.5) p.detail.add(new CylinderGeometry(0.17, 0.14, 0.32, 8), 0x2f6fb0, -hw * 0.05, fy + 0.16, fz + 0.35);
    // Topfpflanzen neben dem Eingang.
    for (let i = 0; i < 3; i++) {
      const g = new CylinderGeometry(0.2, 0.15, 0.35, 8); p.detail.add(g, 0x8b5a3c, hw * 0.35 + 1.1 + i * 0.45, fy + 0.18, fz + 0.4);
      ball(p.detail, hw * 0.35 + 1.1 + i * 0.45, fy + 0.55, fz + 0.4, 0.28, i % 2 ? 0x4f6b3a : 0x5c7a42, 6);
    }
  }
  // Vordach zwischen den Geschossen bzw. über dem Eingang.
  leanTo(p, 0, w + 0.4, fy + G + 0.15, fz, 1, 0.95, kind === 'grocery' ? 0x6e7678 : KAWARA_DARK, r);
  // Ladenschild auf der Obergeschossfront, Hängeschild quer zur Straße.
  const SIGN: Partial<Record<HouseKind, number>> = { shop: T.fishShop, izakaya: T.izakaya, grocery: T.grocery, inn: T.inn, tackle: T.tackle };
  const signTile = SIGN[kind];
  if (signTile !== undefined) {
    const sw = Math.min(3.4, w * 0.42);
    tilePlate(p.sign, tile(signTile), 0, fy + G + 1.25, fz + 0.1, sw, sw / 2, 'z', 1);
    p.detail.box(0, fy + G + 1.25, fz + 0.06, sw + 0.12, sw / 2 + 0.12, 0.05, TIMBER_DARK);
    const k = kind === 'shop' ? 0 : kind === 'izakaya' ? 1 : kind === 'inn' ? 2 : -1;
    if (k >= 0) {
      const kx = hw - 0.25, ky = fy + G + 0.6, t = tile(T.kanban, k * 85, 0, k * 85 + 85, 128);
      p.detail.box(kx, ky + 0.45, fz + 0.45, 0.06, 0.06, 0.9, TIMBER_DARK);
      tilePlate(p.sign, t, kx + 0.03, ky, fz + 0.75, 0.52, 0.78, 'x', 1);
      tilePlate(p.sign, t, kx - 0.03, ky, fz + 0.75, 0.52, 0.78, 'x', -1);
    }
  } else if (r() < 0.35) {
    // Plakat an der Seitenwand.
    const s2 = r() < 0.5 ? -1 : 1;
    tilePlate(p.sign, tile(r() < 0.5 ? T.festival : T.fishChart), s2 * (hw + 0.08), fy + 1.7, hd * 0.3, 1.0, 0.5, 'x', s2);
  }
  if (floors > 1) {
    const wx = signTile !== undefined ? [-hw * 0.74, hw * 0.74] : [-hw * 0.5, hw * 0.5], ww = signTile !== undefined ? w * 0.18 : w * 0.3;
    for (const x of wx) windowX(p, x, fy + G + 1.35, fz, 1, ww, 1.1, TIMBER_DARK, r() < 0.55, signTile !== undefined ? 2 : 3);
    p.detail.box(0, fy + G + 0.8, fz + 0.3, w - 0.6, 0.06, 0.06, TIMBER_DARK);
    for (let x = -hw + 0.4; x < hw - 0.3; x += 0.25) plate(p.detail, x, fy + G + 0.55, fz + 0.32, 0.05, 0.5, 'z', 1, TIMBER_DARK);
  }
  gableRoof(p, { w, d, y: fy + top, pitch: 0.46, eave: 0.8, gableOver: 0.45, ridge: 'x', color: ROOF_TINTS[Math.floor(r() * 4)]!, tsuma: PLASTER }, r);
  for (const s of [-1, 1]) downpipe(p, s * (hw + 0.25), 0.3, fy + top, fz + 0.5);
  if (kind === 'hill') {
    // Gartenzaun aus Bambus vor dem Haus.
    for (let x = -hw; x <= hw; x += 0.12) plate(p.detail, x, 0.55, hd + 1.9, 0.06, 1.1, 'z', 1, jitter(0xa89f6f, r, 0.1));
    p.detail.box(0, 0.95, hd + 1.9, w, 0.05, 0.08, 0x6f6446);
  }
}

function concreteHouse(p: Parts, w: number, d: number, kind: HouseKind, r: Rng): void {
  const hw = w / 2, hd = d / 2, H = kind === 'ice' ? 7.8 : 6.6, wall = kind === 'ice' ? 0xbcb8ad : 0xc9c3b2;
  p.mass.box(0, H / 2, 0, w, H, d, wall);
  // Rostfahnen und Fugen: Beton am Meer ist nie sauber.
  for (let x = -hw + 0.8; x < hw; x += 1.6 + r()) p.detail.box(x, H - 1.2, hd + 0.02, 0.18, 2.2, 0.02, shade(wall, 0.82));
  for (const y of [3.2]) p.detail.box(0, y, hd + 0.03, w, 0.08, 0.04, shade(wall, 0.75));
  p.mass.box(0, H + 0.35, 0, w + 0.1, 0.7, d + 0.1, shade(wall, 0.92));
  for (const s of [-1, 1]) p.detail.box(0, H + 0.72, s * (hd - 0.1), w, 0.1, 0.2, shade(wall, 0.7));
  if (kind === 'coop') {
    for (let x = -hw + 1.5; x < hw - 1; x += 2.2) windowX(p, x, 4.9, hd, 1, 1.8, 1.2, 0x9ca3a5, r() < 0.6, 2);
    p.glow.box(-hw * 0.4, 1.3, hd + 0.03, 3.2, 2.2, 0.02, 0xe8f0f4);
    for (let i = 1; i < 4; i++) p.detail.box(-hw * 0.4 - 1.6 + i * 0.8, 1.3, hd + 0.06, 0.06, 2.2, 0.04, 0x8e9595);
    p.detail.box(hw * 0.4, 1.5, hd + 0.05, 3.6, 3.0, 0.06, 0x8a9296);
    for (let y = 0.15; y < 3; y += 0.15) p.detail.box(hw * 0.4, y, hd + 0.09, 3.5, 0.03, 0.02, 0x6f777a);
    // Dachaufbau: Funkmast der Genossenschaft.
    p.detail.box(hw - 1, H + 3, -hd + 1, 0.12, 5, 0.12, 0xb9b9b4);
    p.detail.box(hw - 1, H + 5.2, -hd + 1, 1.2, 0.06, 0.06, 0xb9b9b4);
  } else {
    // Eishaus: zwei Rolltore, Eisrutsche zum Kai, Kühlaggregate auf dem Dach.
    for (const x of [-hw * 0.45, hw * 0.45]) {
      p.detail.box(x, 1.9, hd + 0.05, 3.6, 3.8, 0.06, 0x98a1a4);
      for (let y = 0.15; y < 3.8; y += 0.15) p.detail.box(x, y, hd + 0.09, 3.5, 0.03, 0.02, 0x7b8588);
    }
    const g = new CylinderGeometry(0.45, 0.45, 9, 10); g.rotateX(Math.PI / 2 - 0.55); p.mass.add(g, 0x8c9aa0, 0, 5.2, hd + 3.4);
    for (const s of [-1, 1]) p.detail.box(s * 0.6, 3.2, hd + 5.2, 0.14, 6, 0.14, 0x7b7f80);
    for (let i = 0; i < 3; i++) { p.detail.box(-hw + 2 + i * 3.2, H + 1.2, -hd + 2.5, 2.4, 1.4, 1.6, 0xd7d9d4); p.detail.box(-hw + 2 + i * 3.2, H + 1.95, -hd + 2.5, 1.6, 0.1, 1.2, 0x55595a); }
    for (let x = -hw + 1; x < hw; x += 1.6) windowX(p, x, 6.4, hd, 1, 0.9, 0.5, 0x9ca3a5, false, 1);
  }
}

/** Offene Fischhalle: Stahlstützen, flaches Wellblechdach, Kisten und Waage. */
export function marketHall(p: Parts, w: number, d: number, r: Rng): void {
  const hw = w / 2, hd = d / 2, H = 5.2;
  for (let x = -hw; x <= hw + 0.01; x += w / 5) for (const z of [-hd, 0, hd]) {
    p.mass.box(x, H / 2, z, 0.3, H, 0.3, 0x5c6c74);
    p.detail.box(x, 0.3, z, 0.5, 0.6, 0.5, CONCRETE);
  }
  for (const z of [-hd, hd]) p.mass.box(0, H, z, w + 0.3, 0.45, 0.25, 0x56666e);
  const pitch = 0.12, L = (hd + 1.2) / Math.cos(pitch);
  for (const s of [-1, 1]) {
    p.mass.box(0, H + 0.5 + Math.tan(pitch) * (hd - (hd + 1.2) / 2) , s * (hd + 1.2) / 2, w + 1.6, 0.12, L, 0x6f8c93, s * pitch);
    for (let x = -hw - 0.7; x < hw + 0.8; x += 0.45) p.detail.add(new PlaneGeometry(0.08, L), 0x60797f, x, H + 0.57 + Math.tan(pitch) * (hd - (hd + 1.2) / 2), s * (hd + 1.2) / 2, -Math.PI / 2 + s * pitch);
  }
  // Leuchtstoffbalken unter dem Dach.
  for (let x = -hw + 2; x < hw; x += 4) p.glow.box(x, H - 0.4, 0, 0.12, 0.06, d - 2, 0xf2f6ff);
  // Blaue Kisten, Styroporboxen, Eisbehälter, Waage.
  for (let i = 0; i < 14; i++) {
    const x = -hw + 1.5 + (i % 7) * (w - 3) / 6, z = -hd + 2.5 + Math.floor(i / 7) * (d - 5), n = 1 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) p.detail.box(x + (r() - 0.5) * 0.1, 0.17 + j * 0.34, z, 0.95, 0.32, 0.62, r() < 0.7 ? 0x2f6fb0 : 0xf2f1ea, 0, r() * 0.2);
  }
  for (let i = 0; i < 3; i++) { p.detail.box(-hw * 0.3 + i * 2.2, 0.5, 0, 1.6, 1.0, 1.1, 0xe7e9ea); p.detail.box(-hw * 0.3 + i * 2.2, 1.02, 0, 1.4, 0.04, 0.9, 0xcfdde3); }
  p.detail.box(hw * 0.5, 0.45, 0.5, 0.8, 0.9, 0.8, 0x9ea4a6); p.detail.box(hw * 0.5, 0.95, 0.5, 0.9, 0.08, 0.9, 0xc9cccc);
}

/** Molenfeuer (Bōhatei-tōdai): rot oder weiß. Die Lampe liefert der Aufrufer. */
export function breakwaterLight(p: Parts, color: number): void {
  p.mass.add(new CylinderGeometry(1.25, 1.35, 1.2, 12), shade(CONCRETE, 0.9), 0, 0.6, 0);
  p.mass.add(new CylinderGeometry(0.72, 0.95, 7.4, 12), color, 0, 4.9, 0);
  p.detail.add(new CylinderGeometry(0.98, 0.98, 0.1, 12), 0x3a3a3a, 0, 8.6, 0);
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; p.detail.box(Math.cos(a) * 0.95, 9.0, Math.sin(a) * 0.95, 0.04, 0.75, 0.04, 0x3a3a3a); }
  p.detail.add(new TorusGeometry(0.95, 0.03, 4, 16), 0x3a3a3a, 0, 9.35, 0, Math.PI / 2);
  p.glass.add(new CylinderGeometry(0.42, 0.42, 0.9, 10), 0x9fb3b8, 0, 9.1, 0);
  p.mass.add(new CylinderGeometry(0.1, 0.55, 0.5, 10), color, 0, 9.8, 0);
  p.detail.box(0, 1.9, 0.9, 0.7, 1.4, 0.1, 0x4a4f52);
  // Zierband, weil ein japanisches Molenfeuer fast immer eines hat.
  p.detail.add(new CylinderGeometry(0.86, 0.9, 0.25, 12), shade(color, 0.75), 0, 2.2, 0);
}

/** Ebisu-Schrein: Steintreppe, Torii, kleine Halle mit Kupferdach, Laternen. */
export function ebisuShrine(p: Parts, r: Rng): void {
  const PATINA = 0x5f8a78;
  // Plattform aus Steinquadern.
  p.mass.box(0, 0.35, 0, 12, 0.7, 11, STONE);
  for (let x = -6; x < 6; x += 1.1) p.detail.box(x + 0.55, 0.35, 5.52, 1.05, 0.6, 0.05, jitter(STONE, r, 0.15));
  // Halle.
  p.mass.box(0, 0.7 + 0.5, -1.5, 5.8, 1.0, 4.6, 0x7c6a58);
  p.mass.box(0, 1.7 + 1.1, -1.5, 5, 2.2, 3.8, 0x8e3a2a);
  for (const x of [-2.4, -0.8, 0.8, 2.4]) p.detail.box(x, 2.8, 0.42, 0.18, 2.2, 0.18, 0x6f2a1f);
  koshi(p, 0, 2.7, 0.35, 1, 3, 1.6, 0x5d2419, true);
  gableRoof(p, { w: 5, d: 3.8, y: 3.9, pitch: 0.55, eave: 1.2, gableOver: 0.8, ridge: 'x', color: PATINA, tsuma: 0xd9cfb8, barge: 0x3a2b22 }, r);
  // Glockenseil, Opferkasten, Shimenawa.
  p.detail.box(0, 2.9, 1.3, 0.08, 1.9, 0.08, 0xd8c8a0);
  p.detail.box(0, 0.95, 1.4, 1.2, 0.55, 0.6, 0x5a4230);
  const rope = new CylinderGeometry(0.1, 0.1, 4.2, 8); rope.rotateZ(Math.PI / 2); p.detail.add(rope, 0xd9cfa5, 0, 3.75, 0.5);
  for (const x of [-1.2, 0, 1.2]) p.detail.box(x, 3.45, 0.55, 0.12, 0.45, 0.02, 0xf5f5f0);
  // Torii aus Stein, zwei Steinlaternen, zwei Komainu.
  const tz = 5;
  for (const s of [-1, 1]) p.mass.add(new CylinderGeometry(0.22, 0.26, 4.2, 10), 0x9a968b, s * 1.8, 2.8, tz);
  p.mass.box(0, 4.95, tz, 5.2, 0.3, 0.4, 0x8e8a80, 0, 0, 0);
  p.mass.box(0, 4.4, tz, 4.2, 0.22, 0.28, 0x8e8a80);
  p.detail.box(0, 4.65, tz + 0.18, 0.6, 0.5, 0.06, 0x3f3a33);
  for (const s of [-1, 1]) {
    const x = s * 3.4, z = 2.2;
    p.detail.box(x, 1.0, z, 0.5, 0.6, 0.5, 0x8f8b80); p.detail.box(x, 1.55, z, 0.22, 0.5, 0.22, 0x8f8b80);
    p.detail.box(x, 2.0, z, 0.62, 0.42, 0.62, 0x8f8b80); p.glow.box(x, 2.0, z, 0.4, 0.3, 0.64, WARM);
    p.detail.box(x, 2.32, z, 0.85, 0.16, 0.85, 0x8a867b);
    p.detail.box(s * 2.4, 1.05, 3.6, 0.55, 0.7, 0.8, 0x8f8b80); p.detail.box(s * 2.4, 1.55, 3.85, 0.45, 0.5, 0.45, 0x8f8b80);
  }
}

/**
 * Kuromatsu — Japanische Schwarzkiefer, der Küstenbaum. Schief gewachsener
 * Stamm, waagerechte Nadelpolster statt einer runden Krone: die Form, an der
 * man eine japanische Küste erkennt.
 */
export function blackPine(k: SettlementKit, x: number, y: number, z: number, s: number, r: Rng): void {
  // Erste Fassung: drei Stammstücke und alle Polster oben — aus der Luft las
  // sich das als Palme. Eine Schwarzkiefer hat einen schiefen Stamm und
  // **waagerechte Äste**, die seitlich ausgreifen und in flachen Polstern
  // enden, in mehreren Etagen übereinander.
  const bark = jitter(0x4b3a2e, r, 0.1), dir = r() * Math.PI * 2, lean = 0.25 + r() * 0.35;
  const H = (6 + r() * 2.5) * s, tx = Math.sin(lean) * Math.cos(dir), tz = Math.sin(lean) * Math.sin(dir), ty = Math.cos(lean);
  const trunk = new CylinderGeometry(0.16 * s, 0.32 * s, H, 7);
  trunk.translate(0, H / 2, 0); trunk.applyQuaternion(Q.setFromUnitVectors(UP, DIR.set(tx, ty, tz)));
  k.add(trunk, bark, x, y, z);
  const tiers = 4 + Math.floor(r() * 3);
  for (let i = 0; i < tiers; i++) {
    const f = 0.42 + 0.58 * (i / (tiers - 1)), bx = x + tx * H * f, by = y + ty * H * f, bz = z + tz * H * f;
    const a = dir + Math.PI * (i % 2 ? 0.9 : -0.1) + (r() - 0.5) * 1.6;
    const reach = (i === tiers - 1 ? 0.3 : 1.4 + r() * 1.9 * (1 - f * 0.5)) * s;
    const ex = bx + Math.cos(a) * reach, ez = bz + Math.sin(a) * reach, ey = by + (r() * 0.5 - 0.1) * s;
    if (reach > 0.5 * s) {
      const branch = new CylinderGeometry(0.05 * s, 0.1 * s, reach, 5);
      branch.translate(0, reach / 2, 0); branch.applyQuaternion(Q.setFromUnitVectors(UP, DIR.set(ex - bx, ey - by, ez - bz).normalize()));
      k.add(branch, bark, bx, by, bz);
    }
    const pw = (1.3 + r() * 0.9) * s * (i === tiers - 1 ? 1.15 : 1);
    const pad = new SphereGeometry(1, 7, 4); pad.scale(pw, 0.38 * s, pw * (0.75 + r() * 0.3));
    k.add(pad, [0x2c4230, 0x34492f, 0x3a5034][i % 3]!, ex, ey + 0.15 * s, ez);
    const top = new SphereGeometry(1, 6, 3); top.scale(pw * 0.8, 0.16 * s, pw * 0.65);
    k.add(top, 0x55704a, ex, ey + 0.42 * s, ez);
  }
}

/**
 * Rumpf als Loft über Spanten: V-Boden, hochgezogener Bug, Spiegelheck.
 * Liefert drei Farbbänder (Antifouling, Wasserpass, Bordwand) und das Deck.
 * y 0 ist die Wasserlinie.
 */
function hull(k: SettlementKit, L: number, B: number, H: number, draft: number, colors: readonly [number, number, number], deckColor: number | null): void {
  const N = 14, stations: { z: number; b: number; top: number; bot: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + t * L;
    const b = B / 2 * (t < 0.15 ? 0.84 + t : t > 0.6 ? Math.pow(Math.max(0, (1 - t) / 0.4), 0.75) : 1);
    const top = H + 0.55 * Math.pow(Math.max(0, (t - 0.55) / 0.45), 2);
    const bot = -draft * (1 - 0.7 * Math.pow(t, 3));
    stations.push({ z, b: Math.max(0.02, b), top, bot });
  }
  const at = (s: { b: number; top: number; bot: number }, f: number): [number, number] => {
    const y = s.bot + (s.top - s.bot) * f;
    return [s.b * (0.3 + 0.7 * Math.sqrt(f)), y];
  };
  const band = (f0: number, f1: number, color: number): void => {
    const pos: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = stations[i]!, c = stations[i + 1]!;
      for (let j = 0; j < 2; j++) {
        const g0 = f0 + (f1 - f0) * j / 2, g1 = f0 + (f1 - f0) * (j + 1) / 2;
        const [a0, ay0] = at(a, g0), [a1, ay1] = at(a, g1), [c0, cy0] = at(c, g0), [c1, cy1] = at(c, g1);
        for (const s of [-1, 1]) {
          const q = [[s * a0, ay0, a.z], [s * c0, cy0, c.z], [s * c1, cy1, c.z], [s * a1, ay1, a.z]];
          const [p0, p1, p2, p3] = s < 0 ? q : [q[0]!, q[3]!, q[2]!, q[1]!];
          pos.push(...p0!, ...p1!, ...p2!, ...p0!, ...p2!, ...p3!);
        }
      }
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    k.add(g, color, 0, 0, 0);
  };
  // Wasserlinie bei y = 0 → Anteil f je Spant verschieden; ein fester Anteil genügt fürs Bild.
  const wl = draft / (draft + H);
  band(0, wl, colors[0]); band(wl, wl + 0.08, colors[1]); band(wl + 0.08, 1, colors[2]);
  // Spiegel und Deck.
  const s0 = stations[0]!, [tb, ty] = at(s0, 1), [bb, by] = at(s0, 0);
  const tr = new BufferGeometry();
  tr.setAttribute('position', new Float32BufferAttribute([-tb, ty, s0.z, tb, ty, s0.z, bb, by, s0.z, -tb, ty, s0.z, bb, by, s0.z, -bb, by, s0.z], 3));
  tr.computeVertexNormals(); k.add(tr, colors[2], 0, 0, 0);
  if (deckColor !== null) {
    const pos: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = stations[i]!, c = stations[i + 1]!, [ab, ay] = at(a, 0.97), [cb, cy] = at(c, 0.97);
      pos.push(-ab, ay, a.z, cb, cy, c.z, ab, ay, a.z, -ab, ay, a.z, -cb, cy, c.z, cb, cy, c.z);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    k.add(g, deckColor, 0, 0, 0);
  }
}

/**
 * Küstenfischerboot (~12 m), wie sie in jedem japanischen Hafen liegen:
 * weißer Rumpf, blauer Wasserpass, Steuerhaus achtern, Mast, Lampenkette.
 */
export function fishingBoat(solid: SettlementKit, glow: SettlementKit, sign: SettlementKit, flags: SettlementKit, variant: number): void {
  const stripe = [0x2d5f9e, 0x2e7c6d, 0xb03a2e][variant % 3]!;
  hull(solid, 12, 3.3, 1.35, 1.0, [0x8e3b2f, stripe, 0xf1f0ea], 0xc9ccc6);
  // Steuerhaus.
  solid.box(0, 2.3, -2.6, 2.2, 1.9, 2.6, 0xf2f1ec);
  solid.box(0, 3.3, -2.6, 2.4, 0.12, 2.9, 0xdadbd6);
  solid.box(0, 2.7, -1.28, 2.0, 0.7, 0.04, 0x28343c);
  for (const s of [-1, 1]) solid.box(s * 1.11, 2.7, -2.6, 0.04, 0.6, 2.0, 0x28343c);
  // Mast, Ausleger, Radar.
  solid.add(new CylinderGeometry(0.08, 0.1, 5.5, 6), 0xdedfdb, 0, 4.9, -2.2);
  solid.box(0, 4.0, 0.8, 0.06, 0.06, 6.2, 0xdedfdb, 0.4);
  solid.box(0, 3.7, -2.6, 1.3, 0.1, 0.3, 0x333333);
  // Reling und Bugspitze.
  for (const s of [-1, 1]) solid.box(s * 1.45, 1.75, 0.4, 0.05, 0.05, 7, 0xbfc1bd);
  // Fender aus Altreifen.
  for (const z of [-3, 0, 3]) for (const s of [-1, 1]) solid.add(new TorusGeometry(0.28, 0.1, 5, 10), 0x1b1b1b, s * 1.7, 0.9, z, 0, Math.PI / 2);
  // Tintenfischboote: Kette nackter Glühlampen über Deck.
  if (variant !== 1) for (let i = 0; i < 9; i++) {
    const z = -5 + i * 1.2;
    solid.box(0, 3.5 - Math.abs(z) * 0.05, z, 0.02, 0.02, 1.2, 0x333333);
    const g = new SphereGeometry(0.16, 6, 4); glow.add(g, 0xfff4dc, 0, 3.3 - Math.abs(z) * 0.05, z);
  }
  // Bootsname am Bug, beidseitig.
  const name = tile(T.boatName, 0, variant % 2 ? 64 : 0, 256, variant % 2 ? 128 : 64);
  for (const s of [-1, 1]) tilePlate(sign, name, s * 1.52, 1.05, 3.1, 2.3, 0.58, 'x', s, 0xffffff, 0);
  // Tairyō-bata: bunte Fangfahnen am Mast, das Erkennungszeichen eines japanischen Kutters.
  flag(flags, 0.06, 6.9, -2.2, 1.7, 1.1, [[0xd8342b, 0xf4f2ea, 0x2d5f9e, 0xf0c33a], [0xf4f2ea, 0xd8342b, 0x2e7c6d], [0x2d5f9e, 0xf0c33a, 0xd8342b, 0xf4f2ea]][variant % 3]!);
  flag(flags, 0.04, 5.3, 3.4, 1.2, 0.8, [[0xf0c33a, 0xd8342b], [0xd8342b, 0xf4f2ea], [0x2e7c6d, 0xf4f2ea]][variant % 3]!);
  solid.add(new CylinderGeometry(0.04, 0.05, 2.4, 5), 0xdedfdb, 0, 4.4, 3.4);
  // Netzhaufen und Kisten an Deck.
  solid.box(0.4, 1.55, 2.6, 1.6, 0.5, 1.8, 0x3f6b5a);
  solid.box(-0.8, 1.5, 3.8, 0.9, 0.35, 0.6, 0x2f6fb0);
}

/** Kleines Boot mit Außenborder — in jeder Funaya-Garage eins. */
export function skiff(solid: SettlementKit, variant: number): void {
  hull(solid, 6.2, 1.8, 0.75, 0.35, [0x7d3c32, [0x3a6ea5, 0x2e7c6d, 0xc58b3a][variant % 3]!, 0xeeede6], null);
  solid.box(0, 0.25, 0, 1.3, 0.05, 5.2, 0x6f685c);
  solid.box(0, 0.62, -0.2, 1.5, 0.08, 0.3, 0xd4d0c6);
  solid.box(0, 0.75, -3.25, 0.35, 0.6, 0.35, 0x2b2b2b);
  solid.box(0, 0.25, -3.35, 0.1, 0.8, 0.1, 0x3a3a3a);
  solid.box(0, 0.4, 1.2, 0.8, 0.25, 0.5, 0x2f6fb0);
}

/** Tetrapod: vier kegelige Arme entlang der Tetraederachsen. */
export function tetrapod(k: SettlementKit): void {
  const axes: [number, number, number][] = [[0, 1, 0], [0.943, -0.333, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]];
  for (const [x, y, z] of axes) {
    const g = new CylinderGeometry(0.32, 0.62, 1.55, 7); g.translate(0, 0.78, 0);
    g.applyQuaternion(Q.setFromUnitVectors(UP, DIR.set(x, y, z).normalize()));
    k.add(g, 0xb2afa6, 0, 0, 0);
  }
}

/** Figuren: Fischer (Gummistiefel, Schürze, Mütze), Katze, Möwe. */
export function fisher(k: SettlementKit): void {
  k.box(0, 1.15, 0, 0.5, 0.62, 0.3, 0x2e4a6b);
  k.box(0, 0.95, 0.16, 0.44, 0.7, 0.03, 0xe0a236);
  ball(k, 0, 1.68, 0, 0.19, 0xb88d6a, 8);
  k.box(0, 1.84, 0.02, 0.34, 0.1, 0.36, 0xe6e4dc);
  for (const s of [-1, 1]) {
    k.box(s * 0.13, 0.5, 0, 0.17, 0.62, 0.2, 0x303436);
    k.box(s * 0.13, 0.17, 0.02, 0.19, 0.34, 0.26, 0xf0eee6);
    k.box(s * 0.32, 1.08, 0.12, 0.13, 0.55, 0.13, 0x2e4a6b, -0.4);
  }
}
export function cat(k: SettlementKit): void {
  k.box(0, 0.2, 0, 0.18, 0.18, 0.42, 0xd98f4b); ball(k, 0, 0.33, 0.22, 0.1, 0xd98f4b, 6);
  for (const s of [-1, 1]) k.box(s * 0.05, 0.44, 0.24, 0.04, 0.07, 0.03, 0xd98f4b);
  k.box(0, 0.3, -0.3, 0.04, 0.04, 0.3, 0xd98f4b, -0.8);
  for (const s of [-1, 1]) for (const z of [-0.14, 0.14]) k.box(s * 0.06, 0.06, z, 0.05, 0.12, 0.05, 0xf1ece0);
}
export function gull(k: SettlementKit): void {
  k.box(0, 0, 0, 0.14, 0.12, 0.45, 0xf4f4f0);
  k.box(0, 0.02, 0.26, 0.05, 0.04, 0.1, 0xe8b33a);
  for (const s of [-1, 1]) { k.box(s * 0.36, 0.05, 0, 0.62, 0.02, 0.2, 0xb9bec2, 0, 0, s * 0.25); k.box(s * 0.7, 0.13, -0.02, 0.1, 0.02, 0.14, 0x2a2a2a, 0, 0, s * 0.25); }
}


/**
 * Gehende Figur, dreiteilig: Rumpf und zwei Beine mit dem Drehpunkt an der
 * Hüfte (y 0,82). Ein einzelnes Mesh kann nur gleiten — mit schwingenden
 * Beinen liest man es aus 30 m als „da geht jemand".
 */
export function walkerBody(k: SettlementKit, look: number, carry: boolean): void {
  // Looks 4…7: Bauern im Gassho-Weiler — Arbeitskleidung, Sugegasa-Strohhut,
  // mit `carry` eine Kiepe auf dem Rücken. Funaura nutzt nur 0…3.
  if (look >= 4) {
    const cloth = [0x2f3f5c, 0x6b5238, 0x5a6040, 0x4a6a8a][look % 4]!;
    k.box(0, 1.15, 0, 0.48, 0.62, 0.3, cloth);
    k.box(0, 0.95, 0.02, 0.5, 0.14, 0.32, 0x3a3a44);
    ball(k, 0, 1.68, 0, 0.19, 0xb88d6a, 8);
    k.box(0, 1.5, 0, 0.3, 0.06, 0.3, 0xe8e2d0);
    k.add(new ConeGeometry(0.4, 0.22, 12), 0xc9ad6c, 0, 1.9, 0);
    for (const s of [-1, 1]) k.box(s * 0.31, 1.08, 0, 0.12, 0.58, 0.13, cloth);
    if (carry) { k.add(new CylinderGeometry(0.26, 0.2, 0.62, 10), 0xa98a5a, 0, 1.2, -0.34); k.box(0, 1.52, -0.34, 0.46, 0.06, 0.4, 0x6f8a3a); }
    k.box(0, 0.86, 0, 0.46, 0.14, 0.26, 0x3a3a44);
    return;
  }
  const jacket = [0x2e4a6b, 0x6b3a2e, 0x3f5a48, 0xd9a321][look % 4]!;
  k.box(0, 1.15, 0, 0.5, 0.62, 0.3, jacket);
  if (look % 2 === 0) k.box(0, 0.98, 0.16, 0.44, 0.66, 0.03, 0xe0a236);
  ball(k, 0, 1.68, 0, 0.19, 0xb88d6a, 8);
  if (look % 3 === 0) k.box(0, 1.84, 0.02, 0.34, 0.1, 0.36, 0xe6e4dc);
  else k.add(new CylinderGeometry(0.24, 0.28, 0.08, 10), 0x35404a, 0, 1.86, 0);
  if (carry) {
    for (const s of [-1, 1]) k.box(s * 0.28, 1.15, 0.28, 0.12, 0.12, 0.5, jacket, 0.2);
    k.box(0, 1.12, 0.52, 0.72, 0.3, 0.46, 0x2f6fb0);
    k.box(0, 1.28, 0.52, 0.6, 0.04, 0.36, 0xc5ccd0);
  } else for (const s of [-1, 1]) k.box(s * 0.31, 1.08, 0, 0.12, 0.58, 0.13, jacket);
  k.box(0, 0.86, 0, 0.46, 0.14, 0.26, 0x303436);
}
export function walkerLeg(k: SettlementKit): void {
  k.box(0, -0.3, 0, 0.17, 0.6, 0.2, 0x303436);
  k.box(0, -0.66, 0.03, 0.19, 0.34, 0.26, 0xf0eee6);
}
