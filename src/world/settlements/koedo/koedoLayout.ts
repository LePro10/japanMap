/**
 * Koedo — Kura-Handelsstädtchen (docs/DOERFER.md §4). Vorbilder Kawagoe
 * („Koedo“, Ichibangai: schwarze Lehmputz-Kura mit schweren Dächern) und
 * Kurashiki Bikan (weiße Kura mit Namako-Gitter am steingefassten Kanal).
 * Referenzbilder: C:\Users\Leandro\Downloads\towns\dorf\.
 *
 * **Lage, gemessen am 2026-09-26 (`height.r16`, `roads.json`):**
 * - Die `dorf`-Straße (5 m, village) kommt aus den Reisfeldern im Nordwesten auf
 *   einem Damm und endet als Sackgasse bei (−190 | 90) auf 34,1 m. Dort endet auch
 *   die Terrace Track (Schotter-Event, `settlementLayout.ts`) — beide bleiben
 *   unverändert: kein Rebake, keine Kollision auf der Fahrbahn.
 * - Westlich liegt die Reisebene auf 24…27 m (Parzellenböden in Stufen), östlich
 *   steigt der Hang auf 45…55 m; oben beginnt 170 m weiter die Tokioter Vorstadt.
 *   Koedo liegt genau auf dem Übergang: Reisfeld → Kanal → Kura → Hang → Stadt.
 * - Das Gelände ist erodiert und buckelig (±1,5 m auf 10 m). Alles, was eben sein
 *   muss (Straße B, Kanal, Promenade, Platz), steht deshalb auf eigenen Flächen
 *   über dem höchsten Punkt seines Grundrisses, mit Mauern wo es abfällt.
 *
 * **Aufbau als eine Straße in Straßenkoordinaten** wie Kiso-Juku: `s` Bogenlänge,
 * `o` Abstand zur Mittellinie, **+o links der Fahrtrichtung**. Bis `JOIN` ist die
 * Achse die `dorf`-Straße selbst (Straße A, Ichibangai mit Autoverkehr), danach
 * biegt sie am Platz nach Süden ab (Straße B, neu, eigene Fläche). An der
 * Biegung liegt außen (+o) der Platz mit dem Glockenturm — wer die Dorfstraße
 * hinauffährt, schaut genau auf ihn.
 *
 * Norden ist −z (CLAUDE.md). Straße A läuft nach Südosten, Straße B nach Süden;
 * die Sonne steht tief im Süden — Straße B ist Gegenlicht.
 */

/** Mittellinie der `dorf`-Straße, alle 8 m (roads.json, 2026-09-26). [s, x, y, z]. Zur Laufzeit ersetzt (`useRoadAxis`). */
const ROAD_8: readonly (readonly [number, number, number, number])[] = [
  [360, -449.53, 24.63, -102.34], [368, -441.56, 24.60, -101.91], [376, -433.98, 24.60, -99.42], [384, -426.65, 24.60, -96.19],
  [392, -419.33, 24.68, -92.97], [400, -412.01, 24.62, -89.74], [408, -404.69, 24.60, -86.51], [416, -397.37, 24.65, -83.28],
  [424, -390.05, 24.71, -80.06], [432, -382.73, 24.71, -76.83], [440, -375.41, 24.47, -73.60], [448, -368.10, 24.10, -70.38],
  [456, -360.77, 24.00, -67.15], [464, -353.45, 24.00, -63.92], [472, -346.13, 24.03, -60.69], [480, -338.83, 24.57, -57.47],
  [488, -331.52, 25.14, -54.25], [496, -324.20, 25.21, -51.03], [504, -316.88, 25.24, -47.81], [512, -310.07, 25.13, -43.65],
  [520, -304.45, 24.90, -37.98], [528, -299.12, 24.75, -32.01], [536, -293.78, 24.79, -26.05], [544, -288.45, 25.11, -20.09],
  [552, -283.13, 25.66, -14.14], [560, -277.81, 26.22, -8.19], [568, -272.49, 26.78, -2.24], [576, -267.17, 27.34, 3.71],
  [584, -261.85, 27.89, 9.66], [592, -256.53, 28.45, 15.61], [600, -251.20, 28.88, 21.57], [608, -245.87, 28.77, 27.52],
  [616, -240.55, 29.28, 33.48], [624, -235.23, 29.84, 39.42], [632, -229.91, 30.39, 45.38], [640, -224.59, 30.95, 51.33],
  [648, -219.26, 31.51, 57.28], [656, -213.94, 32.07, 63.23], [664, -208.62, 32.62, 69.18], [672, -203.30, 33.18, 75.13],
  [680, -197.98, 33.74, 81.08], [688, -192.66, 34.33, 87.02], [692.16, -190.00, 34.12, 90.00],
];
/** Ende der `dorf`-Straße (Bogenlänge). Danach Straße B. */
export const JOIN = 692.16;

