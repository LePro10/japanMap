/** Nur Baukörper und schmale Wege freihalten; die Reismaske bleibt unverändert. */
export const MILL = { x: -1244, z: 409 };
export const POND = { x: -1254, z: 388, w: 22, d: 14 };
/**
 * Packed-dirt event route across the farm margins — ASTRA_PLAN §3 Terrace Track.
 * 7 m wide. No bake: the ribbon is a local mesh, same pattern as Mill Lane.
 */
export const TERRACE_TRACK: readonly (readonly [number, number])[] = [
  [-1140, 128], [-1030, 180], [-900, 330], [-680, 380], [-490, 210], [-190, 90],
];
/** Prepared 0,12 m crossing on Terrace Track. */
export const SHALLOW_RUN = {
  x: -900,
  z: 330,
  along: 28,
  across: 12,
  depth: 0.12,
  /** Outgoing segment (−900,330) → (−680,380): mostly east. */
  heading: Math.atan2(220, 50),
} as const;

/** Depth of the prepared crossing, metres. Zero outside the 28 × 12 m pad. */
export function shallowRunDepth(x: number, z: number): number {
  const dx = x - SHALLOW_RUN.x;
  const dz = z - SHALLOW_RUN.z;
  const fx = Math.sin(SHALLOW_RUN.heading);
  const fz = Math.cos(SHALLOW_RUN.heading);
  const along = dx * fx + dz * fz;
  const across = -dx * fz + dz * fx;
  const halfA = SHALLOW_RUN.along / 2;
  const halfC = SHALLOW_RUN.across / 2;
  if (Math.abs(along) > halfA || Math.abs(across) > halfC) return 0;
  const edgeA = 1 - clamp01((Math.abs(along) - (halfA - 1.5)) / 1.5);
  const edgeC = 1 - clamp01((Math.abs(across) - (halfC - 1.5)) / 1.5);
  return SHALLOW_RUN.depth * Math.min(edgeA, edgeC);
}
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export const MILL_LANE: readonly (readonly [number, number])[] = [
  [-1128.03, 127.05], [-1140, 128], [-1150, 143], [-1160, 175], [-1180, 218], [-1210, 248], [-1244, 267],
  [-1267, 298], [-1275, 329], [-1277, 356], [-1273, 383], [-1267, 414],
  [-1258, 431], [-1226, 458], [-1191, 469], [-1130, 470],
];
export const HOMES: readonly (readonly [number, number, number, number])[] = [
  [-1256, 290, 10, 8], [-1286, 308, 11, 8], [-1255, 319, 9, 8],
  [-1290, 337, 12, 9], [-1260, 342, 10, 8], [-1290, 366, 10, 9],
  [-1291, 393, 11, 8], [-1283, 420, 10, 9], [-1255, 451, 11, 8],
  [-1230, 476, 12, 8], [-1203, 451, 9, 8], [-1187, 486, 10, 8],
  [-1159, 452, 11, 8], [-1141, 488, 10, 8],
];
export function settlementClearance(add: (x: number, z: number, r: number) => void): void {
  for (const [x, z, w, d] of HOMES) add(x, z, Math.hypot(w, d) / 2 + 1);
  add(MILL.x, MILL.z, 10);
  for (let x = POND.x - 7; x <= POND.x + 7; x += 7) add(x, POND.z, 9);
  for (let i = 1; i < MILL_LANE.length; i++) {
    const a = MILL_LANE[i - 1]!, b = MILL_LANE[i]!;
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
    for (let j = 0; j <= steps; j++) add(a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps, 4.4);
  }
  add(-1283, 445, 9); add(-1300, 415, 9);
  add(-1304, 393, 8); add(-1283, 435, 5);
  add(-1267, 378, 3); add(-1235, 418, 3);
  add(-1249, 401, 4); add(-1252, 400, 3);
  for (let z = 397; z <= 414; z += 3) add(-1257, z, 2.2);
  add(-1260, 398, 2.7);
  for (let x = -1253; x <= -1238; x += 5) add(x, 417, 4);
  for (let i = 1; i < TERRACE_TRACK.length; i++) {
    const a = TERRACE_TRACK[i - 1]!, b = TERRACE_TRACK[i]!;
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
    for (let j = 0; j <= steps; j++) {
      add(a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps, 4.5);
    }
  }
  add(SHALLOW_RUN.x, SHALLOW_RUN.z, 16);
}
