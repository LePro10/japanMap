import { roadWidthAt, type RoadData } from '@/config/roads.config';

/**
 * Junction setback for a live `roads.json` that already exists.
 *
 * WP6 writes `trim: 0` on every start/end snap (`tools/wp6-roads.mjs`).
 * Measured 2026-09-18 on the 72-route file: **70 of 127 junctions** have
 * trim 0 while the branch centreline sits on the host (snap 0.00 m). The
 * mesh then covers the through road, zebra paint lands in the mouth, and
 * two coplanar strips z-fight — the P3 class that `trimStart`/`trimEnd`
 * were invented to stop.
 *
 * Rebaking would fix the file, but `bake:clean` re-runs erosion. The
 * renderer can compute the same setback P3 uses (`hostWidth/2 + 1`) from
 * the junction list plus any other centreline the endpoint actually sits
 * on (one unregistered X at Crosslight, lantern-avenue-2 × hotel-walk).
 */
function nearestHalf(host: RoadData, x: number, z: number): { d: number; half: number } {
  const line = host.centerline;
  const count = line.length / 3;
  const segments = host.closed ? count : count - 1;
  let bestD = Infinity;
  let bestHalf = roadWidthAt(host, 0) / 2;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % count;
    const ax = line[i * 3]!;
    const az = line[i * 3 + 2]!;
    const bx = line[j * 3]!;
    const bz = line[j * 3 + 2]!;
    const dx = bx - ax;
    const dz = bz - az;
    const q = dx * dx + dz * dz;
    const t = q > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0;
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < bestD) {
      bestD = d;
      bestHalf = roadWidthAt(host, i) / 2;
    }
  }
  return { d: bestD, half: bestHalf };
}

export function resolveTrims(roads: readonly RoadData[]): RoadData[] {
  return roads.map((road) => {
    if (road.closed || road.centerline.length < 12) return road;

    let trimStart = road.trimStart;
    let trimEnd = road.trimEnd;
    const last = road.centerline.length - 3;
    const startX = road.centerline[0]!;
    const startZ = road.centerline[2]!;
    const endX = road.centerline[last]!;
    const endZ = road.centerline[last + 2]!;

    for (const other of roads) {
      if (other.id === road.id) continue;
      const atStart = nearestHalf(other, startX, startZ);
      if (atStart.d < 2) trimStart = Math.max(trimStart, atStart.half + 1);
      const atEnd = nearestHalf(other, endX, endZ);
      if (atEnd.d < 2) trimEnd = Math.max(trimEnd, atEnd.half + 1);
    }

    for (const junction of road.junctions) {
      if (junction.trim > 0) {
        if (junction.at === 'start') trimStart = Math.max(trimStart, junction.trim);
        else trimEnd = Math.max(trimEnd, junction.trim);
      }
    }

    // Keep at least two mesh stations. A 44 m stub with 10 m at each end
    // still has a driveway; clamping to half-length-minus-a-sample does not.
    const maxTrim = Math.max(0, road.length / 2 - 4);
    trimStart = Math.min(trimStart, maxTrim);
    trimEnd = Math.min(trimEnd, maxTrim);

    if (trimStart === road.trimStart && trimEnd === road.trimEnd) return road;
    return { ...road, trimStart, trimEnd };
  });
}
