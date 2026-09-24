import { filletPath, toControlPoints } from './route-planner.mjs';
import { needlePoints, URBAN_ROUTES } from './wp6-layout.mjs';
import { CITY_ROAD_LEVEL, inCityDistrict } from '../src/config/city.mjs';
import {
  CITY_CIRCUIT,
  EDGE_ROUTES,
  GRID_STREETS,
  RING_GRADE_Z,
  STREET_CLASS,
  densify,
  filletLoop,
  streetPoints,
} from '../src/config/tokyoLayout.mjs';

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
function crossings(points, roads, keep = () => true) {
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
      const hit = { p: [a[0] + ux * t, a[1] + uz * t], y: l[i + 1] + (l[i + 4] - l[i + 1]) * s,
        road, width: road.widths[i / 3], arc: arcs[k] + distance(a, b) * t, trim: (road.widths[i / 3] / 2) / sin - .08 };
      if (keep(hit)) hits.push(hit);
    }
  }
  return { hits: hits.sort((a, b) => a.arc - b.arc).filter((h, i, all) => i === 0 || h.arc - all[i - 1].arc > 12), arcs };
}

/**
 * Den Ring nur dort als Kreuzungspartner zulassen, wo er ebenerdig liegt.
 *
 * Nördlich von `RING_GRADE_Z` liegt er 8…35 m über der Stadt (Hochstraße).
 * Eine Rasterstraße darunter ist keine Kreuzung — sie teilte sonst einen
 * Knoten mit dem Ring, und `fitNetwork` zöge dessen Profil an dieser Stelle auf
 * Stadthöhe herunter. Gemessen an der Ringhöhe, nicht an der Lage: bei
 * z = 150 steht er noch 1,6 m über der Stadt, bei z = 60 schon 8 m.
 */
const atGrade = (hit) => hit.road.id !== 'ring' || !inCityDistrict(hit.p[0], hit.p[1]) ||
  (hit.p[1] >= RING_GRADE_Z && hit.y < CITY_ROAD_LEVEL + 1.5);

/** Einen Streckenzug an seinen Kreuzungen teilen und die Teile bauen. */
function buildSplit(terrain, roads, buildRoad, { id, width, points, tags, hosts, keep, start, end, level, maxGradient, minRadius = 25 }) {
  const { hits, arcs } = crossings(points, hosts, keep);
  const first = { p: points[0], arc: 0, ...(start ? { y: start.y, road: start.road, trim: start.width / 2 + 1 } : {}) };
  const last = { p: points.at(-1), arc: arcs.at(-1), ...(end ? { y: end.y, road: end.road, trim: end.width / 2 + 1 } : {}) };
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
      tags, points: part, junctions, level,
      design: { width, maxGradient, minRadius },
    }).data;
    // Ortsstraßen haben offene Einmündungen; Stützwände entstehen am Gelände.
    built.rails = [];
    roads.push(built);
  }
}

/**
 * Neo-Tokio: Stadtkurs `stadt` und das Raster (src/config/tokyoLayout.mjs).
 *
 * **Vor** dem Außennetz, damit dessen Enden am Kernrand ans Raster einrasten.
 * Endpunkte des Rasters rasten nur auf eine Straße ein, die höchstens 3 m
 * entfernt ist — die übliche Fangweite von 65 m hätte die Rasterenden unter der
 * Hochstraße auf den Ring gezogen.
 */
function appendTokyoGrid(terrain, roads, buildRoad) {
  const circuit = buildRoad(terrain, {
    id: 'stadt', type: 'city', closed: true, tags: ['stadt', 'nachtstrecke', 'tokyo', 'grid'],
    points: filletLoop(CITY_CIRCUIT.corners, CITY_CIRCUIT.radius), level: CITY_ROAD_LEVEL,
    design: { width: CITY_CIRCUIT.width, maxGradient: .08, minRadius: 12 },
  }).data;
  circuit.rails = [];
  roads.push(circuit);
  console.log(`  Tokio stadt: ${circuit.length.toFixed(0)} m Stadtkurs, R ${circuit.measured.minRadius}`);

  let count = 0;
  for (const street of GRID_STREETS) {
    const [id, cls] = street;
    const hosts = roads.filter(r => r.tags.includes('tokyo') || r.id === 'ring');
    // v2: gerundete Knicke, alle 8 m ein Punkt — die Spline läuft durch jeden.
    const points = streetPoints(street, 8);
    const snap = p => {
      const hit = nearest(hosts, p, 3);
      return hit && atGrade({ road: hit.road, p: hit.p, y: hit.y }) ? hit : null;
    };
    const start = snap(points[0]), end = snap(points.at(-1));
    if (start) points[0] = start.p;
    if (end) points[points.length - 1] = end.p;
    const before = roads.length;
    buildSplit(terrain, roads, buildRoad, {
      id, width: STREET_CLASS[cls], points, hosts, keep: atGrade, start, end,
      tags: ['wp6', 'tokyo', 'grid', cls, id, 'urban'], level: CITY_ROAD_LEVEL, maxGradient: .08, minRadius: 12,
    });
    count += roads.length - before;
  }
  console.log(`  Tokio Raster: ${GRID_STREETS.length} Straßen → ${count} Abschnitte`);
  trimRingRails(roads);
}

