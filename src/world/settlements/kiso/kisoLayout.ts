/**
 * Kiso-Juku — Poststation am Pass (docs/DOERFER.md §3). Vorbilder Tsumago,
 * Magome und Narai im Kiso-Tal am Nakasendō: dunkles Zedernholz, vorkragendes
 * Obergeschoss, Bretterdächer mit Steinen, weiße Putzfelder, eine Straße, die
 * am Hang hinaufsteigt. Referenzbilder: C:\Users\Leandro\Downloads\towns\bergdorf\.
 *
 * **Die Rennstrecke führt durch das Dorf** (Narai-Modell) und bleibt, wie sie
 * ist: nichts steht in ±4,25 m um die Mittellinie des `toge`, keine Kollision,
 * kein Rebake. Das Dorf ist in Straßenkoordinaten gebaut — `s` Bogenlänge auf dem
 * `toge`, `o` Abstand von der Mittellinie, **positiv zur Talseite (Westen)**.
 *
 * Gelände gemessen am 2026-09-26 (`height.r16`, relativ zur Mittellinie):
 * - Talseite: flach (±1,5 m) bis 30 m hinaus zwischen s 1720 und 1890; an den
 *   Enden ein Wall, bei s 1670 und 1940 bei o = 16 m schon +4…7 m.
 * - Hangseite: steigt ab o = −5,5 m; bei o = −10 m +1…3 m (Mitte) bis +6 m
 *   (Enden), bei o = −20 m +7…16 m, bei −40 m +20…26 m. Häuser dort nur 6…7 m
 *   tief — die Rückseite steht im Hang, wie in Magome.
 * - Die Straße steigt gleichmäßig 8,35 % (1,67 m je 20 m), gerade bis s ≈ 1845,
 *   dort ein Knick um 12° nach Norden, gerade bis s ≈ 1965.
 */

/** Mittellinie des `toge`, alle 20 m (roads.json, 2026-09-26). [s, x, y, z]. Zur Laufzeit ersetzt durch die echte (`useRoadAxis`). */
const AXIS_20: readonly (readonly [number, number, number, number])[] = [
  [1560, -1273.70, 118.21, -832.95], [1580, -1280.44, 119.89, -851.70], [1600, -1287.18, 121.56, -870.46], [1620, -1293.92, 123.23, -889.21],
  [1640, -1300.66, 124.90, -907.96], [1660, -1307.40, 126.58, -926.72], [1680, -1314.13, 128.25, -945.47], [1700, -1320.88, 129.92, -964.22],
  [1720, -1327.61, 131.59, -982.98], [1740, -1334.35, 133.26, -1001.73], [1760, -1341.09, 134.94, -1020.48], [1780, -1347.83, 136.61, -1039.24],
  [1800, -1354.57, 138.28, -1057.99], [1820, -1361.31, 139.95, -1076.74], [1840, -1368.06, 141.63, -1095.49], [1860, -1372.17, 143.30, -1114.92],
  [1880, -1374.99, 144.97, -1134.65], [1900, -1377.81, 146.64, -1154.37], [1920, -1380.63, 148.31, -1174.10], [1940, -1383.44, 149.99, -1193.83],
  [1960, -1386.27, 151.66, -1213.56], [1980, -1386.07, 153.33, -1233.37], [2000, -1383.77, 155.00, -1253.16], [2020, -1381.47, 156.68, -1272.95],
  [2040, -1379.17, 158.35, -1292.75],
];

let axis: { s0: number; step: number; pts: readonly (readonly [number, number, number])[] } = {
  s0: 1560, step: 20, pts: AXIS_20.map(([, x, y, z]) => [x, y, z] as const),
};

/**
 * Die echte Mittellinie einsetzen (2 m Abstand, aus `drive.roads`). Die 20-m-Tabelle
 * oben liegt auf den Geraden exakt, im Knick bei s 1850 bis zu 0,3 m daneben —
 * genug, dass eine Rinne auf dem Asphalt läge.
 */
