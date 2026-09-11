import { ROAD_TYPES, roadWidthAt, type RoadData } from '@/config/roads.config';

interface CorridorSegment {
  ax: number; az: number; bx: number; bz: number; radius: number;
}

/** Only connected roads near their junction participate, not distant flyovers. */
export function junctionCorridors(roads: readonly RoadData[]): Map<string, CorridorSegment[]> {
  const result = new Map<string, CorridorSegment[]>();
  const add = (owner: RoadData, other: RoadData, x: number, z: number): void => {
    const list = result.get(owner.id) ?? [];
    result.set(owner.id, list);
    const line = other.centerline, count = line.length / 3;
    for (let i = 0; i < (other.closed ? count : count - 1); i++) {
      const j = (i + 1) % count;
      const ax = line[i * 3]!, az = line[i * 3 + 2]!;
      const bx = line[j * 3]!, bz = line[j * 3 + 2]!;
      if (pointDistanceSquared(x, z, ax, az, bx, bz) > 120 ** 2) continue;
      const settings = ROAD_TYPES[other.type];
      list.push({ ax, az, bx, bz, radius: Math.max(roadWidthAt(other, i), roadWidthAt(other, j)) / 2 + settings.shoulder + .15 });
    }
  };
  for (const branch of roads) for (const junction of branch.junctions) {
    const host = roads.find(r => r.id === junction.with);
    if (!host) continue;
    const i = junction.at === 'start' ? 0 : branch.centerline.length - 3;
    const x = branch.centerline[i]!, z = branch.centerline[i + 2]!;
    add(branch, host, x, z);
    add(host, branch, x, z);
  }
  return result;
}

function pointDistanceSquared(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, q = dx * dx + dz * dz;
  const t = q > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0;
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
}

/** Capsule-versus-convex-quad test also catches a stripe spanning a narrow path. */
export function overlapsJunction(corners: readonly { x: number; z: number }[], segments: readonly CorridorSegment[]): boolean {
  for (const s of segments) {
    let positive = false, negative = false;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]!, b = corners[(i + 1) % corners.length]!;
      const side = (b.x - a.x) * (s.az - a.z) - (b.z - a.z) * (s.ax - a.x);
      positive ||= side > 0; negative ||= side < 0;
      if (pointDistanceSquared(a.x, a.z, s.ax, s.az, s.bx, s.bz) <= s.radius ** 2 ||
          pointDistanceSquared(s.ax, s.az, a.x, a.z, b.x, b.z) <= s.radius ** 2 ||
          pointDistanceSquared(s.bx, s.bz, a.x, a.z, b.x, b.z) <= s.radius ** 2) return true;
      const ex = b.x - a.x, ez = b.z - a.z, dx = s.bx - s.ax, dz = s.bz - s.az;
      const denominator = ex * dz - ez * dx;
      if (Math.abs(denominator) > 1e-8) {
        const qx = s.ax - a.x, qz = s.az - a.z;
        const t = (qx * dz - qz * dx) / denominator;
        const u = (qx * ez - qz * ex) / denominator;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
      }
    }
    if (!(positive && negative)) return true;
  }
  return false;
}
