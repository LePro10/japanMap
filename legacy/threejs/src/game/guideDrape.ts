import { WAYPOINT } from '@/config/waypoint.config';
import type { RoutePath, RoutePoint } from './routeGraph';

export type HeightAt = (x: number, z: number) => number;

export interface DrapedPoint {
  readonly x: number;
  readonly z: number;
  readonly yL: number;
  readonly yR: number;
  readonly tx: number;
  readonly tz: number;
  readonly rx: number;
  readonly rz: number;
  readonly arc: number;
  readonly limit: number;
}

/**
 * Stützstellen verdichten, bevor das Band gelegt wird.
 *
 * Die Graphknoten liegen 4 m auseinander, Offroad-Stücke 8 m. Über einen
 * Grat ist die Sehne dann Luft — genau das Schweben. 2 m folgen dem
 * Höhenfeld (1,5 m Texel) ohne extra Knoten im Suchgraph.
 */
export function densifyRoute(path: RoutePath, spacing = 2): RoutePoint[] {
  const src = path.points;
  if (src.length < 2) return src.slice();
  const out: RoutePoint[] = [];
  const step = Math.max(0.5, spacing);
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i]!;
    const b = src[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({
        x: a.x + dx * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + dz * t,
        limit: a.limit + (b.limit - a.limit) * t,
        arc: a.arc + (b.arc - a.arc) * t,
      });
    }
  }
  out.push(src[src.length - 1]!);
  return out;
}

/**
 * Band aufs Höhenfeld legen: links und rechts eigene Höhe, damit der
 * Streifen am Hang klebt statt als Waagerechte durch die Luft zu stehen.
 */
export function drapeRibbon(
  points: readonly RoutePoint[],
  heightAt: HeightAt | null,
  half = WAYPOINT.lineWidth * 0.5,
  lift = WAYPOINT.lineLift,
): DrapedPoint[] {
  const n = points.length;
  const out: DrapedPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[i === 0 ? 0 : i - 1]!;
    const next = points[i === n - 1 ? n - 1 : i + 1]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const rx = tz;
    const rz = -tx;
    const lx = p.x - rx * half;
    const lz = p.z - rz * half;
    const rxw = p.x + rx * half;
    const rzw = p.z + rz * half;
    const yL = (heightAt ? heightAt(lx, lz) : p.y) + lift;
    const yR = (heightAt ? heightAt(rxw, rzw) : p.y) + lift;
    out.push({ x: p.x, z: p.z, yL, yR, tx, tz, rx, rz, arc: p.arc, limit: p.limit });
  }
  return out;
}
