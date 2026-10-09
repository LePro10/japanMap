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
  /** Standing people and animals: legacy courtActors / FunauraVillage #buildActors / StillwaterVillage #actors (Three x/z, yaw). */
  actors?: { kind: string; x: number; z: number; yaw: number }[];
  /** Walk-in shop interiors (CityInteriorLayout + INTERIOR_SITES), boxes relative to the shop floor. */
  interiors?: { id: string; floorY: number; boxes: { x: number; y: number; z: number; w: number; h: number; d: number; finish: string; solid: boolean; visible: boolean }[] }[];
  /** On-foot start (legacy walker.config rollWalkSpawn: sakura-bowl centre, heading π = towards the car). */
  walkSpawn?: { x: number; z: number; yaw: number };
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
      walkSpawn: { x: s.x, z: s.z, yaw: Math.PI },
      // sakuraLobby.ts courtActors (not exported there): shop visitors and two on the benches
      actors: [
        { kind: 'visitor', x: B.x - 3.4, z: B.z + B.d / 2 + 1.6, yaw: 0.3 },
        { kind: 'visitor', x: P.x - 2.2, z: P.z + P.d / 2 + 2.1, yaw: -0.4 },
        { kind: 'visitor', x: P.x + 2.4, z: P.z + P.d / 2 + 1.8, yaw: 0.15 },
        { kind: 'visitor', x: s.x - 12.4, z: s.z + 3.4, yaw: 1.1 },
        { kind: 'seated', x: s.x - 9.2, z: s.z + 6.2, yaw: 0.4 },
        { kind: 'seated', x: s.x + 9.3, z: s.z + 6.2, yaw: -0.4 },
      ],
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
    const trees: Tree[] = [];
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
    // ── Street furniture by street class (TokyoStreetFurnitureSystem, docs/TOKYO.md v2) ─────────────────
    const { sidewalkFor } = await src('world/city/TokyoGenerator.ts');
    const all = roads.map((r: any) => ({ pts: r.points as number[], width: r.width as number }));
    const nearJunction = (x: number, z: number, self: any) => all.some((o: any) => o !== self && (() => {
      for (let i = 0; i < o.pts.length; i += 2) if ((o.pts[i] - x) ** 2 + (o.pts[i + 1] - z) ** 2 < (o.width / 2 + 7) ** 2) return true;
      return false; })());
    // every carriageway of the map (own widest width), on a 16 m grid: furniture must stand off all of them
    const grid = new Map<string, [number, number, number][]>();
    for (const road of file.roads) {
      const half = Math.max(...road.widths) / 2, l = road.centerline;
      for (let i = 0; i < l.length; i += 3) {
        const key = `${Math.floor(l[i] / 16)},${Math.floor(l[i + 2] / 16)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push([l[i], l[i + 2], half]);
      }
    }
    const clearOfRoads = (x: number, z: number, margin: number) => {
      const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
      for (let a = gx - 2; a <= gx + 2; a++) for (let b = gz - 2; b <= gz + 2; b++)
        for (const [px, pz, half] of grid.get(`${a},${b}`) ?? []) if ((px - x) ** 2 + (pz - z) ** 2 < (half + margin) ** 2) return false;
      return true;
    };
    let furniture = 0, dropped = 0;
    const push = items.push.bind(items);
    const pushFurniture = (it: Item) => { if (clearOfRoads(it.x, it.z, 0.5)) { push(it); return true; } dropped++; return false; };
    for (const r of all) {
      const w = r.width, walk = sidewalkFor(w);
      const cls = w >= 22 ? 'boulevard' : w >= 13 ? 'avenue' : w >= 9 ? 'street' : 'lane';
      const step = cls === 'boulevard' ? 24 : cls === 'avenue' ? 26 : cls === 'street' ? 30 : 28;
      let along = 0, next = step / 2, vend = 40 + hash(r.pts[0]!, r.pts[1]!) * 40;
      for (let i = 2; i < r.pts.length; i += 2) {
        const ax = r.pts[i - 2]!, az = r.pts[i - 1]!, bx = r.pts[i]!, bz = r.pts[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az); if (len < 1e-3) continue;
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        while (next <= along + len) {
          const t = (next - along) / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (!nearJunction(x, z, r)) for (const side of [-1, 1]) {
            if (cls === 'lane' && side < 0) continue; // one row of poles in a lane
            const off = w / 2 + 0.8; // at the kerb, clear of the carriageway
            const px = x + -tz * side * off, pz = z + tx * side * off, face = Math.atan2(tz * side, -tx * side) ; // front towards the road
            const kind = cls === 'lane' ? 'utilityPole' : cls === 'street' ? 'streetLamp' : 'avenueLamp';
            if (pushFurniture({ kind, x: px, z: pz, yaw: Math.atan2(tz * side, -tx * side), y: CITY_ROAD_LEVEL, fixedY: true, w: 0.4, d: 0.4, h: 6 })) furniture++;
            if (cls === 'boulevard' || (cls === 'avenue' && hash(px, pz) < 0.4)) {
              const ox = x + -tz * side * (w / 2 + walk * 0.55), oz = z + tx * side * (w / 2 + walk * 0.55);
              trees.push({ species: 'StreetTree', x: ox + tx * step / 2, z: oz + tz * step / 2, scale: 0.8 + hash(ox, oz) * 0.3, yaw: hash(oz, ox) * 6.28 });
            }
            void face;
          }
          next += step;
        }
        // vending machines on the pavement every 40–80 m on streets and lanes with a pavement
        while (vend <= along + len && walk >= 1.6 && cls !== 'boulevard') {
          const t = (vend - along) / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t, side = hash(x, z) < 0.5 ? -1 : 1;
          if (!nearJunction(x, z, r)) {
            const off = w / 2 + walk - 0.5;
            pushFurniture({ kind: 'vending', x: x + -tz * side * off, z: z + tx * side * off, yaw: Math.atan2(tz * side, -tx * side), y: CITY_ROAD_LEVEL, fixedY: true, w: 1, d: 0.8, h: 1.9 });
          }
          vend += 40 + hash(x, z + 1) * 40;
        }
        along += len;
      }
    }
    // ── Open lots (TokyoOpenSpaceSystem): parks get trees, benches and lamps; small shrines a torii + hokora ─
    for (const lot of result.openLots) {
      const poly: number[] = lot.polygon as number[];
      const xs = poly.filter((_, k) => k % 2 === 0), zs = poly.filter((_, k) => k % 2 === 1);
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cz = zs.reduce((a, b) => a + b, 0) / zs.length;
      const inside = (x: number, z: number) => { let c = false; for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) if ((zs[i]! > z) !== (zs[j]! > z) && x < (xs[j]! - xs[i]!) * (z - zs[i]!) / (zs[j]! - zs[i]!) + xs[i]!) c = !c; return c; };
      const y = CITY_ROAD_LEVEL + 0.15;
      if (lot.type === 'park' || lot.type === 'garden' || lot.type === 'plaza') {
        for (let x = Math.min(...xs) + 4; x < Math.max(...xs) - 4; x += 7) for (let z = Math.min(...zs) + 4; z < Math.max(...zs) - 4; z += 7) {
          const jx = x + (hash(x, z) - 0.5) * 3, jz = z + (hash(z, x) - 0.5) * 3;
          if (!inside(jx, jz) || Math.abs(jx - cx) < 3 || Math.abs(jz - cz) < 3) continue; // keep the cross paths open
          if (lot.type === 'plaza' ? hash(jx, jz) < 0.75 : hash(jx, jz) < 0.25) continue;
          trees.push({ species: hash(jz, jx) < 0.3 ? 'Cherry' : 'StreetTree', x: jx, z: jz, scale: 0.85 + hash(jx + 1, jz) * 0.35, yaw: hash(jx, jz + 2) * 6.28 });
        }
        for (const [dx, dz, yaw] of [[3.5, 2, Math.PI / 2], [-3.5, -2, -Math.PI / 2], [2, -3.5, 0], [-2, 3.5, Math.PI]] as const)
          if (inside(cx + dx, cz + dz)) items.push({ kind: 'parkBench', x: cx + dx, z: cz + dz, yaw, y, fixedY: true, w: 1.8, d: 0.6, h: 0.9 });
        for (const [dx, dz] of [[5, 5], [-5, -5]]) if (inside(cx + dx, cz + dz)) items.push({ kind: 'parkLamp', x: cx + dx, z: cz + dz, yaw: 0, y, fixedY: true, w: 0.4, d: 0.4, h: 4 });
      } else if (lot.type === 'shrine') {
        items.push({ kind: 'cityShrine', x: cx, z: cz, yaw: 0, y, fixedY: true, w: 2, d: 2, h: 2 });
      }
    }
    // street and park trees never on a carriageway (a tree half a module along could reach a cross street)
    for (let i = trees.length - 1; i >= 0; i--) if (!clearOfRoads(trees[i]!.x, trees[i]!.z, 1.5)) trees.splice(i, 1);
    console.log(`  tokyo stats: ${JSON.stringify(result.stats.byStyle)} onRoad ${result.stats.onRoad}, suburbs ${suburbs.buildings.length}, open lots ${result.openLots.length} (${[...new Set(result.openLots.map((l: any) => l.type))].join(', ')}), street furniture ${furniture} (${dropped} dropped: too close to a carriageway)`);
    const sample = result.buildings.slice(0, 3).map((b: any) => b.id).join(', ') + ' … ' + suburbs.buildings.slice(0, 2).map((b: any) => b.id).join(', ');
    console.log(`  ids: ${sample}`);
    return { place: 'tokyo', title: 'Tokyo', anchor: { x: 620, z: 120 }, items, trees, clearCircles: [], clearRects: [] };
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
    // FunauraVillage #buildActors: fishers at fixed work spots, cats on the quay (literal arrays there,
    // without the six harbour-light anglers, whose spots come from the light layout)
    const actors = [
      ...[[-1183, 1093, 0.4], [-1178, 1097, 2.8], [-1172, 1092, -1.2], [-1186, 1099, 1.6], [-1178, 1140, 1.5], [-1182, 1160, -1.4],
        [-1258, 1085, 3.1], [-1231, 1084, 0.2], [-1270, 1037, 3.2], [-1205, 1112, 3.0], [-1297, 1074.5, 0.8]].map(([x, z, yaw]) => ({ kind: 'fisher', x: x!, z: z!, yaw: yaw! })),
      ...[[-1286, 1074, 1.2], [-1180, 1104, 2.4], [-1214.5, 922, 0.3], [-1249, 1074.5, -0.4], [-1178, 1165, 3.0], [-1310, 1089.5, 2.0]].map(([x, z, yaw]) => ({ kind: 'cat', x: x!, z: z!, yaw: yaw! })),
    ];
    return {
      place: 'funaura', actors, title: 'Funaura', anchor: L.FUNAURA, items, trees, clearCircles, clearRects: [],
      roads: [{ id: 'funaura-river-road', type: 'village', width: 6.2, points: L.RIVER_ROAD.map(([x, z]: number[]) => [x, z]), endY: Q, extends: 'stillwater-mill-lane' }],
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
    // the canal (Kurashiki Bikan): two reaches with a weir at zWeir; water at the reach's highest ground + 0.25 m
    // (as KoedoTown computes it); bed 1.1 m below the water, stone walls on both banks every 4 m
    const height = terrainSampler();
    for (const [za, zb] of [[C.z0, C.zWeir], [C.zWeir, C.z1]] as const) {
      let top = -Infinity;
      for (let z = za; z <= zb; z += 2) for (const o of [-C.water / 2, 0, C.water / 2]) top = Math.max(top, height(L.canalX(z) + o, z));
      const level = top + 0.25;
      for (let z = za; z < zb; z += 6) {
        const z1 = Math.min(zb, z + 6), xm = L.canalX((z + z1) / 2), yaw = Math.atan2(L.canalX(z1) - L.canalX(z), z1 - z);
        items.push({ kind: 'canalBed', x: xm, z: (z + z1) / 2, yaw, w: C.water + 2 * C.wall, d: z1 - z + 0.2, y: level - 1.1, fixedY: true });
        items.push({ kind: 'canalWater', x: xm, z: (z + z1) / 2, yaw, w: C.water, d: z1 - z + 0.05, y: level, fixedY: true });
      }
      for (let z = za + 2; z < zb; z += 4) for (const side of [-1, 1])
        items.push({ kind: 'canalWall', x: L.canalX(z) + side * (C.water / 2 + C.wall / 2), z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, y: level - 1.1, fixedY: true, w: 4, d: C.wall, h: 2 });
    }
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
  /** KisoJuku.ts + kisoLayout.ts (DOERFER.md): post town along the pass road (toge), s along, o left. */
  async kiso() {
    const L = await src('world/settlements/kiso/kisoLayout.ts');
    const toge = roadsFile().roads.find((r: any) => r.id === 'toge');
    L.useRoadAxis(toge.centerline, toge.length / (toge.centerline.length / 3 - 1));
    const items: Item[] = [];
    const so = (s: number, o: number) => L.at(s, o) as [number, number];
    for (const h of L.HOUSES) {
      const [x, z] = so(h.s, h.side * (L.FRONT + h.setback + h.d / 2));
      items.push({ kind: h.kind === 'kura' ? 'kura' : 'house', tag: `${h.role}${h.low ? '/low' : ''}`, x, z, yaw: L.faceRoad(h.s, h.side), w: h.w, d: h.d });
    }
    { const H = L.HONJIN, [x, z] = so(H.s, H.houseO); items.push({ kind: 'honjin', x, z, yaw: L.faceRoad(H.s, 1), w: H.houseW, d: H.houseD }); }
    // the stair up the hillside: stone steps at the foot, then a gravel path, segment by segment
    for (let i = 1; i < L.STAIR.pts.length; i++) {
      const [s0, o0] = L.STAIR.pts[i - 1]!, [s1, o1] = L.STAIR.pts[i]!;
      const [ax, az] = so(s0, o0), [bx, bz] = so(s1, o1), len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 8));
      for (let k = 0; k < n; k++) items.push({ kind: i <= 2 ? 'stairSteps' : 'stairPath', x: ax + (bx - ax) * (k + 0.5) / n, z: az + (bz - az) * (k + 0.5) / n, yaw: Math.atan2(bx - ax, bz - az) });
    }
    { const [x, z] = so(L.WHEEL.s, L.WHEEL.o); items.push({ kind: 'waterwheel', x, z, yaw: L.faceRoad(L.WHEEL.s, -1) + Math.PI / 2 }); }
    { const [x, z] = so(L.WHEEL.s + 3, L.WHEEL.o + 2); items.push({ kind: 'trough', x, z, yaw: L.faceRoad(L.WHEEL.s, -1) }); }
    { const [x, z] = so(L.BELL.s, L.BELL.o); items.push({ kind: 'bell', x, z, yaw: L.faceRoad(L.BELL.s, -1) }); }
    { const T = L.TEAHOUSE, [x, z] = so(T.s, T.o); items.push({ kind: 'teahouse', x, z, yaw: L.faceRoad(T.s, -1), w: T.w, d: T.d }); }
    { const [x, z] = so(L.HOKORA.s, L.HOKORA.o); items.push({ kind: 'hokora', x, z, yaw: L.faceRoad(L.HOKORA.s, -1) }); }
    { const [x, z] = so(L.KOSATSU.s, L.KOSATSU.o); items.push({ kind: 'noticeBoard', x, z, yaw: L.faceRoad(L.KOSATSU.s, -1) }); }
    for (const g of L.GATES) { const [x, z] = so(g.s, g.side * 6); items.push({ kind: 'gate', x, z, yaw: L.faceRoad(g.s, g.side) }); }
    for (const [s, o, w, d, kind] of L.BACK) { const [x, z] = so(s, o); items.push({ kind: 'back', tag: kind, x, z, yaw: L.faceRoad(s, 1), w, d }); }
    { const [x, z] = so(L.CEMETERY.s, L.CEMETERY.o); items.push({ kind: 'cemetery', x, z, yaw: L.faceRoad(L.CEMETERY.s, 1) }); }
    const trees: Tree[] = [];
    const add = (list: readonly (readonly number[])[], species: string) => {
      for (const [s, o, scale] of list) { const [x, z] = so(s!, o!); trees.push({ species, x, z, scale: scale!, yaw: hash(x, z) * Math.PI * 2 }); }
    };
    add(L.MOMIJI, 'Momiji'); add(L.NIWAKI, 'Niwaki'); add(L.KAKI_TREES, 'Kaki'); add(L.FOREST, 'Sugi');
    const clearCircles: [number, number, number][] = [];
    L.kisoClearance((x: number, z: number, r: number) => clearCircles.push([x, z, r]));
    return { place: 'kiso', title: 'Kiso-Juku', anchor: { x: L.KISO.x, z: L.KISO.z }, items, trees, clearCircles, clearRects: [] };
  },
  /** GasshoHamlet.ts + gasshoLayout.ts and the Stillwater mill lane (settlementLayout.ts). */
  async gassho() {
    const L = await src('world/settlements/gassho/gasshoLayout.ts');
    const S = await src('world/settlements/settlementLayout.ts');
    const items: Item[] = [];
    // legacy front = local +x at yaw 0 (gasshoDry); here front = +z → yaw + π/2; w lies along the street
    for (const [x, z, w, d, yaw, kind, role] of L.HOUSES)
      items.push({ kind, tag: role, x, z, yaw: yaw + Math.PI / 2, w: d, d: w });
    L.WHEELS.radii.forEach((r: number, i: number) => {
      const z = L.WHEELS.z0 + L.WHEELS.radii.slice(0, i).reduce((a: number, b: number) => a + 2 * b + L.WHEELS.gap, 0) + r;
      items.push({ kind: 'waterwheel', x: L.WHEELS.x, z, yaw: Math.PI / 2, h: r, y: L.RIVER_Y, fixedY: true });
    });
    for (const [x0, z0, x1, z1] of L.RACKS) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 8)), yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (let k = 0; k < n; k++) items.push({ kind: 'rack', x: x0 + (x1 - x0) * (k + 0.5) / n, z: z0 + (z1 - z0) * (k + 0.5) / n, yaw });
    }
    for (const [x, z, yaw] of L.FIRE_HUTS) items.push({ kind: 'fireHut', x, z, yaw: yaw + Math.PI / 2 });
    items.push({ kind: 'shrine', ...L.SHRINE, yaw: L.SHRINE.yaw + Math.PI / 2 });
    items.push({ kind: 'shrineTorii', x: L.SHRINE.x - 7, z: L.SHRINE.z, yaw: L.SHRINE.yaw + Math.PI / 2 });
    items.push({ kind: 'jizo', ...L.JIZO, yaw: L.JIZO.yaw + Math.PI / 2 });
    // ASTRA §3: the mill house of Stillwater at MILL (props.json has no farmhouse there)
    items.push({ kind: 'millHouse', x: S.MILL.x, z: S.MILL.z, yaw: Math.PI / 2 });
    items.push({ kind: 'pond', x: S.POND.x, z: S.POND.z, yaw: 0, w: S.POND.w, d: S.POND.d });
    const trees: Tree[] = [];
    for (const [x, z, scale] of L.KAKI) trees.push({ species: 'Kaki', x, z, scale, yaw: hash(x, z) * 6.28 });
    for (const [x, z, scale] of L.SUGI) trees.push({ species: 'Sugi', x, z, scale, yaw: hash(x, z) * 6.28 });
    for (const [cx, cz, count] of L.BAMBOO) for (let i = 0; i < count; i++) {
      const a = hash(cx + i, cz) * 6.28, r = Math.sqrt(hash(cz, cx + i * 3)) * 5.5;
      trees.push({ species: 'Bamboo', x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, scale: 0.8 + hash(i, cx) * 0.4, yaw: a });
    }
    // a tree on a footpath (one kaki stood on the path at (−1167 | 300)) steps 3 m aside
    for (const t of trees) for (const line of [L.STREET, ...L.PATHS]) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!, dx = bx - ax, dz = bz - az;
      const u = Math.max(0, Math.min(1, ((t.x - ax) * dx + (t.z - az) * dz) / (dx * dx + dz * dz)));
      const px = ax + dx * u, pz = az + dz * u, d = Math.hypot(t.x - px, t.z - pz), need = line === L.STREET ? L.STREET_WIDTH / 2 + 2.5 : 2.5;
      if (d < need) { const len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, s = (t.x - px) * nx + (t.z - pz) * nz >= 0 ? 1 : -1; t.x = px + nx * s * (need + 0.5); t.z = pz + nz * s * (need + 0.5); }
    }
    const clearCircles: [number, number, number][] = [];
    L.gasshoClearance((x: number, z: number, r: number) => clearCircles.push([x, z, r]));
    clearCircles.push([S.MILL.x, S.MILL.z, 10], [S.POND.x, S.POND.z, 12]);
    for (let i = 1; i < S.MILL_LANE.length; i++) {
      const [ax, az] = S.MILL_LANE[i - 1]!, [bx, bz] = S.MILL_LANE[i]!, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
      for (let j = 0; j <= n; j++) clearCircles.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n, 4.4]);
    }
    return {
      place: 'gassho', title: 'Gassho & Stillwater', anchor: L.GASSHO, items, trees, clearCircles, clearRects: [],
      // StillwaterVillage #actors (village group): goats, chickens and workers around the mill
      actors: [
        ...[[-1306, 392, 0.4], [-1302, 396, 2.4]].map(([x, z, yaw]) => ({ kind: 'goat', x: x!, z: z!, yaw: yaw! })),
        ...[[-1284, 434, 0], [-1281, 436, 1.2], [-1286, 438, 2.1], [-1280, 432, 4]].map(([x, z, yaw]) => ({ kind: 'chicken', x: x!, z: z!, yaw: yaw! })),
        ...[[-1242, 411, 2.8], [-1307, 439, 0.2], [-1311, 446, 1.2], [-1247, 381, 2], [-1250, 381, 0.5], [-1264.4, 397.3, 2.9], [-1269, 371, 0.4], [-1278, 410, 2.6]]
          .map(([x, z, yaw]) => ({ kind: 'worker', x: x!, z: z!, yaw: yaw! })),
      ],
      roads: [
        { id: 'stillwater-mill-lane', type: 'village', width: 6, points: S.MILL_LANE.map(([x, z]: number[]) => [x, z]) },
        { id: 'gassho-street', type: 'village', width: L.STREET_WIDTH, points: L.STREET.map(([x, z]: number[]) => [x, z]) },
        ...L.PATHS.map((p: number[][], i: number) => ({ id: `gassho-path-${i}`, type: 'pfad', width: 1.8, points: p.map(([x, z]) => [x!, z!] as [number, number]) })),
      ],
    };
  },
  /**
   * Bellwood shrine (ASTRA §3 "Bellwood Temple"): the prototype has the hall, stairs, nine torii,
   * lanterns, chozuya and bell tower in props.json (imported by the prop importer). Added here (rule 15):
   * honden behind the hall, komainu, ema/omikuji racks, amulet office, lantern racks, a pagoda as the
   * landmark, walls around the precinct, nobori and cedars along the last 150 m of the sando.
   */
  async temple() {
    const sando = roadsFile().roads.find((r: any) => r.id === 'sando');
    const c = sando.centerline, n = c.length / 3;
    const pt = (i: number): [number, number] => [c[i * 3], c[i * 3 + 2]];
    const hall = { x: 820, z: -954 };
    const items: Item[] = [
      { kind: 'honden', x: 820, z: -968, yaw: 0 },
      { kind: 'komainu', x: 820, z: -937.5, yaw: 0 },
      { kind: 'omikuji', x: 806.5, z: -941, yaw: Math.PI / 2 },
      { kind: 'ema', x: 833.5, z: -946, yaw: -Math.PI / 2 },
      { kind: 'amuletOffice', x: 801, z: -935, yaw: Math.PI / 2 },
      { kind: 'lanternRack', x: 826.5, z: -929, yaw: -Math.PI / 2 },
      { kind: 'lanternRack', x: 813.5, z: -929, yaw: Math.PI / 2 },
      { kind: 'pagoda', x: 851, z: -950, yaw: -Math.PI / 2 },
    ];
    // walls: west, east and north sides of the precinct, 4 m pieces, open towards the sando (south)
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), k = Math.round(len / 4), yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < k; i++) items.push({ kind: 'wall', x: x0 + (x1 - x0) * (i + 0.5) / k, z: z0 + (z1 - z0) * (i + 0.5) / k, yaw });
    };
    wall(793, -928, 793, -980); wall(793, -980, 863, -980); wall(863, -980, 863, -928);
    // last 150 m of the sando (2 m samples): nobori rows beside the path, cedars behind them
    const trees: Tree[] = [];
    const clearCircles: [number, number, number][] = [[hall.x, hall.z, 30]];
    for (let i = n - 75; i < n - 4; i++) {
      const [ax, az] = pt(i), [bx, bz] = pt(i + 1), len = Math.hypot(bx - ax, bz - az) || 1;
      const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
      clearCircles.push([ax, az, 4.5]);
      // a few nobori on the last 60 m, alternating sides — more hid the torii (first image)
      if ((n - i) % 9 === 0 && n - i < 32) { const side = (n - i) % 18 === 0 ? 1 : -1;
        items.push({ kind: 'nobori', x: ax + nx * side * 3.4, z: az + nz * side * 3.4, yaw: Math.atan2(-tz, tx) }); }
      // cedars stop 28 m before the precinct, which stays open
      if ((n - i) % 6 === 0 && n - i > 14) for (const side of [-1, 1]) {
        for (const off of [7.5, 11.5]) {
          const x = ax + nx * side * (off + hash(ax, side) * 1.5), z = az + nz * side * (off + hash(az, side) * 1.5);
          trees.push({ species: 'Sugi', x, z, scale: 1.05 + hash(x, z) * 0.35, yaw: hash(z, x) * 6.28 });
        }
      }
    }
    return { place: 'temple', title: 'Bellwood Shrine', anchor: hall, items, trees, clearCircles, clearRects: [] };
  },
  /**
   * Needle Circuit (ASTRA §3): the track, pit lanes and approaches are in roads.json already. The
   * prototype built nothing beside them; added from the plan: pit court at (−350 | 585) with garages,
   * soft barriers outside the tight bends behind 8 m of runoff, lights along the South Straight,
   * and the runoff kept clear of trees.
   */
  async needle() {
    const track = roadsFile().roads.find((r: any) => r.id === 'needle-circuit');
    const c = track.centerline, n = c.length / 3, half = track.widths[0] / 2;
    const P = (i: number): [number, number] => { const k = ((i % n) + n) % n; return [c[k * 3], c[k * 3 + 2]]; };
    const items: Item[] = [
      { kind: 'pitCourt', x: -350, z: 600, yaw: 0, w: 92, d: 34 },
    ];
    for (let k = 0; k < 4; k++) items.push({ kind: 'pitGarage', x: -386 + k * 24, z: 611, yaw: 0 });
    for (let x = -1040; x <= -180; x += 60) {
      items.push({ kind: 'trackLight', x, z: 855 - (half + 5), yaw: 0 });
      items.push({ kind: 'trackLight', x: x + 30, z: 855 + (half + 5), yaw: Math.PI });
    }
    const clearCircles: [number, number, number][] = [];
    for (let i = 0; i < n; i += 4) clearCircles.push([...P(i), half + 8 + 2]);
    // barriers: outside of bends tighter than 140 m radius, beyond the runoff
    for (let i = 0; i < n; i += 2) {
      const [ax, az] = P(i - 5), [bx, bz] = P(i), [cx, cz] = P(i + 5);
      const t1 = Math.atan2(bz - az, bx - ax), t2 = Math.atan2(cz - bz, cx - bx);
      let turn = t2 - t1; while (turn > Math.PI) turn -= 2 * Math.PI; while (turn < -Math.PI) turn += 2 * Math.PI;
      const arc = Math.hypot(cx - ax, cz - az), radius = Math.abs(turn) > 1e-4 ? arc / Math.abs(turn) : Infinity;
      if (radius > 140) continue;
      const [px, pz] = P(i + 1), tx = px - bx, tz = pz - bz, len = Math.hypot(tx, tz) || 1;
      // left normal in x/z is (−tz, tx); a positive turn bends towards it, so the outside is the other side
      const side = turn > 0 ? -1 : 1, off = half + 8 + 1;
      items.push({ kind: 'barrier', x: bx + (-tz / len) * side * off, z: bz + (tx / len) * side * off, yaw: Math.atan2(-tz, tx), w: 4 * (radius + off) / radius + 0.1, d: 0.6, h: 0.9 });
    }
    return { place: 'needle', title: 'Needle Circuit', anchor: { x: -620, z: 760 }, items, trees: [], clearCircles, clearRects: [] };
  },
  /** CityInteriorLayout.ts: the two walk-in shops (diner, corner mart), moved to INTERIOR_SITES like CityInteriors.ts. */
  async interiors() {
    const { createInteriorLayout } = await src('world/city/CityInteriorLayout.ts');
    const { INTERIOR_SITES, interiorOffset } = await src('config/tokyoLayout.mjs');
    const layout = createInteriorLayout();
    const sites = INTERIOR_SITES.map((site: any) => ({ id: site.id, floorY: 0, boxes: [] as any[] }));
    for (const b of layout.boxes) {
      const o = interiorOffset(b.x);
      sites[INTERIOR_SITES.indexOf(o)].boxes.push({ x: b.x + o.dx, y: b.y - layout.floorY, z: b.z + o.dz, w: b.w, h: b.h, d: b.d, finish: b.finish, solid: false, visible: true });
    }
    // Collision is the layout's collider list (walls with door gaps, counters, stools), unseen boxes.
    for (const c of layout.colliders) {
      const x = (c.minX + c.maxX) / 2, z = (c.minZ + c.maxZ) / 2;
      const site = INTERIOR_SITES.findIndex((s: any) => x >= s.minX - 2 && x <= s.maxX + 2 && z >= s.minZ - 2 && z <= s.maxZ + 2);
      if (site < 0) continue;
      sites[site].boxes.push({ x, y: (c.bottom + c.top) / 2 - layout.floorY, z, w: c.maxX - c.minX, h: c.top - c.bottom, d: c.maxZ - c.minZ, finish: 'none', solid: true, visible: false });
    }
    const centre = (s: any) => ({ x: (s.minX + s.maxX) / 2, z: (s.minZ + s.maxZ) / 2 });
    return { place: 'interiors', title: 'Walk-in shops', anchor: centre(INTERIOR_SITES[0]), items: [], trees: [], clearCircles: [], clearRects: [], interiors: sites };
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