/**
 * Straße B: vom Straßenende in einer Rechtskurve (R ≈ 35 m; die erste Fassung mit 23 m trug das Auto im Messlauf bei 50 km/h in die Poller) nach Süden, dann
 * leicht geschwungen am Hangfuß entlang. Die Linie folgt der 32…36-m-Höhenlinie —
 * gemessen die flachste Richtung zwischen Reisebene und Hang (±2 m auf 150 m,
 * quer dazu 7 %). Der erste Punkt setzt die Richtung der Dorfstraße fort (0,666 | 0,746).
 */
const B_CTRL: readonly (readonly [number, number])[] = [
  [-190, 90], [-185.3, 95.2], [-182.2, 101.2], [-180.8, 108.5], [-181.2, 122], [-184.5, 155], [-188.2, 185], [-190.8, 212], [-192.4, 238],
];

/** Zentripetale Catmull-Rom-Kurve durch `pts`, gleichmäßig nach Bogenlänge neu abgetastet. */
export function catmull(pts: readonly (readonly [number, number])[], spacing: number, head?: readonly [number, number]): [number, number][] {
  const P = pts.map(p => [p[0], p[1]] as [number, number]);
  const a0 = P[0]!, a1 = P[1]!, n = P.length;
  const first: [number, number] = head ? [a0[0] - head[0] * 5, a0[1] - head[1] * 5] : [2 * a0[0] - a1[0], 2 * a0[1] - a1[1]];
  const last: [number, number] = [2 * P[n - 1]![0] - P[n - 2]![0], 2 * P[n - 1]![1] - P[n - 2]![1]];
  const Q = [first, ...P, last], dense: [number, number][] = [];
  for (let i = 1; i < Q.length - 2; i++) {
    const p0 = Q[i - 1]!, p1 = Q[i]!, p2 = Q[i + 1]!, p3 = Q[i + 2]!;
    const d = (a: [number, number], b: [number, number]): number => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      const t = t1 + (t2 - t1) * k / steps, out: [number, number] = [0, 0];
      for (let c = 0; c < 2; c++) {
        const A1 = (t1 - t) / (t1 - t0) * p0[c]! + (t - t0) / (t1 - t0) * p1[c]!;
        const A2 = (t2 - t) / (t2 - t1) * p1[c]! + (t - t1) / (t2 - t1) * p2[c]!;
        const A3 = (t3 - t) / (t3 - t2) * p2[c]! + (t - t2) / (t3 - t2) * p3[c]!;
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        out[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      dense.push(out);
    }
  }
  const res: [number, number][] = [dense[0]!];
  let need = spacing;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]!, b = dense[i]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = 0;
    while (l - t >= need) { t += need; res.push([a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l]); need = spacing; }
    need -= l - t;
  }
  return res;
}

/** Straße B, 1 m Abstand ab `JOIN`. */
const B_PTS = catmull(B_CTRL, 1, [0.666, 0.746]);
/** Bogenlänge am Südende von Straße B. */
export const S_END = JOIN + B_PTS.length - 1;

