/**
 * Stillwater als Gassho-Weiler — docs/DOERFER.md §2. Vorbild Shirakawa-gō
 * (Ogimachi) und Miyama: steile Strohdreiecke zwischen Reisfeldern, alle
 * Firste in dieselbe Richtung, dahinter der Berg.
 *
 * Gelände gemessen am 2026-09-25 (`height.r16`): der Westfluss läuft bei
 * x ≈ −1218 nach Süden, Wasserspiegel 19,87 m, Halbbreite 12,7 m. Westlich
 * liegen zwischen Mill Lane und Hang 21,6…27 m, östlich eine große, fast ebene
 * Terrassenfläche auf 22,2…24,6 m bis x ≈ −1100 — genau das Bild von Ogimachi,
 * das auf dem Talboden neben dem Shō-Fluss liegt. Dorthin kommt der Kern.
 *
 * Koordinaten: x Ost, z Süd. Kein Rebake (CLAUDE.md, 66,82 %).
 */

/** Pin für Karte, Sichtbarkeit und Hinweistext: Mitte zwischen Mühle und Ostkern. */
export const GASSHO = { x: -1190, z: 360 } as const;

export type GasshoKind = 'gassho' | 'kayabuki' | 'kura';
/**
 * [x, z, Breite quer zum First, Länge entlang des Firsts, Gierwinkel, Art, Rolle].
 * First bei Gierwinkel 0 entlang z (Nord–Süd), Eingang auf lokal +x.
 * Alle Firste Nord–Süd: in Shirakawa-gō stehen die Häuser so, damit beide
 * Dachflächen gleich viel Sonne bekommen und der Talwind am Giebel vorbeistreicht —
 * und genau diese Gleichrichtung macht aus 20 Häusern ein Dorfbild.
 */
export type GasshoRole = 'home' | 'minshuku' | 'soba' | 'shop' | 'hero';
export type GasshoHouse = readonly [number, number, number, number, number, GasshoKind, GasshoRole];

export const HOUSES: readonly GasshoHouse[] = [
  // ── Ostkern an der neuen Dorfstraße (westliche Zeile, Eingang nach Osten) ──
  [-1191, 274, 10, 16, 0.02, 'gassho', 'home'],
  [-1192, 311, 11, 18, -0.03, 'gassho', 'soba'],
  [-1190, 377, 10, 17, 0.02, 'gassho', 'home'],
  [-1193, 402, 5, 7, 0, 'kura', 'home'],
  [-1190, 428, 11, 17, -0.02, 'gassho', 'home'],
  // ── östliche Zeile, Eingang nach Westen ──
  [-1156, 281, 11, 18, Math.PI + 0.03, 'gassho', 'home'],
  [-1155, 318, 10, 16, Math.PI - 0.02, 'gassho', 'home'],
  [-1157, 352, 10, 13, Math.PI, 'kayabuki', 'minshuku'],
  [-1154, 392, 12.5, 21, Math.PI + 0.01, 'gassho', 'hero'],
  [-1156, 434, 10, 16, Math.PI - 0.03, 'gassho', 'shop'],
  // ── zweite Reihe dahinter, über Feldwege ──
  [-1126, 298, 10, 16, Math.PI + 0.02, 'gassho', 'home'],
  [-1130, 334, 5, 7, Math.PI, 'kura', 'home'],
  [-1124, 362, 11, 18, Math.PI - 0.02, 'gassho', 'home'],
  [-1127, 418, 10, 17, Math.PI + 0.03, 'gassho', 'home'],
  // ── an der Mill Lane, westlich (Eingang zur Lane = Osten) ──
  [-1291, 305, 10, 16, 0.03, 'gassho', 'home'],
  [-1293, 339, 9, 12, -0.02, 'kayabuki', 'home'],
  [-1296, 361, 10, 14, 0.02, 'gassho', 'home'],
  // ── zwischen Lane und Fluss (Eingang zur Lane = Westen) ──
  [-1250, 300, 10, 16, Math.PI - 0.02, 'gassho', 'home'],
  [-1247, 331, 5, 7, Math.PI, 'kura', 'home'],
  [-1250, 352, 9, 12, Math.PI + 0.02, 'kayabuki', 'home'],
];