export function useRoadAxis(centerline: ArrayLike<number>, spacing: number): void {
  const pts: [number, number, number][] = [];
  const i0 = Math.floor(1540 / spacing), i1 = Math.min(centerline.length / 3 - 1, Math.ceil(2060 / spacing));
  for (let i = i0; i <= i1; i++) pts.push([centerline[i * 3]!, centerline[i * 3 + 1]!, centerline[i * 3 + 2]!]);
  axis = { s0: i0 * spacing, step: spacing, pts };
}

export interface Frame { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number }

/**
 * Punkt und Richtung auf der Mittellinie bei `s`. `n` zeigt zur Talseite:
 * mit Fahrtrichtung (tx, tz) ist n = (tz, −tx) — bei s 1800 (−0,94 | 0,34), also
 * nach Westen. Nachgerechnet am Gelände: +o bleibt flach, −o steigt.
 */
export function frame(s: number): Frame {
  const { s0, step, pts } = axis;
  const f = Math.max(0, Math.min(pts.length - 1.0001, (s - s0) / step)), i = Math.floor(f), t = f - i;
  const a = pts[i]!, b = pts[i + 1]!;
  // Richtung über ±1 Stützstelle geglättet, sonst springt die Tangente an jedem Knoten.
  const pa = pts[Math.max(0, i - 1)]!, pb = pts[Math.min(pts.length - 1, i + 2)]!;
  let tx = pb[0] - pa[0], tz = pb[2] - pa[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, tx, tz, nx: tz, nz: -tx };
}

/** Weltpunkt aus Straßenkoordinaten. */
export function at(s: number, o: number): [number, number] {
  const f = frame(s); return [f.x + f.nx * o, f.z + f.nz * o];
}

/** Gierwinkel eines Hauses, dessen lokale Front (+z) zur Straße schaut. */
export function faceRoad(s: number, side: 1 | -1): number {
  const f = frame(s); return Math.atan2(-f.nx * side, -f.nz * side);
}

/** Pin für Karte, Sichtbarkeit und Hinweistext. */
export const KISO = { x: -1352, z: -1052, s0: 1668, s1: 1952 } as const;

/** Halbe Asphaltbreite des `toge` inkl. Bankett (6,5 m + 2 × 1 m). Bis hierher steht nichts. */
export const ROAD_HALF = 4.25;
/** Rinne 4,25…4,9, Gehweg 4,9…6,4, Hausfront bei 6,4 m. */
export const GUTTER = [4.25, 4.9] as const;
export const FRONT = 6.4;

export type KisoRoof = 'kawara' | 'ishi' | 'sheet';
export type KisoRole =
  | 'home' | 'inn' | 'shop' | 'soba' | 'gohei' | 'sake' | 'crafts' | 'post' | 'waki' | 'sweets' | 'lacquer';
export type KisoKind = 'hira' | 'tsuma' | 'kura';

/**
 * Häuserzeile: [Breite, Art, Dach, Rolle, Tiefe]. Hintereinander ab `start`
 * gesetzt, mit 0,3…0,9 m Fuge; eine Zahl allein ist eine Lücke (Gasse, Hof).
 * Hirairi (First parallel zur Straße) ist die Regel am Nakasendō; ein paar
 * Tsumairi (Giebel zur Straße) geben die weißen Putzdreiecke mit schwarzem
 * Fachwerk, die in Tsumago das Bild machen.
 */
type Row = (readonly [number, KisoKind, KisoRoof, KisoRole, number] | number)[];

