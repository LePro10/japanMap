import { WAYPOINT } from '@/config/waypoint.config';
import type { RoadData } from '@/config/roads.config';
import { RaceLine, type RaceLineOptions } from './ai/RaceLine';

export interface RoutePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Zieltempo an dieser Stelle, m/s — 0 wenn ungeprofilt. */
  readonly limit: number;
  /** Bogenlänge vom Start der Route, m. */
  readonly arc: number;
}

export interface RoutePath {
  readonly points: readonly RoutePoint[];
  readonly length: number;
  /** Letztes Stück liegt neben der Fahrbahn (Ziel abseits). */
  readonly offroadTail: boolean;
}

interface GraphNode {
  x: number;
  y: number;
  z: number;
  road: number;
  sample: number;
  walkOnly: boolean;
  edges: number[];
  costs: number[];
}

/**
 * Straßennetz als Graph, Dijkstra von hier nach dort.
 *
 * Junctions aus `roads.json` plus Nähe zwischen **verschiedenen** Strecken.
 * Dieselbe Strecke wird nie räumlich kurzgeschlossen: zwei Schenkel einer
 * Kehre liegen 8 m auseinander und 200 m Bogenlänge, und genau so hat
 * `removeSpurs` einmal die Serpentinen gelöscht.
 */
export class RouteGraph {
  readonly #nodes: GraphNode[] = [];
  readonly #roads: readonly RoadData[];

  constructor(roads: readonly RoadData[]) {
    this.#roads = roads;
    this.#build();
  }

  get nodeCount(): number {
    return this.#nodes.length;
  }

  find(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    walking = false,
  ): RoutePath | null {
    const start = this.#nearest(fromX, fromZ, walking);
    const goal = this.#nearest(toX, toZ, walking);
    if (start < 0 || goal < 0) return this.#straight(fromX, fromZ, toX, toZ);

    const chain = this.#dijkstra(start, goal, walking);
    if (!chain) return this.#straight(fromX, fromZ, toX, toZ);

    const points: RoutePoint[] = [];
    let arc = 0;
    const push = (x: number, y: number, z: number) => {
      const prev = points[points.length - 1];
      if (prev) {
        const ds = Math.hypot(x - prev.x, z - prev.z);
        if (ds < 0.4) return;
        arc += ds;
      }
      points.push({ x, y, z, limit: 0, arc });
    };

    const startNode = this.#nodes[start]!;
    if (Math.hypot(fromX - startNode.x, fromZ - startNode.z) > 4) {
      push(fromX, startNode.y, fromZ);
    }
    for (const index of chain) {
      const node = this.#nodes[index]!;
      push(node.x, node.y, node.z);
    }
    const goalNode = this.#nodes[goal]!;
    const tail = Math.hypot(toX - goalNode.x, toZ - goalNode.z);
    if (tail > 4) push(toX, goalNode.y, toZ);

    if (points.length < 2) return this.#straight(fromX, fromZ, toX, toZ);
    return {
      points,
      length: points[points.length - 1]!.arc,
      offroadTail: tail > 8,
    };
  }