/**
 * Dorfstraße durch den Ostkern. Beide Enden werden zur Laufzeit auf die
 * nächste Stelle der Mill Lane gezogen (siehe `GasshoHamlet.#buildStreet`),
 * die Knoten hier sind der Verlauf dazwischen.
 */
export const STREET: readonly (readonly [number, number])[] = [
  [-1195, 234], [-1185, 258], [-1177, 292], [-1173, 330], [-1171, 370], [-1172, 410], [-1174, 446], [-1176, 469],
];
export const STREET_WIDTH = 6;

/**
 * Dreifach-Wasserrad (Asakura Sanrensui) am Ostufer. Die Räder tauchen in den
 * Fluss und schöpfen Wasser in eine hochliegende Rinne, die es auf die
 * Terrasse trägt — so arbeitet das Vorbild wirklich (es hebt, es treibt nicht).
 * Achse quer zum Fluss (x), Räder hintereinander flussabwärts.
 */
// Radien flussabwärts wachsend: die Rinne fällt nach Norden zum kleinsten Rad (GasshoHamlet.#buildWheels).
export const WHEELS = { x: -1206.2, z0: 334, radii: [2.35, 2.55, 2.8] as const, gap: 1.5 } as const;
export const RIVER_Y = 19.87;

/** Hasa-gake (Reistrockengestelle): [x0, z0, x1, z1, Lagen]. Am Feldrand, nie auf einem Weg. */
export const RACKS: readonly (readonly [number, number, number, number, number])[] = [
  [-1142, 262, -1110, 262, 6], [-1108, 318, -1108, 346, 5], [-1142, 384, -1112, 384, 6],
  [-1106, 432, -1106, 456, 5], [-1320, 282, -1320, 300, 5], [-1240, 268, -1240, 286, 4],
  [-1140, 450, -1118, 450, 5],
];

/** Hōsui-koya — kleine Feuerwehrhütten mit eigenem Strohdach, typisch Ogimachi. */
export const FIRE_HUTS: readonly (readonly [number, number, number])[] = [
  [-1180, 296, 0], [-1165, 364, Math.PI], [-1181, 412, 0], [-1167, 456, Math.PI], [-1263, 318, Math.PI], [-1140, 316, Math.PI],
];

/** Kakibäume (Persimonen, orange Früchte) an den Häusern. */
export const KAKI: readonly (readonly [number, number, number])[] = [
  [-1170, 262, 1], [-1204, 292, 0.9], [-1167, 300, 0.85], [-1180, 392, 1.1], [-1142, 374, 1], [-1112, 300, 0.9],
  [-1140, 420, 0.95], [-1279, 322, 0.9], [-1305, 322, 1], [-1236, 316, 0.85], [-1286, 352, 0.8],
  // Anstelle der drei Kugelbäume an der Mühle.
  [-1267, 378, 0.9], [-1231, 421, 0.8], [-1281, 409, 0.9],
];

/** Sugi-Haine (Zeder): Rücken am Westhang und am Ostrand, Schrein im Nordosten. */
export const SUGI: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  let seed = 0x5091;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 26; i++) out.push([-1345 + rnd() * 36, 300 + rnd() * 130, 0.8 + rnd() * 0.45]);
  for (let i = 0; i < 14; i++) out.push([-1098 + rnd() * 14, 270 + rnd() * 190, 0.75 + rnd() * 0.4]);
  // Schreinhain.
  for (let i = 0; i < 9; i++) out.push([-1118 + rnd() * 20, 244 + rnd() * 18, 0.95 + rnd() * 0.35]);
  return out;
})();