/** Talseite (West, +o): tief, flach, Gärten und Speicher dahinter. */
const VALLEY: Row = [
  [9, 'hira', 'ishi', 'home', 11], [10.5, 'tsuma', 'kawara', 'inn', 13], [8, 'hira', 'sheet', 'gohei', 10], [11, 'hira', 'kawara', 'inn', 13],
  4.2,
  [9, 'hira', 'ishi', 'crafts', 11], [7, 'kura', 'kawara', 'home', 8], [12, 'hira', 'kawara', 'waki', 14],
  // Honjin: Tor, Mauer, Vorhof — steht eigenständig (HONJIN), hier nur die Lücke.
  30,
  [10, 'hira', 'ishi', 'soba', 12], [9, 'tsuma', 'sheet', 'home', 11], [10.5, 'hira', 'kawara', 'sake', 13],
  5,
  [8, 'hira', 'ishi', 'home', 10], [11, 'hira', 'kawara', 'inn', 13], [9, 'hira', 'sheet', 'post', 11], [10, 'tsuma', 'ishi', 'home', 12],
  [8.5, 'hira', 'kawara', 'sweets', 11], [10, 'hira', 'ishi', 'inn', 12],
  4.5,
  [9, 'hira', 'sheet', 'home', 11], [11.5, 'hira', 'kawara', 'inn', 12], [8, 'tsuma', 'kawara', 'home', 10], [9.5, 'hira', 'ishi', 'lacquer', 11],
  [9, 'hira', 'kawara', 'home', 10],
];

/** Hangseite (Ost, −o): flach gebaut, Rückseite im Hang. */
const HILL: Row = [
  [8, 'hira', 'ishi', 'home', 6.5], [10, 'hira', 'kawara', 'inn', 7], [9, 'tsuma', 'sheet', 'shop', 7], [11, 'hira', 'ishi', 'home', 7],
  [8, 'hira', 'kawara', 'sweets', 7], [9.5, 'hira', 'ishi', 'home', 7],
  // Steingasse bergauf (STAIR) mit Wasserrad.
  11,
  [10, 'hira', 'kawara', 'soba', 7], [9, 'hira', 'ishi', 'home', 7], [12, 'hira', 'kawara', 'inn', 7.5], [6.5, 'kura', 'kawara', 'home', 6.5],
  [10, 'tsuma', 'ishi', 'home', 7], [9, 'hira', 'sheet', 'shop', 7],
  4,
  [11, 'hira', 'ishi', 'inn', 7], [9, 'hira', 'kawara', 'home', 6.5], [8.5, 'tsuma', 'kawara', 'crafts', 6.5], [10, 'hira', 'ishi', 'home', 6.5],
  [9, 'hira', 'sheet', 'home', 6],
  3.5,
  [8, 'hira', 'ishi', 'home', 6], [10, 'hira', 'kawara', 'inn', 6], [7, 'kura', 'kawara', 'home', 6], [9, 'tsuma', 'ishi', 'home', 6],
];

export interface KisoHouse {
  s: number; side: 1 | -1; w: number; d: number; kind: KisoKind; roof: KisoRoof; role: KisoRole; seed: number;
  /**
   * Rücksprung der Front hinter die Gehwegkante (m). Ein Drittel der Wohnhäuser auf
   * der Talseite hat einen kleinen Vorgarten — in Tsumago steht keine Zeile in einer
   * Flucht, und die Kiefer vor dem weißen Giebel ist das Bild aus dem Referenzfoto.
   */
  setback: number;
  /** Eingeschossig (siehe `KisoSpec.low`). */
  low: boolean;
}