  #straight(fromX: number, fromZ: number, toX: number, toZ: number): RoutePath {
    const y = 0;
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    const n = Math.max(2, Math.ceil(length / 8));
    const points: RoutePoint[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      points.push({
        x: fromX + (toX - fromX) * t,
        y,
        z: fromZ + (toZ - fromZ) * t,
        limit: 0,
        arc: length * t,
      });
    }
    return { points, length, offroadTail: true };
  }

  #build(): void {
    const nodes = this.#nodes;
    const firstOfRoad: number[] = [];
    const stride = Math.max(1, WAYPOINT.graphStride);

    for (let r = 0; r < this.#roads.length; r++) {
      const road = this.#roads[r]!;
      const line = road.centerline;
      const count = (line.length / 3) | 0;
      if (count < 2) {
        firstOfRoad.push(-1);
        continue;
      }
      const walkOnly = road.type === 'pfad';
      const begin = nodes.length;
      firstOfRoad.push(begin);
      for (let i = 0; i < count; i += stride) {
        const last = i + stride >= count;
        const sample = last ? count - 1 : i;
        if (last && nodes.length > begin) {
          const prev = nodes[nodes.length - 1]!;
          if (prev.sample === sample) break;
        }
        nodes.push({
          x: line[sample * 3]!,
          y: line[sample * 3 + 1]!,
          z: line[sample * 3 + 2]!,
          road: r,
          sample,
          walkOnly,
          edges: [],
          costs: [],
        });
        if (last) break;
      }
      const end = nodes.length;
      for (let i = begin; i < end - 1; i++) link(nodes, i, i + 1);
      if (road.closed && end - begin > 2) link(nodes, begin, end - 1);
    }

    for (let r = 0; r < this.#roads.length; r++) {
      const road = this.#roads[r]!;
      const begin = firstOfRoad[r]!;
      if (begin < 0) continue;
      let count = 0;
      for (let i = begin; i < nodes.length && nodes[i]!.road === r; i++) count++;
      for (const junction of road.junctions) {
        const here = junction.at === 'start' ? begin : begin + count - 1;
        const other = this.#roads.findIndex((item) => item.id === junction.with);
        if (other < 0 || here < 0) continue;
        const otherBegin = firstOfRoad[other]!;
        if (otherBegin < 0) continue;
        const node = nodes[here]!;
        const nearest = this.#nearestOnRoad(other, node.x, node.z, otherBegin);
        if (nearest >= 0) link(nodes, here, nearest);
      }
    }

    this.#linkNearby();
  }

  #linkNearby(): void {
    const nodes = this.#nodes;
    const cell = 32;
    const buckets = new Map<number, number[]>();
    const keyOf = (x: number, z: number) => {
      const ix = Math.floor(x / cell);
      const iz = Math.floor(z / cell);
      return ((ix + 32768) << 16) | (iz + 32768);
    };
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const key = keyOf(node.x, node.z);
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    }

    const radius = WAYPOINT.linkMeters;
    const radiusSq = radius * radius;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      const ix = Math.floor(a.x / cell);
      const iz = Math.floor(a.z / cell);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = buckets.get(((ix + dx + 32768) << 16) | (iz + dz + 32768));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const b = nodes[j]!;
            if (a.road === b.road) continue;
            const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
            if (d < radiusSq) link(nodes, i, j);
          }
        }
      }
    }
  }

  #nearestOnRoad(road: number, x: number, z: number, begin: number): number {
    const nodes = this.#nodes;
    let best = -1;
    let bestD = Infinity;
    for (let i = begin; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.road !== road) break;
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  #nearest(x: number, z: number, walking: boolean): number {
    const nodes = this.#nodes;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (!walking && node.walkOnly) continue;
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  #dijkstra(start: number, goal: number, walking: boolean): number[] | null {
    const n = this.#nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const heap = new Heap();
    dist[start] = 0;
    heap.push(start, 0);

    while (heap.size > 0) {
      const current = heap.pop();
      if (current === goal) break;
      const node = this.#nodes[current]!;
      if (!walking && node.walkOnly) continue;
      const here = dist[current]!;
      for (let e = 0; e < node.edges.length; e++) {
        const to = node.edges[e]!;
        const next = this.#nodes[to]!;
        if (!walking && next.walkOnly) continue;
        const cost = here + node.costs[e]!;
        if (cost >= dist[to]!) continue;
        dist[to] = cost;
        prev[to] = current;
        heap.push(to, cost);
      }
    }

    if (!Number.isFinite(dist[goal]!)) return null;
    const chain: number[] = [];
    for (let at = goal; at !== -1; at = prev[at]!) chain.push(at);
    chain.reverse();
    return chain;
  }
}

function link(nodes: GraphNode[], a: number, b: number): void {
  if (a === b) return;
  const na = nodes[a]!;
  const nb = nodes[b]!;
  if (na.edges.includes(b)) return;
  const cost = Math.hypot(na.x - nb.x, na.z - nb.z) || 0.5;
  na.edges.push(b);
  na.costs.push(cost);
  nb.edges.push(a);
  nb.costs.push(cost);
}

class Heap {
  #priority = new Float64Array(64);
  #item = new Int32Array(64);
  #size = 0;

  get size(): number {
    return this.#size;
  }