type AxisPt = { s: number; x: number; y: number; z: number };
let axis: AxisPt[] = [];
function rebuild(road: AxisPt[]): void {
  const by = (profile ?? null);
  axis = [...road.filter(p => p.s < JOIN - 0.5), { s: JOIN, x: -190, y: road[road.length - 1]!.y, z: 90 },
    ...B_PTS.slice(1).map(([x, z], i) => ({ s: JOIN + i + 1, x, y: by ? by(JOIN + i + 1) : NaN, z }))];
}
let profile: ((s: number) => number) | null = null;
rebuild(ROAD_8.map(([s, x, y, z]) => ({ s, x, y, z })));

/**
 * Die echte Mittellinie der Dorfstraße einsetzen (2 m, aus `drive.roads`). Die
 * 8-m-Tabelle liegt auf den Geraden exakt, in der Kurve bei s 512 bis 0,2 m daneben.
 */
export function useRoadAxis(centerline: ArrayLike<number>, spacing: number): void {
  const pts: AxisPt[] = [], n = centerline.length / 3;
  for (let i = Math.floor(340 / spacing); i < n; i++) pts.push({ s: i * spacing, x: centerline[i * 3]!, y: centerline[i * 3 + 1]!, z: centerline[i * 3 + 2]! });
  rebuild(pts);
}
/** Höhenprofil von Straße B (Fahrbahnoberkante), vom System aus dem Gelände gerechnet. */
export function useStreetProfile(fn: (s: number) => number): void {
  profile = fn;
  for (const p of axis) if (p.s > JOIN) p.y = fn(p.s);
}

export interface Frame { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number }

function find(s: number): number {
  let lo = 0, hi = axis.length - 2;
  if (s <= axis[0]!.s) return 0;
  if (s >= axis[hi]!.s) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (axis[m]!.s <= s) lo = m; else hi = m; }
  return lo;
}

/**
 * Punkt und Richtung auf der Achse bei `s`. `n` = (tz, −tx) zeigt nach **links**
 * der Fahrtrichtung: auf Straße A nach Nordosten, auf Straße B nach Osten (Hang).
 * Nachgerechnet: rechts = vorwärts × oben = (−tz, 0, tx), links ist das Negative.
 */
export function frame(s: number): Frame {
  const i = find(s), a = axis[i]!, b = axis[i + 1]!, t = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1)));
  // Richtung über ±2 m geglättet (die Dorfstraße hat 2 m Stützstellen, Straße B 1 m).
  const pa = axis[find(s - 2)]!, pb = axis[Math.min(axis.length - 1, find(s + 2) + 1)]!;
  let tx = pb.x - pa.x, tz = pb.z - pa.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx, tz, nx: tz, nz: -tx };
}

/** Weltpunkt aus Straßenkoordinaten. */
export function at(s: number, o: number): [number, number] {
  const f = frame(s); return [f.x + f.nx * o, f.z + f.nz * o];
}
/** Gierwinkel eines Hauses, dessen lokale Front (+z) zur Straße schaut. */
export function faceRoad(s: number, side: 1 | -1): number {
  const f = frame(s); return Math.atan2(-f.nx * side, -f.nz * side);
}

/** Pin für Karte, Sichtbarkeit und Hinweistext: Mitte zwischen Platz, Kanal und Brauerei. */
export const KOEDO = { x: -214, z: 140, s0: 580, s1: S_END } as const;

/**
 * Querschnitte. Straße A: Asphalt 5 m + 0,8 m Bankett (bis 3,3 m) bleibt
 * Straße; Rinne mit Granitdeckeln 3,3…3,75, Gehweg 3,75…5,5, Front bei 5,6.
 * Straße B: gepflasterte Fahrbahn bis 2,9 m, Rinne bis 3,35, Gehweg bis 5,5.
 * Beide Gehwege liegen 14 cm über der Fahrbahn (Bordstein aus Granit).
 */
