/**
 * Funaura (舟浦) — Fischerdorf an der Mündung des Westflusses. docs/DOERFER.md §1.
 *
 * Warum hier und nicht an der Küste davor: die ganze Südküste ist ein flacher
 * Sandstrand ohne Bucht (Profil alle 100 m gemessen, 2026-09-25). Das Gelände
 * liegt bis z ≈ 1080 auf 0,0…0,3 m und fällt erst dann auf −1…−2 m. Funaya
 * (Bootshäuser) brauchen aber Wasser **unter** dem Haus. Deshalb steht das Dorf
 * auf einer aufgeschütteten Kaiplatte (Umetate-chi, wie in fast jedem
 * japanischen Fischerhafen) und die Bootshäuser stehen an ihrer Kante auf
 * Pfeilern über −1,3…−1,5 m Wasser. Kein Rebake: die Erosion würde sonst die
 * ganze Karte neu würfeln (CLAUDE.md, 66,82 %).
 *
 * Koordinaten: x Ost, z Süd (Meer bei +z). Höhen aus `height.r16`.
 */

/** Oberkante der Kaiplatte. Gelände darunter 0,0…1,4 m, Meer 0. */
export const QUAY_Y = 1.8;

/** Pin für Karte, Reiseziel und Sichtbarkeit. */
export const FUNAURA = { x: -1236, z: 1070 } as const;

/**
 * Die Platte. Westteil (Funaya-Viertel) endet an der Kaimauer z = 1098, der
 * Ostteil (Arbeitshafen) reicht bis z = 1106, weil das Wasser dort flacher ist
 * (bei x > −1230 liegt z = 1096 noch auf 0,0 m).
 */
export const PLATFORM = { minX: -1320, maxX: -1146, minZ: 1040, split: -1214, faceWest: 1098, faceEast: 1106 } as const;

/** Hafenstraße auf der Platte, hinter den Bootshäusern. */
export const HARBOUR_LANE = { minX: -1316, maxX: -1148, z0: 1077, z1: 1087 } as const;

/** Steg in den Hafen, Boote liegen beidseitig. */
export const PIER = { x: -1178, z0: 1106, z1: 1170, w: 7 } as const;

/** Slipanlage am Arbeitshafen. */
export const SLIPWAY = { x: -1206, z0: 1100, z1: 1122, w: 7 } as const;

/**
 * Funaya: [x Mitte, Breite, Wandfarbe-Variante, Balkon].
 * Rückwand auf der Platte bei z = FUNAYA_BACK, Front über Wasser bei FUNAYA_FRONT.
 */
export const FUNAYA_BACK = 1091;
export const FUNAYA_FRONT = 1111;
export const FUNAYA: readonly (readonly [number, number, number, boolean])[] = [
  [-1311.5, 7.4, 0, true], [-1302.8, 8.2, 1, false], [-1293.6, 7.6, 2, true],
  [-1284.4, 8.4, 3, false], [-1275.0, 7.8, 1, true], [-1265.9, 7.4, 0, false],
  [-1256.7, 8.6, 2, true], [-1247.2, 7.6, 3, true], [-1238.2, 7.8, 0, false],
  [-1229.0, 8.2, 1, true], [-1220.2, 7.2, 2, false],
];

export type HouseKind = 'omoya' | 'shop' | 'izakaya' | 'grocery' | 'inn' | 'tackle' | 'hill' | 'coop' | 'ice';
/** [x, z, Breite, Tiefe, Gierwinkel (Front = +z bei 0), Art, Geschosse]. */
export const HOUSES: readonly (readonly [number, number, number, number, number, HouseKind, number])[] = [
  // Zeile an der Hafenstraße, auf der Platte, Front nach Süden.
  // Front bei z ≈ 1072,5: 4,5 m vor der Hafenstraße. Die erste Fassung stand
  // 3 m weiter nördlich, und zwischen Hausfront und Bootshaus lagen 22 m leerer Beton.
  [-1309.5, 1067, 10, 11, 0, 'tackle', 2], [-1298, 1067.5, 9, 10, 0, 'shop', 2],
  [-1287.5, 1067, 9.5, 11, 0, 'inn', 2], [-1276.5, 1067.5, 9, 10, 0, 'izakaya', 2],
  [-1249, 1067, 10, 11, 0, 'grocery', 2], [-1238, 1067.5, 9, 10, 0, 'omoya', 2],
  [-1227, 1067, 9.5, 11, 0, 'omoya', 1],
  // Arbeitshafen: Fischereigenossenschaft und Eishaus (Beton, zweigeschossig).
  [-1201, 1054, 14, 10, 0, 'coop', 2], [-1157, 1056, 15, 14, 0, 'ice', 2],
  // Hangseite: am Hauptweg und in den Gassen, Front zum Weg.
  [-1278, 1022, 10, 9, 0.05, 'hill', 2], [-1249, 1024, 11, 9, -0.04, 'hill', 1],
  [-1300, 1016, 9, 9, 0.1, 'hill', 1], [-1230, 1012, 10, 9, -0.12, 'hill', 2],
  [-1286, 986, 10, 9, 1.35, 'hill', 2], [-1257, 990, 11, 9, -1.4, 'hill', 1],
  [-1295, 956, 9, 9, 1.4, 'hill', 1], [-1259, 952, 10, 9, -1.5, 'hill', 2],
  [-1240, 968, 9, 8, -0.2, 'hill', 1], [-1305, 928, 9, 8, 1.45, 'hill', 1],
];