/**
 * Leitplanken des Rings dort entfernen, wo er ebenerdig durch die Stadt läuft.
 *
 * Dort münden Rasterstraßen ein; eine durchgehende Planke stünde quer über jeder
 * Mündung — derselbe Fehler, den P14 an 67 Plankenpunkten gemessen hat. Auf dem
 * Hochstraßenteil bleiben sie: sie sind dort die einzige Absturzsicherung, bis
 * Phase 6 sie durch Brüstungen ersetzt.
 */
function trimRingRails(roads) {
  const ring = roads.find(r => r.id === 'ring');
  if (!ring?.rails?.length) return;
  const l = ring.centerline, cut = [];
  let arc = 0, open = null;
  for (let i = 0; i < l.length; i += 3) {
    if (i) arc += Math.hypot(l[i] - l[i - 3], l[i + 2] - l[i - 1]);
    const inside = inCityDistrict(l[i], l[i + 2]) && l[i + 1] < CITY_ROAD_LEVEL + 1.5;
    if (inside && open === null) open = arc;
    if (!inside && open !== null) { cut.push([open - 6, arc + 6]); open = null; }
  }
  if (open !== null) cut.push([open - 6, arc + 6]);
  const rails = [];
  for (const rail of ring.rails) {
    let pieces = [[rail.from, rail.to]];
    for (const [a, b] of cut) pieces = pieces.flatMap(([f, t]) => (b <= f || a >= t ? [[f, t]] : [[f, a], [b, t]].filter(([x, y]) => y - x > 8)));
    for (const [from, to] of pieces) rails.push({ side: rail.side, from: Number(from.toFixed(1)), to: Number(to.toFixed(1)) });
  }
  console.log(`  Tokio Ring: ${cut.map(([a, b]) => `${a.toFixed(0)}…${b.toFixed(0)} m`).join(', ')} ebenerdig im Kern, Planken ${ring.rails.length} → ${rails.length}`);
  ring.rails = rails;
}

export function appendWP6Roads(terrain, roads, buildRoad, routeHill) {
  const circuit = buildRoad(terrain, {
    id: 'needle-circuit', type: 'city', closed: true, tags: ['wp6', 'circuit'],
    points: needlePoints(), design: { width: 16, maxGradient: .07, minRadius: 35 },
  }).data;
  // Freie Auslaufzone; keine harte Leitplanke direkt neben der Ideallinie.
  circuit.rails = [];
  roads.push(circuit);

  appendTokyoGrid(terrain, roads, buildRoad);

  const routes = [...URBAN_ROUTES, ...EDGE_ROUTES,
    ['needle-pit-entry', 7, [[-940,680],[-950,600],[-800,580],[-550,530]]],
    ['needle-pit-exit', 7, [[-350,585],[-270,610],[-210,735]]],
  ];
  for (const [id, width, controls] of routes) {
    const hill = controls.some(p => p[1] < -300);
    const candidates = roads.filter(r => r.id !== 'needle-circuit' || id.startsWith('needle-pit'));
    const start = nearest(candidates, controls[0]);
    const end = nearest(candidates, controls.at(-1));
    const waypoints = controls.map(p => p.slice());
    if (start && id !== 'commons-drive') waypoints[0] = start.p;
    if (end) waypoints[waypoints.length - 1] = end.p;
    const rounded = filletPath(waypoints, { radius: 75, floor: 32, closed: false });
    const points = hill && controls.length <= 4 ? routeHill(waypoints) : toControlPoints(rounded.path, { fine: 8, coarse: 12, closed: false });
    buildSplit(terrain, roads, buildRoad, {
      id, width, points, hosts: roads, keep: atGrade,
      start: id !== 'commons-drive' ? start : null, end,
      tags: ['wp6', id, ...(hill ? ['hill'] : []), ...(id.startsWith('needle') || id === 'commons-drive' ? [] : ['urban'])],
      level: CITY_ROAD_LEVEL, maxGradient: hill ? .12 : .08,
    });
    console.log(`  WP6 ${id}`);
  }
}