function row(list: Row, side: 1 | -1, start: number, seed: number): KisoHouse[] {
  const out: KisoHouse[] = [];
  let s = start, r = seed >>> 0;
  const rnd = (): number => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  for (const e of list) {
    if (typeof e === 'number') { s += e; continue; }
    const [w, kind, roof, role, d] = e;
    // Flucht: jedes dritte Haus springt zurück (Talseite bis 2,2 m, mit Vorgarten, Hangseite
    // bis 0,9 m), jedes fünfte steht 30 cm vor der Linie. Mit einer Flucht über 280 m lasen
    // sich beide Zeilen wie gestanzt (Rückmeldung 2026-09-26).
    const roll = rnd();
    const setback = kind === 'kura' ? 0 : roll < 0.34 ? (side > 0 ? 0.9 + rnd() * 1.3 : 0.4 + rnd() * 0.5) : roll < 0.54 ? -0.3 : 0;
    const low = kind === 'hira' && (role === 'home' || role === 'crafts') && rnd() < 0.3;
    out.push({ s: s + w / 2, side, w, d: Math.min(d, 14 - Math.max(0, setback)), kind, roof, role, seed: (seed + out.length * 977) >>> 0, setback, low });
    s += w + 0.3 + (rnd() < 0.2 ? 1.2 + rnd() * 1.4 : rnd() * 0.6);
  }
  return out;
}

export const HOUSES: readonly KisoHouse[] = [...row(VALLEY, 1, 1684, 0x4b150), ...row(HILL, -1, 1692, 0x7a11)];

/**
 * Honjin (本陣): der Gasthof der Daimyō. Putzmauer mit Tor an der Straße, Vorhof
 * mit Kiefer und Steinlaterne, das Haupthaus 14 m zurückgesetzt — und als
 * einziges Haus begehbar (Doma, Tatami, Irori). s ist die Mitte der Lücke in VALLEY.
 */
export const HONJIN = (() => {
  const waki = HOUSES.find(h => h.role === 'waki')!;
  const s = waki.s + waki.w / 2 + 0.6 + 15;
  return { s, w: 28, wallO: FRONT + 0.2, houseO: 17.5, houseW: 17, houseD: 11 } as const;
})();

/**
 * Steingasse (Magome-Modell) von der Straße den Hang hinauf, dann die obere
 * Gasse entlang zum Tempel und zum Teehaus mit Aussicht. [s, o] in Straßen-
 * koordinaten; die Höhe folgt dem Gelände, Stufen wo es steiler als 12 % wird.
 */
export const STAIR = (() => {
  const gap = HOUSES.filter(h => h.side === -1).find((h, i, a) => a[i + 1] && a[i + 1]!.s - a[i + 1]!.w / 2 - (h.s + h.w / 2) > 9)!;
  const s = gap.s + gap.w / 2 + 5.8;
  // Gerade den Hang hinauf am Ostrand der Lücke, dann hinter dem Nachbarhaus entlang.
  // Die erste Fassung bog bei o = −12,5 ab und lief durch die Ecke des Soba-Hauses —
  // gefunden vom Messlauf (die Figur blieb dort stehen), im Bild sah es richtig aus.
  const foot = s + 2.5;
  return { s, foot, pts: [[foot, -5.2], [foot, -9.5], [foot, -15.2], [s + 14, -18], [s + 30, -21], [s + 46, -24], [s + 62, -26.5], [s + 82, -27.5], [s + 100, -28]] as const };
})();

/** Wasserrad an der Steingasse — wie in Magome direkt am Weg. [s, o, Radius] */
export const WHEEL = { s: STAIR.s - 3.2, o: -8.5, r: 1.7 } as const;

/**
 * Oben am Hang gibt es keine ebene Stelle — gemessen 30…35° von der Hausrücken-
 * linie bis 60 m hinauf. Ein Tempel auf einer Steinplattform hätte talseitig 9 m
 * Mauer gebraucht und bergseitig das Gelände durchs Dach gestoßen. Deshalb baut
 * das Dorf wie am Hang üblich: Glockenturm auf kleiner Ishigaki-Plattform, das
 * Teehaus auf Stelzen (Kakezukuri) talseitig der Gasse, Blick über die Dächer.
 */
export const BELL = { s: STAIR.s + 50, o: -31 } as const;
/** Teehaus (Tateba-chaya) mit Strohdach; Front (lokal +z) zum Tal, Zugang von der Gasse. */
export const TEAHOUSE = { s: STAIR.s + 92, o: -20.5, w: 8.5, d: 6.5 } as const;
/** Kleiner Schrein (Hokora) mit Torii am Ende der oberen Gasse. */
export const HOKORA = { s: STAIR.s + 104, o: -31 } as const;