/** Bambushaine: [x, z, Halme]. */
export const BAMBOO: readonly (readonly [number, number, number])[] = [
  [-1310, 326, 22], [-1238, 368, 16], [-1100, 400, 20], [-1205, 446, 14],
];

/** Kleiner Hachiman-Schrein am Nordostrand, Torii zur Dorfstraße. */
export const SHRINE = { x: -1110, z: 252, yaw: -Math.PI / 2 } as const;

/** Sechs Jizō unter einem Dach am nördlichen Ortseingang. */
// Nicht an der Straße: an (−1188 | 246) stand das Kollisionskästchen auf der
// Fahrbahn, und der Fahrtest blieb nach 7 m stehen.
export const JIZO = { x: -1178, z: 240, yaw: -Math.PI / 2 } as const;

/** Feldwege (zu Fuß und für Kei-Trucks), jeweils von der Dorfstraße abzweigend. */
export const PATHS: readonly (readonly (readonly [number, number])[])[] = [
  [[-1172, 336], [-1150, 336], [-1138, 336]],
  [[-1172, 404], [-1146, 408], [-1136, 400], [-1124, 392]],
  [[-1176, 300], [-1152, 299], [-1136, 300]],
  // Zum Wasserrad hinunter.
  [[-1173, 345], [-1188, 346], [-1198, 344]],
];

type Add = (x: number, z: number, r: number) => void;

function line(add: Add, pts: readonly (readonly [number, number])[], r: number): void {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!, steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
    for (let j = 0; j <= steps; j++) add(ax + (bx - ax) * j / steps, az + (bz - az) * j / steps, r);
  }
}

/** Freihaltung für Streuung und Props: kein Baum im Strohdach, kein Gras durch die Straße. */
export function gasshoClearance(add: Add): void {
  for (const [x, z, w, d] of HOUSES) add(x, z, Math.hypot(w + 5, d + 4) / 2 + 1.5);
  line(add, STREET, 5);
  for (const p of PATHS) line(add, p, 2.5);
  for (const [x0, z0, x1, z1] of RACKS) line(add, [[x0, z0], [x1, z1]], 2.2);
  for (const [x, z] of FIRE_HUTS) add(x, z, 2);
  for (const [x, z] of KAKI) add(x, z, 3.5);
  for (const [x, z] of BAMBOO) add(x, z, 4);
  add(SHRINE.x, SHRINE.z, 9); add(JIZO.x, JIZO.z, 3.5);
  add(WHEELS.x + 4, WHEELS.z0 + 8, 11);
}

/**
 * Trockener Rand um jede Hofterrasse: die Reismaske (`paddy.png`) deckt den
 * ganzen Talboden, und im ersten Luftbild stand jedes Haus wie ein Floß im
 * Wasser — Steinmauer direkt im Reisfeld, auf allen vier Seiten. In Ogimachi
 * grenzt ein Feld an eine Hausseite, nicht an alle. Ein Meter Damm um den Hof
 * genügt; die Felder dazwischen bleiben nass. Laufzeit statt Rebake (CLAUDE.md).
 * Die Hofmaße müssen zu `GasshoHamlet.#buildHouses` passen (vorn 3,6 bzw. 2,2 m,
 * seitlich 1,8, hinten 1,2).
 */
export function gasshoDry(x: number, z: number): boolean {
  for (const [hx, hz, w, d, yaw, kind] of HOUSES) {
    const dx = x - hx, dz = z - hz;
    if (dx * dx + dz * dz > (w + d) * (w + d)) continue;
    const c = Math.cos(yaw), s = Math.sin(yaw), u = dx * c - dz * s, v = dx * s + dz * c;
    const front = kind === 'kura' ? 2.2 : 3.6;
    if (u > -w / 2 - 2.4 && u < w / 2 + front + 1.2 && Math.abs(v) < d / 2 + 3) return true;
  }
  return false;
}