/**
 * Durchgehender Fahrweg: Ende der Mill Lane bei Stillwater → am Ostufer des
 * Flusses über den 42-m-Rücken → Hauptgasse durchs Dorf → Kaiplatte.
 * Gelände gemessen: 26 → 42 → 9 → 1 m, höchstens rund 9 % Steigung.
 */
export const RIVER_ROAD: readonly (readonly [number, number])[] = [
  // Erst östlich an Stillwaters letztem Haus (−1141 | 488) vorbei — die erste
  // Fassung führte mitten hindurch, und der Fahrtest blieb nach 4 m stehen.
  [-1130, 470], [-1121, 498], [-1128, 532], [-1152, 572], [-1185, 610], [-1225, 650], [-1255, 700], [-1270, 760],
  [-1280, 820], [-1286, 868], [-1283, 905], [-1276, 940], [-1269, 975], [-1265, 1008], [-1263, 1041],
];

/** Gasse zum Ebisu-Schrein, zu Fuß. */
export const SHRINE = { x: -1214, z: 918, yaw: -0.25 } as const;
export const SHRINE_PATH: readonly (readonly [number, number])[] = [[-1270, 972], [-1250, 958], [-1232, 940], [-1219, 928]];

/** Molen: Westmole führt den Fluss ins Meer, Ostmole schließt das Becken. */
export const WEST_MOLE: readonly (readonly [number, number])[] = [[-1322, 1034], [-1322, 1150], [-1318, 1194], [-1294, 1212]];
export const EAST_MOLE: readonly (readonly [number, number])[] = [[-1144, 1100], [-1145, 1160], [-1158, 1196], [-1210, 1214]];
export const MOLE_Y = 2.9;
/** Rot rechts, weiß links — so, wie man in Japan einen Hafen anläuft (nach Norden). */
export const LIGHT_WHITE = { x: -1294, z: 1212 } as const;
export const LIGHT_RED = { x: -1210, z: 1214 } as const;

type House = readonly [number, number, number, number, number, HouseKind, number];

/**
 * Handgesetzte Häuser plus Verdichtung. Die erste Fassung hatte nur die 19
 * Häuser aus `HOUSES`, und das erste Bild aus der Gasse zeigte einzelne
 * Kästen auf Gras — ein japanisches Fischerdorf ist das Gegenteil: Haus an
 * Haus, jedes auf seiner Steinstufe, dazwischen nur Gassen. Die Verdichtung
 * reiht an beiden Seiten des Dorfwegs und am Strandrand Häuser auf, Front zum
 * Weg, und lässt nur Platz, wo schon etwas steht.
 */