/** Kōsatsu-ba (Anschlagtafel) am unteren Ortseingang, Hangseite — so stand es in jeder Poststation. */
export const KOSATSU = { s: 1682, o: -7.2 } as const;
/** Ortsschild und Wegstein (Nakasendō) an beiden Enden, Talseite. */
export const GATES = [{ s: 1674, side: 1 as const }, { s: 1950, side: -1 as const }] as const;

/**
 * Hinterland der Talseite: eine alte Hintergasse, Speicher, Schuppen, Gemüse,
 * ein Friedhof. [s, o, Breite, Tiefe, Art].
 */
export type BackKind = 'kura' | 'shed' | 'house';
// Die Talhäuser sind bis 14 m tief (Rückwand bei o ≈ 20,4), der Honjin reicht bis o ≈ 25,5:
// die Hintergasse liegt deshalb bei 23,5 und ist am Honjin unterbrochen.
export const BACK: readonly (readonly [number, number, number, number, BackKind])[] = [
  [1712, 30, 6, 7, 'kura'], [1728, 31.5, 9, 7, 'house'], [1742, 29, 5, 4, 'shed'], [1834, 30.5, 6, 7, 'kura'],
  [1848, 32, 10, 7, 'house'], [1864, 29.5, 5, 4, 'shed'], [1880, 31.5, 9, 7, 'house'], [1800, 40, 6, 7, 'kura'],
];
export const BACK_LANES: readonly (readonly (readonly [number, number])[])[] = [
  [[1692, 23.5], [1720, 24], [1752, 23.5]],
  [[1794, 27.5], [1815, 24], [1850, 24], [1893, 23.5]],
];
export const GARDENS: readonly (readonly [number, number, number, number])[] = [
  [1757, 31, 11, 6], [1818, 32, 10, 7], [1897, 31, 9, 6], [1722, 41, 8, 6],
];
/** Kleiner Friedhof am Talrand (im Luftbild von Tsumago unübersehbar). [s, o] Mitte, 7 × 5 Reihen. */
export const CEMETERY = { s: 1776, o: 42 } as const;

/** Momiji (Ahorn im Herbst), Kiefern in Wolkenschnitt (Niwaki), Kaki, Zedernwald. [s, o, Größe] */
export const MOMIJI: readonly (readonly [number, number, number])[] = [
  [1700, -9.5, 1], [1760, 18, 1.1], [1809, 24, 0.9], [1856, 17.5, 1], [1905, -8.8, 0.9], [1936, 14, 1.2],
  [STAIR.s + 20, -26.5, 1.1], [STAIR.s + 70, -31, 1], [STAIR.s + 34, -22, 0.85],
];
export const NIWAKI: readonly (readonly [number, number, number])[] = [
  [HONJIN.s - 8, 11.5, 1.2], [HONJIN.s + 9, 12.5, 1], [1735, 17, 0.8], [1873, 16.5, 0.9], [STAIR.s + 52, -30.5, 1.1],
];
export const KAKI_TREES: readonly (readonly [number, number, number])[] = [
  [1745, 34, 0.9], [1826, 36, 1], [1886, 35, 0.85], [1716, 33, 0.8],
];

/** Zedernwald am Hang über dem Dorf und am Talrand. */
export const FOREST: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  let seed = 0x5a91;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Hangwald: oberhalb der Hausrücken, unter- und oberhalb der oberen Gasse.
  // Bis 90 m vor und hinter das Dorf: an den Zufahrten stand sonst nackter Fels (Rückmeldung 2026-09-26).
  for (let i = 0; i < 170; i++) {
    const s = 1580 + rnd() * 460, o = -(12 + rnd() * 52);
    out.push([s, o, 0.75 + rnd() * 0.5]);
  }
  // Talrand westlich des Hinterlands.
  for (let i = 0; i < 34; i++) out.push([1675 + rnd() * 280, 56 + rnd() * 28, 0.8 + rnd() * 0.4]);
  return out;
})();