export const ROAD_HALF_A = 3.3;
export const ROAD_HALF_B = 2.9;
export const GUTTER_W = 0.45;
export const FRONT = 5.6;
export const CURB = 0.14;
export function roadHalf(s: number): number { return s <= JOIN ? ROAD_HALF_A : ROAD_HALF_B; }

export type KoedoKind = 'kura' | 'white' | 'machiya';
export type KoedoRole =
  | 'home' | 'eel' | 'imo' | 'kimono' | 'pottery' | 'museum' | 'incense' | 'soba' | 'miso' | 'washi' | 'candy'
  | 'fabric' | 'cafe' | 'sweets' | 'tea' | 'dango' | 'crafts' | 'pharmacy' | 'hardware';

/**
 * Häuserzeile: [Breite, Art, Rolle, Tiefe] hintereinander, 0,2…0,7 m Fuge; eine Zahl
 * allein ist eine Lücke. In Kawagoe ist die Straßenfront fast lückenlos, und die
 * schwarzen Kura stehen zwischen Holzhäusern (Machiya) — kein Block ist gleich breit.
 */
type Row = (readonly [number, KoedoKind, KoedoRole, number] | number)[];

/** Straße A, links (Nordosten). */
const A_LEFT: Row = [
  [8, 'machiya', 'home', 10], [9.5, 'kura', 'eel', 12], [7, 'kura', 'kimono', 11],
  3.4,
  [10.5, 'kura', 'imo', 13], [6.5, 'machiya', 'tea', 10], [8.5, 'kura', 'pottery', 11], [9, 'white', 'museum', 12],
  [7.5, 'machiya', 'home', 10], [6, 'kura', 'incense', 9],
];
/** Straße A, rechts (Südwesten, zur Terrace Track). */
const A_RIGHT: Row = [
  [7, 'machiya', 'home', 10], [9, 'kura', 'soba', 12], [11, 'kura', 'miso', 13], [6.5, 'machiya', 'washi', 9],
  4,
  [9.5, 'kura', 'candy', 12], [8, 'kura', 'fabric', 11], [7.5, 'machiya', 'cafe', 10], [8.5, 'kura', 'home', 11],
];
/** Straße B, links (Osten, Hang). Am Anfang der Glockenturm-Bezirk. */
const B_LEFT: Row = [
  [9, 'kura', 'sweets', 12], [7.5, 'machiya', 'home', 10], [10, 'kura', 'tea', 12], [6.5, 'kura', 'kimono', 9],
  3.6,
  [11.5, 'kura', 'hardware', 13], [8, 'machiya', 'soba', 10], [7, 'white', 'home', 10], [9.5, 'kura', 'eel', 12],
  [8, 'machiya', 'home', 10], [7, 'kura', 'crafts', 10],
];
/** Straße B, rechts (Westen, zum Kanal). Die Brauerei steht in der Lücke von 34 m. */
const B_RIGHT: Row = [
  [8.5, 'kura', 'dango', 12], [7, 'machiya', 'home', 10],
  4.6,
  [6, 'machiya', 'candy', 9], [9, 'kura', 'kimono', 12], [7.5, 'machiya', 'home', 10],
  34,
  [9, 'kura', 'tea', 12],
  3.8,
  [8, 'machiya', 'home', 10], [10, 'kura', 'pharmacy', 12], [7, 'kura', 'home', 10],
];

export interface KoedoHouse {
  s: number; side: 1 | -1; w: number; d: number; kind: KoedoKind; role: KoedoRole; seed: number;
  /** Rücksprung hinter die Gehwegkante (m); negativ = 0,25 m vor der Flucht. */
  setback: number;
  /** Eingeschossig — nur Machiya-Wohnhäuser. */
  low: boolean;
  /** Gierwinkel zusätzlich zur Straßenrichtung (rad). */
  skew: number;
}

