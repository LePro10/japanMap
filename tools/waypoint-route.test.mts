import assert from 'node:assert/strict';

import type { RoadData } from '@/config/roads.config';
import { WAYPOINT } from '@/config/waypoint.config';
import {
  RouteGraph,
  advisoryAt,
  nearestRouteArc,
  profileRoute,
  remainingAlong,
  routeTurn,
} from '@/game/routeGraph';
import { damp, dampAngle, formatEta, formatWaypointDistance, pinScreen } from '@/game/waypointScreen';

function road(
  id: string,
  points: readonly [number, number, number][],
  extra: Partial<RoadData> = {},
): RoadData {
  const centerline: number[] = [];
  const widths: number[] = [];
  const banking: number[] = [];
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    centerline.push(p[0], p[1], p[2]);
    widths.push(8);
    banking.push(0);
    if (i > 0) {
      const q = points[i - 1]!;
      length += Math.hypot(p[0] - q[0], p[2] - q[2]);
    }
  }
  return {
    id,
    type: 'city',
    closed: false,
    tags: [],
    nodes: points.map((p) => ({ pos: p, width: 8, banking: 0 })),
    centerline,
    widths,
    banking,
    length,
    junctions: extra.junctions ?? [],
    trimStart: 0,
    trimEnd: 0,
    rails: [],
    measured: {
      minRadius: 40,
      maxGradient: 0,
      hairpins: 0,
      deepestCut: 0,
      highestFill: 0,
      meanEarthwork: 0,
      earthwork95: 0,
      worstAt: 0,
      gradientMargin: 0,
      gradientAttempts: 0,
      climb: 0,
      neededLength: 0,
      railLength: 0,
    },
    ...extra,
  };
}

function line(
  id: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  extra: Partial<RoadData> = {},
  step = 4,
): RoadData {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.ceil(len / step) + 1);
  const points: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    points.push([x0 + dx * t, 10, z0 + dz * t]);
  }
  return road(id, points, extra);
}

// ── Screen-Pin: der Sprite in Weltmetern ist genau deshalb raus ─────────────

const on = pinScreen(0, 0, true, 1280, 720);
assert.equal(on.onScreen, true);
assert.ok(Math.abs(on.x - 640) < 1);
assert.ok(Math.abs(on.y - 360) < 1);

const edge = pinScreen(3, 0, true, 1280, 720);
assert.equal(edge.onScreen, false);
assert.ok(edge.x > 1100, `right edge, got ${edge.x}`);

const behind = pinScreen(0.2, 0.1, false, 1280, 720);
assert.equal(behind.onScreen, false);
assert.ok(behind.x < 640, 'behind the camera must flip to the opposite edge');

assert.equal(formatWaypointDistance(428), '428 m');
assert.equal(formatWaypointDistance(999.6), '1.0 km');
assert.equal(formatEta(12), '12 s');
assert.equal(formatEta(90), '1 min 30 s');

// ── Graph: kurze Verbindung statt Umweg ─────────────────────────────────────

const main = line('main', 0, 0, 0, 400);
const short = line('short', 0, 200, 80, 200, {
  junctions: [{ at: 'start', with: 'main', moved: 0, height: 10, trim: 0 }],
});
const long = line('long', 0, 0, 80, 0, {
  junctions: [{ at: 'start', with: 'main', moved: 0, height: 10, trim: 0 }],
});
const graph = new RouteGraph([main, short, long]);
assert.ok(graph.nodeCount > 20, `graph too small: ${graph.nodeCount}`);

const path = graph.find(0, 10, 80, 200, false);
assert.ok(path, 'route missing');
assert.ok(path.length < 320, `took the long way: ${path.length.toFixed(1)} m`);
assert.ok(path.length > 140, `too short to have used the roads: ${path.length.toFixed(1)} m`);

const remaining = remainingAlong(path, path.length * 0.25);
assert.ok(Math.abs(remaining - path.length * 0.75) < 2);

const near = nearestRouteArc(path, path.points[3]!.x, path.points[3]!.z, 0);
assert.ok(near.distance < 2);

// ── Speed-Hinweis: zu schnell in die Kurve = brake ──────────────────────────

assert.equal(advisoryAt(40, 12, 20, 10), 'brake');
assert.equal(advisoryAt(10, 40, 80, 10), 'ok');

const hairpin = graph.find(0, 0, 0, 400, false);
assert.ok(hairpin);
const profiled = profileRoute(hairpin, {
  latAccel: 9,
  brakeAccel: 10,
  driveAccel: 6,
  crestAccel: 0.55,
  maxSpeed: 50,
  closed: false,
});
const mid = profiled.points[Math.floor(profiled.points.length / 2)]!;
assert.ok(mid.limit > 0, 'profile wrote no speed');

const turn = routeTurn(path, 0, 0);
assert.ok(turn === 'none' || turn === 'left' || turn === 'right' || turn === 'around');

assert.ok(WAYPOINT.arriveMeters > 10);
assert.ok(WAYPOINT.lineWidth < 4, 'GPS strip must stay narrower than a lane');

const step = damp(0, 1, 7, 0.3);
assert.ok(Math.abs(step - (1 - Math.exp(-2.1))) < 1e-9, 'damp must be exponential');
assert.equal(damp(0.4, 0.4, 7, 0.16), 0.4);
assert.equal(damp(0, 1, 7, 0), 0);
const wrapped = dampAngle(3.0, -3.0, 12, 0.05);
assert.ok(wrapped > 3.0 || wrapped < -2.5, 'angle damp must take the short way across the seam');

console.log(
  `waypoint route: ${graph.nodeCount} nodes, path ${path.length.toFixed(0)} m, pin edge ${edge.x.toFixed(0)} — ok`,
);
