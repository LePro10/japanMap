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
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
function round(p: Place): Place {
  const fix = (o: Record<string, unknown>) => {
    for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = r3(o[k] as number);
    return o;
  };
  p.items.forEach(fix);
  p.trees.forEach(fix);
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