function row(list: Row, side: 1 | -1, start: number, seed: number): KoedoHouse[] {
  const out: KoedoHouse[] = [];
  let s = start, r = seed >>> 0;
  const rnd = (): number => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  for (const e of list) {
    if (typeof e === 'number') { s += e; continue; }
    const [w, kind, role, d] = e;
    // Lehre aus Kiso-Juku: eine Flucht über 300 m liest sich wie gestanzt. Jedes vierte
    // Haus springt 0,5…1,4 m zurück (Machiya mit Vorplatz), jedes sechste steht 0,25 m vor.
    const roll = rnd();
    const setback = kind === 'machiya' && roll < 0.4 ? 0.5 + rnd() * 0.9 : roll > 0.84 ? -0.25 : 0;
    const low = kind === 'machiya' && role === 'home' && rnd() < 0.35;
    out.push({ s: s + w / 2, side, w, d, kind, role, seed: (seed + out.length * 977) >>> 0, setback, low, skew: (rnd() - 0.5) * 0.045 });
    s += w + 0.2 + (rnd() < 0.22 ? 0.9 + rnd() * 1.2 : rnd() * 0.5);
  }
  return out;
}

export const HOUSES: readonly KoedoHouse[] = [
  ...row(A_LEFT, 1, 584, 0xc0ed0), ...row(A_RIGHT, -1, 586, 0x7a3e1),
  ...row(B_LEFT, 1, 732, 0x51b0e), ...row(B_RIGHT, -1, 713, 0x2d9f4),
];

/** Lücken einer Zeile (Mitte in s), durch die eine Gasse führt. */
export function alleys(side: 1 | -1, s0: number, s1: number, min = 3.2, max = 6): number[] {
  const r = HOUSES.filter(h => h.side === side && h.s > s0 && h.s < s1).sort((a, b) => a.s - b.s), out: number[] = [];
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1]!, b = r[i]!, gap = (b.s - b.w / 2) - (a.s + a.w / 2);
    if (gap >= min && gap <= max) out.push((a.s + a.w / 2 + b.s - b.w / 2) / 2);
  }
  return out;
}

/**
 * Brauerei (Hero, begehbar): in der 34-m-Lücke von Straße B rechts. Laden (schwarze
 * Kura) mit Sugidama und Probierstube vorn, Tor, Hof, Brauhalle mit Tanks hinten,
 * Ziegelschornstein. Lokal: Front bei z = 0 an der Gehwegkante, Tiefe nach −z.
 */
export const BREWERY = (() => {
  const row = HOUSES.filter(h => h.side === -1 && h.s > JOIN).sort((a, b) => a.s - b.s);
  const i = row.findIndex((h, k) => row[k + 1] && row[k + 1]!.s - row[k + 1]!.w / 2 - (h.s + h.w / 2) > 30);
  const a = row[i]!, b = row[i + 1]!, s0 = a.s + a.w / 2 + 0.4, s1 = b.s - b.w / 2 - 0.4;
  return { s: (s0 + s1) / 2, w: s1 - s0, d: 40 } as const;
})();

/** Gasse „Kashiya Yokochō“ (Süßigkeiten) von Straße B hinunter zum Kanal, und die Wehrgasse. */
export const ALLEY_CANDY = alleys(-1, JOIN, BREWERY.s)[0]!;
export const ALLEY_WEIR = alleys(-1, BREWERY.s, S_END)[0]!;

/**
 * Toki no Kane: der Glockenturm auf seinem Steinplateau außen an der Biegung —
 * in der Verlängerung der Dorfstraße. Wer nach Koedo hineinfährt, hat ihn vor sich.
 * [s, o] auf Straße B.
 */
export const TOWER = { s: 708, o: 10.2 } as const;
/** Platz an der Biegung, außen: [s0, s1] und größte Tiefe. */
export const PLAZA = { s0: 680, s1: 726, o: 15 } as const;

/**
 * Kanal (Kurashiki Bikan). Nord-Süd am Rand der Reisebene, gemessen die flachste
 * Linie im Umkreis: x ≈ −266, Gelände unter dem Wasser 26,4…28,5 m nördlich von
 * z 200 und 25,8…26,6 m südlich davon. Deshalb **zwei Haltungen** mit einem
 * Stufenwehr bei z 201 — mit einem Spiegel stünde das Südende auf 3 m Damm.
 * Die Spiegelhöhen rechnet das System aus dem Gelände (höchster Punkt + 0,25 m).
 * Nördlich endet er vor der Terrace Track (bei x −262 auf z ≈ 120).
 */