  push(item: number, priority: number): void {
    if (this.#size === this.#priority.length) {
      const p = new Float64Array(this.#size * 2);
      const i = new Int32Array(this.#size * 2);
      p.set(this.#priority);
      i.set(this.#item);
      this.#priority = p;
      this.#item = i;
    }
    let at = this.#size++;
    this.#priority[at] = priority;
    this.#item[at] = item;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.#priority[parent]! <= this.#priority[at]!) break;
      this.#swap(at, parent);
      at = parent;
    }
  }

  pop(): number {
    const top = this.#item[0]!;
    this.#size--;
    if (this.#size > 0) {
      this.#priority[0] = this.#priority[this.#size]!;
      this.#item[0] = this.#item[this.#size]!;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.#size && this.#priority[left]! < this.#priority[smallest]!) {
          smallest = left;
        }
        if (right < this.#size && this.#priority[right]! < this.#priority[smallest]!) {
          smallest = right;
        }
        if (smallest === i) break;
        this.#swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  #swap(a: number, b: number): void {
    const p = this.#priority[a]!;
    this.#priority[a] = this.#priority[b]!;
    this.#priority[b] = p;
    const it = this.#item[a]!;
    this.#item[a] = this.#item[b]!;
    this.#item[b] = it;
  }
}

export function profileRoute(
  path: RoutePath,
  options: RaceLineOptions,
): RoutePath {
  const n = path.points.length;
  if (n < 8) return path;
  const packed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = path.points[i]!;
    packed[i * 3] = p.x;
    packed[i * 3 + 1] = p.y;
    packed[i * 3 + 2] = p.z;
  }
  const line = new RaceLine(packed, { ...options, closed: false });
  const points = path.points.map((point, i) => ({
    ...point,
    limit: line.speed[i] ?? point.limit,
  }));
  return { points, length: path.length, offroadTail: path.offroadTail };
}

export type RouteAdvisory = 'ok' | 'caution' | 'brake';
export type RouteTurn = 'none' | 'left' | 'right' | 'around';

/**
 * Farbe an einem Punkt: Tempo jetzt gegen Solltempo **dort**.
 *
 * Das Solltempo trägt den Bremsweg der nächsten Kurve schon in sich
 * (`RaceLine` rückwärts). Noch einmal `sqrt(v²+2as)` von der Auto-Position
 * draufzurechnen würde das Rot in den Scheitel schieben — Forza färbt die
 * Anfahrt.
 */
export function advisoryAt(speed: number, limit: number): RouteAdvisory {
  const excess = speed - limit;
  if (excess >= WAYPOINT.redExcess) return 'brake';
  if (excess >= WAYPOINT.amberExcess) return 'caution';
  return 'ok';
}

export function routeAdvisory(path: RoutePath, arc: number, speed: number): RouteAdvisory {
  let worst: RouteAdvisory = 'ok';
  for (const point of path.points) {
    const ahead = point.arc - arc;
    if (ahead < 0 || ahead > WAYPOINT.lookAhead) continue;
    const grade = advisoryAt(speed, point.limit || 40);
    if (grade === 'brake') return 'brake';
    if (grade === 'caution') worst = 'caution';
  }
  return worst;
}

export function routeTurn(
  path: RoutePath,
  arc: number,
  heading: number,
): RouteTurn {
  const here = pointNear(path, arc);
  if (!here) return 'none';
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const tx = here.tx;
  const tz = here.tz;
  const align = fx * tx + fz * tz;
  if (align < Math.cos(WAYPOINT.aroundAngle)) return 'around';

  const ahead = pointNear(path, arc + WAYPOINT.turnLookahead);
  if (!ahead) return 'none';
  const cross = here.tx * ahead.tz - here.tz * ahead.tx;
  const dot = here.tx * ahead.tx + here.tz * ahead.tz;
  const angle = Math.atan2(cross, dot);
  if (angle > WAYPOINT.turnAngle) return 'left';
  if (angle < -WAYPOINT.turnAngle) return 'right';
  return 'none';
}

export function remainingAlong(path: RoutePath, arc: number): number {
  return Math.max(0, path.length - arc);
}

export function nearestRouteArc(
  path: RoutePath,
  x: number,
  z: number,
  from: number,
  window = 90,
): { arc: number; distance: number; tx: number; tz: number } {
  const points = path.points;
  const n = points.length;
  if (n === 0) return { arc: 0, distance: Infinity, tx: 0, tz: 1 };
  let start = 0;
  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.arc <= from) lo = mid;
    else hi = mid;
  }
  start = lo;

  let best = start;
  let bestD = Infinity;
  for (let d = -window; d <= window; d++) {
    const i = start + d;
    if (i < 0 || i >= n) continue;
    const p = points[i]!;
    const dist = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  const p = points[best]!;
  const q = points[Math.min(best + 1, n - 1)]!;
  let tx = q.x - p.x;
  let tz = q.z - p.z;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  return { arc: p.arc, distance: Math.sqrt(bestD), tx, tz };
}

function pointNear(
  path: RoutePath,
  arc: number,
): { tx: number; tz: number } | null {
  const points = path.points;
  const n = points.length;
  if (n < 2) return null;
  let lo = 0;
  let hi = n - 1;
  const s = Math.max(0, Math.min(path.length, arc));
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.arc <= s) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[Math.min(lo + 1, n - 1)]!;
  let tx = b.x - a.x;
  let tz = b.z - a.z;
  const len = Math.hypot(tx, tz) || 1;
  return { tx: tx / len, tz: tz / len };
}

export function packRouteXZ(path: RoutePath): Float32Array {
  const out = new Float32Array(path.points.length * 2);
  for (let i = 0; i < path.points.length; i++) {
    out[i * 2] = path.points[i]!.x;
    out[i * 2 + 1] = path.points[i]!.z;
  }
  return out;
}