export const VILLAGE_HOUSES: readonly House[] = (() => {
  const out: House[] = [...HOUSES];
  let seed = 0xd0f5;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const free = (x: number, z: number, radius: number): boolean =>
    out.every(([hx, hz, w, d]) => Math.hypot(x - hx, z - hz) > radius + Math.hypot(w, d) / 2 * 0.86)
    && !nearLine(SHRINE_PATH, x, z, radius + 1.5) && Math.hypot(x - SHRINE.x, z - SHRINE.z) > radius + 9
    && !(z + radius > PLATFORM.minZ - 12 && x > PLATFORM.minX - 4 && x < PLATFORM.maxX + 4);
  // Beidseits des Dorfwegs, z 890…1025.
  for (const side of [-1, 1]) {
    let s = 0;
    for (let i = 1; i < RIVER_ROAD.length; i++) {
      const [ax, az] = RIVER_ROAD[i - 1]!, [bx, bz] = RIVER_ROAD[i]!, len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz * side, nz = tx * side;
      for (; s < len; ) {
        const x0 = ax + tx * s, z0 = az + tz * s;
        const w = 7.5 + rnd() * 3, d = 7 + rnd() * 2;
        if (z0 > 885 && z0 < 1026) {
          const off = 3.1 + 2.2 + d / 2, x = x0 + nx * off + tx * w / 2, z = z0 + nz * off + tz * w / 2;
          const r = Math.hypot(w, d) / 2;
          if (free(x, z, r * 0.86) && !nearLine(RIVER_ROAD, x, z, 3.1 + 1.6 + d / 2 - 0.2)) {
            out.push([x, z, w, d, Math.atan2(-nx, -nz), 'hill', rnd() < 0.45 ? 2 : 1]);
          }
        }
        s += w + 1.4 + rnd() * 1.8;
      }
      s -= len;
    }
  }
  // Strandreihe nördlich der Kaiplatte, Front zum Meer.
  for (let x = -1316; x < -1150; ) {
    const w = 8 + rnd() * 2.5, d = 7.5 + rnd() * 1.5, z = 1016.5 + rnd() * 2, cx = x + w / 2;
    const r = Math.hypot(w, d) / 2;
    if (out.every(([hx, hz, hw, hd]) => Math.hypot(cx - hx, z - hz) > r * 0.86 + Math.hypot(hw, hd) / 2 * 0.86) && !nearLine(RIVER_ROAD, cx, z, 3.1 + 1.6 + d / 2))
      out.push([cx, z, w, d, (rnd() - 0.5) * 0.08, 'hill', rnd() < 0.5 ? 2 : 1]);
    x += w + 1.6 + rnd() * 2;
  }
  return out;
})();

function nearLine(line: readonly (readonly [number, number])[], x: number, z: number, r: number): boolean {
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!;
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true;
  }
  return false;
}

/** Kuromatsu-Schutzwald: Kiefern am Strand und hinter dem Dorf. [x, z, Maßstab]. */
export const PINES: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  let seed = 0x5eed;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Gürtel hinter dem Dorf (z 860…900) und am Oststrand (x −1140…−1070).
  for (let i = 0; i < 26; i++) out.push([-1330 + rnd() * 150, 858 + rnd() * 34, 0.8 + rnd() * 0.5]);
  for (let i = 0; i < 22; i++) out.push([-1142 + rnd() * 80, 960 + rnd() * 95, 0.75 + rnd() * 0.55]);
  // Einzelne Solitäre am Schrein und am Wegrand.
  out.push([-1204, 906, 1.3], [-1226, 930, 1.0], [-1312, 1036, 0.9], [-1218, 1030, 0.95], [-1292, 900, 1.05]);
  // Keine Kiefer auf dem Weg oder in einem Haus.
  return out.filter(([x, z]) => !nearRoad(x, z, 6) && !VILLAGE_HOUSES.some(([hx, hz, w, d]) => Math.hypot(x - hx, z - hz) < Math.hypot(w, d) / 2 + 3));
})();

function nearRoad(x: number, z: number, r: number): boolean {
  for (const line of [RIVER_ROAD, SHRINE_PATH]) for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!;
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true;
  }
  return false;
}

/**
 * Freihaltung für Vegetation und Props — sonst wächst Gras durch die Kaiplatte
 * und ein Baum aus dem Streusystem steht in einem Bootshaus.
 */
export function funauraClearance(add: (x: number, z: number, r: number) => void): void {
  for (let x = PLATFORM.minX; x <= PLATFORM.maxX; x += 8)
    for (let z = PLATFORM.minZ - 4; z <= PLATFORM.faceEast + 6; z += 8) add(x, z, 6.2);
  for (const [x, w] of FUNAYA) add(x, (FUNAYA_BACK + FUNAYA_FRONT) / 2, Math.hypot(w, FUNAYA_FRONT - FUNAYA_BACK) / 2 + 1);
  for (const [x, z, w, d] of VILLAGE_HOUSES) add(x, z, Math.hypot(w, d) / 2 + 2.5);
  for (const line of [RIVER_ROAD, SHRINE_PATH, WEST_MOLE, EAST_MOLE]) for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
    for (let j = 0; j <= steps; j++) add(ax + (bx - ax) * j / steps, az + (bz - az) * j / steps, line === RIVER_ROAD ? 5 : 3.5);
  }
  add(SHRINE.x, SHRINE.z, 12);
}