export const CANAL = {
  z0: 131, zWeir: 201, z1: 247,
  /** Mittellinie x(z): leicht geknickt, damit die Promenade nicht mit dem Lineal gezogen ist. */
  pts: [[-266.6, 131], [-266.0, 170], [-265.4, 201], [-264.6, 247]] as const,
  water: 8, wall: 0.6, prom: 8.2, dike: 3.2,
} as const;
export function canalX(z: number): number {
  const p = CANAL.pts;
  for (let i = 1; i < p.length; i++) if (z <= p[i]![1] || i === p.length - 1) { const a = p[i - 1]!, b = p[i]!, t = (z - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; }
  return p[0]![0];
}
/** Brücken: Bogenbrücke aus Stein (Nakabashi) und Plattenbrücke über dem Wehr. */
export const BRIDGES = [{ z: 166, kind: 'arch' as const }, { z: CANAL.zWeir, kind: 'slab' as const }];
/** Anlegestelle mit Stakboot an der Ostmauer. */
export const LANDING = { z: 143 } as const;

/**
 * Häuser an der Kanalpromenade: weiße Kura mit Namako, dazwischen Holzhäuser.
 * [z-Mitte, Breite entlang z, Tiefe, Art, Giebel zur Promenade?]. Fronten schauen nach Westen.
 */
export const CANAL_ROW: readonly (readonly [number, number, number, KoedoKind, boolean])[] = [
  [136, 7.5, 9, 'white', true], [145.5, 9, 10, 'white', false], [154.5, 7, 9, 'machiya', false],
  [174, 10, 11, 'white', true], [184.5, 8.5, 10, 'white', false], [194, 7.5, 9, 'kura', false],
  [210.5, 8, 9, 'white', true], [219.5, 8.5, 10, 'machiya', false], [229, 8, 9, 'white', false], [238.5, 8, 9, 'white', true],
];
/** Speicher (Dozō) im Hinterland zwischen Straße B und Kanal. [x, z, Breite, Tiefe, Gierwinkel]. */
export const STOREHOUSES: readonly (readonly [number, number, number, number, number])[] = [
  [-229.5, 137, 5.5, 7, 0.04], [-231, 152, 6, 7.5, -0.03], [-230, 219, 5.5, 7, 0.02], [-222, 232, 5, 6, -0.05],
];
/** Gärten im Hinterland: [x, z, Breite, Tiefe]. */
export const GARDENS: readonly (readonly [number, number, number, number])[] = [
  [-218, 142, 9, 6], [-219, 216, 8, 7], [-238, 116, 10, 6],
];

/** Hikawa-Schrein am Südende von Straße B (Kawagoe hat seinen am Stadtrand). */
export const SHRINE = { s: S_END + 3, o: 0 } as const;

/** Moderne Häuser am Hang Richtung Tokio: [x, z, Breite, Tiefe, Geschosse, Gierwinkel]. */
export const MODERN: readonly (readonly [number, number, number, number, number, number])[] = [
  [-152, 150, 8, 9, 2, -1.62], [-146, 172, 9, 8, 2, -1.5], [-150, 198, 7.5, 8, 2, -1.7], [-128, 156, 10, 12, 3, -1.55],
  [-137, 216, 8, 9, 2, -1.45], [-118, 190, 8.5, 9, 2, -1.6],
];

/** Trauerweiden an der Promenade und auf dem Westdamm: [z, Seite (+1 Promenade, −1 Damm), Größe]. */
export const WILLOWS: readonly (readonly [number, number, number])[] = [
  [134, 1, 1], [151, 1, 0.9], [160, 1, 1.05], [178, 1, 1], [190, 1, 0.95], [214, 1, 1.05], [226, 1, 0.9], [243, 1, 1],
  [140, -1, 1.1], [183, -1, 1], [221, -1, 0.95],
];

/** Terrace Track (settlementLayout.ts), nachgerechnet: zentripetale Catmull-Rom wie in `TerraceOffroad`. */
export const TRACK = catmull([[-680, 380], [-490, 210], [-190, 90]], 2).filter(([x]) => x > -420);

type Add = (x: number, z: number, r: number) => void;

/**
 * Freihaltung für Streuung und Props. Läuft vor dem Dorf, deshalb auf der
 * 8-m-Tabelle der Achse — an der Kurve bei s 512 bis 0,2 m daneben, genug Radius.
 */
export function koedoClearance(add: Add): void {
  for (let s = 572; s <= S_END + 4; s += 4) for (const o of [-14, -7, 0, 7, 14]) { const [x, z] = at(s, o); add(x, z, 6); }
  // Zufahrt: Masten, Laternen, Schilder — schmal.
  for (let s = 440; s < 572; s += 6) for (const o of [-6, 6]) { const [x, z] = at(s, o); add(x, z, 2.4); }
  for (const h of HOUSES) { const [x, z] = at(h.s, h.side * (FRONT + h.d / 2)); add(x, z, Math.hypot(h.w, h.d) / 2 + 1); }
  { const [x, z] = at(BREWERY.s, -(FRONT + BREWERY.d / 2)); add(x, z, 26); }
  { const [x, z] = at(TOWER.s, TOWER.o); add(x, z, 10); }
  for (let z = CANAL.z0 - 6; z <= CANAL.z1 + 4; z += 4) for (let o = -14; o <= 24; o += 6) add(canalX(z) + o, z, 5);
  for (const [x, z, w, d] of [...STOREHOUSES, ...GARDENS]) add(x, z, Math.hypot(w, d) / 2 + 1.5);
  for (const [x, z, w, d] of MODERN) add(x, z, Math.hypot(w, d) / 2 + 3);
  { const [x, z] = at(SHRINE.s + 10, 0); add(x, z, 14); }
  // Das Viertel zwischen Straße B und Kanal: keine wilden Bäume auf Gassen und Höfen (erstes
  // Gassenbild: eine Streu-Kiefer mitten auf der Kashiya-Gasse).
  for (let z = CANAL.z0 - 8; z <= CANAL.z1; z += 6) for (let x = canalX(z) + 10; x < -186; x += 6) add(x, z, 4.5);
}

/** Liegt ein Weltpunkt im Ortsband (Straßen, Kanal)? Für Props, die dort nicht stehen sollen (Leitpfosten). */
export function inKoedo(x: number, z: number): boolean {
  if (x > -300 && x < -120 && z > -20 && z < 262) {
    if (z > CANAL.z0 - 12 && Math.abs(x - canalX(Math.min(CANAL.z1, z))) < 26) return true;
    let best = Infinity;
    for (let s = 560; s <= S_END; s += 3) { const f = frame(s); best = Math.min(best, Math.hypot(f.x - x, f.z - z)); }
    return best < 22;
  }
  return false;
}

/**
 * Wo die Reismaske zur Laufzeit trocken gilt: Kanal samt Damm und Promenade,
 * und das Band der Straße A, wo sie noch zwischen Parzellen liegt. Gelesen von
 * `RicePaddy` und `WaterField` über `paddyDry` (settlementLayout.ts).
 */
export function koedoDry(x: number, z: number): boolean {
  if (z > CANAL.z0 - 10 && z < CANAL.z1 + 8) { const dx = x - canalX(Math.max(CANAL.z0, Math.min(CANAL.z1, z))); if (dx > -20 && dx < 26) return true; }
  if (x > -300 && x < -180 && z > -20 && z < 100) {
    for (let s = 560; s <= JOIN; s += 4) { const f = frame(s); if (Math.hypot(f.x - x, f.z - z) < 20) return true; }
  }
  return false;
}