type Add = (x: number, z: number, r: number) => void;

function inStrip(s: number, o: number): boolean {
  if (s < KISO.s0 - 6 || s > KISO.s1 + 6) return false;
  return o > -16 && o < 22;
}

/**
 * Freihaltung für Streuung und Props. Nutzt die 20-m-Tabelle der Mittellinie
 * (die Streuung läuft, bevor das Dorf die echte Straße kennt) — im Knick bis
 * 0,3 m daneben, deshalb die Radien großzügig.
 */
export function kisoClearance(add: Add): void {
  // Straßenband mit beiden Häuserzeilen, alle 5 m.
  for (let s = KISO.s0 - 6; s <= KISO.s1 + 6; s += 5) {
    for (const o of [-12, -6, 6, 13, 19]) { const [x, z] = at(s, o); add(x, z, 6.5); }
  }
  // Zufahrten: Mauerfuß, Wegweiser, Masten — schmal, der Hang dahinter behält sein Gras.
  for (let s = 1580; s <= 2042; s += 6) for (const o of [-6, 6]) { const [x, z] = at(s, o); add(x, z, 2.2); }
  for (const h of HOUSES) { const [x, z] = at(h.s, h.side * (FRONT + h.d / 2)); add(x, z, Math.hypot(h.w, h.d) / 2 + 1); }
  { const [x, z] = at(HONJIN.s, HONJIN.houseO); add(x, z, 17); }
  // Steingasse dicht abgetastet: die Stützpunkte liegen bis 20 m auseinander.
  for (let i = 1; i < STAIR.pts.length; i++) {
    const [s0, o0] = STAIR.pts[i - 1]!, [s1, o1] = STAIR.pts[i]!, n = Math.ceil(Math.hypot(s1 - s0, o1 - o0) / 3);
    for (let j = 0; j <= n; j++) { const [x, z] = at(s0 + (s1 - s0) * j / n, o0 + (o1 - o0) * j / n); add(x, z, 4); }
  }
  { const [x, z] = at(TEAHOUSE.s, TEAHOUSE.o); add(x, z, 8); }
  { const [x, z] = at(HOKORA.s, HOKORA.o); add(x, z, 4); }
  { const [x, z] = at(BELL.s, BELL.o); add(x, z, 4); }
  for (const [s, o, w, d] of BACK) { const [x, z] = at(s, o); add(x, z, Math.hypot(w, d) / 2 + 2); }
  for (const [s, o, w, d] of GARDENS) { const [x, z] = at(s, o); add(x, z, Math.hypot(w, d) / 2 + 1); }
  for (const lane of BACK_LANES) for (const [s, o] of lane) { const [x, z] = at(s, o); add(x, z, 4); }
  { const [x, z] = at(CEMETERY.s, CEMETERY.o); add(x, z, 9); }
  for (const [s, o] of [...MOMIJI, ...NIWAKI, ...KAKI_TREES]) { const [x, z] = at(s, o); add(x, z, 3.5); }
}

/** Liegt ein Weltpunkt im Dorfband? Für Props, die dort nicht stehen sollen (Leitpfosten). */
export function inKiso(x: number, z: number): boolean {
  // Grobe Projektion auf die Achse: die nächste 20-m-Stützstelle genügt für ±20 m.
  let best = Infinity, bs = 0;
  for (let s = KISO.s0 - 10; s <= KISO.s1 + 10; s += 4) { const f = frame(s), d = Math.hypot(f.x - x, f.z - z); if (d < best) { best = d; bs = s; } }
  const f = frame(bs), o = (x - f.x) * f.nx + (z - f.z) * f.nz;
  return inStrip(bs, o);
}
