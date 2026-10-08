// Place layouts from the prototype → SourceData/legacy/places/<place>.json (run via Tools/export-places.mjs).
// Imports the legacy layout modules unchanged; only reads their data. Everything stays in Three
// coordinates (x, z, north = −z, yaw in radians, counter-clockwise from above, local +Z = front);
// the Unity importer converts (SourceData/legacy/README.md).
//
// Item: { kind, x, z, yaw, w?, d?, h?, y?, tag? } — kind is what the prototype built there (its own
// vocabulary, e.g. 'kura', 'hatago'); Data/Places/<Place>.asset maps kinds to library models.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [CACHE, OUT, ...only] = process.argv.slice(2);
const src = (p: string): Promise<any> => import(pathToFileURL(join(CACHE!, 'src', p)).href);

type Item = { kind: string; x: number; z: number; yaw: number; w?: number; d?: number; h?: number; y?: number; tag?: string };
type Tree = { species: string; x: number; z: number; scale: number; yaw: number };
interface Place {
  place: string;
  title: string;
  anchor: { x: number; z: number };
  items: Item[];
  trees: Tree[];
  clearCircles: [number, number, number][];
  clearRects: [number, number, number, number][];
  spawn?: { x: number; z: number; yaw: number };
  /** Roads the prototype built inside the place (not in roads.json): control points, Three x/z. */
  roads?: { id: string; type: string; width: number; points: [number, number][]; endY?: number; extends?: string }[];
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
function round(p: Place): Place {
  const fix = (o: Record<string, unknown>) => {
    for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = r3(o[k] as number);
    return o;
  };
  p.items.forEach(fix);
  p.trees.forEach(fix);
  p.roads?.forEach((r) => { r.points = r.points.map(([x, z]) => [r3(x), r3(z)]); });
  p.clearCircles = p.clearCircles.map((c) => c.map(r3) as [number, number, number]);
  p.clearRects = p.clearRects.map((c) => c.map(r3) as [number, number, number, number]);
  return p;
}

/** legacy StuntSystem hash — deterministic per position. */
function hash(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}


/** Baked terrain (SourceData/legacy/terrain, Unity layout: row 0 = south) as a Three-coordinate sampler. */
function terrainSampler(): (x: number, z: number) => number {
  const dir = join(OUT!, '..', 'terrain');
  const info = JSON.parse(readFileSync(join(dir, 'terrain.json'), 'utf8'));
  const res = info.import.resolution, raw = readFileSync(join(dir, info.file));
  const data = new Uint16Array(raw.buffer, raw.byteOffset, res * res);
  const { min, max } = info.heightMeters, step = info.metersPerSample;
  const ox = info.unityTerrainPosition.x, oz = info.unityTerrainPosition.z;
  const at = (c: number, r: number): number => min + (data[Math.min(res - 1, Math.max(0, r)) * res + Math.min(res - 1, Math.max(0, c))]! / 65535) * (max - min);
  return (x: number, z: number): number => {
    const u = (x - ox) / step, v = (-z - oz) / step;
    const c = Math.floor(u), r = Math.floor(v), fu = u - c, fv = v - r;
    return (at(c, r) * (1 - fu) + at(c + 1, r) * fu) * (1 - fv) + (at(c, r + 1) * (1 - fu) + at(c + 1, r + 1) * fu) * fv;
  };
}

function roadsFile(): any { return JSON.parse(readFileSync(join(OUT!, '..', 'roads', 'roads.json'), 'utf8')); }

const exporters: Record<string, () => Promise<Place>> = {
  /** sakuraLobby.ts + StuntSystem drift-zone ring + scatterChunk clearance + WP2 spawn. */
  async sakura() {
    const { DRIFT_ZONES } = await src('config/stunt.config.ts');
    const { lobbyOffsets, eventBoardSpot, layoutPads } = await src('world/stunt/sakuraLobby.ts');
    const zone = DRIFT_ZONES.find((z: any) => z.id === 'sakura-bowl');
    const s = { x: zone.x, z: zone.z };
    const { petal: P, bay: B } = lobbyOffsets(s);
    const items: Item[] = [
      { kind: 'showroom', x: P.x, z: P.z, yaw: 0, w: P.w, d: P.d, tag: 'Petal Motors' },
      // the showroom floor and the bay apron the cars stand on (prototype: slab at the footprint's highest point)
      { kind: 'showroomFloor', x: P.x, z: P.z, yaw: 0, w: P.w, d: P.d },
      // the court in front of both halls (shops and people occupy the northern court — ASTRA §2)
      { kind: 'court', x: (P.x - P.w / 2 + B.x + B.w / 2) / 2, z: s.z - 20, yaw: 0, w: B.x + B.w / 2 - (P.x - P.w / 2), d: 16 },
      { kind: 'bayApron', x: B.x, z: B.z + B.d / 2 + 2, yaw: 0, w: 8.8, d: 4 },
      { kind: 'workshop', x: B.x, z: B.z, yaw: 0, w: B.w, d: B.d, tag: 'Open Bay' },
      { kind: 'eventBoard', ...eventBoardSpot(s), yaw: 0, w: 4.1, d: 0.7 },
    ];
    // buildCourt: four stone lanterns, two benches facing the court, a lamp post beside each hall.
    for (const [dx, dz] of [[-16, -8], [16, -8], [-11, 10], [11, 10]]) items.push({ kind: 'stoneLantern', x: s.x + dx!, z: s.z + dz!, yaw: 0 });
    items.push({ kind: 'bench', x: s.x - 9.5, z: s.z + 6.5, yaw: 0.4 });
    items.push({ kind: 'bench', x: s.x + 9.5, z: s.z + 6.5, yaw: -0.4 });
    for (const x of [P.x + P.w / 2 + 1.4, B.x - B.w / 2 - 1.4]) items.push({ kind: 'lampPost', x, z: s.z - 18, yaw: 0 });
    for (const pad of layoutPads(P.x, P.z, P.w, P.d)) items.push({ kind: 'showCar', x: pad.x, z: pad.z, yaw: pad.yaw, tag: pad.id });

    const trees: Tree[] = [];
    for (let i = 0; i < zone.trees; i++) {
      const angle = (Math.PI * 2 * i) / zone.trees;
      const jitter = hash(zone.x + i * 13.7, zone.z - i * 7.1);
      const r = zone.radius + (jitter - 0.5) * 8;
      const x = zone.x + Math.cos(angle) * r, z = zone.z + Math.sin(angle) * r;
      trees.push({ species: 'Cherry', x, z, scale: 0.85 + jitter * 0.5, yaw: jitter * Math.PI * 2 });
      // every fourth tree has a flag 4 m further in, facing inward
      if (i % 4 === 0) items.push({ kind: 'flag', x: zone.x + Math.cos(angle) * (r - 4), z: zone.z + Math.sin(angle) * (r - 4), yaw: angle + Math.PI / 2 });
    }
    return {
      place: 'sakura', title: 'Sakura Commons', anchor: s, items, trees,
      // scatterChunk: 55 m court and the eastern exit strip
      clearCircles: [[s.x, s.z, 55]],
      clearRects: [[s.x, s.z - 4 - 9, s.x + 180, s.z - 4 + 9]],
      // WP2: the car starts 4 m north of the on-foot spawn, facing east (driver's side visible)
      spawn: { x: s.x, z: s.z - 4, yaw: Math.PI / 2 },
    };
  },
  /** CitySystem: generateTokyo (core) + generateSuburbs (WP6 terraces), fed like the prototype feeds them. */
  async tokyo() {
    const { CITY_DISTRICT, CITY_ROAD_LEVEL } = await src('config/city.config.ts');
    const { generateTokyo } = await src('world/city/TokyoGenerator.ts');
    const { generateSuburbs } = await src('world/city/TokyoSuburbs.ts');
    const file = roadsFile();
    const height = terrainSampler();
    const roads: any[] = [], viaduct: any[] = [];
    const margin = 40;
    const near = (x: number, z: number) => x > CITY_DISTRICT.minX - margin && x < CITY_DISTRICT.maxX + margin && z > CITY_DISTRICT.minZ - margin && z < CITY_DISTRICT.maxZ + margin;
    for (const road of file.roads) {
      const l = road.centerline, width = road.widths[0] ?? 8;
      let run: number[] = [], runElevated = false;
      const flush = () => { if (run.length >= 4) (runElevated ? viaduct : roads).push({ points: run, width }); run = []; };
      for (let i = 0; i < l.length; i += 3) {
        const x = l[i], y = l[i + 1], z = l[i + 2];
        if (!near(x, z)) { flush(); continue; }
        const elevated = y > CITY_ROAD_LEVEL + 1.5;
        if (run.length && elevated !== runElevated) { const px = run[run.length - 2]!, pz = run[run.length - 1]!; flush(); run.push(px, pz); }
        runElevated = elevated;
        run.push(x, z);
      }
      if (road.closed && run.length && !runElevated && l.length >= 3) run.push(l[0], l[2]);
      flush();
    }
    const result = generateTokyo({ roads, viaduct, sampleTerrain: height });
    // RoadNetwork.closestPoint, brute force over the 2 m centrelines
    const toward = (x: number, z: number): [number, number] | null => {
      let best = 90 * 90, bx = 0, bz = 0;
      for (const road of file.roads) {
        const l = road.centerline;
        for (let i = 0; i < l.length; i += 3) {
          const d = (l[i] - x) ** 2 + (l[i + 2] - z) ** 2;
          if (d < best) { best = d; bx = l[i]; bz = l[i + 2]; }
        }
      }
      if (best >= 90 * 90) return null;
      const dx = bx - x, dz = bz - z, len = Math.hypot(dx, dz) || 1;
      return [dx / len, dz / len];
    };
    const suburbs = generateSuburbs(file.urbanLots ?? [], toward);
    const items: Item[] = [];
    const frontYaw: Record<string, number> = { pz: 0, px: Math.PI / 2, nz: Math.PI, nx: -Math.PI / 2 };
    for (const b of [...result.buildings, ...suburbs.buildings]) {
      const rotated = b.yaw !== undefined;
      const w = rotated ? b.w : (b.front === 'pz' || b.front === 'nz' ? b.maxX - b.minX : b.maxZ - b.minZ);
      const d = rotated ? b.d : (b.front === 'pz' || b.front === 'nz' ? b.maxZ - b.minZ : b.maxX - b.minX);
      items.push({
        kind: String(b.id).startsWith('vorort') || String(b.id).includes('suburb') ? 'suburbHouse' : 'cityBuilding',
        tag: `f${b.family}`,
        x: rotated ? b.cx : (b.minX + b.maxX) / 2, z: rotated ? b.cz : (b.minZ + b.maxZ) / 2,
        yaw: rotated ? b.yaw : frontYaw[b.front]!, w, d, h: b.height, y: b.baseY, fixedY: true,
      });
    }
    console.log(`  tokyo stats: ${JSON.stringify(result.stats.byStyle)} onRoad ${result.stats.onRoad}, suburbs ${suburbs.buildings.length}, open lots ${result.openLots.length}`);
    const sample = result.buildings.slice(0, 3).map((b: any) => b.id).join(', ') + ' … ' + suburbs.buildings.slice(0, 2).map((b: any) => b.id).join(', ');
    console.log(`  ids: ${sample}`);
    return { place: 'tokyo', title: 'Tokyo', anchor: { x: 620, z: 120 }, items, trees: [], clearCircles: [], clearRects: [] };
  },
  /** FunauraVillage.ts + funauraLayout.ts (DOERFER.md §1). */
  async funaura() {
    const L = await src('world/settlements/funaura/funauraLayout.ts');
    const Q = L.QUAY_Y, P = L.PLATFORM;
    const items: Item[] = [];
    const fixed = (it: Item, y: number): Item => ({ ...it, y, fixedY: true });
    // the filled quay platform (umetate-chi), west (funaya quarter) and east (working port)
    items.push(fixed({ kind: 'quay', x: (P.minX + P.split) / 2, z: (P.minZ + P.faceWest) / 2, yaw: 0, w: P.split - P.minX, d: P.faceWest - P.minZ }, Q));
    items.push(fixed({ kind: 'quay', x: (P.split + P.maxX) / 2, z: (P.minZ + P.faceEast) / 2, yaw: 0, w: P.maxX - P.split, d: P.faceEast - P.minZ }, Q));
    // quay wall along the sea faces, every 8 m, facing the sea (+z)
    for (let x = P.minX + 4; x < P.split; x += 8) items.push(fixed({ kind: 'quayWall', x, z: P.faceWest, yaw: 0 }, Q));
    for (let x = P.split + 4; x < P.maxX; x += 8) items.push(fixed({ kind: 'quayWall', x, z: P.faceEast, yaw: 0 }, Q));
    // stone steps (gangi) in front of the hall
    items.push(fixed({ kind: 'quaySteps', x: -1212.5, z: P.faceWest, yaw: 0 }, Q));
    for (const [x, w, variant, balcony] of L.FUNAYA)
      items.push(fixed({ kind: 'funaya', tag: balcony ? 'balcony' : 'plain', x, z: (L.FUNAYA_BACK + L.FUNAYA_FRONT) / 2, yaw: 0, w, d: L.FUNAYA_FRONT - L.FUNAYA_BACK }, Q));
    for (const [x, z, w, d, yaw, kind, floors] of L.VILLAGE_HOUSES) {
      const onQuay = x > P.minX - 1 && x < P.maxX + 1 && z > P.minZ - 1;
      const it: Item = { kind: 'house', tag: kind, x, z, yaw, w, d, h: floors * 3.2 };
      items.push(onQuay ? fixed(it, Q) : it);
    }
    items.push(fixed({ kind: 'marketHall', x: -1180, z: 1095.5, yaw: 0, w: 26, d: 13 }, Q));
    for (let z = L.PIER.z0 + 4; z < L.PIER.z1; z += 8) items.push(fixed({ kind: 'pier', x: L.PIER.x, z, yaw: 0, w: L.PIER.w }, Q));
    items.push(fixed({ kind: 'slipway', x: L.SLIPWAY.x, z: (L.SLIPWAY.z0 + L.SLIPWAY.z1) / 2, yaw: 0, w: L.SLIPWAY.w, d: L.SLIPWAY.z1 - L.SLIPWAY.z0 }, Q));
    for (const mole of [L.WEST_MOLE, L.EAST_MOLE]) for (let i = 1; i < mole.length; i++) {
      const [ax, az] = mole[i - 1]!, [bx, bz] = mole[i]!, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 8));
      for (let k = 0; k < n; k++) items.push(fixed({ kind: 'mole', x: ax + (bx - ax) * (k + 0.5) / n, z: az + (bz - az) * (k + 0.5) / n, yaw: Math.atan2(-(bz - az), bx - ax) }, 0));
    }
    items.push(fixed({ kind: 'harbourLight', tag: 'red', ...L.LIGHT_RED, yaw: 0 }, L.MOLE_Y));
    items.push(fixed({ kind: 'harbourLight', tag: 'white', ...L.LIGHT_WHITE, yaw: 0 }, L.MOLE_Y));
    for (const [x, z] of [[L.PIER.x - 3, L.PIER.z1 - 2], [L.PIER.x + 3, L.PIER.z0 + 20], [-1300, 1075], [-1266, 1075], [-1232, 1075], [-1150, 1075]])
      items.push(fixed({ kind: 'streetLamp', x: x!, z: z!, yaw: Math.PI }, Q));
    // boats: four at the pier, one at the east quay, one in the basin, three skiffs (#buildWorkingPort)
    for (let i = 0; i < 4; i++) items.push(fixed({ kind: 'boat', tag: 'big', x: L.PIER.x + (i % 2 ? 1 : -1) * (L.PIER.w / 2 + 1.9), z: L.PIER.z0 + 14 + Math.floor(i / 2) * 20, yaw: i % 2 ? 0 : Math.PI }, 0));
    items.push(fixed({ kind: 'boat', tag: 'big', x: -1158, z: P.faceEast + 2, yaw: Math.PI / 2 }, 0));
    items.push(fixed({ kind: 'boat', tag: 'big', x: -1300, z: 1165, yaw: 0.3 }, 0));
    for (const [x, z, yaw] of [[-1196, 1112, 0.2], [-1150, 1118, 2.9], [-1300, 1130, -0.4]]) items.push(fixed({ kind: 'boat', tag: 'small', x: x!, z: z!, yaw: yaw! }, 0));
    // quay clutter (#buildProps): squid racks, nets/buoys/crates in the yard behind the boathouses, drying nets, bicycles
    for (const [x, z] of [[-1296, 1089.2], [-1243, 1089.2], [-1165, 1074.5]]) items.push(fixed({ kind: 'squidRack', x: x!, z: z!, yaw: 0 }, Q));
    for (let i = 0; i < 22; i++) {
      const x = P.minX + 4 + i * 4.6;
      if (x > P.split - 2) break;
      if (Math.abs(x + 1243) < 2.5 || Math.abs(x + 1296) < 2.5) continue;
      items.push(fixed({ kind: 'yardGear', tag: ['nets', 'buoys', 'crates', 'barrels'][i % 4], x, z: L.HARBOUR_LANE.z1 + 1.9, yaw: 0 }, Q));
    }
    for (let i = 0; i < 3; i++) items.push(fixed({ kind: 'dryingNet', x: -1225 + i * 7, z: 1068, yaw: 0 }, Q));
    for (const [x, z] of [[-1293, 1074], [-1244, 1074], [-1232, 1074.5]]) items.push(fixed({ kind: 'bicycle', x: x!, z: z!, yaw: Math.PI / 2 }, Q));
    for (const [x, z, yaw] of [[-1190, 1068, 0.1], [-1168, 1070, -0.2], [-1232.5, 1075.3, Math.PI / 2]]) items.push(fixed({ kind: 'keiTruck', x: x!, z: z!, yaw: yaw! }, Q));
    items.push({ kind: 'shrine', ...L.SHRINE });
    { const [ax, az] = L.SHRINE_PATH[L.SHRINE_PATH.length - 2]!, [bx, bz] = L.SHRINE_PATH[L.SHRINE_PATH.length - 1]!;
      items.push({ kind: 'shrineTorii', x: bx, z: bz, yaw: Math.atan2(bx - ax, bz - az) }); }
    const trees: Tree[] = L.PINES.map(([x, z, scale]: number[]) => ({ species: 'Pine', x, z, scale, yaw: hash(x!, z!) * Math.PI * 2 }));
    const clearCircles: [number, number, number][] = [];
    L.funauraClearance((x: number, z: number, r: number) => clearCircles.push([x, z, r]));
    return {
      place: 'funaura', title: 'Funaura', anchor: L.FUNAURA, items, trees, clearCircles, clearRects: [],
      roads: [{ id: 'funaura-river-road', type: 'village', width: 6.2, points: L.RIVER_ROAD.map(([x, z]: number[]) => [x, z]), endY: Q }],
    };
  },
  /** KoedoTown.ts + koedoLayout.ts (DOERFER.md §4): one street in road coordinates (s along, o left). */
  async koedo() {
    const L = await src('world/settlements/koedo/koedoLayout.ts');
    const dorf = roadsFile().roads.find((r: any) => r.id === 'dorf');
    L.useRoadAxis(dorf.centerline, dorf.length / (dorf.centerline.length / 3 - 1));
    const items: Item[] = [];
    const house = (kind: string, tag: string, s: number, side: number, w: number, d: number, setback: number, skew: number): Item => {
      const [x, z] = L.at(s, side * (L.FRONT + setback + d / 2));
      return { kind, tag, x, z, yaw: L.faceRoad(s, side) + skew, w, d };
    };
    for (const h of L.HOUSES) items.push(house(h.kind, `${h.role}${h.low ? '/low' : ''}`, h.s, h.side, h.w, h.d, h.setback, h.skew));
    items.push(house('brewery', '', L.BREWERY.s, -1, L.BREWERY.w, L.BREWERY.d, 0, 0));
    { const [x, z] = L.at(L.TOWER.s, L.TOWER.o); items.push({ kind: 'bellTower', x, z, yaw: L.faceRoad(L.TOWER.s, 1) }); }
    { // the plaza outside the bend, paved
      const s = (L.PLAZA.s0 + L.PLAZA.s1) / 2, [x, z] = L.at(s, L.PLAZA.o / 2 + 3);
      items.push({ kind: 'plaza', x, z, yaw: L.faceRoad(s, 1), w: L.PLAZA.s1 - L.PLAZA.s0, d: L.PLAZA.o });
    }
    // canal promenade: white storehouses facing west across the promenade to the water
    const C = L.CANAL;
    for (const [z, w, d, kind] of L.CANAL_ROW) items.push({ kind: kind === 'white' ? 'white' : kind, tag: 'canal', x: L.canalX(z) + C.water / 2 + C.wall + C.prom + d / 2, z, yaw: -Math.PI / 2, w, d });
    items.push({ kind: 'canal', x: L.canalX((C.z0 + C.z1) / 2), z: (C.z0 + C.z1) / 2, yaw: 0, w: C.water + 2 * C.wall, d: C.z1 - C.z0 });
    for (const b of L.BRIDGES) items.push({ kind: 'bridge', tag: b.kind, x: L.canalX(b.z), z: b.z, yaw: Math.PI / 2, w: C.water + 2 * C.wall });
    for (const [x, z, w, d, yaw] of L.STOREHOUSES) items.push({ kind: 'storehouse', x, z, yaw, w, d });
    for (const [x, z, w, d, floors, yaw] of L.MODERN) items.push({ kind: 'modern', x, z, yaw, w, d, h: floors * 3 });
    { // beyond the street's end: the axis stops at S_END, so continue along its last direction
      const f = L.frame(L.S_END), past = (m: number): [number, number] => [f.x + f.tx * m, f.z + f.tz * m];
      const yaw = Math.atan2(-f.tx, -f.tz); // facing back up the street
      const [x, z] = past(L.SHRINE.s - L.S_END + 2), [hx, hz] = past(L.SHRINE.s - L.S_END + 16);
      items.push({ kind: 'shrineTorii', x, z, yaw }, { kind: 'shrineHall', x: hx, z: hz, yaw }); }
    // street lamps on both pavements every 24 m (Ichibangai has its lanterns at the gutter line)
    for (let s = 590; s < L.S_END - 4; s += 24) for (const side of [1, -1]) {
      const [x, z] = L.at(s + (side > 0 ? 0 : 12), side * (L.roadHalf(s) + 0.9));
      items.push({ kind: 'streetLamp', x, z, yaw: L.faceRoad(s, side) + Math.PI });
    }
    const trees: Tree[] = L.WILLOWS.map(([z, side, size]: number[]) => {
      const x = L.canalX(z!) + side! * (C.water / 2 + C.wall + (side! > 0 ? 1.6 : C.dike / 2));
      return { species: 'Willow', x, z: z!, scale: size!, yaw: hash(x, z!) * Math.PI * 2 };
    });
    const clearCircles: [number, number, number][] = [];
    L.koedoClearance((x: number, z: number, r: number) => clearCircles.push([x, z, r]));
    // Street B: the village road continues south from its end at (−190 | 90) — an extension, not a new road
    const B: [number, number][] = [];
    for (let s = L.JOIN + 1; s <= L.S_END; s += 4) { const f = L.frame(s); B.push([f.x, f.z]); }
    return {
      place: 'koedo', title: 'Koedo', anchor: { x: L.KOEDO.x, z: L.KOEDO.z }, items, trees, clearCircles, clearRects: [],
      roads: [{ id: 'koedo-street-b', type: 'village', width: 2 * L.ROAD_HALF_B, points: B, extends: 'dorf' }],
    };
  },
};

for (const name of only.length ? only : Object.keys(exporters)) {
  const make = exporters[name];
  if (!make) { console.error(`unknown place '${name}' (known: ${Object.keys(exporters).join(', ')})`); process.exit(2); }
  const place = round(await make());
  writeFileSync(join(OUT!, `${name}.json`), JSON.stringify(place, null, 1) + '\n');
  const kinds = new Map<string, number>();
  for (const it of place.items) kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);
  console.log(`EXPORT ${name}: ${place.items.length} items (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}), ${place.trees.length} trees`);
}
