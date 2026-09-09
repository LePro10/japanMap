import { filletPath, toControlPoints } from './route-planner.mjs';
import { needlePoints, URBAN_ROUTES } from './wp6-layout.mjs';
import { CITY_ROAD_LEVEL } from '../src/config/city.mjs';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function nearest(roads, p, radius = 65) {
  let hit = null, best = radius;
  for (const r of roads) for (let i = 0; i < r.centerline.length - 3; i += 3) {
    const l = r.centerline, dx = l[i + 3] - l[i], dz = l[i + 5] - l[i + 2];
    const q = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p[0] - l[i]) * dx + (p[1] - l[i + 2]) * dz) / q));
    const x = l[i] + dx * t, z = l[i + 2] + dz * t, d = Math.hypot(x - p[0], z - p[1]);
    if (d >= best) continue;
    best = d;
    hit = { p: [x, z], y: l[i + 1] + (l[i + 4] - l[i + 1]) * t, road: r, width: r.widths[i / 3], dx, dz };
  }
  return hit;
}

// Alle echten Querungen werden Streckenenden. So nutzt das Mesh seinen
// vorhandenen Rücksprung, statt zwei komplette Fahrbahnen übereinanderzulegen.
function crossings(points, roads) {
  const hits = [], arcs = [0];
  for (let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + distance(points[i - 1], points[i]));
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1], ux = b[0] - a[0], uz = b[1] - a[1];
    for (const road of roads) for (let i = 0; i < road.centerline.length - 3; i += 3) {
      const l = road.centerline, cx = l[i], cz = l[i + 2], vx = l[i + 3] - cx, vz = l[i + 5] - cz;
      if (Math.max(a[0], b[0]) < Math.min(cx, cx + vx) || Math.min(a[0], b[0]) > Math.max(cx, cx + vx) ||
          Math.max(a[1], b[1]) < Math.min(cz, cz + vz) || Math.min(a[1], b[1]) > Math.max(cz, cz + vz)) continue;
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 1e-8) continue;
      const t = ((cx - a[0]) * vz - (cz - a[1]) * vx) / det;
      const s = ((cx - a[0]) * uz - (cz - a[1]) * ux) / det;
      if (t < 0 || t > 1 || s < 0 || s > 1) continue;
      const sin = Math.abs(det) / (Math.hypot(ux, uz) * Math.hypot(vx, vz));
      if (sin < .3) continue;
      hits.push({ p: [a[0] + ux * t, a[1] + uz * t], y: l[i + 1] + (l[i + 4] - l[i + 1]) * s,
        road, width: road.widths[i / 3], arc: arcs[k] + distance(a, b) * t, trim: (road.widths[i / 3] / 2) / sin - .08 });
    }
  }
  return { hits: hits.sort((a, b) => a.arc - b.arc).filter((h, i, all) => i === 0 || h.arc - all[i - 1].arc > 12), arcs };
}

export function appendWP6Roads(terrain, roads, buildRoad, routeHill) {
  const circuit = buildRoad(terrain, {
    id: 'needle-circuit', type: 'city', closed: true, tags: ['wp6', 'circuit'],
    points: needlePoints(), design: { width: 16, maxGradient: .07, minRadius: 35 },
  }).data;
  // Freie Auslaufzone; keine harte Leitplanke direkt neben der Ideallinie.
  circuit.rails = [];
  roads.push(circuit);

  const routes = [...URBAN_ROUTES,
    ['needle-pit-entry', 7, [[-940,680],[-950,600],[-800,580],[-550,530]]],
    ['needle-pit-exit', 7, [[-350,585],[-270,610],[-210,735]]],
    ['commons-drive', 9, [[550,510],[600,570],[680,610],[760,440]]],
  ];
  for (const [id, width, controls] of routes) {
    const hill = controls.some(p => p[1] < -300);
    const start = nearest(roads.filter(r => r.id !== 'needle-circuit' || id.startsWith('needle-pit')), controls[0]);
    const end = nearest(roads.filter(r => r.id !== 'needle-circuit' || id.startsWith('needle-pit')), controls.at(-1));
    const waypoints = controls.map(p => p.slice());
    if (start && id !== 'commons-drive') waypoints[0] = start.p;
    if (end) waypoints[waypoints.length - 1] = end.p;
    const rounded = filletPath(waypoints, { radius: 75, floor: 32, closed: false });
    const points = hill && controls.length <= 4 ? routeHill(waypoints) : toControlPoints(rounded.path, { fine: 8, coarse: 12, closed: false });
    const { hits, arcs } = crossings(points, roads);
    const first = { p: points[0], arc: 0, ...(id !== 'commons-drive' && start ? { y: start.y, road: start.road, trim: 0 } : {}) };
    const last = { p: points.at(-1), arc: arcs.at(-1), ...(end ? { y: end.y, road: end.road, trim: 0 } : {}) };
    const cuts = [first, ...hits.filter(h => h.arc > 18 && h.arc < last.arc - 18), last];
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k], b = cuts[k + 1];
      if (b.arc - a.arc < 20) continue;
      const part = [a.p, ...points.filter((_, i) => arcs[i] > a.arc + 3 && arcs[i] < b.arc - 3), b.p];
      const pins = new Map(), junctions = [];
      for (const [at, cut, index] of [['start', a, 0], ['end', b, part.length - 1]]) {
        if (!cut.road) continue;
        pins.set(index, cut.y);
        junctions.push({ at, with: cut.road.id, moved: 0, height: cut.y, trim: cut.trim ?? 0 });
      }
      const built = buildRoad(terrain, {
        id: k === 0 ? id : `${id}-${k + 1}`, type: 'city', closed: false,
        tags: ['wp6', id, ...(hill ? ['hill'] : []), ...(id.startsWith('needle') || id === 'commons-drive' ? [] : ['urban'])],
        points: part, junctions, level: CITY_ROAD_LEVEL,
        design: { width, maxGradient: hill ? .12 : .08, minRadius: 25 },
      }).data;
      // Ortsstraßen haben offene Einmündungen; Stützwände entstehen am Gelände.
      built.rails = [];
      roads.push(built);
      console.log(`  WP6 ${built.id}: ${built.length.toFixed(0)} m, ${(built.measured.maxGradient * 100).toFixed(1)} %, R ${built.measured.minRadius}, Erdbau ${built.measured.meanEarthwork} m`);
    }
  }
}
