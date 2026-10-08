// Place layouts from the prototype → SourceData/legacy/places/<place>.json (run via Tools/export-places.mjs).
// Imports the legacy layout modules unchanged; only reads their data. Everything stays in Three
// coordinates (x, z, north = −z, yaw in radians, counter-clockwise from above, local +Z = front);
// the Unity importer converts (SourceData/legacy/README.md).
//
// Item: { kind, x, z, yaw, w?, d?, h?, y?, tag? } — kind is what the prototype built there (its own
// vocabulary, e.g. 'kura', 'hatago'); Data/Places/<Place>.asset maps kinds to library models.
import { writeFileSync } from 'node:fs';
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
